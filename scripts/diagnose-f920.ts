import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const buf = fs.readFileSync(path.join(dir, 'U260217.JPI'));
const decoded = decodeJPI(Buffer.from(buf), 'U260217.JPI');

for (const df of decoded) {
  if (df.flightNumber !== 920) continue;
  console.log(`Flight #${df.flightNumber} — ${df.flightDate.toISOString().slice(0,10)}`);
  const gpsRecs = df.records.filter(r => r.latitude != null);
  console.log(`GPS records: ${gpsRecs.length} / ${df.records.length}`);
  console.log(`First GPS at t=${gpsRecs[0]?.elapsedSec}s`);
  
  // Show first 10 GPS points
  console.log('\nFirst 10 GPS points:');
  for (const r of gpsRecs.slice(0, 10)) {
    console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} spd=${r.groundSpeed}`);
  }
  
  // Check for jumps > 3km
  console.log('\nJumps > 3km:');
  let jumpCount = 0;
  for (let i = 1; i < gpsRecs.length; i++) {
    const prev = gpsRecs[i-1];
    const curr = gpsRecs[i];
    const dLat = (curr.latitude! - prev.latitude!) * 111320;
    const dLng = (curr.longitude! - prev.longitude!) * 111320 * Math.cos(prev.latitude! * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist > 3000) {
      jumpCount++;
      console.log(`  t=${prev.elapsedSec}→${curr.elapsedSec}s: ${(dist/1000).toFixed(1)}km spd=${curr.groundSpeed}`);
    }
  }
  if (jumpCount === 0) console.log('  ✅ None!');
}
