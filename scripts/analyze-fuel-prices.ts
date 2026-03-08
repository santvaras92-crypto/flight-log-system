import { prisma } from '@/lib/prisma';

async function main() {
  const logs = await prisma.fuelLog.findMany({
    orderBy: { fecha: 'asc' },
    select: { fecha: true, litros: true, monto: true },
  });

  const monthly: Record<string, { totalLitros: number; totalMonto: number; count: number }> = {};
  logs.forEach((l) => {
    const litros = Number(l.litros);
    const monto = Number(l.monto);
    if (litros <= 0 || monto <= 0) return;
    const key = l.fecha.toISOString().slice(0, 7);
    if (!monthly[key]) monthly[key] = { totalLitros: 0, totalMonto: 0, count: 0 };
    monthly[key].totalLitros += litros;
    monthly[key].totalMonto += monto;
    monthly[key].count++;
  });

  console.log('=== Monthly Average AVGAS Price (DB) ===');
  Object.entries(monthly).sort().forEach(([m, d]) => {
    console.log(`${m}: $${Math.round(d.totalMonto / d.totalLitros)}/L (${d.count} records, ${d.totalLitros.toFixed(0)}L)`);
  });

  // Last 6 months weighted average
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentLogs = logs.filter(l => l.fecha >= sixMonthsAgo);
  let recentLitros = 0, recentMonto = 0;
  recentLogs.forEach(l => {
    const litros = Number(l.litros);
    const monto = Number(l.monto);
    if (litros > 0 && monto > 0) {
      recentLitros += litros;
      recentMonto += monto;
    }
  });
  console.log(`\n6-month weighted avg: $${Math.round(recentMonto / recentLitros)}/L (${recentLitros.toFixed(0)}L total)`);

  // Last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recent3 = logs.filter(l => l.fecha >= threeMonthsAgo);
  let r3L = 0, r3M = 0;
  recent3.forEach(l => {
    const litros = Number(l.litros);
    const monto = Number(l.monto);
    if (litros > 0 && monto > 0) { r3L += litros; r3M += monto; }
  });
  console.log(`3-month weighted avg: $${Math.round(r3M / r3L)}/L (${r3L.toFixed(0)}L total)`);

  console.log(`\nTotal DB records: ${logs.length}`);
}

main().finally(() => prisma.$disconnect());
