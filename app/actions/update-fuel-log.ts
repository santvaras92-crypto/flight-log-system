'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Update the editable fields of a fuel record (DB source only).
 * Editable: fecha, litros, monto, detalle.
 * Also keeps the associated FUEL transaction amount in sync when it can be
 * matched (same user, tipo FUEL, within a +/- 1 day window of the old date).
 */
export async function updateFuelLog(formData: FormData) {
  const idRaw = formData.get('fuelLogId');
  const id = typeof idRaw === 'string' ? parseInt(idRaw) : Number(idRaw);
  if (!id || isNaN(id)) {
    throw new Error('Invalid fuelLogId');
  }

  const existing = await prisma.fuelLog.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Fuel record not found');
  }

  const fechaRaw = (formData.get('fecha') as string) || '';
  const litrosRaw = (formData.get('litros') as string) || '';
  const montoRaw = (formData.get('monto') as string) || '';
  const detalle = (formData.get('detalle') as string) || '';

  // Parse the date as local noon to avoid timezone day-shifting.
  const fecha = fechaRaw ? new Date(`${fechaRaw}T12:00:00`) : existing.fecha;
  const litros = litrosRaw.trim() === '' ? Number(existing.litros) : Number(litrosRaw);
  const monto = montoRaw.trim() === '' ? Number(existing.monto) : Number(montoRaw);

  if (isNaN(litros) || litros < 0) throw new Error('Invalid liters');
  if (isNaN(monto) || monto < 0) throw new Error('Invalid amount');
  if (isNaN(fecha.getTime())) throw new Error('Invalid date');

  await prisma.fuelLog.update({
    where: { id },
    data: {
      fecha,
      litros,
      monto,
      detalle: detalle.trim() || null,
    },
  });

  // Keep the linked FUEL transaction amount in sync if we can find it by the
  // old amount within a date window around the previous date.
  const windowMs = 24 * 60 * 60 * 1000; // +/- 1 day
  const oldMonto = Number(existing.monto);
  if (Number(monto) !== oldMonto) {
    const match = await prisma.transaction.findFirst({
      where: {
        userId: existing.userId,
        tipo: 'FUEL',
        monto: existing.monto,
        createdAt: {
          gte: new Date(existing.fecha.getTime() - windowMs),
          lte: new Date(existing.fecha.getTime() + windowMs),
        },
      },
    });
    if (match) {
      await prisma.transaction.update({
        where: { id: match.id },
        data: { monto },
      });
    }
  }

  revalidatePath('/admin/dashboard');
}
