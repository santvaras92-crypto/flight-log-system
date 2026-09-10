import { prisma } from '../lib/prisma';
(async () => {
  const res = await prisma.fuelLog.deleteMany({
    where: { detalle: { startsWith: 'Histórico CSV · Cuenta:' } },
  });
  console.log('Deleted:', res.count);
  console.log('Total FuelLog now:', await prisma.fuelLog.count());
  await prisma.$disconnect();
})();
