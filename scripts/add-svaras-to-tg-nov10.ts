import { prisma } from '../lib/prisma';

async function main() {
  // Find TG's flight from November 10, 2025
  const flight = await prisma.flight.findFirst({
    where: {
      fecha: new Date('2025-11-10'),
      cliente: 'TG',
      hobbs_inicio: 560.1,
      hobbs_fin: 560.4,
    },
    select: {
      id: true,
      fecha: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      diff_hobbs: true,
      cliente: true,
      copiloto: true,
      instructor: true,
      costo: true,
    }
  });

  if (!flight) {
    console.log('❌ Vuelo no encontrado');
    return;
  }

  console.log('\n📋 Vuelo encontrado:');
  console.log(`   ID: ${flight.id}`);
  console.log(`   Fecha: ${flight.fecha.toISOString().split('T')[0]}`);
  console.log(`   Cliente: ${flight.cliente}`);
  console.log(`   Hobbs: ${flight.hobbs_inicio} → ${flight.hobbs_fin} (Δ ${flight.diff_hobbs})`);
  console.log(`   Copiloto actual: ${flight.copiloto || '(ninguno)'}`);
  console.log(`   Instructor actual: ${flight.instructor || '(ninguno)'}`);

  // Update copiloto field to Santiago Varas
  await prisma.flight.update({
    where: { id: flight.id },
    data: {
      copiloto: 'Santiago Varas',
    },
  });

  console.log('\n✅ Actualizado exitosamente:');
  console.log(`   Copiloto: Santiago Varas`);

  // Verify the update
  const updated = await prisma.flight.findUnique({
    where: { id: flight.id },
    select: {
      copiloto: true,
      instructor: true,
    },
  });

  console.log('\n📋 Verificación:');
  console.log(`   Copiloto: ${updated?.copiloto}`);
  console.log(`   Instructor: ${updated?.instructor || '(ninguno)'}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
