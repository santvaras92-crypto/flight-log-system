import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sep = new Date('2020-09-09');

  const agg = await prisma.flight.aggregate({
    where: { fecha: { gte: sep } },
    _sum: { diff_hobbs: true }
  });

  const latest = await prisma.flight.findFirst({
    orderBy: { fecha: 'desc' },
    select: { id: true, fecha: true, hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true }
  });

  const flightsSinceSep = await prisma.flight.findMany({
    where: { fecha: { gte: sep } },
    select: { hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true }
  });

  const toNumber = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as any).toNumber === 'function') {
      try { return (v as any).toNumber(); } catch { return Number(v as any) || null; }
    }
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  let sum = 0;
  for (const r of flightsSinceSep) {
    const dh = toNumber(r.diff_hobbs);
    const hi = toNumber(r.hobbs_inicio);
    const hf = toNumber(r.hobbs_fin);
    const d = dh !== null ? dh : (hi !== null && hf !== null ? (hf - hi) : 0);
    if (!isNaN(d) && d > 0) sum += d;
  }

  console.log('Hours since Sep9 aggregate diff_hobbs:', Number(agg._sum.diff_hobbs || 0).toFixed(2));
  console.log('Hours since Sep9 fallback sum:', Number(sum.toFixed(2)));
  console.log('Latest flight:', latest);
}

main().finally(() => prisma.$disconnect());
