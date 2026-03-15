import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

// Temporarily patch to see raw accumulator convergence
// Just count total flights and check GPS coverage stats
const dir = path.join(process.cwd(), 'Engine Analisis');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();

let totalFlights = 0;
let gpsFlights = 0;
let noGpsFlights = 0;
const noGpsList: string[] = [];

for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const decoded = decodeJPI(Buffer.from(buf), file);
  for (const df of decoded) {
    if (df.durationSec < 900) continue;
    totalFlights++;
    const gpsRecs = df.records.filter(r => r.latitude != null);
    if (gpsRecs.length > 0) {
      gpsFlights++;
      
      // Check for init artifacts: are first GPS points far from the main cluster?
      if (gpsRecs.length > 20) {
        const midIdx = Math.floor(gpsRecs.length / 2);
        const midLat = gpsRecs[midIdx].latitude!;
        const midLon = gpsRecs[midIdx].longitude!;
        const firstLat = gpsRecs[0].latitude!;
        const firstLon = gpsRecs[0].longitude!;
        const dLat = (firstLat - midLat) * 111320;
        const dLng = (firstLon - midLon) * 111320 * Math.cos(midLat * Math.PI / 180);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist > 3000) {
          console.log(`  ARTIFACT: Flight #${df.flightNumber} (${df.flightDate.toISOString().slice(0,10)}) — first GPS ${(dist/1000).toFixed(1)}km from mid-flight. First: (${firstLat},${firstLon}) Mid: (${midLat},${midLon})`);
        }
      }
    } else {
      noGpsFlights++;
      noGpsList.push(`Flight #${df.flightNumber} — ${df.flightDate.toISOString().slice(0,10)} (${file})`);
    }
  }
}

console.log(`\nTotal flights (>15min): ${totalFlights}`);
console.log(`GPS flights: ${gpsFlights}`);
console.log(`No-GPS flights: ${noGpsFlights}`);
console.log(`\nFlights without GPS:`);
for (const f of noGpsList) {
  console.log(`  ${f}`);
}
