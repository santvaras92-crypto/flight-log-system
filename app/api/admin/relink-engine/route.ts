import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Manual relink of an EngineMonitorFlight to a different Flight log.
 *
 * The automatic matcher (scripts/link-engine-flights.ts) links engine ↔ flight
 * by date (±1 day) + hobbs duration (±0.5h) only — no pilot/route awareness.
 * When two flights happen the same day with similar durations, it can cross them.
 * This endpoint lets an admin fix those mislinks.
 *
 * GET  /api/admin/relink-engine?engineFlightId=991
 *   → Diagnostic. Shows the engine record, its current link, and all candidate
 *     Flight logs within ±1 day (with pilot, route, hobbs) to pick the right one.
 *
 * POST /api/admin/relink-engine?engineFlightId=991&flightId=1234
 *   → Reassign engine #991 to Flight #1234. Pass flightId=null to unlink.
 */

function pilotName(f: any): string {
  if (f.User?.nombre) return String(f.User.nombre).trim();
  return f.piloto_raw ?? "—";
}

async function loadEngine(engineFlightId: number) {
  return prisma.engineMonitorFlight.findUnique({
    where: { id: engineFlightId },
    select: {
      id: true,
      flightNumber: true,
      flightDate: true,
      durationSec: true,
      aircraftId: true,
      gpsSource: true,
      linkedFlightId: true,
    },
  });
}

async function loadCandidates(date: Date) {
  const dayBefore = new Date(date);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(0, 0, 0, 0);
  const dayAfter = new Date(date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  dayAfter.setHours(23, 59, 59, 999);

  const flights = await prisma.flight.findMany({
    where: { fecha: { gte: dayBefore, lte: dayAfter } },
    select: {
      id: true,
      fecha: true,
      diff_hobbs: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      piloto_raw: true,
      aerodromoSalida: true,
      aerodromoDestino: true,
      aircraftId: true,
      User: { select: { nombre: true } },
      EngineMonitorFlights: { select: { id: true, durationSec: true } },
    },
    orderBy: { fecha: "asc" },
  });

  return flights.map((f) => ({
    flightId: f.id,
    fecha: f.fecha,
    pilot: pilotName(f),
    route:
      f.aerodromoSalida || f.aerodromoDestino
        ? `${f.aerodromoSalida ?? "?"} → ${f.aerodromoDestino ?? "?"}`
        : "—",
    diffHobbs: f.diff_hobbs != null ? Number(f.diff_hobbs) : null,
    aircraftId: f.aircraftId,
    linkedEngineIds: f.EngineMonitorFlights.map((e) => e.id),
    linkedEngineHours:
      Math.round(
        (f.EngineMonitorFlights.reduce((s, e) => s + e.durationSec, 0) / 3600) * 100,
      ) / 100,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const engineFlightId = parseInt(url.searchParams.get("engineFlightId") ?? "");
    if (!engineFlightId) {
      return NextResponse.json(
        { error: "engineFlightId query param is required" },
        { status: 400 },
      );
    }

    const engine = await loadEngine(engineFlightId);
    if (!engine) {
      return NextResponse.json(
        { error: `EngineMonitorFlight #${engineFlightId} not found` },
        { status: 404 },
      );
    }

    const candidates = await loadCandidates(new Date(engine.flightDate));

    return NextResponse.json({
      engine: {
        id: engine.id,
        flightNumber: engine.flightNumber,
        flightDate: engine.flightDate,
        durationHours: Math.round((engine.durationSec / 3600) * 100) / 100,
        aircraftId: engine.aircraftId,
        gpsSource: engine.gpsSource,
        currentLinkedFlightId: engine.linkedFlightId,
      },
      candidates,
      hint: "POST ?engineFlightId=X&flightId=Y to reassign. flightId=null to unlink.",
    });
  } catch (error: any) {
    console.error("Relink engine GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const engineFlightId = parseInt(url.searchParams.get("engineFlightId") ?? "");
    const flightIdParam = url.searchParams.get("flightId");
    if (!engineFlightId) {
      return NextResponse.json(
        { error: "engineFlightId query param is required" },
        { status: 400 },
      );
    }

    const engine = await loadEngine(engineFlightId);
    if (!engine) {
      return NextResponse.json(
        { error: `EngineMonitorFlight #${engineFlightId} not found` },
        { status: 404 },
      );
    }

    // Allow unlink with flightId=null / "null" / empty
    const unlink =
      flightIdParam == null || flightIdParam === "null" || flightIdParam === "";
    const newFlightId = unlink ? null : parseInt(flightIdParam);

    if (!unlink && (newFlightId == null || Number.isNaN(newFlightId))) {
      return NextResponse.json(
        { error: "flightId must be a valid integer (or 'null' to unlink)" },
        { status: 400 },
      );
    }

    let target: { id: number; piloto: string } | null = null;
    if (!unlink) {
      const flight = await prisma.flight.findUnique({
        where: { id: newFlightId! },
        select: {
          id: true,
          piloto_raw: true,
          aircraftId: true,
          User: { select: { nombre: true } },
        },
      });
      if (!flight) {
        return NextResponse.json(
          { error: `Flight #${newFlightId} not found` },
          { status: 404 },
        );
      }
      if (flight.aircraftId !== engine.aircraftId) {
        return NextResponse.json(
          {
            error: `Aircraft mismatch: engine is ${engine.aircraftId}, Flight #${newFlightId} is ${flight.aircraftId}. Refusing to link different aircraft.`,
          },
          { status: 409 },
        );
      }
      target = { id: flight.id, piloto: pilotName(flight) };
    }

    await prisma.engineMonitorFlight.update({
      where: { id: engineFlightId },
      data: { linkedFlightId: newFlightId },
    });

    return NextResponse.json({
      success: true,
      engineFlightId,
      previousLinkedFlightId: engine.linkedFlightId,
      newLinkedFlightId: newFlightId,
      target: target ? { flightId: target.id, pilot: target.piloto } : null,
      message: unlink
        ? `Engine #${engineFlightId} unlinked.`
        : `Engine #${engineFlightId} relinked from Flight #${engine.linkedFlightId ?? "none"} → Flight #${newFlightId} (${target?.piloto}).`,
    });
  } catch (error: any) {
    console.error("Relink engine POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
