'use server';

import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { saveUpload } from './_utils/save-upload';

type Input = {
  pilotoId: number;
  fecha: string;
  monto: number;
  detalle?: string;
  file?: File | null;
};

export async function createDeposit(input: Input) {
  const imageUrl = input.file && input.file.size > 0 ? await saveUpload(input.file, 'deposit') : undefined;

  const row = await prisma.deposit.create({
    data: {
      userId: input.pilotoId,
      fecha: new Date(input.fecha),
      monto: new Decimal(input.monto),
      imageUrl,
      detalle: input.detalle,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}
