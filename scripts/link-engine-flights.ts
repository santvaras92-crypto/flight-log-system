/**
 * link-engine-flights.ts
 * ======================
 * Batch script to link existing Flight records to EngineMonitorFlight records.
 * 
 * Matching strategy:
 * 1. For each EngineMonitorFlight, find Flight records on the same calendar date (±1 day for timezone)
 * 2. If single match → direct link
 * 3. If multiple matches → pick the one with closest duration (diff_hobbs ≈ durationSec/3600)
 * 4. Duration difference must be < 0.5 hours to qualify
 * 
 * Usage: npx tsx scripts/link-engine-flights.ts
 */

import { prisma } from "../lib/prisma";

async function main() {
  console.log("🔗 Linking Flight ↔ EngineMonitorFlight records...\n");

  // Get all engine monitor flights
  const engineFlights = await prisma.engineMonitorFlight.findMany({
    orderBy: { flightDate: "asc" },
    select: {
      id: true,
      flightNumber: true,
      flightDate: true,
      durationSec: true,
      Flight: { select: { id: true } },
    },
  });

  console.log(`📊 Total EngineMonitorFlights: ${engineFlights.length}`);

  // Filter out already-linked
  const unlinked = engineFlights.filter(ef => !ef.Flight);
  console.log(`🔍 Unlinked: ${unlinked.length}`);

  if (unlinked.length === 0) {
    console.log("✅ All engine flights are already linked!");
    return;
  }

  let linked = 0;
  let noMatch = 0;
  let multiMatch = 0;
  let tooFarDuration = 0;

  for (const ef of unlinked) {
    const engineDate = new Date(ef.flightDate);
    const engineHours = ef.durationSec / 3600;

    // Search ±1 day window (timezone issues: Chile UTC-3/4, Flight.fecha stored at noon local)
    const dayBefore = new Date(engineDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(0, 0, 0, 0);

    const dayAfter = new Date(engineDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(23, 59, 59, 999);

    // Find unlinked Flight records in date window
    const candidates = await prisma.flight.findMany({
      where: {
        fecha: { gte: dayBefore, lte: dayAfter },
        engineFlightId: null, // Not already linked
      },
      select: {
        id: true,
        fecha: true,
        diff_hobbs: true,
      },
    });

    if (candidates.length === 0) {
      noMatch++;
      continue;
    }

    // Find best match by duration proximity
    let bestCandidate: typeof candidates[0] | null = null;
    let bestDiff = Infinity;

    for (const c of candidates) {
      const flightHours = Number(c.diff_hobbs) || 0;
      const diff = Math.abs(flightHours - engineHours);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCandidate = c;
      }
    }

    if (!bestCandidate || bestDiff > 0.5) {
      tooFarDuration++;
      if (candidates.length > 1) multiMatch++;
      continue;
    }

    // Link it!
    try {
      await prisma.flight.update({
        where: { id: bestCandidate.id },
        data: { engineFlightId: ef.id },
      });
      linked++;

      const flightDate = new Date(bestCandidate.fecha).toISOString().slice(0, 10);
      const engineDateStr = engineDate.toISOString().slice(0, 10);
      console.log(
        `  ✅ Flight #${bestCandidate.id} (${flightDate}, ${Number(bestCandidate.diff_hobbs).toFixed(1)}h) → Engine #${ef.id} (${engineDateStr}, ${engineHours.toFixed(1)}h) [Δ${bestDiff.toFixed(2)}h]`
      );
    } catch (err: any) {
      // Could fail if engineFlightId unique constraint violated
      console.log(`  ⚠️ Failed to link Flight #${bestCandidate.id} → Engine #${ef.id}: ${err.message}`);
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Linked: ${linked}`);
  console.log(`   ❌ No match (no flight on date): ${noMatch}`);
  console.log(`   ⏳ Duration too far (>0.5h): ${tooFarDuration}`);
  console.log(`   🔄 Multiple candidates: ${multiMatch}`);

  // Summary
  const totalLinked = await prisma.flight.count({ where: { engineFlightId: { not: null } } });
  const totalFlights = await prisma.flight.count();
  const totalEngine = await prisma.engineMonitorFlight.count();
  console.log(`\n🔗 Overall: ${totalLinked}/${totalFlights} flights linked (${totalEngine} engine flights)`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
