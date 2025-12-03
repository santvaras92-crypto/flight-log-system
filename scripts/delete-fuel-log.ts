import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fuelLogId = parseInt(process.argv[2]);
  
  if (!fuelLogId) {
    console.error('Usage: tsx scripts/delete-fuel-log.ts <fuelLogId>');
    process.exit(1);
  }

  // Check if exists
  const fuelLog = await prisma.fuelLog.findUnique({
    where: { id: fuelLogId },
    include: { User: true }
  });

  if (!fuelLog) {
    console.error(`FuelLog ${fuelLogId} not found`);
    process.exit(1);
  }

  console.log('FuelLog to delete:', {
    id: fuelLog.id,
    fecha: fuelLog.fecha,
    piloto: fuelLog.User?.nombre || 'N/A',
    litros: fuelLog.litros.toString(),
    monto: fuelLog.monto.toString(),
  });

  // Delete associated FUEL transaction if exists (based on userId and monto match)
  const txDeleted = await prisma.transaction.deleteMany({
    where: {
      userId: fuelLog.userId,
      tipo: 'FUEL',
      monto: fuelLog.monto,
      createdAt: {
        gte: new Date(fuelLog.fecha.getTime() - 24*60*60*1000), // 1 day before
        lte: new Date(fuelLog.fecha.getTime() + 24*60*60*1000)  // 1 day after
      }
    }
  });

  if (txDeleted.count > 0) {
    console.log(`✅ Deleted ${txDeleted.count} related transaction(s)`);
  }

  // Delete the fuel log
  await prisma.fuelLog.delete({
    where: { id: fuelLogId }
  });

  console.log(`✅ FuelLog ${fuelLogId} deleted successfully`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
