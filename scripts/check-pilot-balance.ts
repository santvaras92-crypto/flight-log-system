import { prisma } from '@/lib/prisma';

const userId = Number(process.argv[2] || '96');

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nombre: true, codigo: true, saldo_cuenta: true },
  });
  const txAll = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tipo: true, monto: true, createdAt: true },
  });
  console.log('Pilot:', user);
  console.log('Recent Transactions:', txAll.slice(0, 5).map(t => ({
    id: t.id,
    tipo: t.tipo,
    monto: t.monto.toString(),
    createdAt: t.createdAt.toISOString(),
  })));
  const fuelSum = txAll.filter(t => t.tipo === 'FUEL').reduce((acc, t) => acc + Number(t.monto), 0);
  console.log(`Total FUEL credits: ${fuelSum}`);
}

main().finally(() => prisma.$disconnect());
