import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteTGCA() {
  console.log('🔍 Buscando registros de TGCA...\n');

  // Check if user exists
  const user = await prisma.user.findFirst({
    where: {
      codigo: { equals: 'TGCA', mode: 'insensitive' }
    }
  });

  if (!user) {
    console.log('❌ No se encontró usuario con código TGCA');
    return;
  }

  console.log(`✅ Usuario encontrado: ${user.nombre} (${user.codigo})`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email || 'N/A'}`);

  // Check for related records
  const flights = await prisma.flight.count({
    where: { cliente: { equals: 'TGCA', mode: 'insensitive' } }
  });

  const deposits = await prisma.deposit.count({
    where: { userId: user.id }
  });

  const fuel = await prisma.fuelLog.count({
    where: { userId: user.id }
  });

  console.log(`\n📊 Registros asociados:`);
  console.log(`   Vuelos: ${flights}`);
  console.log(`   Depósitos: ${deposits}`);
  console.log(`   Combustible: ${fuel}`);

  if (flights > 0 || deposits > 0 || fuel > 0) {
    console.log('\n⚠️  ADVERTENCIA: Este usuario tiene registros asociados.');
    console.log('   Para borrarlo completamente, primero debes eliminar:');
    if (flights > 0) console.log(`   - ${flights} vuelos`);
    if (deposits > 0) console.log(`   - ${deposits} depósitos`);
    if (fuel > 0) console.log(`   - ${fuel} registros de combustible`);
    console.log('\n   ¿Deseas continuar de todas formas y solo eliminar el usuario? (Los registros quedarán huérfanos)');
    return;
  }

  // Delete user
  console.log('\n🗑️  Eliminando usuario TGCA...');
  await prisma.user.delete({
    where: { id: user.id }
  });

  console.log('✅ Usuario TGCA eliminado exitosamente');
}

deleteTGCA()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
