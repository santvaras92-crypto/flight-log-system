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

  // Update status to RECHAZADO
  await prisma.deposit.update({
    where: { id: depositId },
    data: { estado: 'RECHAZADO' },
  });

  revalidatePath('/admin/validacion');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/deposits');
}
