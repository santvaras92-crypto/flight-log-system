/**
 * Diagnostic script: Verify GPS extraction from JPI flight headers.
 * GPS coordinates come from GTN 650 → EDM-830 RS-232 link.
 * Position is captured once per flight (start position).
 *
 * Usage: npx tsx scripts/diagnose-jpi-gps.ts
 */

import * as fs from "fs";
import * as path from "path";
import { decodeJPI } from "../lib/jpi-decoder";

const jpiDir = path.resolve(__dirname, "../Engine Analisis");

// Test all available JPI files
const files = fs.readdirSync(jpiDir)
  .filter(f => f.endsWith(".JPI"))
  .sort();

console.log(`🔬 JPI GPS Diagnostic — ${files.length} files found\n`);

let withGPS = 0;
let withoutGPS = 0;
const positions: { file: string; flight: number; date: string; lat: number; lon: number }[] = [];

for (const filename of files) {
  const filePath = path.join(jpiDir, filename);
  const buffer = fs.readFileSync(filePath);

  try {
    const flights = decodeJPI(buffer, filename);
    for (const flight of flights) {
      if (flight.latitude !== null && flight.longitude !== null) {
        withGPS++;
        positions.push({
          file: filename,
          flight: flight.flightNumber,
          date: flight.flightDate.toISOString().slice(0, 10),
          lat: flight.latitude,
          lon: flight.longitude,
        });
      } else {
        withoutGPS++;
      }
    }
  } catch (e) {
    console.log(`  ⚠️ Error decoding ${filename}: ${(e as Error).message}`);
  }
}

console.log(`\n${"═".repeat(80)}`);
console.log(`📊 Results: ${withGPS} flights WITH GPS, ${withoutGPS} flights WITHOUT GPS`);
console.log(`═${"═".repeat(79)}`);

if (positions.length > 0) {
  const lats = positions.map(p => p.lat);
  const lons = positions.map(p => p.lon);
  console.log(`\nCoordinate ranges:`);
  console.log(`  Lat: ${Math.min(...lats).toFixed(6)} to ${Math.max(...lats).toFixed(6)}`);
  console.log(`  Lon: ${Math.min(...lons).toFixed(6)} to ${Math.max(...lons).toFixed(6)}`);

  // Group by unique positions
  const uniquePositions = new Map<string, number>();
  for (const p of positions) {
    const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    uniquePositions.set(key, (uniquePositions.get(key) || 0) + 1);
  }

  console.log(`\nUnique positions (rounded to 0.001°):`);
  for (const [pos, count] of [...uniquePositions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pos} — ${count} flights`);
  }

  // Show first 10 and last 10
  console.log(`\nFirst 10 flights with GPS:`);
  for (const p of positions.slice(0, 10)) {
    console.log(`  #${p.flight} ${p.date} → (${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}) [${p.file}]`);
  }
  if (positions.length > 20) {
    console.log(`  ... (${positions.length - 20} more)`);
  }
  console.log(`\nLast 10 flights with GPS:`);
  for (const p of positions.slice(-10)) {
    console.log(`  #${p.flight} ${p.date} → (${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}) [${p.file}]`);
  }
}

console.log("\n✅ Diagnostic complete");
