import { prisma } from '@/lib/prisma';

async function main() {
  const last = await prisma.fuelLog.findFirst({
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      userId: true,
      fecha: true,
      litros: true,
      monto: true,
      detalle: true,
      imageUrl: true,
    },
  });
  if (!last) {
    console.log('No hay registros de combustible.');
    return;
  }
  console.log({
    id: last.id,
    userId: last.userId,
    fecha: last.fecha.toISOString(),
    litros: last.litros.toString(),
    monto: last.monto.toString(),
    detalle: last.detalle,
    imageUrl: last.imageUrl,
  });
}

main().finally(() => prisma.$disconnect());
