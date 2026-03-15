import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

// We need to look at the RAW accumulator values for field 81 (ground speed)
// to understand the convergence pattern.
// Let's check multiple flights to see when ground speed truly stabilizes at 0.

const dir = path.join(process.cwd(), 'Engine Analisis');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort().reverse();

// Check flight 920 — all records for the first 300 seconds
const buf = fs.readFileSync(path.join(dir, 'U260217.JPI'));
const decoded = decodeJPI(Buffer.from(buf), 'U260217.JPI');
for (const df of decoded) {
  if (df.flightNumber !== 920) continue;
  console.log(`Flight #${df.flightNumber} — ${df.flightDate.toISOString().slice(0,10)}`);
  console.log(`Duration: ${(df.durationSec/3600).toFixed(1)}h`);
  
  // Check: how many records until ground speed is NOT null?
  let firstSpd = -1;
  let firstSpdZero = -1;
  let firstSpdNonZero = -1;
  let firstLat = -1;
  
  for (const r of df.records) {
    if (firstLat === -1 && r.latitude != null) firstLat = r.elapsedSec;
    if (firstSpd === -1 && r.groundSpeed != null) firstSpd = r.elapsedSec;
    if (firstSpdZero === -1 && r.groundSpeed === 0) firstSpdZero = r.elapsedSec;
    if (firstSpdNonZero === -1 && r.groundSpeed != null && r.groundSpeed > 0) firstSpdNonZero = r.elapsedSec;
  }
  
  console.log(`First GPS record: t=${firstLat}s`);
  console.log(`First ground speed (any): t=${firstSpd}s`);
  console.log(`First ground speed = 0: t=${firstSpdZero}s`);
  console.log(`First ground speed > 0: t=${firstSpdNonZero}s`);
  
  // Show transition from ground (spd≈0) to flight
  // Find where ground speed changes from low to high
  const gpsRecs = df.records.filter(r => r.groundSpeed != null);
  console.log('\nGround speed progression (first 40 GPS-speed records):');
  for (const r of gpsRecs.slice(0, 40)) {
    console.log(`  t=${r.elapsedSec}s spd=${r.groundSpeed} lat=${r.latitude} lon=${r.longitude}`);
  }
  
  // Also check the transition to flight
  console.log('\nLooking for takeoff (speed transition from <10 to >30 kts):');
  for (let i = 1; i < gpsRecs.length; i++) {
    const prev = gpsRecs[i-1];
    const curr = gpsRecs[i];
    if (prev.groundSpeed! <= 10 && curr.groundSpeed! > 30) {
      console.log(`  TAKEOFF at t=${curr.elapsedSec}s: spd ${prev.groundSpeed} → ${curr.groundSpeed} kts`);
      // Show 5 records around this
      for (let j = Math.max(0, i-3); j < Math.min(gpsRecs.length, i+5); j++) {
        const r = gpsRecs[j];
        console.log(`    t=${r.elapsedSec}s spd=${r.groundSpeed} lat=${r.latitude} lon=${r.longitude}`);
      }
      break;
    }
  }
}

// Now check several other flights
console.log('\n\n=== Checking ground speed init pattern across multiple flights ===\n');
let checked = 0;
for (const file of files) {
  if (checked >= 20) break;
  const buf2 = fs.readFileSync(path.join(dir, file));
  const decoded2 = decodeJPI(Buffer.from(buf2), file);
  for (const df of decoded2) {
    if (df.durationSec < 900) continue;
    if (checked >= 20) break;
    
    const gpsRecs = df.records.filter(r => r.groundSpeed != null);
    if (gpsRecs.length === 0) continue;
    
    const firstSpd = gpsRecs[0].groundSpeed;
    const firstLat = gpsRecs[0].latitude;
    const firstElapsed = gpsRecs[0].elapsedSec;
    
    // Check if first speed is 0 or not
    if (firstSpd !== null && firstSpd > 5) {
      console.log(`Flight #${df.flightNumber} (${df.flightDate.toISOString().slice(0,10)}): first GPS at t=${firstElapsed}s, spd=${firstSpd} lat=${firstLat}`);
      checked++;
    }
  }
}
