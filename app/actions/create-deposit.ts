'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload } from './_utils/save-upload';

type Input = {
  pilotoId: number;
  fecha: string;
  monto: number;
  detalle?: string;
  file?: File | null;
};

export async function createDeposit(input: Input) {
  try {
    console.log('createDeposit input:', input);
    
    // Validar datos requeridos
    if (!input.pilotoId || isNaN(input.pilotoId)) {
      throw new Error('ID de piloto inválido');
    }
    if (!input.fecha || input.fecha.trim() === '') {
      throw new Error('Fecha es requerida');
    }
    if (!input.monto || isNaN(input.monto) || input.monto <= 0) {
      throw new Error('Monto debe ser mayor a 0');
    }
    
    const imageUrl = input.file && input.file.size > 0 ? await saveUpload(input.file, 'deposit') : undefined;

    // Parse fecha as local date at noon to avoid timezone issues
    const [year, month, day] = input.fecha.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error('Fecha inválida');
    }
    const fecha = new Date(year, month - 1, day, 12, 0, 0);

    console.log('Creating deposit with:', { userId: input.pilotoId, fecha, monto: input.monto, imageUrl, detalle: input.detalle });

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
    
    console.log('Deposit created:', row);
    return { ok: true, id: row.id };
  } catch (error: any) {
    console.error('Error creating deposit:', error);
    throw new Error(`Error al crear depósito: ${error.message}`);
  }
}
