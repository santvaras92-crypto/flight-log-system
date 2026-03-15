// Simulate the FlightMap filter logic on Flight #920 data
import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const buf = fs.readFileSync(path.join(dir, 'U260217.JPI'));
const decoded = decodeJPI(Buffer.from(buf), 'U260217.JPI');

for (const df of decoded) {
  if (df.flightNumber !== 920) continue;
  
  // Replicate FlightMap filter logic
  interface GpsPoint { lat: number; lng: number; alt?: number; spd?: number; elapsed?: number; }
  
  const points: GpsPoint[] = df.records
    .filter(r => r.latitude != null && r.longitude != null)
    .map(r => ({ lat: r.latitude!, lng: r.longitude!, alt: r.gpsAltitude ?? undefined, spd: r.groundSpeed ?? undefined, elapsed: r.elapsedSec }));

  console.log(`Raw GPS points: ${points.length}`);

  // Valid filter
  const validPoints = points.filter(p => p.lat !== 0 && p.lng !== 0 && p.lat >= -60 && p.lat <= 0 && p.lng >= -80 && p.lng <= -55);
  console.log(`Valid points: ${validPoints.length}`);

  // Dedup
  const dedupedPoints: GpsPoint[] = [];
  for (const p of validPoints) {
    const last = dedupedPoints[dedupedPoints.length - 1];
    if (!last || Math.abs(p.lat - last.lat) > 0.00001 || Math.abs(p.lng - last.lng) > 0.00001) {
      dedupedPoints.push(p);
    }
  }
  console.log(`Deduped points: ${dedupedPoints.length}`);

  // Init artifact filter (first 60 points)
  let startIdx = 0;
  const MAX_INIT_WINDOW = 60;
  for (let i = 1; i < Math.min(dedupedPoints.length, MAX_INIT_WINDOW); i++) {
    const prev = dedupedPoints[i - 1];
    const curr = dedupedPoints[i];
    const dLat = (curr.lat - prev.lat) * 111320;
    const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist > 3000) {
      startIdx = i;
      console.log(`  Init trim: jumping to idx ${i} (${(dist/1000).toFixed(1)}km gap)`);
    }
  }

  // Speed-based mid-flight filter
  const MAX_SPEED_MS = 100;
  const trimmed = dedupedPoints.slice(startIdx);
  const cleanPoints: GpsPoint[] = trimmed.length > 0 ? [trimmed[0]] : [];
  let droppedCount = 0;
  const drops: string[] = [];
  
  for (let i = 1; i < trimmed.length; i++) {
    const prev = cleanPoints[cleanPoints.length - 1];
    const curr = trimmed[i];
    const dLat = (curr.lat - prev.lat) * 111320;
    const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    
    if (prev.elapsed != null && curr.elapsed != null) {
      const timeDiff = curr.elapsed - prev.elapsed;
      if (timeDiff > 0) {
        const speed = dist / timeDiff;
        if (speed <= MAX_SPEED_MS) {
          cleanPoints.push(curr);
        } else {
          droppedCount++;
          if (drops.length < 20) {
            drops.push(`  t=${prev.elapsed}→${curr.elapsed}s: ${(dist/1000).toFixed(1)}km in ${timeDiff}s = ${speed.toFixed(0)}m/s (${(speed*1.944).toFixed(0)}kts)`);
          }
        }
        continue;
      }
    }
    if (dist < 3000) {
      cleanPoints.push(curr);
    } else {
      droppedCount++;
    }
  }
  
  console.log(`Clean points: ${cleanPoints.length}`);
  console.log(`Dropped by speed filter: ${droppedCount}`);
  console.log('Dropped points (first 20):');
  for (const d of drops) console.log(d);
  
  // Show first and last clean points
  console.log('\nFirst 5 clean points:');
  for (const p of cleanPoints.slice(0, 5)) {
    console.log(`  t=${p.elapsed}s lat=${p.lat} lng=${p.lng} spd=${p.spd}`);
  }
  console.log('\nLast 5 clean points:');
  for (const p of cleanPoints.slice(-5)) {
    console.log(`  t=${p.elapsed}s lat=${p.lat} lng=${p.lng} spd=${p.spd}`);
  }
  
  // Check for remaining jumps > 5km
  console.log('\nRemaining jumps > 5km in clean points:');
  for (let i = 1; i < cleanPoints.length; i++) {
    const prev = cleanPoints[i-1];
    const curr = cleanPoints[i];
    const dLat = (curr.lat - prev.lat) * 111320;
    const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist > 5000) {
      const timeDiff = (curr.elapsed || 0) - (prev.elapsed || 0);
      console.log(`  t=${prev.elapsed}→${curr.elapsed}s: ${(dist/1000).toFixed(1)}km in ${timeDiff}s = ${(dist/timeDiff).toFixed(0)}m/s`);
    }
  }
}
