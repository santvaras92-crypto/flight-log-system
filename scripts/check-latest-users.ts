import { prisma } from "../lib/prisma";

async function main() {
  const count = await prisma.user.count();
  const latest = await prisma.user.findMany({
    orderBy: { id: 'desc' },
    take: 5,
    select: { id: true, nombre: true, codigo: true, rol: true, email: true }
  });
  console.log(`Total users in DB: ${count}`);
  console.log('Latest 5 users registered:');
  console.table(latest);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
