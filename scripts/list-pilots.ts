import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, codigo: true, nombre: true },
    orderBy: { id: 'asc' }
  });
  console.log('ID\tCODIGO\tNOMBRE');
  users.forEach(u => {
    console.log(`${u.id}\t${u.codigo ?? ''}\t${u.nombre}`);
  });
}

main().catch(console.error).finally(()=>prisma.$disconnect());
