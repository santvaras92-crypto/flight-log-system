import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { nombre: { contains: 'Saavedra', mode: 'insensitive' } },
    select: { id: true, nombre: true, email: true, codigo: true, rol: true, createdAt: true, updatedAt: true },
  });
  console.log('=== Usuarios que coinciden con "Saavedra" ===');
  console.log(JSON.stringify(users, null, 2));

  for (const u of users) {
    const [flights, sessions, lastFlight] = await Promise.all([
      prisma.flight.count({ where: { pilotoId: u.id } }),
      prisma.session.count({ where: { userId: u.id } }),
      prisma.flight.findFirst({ where: { pilotoId: u.id }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
    ]);
    console.log(`\n--- ${u.nombre} (id ${u.id}, rol ${u.rol}) ---`);
    console.log(`Vuelos: ${flights} · Último vuelo: ${lastFlight?.fecha?.toISOString() ?? 'n/a'}`);
    console.log(`Sesiones activas en BD: ${sessions}`);
  }
}

main().finally(() => prisma.$disconnect());
