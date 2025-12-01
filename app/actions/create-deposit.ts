'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload, PlainUpload } from './_utils/save-upload';

type Input = {
  pilotoId: number;
  fecha: string;
  monto: number;
  detalle?: string;
  file?: PlainUpload | null;
};

export async function createDeposit(input: Input): Promise<{ ok: boolean; id?: number; error?: string }> {
  console.log('[createDeposit] start', {
    pilotoId: input.pilotoId,
    fecha: input.fecha,
    monto: input.monto,
    detalleLen: input.detalle?.length,
  });
  // Basic validation
  if (!input.pilotoId || isNaN(input.pilotoId)) {
    return { ok: false, error: 'ID de piloto inválido' };
  }
  if (!input.fecha || input.fecha.trim() === '') {
    return { ok: false, error: 'Fecha es requerida' };
  }
  if (!input.monto || isNaN(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'Monto debe ser mayor a 0' };
  }

  let fecha: Date;
  try {
    const [year, month, day] = input.fecha.split('-').map(Number);
    fecha = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');
  } catch (e: any) {
    return { ok: false, error: 'Formato de fecha inválido' };
  }

  const imageUrl = input.file && input.file.base64 ? await saveUpload(input.file, 'deposit') : undefined;

  try {
    const row = await prisma.deposit.create({
      data: {
        userId: input.pilotoId,
        fecha,
        monto: input.monto,
        imageUrl,
        detalle: input.detalle,
      },
      select: { id: true },
    });
    console.log('[createDeposit] success id', row.id);
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createDeposit] prisma error', e);
    return { ok: false, error: e?.message || 'Error BD creando depósito' };
  }
}
