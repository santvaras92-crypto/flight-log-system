import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setJMUTarifaToZero() {
  console.log('🔍 Buscando vuelos de Joaquín Mulet (JMU)...\n');

  // Find all flights for JMU
  const flights = await prisma.flight.findMany({
    where: {
      cliente: { equals: 'JMU', mode: 'insensitive' }
    },
    orderBy: { fecha: 'desc' }
  });

  console.log(`✅ Encontrados ${flights.length} vuelos de JMU\n`);

  if (flights.length === 0) {
    console.log('No hay vuelos para actualizar');
    return;
  }

  // Count how many already have tarifa 0
  const alreadyZero = flights.filter(f => Number(f.tarifa || 0) === 0).length;
  const needsUpdate = flights.length - alreadyZero;

  console.log(`📊 Estado actual:`);
  console.log(`   Ya con tarifa $0: ${alreadyZero}`);
  console.log(`   Necesitan actualización: ${needsUpdate}\n`);

  if (needsUpdate === 0) {
    console.log('✅ Todos los vuelos ya tienen tarifa $0');
    return;
  }

  // Update all flights to have tarifa = 0
  const result = await prisma.flight.updateMany({
    where: {
      cliente: { equals: 'JMU', mode: 'insensitive' }
    },
    data: {
      tarifa: 0
    }
  });

  console.log(`✅ Actualizados ${result.count} vuelos de JMU a tarifa $0\n`);

  // Verify
  const updated = await prisma.flight.findMany({
    where: {
      cliente: { equals: 'JMU', mode: 'insensitive' }
    },
    select: {
      fecha: true,
      tarifa: true,
      instructor_rate: true,
      costo: true
    },
    orderBy: { fecha: 'desc' },
    take: 5
  });

  console.log('📋 Últimos 5 vuelos después de la actualización:');
  updated.forEach(f => {
    console.log(`   ${f.fecha.toISOString().split('T')[0]} - Tarifa: $${f.tarifa || 0}, Inst: $${f.instructor_rate || 0}, Total: $${f.costo || 0}`);
  });
}

setJMUTarifaToZero()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
