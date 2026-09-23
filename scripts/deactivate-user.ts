/**
 * Deactivate (or reactivate) a user account.
 * Usage:
 *   npx tsx scripts/deactivate-user.ts 115            → sets rol = INACTIVO
 *   npx tsx scripts/deactivate-user.ts 115 PILOTO     → restores given role
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const id = Number(process.argv[2]);
  const newRole = process.argv[3] || 'INACTIVO';
  if (!id) { console.error('Usage: npx tsx scripts/deactivate-user.ts <userId> [role]'); process.exit(1); }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, nombre: true, email: true, rol: true } });
  if (!user) { console.error(`User ${id} not found`); process.exit(1); }

  console.log(`Before: ${user.nombre} (${user.email}) · rol = ${user.rol}`);
  const updated = await prisma.user.update({ where: { id }, data: { rol: newRole } });
  console.log(`After:  ${updated.nombre} · rol = ${updated.rol} · ${new Date().toISOString()}`);

  // Clear any DB sessions (JWT sessions die via the auth callback revalidation)
  const deleted = await prisma.session.deleteMany({ where: { userId: id } });
  console.log(`DB sessions cleared: ${deleted.count}`);
}

main().finally(() => prisma.$disconnect());
