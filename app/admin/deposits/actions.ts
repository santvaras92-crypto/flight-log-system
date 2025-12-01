"use server";
import { prisma } from '@/lib/prisma';

export async function updateLastDepositAmount(newAmount: number) {
  // Busca el último depósito por fecha
  const lastDeposit = await prisma.deposit.findFirst({
    orderBy: { fecha: 'desc' },
  });
  if (!lastDeposit) {
    return { ok: false, error: 'No hay depósitos registrados.' };
  }
  await prisma.deposit.update({
    where: { id: lastDeposit.id },
    data: { monto: newAmount },
  });
  return { ok: true };
}
