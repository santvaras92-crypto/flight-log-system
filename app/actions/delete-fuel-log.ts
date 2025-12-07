// Railway rebuild fix - Dec 7, 2025
'use server';

import { prisma } from '@/lib/prisma';

export async function deleteFuelLog(formData: FormData) {
  const idRaw = formData.get('fuelLogId');
  const id = typeof idRaw === 'string' ? parseInt(idRaw) : Number(idRaw);
  if (!id || isNaN(id)) {
    throw new Error('Invalid fuelLogId');
  }

  const fuelLog = await prisma.fuelLog.findUnique({ where: { id } });
  if (!fuelLog) {
    return;
  }

  // Delete potential associated FUEL transaction (match by userId, tipo, monto, and date window)
  const windowMs = 24 * 60 * 60 * 1000; // +/- 1 day
  await prisma.transaction.deleteMany({
    where: {
      userId: fuelLog.userId,
      tipo: 'FUEL',
      monto: fuelLog.monto,
      createdAt: {
        gte: new Date(fuelLog.fecha.getTime() - windowMs),
        lte: new Date(fuelLog.fecha.getTime() + windowMs),
      },
    },
  });

  await prisma.fuelLog.delete({ where: { id } });
}
