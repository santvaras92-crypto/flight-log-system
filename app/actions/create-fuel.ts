'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload, PlainUpload } from './_utils/save-upload';

type Input = {
  pilotoId: number;
  fecha: string;
  litros: number;
  monto: number;
  detalle?: string;
  file: PlainUpload | null; // ahora obligatorio
};

export async function createFuel(input: Input): Promise<{ ok: boolean; id?: number; error?: string }> {
  // Validaciones básicas
  if (!input.pilotoId || isNaN(input.pilotoId)) {
    return { ok: false, error: 'ID de piloto inválido' };
  }
  if (!input.fecha || input.fecha.trim() === '') {
    return { ok: false, error: 'Fecha es requerida' };
  }
  if (!input.litros || isNaN(input.litros) || input.litros <= 0) {
    return { ok: false, error: 'Litros debe ser mayor a 0' };
  }
  if (!input.monto || isNaN(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'Monto debe ser mayor a 0' };
  }
  if (!input.file || !input.file.base64) {
    return { ok: false, error: 'Foto boleta obligatoria' };
  }

  // Parse fecha local a mediodía para evitar desfase
  let fecha: Date;
  try {
    const [year, month, day] = input.fecha.split('-').map(Number);
    fecha = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');
  } catch (e) {
    return { ok: false, error: 'Formato de fecha inválido' };
  }

  try {
    const imageUrl = await saveUpload(input.file, 'fuel');
    const row = await prisma.fuelLog.create({
      data: {
        userId: input.pilotoId,
        fecha,
        litros: input.litros,
        monto: input.monto,
        imageUrl,
        detalle: input.detalle,
      },
      select: { id: true, fecha: true, monto: true, userId: true },
    });

    // Desde 2025-11-29 en adelante, cargar como crédito/transaction
    const cutoff = new Date(2025, 10, 29, 0, 0, 0); // months are 0-based
    if (row.fecha >= cutoff) {
      await prisma.transaction.create({
        data: {
          tipo: 'FUEL',
          userId: row.userId,
          monto: row.monto,
        },
        select: { id: true },
      });
    }
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createFuel] prisma/saveUpload error', e);
    return { ok: false, error: e?.message || 'Error BD creando registro combustible' };
  }
}
