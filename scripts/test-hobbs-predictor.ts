/**
 * Test the kernel-based hobbs predictor against real historical data.
 * Prints predictions for tach deltas 0.1 .. 3.0 and a leave-one-out style
 * error check on the last 30 flights.
 */
import { getExpectedRatio } from '../lib/hobbs-predictor';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Predicted ratio per tach delta ===');
  for (let t = 0.1; t <= 3.01; t += 0.1) {
    const td = Number(t.toFixed(1));
    const r = await getExpectedRatio(td);
    console.log(
      `Δtach ${td.toFixed(1)} -> ratio ${r.expectedRatio.toFixed(3)} ` +
      `(hobbs ≈ ${(td * r.expectedRatio).toFixed(1)}) ` +
      `range [${r.minRatio.toFixed(2)}-${r.maxRatio.toFixed(2)}] n=${r.sampleSize} ${r.confidence}`
    );
  }

  console.log('\n=== Backtest: last 30 valid flights ===');
  const flights = await prisma.flight.findMany({
    where: {
      aircraftId: 'CC-AQI', aprobado: true,
      diff_hobbs: { not: null, gt: 0 }, diff_tach: { not: null, gt: 0 },
    },
    orderBy: { fecha: 'desc' },
    take: 30,
    select: { id: true, fecha: true, diff_hobbs: true, diff_tach: true },
  });

  let sumAbsErr = 0, n = 0;
  for (const f of flights) {
    const tach = Number(f.diff_tach);
    const hobbs = Number(f.diff_hobbs);
    const r = await getExpectedRatio(tach);
    const pred = tach * r.expectedRatio;
    const err = pred - hobbs;
    sumAbsErr += Math.abs(err); n++;
    console.log(
      `#${f.id} Δtach ${tach.toFixed(1)} real ${hobbs.toFixed(1)} pred ${pred.toFixed(2)} err ${err >= 0 ? '+' : ''}${err.toFixed(2)}`
    );
  }
  console.log(`\nMAE: ${(sumAbsErr / n).toFixed(3)} hrs over ${n} flights`);
}

main().finally(() => prisma.$disconnect());
