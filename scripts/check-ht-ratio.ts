import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Show a few sample flights with diff_hobbs (the field page.tsx actually uses)
  const samples = await prisma.flight.findMany({
    orderBy: { fecha: 'desc' },
    take: 10,
    select: {
      id: true, fecha: true,
      diff_tach: true, diff_hobbs: true,
      tach_inicio: true, tach_fin: true,
      hobbs_inicio: true, hobbs_fin: true,
      engine_hours: true
    }
  });
  
  console.log('=== 10 Most Recent Flights ===');
  for (const f of samples) {
    const dt = Number(f.diff_tach ?? 0);
    const dh = Number(f.diff_hobbs ?? 0);
    const hi = Number(f.hobbs_inicio ?? 0);
    const hf = Number(f.hobbs_fin ?? 0);
    const computedDh = hf - hi;
    console.log(`  id=${f.id} fecha=${f.fecha?.toISOString().slice(0,10)}  diff_tach=${dt.toFixed(2)}  diff_hobbs=${dh.toFixed(2)}  hobbs(fin-ini)=${computedDh.toFixed(2)}  ratio=${dt > 0 ? (dh / dt).toFixed(3) : 'N/A'}`);
  }

  // Compute exactly like page.tsx: hobbsThisYear = sum(diff_hobbs), tachThisYear = sum(diff_tach)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  const flights = await prisma.flight.findMany({
    where: { fecha: { gte: oneYearAgo } },
    select: { diff_tach: true, diff_hobbs: true }
  });

  let tachSum = 0;
  let hobbsSum = 0;
  let bothValid = 0;

  for (const f of flights) {
    const dt = Number(f.diff_tach ?? 0);
    const dh = Number(f.diff_hobbs ?? 0);
    if (dt > 0) tachSum += dt;
    if (dh > 0) hobbsSum += dh;
    if (dt > 0 && dh > 0) bothValid++;
  }

  const ratio = tachSum > 0 ? hobbsSum / tachSum : 1.25;

  console.log('\n=== page.tsx EXACT Calculation (last 365 days) ===');
  console.log(`Flights total: ${flights.length}`);
  console.log(`Flights with both diff_tach>0 & diff_hobbs>0: ${bothValid}`);
  console.log(`tachThisYear (sum diff_tach): ${tachSum.toFixed(2)}`);
  console.log(`hobbsThisYear (sum diff_hobbs): ${hobbsSum.toFixed(2)}`);
  console.log(`hobbsTachRatio = ${hobbsSum.toFixed(2)} / ${tachSum.toFixed(2)} = ${ratio.toFixed(4)}`);
  console.log(`\nThis is passed to DashboardClient as: ${ratio.toFixed(2)} (toFixed(2))`);
  console.log(`\nFor reference:`);
  console.log(`  Tach/year: ${tachSum.toFixed(1)} hrs`);
  console.log(`  Hobbs/year: ${hobbsSum.toFixed(1)} hrs`);
  console.log(`  Tach/month: ${(tachSum/12).toFixed(1)} hrs`);
  console.log(`  Hobbs/month: ${(hobbsSum/12).toFixed(1)} hrs`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
