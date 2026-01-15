import { prisma } from '../lib/prisma';

async function main() {
  const flightId = 1494;

  // Get current flight data
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      id: true,
      fecha: true,
      cliente: true,
      copiloto: true,
      instructor: true,
    },
  });

  if (!flight) {
    console.log('❌ Vuelo no encontrado');
    return;
  }

  console.log('\n📋 Vuelo actual:');
  console.log(`   ID: ${flight.id}`);
  console.log(`   Fecha: ${flight.fecha.toISOString().split('T')[0]}`);
  console.log(`   Cliente: ${flight.cliente}`);
  console.log(`   Copiloto: ${flight.copiloto || '(ninguno)'}`);
  console.log(`   Instructor: ${flight.instructor || '(ninguno)'}`);

  // Update copiloto to Santiago Varas
  await prisma.flight.update({
    where: { id: flightId },
    data: {
      copiloto: 'Santiago Varas',
    },
  });

  console.log('\n✅ Actualizado exitosamente');
  console.log('   Copiloto: Santiago Varas');

  // Verify
  const updated = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      copiloto: true,
      instructor: true,
    },
  });

  console.log('\n📋 Verificación final:');
  console.log(`   Copiloto: ${updated?.copiloto}`);
  console.log(`   Instructor: ${updated?.instructor || '(ninguno)'}`);
  console.log('\n✨ El portal de piloto de TG ahora mostrará "Santiago Varas" como instructor.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
