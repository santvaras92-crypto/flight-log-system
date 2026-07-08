'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

interface RegistrarCambioInput {
  partId: number;        // ReplacementPart DB id
  fecha: string;         // ISO date string: date the component was replaced/installed
  horas?: number | null; // Domain-hour meter reading at install (AIRFRAME/ENGINE-TSMOH/PROPELLER)
  serialNuevo?: string;  // New serial number of the installed part (optional)
  notas?: string;        // Free notes
}

/**
 * Registra el cambio (reemplazo) de un componente del Plan de Reemplazo.
 *
 * Efecto:
 *  - Reinicia el conteo de vida útil: installDate + installHoras pasan a ser el
 *    nuevo punto de partida, por lo que el remanente (horas y calendario) se
 *    recalcula automáticamente en el dashboard contra el medidor vivo del dominio.
 *  - Guarda un registro histórico en ReplacementEvent.
 *  - Si se entrega un serial nuevo, actualiza el serial de la parte.
 */
export async function registrarCambioComponente(input: RegistrarCambioInput) {
  try {
    const { partId, fecha, horas, serialNuevo, notas } = input;

    if (!partId) {
      return { success: false, error: 'partId es requerido' };
    }
    if (!fecha) {
      return { success: false, error: 'La fecha del cambio es requerida' };
    }

    const part = await prisma.replacementPart.findUnique({ where: { id: partId } });
    if (!part) {
      return { success: false, error: 'Componente no encontrado' };
    }

    const fechaCambio = new Date(fecha);
    if (isNaN(fechaCambio.getTime())) {
      return { success: false, error: 'Fecha inválida' };
    }

    const horasInstall =
      horas != null && !isNaN(Number(horas)) ? Number(Number(horas).toFixed(1)) : null;

    // Reset the life countdown to the new install point.
    await prisma.replacementPart.update({
      where: { id: partId },
      data: {
        installDate: fechaCambio,
        installHoras: horasInstall,
        // Only overwrite serial when a new one is provided.
        ...(serialNuevo && serialNuevo.trim() ? { serial: serialNuevo.trim() } : {}),
      },
    });

    // History row.
    await prisma.replacementEvent.create({
      data: {
        partId,
        fecha: fechaCambio,
        horas: horasInstall,
        serialNuevo: serialNuevo && serialNuevo.trim() ? serialNuevo.trim() : null,
        notas: notas && notas.trim() ? notas.trim() : null,
      },
    });

    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `Cambio registrado para "${part.descripcion}". Vida útil reiniciada.`,
    };
  } catch (error: any) {
    console.error('Error registrando cambio de componente:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
