'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

interface RegistrarCumplimientoInput {
  directiveId: number;    // ComplianceDirective DB id
  fecha: string;          // ISO date string: date the directive was complied
  horas?: number | null;  // Domain-hour meter reading at compliance
  ordenTrabajo?: string;  // Work order number (optional)
  notas?: string;         // Free notes
}

/**
 * Registra un cumplimiento de una directiva AD/DA.
 *
 * Efecto:
 *  - Para directivas recurrentes, avanza el "último cumplimiento"
 *    (cumplimientoFecha + cumplimientoHoras) al nuevo punto, por lo que el
 *    próximo vencimiento (horas y calendario) se recalcula automáticamente en el
 *    dashboard contra el medidor vivo del dominio.
 *  - Guarda un registro histórico en ComplianceEvent.
 */
export async function registrarCumplimiento(input: RegistrarCumplimientoInput) {
  try {
    const { directiveId, fecha, horas, ordenTrabajo, notas } = input;

    if (!directiveId) {
      return { success: false, error: 'directiveId es requerido' };
    }
    if (!fecha) {
      return { success: false, error: 'La fecha de cumplimiento es requerida' };
    }

    const directive = await prisma.complianceDirective.findUnique({ where: { id: directiveId } });
    if (!directive) {
      return { success: false, error: 'Directiva no encontrada' };
    }

    const fechaCumpl = new Date(fecha);
    if (isNaN(fechaCumpl.getTime())) {
      return { success: false, error: 'Fecha inválida' };
    }

    const horasCumpl =
      horas != null && !isNaN(Number(horas)) ? Number(Number(horas).toFixed(1)) : null;

    // Advance the "last compliance" to the new point (resets the countdown).
    await prisma.complianceDirective.update({
      where: { id: directiveId },
      data: {
        cumplimientoFecha: fechaCumpl,
        cumplimientoHoras: horasCumpl,
      },
    });

    // History row.
    await prisma.complianceEvent.create({
      data: {
        directiveId,
        fecha: fechaCumpl,
        horas: horasCumpl,
        ordenTrabajo: ordenTrabajo && ordenTrabajo.trim() ? ordenTrabajo.trim() : null,
        notas: notas && notas.trim() ? notas.trim() : null,
      },
    });

    revalidatePath('/admin/dashboard');

    return {
      success: true,
      message: `Cumplimiento registrado para ${directive.tipo} ${directive.numero}.`,
    };
  } catch (error: any) {
    console.error('Error registrando cumplimiento AD/DA:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
