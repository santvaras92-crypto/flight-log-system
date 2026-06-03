import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeDayAssignments,
  localChileDate,
  MIN_DURATION_SEC,
  type EngineLeg,
  type FlightLog,
} from "@/lib/engine-flight-matcher";

/**
 * Bulk re-match ALL EngineMonitorFlight ↔ Flight links using the deterministic
 * order-preserving day matcher (lib/engine-flight-matcher.ts).
 *
 * Fixes historical mislinks (e.g. two same-day flights with similar durations
 * getting crossed) by re-assigning each day's engine legs to flight logs in
 * strict chronological order (engine takeoff time ↔ hobbs meter order).
 *
 * GET  /api/admin/rematch-engines              → dry-run, report proposed changes only
 * GET  /api/admin/rematch-engines?date=2026-03-31  → dry-run for one local day
 * POST /api/admin/rematch-engines              → apply ALL changes
 * POST /api/admin/rematch-engines?date=2026-03-31  → apply changes for one day
 *
 * Safety:
 *  - Only touches CC-AQI engine records that are flyable (not ground runs, ≥5 min).
 *  - Refuses to link across different aircraftId.
 *  - GET never writes. POST returns the same diff it applied.
 */

interface ChangeRow {
  date: string;
  engineId: number;
  flightNumber: number;
  fromFlightId: number | null;
  toFlightId: number | null;
  reason: string;
}

async function buildPlan(filterDate: string | null) {
  // Pull all flyable engine legs (skip ground runs and taxis/starts).
  const engines = await prisma.engineMonitorFlight.findMany({
    where: {
      isGroundRun: { not: true },
      durationSec: { gte: MIN_DURATION_SEC },
    },
    select: {
      id: true,
      flightNumber: true,
      flightDate: true,
      durationSec: true,
      aircraftId: true,
      linkedFlightId: true,
    },
    orderBy: { flightDate: "asc" },
  });

  // Group engines by local Chile date.
  const engineByDay = new Map<string, typeof engines>();
  for (const e of engines) {
    const day = localChileDate(e.flightDate);
    if (filterDate && day !== filterDate) continue;
    if (!engineByDay.has(day)) engineByDay.set(day, []);
    engineByDay.get(day)!.push(e);
  }

  const changes: ChangeRow[] = [];
  const unchanged: number[] = [];

  for (const [day, dayEngines] of engineByDay) {
    // Fetch Flight logs for this local day (±36h wide window, then filter exact).
    const [yy, mm, dd] = day.split("-").map(Number);
    const anchorUtc = Date.UTC(yy, mm - 1, dd, 12, 0, 0);
    const wideStart = new Date(anchorUtc - 36 * 3600_000);
    const wideEnd = new Date(anchorUtc + 36 * 3600_000);

    const flightsRaw = await prisma.flight.findMany({
      where: { fecha: { gte: wideStart, lte: wideEnd } },
      select: {
        id: true,
        fecha: true,
        hobbs_inicio: true,
        diff_hobbs: true,
        aircraftId: true,
      },
      orderBy: { hobbs_inicio: "asc" },
    });

    // Keep only flights whose local Chile date matches this day and same aircraft.
    const aircraftId = dayEngines[0].aircraftId;
    const flights: FlightLog[] = flightsRaw
      .filter(
        (f) => localChileDate(f.fecha) === day && f.aircraftId === aircraftId,
      )
      .map((f) => ({
        id: f.id,
        hobbsInicio: f.hobbs_inicio != null ? Number(f.hobbs_inicio) : null,
        diffHobbs: f.diff_hobbs != null ? Number(f.diff_hobbs) : null,
      }));

    const engineLegs: EngineLeg[] = dayEngines.map((e) => ({
      id: e.id,
      flightDate: e.flightDate,
      durationSec: e.durationSec,
    }));

    const assignments = computeDayAssignments(engineLegs, flights);

    for (const a of assignments) {
      const eng = dayEngines.find((e) => e.id === a.engineId)!;
      if (eng.linkedFlightId === a.proposedFlightId) {
        unchanged.push(a.engineId);
      } else {
        changes.push({
          date: day,
          engineId: a.engineId,
          flightNumber: eng.flightNumber,
          fromFlightId: eng.linkedFlightId,
          toFlightId: a.proposedFlightId,
          reason: a.reason,
        });
      }
    }
  }

  // Sort changes by date for readable reports.
  changes.sort((a, b) => a.date.localeCompare(b.date) || a.engineId - b.engineId);

  return { changes, unchangedCount: unchanged.length };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filterDate = url.searchParams.get("date");
    const { changes, unchangedCount } = await buildPlan(filterDate);

    return NextResponse.json({
      mode: "dry-run",
      filterDate: filterDate ?? "ALL",
      proposedChanges: changes.length,
      unchanged: unchangedCount,
      changes,
      hint: "POST the same URL to APPLY these changes.",
    });
  } catch (error: any) {
    console.error("Rematch engines GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filterDate = url.searchParams.get("date");
    const { changes, unchangedCount } = await buildPlan(filterDate);

    // Apply each change.
    let applied = 0;
    for (const c of changes) {
      await prisma.engineMonitorFlight.update({
        where: { id: c.engineId },
        data: { linkedFlightId: c.toFlightId },
      });
      applied++;
    }

    return NextResponse.json({
      mode: "applied",
      filterDate: filterDate ?? "ALL",
      applied,
      unchanged: unchangedCount,
      changes,
    });
  } catch (error: any) {
    console.error("Rematch engines POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
