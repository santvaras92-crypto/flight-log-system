import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";
import { decodeJPI } from "@/lib/jpi-decoder";
import {
  computeDayAssignments,
  localChileDate,
  type EngineLeg,
  type FlightLog,
} from "@/lib/engine-flight-matcher";

// Give the upload handler generous headroom: a multi-flight JPI file can carry
// tens of thousands of readings to persist. Next.js/Railway may otherwise cut
// the request short, surfacing to the client as a plain-text "upstream error".
export const maxDuration = 300; // seconds
export const dynamic = "force-dynamic";

// Engine limits for Lycoming O-320-D2J
const ENGINE_LIMITS = {
  egt_max: 1500,
  cht_redline: 430,
  cht_max: 430,
  oil_temp_max: 245,
  oil_press_max: 115,
  oil_press_min: 25,
  rpm_max: 2700,
  fuel_flow_max: 12.0,
  hp_max: 160,
};

// Convert Prisma Decimal to plain number
const toNum = (v: any): number | null => (v != null ? Number(v) : null);

// Bulk-insert engine readings in chunks. Prisma's nested `create` emits one
// INSERT per row; over a remote DB that means thousands of round-trips and, for
// large multi-flight JPI uploads, a request that exceeds the platform timeout
// (the client then sees a plain-text "upstream error", not our JSON). createMany
// emits a single multi-row INSERT per chunk. Postgres caps a statement at 65535
// bind parameters and each reading has ~26 columns, so we stay well under that.
const READINGS_BATCH = 1000;

async function insertReadingsBatched(
  flightId: number,
  readings: any[]
): Promise<void> {
  for (let i = 0; i < readings.length; i += READINGS_BATCH) {
    const chunk = readings.slice(i, i + READINGS_BATCH).map((r) => ({ ...r, flightId }));
    await prisma.engineMonitorReading.createMany({ data: chunk });
  }
}

