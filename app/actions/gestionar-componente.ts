'use server';

import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session as any)?.role !== 'ADMIN') {
    return false;
  }
  return true;
}

export interface ComponenteInput {
  id?: number;                     // present = update, absent = create
  aircraftId?: string;             // required on create (default CC-AQI)
  dominio: string;                 // AIRFRAME | ENGINE | PROPELLER
  descripcion: string;
  marca?: string | null;
  partNumber?: string | null;
  serial?: string | null;
  tboMeses?: number | null;
  tboHoras?: number | null;
  vidaMeses?: number | null;
  vidaHoras?: number | null;
  installDate?: string | null;     // ISO date
  installHoras?: number | null;
  notas?: string | null;
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
 * Crea o actualiza un componente del Plan de Reemplazo.
 * Si `id` está presente se actualiza; si no, se crea uno nuevo.
 */
export async function guardarComponente(input: ComponenteInput) {
  if (!(await requireAdmin())) return { success: false, error: 'No autorizado' };
  try {
    if (!input.descripcion || !input.descripcion.trim()) {
      return { success: false, error: 'La descripción es requerida' };
    }
    if (!['AIRFRAME', 'ENGINE', 'PROPELLER'].includes(input.dominio)) {
      return { success: false, error: 'Dominio inválido' };
    }

    const data = {
      dominio: input.dominio,
      descripcion: input.descripcion.trim(),
      marca: input.marca?.trim() || null,
      partNumber: input.partNumber?.trim() || null,
      serial: input.serial?.trim() || null,
      tboMeses: normInt(input.tboMeses),
      tboHoras: normNum(input.tboHoras),
      vidaMeses: normInt(input.vidaMeses),
      vidaHoras: normNum(input.vidaHoras),
      installDate: normDate(input.installDate),
      installHoras: normNum(input.installHoras),
      notas: input.notas?.trim() || null,
    };

    if (input.id) {
      await prisma.replacementPart.update({ where: { id: input.id }, data });
      revalidatePath('/admin/dashboard');
      return { success: true, message: `Componente "${data.descripcion}" actualizado.` };
    }

    // Create — append at the end of the domain's ordering.
    const aircraftId = input.aircraftId || 'CC-AQI';
    const maxOrden = await prisma.replacementPart.aggregate({
      where: { aircraftId, dominio: input.dominio },
      _max: { orden: true },
    });
    await prisma.replacementPart.create({
      data: { ...data, aircraftId, orden: (maxOrden._max.orden ?? -1) + 1 },
    });
    revalidatePath('/admin/dashboard');
    return { success: true, message: `Componente "${data.descripcion}" creado.` };
  } catch (error: any) {
    console.error('Error guardando componente:', error);
    return { success: false, error: error?.message || 'Error desconocido' };
  }
}

/** Elimina un componente del Plan de Reemplazo (y su historial en cascada). */
export async function eliminarComponente(id: number) {
  if (!(await requireAdmin())) return { success: false, error: 'No autorizado' };
  try {
    if (!id) return { success: false, error: 'id requerido' };
    await prisma.replacementPart.delete({ where: { id } });
    revalidatePath('/admin/dashboard');
    return { success: true, message: 'Componente eliminado.' };
  } catch (error: any) {
    console.error('Error eliminando componente:', error);
    return { success: false, error: error?.message || 'Error desconocido' };
  }
}
