'use server';

import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session as any)?.role !== 'ADMIN') return false;
  return true;
}

export interface DirectivaInput {
  id?: number;                     // present = update, absent = create
  aircraftId?: string;             // required on create (default CC-AQI)
  tipo: string;                    // AD | DA
  dominio: string;                 // AIRFRAME | ENGINE | PROPELLER
  numero: string;
  enmienda?: string | null;
  descripcion: string;
  aplicabilidad: string;           // APLICA | NO_APLICA
  periodicidadRaw?: string | null;
  recurrente?: boolean;
  alEvento?: boolean;
  intervaloMeses?: number | null;
  intervaloHoras?: number | null;
  efectividadFecha?: string | null;
  efectividadHoras?: number | null;
  cumplimientoFecha?: string | null;
  cumplimientoHoras?: number | null;
  observacion?: string | null;
  responsable?: string | null;
  esEmergencia?: boolean;
  urlReferencia?: string | null;
}

function normDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function normNum(v?: number | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function normInt(v?: number | null): number | null {
  const n = normNum(v);
  return n == null ? null : Math.round(n);
}

/**
 * Crea o actualiza una directiva AD/DA.
 * Si `id` está presente se actualiza; si no, se crea una nueva (fuente MANUAL).
 */
export async function guardarDirectiva(input: DirectivaInput) {
  if (!(await requireAdmin())) return { success: false, error: 'No autorizado' };
  try {
    if (!input.numero || !input.numero.trim()) return { success: false, error: 'El número es requerido' };
    if (!input.descripcion || !input.descripcion.trim()) return { success: false, error: 'La descripción es requerida' };
    if (!['AD', 'DA'].includes(input.tipo)) return { success: false, error: 'Tipo inválido (AD/DA)' };
    if (!['AIRFRAME', 'ENGINE', 'PROPELLER'].includes(input.dominio)) return { success: false, error: 'Dominio inválido' };
    const aplicabilidad = input.aplicabilidad === 'APLICA' ? 'APLICA' : 'NO_APLICA';

    const data = {
      tipo: input.tipo,
      dominio: input.dominio,
      numero: input.numero.trim(),
      enmienda: input.enmienda?.trim() || null,
      descripcion: input.descripcion.trim(),
      aplicabilidad,
      periodicidadRaw: input.periodicidadRaw?.trim() || null,
      recurrente: !!input.recurrente,
      alEvento: !!input.alEvento,
      intervaloMeses: normInt(input.intervaloMeses),
      intervaloHoras: normNum(input.intervaloHoras),
      efectividadFecha: normDate(input.efectividadFecha),
      efectividadHoras: normNum(input.efectividadHoras),
      cumplimientoFecha: normDate(input.cumplimientoFecha),
      cumplimientoHoras: normNum(input.cumplimientoHoras),
      observacion: input.observacion?.trim() || null,
      responsable: input.responsable?.trim() || null,
      esEmergencia: !!input.esEmergencia,
      urlReferencia: input.urlReferencia?.trim() || null,
    };

    if (input.id) {
      await prisma.complianceDirective.update({ where: { id: input.id }, data });
      revalidatePath('/admin/dashboard');
      return { success: true, message: `Directiva ${data.tipo} ${data.numero} actualizada.` };
    }

    const aircraftId = input.aircraftId || 'CC-AQI';
    const maxOrden = await prisma.complianceDirective.aggregate({
      where: { aircraftId, tipo: input.tipo, dominio: input.dominio },
      _max: { orden: true },
    });
    await prisma.complianceDirective.create({
      data: { ...data, aircraftId, fuente: 'MANUAL', orden: (maxOrden._max.orden ?? -1) + 1 },
    });
    revalidatePath('/admin/dashboard');
    return { success: true, message: `Directiva ${data.tipo} ${data.numero} creada.` };
  } catch (error: any) {
    console.error('Error guardando directiva:', error);
    return { success: false, error: error?.message || 'Error desconocido' };
  }
}

/** Elimina una directiva AD/DA (y su historial de cumplimientos en cascada). */
export async function eliminarDirectiva(id: number) {
  if (!(await requireAdmin())) return { success: false, error: 'No autorizado' };
  try {
    if (!id) return { success: false, error: 'id requerido' };
    await prisma.complianceDirective.delete({ where: { id } });
    revalidatePath('/admin/dashboard');
    return { success: true, message: 'Directiva eliminada.' };
  } catch (error: any) {
    console.error('Error eliminando directiva:', error);
    return { success: false, error: error?.message || 'Error desconocido' };
  }
}
