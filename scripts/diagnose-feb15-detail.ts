import { decodeJPI } from '../lib/jpi-decoder.js';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'Engine Analisis');
const buf = fs.readFileSync(path.join(dir, 'U260217.JPI'));
const decoded = decodeJPI(Buffer.from(buf), 'U260217.JPI');

for (const df of decoded) {
  if (df.flightNumber !== 920) continue;
  
  const gps = df.records.filter(r => r.latitude != null);
  const noGps = df.records.filter(r => r.latitude == null);
  
  console.log('Total records:', df.records.length);
  console.log('GPS records:', gps.length, `(${(gps.length/df.records.length*100).toFixed(1)}%)`);
  console.log('No-GPS records:', noGps.length);
  
  // Analyze GPS coverage over time
  console.log('\nGPS coverage by time window (1000s buckets):');
  for (let start = 0; start < df.durationSec; start += 1000) {
    const end = start + 1000;
    const inBucket = df.records.filter(r => r.elapsedSec >= start && r.elapsedSec < end);
    const gpsInBucket = inBucket.filter(r => r.latitude != null);
    console.log(`  t=${start}-${end}s: ${gpsInBucket.length}/${inBucket.length} records have GPS`);
  }
  
  // Look at records around interval changes (t=899, where gap starts)
  console.log('\nRecords around t=850-920 (where GPS drops):');
  for (const r of df.records.filter(r => r.elapsedSec >= 850 && r.elapsedSec <= 920)) {
    console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} spd=${r.groundSpeed}`);
  }
  
  // Look at the big gap area t=11700-12900
  console.log('\nRecords around t=11780-11830 and 12850-12890 (big gap area):');
  for (const r of df.records.filter(r => (r.elapsedSec >= 11780 && r.elapsedSec <= 11830) || (r.elapsedSec >= 12850 && r.elapsedSec <= 12890))) {
    console.log(`  t=${r.elapsedSec}s lat=${r.latitude} lon=${r.longitude} spd=${r.groundSpeed}`);
  }
}
