import { prisma } from '@/lib/prisma';

const userId = Number(process.argv[2] || '96');

async function main() {
  const tx = await prisma.transaction.findMany({
    where: { tipo: 'FUEL', userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, monto: true, createdAt: true },
  });
  console.log(tx.map(t => ({ id: t.id, monto: t.monto.toString(), createdAt: t.createdAt.toISOString() })));
}

main().finally(() => prisma.$disconnect());
