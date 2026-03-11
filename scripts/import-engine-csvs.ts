/**
 * Import all existing JPI EDM-830 CSV files into the database.
 * Optimized for remote DB: uses createMany in batches.
 * Usage: npx tsx scripts/import-engine-csvs.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

const CSV_DIR = path.join(__dirname, "..", "Engine Analisis", "analisis_vuelos", "csv");

const BATCH_SIZE = 500;

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

  const existing = await prisma.engineMonitorFlight.findFirst({
    where: { flightNumber, flightDate },
  });
  if (existing) return { status: "duplicate" };

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

  const nums = (arr: (number | null)[]) => arr.filter((v): v is number => v != null && v > 0);
  const egts = readings.flatMap(r => nums([r.egt1, r.egt2, r.egt3, r.egt4]));
  const chts = readings.flatMap(r => nums([r.cht1, r.cht2, r.cht3, r.cht4]));
  const oils = nums(readings.map(r => r.oilTemp));
  const oilPs = nums(readings.map(r => r.oilPress));
  const rpms = nums(readings.map(r => r.rpm));
  const ffs = nums(readings.map(r => r.fuelFlow));

  const maxEGT = egts.length > 0 ? Math.max(...egts) : null;
  const maxCHT = chts.length > 0 ? Math.max(...chts) : null;
  const maxOilTemp = oils.length > 0 ? Math.max(...oils) : null;
  const minOilPress = oilPs.length > 0 ? Math.min(...oilPs) : null;
  const avgRPM = rpms.length > 0 ? rpms.reduce((a, b) => a + b, 0) / rpms.length : null;
  const avgFF = ffs.length > 0 ? ffs.reduce((a, b) => a + b, 0) / ffs.length : null;
  const durationSec = readings.length > 0 ? Math.max(...readings.map(r => r.elapsedSec)) : 0;

  // Create flight first (fast)
  const flight = await prisma.engineMonitorFlight.create({
    data: {
      flightNumber, flightDate, durationSec,
      maxEGT, maxCHT, maxOilTemp, minOilPress, avgRPM, avgFF,
      sourceFile: filename,
    },
  });

  // Batch insert readings with createMany (much faster than nested create)
  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const batch = readings.slice(i, i + BATCH_SIZE).map(r => ({ ...r, flightId: flight.id }));
    await prisma.engineMonitorReading.createMany({ data: batch });
  }

  return { status: "imported", readings: readings.length };
}

async function main() {
  if (!fs.existsSync(CSV_DIR)) {
    console.error("CSV directory not found:", CSV_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith(".csv")).sort();
  console.log(`📂 Found ${files.length} CSV files`);
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
        if (imported % 10 === 0 || i === files.length - 1) {
          const sec = ((Date.now() - t0) / 1000).toFixed(0);
          const rate = (imported / ((Date.now() - t0) / 1000)).toFixed(1);
          console.log(`  ✅ [${pct}%] ${i+1}/${files.length} — imp:${imported} (${rate}/s) ${sec}s — ${file}`);
        }
      } else if (result.status === "duplicate") {
        duplicates++;
      } else {
        errors++;
        console.log(`  ⚠️ [${pct}%] ${file}: ${result.error}`);
      }
    } catch (err: any) {
      errors++;
      console.log(`  ❌ [${pct}%] ${file}: ${err.message?.slice(0, 80)}`);
    }
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🏁 Done in ${totalSec}s — ${imported} flights, ${totalReadings.toLocaleString()} readings, ${duplicates} dup, ${errors} err`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
