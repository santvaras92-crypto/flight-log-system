/**
 * link-engine-flights.ts
 * ======================
 * Batch script to link existing EngineMonitorFlight records to Flight records.
 * Now supports 1:N: multiple engine records can link to the same Flight
 * (e.g. when a pilot logs 2 legs as 1 flight entry).
 * 
 * Matching strategy:
 * 1. For each unlinked EngineMonitorFlight, find Flight records on the same calendar date (±1 day)
 * 2. For each candidate Flight, compute sum of already-linked engine durations + this one
 * 3. Pick the Flight where total engine hours best matches diff_hobbs (within 0.5h tolerance)
 * 
 * Usage: npx tsx scripts/link-engine-flights.ts
 */

import { prisma } from "../lib/prisma";

async function main() {
  console.log("🔗 Linking EngineMonitorFlight → Flight records (1:N)...\n");

  // Get all engine monitor flights
  const engineFlights = await prisma.engineMonitorFlight.findMany({
    orderBy: { flightDate: "asc" },
    select: {
      id: true,
      flightNumber: true,
      flightDate: true,
      durationSec: true,
      linkedFlightId: true,
    },
  });

  console.log(`📊 Total EngineMonitorFlights: ${engineFlights.length}`);

  // Filter out already-linked
  const unlinked = engineFlights.filter(ef => !ef.linkedFlightId);
  console.log(`🔍 Unlinked: ${unlinked.length}`);

  if (unlinked.length === 0) {
    console.log("✅ All engine flights are already linked!");
    return;
  }

  let linked = 0;
  let noMatch = 0;
  let tooFarDuration = 0;

  for (const ef of unlinked) {
    const engineDate = new Date(ef.flightDate);
    const engineHours = ef.durationSec / 3600;

    // Search ±1 day window
    const dayBefore = new Date(engineDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(0, 0, 0, 0);

    const dayAfter = new Date(engineDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(23, 59, 59, 999);

    // Find Flight records in date window, including their existing engine links
    const candidates = await prisma.flight.findMany({
      where: {
        fecha: { gte: dayBefore, lte: dayAfter },
      },
      select: {
        id: true,
        fecha: true,
        diff_hobbs: true,
        EngineMonitorFlights: { select: { id: true, durationSec: true } },
      },
    });

    if (candidates.length === 0) {
      noMatch++;
      continue;
    }

    // Find best match: flight where (existing engine hours + this engine hours) ≈ diff_hobbs
    let bestCandidate: typeof candidates[0] | null = null;
    let bestDiff = Infinity;

    for (const c of candidates) {
      const flightHours = Number(c.diff_hobbs) || 0;
      const existingEngineHours = c.EngineMonitorFlights.reduce((s, e) => s + e.durationSec / 3600, 0);
      const totalEngineHours = existingEngineHours + engineHours;
      const diff = Math.abs(flightHours - totalEngineHours);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCandidate = c;
      }
    }

    if (!bestCandidate || bestDiff > 0.5) {
      tooFarDuration++;
      continue;
    }

    // Link it!
    try {
      await prisma.engineMonitorFlight.update({
        where: { id: ef.id },
        data: { linkedFlightId: bestCandidate.id },
      });
      linked++;

      const existingCount = bestCandidate.EngineMonitorFlights.length;
      const flightDate = new Date(bestCandidate.fecha).toISOString().slice(0, 10);
      const engineDateStr = engineDate.toISOString().slice(0, 10);
      console.log(
        `  ✅ Engine #${ef.id} (${engineDateStr}, ${engineHours.toFixed(1)}h) → Flight #${bestCandidate.id} (${flightDate}, ${Number(bestCandidate.diff_hobbs).toFixed(1)}h) [Δ${bestDiff.toFixed(2)}h]${existingCount > 0 ? ` (now ${existingCount + 1} engine records)` : ''}`
      );
    } catch (err: any) {
      console.log(`  ⚠️ Failed to link Engine #${ef.id} → Flight #${bestCandidate.id}: ${err.message}`);
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Linked: ${linked}`);
  console.log(`   ❌ No match (no flight on date): ${noMatch}`);
  console.log(`   ⏳ Duration too far (>0.5h): ${tooFarDuration}`);

  // Summary
  const totalLinked = await prisma.engineMonitorFlight.count({ where: { linkedFlightId: { not: null } } });
  const totalEngine = await prisma.engineMonitorFlight.count();
  const multiLinked = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM (
      SELECT "linkedFlightId" FROM "EngineMonitorFlight" 
      WHERE "linkedFlightId" IS NOT NULL 
      GROUP BY "linkedFlightId" 
      HAVING COUNT(*) > 1
    ) sub`;
  const multiCount = Number(multiLinked[0]?.count || 0);
  console.log(`\n🔗 Overall: ${totalLinked}/${totalEngine} engine flights linked`);
  console.log(`🔀 Flights with multiple engine records: ${multiCount}`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
