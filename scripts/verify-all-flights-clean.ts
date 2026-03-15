// Check if speed filter eliminates ALL artifacts across all flights
import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort().reverse();

interface GpsPoint { lat: number; lng: number; elapsed?: number; }

let totalFlights = 0;
let artifactFlights = 0;
const badFlights: string[] = [];

const seen = new Set<string>();

for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const decoded = decodeJPI(Buffer.from(buf), file);
  for (const df of decoded) {
    if (df.durationSec < 900) continue;
    const key = `${df.flightNumber}-${df.flightDate.toISOString().slice(0,10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    
    const points: GpsPoint[] = df.records
      .filter(r => r.latitude != null && r.longitude != null)
      .map(r => ({ lat: r.latitude!, lng: r.longitude!, elapsed: r.elapsedSec }));
    
    const validPoints = points.filter(p => p.lat >= -60 && p.lat <= 0 && p.lng >= -80 && p.lng <= -55);
    const dedupedPoints: GpsPoint[] = [];
    for (const p of validPoints) {
      const last = dedupedPoints[dedupedPoints.length - 1];
      if (!last || Math.abs(p.lat - last.lat) > 0.00001 || Math.abs(p.lng - last.lng) > 0.00001) {
        dedupedPoints.push(p);
      }
    }
    
    if (dedupedPoints.length < 5) continue;
    totalFlights++;
    
    // Apply init + speed filter
    let startIdx = 0;
    for (let i = 1; i < Math.min(dedupedPoints.length, 60); i++) {
      const prev = dedupedPoints[i - 1];
      const curr = dedupedPoints[i];
      const dLat = (curr.lat - prev.lat) * 111320;
      const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > 3000) startIdx = i;
    }
    
    const trimmed = dedupedPoints.slice(startIdx);
    const cleanPoints: GpsPoint[] = trimmed.length > 0 ? [trimmed[0]] : [];
    for (let i = 1; i < trimmed.length; i++) {
      const prev = cleanPoints[cleanPoints.length - 1];
      const curr = trimmed[i];
      const dLat = (curr.lat - prev.lat) * 111320;
      const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (prev.elapsed != null && curr.elapsed != null) {
        const td = curr.elapsed - prev.elapsed;
        if (td > 0) {
          if (dist / td <= 100) cleanPoints.push(curr);
          continue;
        }
      }
      if (dist < 3000) cleanPoints.push(curr);
    }
    
    // Check mid-flight point vs first point
    if (cleanPoints.length >= 10) {
      const midIdx = Math.floor(cleanPoints.length / 2);
      const first = cleanPoints[0];
      const mid = cleanPoints[midIdx];
      const dLat = (first.lat - mid.lat) * 111320;
      const dLng = (first.lng - mid.lng) * 111320 * Math.cos(mid.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > 5000) {
        artifactFlights++;
        badFlights.push(`Flight #${df.flightNumber} (${df.flightDate.toISOString().slice(0,10)}): first→mid = ${(dist/1000).toFixed(1)}km (${cleanPoints.length} pts)`);
      }
    }
  }
}

console.log(`Total GPS flights: ${totalFlights}`);
console.log(`Flights with potential artifact (first→mid > 5km): ${artifactFlights}`);
if (badFlights.length > 0) {
  console.log('\nPotentially bad flights:');
  for (const f of badFlights) console.log(`  ${f}`);
} else {
  console.log('\n✅ All flights clean!');
}
