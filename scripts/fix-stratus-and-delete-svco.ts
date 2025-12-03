import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Update STRATUS name to 'Stratus'
  const stratus = await prisma.user.findUnique({ where: { codigo: 'STRATUS' } });
  if (stratus) {
    const updated = await prisma.user.update({ where: { id: stratus.id }, data: { nombre: 'Stratus' } });
    console.log(`✅ Updated STRATUS: id=${updated.id}, nombre=${updated.nombre}`);
  } else {
    console.log('⚠️ STRATUS user not found');
  }

  // Delete user id 109 (SVCO)
  try {
    const deleted = await prisma.user.delete({ where: { id: 109 } });
    console.log(`✅ Deleted user: id=${deleted.id}, codigo=${deleted.codigo}`);
  } catch (e:any) {
    console.error('⚠️ Could not delete user 109:', e?.message || e);
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
