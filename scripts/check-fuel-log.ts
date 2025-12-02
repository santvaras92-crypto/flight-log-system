import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.fuelLog.count();
  console.log(`FuelLog records: ${count}`);
  
  if (count > 0) {
    const total = await prisma.fuelLog.aggregate({
      _sum: { litros: true }
    });
    console.log(`Total liters in DB: ${total._sum.litros}`);
    
    const sinceSep2020 = await prisma.fuelLog.aggregate({
      where: { fecha: { gte: new Date('2020-09-09') } },
      _sum: { litros: true }
    });
    console.log(`Liters since Sep 9, 2020: ${sinceSep2020._sum.litros}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
