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

async function getCurrentTach(): Promise<number | null> {
  const latest = await prisma.flight.findFirst({
    orderBy: { fecha: 'desc' },
    select: { tach_fin: true, tach_inicio: true, diff_tach: true }
  });
  if (!latest) return null;
  const fin = toNumber(latest.tach_fin);
  const ini = toNumber(latest.tach_inicio);
  const diff = toNumber(latest.diff_tach);
  if (fin != null) return fin;
  if (ini != null && diff != null) return ini + diff;
  return ini;
}

async function getLastTachForDetalle(keyword: string): Promise<number | null> {
  const flight = await prisma.flight.findFirst({
    where: { detalle: { contains: keyword, mode: 'insensitive' } },
    orderBy: { fecha: 'desc' },
    select: { tach_inicio: true, tach_fin: true, diff_tach: true, fecha: true, id: true }
  });
  if (!flight) return null;
  const ini = toNumber(flight.tach_inicio);
  const fin = toNumber(flight.tach_fin);
  const diff = toNumber(flight.diff_tach);
  return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
}

// Oil change is also done during 100hr inspections, so find the most recent of either
async function getLastOilChangeTach(): Promise<number | null> {
  const flights = await prisma.flight.findMany({
    where: {
      OR: [
        { detalle: { contains: 'CAMBIO DE ACEITE', mode: 'insensitive' } },
        { detalle: { contains: 'REVISION 100 HRS', mode: 'insensitive' } },
        { detalle: { contains: 'REVISION 100 HORAS', mode: 'insensitive' } },
      ]
    },
    orderBy: { fecha: 'desc' },
    take: 1,
    select: { tach_inicio: true, tach_fin: true, diff_tach: true }
  });
  if (flights.length === 0) return null;
  const flight = flights[0];
  const ini = toNumber(flight.tach_inicio);
  const fin = toNumber(flight.tach_fin);
  const diff = toNumber(flight.diff_tach);
  return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
}

async function main() {
  const OIL_INTERVAL = 50;
  const INSPECT_INTERVAL = 100;

  const currentTach = await getCurrentTach();
  if (currentTach == null) {
    console.log('No hay TACH actual.');
    return;
  }

  const oilTachBase = await getLastOilChangeTach();
  const inspectTachBase = await getLastTachForDetalle('REVISION 100 HRS');

  const oilUsed = oilTachBase != null ? (currentTach - oilTachBase) : (currentTach % OIL_INTERVAL);
  const inspectUsed = inspectTachBase != null ? (currentTach - inspectTachBase) : (currentTach % INSPECT_INTERVAL);

  const oilRemaining = Math.max(0, OIL_INTERVAL - (oilUsed < 0 ? 0 : oilUsed));
  const inspectRemaining = Math.max(0, INSPECT_INTERVAL - (inspectUsed < 0 ? 0 : inspectUsed));

  console.log('TACH actual:', currentTach.toFixed(1));
  console.log('Oil Change base (tach1):', oilTachBase != null ? oilTachBase.toFixed(1) : 'N/A');
  console.log('100hr base (tach1):', inspectTachBase != null ? inspectTachBase.toFixed(1) : 'N/A');
  console.log('\nNext inspections:');
  console.log(`- Oil Change remaining: ${oilRemaining.toFixed(1)} hrs`);
  console.log(`- 100-hour Inspection remaining: ${inspectRemaining.toFixed(1)} hrs`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
