import { prisma } from '@/lib/prisma';

/*
Backfills missing FUEL transactions for FuelLogs dated on/after 2025-11-29.
Heuristic: for each FuelLog, if there is no Transaction with tipo 'FUEL', same userId,
with monto equal, and createdAt >= cutoff, then create one.
Use --dry-run to only print actions.
*/

const cutoff = new Date(2025, 10, 29, 0, 0, 0); // 2025-11-29

async function main() {
  const dry = process.argv.includes('--dry-run');
  const logs = await prisma.fuelLog.findMany({
    where: { fecha: { gte: cutoff } },
    orderBy: { fecha: 'asc' },
    select: { id: true, userId: true, fecha: true, monto: true },
  });
  let toCreate = 0;
  for (const l of logs) {
    const exists = await prisma.transaction.findFirst({
      where: {
        tipo: 'FUEL',
        userId: l.userId,
        monto: l.monto,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
    });
    if (exists) {
      continue;
    }
    toCreate++;
    console.log(`[BACKFILL] FuelLog ${l.id} -> Transaction FUEL for user ${l.userId}, monto ${l.monto.toString()}`);
    if (!dry) {
      await prisma.transaction.create({
        data: {
          tipo: 'FUEL',
          userId: l.userId,
          monto: l.monto,
        },
        select: { id: true },
      });
    }
  }
  console.log(`Processed ${logs.length} FuelLogs; ${toCreate} transactions ${dry ? 'would be created' : 'created'}.`);
}

main().finally(() => prisma.$disconnect());
