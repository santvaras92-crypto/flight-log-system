import { prisma } from '@/lib/prisma';

/**
 * Auto-registro de cambios de filtros ligado a revisiones.
 *
 * Regla de negocio: cada vez que se ingresa una Revisión — ya sea la de
 * 100 horas o un cambio de aceite (registradas como un Flight cuyo `detalle`
 * contiene "REVISION 100 HRS/HORAS" o "CAMBIO DE ACEITE") — se cambian
 * físicamente el filtro de aire y el filtro de aceite. Este helper crea los
 * ReplacementEvent correspondientes y reinicia el conteo de vida útil de ambas
 * partes del Plan de Reemplazo, igual que si el admin las registrara a mano.
 *
 * Idempotente: si ya existe un evento AUTO para la parte en la misma fecha,
 * no duplica (permite editar el mismo vuelo varias veces sin efectos).
 */

const REVISION_PATTERNS = [
  /CAMBIO\s+(DE\s+)?ACEITE/i,                       // "CAMBIO DE ACEITE", "Cambio Aceite"
  /(REVISION|REVISIÓN|REV|MANTTO)\.?\s+100\s+(HRS|HORAS)/i, // "REVISION 100 HRS", "REV 100 HRS", "Mantto 100 Hrs"
];

const FILTER_DESCRIPTIONS = ['Filtro aire motor', 'Filtro aceite motor'];

const AUTO_TAG = 'AUTO: generado por revisión';

export function detalleEsRevision(detalle: string | null | undefined): boolean {
  if (!detalle) return false;
  return REVISION_PATTERNS.some((re) => re.test(detalle));
}

interface AutoFilterInput {
  aircraftId: string;
  fecha: Date;            // fecha de la revisión (del vuelo)
  detalle: string;        // texto del detalle que gatilló la detección
  flightId?: number;      // vuelo de origen (para trazabilidad en notas)
  airframeHours?: number | null; // airframe_hours del vuelo, si está disponible
}

/**
 * Crea los eventos de cambio de filtros y reinicia su vida útil.
 * Devuelve las descripciones de las partes efectivamente registradas.
 * No lanza: cualquier error se loguea y se devuelve [], para nunca romper
 * el flujo principal (guardar el vuelo) por un fallo del registro automático.
 */
export async function autoRegisterFilterChanges(input: AutoFilterInput): Promise<string[]> {
  const registered: string[] = [];
  try {
    const { aircraftId, fecha, detalle, flightId, airframeHours } = input;

    // Horas del dominio ENGINE (TSMOH) al momento de la revisión: se calcula
    // igual que el dashboard — airframe del vuelo menos la base de overhaul
    // del motor registrada en Component. Si falta cualquiera, el evento se
    // registra sin horas (el remanente usa el calendario; ReplacementEvent.horas es opcional).
    let horasEngine: number | null = null;
    if (airframeHours != null && !isNaN(Number(airframeHours))) {
      const engineComp = await prisma.component.findFirst({
        where: { aircraftId, tipo: 'ENGINE' },
        select: { last_overhaul_airframe: true },
      });
      const base = engineComp?.last_overhaul_airframe != null ? Number(engineComp.last_overhaul_airframe) : null;
      if (base != null) horasEngine = Number((Number(airframeHours) - base).toFixed(1));
    }

    const parts = await prisma.replacementPart.findMany({
      where: { aircraftId, descripcion: { in: FILTER_DESCRIPTIONS } },
    });

    // Ventana de idempotencia: mismo día calendario.
    const dayStart = new Date(fecha); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(fecha); dayEnd.setUTCHours(23, 59, 59, 999);

    for (const part of parts) {
      const existing = await prisma.replacementEvent.findFirst({
        where: {
          partId: part.id,
          fecha: { gte: dayStart, lte: dayEnd },
          notas: { startsWith: AUTO_TAG },
        },
      });
      if (existing) continue; // ya registrado para esta revisión

      const notas = `${AUTO_TAG} — "${detalle.trim().slice(0, 120)}"${flightId ? ` (vuelo #${flightId})` : ''}`;

      await prisma.replacementEvent.create({
        data: { partId: part.id, fecha, horas: horasEngine, notas },
      });

      // Reinicia el conteo de vida útil (mismo efecto que registrarCambioComponente).
      await prisma.replacementPart.update({
        where: { id: part.id },
        data: {
          installDate: fecha,
          ...(horasEngine != null ? { installHoras: horasEngine } : {}),
          proximaFecha: null,
          proximaHoras: null,
        },
      });

      registered.push(part.descripcion);
    }
  } catch (err) {
    console.error('[auto-filter-events] Error registrando cambios de filtros:', err);
  }
  return registered;
}
