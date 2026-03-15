import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();

// Find flight around Feb 15, 2026 with >3 hours duration
for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const decoded = decodeJPI(Buffer.from(buf), file);
  for (const df of decoded) {
    if (df.durationSec < 900) continue;
    const d = df.flightDate;
    // Check Feb 2026 flights > 3 hours
    if (d.getFullYear() === 2026 && d.getMonth() === 1 && d.getDate() >= 14 && d.getDate() <= 16 && df.durationSec > 10800) {
      console.log(`\n=== Flight #${df.flightNumber} — ${d.toISOString().slice(0,10)} ===`);
      console.log(`File: ${file}`);
      console.log(`Duration: ${(df.durationSec/3600).toFixed(1)}h (${df.durationSec}s)`);
      console.log(`Total records: ${df.records.length}`);
      const gpsRecs = df.records.filter(r => r.latitude != null);
      console.log(`GPS records: ${gpsRecs.length}`);
      
      if (gpsRecs.length > 0) {
        // Show first 5 GPS points
        console.log('\nFirst 5 GPS points:');
        for (const r of gpsRecs.slice(0, 5)) {
          console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} alt=${r.gpsAltitude} spd=${r.groundSpeed}`);
        }
        
        // Show last 30 GPS points (where the artifact likely is)
        console.log('\nLast 30 GPS points:');
        const last30 = gpsRecs.slice(-30);
        for (const r of last30) {
          console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} alt=${r.gpsAltitude} spd=${r.groundSpeed}`);
        }
        
        // Check for all jumps > 3km
        console.log('\nAll jumps > 2km:');
        for (let i = 1; i < gpsRecs.length; i++) {
          const prev = gpsRecs[i-1];
          const curr = gpsRecs[i];
          const dLat = (curr.latitude! - prev.latitude!) * 111320;
          const dLng = (curr.longitude! - prev.longitude!) * 111320 * Math.cos(prev.latitude! * Math.PI / 180);
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          if (dist > 2000) {
            const timeDiff = curr.elapsedSec - prev.elapsedSec;
            console.log(`  t=${prev.elapsedSec}→${curr.elapsedSec}s (${timeDiff}s gap): ${(dist/1000).toFixed(1)}km  (${prev.latitude},${prev.longitude}) → (${curr.latitude},${curr.longitude})`);
          }
        }
      }
    }
  }
}
