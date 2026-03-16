/**
 * link-engine-flights.ts
 * ======================
 * Batch script to link EngineMonitorFlight records to Flight records.
 * Supports 1:N — multiple engine records (tramos) can link to the same Flight
 * (e.g. when a pilot logs 2 legs as 1 flight entry).
 *
 * 2-pass matching strategy:
 *
 * PASS 1 — Direct 1:1 matches
 *   For each unlinked engine record, find a Flight on the same date (±1 day)
 *   where the engine duration alone ≈ diff_hobbs (within 0.5h).
 *
 * PASS 2 — Multi-tramo combination matches
 *   Group remaining unlinked engine records by calendar date.
 *   For each date group, try every 2- and 3-element subset.
 *   If the sum of durations ≈ a Flight's diff_hobbs (within 0.5h),
 *   link ALL records in that subset to that Flight.
 *
 * Usage: npx tsx scripts/link-engine-flights.ts
 */

import { prisma } from "../lib/prisma";

// Engine records shorter than this are considered engine starts/taxis, not real tramos
const MIN_DURATION_SEC = 300; // 5 minutes

// ── Helpers ──────────────────────────────────────────────────────

type EngineRecord = {
  id: number;
  flightNumber: number;
  flightDate: Date;
  durationSec: number;
  linkedFlightId: number | null;
};

type FlightCandidate = {
  id: number;
  fecha: Date;
  diff_hobbs: any;
  EngineMonitorFlights: { id: number; durationSec: number }[];
};

/** Get Flight candidates within ±1 day of a date */
async function getCandidateFlights(date: Date): Promise<FlightCandidate[]> {
  const dayBefore = new Date(date);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(0, 0, 0, 0);

  const dayAfter = new Date(date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  dayAfter.setHours(23, 59, 59, 999);

  return prisma.flight.findMany({
    where: { fecha: { gte: dayBefore, lte: dayAfter } },
    select: {
      id: true,
      fecha: true,
      diff_hobbs: true,
      EngineMonitorFlights: { select: { id: true, durationSec: true } },
    },
  });
}

/** Generate all k-element subsets of arr (k = 2 or 3) */
function subsets<T>(arr: T[], k: number): T[][] {
  const results: T[][] = [];
  function go(start: number, combo: T[]) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      go(i + 1, combo);
      combo.pop();
    }
  }
  go(0, []);
  return results;
}

