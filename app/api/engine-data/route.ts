import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";
import { decodeJPI } from "@/lib/jpi-decoder";

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

// GET — list all flights with summary stats
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const flightId = url.searchParams.get("flightId");

    if (flightId) {
      // Return full readings for a specific flight
      const flight = await prisma.engineMonitorFlight.findUnique({
        where: { id: parseInt(flightId) },
        include: {
          readings: { orderBy: { elapsedSec: "asc" } },
          Flight: {
            select: {
              id: true, fecha: true, diff_hobbs: true, diff_tach: true,
              costo: true, piloto_raw: true, copiloto: true, cliente: true,
              instructor: true, detalle: true, aerodromoSalida: true, aerodromoDestino: true,
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
      const linkedFlight = flight.Flight ? {
        id: flight.Flight.id,
        fecha: flight.Flight.fecha,
        diffHobbs: toNum(flight.Flight.diff_hobbs),
        diffTach: toNum(flight.Flight.diff_tach),
        costo: toNum(flight.Flight.costo),
        piloto: flight.Flight.piloto_raw,
        copiloto: flight.Flight.copiloto,
        cliente: flight.Flight.cliente,
        instructor: flight.Flight.instructor,
        detalle: flight.Flight.detalle,
        aerodromoSalida: flight.Flight.aerodromoSalida,
        aerodromoDestino: flight.Flight.aerodromoDestino,
      } : null;

      return NextResponse.json({ flight: { ...serialized, linkedFlight }, limits: ENGINE_LIMITS });
    }

    // List all flights (summary only, no readings)
    // Exclude flights < 15 min (900 sec) — typically taxi/runup/fuel, not real flights
    const MIN_FLIGHT_DURATION = 900;
    const flights = await prisma.engineMonitorFlight.findMany({
      where: { durationSec: { gte: MIN_FLIGHT_DURATION } },
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
    // Check for duplicate
    const existing = await prisma.engineMonitorFlight.findFirst({
      where: { flightNumber: df.flightNumber, flightDate: df.flightDate },
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

    // Create flight + readings
    const flight = await prisma.engineMonitorFlight.create({
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
        readings: { create: readings },
      },
    });

    // Auto-link to Flight record by date + duration proximity
    try {
      await autoLinkEngineToFlight(flight.id, df.flightDate, df.durationSec);
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

  // Check for duplicate
  const existing = await prisma.engineMonitorFlight.findFirst({
    where: { flightNumber, flightDate },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Flight #${flightNumber} on ${flightDate.toISOString().slice(0, 10)} already exists`, existingId: existing.id },
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

  // Create flight with nested readings
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
      readings: {
        create: readings,
      },
    },
  });

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
async function autoLinkEngineToFlight(engineFlightId: number, flightDate: Date, durationSec: number) {
  const engineHours = durationSec / 3600;

  // Search ±1 day window (timezone: Chile UTC-3/4, Flight.fecha stored at noon local)
  const dayBefore = new Date(flightDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(0, 0, 0, 0);

  const dayAfter = new Date(flightDate);
  dayAfter.setDate(dayAfter.getDate() + 1);
  dayAfter.setHours(23, 59, 59, 999);

  const candidates = await prisma.flight.findMany({
    where: {
      fecha: { gte: dayBefore, lte: dayAfter },
      engineFlightId: null,
    },
    select: { id: true, diff_hobbs: true },
  });

  if (candidates.length === 0) return;

  // Find best match by duration proximity
  let best: typeof candidates[0] | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs((Number(c.diff_hobbs) || 0) - engineHours);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }

  if (best && bestDiff <= 0.5) {
    await prisma.flight.update({
      where: { id: best.id },
      data: { engineFlightId: engineFlightId },
    });
  }
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
