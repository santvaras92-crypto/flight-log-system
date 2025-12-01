'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload } from './_utils/save-upload';

type Input = {
  pilotoId: number;
  fecha: string;
  litros: number;
  monto: number;
  detalle?: string;
  file?: File | null;
};

export async function createFuel(input: Input) {
  const imageUrl = input.file && input.file.size > 0 ? await saveUpload(input.file, 'fuel') : undefined;

  // Parse fecha as local date at noon to avoid timezone issues
  const [year, month, day] = input.fecha.split('-').map(Number);
  const fecha = new Date(year, month - 1, day, 12, 0, 0);

  const row = await prisma.fuelLog.create({
    data: {
      userId: input.pilotoId,
      fecha,
      litros: input.litros,
      monto: input.monto,
      imageUrl,
      detalle: input.detalle,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}
