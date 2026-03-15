import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');

// Test Flight #920 with the new init ground-speed filter
const buf = fs.readFileSync(path.join(dir, 'U260217.JPI'));
const decoded = decodeJPI(Buffer.from(buf), 'U260217.JPI');

for (const df of decoded) {
  if (df.flightNumber !== 920) continue;
  
  const gpsRecs = df.records.filter(r => r.latitude != null);
  const noGps = df.records.filter(r => r.latitude == null);
  
  console.log(`Flight #${df.flightNumber} — ${df.flightDate.toISOString().slice(0,10)}`);
  console.log(`Total records: ${df.records.length}`);
  console.log(`GPS records: ${gpsRecs.length} (${(gpsRecs.length/df.records.length*100).toFixed(1)}%)`);
  console.log(`No-GPS records: ${noGps.length}`);
  
  if (gpsRecs.length > 0) {
    console.log(`\nFirst GPS at t=${gpsRecs[0].elapsedSec}s`);
    console.log(`First 10 GPS points:`);
    for (const r of gpsRecs.slice(0, 10)) {
      console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} spd=${r.groundSpeed} alt=${r.gpsAltitude}`);
    }
    
    console.log(`\nLast 5 GPS points:`);
    for (const r of gpsRecs.slice(-5)) {
      console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} spd=${r.groundSpeed}`);
    }
    
    // Check for jumps > 3km
    let jumpCount = 0;
    for (let i = 1; i < gpsRecs.length; i++) {
      const prev = gpsRecs[i-1];
      const curr = gpsRecs[i];
      const dLat = (curr.latitude! - prev.latitude!) * 111320;
      const dLng = (curr.longitude! - prev.longitude!) * 111320 * Math.cos(prev.latitude! * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > 3000) {
        jumpCount++;
        if (jumpCount <= 5) {
          console.log(`  JUMP at t=${prev.elapsedSec}→${curr.elapsedSec}s: ${(dist/1000).toFixed(1)}km`);
        }
      }
    }
    console.log(`Total jumps > 3km: ${jumpCount}`);
  }
}

// Also test Flight #548 (the original problem flight)
console.log('\n\n--- Also checking Flight #548 ---');
for (const file of ['U240530.JPI']) {
  const buf2 = fs.readFileSync(path.join(dir, file));
  const decoded2 = decodeJPI(Buffer.from(buf2), file);
  for (const df of decoded2) {
    if (df.flightNumber !== 548) continue;
    const gpsRecs = df.records.filter(r => r.latitude != null);
    console.log(`Flight #${df.flightNumber}: ${gpsRecs.length} GPS records`);
    if (gpsRecs.length > 0) {
      console.log(`First GPS at t=${gpsRecs[0].elapsedSec}s: lat=${gpsRecs[0].latitude} lon=${gpsRecs[0].longitude} spd=${gpsRecs[0].groundSpeed}`);
    }
  }
}
