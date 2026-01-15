import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setJMUCostsToZero() {
  console.log('🔍 Actualizando costos de vuelos de Joaquín Mulet (JMU) a $0...\n');

  // Update all JMU flights to have tarifa = 0, instructor_rate = 0, costo = 0
  const result = await prisma.flight.updateMany({
    where: {
      cliente: { equals: 'JMU', mode: 'insensitive' }
    },
    data: {
      tarifa: 0,
      instructor_rate: 0,
      costo: 0
    }
  });

  console.log(`✅ Actualizados ${result.count} vuelos de JMU a:\n`);
  console.log(`   - Tarifa: $0`);
  console.log(`   - Instructor Rate: $0`);
  console.log(`   - Costo Total: $0\n`);

  // Verify
  const updated = await prisma.flight.findMany({
    where: {
      cliente: { equals: 'JMU', mode: 'insensitive' }
    },
    select: {
      fecha: true,
      tarifa: true,
      instructor_rate: true,
      costo: true,
      diff_hobbs: true
    },
    orderBy: { fecha: 'desc' }
  });

  console.log(`📋 Vuelos de JMU después de la actualización (${updated.length} total):`);
  updated.forEach(f => {
    console.log(`   ${f.fecha.toISOString().split('T')[0]} - ${f.diff_hobbs}h - Tarifa: $${f.tarifa || 0}, Inst: $${f.instructor_rate || 0}, Total: $${f.costo || 0}`);
  });
}

setJMUCostsToZero()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
