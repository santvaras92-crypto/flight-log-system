// rebuild trigger 1765397735
// Railway rebuild fix - Dec 7, 2025
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function approveDeposit(formData: FormData): Promise<void> {
  const depositId = Number(formData.get('depositId'));
  if (!depositId || isNaN(depositId)) {
    throw new Error('ID de depósito inválido');
  }

  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    select: { id: true, userId: true, monto: true, estado: true },
  });

  if (!deposit) {
    throw new Error('Depósito no encontrado');
  }

  if (deposit.estado === 'APROBADO') {
    throw new Error('Este depósito ya fue aprobado');
  }

  // Update status to APROBADO
  await prisma.deposit.update({
    where: { id: depositId },
    data: { estado: 'APROBADO' },
  });

  // Create ABONO transaction (credit)
  await prisma.transaction.create({
    data: {
      tipo: 'ABONO',
      userId: deposit.userId,
      monto: deposit.monto,
    },
  });

  revalidatePath('/admin/validacion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/deposits');
}

export async function rejectDeposit(formData: FormData): Promise<void> {
  const depositId = Number(formData.get('depositId'));
  if (!depositId || isNaN(depositId)) {
    throw new Error('ID de depósito inválido');
  }

  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    select: { id: true, estado: true },
  });

  if (!deposit) {
    throw new Error('Depósito no encontrado');
  }

  // Delete the rejected deposit from the database
  await prisma.deposit.delete({
    where: { id: depositId },
  });

  revalidatePath('/admin/validacion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/deposits');
}
// Railway rebuild Wed Dec 10 16:59:50 -03 2025
