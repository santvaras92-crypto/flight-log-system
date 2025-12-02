import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'toNumber' in v && typeof (v as any).toNumber === 'function') {
    try { return (v as any).toNumber(); } catch { return Number(v as any) || null; }
  }
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function main() {
  // Find latest flight whose detalle contains "REVISION 100 HORAS" (case-insensitive)
  const flight = await prisma.flight.findFirst({
    where: {
      detalle: { contains: 'REVISION 100 HORAS', mode: 'insensitive' }
    },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      detalle: true,
      tach_inicio: true,
      tach_fin: true,
      diff_tach: true,
      aircraftId: true,
    }
  });

  if (!flight) {
    console.log('No se encontró un vuelo con detalle "REVISION 100 HORAS".');
    return;
  }

  const tachInicio = toNumber(flight.tach_inicio);
  const tachFin = toNumber(flight.tach_fin);
  const diffTach = toNumber(flight.diff_tach);

  const tach1 = tachInicio != null ? tachInicio : (tachFin != null && diffTach != null ? tachFin - diffTach : null);

  console.log('Última REVISION 100 HORAS:');
  console.log(`- ID: ${flight.id}`);
  console.log(`- Fecha: ${flight.fecha?.toISOString().split('T')[0]}`);
  console.log(`- AircraftId: ${flight.aircraftId}`);
  console.log(`- Detalle: ${flight.detalle}`);
  console.log(`- TACH 1 (tach_inicio): ${tach1 ?? 'N/A'}`);
  console.log(`- TACH fin: ${tachFin ?? 'N/A'}`);
  console.log(`- diff_tach: ${diffTach ?? 'N/A'}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
