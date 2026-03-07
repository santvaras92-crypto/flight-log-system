// rebuild-1772855962

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function deleteDeposit(depositId: number): Promise<{ ok: boolean; error?: string }> {
  if (!depositId || isNaN(depositId)) {
    return { ok: false, error: 'ID de depósito inválido' };
  }

  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    select: { id: true, userId: true, monto: true, estado: true },
  });

  if (!deposit) {
    return { ok: false, error: 'Depósito no encontrado' };
  }

  // If the deposit was approved, also delete the matching ABONO transaction
  if (deposit.estado === 'APROBADO') {
    const matchingTransaction = await prisma.transaction.findFirst({
      where: {
        tipo: 'ABONO',
        userId: deposit.userId,
        monto: deposit.monto,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (matchingTransaction) {
      await prisma.transaction.delete({
        where: { id: matchingTransaction.id },
      });
    }
  }

  // Delete the deposit
  await prisma.deposit.delete({
    where: { id: depositId },
  });

  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/validacion');
  revalidatePath('/admin/deposits');

  return { ok: true };
}
