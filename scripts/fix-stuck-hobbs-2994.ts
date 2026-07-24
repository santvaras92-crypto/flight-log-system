/**
 * One-off fix: HOBBS meter stuck at 2303.0.
 * Flight #2994 (2026-07-22) was recorded with hobbs_fin 2304.4 but the
 * physical meter still reads 2303.0. Set hobbs_fin back to 2303.0 while
 * keeping diff_hobbs = 1.4 (real flight time), and reset the aircraft
 * hobbs_actual counter to 2303.0.
 *
 * Usage:
 *   npx tsx scripts/fix-stuck-hobbs-2994.ts          (dry run)
 *   npx tsx scripts/fix-stuck-hobbs-2994.ts --apply  (write changes)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const flight = await prisma.flight.findUnique({ where: { id: 2994 } });
  if (!flight) throw new Error('Flight #2994 not found');

  console.log('Flight #2994 current state:');
  console.log(`  fecha: ${flight.fecha.toISOString()}`);
  console.log(`  hobbs: ${flight.hobbs_inicio} -> ${flight.hobbs_fin} (diff ${flight.diff_hobbs})`);

  const aircraft = await prisma.aircraft.findUnique({ where: { matricula: 'CC-AQI' } });
  console.log(`Aircraft hobbs_actual: ${aircraft?.hobbs_actual}`);

  if (Number(flight.hobbs_fin) !== 2304.4) {
    console.log('⚠️  hobbs_fin is not 2304.4 — aborting (maybe already fixed?)');
    return;
  }

  console.log('\nPlanned changes:');
  console.log('  Flight #2994: hobbs_fin 2304.4 -> 2303.0 (diff_hobbs stays 1.4)');
  console.log('  Aircraft CC-AQI: hobbs_actual -> 2303.0');

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  await prisma.$transaction([
    prisma.flight.update({
      where: { id: 2994 },
      data: { hobbs_fin: 2303.0, diff_hobbs: 1.4 },
    }),
    prisma.aircraft.update({
      where: { matricula: 'CC-AQI' },
      data: { hobbs_actual: 2303.0 },
    }),
  ]);
  console.log('\n✅ Applied.');
}

main().finally(() => prisma.$disconnect());
