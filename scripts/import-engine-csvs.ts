/**
 * Import all existing JPI EDM-830 CSV files into the database.
 * Optimized for remote DB: pre-fetches existing flights, uses raw SQL bulk inserts.
 * Usage: npx tsx scripts/import-engine-csvs.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

// Ensure unhandled errors are visible
process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); process.exit(1); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED REJECTION:", err); process.exit(1); });

const CSV_DIR = path.join(__dirname, "..", "Engine Analisis", "analisis_vuelos", "csv");

// Insert up to 200 rows per raw SQL statement
const RAW_BATCH = 200;

// Pre-loaded set of existing flights for fast local duplicate check
let existingFlightKeys = new Set<string>();

function flightKey(flightNumber: number, flightDate: Date): string {
  return `${flightNumber}_${flightDate.toISOString()}`;
}

// Safe number parser — returns null for NaN/Infinity
function safeNum(v: string | undefined): number | null {
  if (!v || v === "") return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

// Safe date parser
function safeDate(v: string | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d;
}

// SQL value helper
function sqlVal(v: number | null): string {
  return v === null ? "NULL" : String(v);
}

// Retry helper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isConnectionError = err.message?.includes("connect") || 
                                 err.message?.includes("ECONNRESET") ||
                                 err.message?.includes("terminated") ||
                                 err.message?.includes("Can't reach") ||
                                 err.message?.includes("timed out");
      if (!isConnectionError || attempt === maxRetries) throw err;
      const wait = attempt * 5; // 5s, 10s, 15s
      console.log(`  🔄 ${label}: connection error, retry ${attempt}/${maxRetries} in ${wait}s...`);
      await new Promise(r => setTimeout(r, wait * 1000));
      // Reconnect
      try { await prisma.$disconnect(); } catch {}
      try { await prisma.$connect(); } catch {}
    }
  }
  throw new Error("unreachable");
}

async function importCSV(filePath: string): Promise<{ status: string; readings?: number; error?: string }> {
  const filename = path.basename(filePath);
  const match = filename.match(/flight_(\d+)_(\d{8})_(\d{4})\.csv/);
  if (!match) return { status: "skipped", error: "Invalid filename" };

  const flightNumber = parseInt(match[1]);
  const dateStr = match[2];
  const timeStr = match[3];
  const flightDate = new Date(
    `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:00`
  );

  // Fast local duplicate check (no DB query)
  if (existingFlightKeys.has(flightKey(flightNumber, flightDate))) {
    return { status: "duplicate" };
  }

  const text = fs.readFileSync(filePath, "utf-8");
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return { status: "error", error: "CSV parse error" };
  }
  if (records.length === 0) return { status: "skipped", error: "Empty" };

  const readings = records.map((r) => ({
    elapsedSec: parseInt(r.Elapsed_s) || 0,
    timestamp: safeDate(r.Timestamp, flightDate),
    egt1: safeNum(r.EGT1_F),
    egt2: safeNum(r.EGT2_F),
    egt3: safeNum(r.EGT3_F),
    egt4: safeNum(r.EGT4_F),
    cht1: safeNum(r.CHT1_F),
    cht2: safeNum(r.CHT2_F),
    cht3: safeNum(r.CHT3_F),
    cht4: safeNum(r.CHT4_F),
    oilTemp: safeNum(r.OilTemp_F),
    oilPress: safeNum(r.OilPress_PSI),
    rpm: safeNum(r.RPM),
    map: safeNum(r.MAP_inHg),
    hp: safeNum(r.HP),
    fuelFlow: safeNum(r.FuelFlow_GPH),
    fuelUsed: safeNum(r.FuelUsed_gal),
    fuelRem: safeNum(r.FuelRem_gal),
    oat: safeNum(r.OAT_F),
    volts: safeNum(r.Volts),
    carbTemp: safeNum(r.CarbTemp_F),
  }));

  const nums = (arr: (number | null)[]) => arr.filter((v): v is number => v != null && v > 0);
  const egts = readings.flatMap(r => nums([r.egt1, r.egt2, r.egt3, r.egt4]));
  const chts = readings.flatMap(r => nums([r.cht1, r.cht2, r.cht3, r.cht4]));
  const oils = nums(readings.map(r => r.oilTemp));
  const oilPs = nums(readings.map(r => r.oilPress));
  const rpms = nums(readings.map(r => r.rpm));
  const ffs = nums(readings.map(r => r.fuelFlow));

  // Use reduce instead of Math.max(...arr) to avoid stack overflow on large arrays
  const safeMax = (arr: number[]): number | null => arr.length > 0 ? arr.reduce((a, b) => a > b ? a : b) : null;
  const safeMin = (arr: number[]): number | null => arr.length > 0 ? arr.reduce((a, b) => a < b ? a : b) : null;

  const maxEGT = safeMax(egts);
  const maxCHT = safeMax(chts);
  const maxOilTemp = safeMax(oils);
  const minOilPress = safeMin(oilPs);
  const avgRPM = rpms.length > 0 ? rpms.reduce((a, b) => a + b, 0) / rpms.length : null;
  const avgFF = ffs.length > 0 ? ffs.reduce((a, b) => a + b, 0) / ffs.length : null;
  const durationSec = readings.length > 0 ? readings.reduce((max, r) => r.elapsedSec > max ? r.elapsedSec : max, 0) : 0;

  // Create flight (with retry)
  const flight = await withRetry(() => prisma.engineMonitorFlight.create({
    data: {
      flightNumber, flightDate, durationSec,
      maxEGT, maxCHT, maxOilTemp, minOilPress, avgRPM, avgFF,
      sourceFile: filename,
    },
  }), filename);

  try {
    // Raw SQL bulk insert — much faster than Prisma createMany over remote DB
    const totalBatches = Math.ceil(readings.length / RAW_BATCH);
    for (let i = 0; i < readings.length; i += RAW_BATCH) {
      const batch = readings.slice(i, i + RAW_BATCH);
      const batchNum = Math.floor(i / RAW_BATCH) + 1;
      const values = batch.map(r => {
        const ts = r.timestamp.toISOString();
        return `(${flight.id}, ${r.elapsedSec}, '${ts}', ${sqlVal(r.egt1)}, ${sqlVal(r.egt2)}, ${sqlVal(r.egt3)}, ${sqlVal(r.egt4)}, ${sqlVal(r.cht1)}, ${sqlVal(r.cht2)}, ${sqlVal(r.cht3)}, ${sqlVal(r.cht4)}, ${sqlVal(r.oilTemp)}, ${sqlVal(r.oilPress)}, ${sqlVal(r.rpm)}, ${sqlVal(r.map)}, ${sqlVal(r.hp)}, ${sqlVal(r.fuelFlow)}, ${sqlVal(r.fuelUsed)}, ${sqlVal(r.fuelRem)}, ${sqlVal(r.oat)}, ${sqlVal(r.volts)}, ${sqlVal(r.carbTemp)})`;
      }).join(",\n");

      await withRetry(() => prisma.$executeRawUnsafe(`
        INSERT INTO "EngineMonitorReading" ("flightId", "elapsedSec", "timestamp", "egt1", "egt2", "egt3", "egt4", "cht1", "cht2", "cht3", "cht4", "oilTemp", "oilPress", "rpm", "map", "hp", "fuelFlow", "fuelUsed", "fuelRem", "oat", "volts", "carbTemp")
        VALUES ${values}
      `), `${filename} batch ${batchNum}/${totalBatches}`);
      
      // Show progress for large files
      if (totalBatches > 10 && batchNum % 10 === 0) {
        process.stdout.write(`    batch ${batchNum}/${totalBatches}\r`);
      }
    }
  } catch (err) {
    // If readings fail, clean up the orphan flight
    await prisma.engineMonitorFlight.delete({ where: { id: flight.id } }).catch(() => {});
    throw err;
  }

  // Track this flight as imported so re-runs skip it
  existingFlightKeys.add(flightKey(flightNumber, flightDate));

  return { status: "imported", readings: readings.length };
}

async function main() {
  if (!fs.existsSync(CSV_DIR)) {
    console.error("CSV directory not found:", CSV_DIR);
    process.exit(1);
  }

  // Test DB connection with retry
  console.log("🔌 Testing DB connection...");
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("   ✅ DB connection OK");
      break;
    } catch (err) {
      if (attempt === 5) {
        console.error("   ❌ DB connection failed after 5 attempts:", err);
        process.exit(1);
      }
      console.log(`   ⏳ DB unreachable, attempt ${attempt}/5 — waiting ${attempt * 10}s...`);
      await new Promise(r => setTimeout(r, attempt * 10000));
    }
  }

  // Clean up orphan flights (from previous failed runs)
  const orphans = await prisma.engineMonitorFlight.findMany({
    where: { readings: { none: {} } },
    select: { id: true },
  });
  if (orphans.length > 0) {
    await prisma.engineMonitorFlight.deleteMany({ where: { id: { in: orphans.map(o => o.id) } } });
    console.log(`🧹 Cleaned ${orphans.length} orphan flights`);
  }

  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith(".csv")).sort();
  console.log(`📂 Found ${files.length} CSV files`);

  // Pre-fetch all existing flights in ONE query (avoids 618 individual queries)
  console.log(`📡 Checking existing flights in DB...`);
  const existingFlights = await prisma.engineMonitorFlight.findMany({
    select: { flightNumber: true, flightDate: true },
  });
  existingFlightKeys = new Set(
    existingFlights.map(f => flightKey(f.flightNumber, f.flightDate))
  );
  console.log(`   Found ${existingFlights.length} existing flights (will skip duplicates)`);
  console.log(`   Need to import: ~${files.length - existingFlights.length} flights\n`);
  console.log(`📡 Importing to Railway DB...\n`);

  let imported = 0, duplicates = 0, errors = 0, totalReadings = 0;
  const t0 = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pct = ((i + 1) / files.length * 100).toFixed(1);
    try {
      const result = await importCSV(path.join(CSV_DIR, file));
      if (result.status === "imported") {
        imported++;
        totalReadings += result.readings || 0;
        const sec = ((Date.now() - t0) / 1000).toFixed(0);
        const rate = imported > 0 ? (imported / ((Date.now() - t0) / 1000)).toFixed(1) : "0";
        console.log(`  ✅ [${pct}%] ${i+1}/${files.length} — imp:${imported} (${rate}/s) ${sec}s — ${file} (${result.readings} readings)`);
      } else if (result.status === "duplicate") {
        duplicates++;
        // Log every 50 duplicates to show progress
        if (duplicates % 50 === 0) console.log(`  ⏩ ${duplicates} duplicates skipped so far...`);
      } else {
        errors++;
        console.log(`  ⚠️ [${pct}%] ${file}: ${result.error}`);
      }
    } catch (err: any) {
      errors++;
      console.error(`  ❌ [${pct}%] ${file}: ${err.message?.slice(0, 200)}`);
      console.error(`     Stack: ${err.stack?.slice(0, 300)}`);
      // If we get a connection error, try to reconnect
      if (err.message?.includes("connect") || err.message?.includes("ECONNRESET") || err.message?.includes("terminated") || err.message?.includes("Can't reach")) {
        console.log("  🔄 Reconnecting to DB...");
        try {
          await prisma.$disconnect();
          await new Promise(r => setTimeout(r, 5000));
          await prisma.$connect();
          console.log("  ✅ Reconnected");
        } catch {
          console.error("  ❌ Reconnect failed, will try next file anyway");
        }
      }
    }
  }

  console.log(`\n📊 Loop finished. imported=${imported} dup=${duplicates} err=${errors}`);

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🏁 Done in ${totalSec}s — ${imported} flights, ${totalReadings.toLocaleString()} readings, ${duplicates} dup, ${errors} err`);
  await prisma.$disconnect();
}

main().catch(e => { console.error("MAIN CATCH:", e); prisma.$disconnect(); process.exit(1); });
