import { prisma } from '../lib/prisma';

async function main() {
  const user = await prisma.user.findFirst({
    where: { codigo: 'CM' }
  });

  if (!user) {
    console.log('User CM not found');
    return;
  }

  const deposits = await prisma.deposit.findMany({
    where: { userId: user.id },
    orderBy: { fecha: 'desc' },
    take: 5
  });

  console.log('CM Deposits:');
  deposits.forEach(d => {
    console.log(`ID: ${d.id}, Fecha: ${d.fecha.toISOString()}, Monto: ${d.monto}, Detalle: ${d.detalle}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
