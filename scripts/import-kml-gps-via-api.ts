/**
 * Import GPS data from a KML file into EngineMonitorFlight via the production API
 * This uses the /api/engine-data/kml-gps endpoint to avoid DB connection timeouts.
 * 
 * Usage: npx tsx scripts/import-kml-gps-via-api.ts
 */
import { readFileSync } from "fs";

const API_BASE = "https://flight-log-system-production.up.railway.app";
const ENGINE_FLIGHT_ID = 1844; // flight number 963
const KML_FILE = "TrackLog_5E5D322C-7505-4C42-A680-99D8412DE095.kml";

async function main() {
  console.log(`📂 Reading KML file: ${KML_FILE}`);
  const kmlBuffer = readFileSync(KML_FILE);
  console.log(`   File size: ${(kmlBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  console.log(`\n📤 Uploading to ${API_BASE}/api/engine-data/kml-gps ...`);
  console.log(`   Engine Flight ID: ${ENGINE_FLIGHT_ID}`);

  const formData = new FormData();
  formData.append("file", new Blob([kmlBuffer], { type: "application/xml" }), KML_FILE);
  formData.append("engineFlightId", String(ENGINE_FLIGHT_ID));

  const res = await fetch(`${API_BASE}/api/engine-data/kml-gps`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (res.ok) {
    console.log(`\n✅ Success!`);
    console.log(`   KML points: ${data.kmlPointCount}`);
    console.log(`   Readings: ${data.readingCount}`);
    console.log(`   Matched: ${data.matchedCount}`);
    console.log(`   Updated: ${data.updatedCount}`);
    console.log(`   Track duration: ${data.trackDuration}`);
  } else {
    console.error(`\n❌ Error: ${data.error}`);
  }
}

main().catch(console.error);
