/**
 * Import GPS data from a KML file into EngineMonitorFlight #1844 (flight number 963)
 * Uses raw SQL UPDATE with VALUES for maximum speed — single query per batch.
 * 
 * Usage: npx tsx scripts/import-kml-gps-963.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { parseKml, matchKmlToReadings, metersToFeet } from "../lib/kml-parser";

const ENGINE_FLIGHT_ID = 1844; // flight number 963
const KML_FILE = "/Users/santiagovaras/Downloads/TrackLog_5E5D322C-7505-4C42-A680-99D8412DE095.kml";

async function main() {
  console.log(`\n📂 Reading KML file...`);
  const kmlText = readFileSync(KML_FILE, "utf-8");
  console.log(`   File size: ${(kmlText.length / 1024 / 1024).toFixed(1)} MB`);

  console.log(`\n🔍 Parsing KML tracks...`);
  const tracks = parseKml(kmlText);
  console.log(`   Found ${tracks.length} track(s)`);

  if (tracks.length === 0) {
    console.error("❌ No GPS tracks found in KML file");
    process.exit(1);
  }

  const track = tracks.reduce((best, t) => t.points.length > best.points.length ? t : best);
  console.log(`   Using track: "${track.name}" with ${track.points.length} points`);
  console.log(`   Start: ${track.startTime?.toISOString()}`);
  console.log(`   End:   ${track.endTime?.toISOString()}`);
  console.log(`   Duration: ${Math.round(track.durationSec / 60)} min`);

  const prisma = new PrismaClient();

  console.log(`\n📊 Fetching engine flight #${ENGINE_FLIGHT_ID} readings...`);
  const readings = await prisma.engineMonitorReading.findMany({
    where: { flightId: ENGINE_FLIGHT_ID },
    orderBy: { elapsedSec: "asc" },
    select: { id: true, elapsedSec: true, timestamp: true, latitude: true, longitude: true },
  });

  if (readings.length === 0) {
    console.error(`❌ No readings found for engine flight #${ENGINE_FLIGHT_ID}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`   Total readings: ${readings.length}`);
  console.log(`   First: ${readings[0].timestamp.toISOString()}`);
  console.log(`   Last:  ${readings[readings.length - 1].timestamp.toISOString()}`);

  const existingGps = readings.filter(r => r.latitude !== null).length;
  console.log(`   Existing GPS: ${existingGps}`);

  const readingIntervalSec = readings.length > 1
    ? Math.round((readings[readings.length - 1].elapsedSec - readings[0].elapsedSec) / (readings.length - 1))
    : 1;
  console.log(`   Reading interval: ${readingIntervalSec}s`);

  // Match KML → readings
  console.log(`\n🔗 Matching KML GPS points to engine readings...`);
  const matches = matchKmlToReadings(
    track.points,
    readings.length,
    readingIntervalSec,
    readings[0].timestamp,
  );
  console.log(`   Matched: ${matches.length} / ${readings.length} readings (${Math.round(matches.length / readings.length * 100)}%)`);

  if (matches.length === 0) {
    console.error("❌ No matches found.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Build raw SQL UPDATE per batch using VALUES technique
  // MUCH faster than individual Prisma updates (1 query vs N queries per batch)
  console.log(`\n💾 Updating ${matches.length} readings with GPS data via raw SQL...`);
  
  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    
    // Build VALUES list: (id, latitude, longitude, gpsAlt, groundSpd)
    const values = batch.map(({ readingIndex, point }) => {
      const reading = readings[readingIndex];
      const lat = point.latitude;
      const lng = point.longitude;
      const alt = point.altitude !== null ? metersToFeet(point.altitude) : null;
      const spd = point.groundSpeed;
      return `(${reading.id}, ${lat}, ${lng}, ${alt ?? 'NULL'}, ${spd ?? 'NULL'})`;
    }).join(',\n');

    const sql = `
      UPDATE "EngineMonitorReading" AS r
      SET
        "latitude" = v.lat,
        "longitude" = v.lng,
        "gpsAlt" = v.alt,
        "groundSpd" = v.spd
      FROM (VALUES
        ${values}
      ) AS v(id, lat, lng, alt, spd)
      WHERE r.id = v.id;
    `;

    try {
      await prisma.$executeRawUnsafe(sql);
      updated += batch.length;
      const pct = Math.round(updated / matches.length * 100);
      process.stdout.write(`   ✓ ${updated}/${matches.length} (${pct}%)\r`);
    } catch (err: any) {
      console.error(`\n   ❌ Batch at ${i} failed: ${err.message}`);
      // Retry with smaller sub-batches
      const SUB = 100;
      for (let j = 0; j < batch.length; j += SUB) {
        const sub = batch.slice(j, j + SUB);
        const subValues = sub.map(({ readingIndex, point }) => {
          const reading = readings[readingIndex];
          const alt = point.altitude !== null ? metersToFeet(point.altitude) : null;
          return `(${reading.id}, ${point.latitude}, ${point.longitude}, ${alt ?? 'NULL'}, ${point.groundSpeed ?? 'NULL'})`;
        }).join(',\n');

        const subSql = `
          UPDATE "EngineMonitorReading" AS r
          SET "latitude" = v.lat, "longitude" = v.lng, "gpsAlt" = v.alt, "groundSpd" = v.spd
          FROM (VALUES ${subValues}) AS v(id, lat, lng, alt, spd)
          WHERE r.id = v.id;
        `;
        try {
          await prisma.$executeRawUnsafe(subSql);
          updated += sub.length;
        } catch (e2: any) {
          console.error(`   ❌ Sub-batch failed: ${e2.message}`);
        }
      }
      const pct = Math.round(updated / matches.length * 100);
      process.stdout.write(`   ✓ ${updated}/${matches.length} (${pct}%)\r`);
    }
  }

  console.log(`\n\n✅ Done! Updated ${updated} readings with GPS data.`);

  // Verify
  const verifyCount = await prisma.engineMonitorReading.count({
    where: {
      flightId: ENGINE_FLIGHT_ID,
      latitude: { not: null },
    },
  });
  console.log(`   Verification: ${verifyCount} / ${readings.length} readings now have GPS data.`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
