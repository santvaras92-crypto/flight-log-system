// Railway rebuild fix - Dec 7, 2025
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function approveFuel(formData: FormData): Promise<void> {
  const fuelLogId = Number(formData.get('fuelLogId'));
  if (!fuelLogId || isNaN(fuelLogId)) {
    throw new Error('ID de registro inválido');
  }

  const fuelLog = await prisma.fuelLog.findUnique({
    where: { id: fuelLogId },
    select: { id: true, userId: true, monto: true, estado: true, fecha: true },
  });

  if (!fuelLog) {
    throw new Error('Registro no encontrado');
  }

  if (fuelLog.estado === 'APROBADO') {
    throw new Error('Este registro ya fue aprobado');
  }

  // Update status to APROBADO
  await prisma.fuelLog.update({
    where: { id: fuelLogId },
    data: { estado: 'APROBADO' },
  });

  // Create FUEL transaction (credit) only if fecha >= 2025-11-29
  const cutoff = new Date(2025, 10, 29, 0, 0, 0);
  if (fuelLog.fecha >= cutoff) {
    await prisma.transaction.create({
      data: {
        tipo: 'FUEL',
        userId: fuelLog.userId,
        monto: fuelLog.monto,
      },
    });
  }

  revalidatePath('/admin/validacion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/fuel-charges');
}

export async function rejectFuel(formData: FormData): Promise<void> {
  const fuelLogId = Number(formData.get('fuelLogId'));
  if (!fuelLogId || isNaN(fuelLogId)) {
    throw new Error('ID de registro inválido');
  }

  const fuelLog = await prisma.fuelLog.findUnique({
    where: { id: fuelLogId },
    select: { id: true, estado: true },
  });

  if (!fuelLog) {
    throw new Error('Registro no encontrado');
  }

  // Delete the rejected fuel log from the database
  await prisma.fuelLog.delete({
    where: { id: fuelLogId },
  });

  revalidatePath('/admin/validacion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/fuel-charges');
}
// Railway rebuild Wed Dec 10 16:59:50 -03 2025
