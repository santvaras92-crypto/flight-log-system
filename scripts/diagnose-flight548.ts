import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();

for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const decoded = decodeJPI(Buffer.from(buf), file);
  for (const df of decoded) {
    if (df.flightNumber === 548) {
      console.log('Found flight 548 in', file);
      console.log('Date:', df.flightDate);
      console.log('Duration:', df.durationSec, 'sec');
      console.log('Total records:', df.records.length);
      const gpsRecs = df.records.filter(r => r.latitude != null);
      console.log('GPS records:', gpsRecs.length, '/', df.records.length);
      if (gpsRecs.length > 0) {
        console.log('First GPS at elapsed:', gpsRecs[0].elapsedSec, 'sec');
        // Show first 15 GPS points
        for (const r of gpsRecs.slice(0, 15)) {
          console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} alt=${r.gpsAltitude} spd=${r.groundSpeed}`);
        }
        // Check for big jumps
        console.log('\nChecking for jumps > 3km:');
        for (let i = 1; i < gpsRecs.length; i++) {
          const prev = gpsRecs[i-1];
          const curr = gpsRecs[i];
          const dLat = (curr.latitude! - prev.latitude!) * 111320;
          const dLng = (curr.longitude! - prev.longitude!) * 111320 * Math.cos(prev.latitude! * Math.PI / 180);
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          if (dist > 3000) {
            console.log(`  JUMP at t=${curr.elapsedSec}s: ${(dist/1000).toFixed(1)}km from (${prev.latitude},${prev.longitude}) to (${curr.latitude},${curr.longitude})`);
          }
        }
      }
      console.log('\nFirst 30 records (all):');
      for (const r of df.records.slice(0, 30)) {
        console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude}`);
      }
    }
  }
}
