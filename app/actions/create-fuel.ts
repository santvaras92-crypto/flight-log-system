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

  const row = await prisma.fuelLog.create({
    data: {
      userId: input.pilotoId,
      fecha: new Date(input.fecha),
      litros: input.litros,
      monto: input.monto,
      imageUrl,
      detalle: input.detalle,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}
