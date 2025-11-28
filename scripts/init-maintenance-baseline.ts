import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Initializing maintenance baseline for CC-AQI...\n');

  const MATRICULA = 'CC-AQI';
  
  // Check if aircraft exists
  const aircraft = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
  if (!aircraft) {
    console.log(`❌ Aircraft ${MATRICULA} not found in database`);
    return;
  }

  // Delete existing components for this aircraft (will be replaced with computed ones from server)
  await prisma.component.deleteMany({ where: { aircraftId: MATRICULA } });
  console.log(`🗑️  Cleared existing components for ${MATRICULA}`);

  // Create baseline components with current values
  const components = [
    { tipo: 'AIRFRAME', horas_acumuladas: 2722.8, limite_tbo: 30000, aircraftId: MATRICULA },
    { tipo: 'ENGINE', horas_acumuladas: 569.6, limite_tbo: 2000, aircraftId: MATRICULA },
    { tipo: 'PROPELLER', horas_acumuladas: 1899.0, limite_tbo: 2000, aircraftId: MATRICULA },
  ];

  for (const comp of components) {
    await prisma.component.create({ data: comp });
    console.log(`✅ Created ${comp.tipo}: ${comp.horas_acumuladas} hrs / ${comp.limite_tbo} TBO`);
  }

  console.log('\n✨ Baseline initialized successfully!');
  console.log('   From now on, server will add Δ Tach from flights created after this baseline.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
