'use server';

import { prisma } from '@/lib/prisma';

type Input = {
  pilotoId: number;
  fecha: string;       // ISO
  hobbs_fin: number;   // REQUIRED
  tach_fin: number;    // REQUIRED
  copiloto?: string;   // optional
  detalle?: string;    // optional
};

export async function createFlightSubmission(input: Input) {
  if (
    !input.pilotoId ||
    !input.fecha ||
    typeof input.hobbs_fin !== 'number' ||
    typeof input.tach_fin !== 'number' ||
    Number.isNaN(input.hobbs_fin) ||
    Number.isNaN(input.tach_fin)
  ) {
    throw new Error('HOBBS F y TACH F son obligatorios.');
  }

  // Parse fecha as local date at noon to avoid timezone issues
  const [year, month, day] = input.fecha.split('-').map(Number);
  const fechaVuelo = new Date(year, month - 1, day, 12, 0, 0);

  const submission = await prisma.flightSubmission.create({
    data: {
      pilotoId: input.pilotoId,
      aircraftId: 'CC-AQI',
      estado: 'PENDIENTE',
      fechaVuelo,
      copiloto: input.copiloto,
      detalle: input.detalle,
      hobbsFinal: input.hobbs_fin,
      tachFinal: input.tach_fin,
    },
    select: { id: true },
  });
  return { ok: true, id: submission.id };
}
