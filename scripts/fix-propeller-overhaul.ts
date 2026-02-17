import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to register the propeller overhaul and recalculate propeller_hours
 * for all flights after the overhaul point.
 *
 * Propeller overhaul data:
 *   - HOBBS: 2087.5
 *   - TACH: 592.3
 *   - AIRFRAME: 2745.5 (used as reference because TACH resets with engine overhaul)
 *
 * Formula: propeller_hours = flight.airframe_hours - 2745.5
 */
async function main() {
  const MATRICULA = 'CC-AQI';
  const OVERHAUL_AIRFRAME = 2745.5;
  const OVERHAUL_DATE = new Date('2025-01-15'); // Approximate date - adjust if needed

  console.log('🔧 Registering propeller overhaul for CC-AQI...\n');
  console.log(`   Overhaul at AIRFRAME: ${OVERHAUL_AIRFRAME}`);
  console.log(`   Overhaul date: ${OVERHAUL_DATE.toISOString().slice(0, 10)}\n`);

  // 1. Ensure Component records exist for CC-AQI
  const existingComponents = await prisma.component.findMany({
    where: { aircraftId: MATRICULA }
  });

  console.log(`   Existing components in DB: ${existingComponents.length}`);

  // Create components if they don't exist
  const componentTypes = ['AIRFRAME', 'ENGINE', 'PROPELLER'];
  for (const tipo of componentTypes) {
    const existing = existingComponents.find(c => c.tipo === tipo);
    if (!existing) {
      await prisma.component.create({
        data: {
          tipo,
          horas_acumuladas: 0,
          limite_tbo: tipo === 'AIRFRAME' ? 30000 : 2000,
          aircraftId: MATRICULA,
        }
      });
      console.log(`   ✅ Created ${tipo} component record`);
    } else {
      console.log(`   ✓ ${tipo} already exists (id: ${existing.id})`);
    }
  }

  // 2. Register the overhaul on the PROPELLER component
  const propellerComponent = await prisma.component.findFirst({
    where: { aircraftId: MATRICULA, tipo: 'PROPELLER' }
  });

  if (!propellerComponent) {
    console.log('❌ PROPELLER component not found!');
    return;
  }

  await prisma.component.update({
    where: { id: propellerComponent.id },
    data: {
      last_overhaul_airframe: OVERHAUL_AIRFRAME,
      last_overhaul_date: OVERHAUL_DATE,
      overhaul_notes: 'Overhaul de hélice. HOBBS: 2087.5, TACH: 592.3, AIRFRAME: 2745.5',
    }
  });

  console.log(`\n   ✅ PROPELLER overhaul registered at AIRFRAME ${OVERHAUL_AIRFRAME}`);

  // 3. Recalculate propeller_hours for all flights
  // Get the last flight before the overhaul point to see old propeller value
  const flightBeforeOverhaul = await prisma.flight.findFirst({
    where: {
      aircraftId: MATRICULA,
      airframe_hours: { lte: OVERHAUL_AIRFRAME },
    },
    orderBy: { airframe_hours: 'desc' },
    select: { id: true, fecha: true, airframe_hours: true, propeller_hours: true }
  });

  if (flightBeforeOverhaul) {
    console.log(`\n   Last flight before overhaul:`);
    console.log(`     ID: ${flightBeforeOverhaul.id}`);
    console.log(`     Date: ${new Date(flightBeforeOverhaul.fecha).toISOString().slice(0, 10)}`);
    console.log(`     Airframe: ${flightBeforeOverhaul.airframe_hours}`);
    console.log(`     Propeller (old): ${flightBeforeOverhaul.propeller_hours}`);
  }

  // Get all flights after the overhaul
  const flightsAfter = await prisma.flight.findMany({
    where: {
      aircraftId: MATRICULA,
      airframe_hours: { gt: OVERHAUL_AIRFRAME },
    },
    orderBy: { fecha: 'asc' },
    select: { id: true, fecha: true, airframe_hours: true, propeller_hours: true }
  });

  console.log(`\n   Flights after overhaul: ${flightsAfter.length}`);
  console.log('   Recalculating propeller_hours...\n');

  let updated = 0;
  for (const flight of flightsAfter) {
    const oldPropeller = flight.propeller_hours ? Number(flight.propeller_hours) : null;
    const newPropeller = Number((Number(flight.airframe_hours) - OVERHAUL_AIRFRAME).toFixed(1));

    await prisma.flight.update({
      where: { id: flight.id },
      data: { propeller_hours: newPropeller }
    });

    const dateStr = new Date(flight.fecha).toISOString().slice(0, 10);
    console.log(`   ${dateStr} | AF: ${flight.airframe_hours} | Propeller: ${oldPropeller} → ${newPropeller}`);
    updated++;
  }

  // 4. Verify the result
  const lastFlight = await prisma.flight.findFirst({
    where: { aircraftId: MATRICULA },
    orderBy: { fecha: 'desc' },
    select: { airframe_hours: true, propeller_hours: true }
  });

  const currentAirframe = lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : 0;
  const currentPropeller = lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : 0;
  const hoursSinceOverhaul = currentAirframe - OVERHAUL_AIRFRAME;
  const remaining = 2000 - hoursSinceOverhaul;
  const pctUsed = (hoursSinceOverhaul / 2000 * 100).toFixed(1);

  console.log(`\n🎯 Result:`);
  console.log(`   Current AIRFRAME: ${currentAirframe}`);
  console.log(`   Propeller hours since overhaul: ${hoursSinceOverhaul.toFixed(1)}`);
  console.log(`   Propeller remaining TBO: ${remaining.toFixed(1)}`);
  console.log(`   Life used: ${pctUsed}%`);
  console.log(`\n   Updated ${updated} flights.`);
  console.log('\n✨ Done!');
}

main()
  .catch(err => { console.error('❌ Error:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
