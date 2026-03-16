/**
 * migrate-engine-flight-link.ts
 * =============================
 * Migrates the Flight ↔ EngineMonitorFlight relationship from 1:1 (Flight.engineFlightId)
 * to 1:N (EngineMonitorFlight.linkedFlightId).
 * 
 * For each Flight that has engineFlightId set, copies the link to the new column:
 *   EngineMonitorFlight.linkedFlightId = Flight.id
 * 
 * Usage: npx tsx scripts/migrate-engine-flight-link.ts
 */

import { prisma } from "../lib/prisma";

async function main() {
  console.log("🔄 Migrating Flight ↔ EngineMonitorFlight links to new 1:N schema...\n");

  // Find all flights with engineFlightId set
  const flightsWithEngine = await prisma.flight.findMany({
    where: { engineFlightId: { not: null } },
    select: { id: true, engineFlightId: true },
  });

  console.log(`📊 Flights with engineFlightId: ${flightsWithEngine.length}`);

  if (flightsWithEngine.length === 0) {
    console.log("✅ Nothing to migrate!");
    return;
  }

  let migrated = 0;
  let alreadySet = 0;
  let errors = 0;

  for (const f of flightsWithEngine) {
    try {
      // Check if already migrated
      const emf = await prisma.engineMonitorFlight.findUnique({
        where: { id: f.engineFlightId! },
        select: { id: true, linkedFlightId: true },
      });

      if (!emf) {
        console.log(`  ⚠️ EngineMonitorFlight #${f.engineFlightId} not found (Flight #${f.id})`);
        errors++;
        continue;
      }

      if (emf.linkedFlightId === f.id) {
        alreadySet++;
        continue;
      }

      // Set the new linkedFlightId on EngineMonitorFlight
      await prisma.engineMonitorFlight.update({
        where: { id: f.engineFlightId! },
        data: { linkedFlightId: f.id },
      });

      migrated++;
      console.log(`  ✅ EngineMonitorFlight #${f.engineFlightId} → linkedFlightId = Flight #${f.id}`);
    } catch (err: any) {
      console.log(`  ❌ Error migrating Flight #${f.id} → Engine #${f.engineFlightId}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Migration Results:`);
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏩ Already set: ${alreadySet}`);
  console.log(`   ❌ Errors: ${errors}`);

  // Verify
  const newLinked = await prisma.engineMonitorFlight.count({ where: { linkedFlightId: { not: null } } });
  const oldLinked = await prisma.flight.count({ where: { engineFlightId: { not: null } } });
  console.log(`\n🔗 Verification: ${newLinked} engine flights with new linkedFlightId (${oldLinked} flights with old engineFlightId)`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
