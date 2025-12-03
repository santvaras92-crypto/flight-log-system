import { prisma } from '@/lib/prisma';

const id = Number(process.argv[2] || '96');

async function main() {
  const p = await prisma.user.findUnique({
    where: { id },
    select: { id: true, nombre: true, codigo: true, email: true },
  });
  console.log(p || `Piloto ${id} no encontrado`);
}

main().finally(() => prisma.$disconnect());