/** Group engine records by calendar date string */
function groupByDate(records: EngineRecord[]): Map<string, EngineRecord[]> {
  const map = new Map<string, EngineRecord[]>();
  for (const r of records) {
    const key = new Date(r.flightDate).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("🔗 Linking EngineMonitorFlight → Flight records (2-pass)...\n");

  const allEngine = await prisma.engineMonitorFlight.findMany({
    orderBy: { flightDate: "asc" },
    select: {
      id: true,
      flightNumber: true,
      flightDate: true,
      durationSec: true,
      linkedFlightId: true,
    },
  });

  console.log(`📊 Total EngineMonitorFlights: ${allEngine.length}`);

  let unlinked = allEngine.filter(ef => !ef.linkedFlightId);
  console.log(`🔍 Unlinked: ${unlinked.length}`);

  // Filter out junk records (engine starts, taxis — too short to be real tramos)
  const junkCount = unlinked.filter(ef => ef.durationSec < MIN_DURATION_SEC).length;
  unlinked = unlinked.filter(ef => ef.durationSec >= MIN_DURATION_SEC);
  if (junkCount > 0) {
    console.log(`🗑️  Skipping ${junkCount} junk records (< ${MIN_DURATION_SEC / 60} min)`);
  }
  console.log(`🔍 Eligible for linking: ${unlinked.length}`);

  if (unlinked.length === 0) {
    console.log("✅ All engine flights are already linked!");
    return;
  }

  // ── PASS 1: Direct 1:1 matches ──────────────────────────────
  console.log("\n═══ PASS 1: Direct 1:1 matches ═══");
  let linked1 = 0;
  let noMatch1 = 0;
  let tooFar1 = 0;
  const linkedIds = new Set<number>();

  for (const ef of unlinked) {
    const engineHours = ef.durationSec / 3600;
    const candidates = await getCandidateFlights(new Date(ef.flightDate));

    if (candidates.length === 0) { noMatch1++; continue; }

    // Only consider flights with NO existing engine links (clean 1:1)
    let bestCandidate: FlightCandidate | null = null;
    let bestDiff = Infinity;

    for (const c of candidates) {
      const flightHours = Number(c.diff_hobbs) || 0;
      const existingHours = c.EngineMonitorFlights.reduce((s, e) => s + e.durationSec / 3600, 0);
      // 1:1 match: this engine alone vs remaining flight hours
      const diff = Math.abs(flightHours - existingHours - engineHours);
      if (diff < bestDiff) { bestDiff = diff; bestCandidate = c; }
    }

    if (!bestCandidate || bestDiff > 0.5) { tooFar1++; continue; }

    await prisma.engineMonitorFlight.update({
      where: { id: ef.id },
      data: { linkedFlightId: bestCandidate.id },
    });
    linked1++;
    linkedIds.add(ef.id);

    const fDate = new Date(bestCandidate.fecha).toISOString().slice(0, 10);
    const eDate = new Date(ef.flightDate).toISOString().slice(0, 10);
    console.log(
      `  ✅ Engine #${ef.id} (${eDate}, ${engineHours.toFixed(1)}h) → Flight #${bestCandidate.id} (${fDate}, ${Number(bestCandidate.diff_hobbs).toFixed(1)}h) [Δ${bestDiff.toFixed(2)}h]`
    );
  }

  console.log(`\n  Pass 1 results: ✅ ${linked1} linked | ❌ ${noMatch1} no date match | ⏳ ${tooFar1} duration too far`);

  // ── PASS 2: Multi-tramo combination matches ─────────────────
  console.log("\n═══ PASS 2: Multi-tramo combination matches ═══");
  let linked2 = 0;
  let combosChecked = 0;

  // Refresh unlinked list (exclude those just linked in pass 1)
  unlinked = unlinked.filter(ef => !linkedIds.has(ef.id));
  console.log(`  Remaining unlinked after Pass 1: ${unlinked.length}`);

  if (unlinked.length > 0) {
    const dateGroups = groupByDate(unlinked);

    for (const [dateStr, records] of dateGroups) {
      if (records.length < 2) continue; // Need at least 2 to form a combo

      // Get candidate flights for this date
      const candidates = await getCandidateFlights(new Date(records[0].flightDate));
      if (candidates.length === 0) continue;

      // Try 2-element and 3-element subsets
      for (const k of [2, 3]) {
        if (records.length < k) continue;
        const combos = subsets(records, k);

        for (const combo of combos) {
          combosChecked++;
          // Skip if any in this combo was already linked in this pass
          if (combo.some(e => linkedIds.has(e.id))) continue;

          const comboHours = combo.reduce((s, e) => s + e.durationSec / 3600, 0);

          // Find flight where comboHours + existing engine hours ≈ diff_hobbs
          for (const c of candidates) {
            const flightHours = Number(c.diff_hobbs) || 0;
            const existingHours = c.EngineMonitorFlights.reduce((s, e) => s + e.durationSec / 3600, 0);
            const diff = Math.abs(flightHours - existingHours - comboHours);

            if (diff <= 0.5) {
              // Link all records in this combo to this flight
              for (const e of combo) {
                await prisma.engineMonitorFlight.update({
                  where: { id: e.id },
                  data: { linkedFlightId: c.id },
                });
                linkedIds.add(e.id);
                linked2++;
              }

              const fDate = new Date(c.fecha).toISOString().slice(0, 10);
              const ids = combo.map(e => `#${e.id}`).join("+");
              const hours = combo.map(e => (e.durationSec / 3600).toFixed(1) + "h").join("+");
              console.log(
                `  🔀 MULTI-TRAMO: Engines ${ids} (${hours} = ${comboHours.toFixed(1)}h) → Flight #${c.id} (${fDate}, ${flightHours.toFixed(1)}h) [Δ${diff.toFixed(2)}h]`
              );
              break; // Don't link same combo to multiple flights
            }
          }
        }
      }
    }
  }

  console.log(`\n  Pass 2 results: 🔀 ${linked2} linked via ${combosChecked} combos checked`);

  // ── Summary ─────────────────────────────────────────────────
  const totalLinked = await prisma.engineMonitorFlight.count({ where: { linkedFlightId: { not: null } } });
  const totalEngine = await prisma.engineMonitorFlight.count();
  const multiLinked = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM (
      SELECT "linkedFlightId" FROM "EngineMonitorFlight"
      WHERE "linkedFlightId" IS NOT NULL
      GROUP BY "linkedFlightId"
      HAVING COUNT(*) > 1
    ) sub`;
  const multiCount = Number(multiLinked[0]?.count || 0);

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  Total linked: ${linked1 + linked2} this run (Pass1: ${linked1}, Pass2: ${linked2})`);
  console.log(`  Overall: ${totalLinked}/${totalEngine} engine flights linked`);
  console.log(`  Flights with multiple engine records (tramos): ${multiCount}`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
