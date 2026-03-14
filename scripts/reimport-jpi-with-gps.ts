/**
 * Re-import all JPI files to populate GPS data
 * Deletes existing engine monitor data and re-imports from .JPI files
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

// Import the decoder
import { decodeJPI } from "../lib/jpi-decoder.js";

const prisma = new PrismaClient();
const JPI_DIR = path.join(__dirname2, "..", "Engine Analisis");
const MIN_FLIGHT_DURATION = 900; // 15 minutes

async function main() {
  // Find all JPI files
  const files = fs.readdirSync(JPI_DIR)
    .filter(f => f.endsWith(".JPI") && !f.startsWith("Copia"))
    .sort();

  console.log(`Found ${files.length} JPI files`);

  // Delete existing data
  console.log("Deleting existing engine monitor data...");
  const deletedReadings = await prisma.engineMonitorReading.deleteMany({});
  const deletedFlights = await prisma.engineMonitorFlight.deleteMany({});
  console.log(`  Deleted ${deletedFlights.count} flights, ${deletedReadings.count} readings`);

  let totalFlights = 0;
  let totalReadings = 0;
  let gpsFlights = 0;

  for (const file of files) {
    const filePath = path.join(JPI_DIR, file);
    const buffer = fs.readFileSync(filePath);
    
    try {
      const decoded = decodeJPI(Buffer.from(buffer), file);
      
      for (const df of decoded) {
        if (df.durationSec < MIN_FLIGHT_DURATION) continue;
        
        // Check if this flight already exists
        const existing = await prisma.engineMonitorFlight.findFirst({
          where: { flightNumber: df.flightNumber, flightDate: df.flightDate },
        });
        if (existing) continue;

        const readings = df.records.map(r => ({
          elapsedSec: r.elapsedSec,
          timestamp: r.timestamp || new Date(df.flightDate.getTime() + r.elapsedSec * 1000),
          egt1: r.egt1, egt2: r.egt2, egt3: r.egt3, egt4: r.egt4,
          cht1: r.cht1, cht2: r.cht2, cht3: r.cht3, cht4: r.cht4,
          oilTemp: r.oilTemp, oilPress: r.oilPress,
          rpm: r.rpm, map: r.map, hp: r.hp,
          fuelFlow: r.fuelFlow, fuelUsed: r.fuelUsed, fuelRem: r.fuelRem,
          oat: r.oat, volts: r.volts, carbTemp: r.carbTemp,
          latitude: r.latitude,
          longitude: r.longitude,
          gpsAlt: r.gpsAltitude,
          groundSpd: r.groundSpeed,
        }));

        const nums = (arr: (number | null)[]) => arr.filter((v): v is number => v != null && v > 0);
        const egts = readings.flatMap(r => nums([r.egt1, r.egt2, r.egt3, r.egt4]));
        const chts = readings.flatMap(r => nums([r.cht1, r.cht2, r.cht3, r.cht4]));
        const oils = nums(readings.map(r => r.oilTemp));
        const oilPs = nums(readings.map(r => r.oilPress));
        const rpms = nums(readings.map(r => r.rpm));
        const ffs = nums(readings.map(r => r.fuelFlow));

        const hasGps = readings.some(r => r.latitude != null);

        await prisma.engineMonitorFlight.create({
          data: {
            flightNumber: df.flightNumber,
            flightDate: df.flightDate,
            durationSec: df.durationSec,
            maxEGT: egts.length > 0 ? Math.max(...egts) : null,
            maxCHT: chts.length > 0 ? Math.max(...chts) : null,
            maxOilTemp: oils.length > 0 ? Math.max(...oils) : null,
            minOilPress: oilPs.length > 0 ? Math.min(...oilPs) : null,
            avgRPM: rpms.length > 0 ? rpms.reduce((a, b) => a + b, 0) / rpms.length : null,
            avgFF: ffs.length > 0 ? ffs.reduce((a, b) => a + b, 0) / ffs.length : null,
            latitude: df.latitude,
            longitude: df.longitude,
            sourceFile: file,
            readings: { create: readings },
          },
        });

        totalFlights++;
        totalReadings += readings.length;
        if (hasGps) gpsFlights++;
        
        process.stdout.write(`\r  ${file}: Flight #${df.flightNumber} — ${readings.length} readings${hasGps ? " 📍GPS" : ""}    `);
      }
    } catch (err: any) {
      console.error(`\n  Error in ${file}: ${err.message}`);
    }
  }

  console.log(`\n\n✅ Done! Imported ${totalFlights} flights, ${totalReadings} readings`);
  console.log(`   ${gpsFlights} flights with GPS data (${((gpsFlights/totalFlights)*100).toFixed(0)}%)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
