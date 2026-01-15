import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findTGCA() {
  console.log('🔍 Buscando todos los registros relacionados con TGCA...\n');

  // Search by code
  const byCode = await prisma.user.findMany({
    where: {
      OR: [
        { codigo: { contains: 'TGCA', mode: 'insensitive' } },
        { nombre: { contains: 'TGCA', mode: 'insensitive' } },
        { nombre: { contains: 'Tomás González Cádiz', mode: 'insensitive' } },
        { nombre: { contains: 'Tomas Gonzalez Cadiz', mode: 'insensitive' } },
      ]
    }
  });

  console.log(`✅ Usuarios encontrados: ${byCode.length}\n`);
  
  byCode.forEach((user, i) => {
    console.log(`${i + 1}. ID: ${user.id}`);
    console.log(`   Código: ${user.codigo || 'N/A'}`);
    console.log(`   Nombre: ${user.nombre}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Rol: ${user.rol}`);
    console.log(`   Activo: ${user.isActive ? 'Sí' : 'No'}`);
    console.log('');
  });

  if (byCode.length === 0) {
    console.log('❌ No se encontró ningún usuario');
  }
}

findTGCA()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