// GET — list all flights with summary stats
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const flightId = url.searchParams.get("flightId");
    const byFlightLogId = url.searchParams.get("byFlightLogId");

    // Return all engine records linked to a Flight.id (1:N)
    if (byFlightLogId) {
      const engineFlights = await prisma.engineMonitorFlight.findMany({
        where: { linkedFlightId: parseInt(byFlightLogId), isGroundRun: false },
        orderBy: { flightNumber: "asc" },
        select: {
          id: true,
          flightNumber: true,
          flightDate: true,
          durationSec: true,
          maxEGT: true,
          maxCHT: true,
          maxOilTemp: true,
          minOilPress: true,
          avgRPM: true,
          avgFF: true,
        },
      });
      return NextResponse.json({
        engineFlights: engineFlights.map(f => ({
          ...f,
          maxEGT: toNum(f.maxEGT),
          maxCHT: toNum(f.maxCHT),
          maxOilTemp: toNum(f.maxOilTemp),
          minOilPress: toNum(f.minOilPress),
          avgRPM: toNum(f.avgRPM),
          avgFF: toNum(f.avgFF),
        })),
      });
    }

    if (flightId) {
      // Return full readings for a specific engine flight
      const flight = await prisma.engineMonitorFlight.findUnique({
        where: { id: parseInt(flightId) },
        include: {
          readings: { orderBy: { elapsedSec: "asc" } },
          LinkedFlight: {
            select: {
              id: true, fecha: true, diff_hobbs: true, diff_tach: true,
              costo: true, piloto_raw: true, copiloto: true, cliente: true,
              instructor: true, detalle: true, aerodromoSalida: true, aerodromoDestino: true,
              // Linked pilot account — the authoritative pilot name. `piloto_raw`
              // is only populated for CSV-imported flights, so app submissions
              // (which set `pilotoId`) need the User relation to show the pilot.
              User: { select: { nombre: true } },
            },
          },
        },
      });
      if (!flight) {
        return NextResponse.json({ error: "Flight not found" }, { status: 404 });
      }
      // Convert Decimal fields to plain numbers
      const serialized = {
        ...flight,
        maxEGT: toNum(flight.maxEGT),
        maxCHT: toNum(flight.maxCHT),
        maxOilTemp: toNum(flight.maxOilTemp),
        minOilPress: toNum(flight.minOilPress),
        avgRPM: toNum(flight.avgRPM),
        avgFF: toNum(flight.avgFF),
        readings: flight.readings.map(r => ({
          ...r,
          egt1: toNum(r.egt1), egt2: toNum(r.egt2), egt3: toNum(r.egt3), egt4: toNum(r.egt4),
          cht1: toNum(r.cht1), cht2: toNum(r.cht2), cht3: toNum(r.cht3), cht4: toNum(r.cht4),
          oilTemp: toNum(r.oilTemp), oilPress: toNum(r.oilPress),
          rpm: toNum(r.rpm), map: toNum(r.map), hp: toNum(r.hp),
          fuelFlow: toNum(r.fuelFlow), fuelUsed: toNum(r.fuelUsed), fuelRem: toNum(r.fuelRem),
          oat: toNum(r.oat), volts: toNum(r.volts), carbTemp: toNum(r.carbTemp),
          latitude: toNum(r.latitude), longitude: toNum(r.longitude),
          gpsAlt: toNum(r.gpsAlt), groundSpd: toNum(r.groundSpd),
        })),
      };
      // Add linked Flight info if available
      const linkedFlight = flight.LinkedFlight ? {
        id: flight.LinkedFlight.id,
        fecha: flight.LinkedFlight.fecha,
        diffHobbs: toNum(flight.LinkedFlight.diff_hobbs),
        diffTach: toNum(flight.LinkedFlight.diff_tach),
        costo: toNum(flight.LinkedFlight.costo),
        // Prefer the linked User account name; fall back to the raw import field.
        piloto: flight.LinkedFlight.User?.nombre || flight.LinkedFlight.piloto_raw,
        copiloto: flight.LinkedFlight.copiloto,
        cliente: flight.LinkedFlight.cliente,
        instructor: flight.LinkedFlight.instructor,
        detalle: flight.LinkedFlight.detalle,
        aerodromoSalida: flight.LinkedFlight.aerodromoSalida,
        aerodromoDestino: flight.LinkedFlight.aerodromoDestino,
      } : null;

      return NextResponse.json({ flight: { ...serialized, linkedFlight }, limits: ENGINE_LIMITS });
    }

    // List all flights (summary only, no readings)
    // Exclude flights < 15 min (900 sec) — typically taxi/runup/fuel, not real flights
    const MIN_FLIGHT_DURATION = 900;
    const flights = await prisma.engineMonitorFlight.findMany({
      where: { durationSec: { gte: MIN_FLIGHT_DURATION }, isGroundRun: false },
      orderBy: { flightDate: "desc" },
      select: {
        id: true,
        flightNumber: true,
        flightDate: true,
        aircraftId: true,
        engineModel: true,
        engineSerial: true,
        durationSec: true,
        maxEGT: true,
        maxCHT: true,
        maxOilTemp: true,
        minOilPress: true,
        avgRPM: true,
        avgFF: true,
        sourceFile: true,
        createdAt: true,
        _count: { select: { readings: true } },
      },
    });

    const serialized = flights.map(f => ({
      ...f,
      maxEGT: toNum(f.maxEGT),
      maxCHT: toNum(f.maxCHT),
      maxOilTemp: toNum(f.maxOilTemp),
      minOilPress: toNum(f.minOilPress),
      avgRPM: toNum(f.avgRPM),
      avgFF: toNum(f.avgFF),
    }));

    return NextResponse.json({ flights: serialized, limits: ENGINE_LIMITS });
  } catch (error: any) {
    console.error("Engine data GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — upload CSV or JPI file and store in DB
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const isJPI = filename.endsWith(".jpi");

    if (isJPI) {
      return handleJPIUpload(file);
    } else {
      return handleCSVUpload(file);
    }
  } catch (error: any) {
    console.error("Engine data POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── JPI Binary Upload Handler ────────────────────────────────
async function handleJPIUpload(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const decodedFlights = decodeJPI(buffer, file.name);

  if (decodedFlights.length === 0) {
    return NextResponse.json(
      { error: "No valid flights found in JPI file. The file may be corrupted or empty." },
      { status: 400 }
    );
  }

  const results: Array<{ flightNumber: number; readingsCount: number; status: string }> = [];
  let importedCount = 0;

  for (const df of decodedFlights) {
    // Check for duplicate: search for flights with same flightNumber within
    // a small time window (±3 minutes) instead of exact equality. Exact
    // timestamp equality is fragile across servers/timezones and can cause
    // false positives/negatives. A small window tolerates minor clock/parse
    // differences while avoiding importing the same flight twice.
    const windowMs = 3 * 60 * 1000; // 3 minutes
    const start = new Date(df.flightDate.getTime() - windowMs);
    const end = new Date(df.flightDate.getTime() + windowMs);
    const existing = await prisma.engineMonitorFlight.findFirst({
      where: {
        flightNumber: df.flightNumber,
        flightDate: { gte: start, lte: end },
      },
    });

    if (existing) {
      results.push({ flightNumber: df.flightNumber, readingsCount: 0, status: "duplicate" });
      continue;
    }

    // Build readings array
    const readings = df.records.map((r) => ({
      elapsedSec: r.elapsedSec,
      timestamp: r.timestamp || new Date(df.flightDate.getTime() + r.elapsedSec * 1000),
      egt1: r.egt1,
      egt2: r.egt2,
      egt3: r.egt3,
      egt4: r.egt4,
      cht1: r.cht1,
      cht2: r.cht2,
      cht3: r.cht3,
      cht4: r.cht4,
      oilTemp: r.oilTemp,
      oilPress: r.oilPress,
      rpm: r.rpm,
      map: r.map,
      hp: r.hp,
      fuelFlow: r.fuelFlow,
      fuelUsed: r.fuelUsed,
      fuelRem: r.fuelRem,
      oat: r.oat,
      volts: r.volts,
      carbTemp: r.carbTemp,
      latitude: r.latitude,
      longitude: r.longitude,
      gpsAlt: r.gpsAltitude,
      groundSpd: r.groundSpeed,
    }));

    // Calculate summary stats
    const nums = (arr: (number | null)[]) => arr.filter((v): v is number => v != null && v > 0);
    const egts = readings.flatMap((r) => nums([r.egt1, r.egt2, r.egt3, r.egt4]));
    const chts = readings.flatMap((r) => nums([r.cht1, r.cht2, r.cht3, r.cht4]));
    const oils = nums(readings.map((r) => r.oilTemp));
    const oilPs = nums(readings.map((r) => r.oilPress));
    const rpms = nums(readings.map((r) => r.rpm));
    const ffs = nums(readings.map((r) => r.fuelFlow));

    const maxEGT = egts.length > 0 ? Math.max(...egts) : null;
    const maxCHT = chts.length > 0 ? Math.max(...chts) : null;
    const maxOilTemp = oils.length > 0 ? Math.max(...oils) : null;
    const minOilPress = oilPs.length > 0 ? Math.min(...oilPs) : null;
    const avgRPM = rpms.length > 0 ? rpms.reduce((a, b) => a + b, 0) / rpms.length : null;
    const avgFF = ffs.length > 0 ? ffs.reduce((a, b) => a + b, 0) / ffs.length : null;

    // Create the flight row first, then bulk-insert its readings in batches.
    // A single large file can hold tens of thousands of readings; per-row
    // inserts would exceed the request timeout ("upstream error").
    let flightRow: { id: number } | null = null;
    try {
      flightRow = await prisma.engineMonitorFlight.create({
        data: {
          flightNumber: df.flightNumber,
          flightDate: df.flightDate,
          durationSec: df.durationSec,
          maxEGT,
          maxCHT,
          maxOilTemp,
          minOilPress,
          avgRPM,
          avgFF,
          latitude: df.latitude,
          longitude: df.longitude,
          sourceFile: file.name,
        },
      });
      await insertReadingsBatched(flightRow.id, readings);
    } catch (e) {
      // Roll back a half-created flight so it doesn't linger without readings,
      // and skip to the next flight instead of failing the whole upload.
      if (flightRow?.id) {
        await prisma.engineMonitorFlight
          .delete({ where: { id: flightRow.id } })
          .catch(() => {});
      }
      results.push({ flightNumber: df.flightNumber, readingsCount: 0, status: "error" });
      continue;
    }

    // Auto-link to Flight record by date + duration proximity
    try {
      await autoLinkEngineToFlight(flightRow.id, df.flightDate, df.durationSec);
    } catch (e) {
      // Non-critical — linking can be done later via batch script
    }

    importedCount++;
    results.push({
      flightNumber: df.flightNumber,
      readingsCount: readings.length,
      status: "imported",
    });
  }

  const duplicates = results.filter((r) => r.status === "duplicate").length;
  const totalReadings = results.reduce((s, r) => s + r.readingsCount, 0);

  return NextResponse.json({
    success: true,
    source: "jpi",
    totalFlightsInFile: decodedFlights.length,
    imported: importedCount,
    duplicates,
    totalReadings,
    flights: results,
  });
}

// ─── CSV Upload Handler ───────────────────────────────────────
async function handleCSVUpload(file: File) {
  const text = await file.text();
  const records: Record<string, string>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    return NextResponse.json({ error: "Empty CSV file" }, { status: 400 });
  }

  // Extract flight metadata from filename: flight_XXX_YYYYMMDD_HHMM.csv
  const filename = file.name;
  const match = filename.match(/flight_(\d+)_(\d{8})_(\d{4})\.csv/);

  let flightNumber = 0;
  let flightDate = new Date();

  if (match) {
    flightNumber = parseInt(match[1]);
    const dateStr = match[2];
    const timeStr = match[3];
    flightDate = new Date(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:00`
    );
  } else {
    // Try to get date from first record timestamp
    const firstTs = records[0]?.Timestamp;
    if (firstTs) {
      flightDate = new Date(firstTs);
    }
    // Use hash of filename for flight number
    flightNumber = Math.abs(filename.split('').reduce((a: number, b: string) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 100000;
  }

  // Check for duplicate using a small time window (±3 minutes) to tolerate
  // minor timestamp parsing/clock differences between the uploader and the
  // server. This avoids rejecting legitimate distinct flights due to
  // millisecond/tz offsets while still preventing re-imports of the same
  // flight.
  const csvWindowMs = 3 * 60 * 1000;
  const csvStart = new Date(flightDate.getTime() - csvWindowMs);
  const csvEnd = new Date(flightDate.getTime() + csvWindowMs);
  const existingCsv = await prisma.engineMonitorFlight.findFirst({
    where: { flightNumber, flightDate: { gte: csvStart, lte: csvEnd } },
  });

  if (existingCsv) {
    return NextResponse.json(
      { error: `Flight #${flightNumber} on ${flightDate.toISOString().slice(0, 10)} already exists`, existingId: existingCsv.id },
      { status: 409 }
    );
  }

  // Parse readings
  const readings = records.map((r: any) => ({
    elapsedSec: parseInt(r.Elapsed_s) || 0,
    timestamp: new Date(r.Timestamp),
    egt1: r.EGT1_F ? parseFloat(r.EGT1_F) : null,
    egt2: r.EGT2_F ? parseFloat(r.EGT2_F) : null,
    egt3: r.EGT3_F ? parseFloat(r.EGT3_F) : null,
    egt4: r.EGT4_F ? parseFloat(r.EGT4_F) : null,
    cht1: r.CHT1_F ? parseFloat(r.CHT1_F) : null,
    cht2: r.CHT2_F ? parseFloat(r.CHT2_F) : null,
    cht3: r.CHT3_F ? parseFloat(r.CHT3_F) : null,
    cht4: r.CHT4_F ? parseFloat(r.CHT4_F) : null,
    oilTemp: r.OilTemp_F ? parseFloat(r.OilTemp_F) : null,
    oilPress: r.OilPress_PSI ? parseFloat(r.OilPress_PSI) : null,
    rpm: r.RPM ? parseFloat(r.RPM) : null,
    map: r.MAP_inHg ? parseFloat(r.MAP_inHg) : null,
    hp: r.HP ? parseFloat(r.HP) : null,
    fuelFlow: r.FuelFlow_GPH ? parseFloat(r.FuelFlow_GPH) : null,
    fuelUsed: r.FuelUsed_gal ? parseFloat(r.FuelUsed_gal) : null,
    fuelRem: r.FuelRem_gal ? parseFloat(r.FuelRem_gal) : null,
    oat: r.OAT_F ? parseFloat(r.OAT_F) : null,
    volts: r.Volts ? parseFloat(r.Volts) : null,
    carbTemp: r.CarbTemp_F ? parseFloat(r.CarbTemp_F) : null,
  }));

  // Calculate summary stats
  const egts = readings.flatMap((r: any) => [r.egt1, r.egt2, r.egt3, r.egt4].filter((v: any) => v != null && v > 0));
  const chts = readings.flatMap((r: any) => [r.cht1, r.cht2, r.cht3, r.cht4].filter((v: any) => v != null && v > 0));
  const oils = readings.map((r: any) => r.oilTemp).filter((v: any) => v != null && v > 0);
  const oilPs = readings.map((r: any) => r.oilPress).filter((v: any) => v != null && v > 0);
  const rpms = readings.map((r: any) => r.rpm).filter((v: any) => v != null && v > 0);
  const ffs = readings.map((r: any) => r.fuelFlow).filter((v: any) => v != null && v > 0);

  const maxEGT = egts.length > 0 ? Math.max(...egts) : null;
  const maxCHT = chts.length > 0 ? Math.max(...chts) : null;
  const maxOilTemp = oils.length > 0 ? Math.max(...oils) : null;
  const minOilPress = oilPs.length > 0 ? Math.min(...oilPs) : null;
  const avgRPM = rpms.length > 0 ? rpms.reduce((a: number, b: number) => a + b, 0) / rpms.length : null;
  const avgFF = ffs.length > 0 ? ffs.reduce((a: number, b: number) => a + b, 0) / ffs.length : null;
  const durationSec = readings.length > 0 ? Math.max(...readings.map((r: any) => r.elapsedSec)) : 0;

  // Create the flight row, then bulk-insert readings in batches (see
  // insertReadingsBatched — avoids per-row INSERT round-trips that time out).
  const flight = await prisma.engineMonitorFlight.create({
    data: {
      flightNumber,
      flightDate,
      durationSec,
      maxEGT,
      maxCHT,
      maxOilTemp,
      minOilPress,
      avgRPM,
      avgFF,
      sourceFile: filename,
    },
  });
  try {
    await insertReadingsBatched(flight.id, readings);
  } catch (e) {
    // Roll back the orphan flight (no readings) before surfacing the error.
    await prisma.engineMonitorFlight.delete({ where: { id: flight.id } }).catch(() => {});
    throw e;
  }

  // Auto-link to Flight record by date + duration proximity
  try {
    await autoLinkEngineToFlight(flight.id, flightDate, durationSec);
  } catch (e) {
    // Non-critical
  }

  return NextResponse.json({
    success: true,
    source: "csv",
    flightId: flight.id,
    flightNumber,
    readingsCount: readings.length,
    summary: { maxEGT, maxCHT, maxOilTemp, minOilPress, avgRPM: avgRPM?.toFixed(0), avgFF: avgFF?.toFixed(1) },
  });
}

// ─── Auto-link helper ──────────────────────────────────────────
const MIN_DURATION_SEC = 300; // 5 min — skip engine starts/taxis

async function autoLinkEngineToFlight(engineFlightId: number, flightDate: Date, durationSec: number) {
  // Skip junk records (engine starts, taxis — too short to be real tramos)
  if (durationSec < MIN_DURATION_SEC) return;

  // Detect ground runs: check if the engine record has no significant altitude change
  // or ground speed stays near 0 (typical of run-ups / oil change checks)
  const readings = await prisma.engineMonitorReading.findMany({
    where: { flightId: engineFlightId },
    select: { gpsAlt: true, groundSpd: true },
  });
  const altitudes = readings.map(r => Number(r.gpsAlt)).filter(v => v > 0);
  const speeds = readings.map(r => Number(r.groundSpd)).filter(v => !isNaN(v));
  const altRange = altitudes.length > 2 ? Math.max(...altitudes) - Math.min(...altitudes) : 999;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 999;

  // If altitude never varied more than 100ft AND max ground speed < 40 kts → ground run
  if (altRange < 100 && maxSpeed < 40 && altitudes.length > 5) {
    await prisma.engineMonitorFlight.update({
      where: { id: engineFlightId },
      data: { isGroundRun: true },
    });
    return; // Don't link ground runs to flights
  }

  // ── Whole-day chronological (re)linking ───────────────────────────────
  // Instead of matching this single engine leg in isolation (which is what
  // crossed two pilots' flights before), recompute the ENTIRE day's
  // assignments with the shared deterministic matcher and apply them all.
  // This self-heals: when a pilot's flight was split into several engine legs
  // (e.g. the JPI recording was interrupted mid-flight — pulled circuit
  // breaker), a later leg arriving re-groups all of that pilot's legs and
  // fixes any earlier mis-links on the same day.

  // Anclamos por fecha LOCAL de Chile (no UTC). Flight.fecha se guarda al
  // mediodía local como ancla del día calendario; Engine.flightDate es UTC real.
  const localDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(flightDate); // "YYYY-MM-DD"

  // Ventana ±36h para soportar vuelos en husos horarios extranjeros; luego
  // filtramos por fecha local Chile con fallback a la ventana amplia.
  const [yy, mm, dd] = localDateStr.split("-").map(Number);
  const anchorUtc = Date.UTC(yy, mm - 1, dd, 12, 0, 0);
  const wideStart = new Date(anchorUtc - 36 * 3600_000);
  const wideEnd = new Date(anchorUtc + 36 * 3600_000);

  const candidates = await prisma.flight.findMany({
    where: { fecha: { gte: wideStart, lte: wideEnd } },
    select: { id: true, fecha: true, diff_hobbs: true, hobbs_inicio: true },
  });
  if (candidates.length === 0) return;

  const sameDayCandidates = candidates.filter(c => localChileDate(c.fecha) === localDateStr);
  const effectiveCandidates = sameDayCandidates.length > 0 ? sameDayCandidates : candidates;

  // All flyable engine legs that share this Chile day (wide UTC window + filter).
  const dayEnginesRaw = await prisma.engineMonitorFlight.findMany({
    where: {
      flightDate: { gte: wideStart, lte: wideEnd },
      isGroundRun: { not: true },
      durationSec: { gte: MIN_DURATION_SEC },
    },
    select: { id: true, flightDate: true, durationSec: true, linkedFlightId: true },
    orderBy: { flightDate: "asc" },
  });
  const dayEngines = dayEnginesRaw.filter(e => localChileDate(e.flightDate) === localDateStr);

  const engineLegs: EngineLeg[] = dayEngines.map((ef) => ({
    id: ef.id,
    flightDate: ef.flightDate,
    durationSec: ef.durationSec,
  }));
  const flightLogs: FlightLog[] = effectiveCandidates
    .filter((c) => localChileDate(c.fecha) === localDateStr)
    .map((c) => ({
      id: c.id,
      hobbsInicio: c.hobbs_inicio != null ? Number(c.hobbs_inicio) : null,
      diffHobbs: c.diff_hobbs != null ? Number(c.diff_hobbs) : null,
    }));

  if (flightLogs.length === 0) return;

  const assignments = computeDayAssignments(engineLegs, flightLogs);

  // Apply every changed assignment for the day (self-healing). Only write the
  // rows that actually change to keep the update set minimal.
  const currentById = new Map(dayEngines.map(e => [e.id, e.linkedFlightId ?? null]));
  const updates = assignments.filter(a => currentById.get(a.engineId) !== (a.proposedFlightId ?? null));
  await Promise.all(
    updates.map(a =>
      prisma.engineMonitorFlight.update({
        where: { id: a.engineId },
        data: { linkedFlightId: a.proposedFlightId },
      })
    )
  );
}

// DELETE — remove a flight and its readings
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const flightId = url.searchParams.get("flightId");

    if (!flightId) {
      return NextResponse.json({ error: "flightId required" }, { status: 400 });
    }

    await prisma.engineMonitorFlight.delete({
      where: { id: parseInt(flightId) },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Engine data DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
