/**
 * KML vs JPI Comparison — Rosetta Stone for GPS encoding
 * 
 * Reads the KML coordinates from SavvyAviation and compares them
 * to the JPI accumulator fields to find the correct encoding.
 * 
 * KML format: lon,lat,alt (one per line)
 * Flight: CC-AQI 2026-03-09 15:18 UTC
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');
const INIT_VALUE = 0xf0;

// 1. Parse KML coordinates
const kmlPath = path.join(JPI_DIR, 'CC-AQI 2026-03-09 151852.kml');
const kmlContent = fs.readFileSync(kmlPath, 'utf-8');
const coordRegex = /(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)/g;
const kmlCoords: Array<{ lon: number; lat: number; alt: number }> = [];
let match;
while ((match = coordRegex.exec(kmlContent)) !== null) {
  kmlCoords.push({
    lon: parseFloat(match[1]),
    lat: parseFloat(match[2]),
    alt: parseFloat(match[3])
  });
}

console.log(`KML: ${kmlCoords.length} coordinate points`);
console.log(`  First: lon=${kmlCoords[0].lon} lat=${kmlCoords[0].lat} alt=${kmlCoords[0].alt}`);
console.log(`  Last:  lon=${kmlCoords[kmlCoords.length-1].lon} lat=${kmlCoords[kmlCoords.length-1].lat} alt=${kmlCoords[kmlCoords.length-1].alt}`);

// Filter out the GPS glitch points (-82.085, -22.490) 
const validKml = kmlCoords.filter(c => c.lon > -80 && c.lon < -60 && c.lat > -40 && c.lat < -20);
console.log(`  Valid (Chile): ${validKml.length} points`);
console.log(`  Lat range: ${Math.min(...validKml.map(c=>c.lat)).toFixed(6)} to ${Math.max(...validKml.map(c=>c.lat)).toFixed(6)}`);
console.log(`  Lon range: ${Math.min(...validKml.map(c=>c.lon)).toFixed(6)} to ${Math.max(...validKml.map(c=>c.lon)).toFixed(6)}`);
console.log(`  Alt range: ${Math.min(...validKml.map(c=>c.alt)).toFixed(1)} to ${Math.max(...validKml.map(c=>c.alt)).toFixed(1)} m`);

// 2. Find the matching JPI flight (March 9 = probably most recent file, but may need another)
// Check all JPI files for a flight on March 9
function readByte(d: Buffer, p: { v: number }): number { if (p.v >= d.length) throw new Error('EOF'); return d[p.v++]; }
function readU16BE(d: Buffer, p: { v: number }): number { return (readByte(d, p) << 8) | readByte(d, p); }

function listFlightsInFile(filePath: string): Array<{ flightNum: number; date: string; latRaw: number; lonRaw: number; dataWords: number }> {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  let protocol = 2;
  const flightList: Array<{ flightNum: number; dataWords: number }> = [];
  
  while (pos.v < data.length) {
    const start = pos.v;
    while (pos.v < data.length) {
      if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) {
        const line = data.subarray(start, pos.v).toString('ascii');
        pos.v += 2;
        let clean = line; const si = clean.lastIndexOf('*'); if (si >= 0) clean = clean.substring(0, si);
        if (clean.startsWith('$P')) protocol = parseInt(clean.substring(3)) || 2;
        if (clean.startsWith('$D')) {
          const vals = clean.substring(3).split(',').map(v => v.trim());
          if (vals.length >= 2) flightList.push({ flightNum: parseInt(vals[0])||0, dataWords: parseInt(vals[1])||0 });
        }
        break;
      }
      pos.v++;
    }
    if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
  }

  const results: Array<{ flightNum: number; date: string; latRaw: number; lonRaw: number; dataWords: number }> = [];
  
  for (const fl of flightList) {
    try {
      if (protocol >= 2) {
        const words: number[] = [];
        for (let i = 0; i < 14; i++) words.push(readU16BE(data, pos));
        readByte(data, pos);
        
        let latRaw = (words[6] << 16) | words[7];
        let lonRaw = (words[8] << 16) | words[9];
        if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
        if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
        
        const dateRaw = words[12];
        const day = dateRaw & 0x1f;
        const month = (dateRaw >> 5) & 0x0f;
        let year = (dateRaw >> 9) & 0x7f;
        year = year < 75 ? year + 2000 : year + 1900;
        const timeRaw = words[13];
        const secs = (timeRaw & 0x1f) * 2;
        const mins = (timeRaw >> 5) & 0x3f;
        const hrs = (timeRaw >> 11) & 0x1f;
        
        results.push({
          flightNum: words[0],
          date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`,
          latRaw, lonRaw,
          dataWords: fl.dataWords
        });
        
        // Skip data records
        let count = 0;
        while (pos.v < data.length && count < 50000) {
          const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
          if (df1 !== df2) { pos.v -= 4; break; }
          const rep = readByte(data, pos);
          if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
          const ff2 = new Array(16).fill(0);
          for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
          for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) readByte(data, pos);
          for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (ff2[bi] & (1 << bit)) readByte(data, pos);
          readByte(data, pos);
          count++;
        }
      }
    } catch (e) {
      // skip
    }
  }
  
  return results;
}

// Find the March 9 flight
const files = fs.readdirSync(JPI_DIR).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();
console.log(`\nSearching ${files.length} JPI files for March 9 flight...`);

let targetFile = '';
let targetFlightIdx = 0;
let targetFlightNum = 0;

for (const file of files.slice(-5)) {
  const flights = listFlightsInFile(path.join(JPI_DIR, file));
  console.log(`\n${file}: ${flights.length} flights`);
  for (let i = 0; i < flights.length; i++) {
    const fl = flights[i];
    console.log(`  Flight #${fl.flightNum}: ${fl.date} GPS: ${(fl.latRaw/6000).toFixed(4)},${(fl.lonRaw/6000).toFixed(4)}`);
    if (fl.date.startsWith('2026-03-09') || fl.date.includes('2026-03-09')) {
      targetFile = path.join(JPI_DIR, file);
      targetFlightIdx = i;
      targetFlightNum = fl.flightNum;
    }
  }
}

// The KML says "2026-03-09 15:18 UTC" — header first coord is -71.146, -33.396
// This matches our header GPS for SCCV. The flight might be in the most recent file.
// If not found by date, use the file whose header GPS matches
if (!targetFile) {
  console.log(`\nNo March 9 flight found by date. The JPI file may not be downloaded yet.`);
  console.log(`Using most recent file instead for encoding analysis.`);
  targetFile = path.join(JPI_DIR, files[files.length - 1]);
  targetFlightIdx = 0;
}

console.log(`\n\nTarget: ${path.basename(targetFile)}, flight index ${targetFlightIdx}`);

// 3. Now parse that flight and collect ALL accumulator values for fields 80-87
// alongside the matching KML coordinate (by index)
function parseFlightFull(filePath: string, flightIdx: number) {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  let protocol = 2;
  const flightList: Array<{ flightNum: number; dataWords: number }> = [];
  while (pos.v < data.length) {
    const start = pos.v;
    while (pos.v < data.length) {
      if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) {
        const line = data.subarray(start, pos.v).toString('ascii');
        pos.v += 2;
        let clean = line; const si = clean.lastIndexOf('*'); if (si >= 0) clean = clean.substring(0, si);
        if (clean.startsWith('$P')) protocol = parseInt(clean.substring(3)) || 2;
        if (clean.startsWith('$D')) {
          const vals = clean.substring(3).split(',').map(v => v.trim());
          if (vals.length >= 2) flightList.push({ flightNum: parseInt(vals[0])||0, dataWords: parseInt(vals[1])||0 });
        }
        break;
      }
      pos.v++;
    }
    if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
  }

  // Skip to target flight
  for (let fi = 0; fi < flightIdx; fi++) {
    for (let i = 0; i < 14; i++) readU16BE(data, pos);
    readByte(data, pos);
    let count = 0;
    while (pos.v < data.length && count < 50000) {
      const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
      if (df1 !== df2) { pos.v -= 4; break; }
      const rep = readByte(data, pos);
      if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
      const ff2 = new Array(16).fill(0);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) readByte(data, pos);
      for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (ff2[bi] & (1 << bit)) readByte(data, pos);
      readByte(data, pos);
      count++;
    }
  }

  // Parse target flight header
  const words: number[] = [];
  for (let i = 0; i < 14; i++) words.push(readU16BE(data, pos));
  readByte(data, pos);
  
  let latRaw = (words[6] << 16) | words[7];
  let lonRaw = (words[8] << 16) | words[9];
  if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
  if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
  const interval = words[11] > 0 ? words[11] : 6;

  console.log(`Flight #${words[0]}, interval=${interval}s`);
  console.log(`Header GPS: lat=${(latRaw/6000).toFixed(6)} lon=${(lonRaw/6000).toFixed(6)}`);

  // Initialize accumulator
  const accum = new Array<number>(128);
  for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0; accum[30] = 0;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  let elapsed = 0;
  let ci = interval;
  let rc = 0;

  // Collect ALL records with their accumulator snapshots
  const records: Array<{
    idx: number; sec: number;
    f: number[];  // fields 80-95
  }> = [];

  while (pos.v < data.length && rc < 50000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    for (let r = 0; r < rep; r++) {
      records.push({ idx: rc, sec: elapsed, f: accum.slice(80, 96) });
      elapsed += ci; rc++;
    }

    const ff2 = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
    const sf = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) sf[i] = readByte(data, pos);
    const sb = new Array<number>(128).fill(0);
    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (sf[bi] & (1 << bit)) sb[bi * 8 + bit] = 1;
    sb[42] = sb[41]; for (let i = 0; i < 6; i++) sb[48 + i] = sb[i]; sb[79] = sb[78];
    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) {
      const fi = bi * 8 + bit;
      if (ff2[bi] & (1 << bit)) {
        const d = readByte(data, pos);
        if (d !== 0) accum[fi] = sb[fi] ? accum[fi] - d : accum[fi] + d;
      }
    }
    readByte(data, pos);
    if (accum[16] === 0x02) ci = 1; else if (accum[16] === 0x03) ci = interval;

    records.push({ idx: rc, sec: elapsed, f: accum.slice(80, 96) });
    elapsed += ci; rc++;
  }

  return { records, latRaw, lonRaw, interval };
}

const flight = parseFlightFull(targetFile, targetFlightIdx);
console.log(`\nJPI records: ${flight.records.length}`);
console.log(`KML valid points: ${validKml.length}`);

// 4. Compare! The KML has one point per JPI record (same count)
// Let's align them and test encoding hypotheses
const count = Math.min(flight.records.length, validKml.length);

// For each record, compute what each hypothesis would give and compare to KML
console.log(`\nAligning ${count} points. Testing all encoding hypotheses...\n`);

// We need to figure out which accumulator formula gives coordinates matching the KML
// KML coords are in format: lon, lat, alt

// Let's test a bunch of hypotheses for lat and lon separately
// For lat: find which field(s) + formula best match KML lat values
// For lon: find which field(s) + formula best match KML lon values

// Fields are indexed 0-15 (representing accum[80]-accum[95])
// f[0]=accum[80], f[1]=accum[81], f[2]=accum[82], f[3]=accum[83]
// f[4]=accum[84], f[5]=accum[85], f[6]=accum[86], f[7]=accum[87]

// Sample 20 evenly spaced points
const sampleIdxs: number[] = [];
for (let i = 0; i < 20; i++) sampleIdxs.push(Math.floor(i * count / 20));

console.log(`Sample comparison (every ~${Math.floor(count/20)} records):`);
console.log('rec# | KML lat      | KML lon      | f80-f87 values');
console.log('-'.repeat(100));

for (const si of sampleIdxs) {
  const rec = flight.records[si];
  const kml = validKml[si]; // Direct alignment
  if (!kml) continue;
  console.log(
    `${String(si).padStart(5)} | ${kml.lat.toFixed(6).padStart(12)} | ${kml.lon.toFixed(6).padStart(12)} | ` +
    `[${rec.f.slice(0,8).map(v => String(v).padStart(6)).join(',')}]`
  );
}

// Now let's compute the error for every single-field hypothesis
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`HYPOTHESIS TESTING — finding best field mapping for LAT:`);
console.log(`${'═'.repeat(70)}`);

type Hypothesis = {
  name: string;
  computeLat: (f: number[], latRaw: number, lonRaw: number) => number;
  computeLon: (f: number[], latRaw: number, lonRaw: number) => number;
};

const latHypotheses: Array<{ name: string; compute: (f: number[], raw: number) => number }> = [
  // Single field as offset / 6000
  { name: 'f83/6000+hdr', compute: (f, raw) => (raw + f[3]) / 6000 },
  { name: 'f85/6000+hdr', compute: (f, raw) => (raw + f[5]) / 6000 },
  { name: 'f86/6000+hdr', compute: (f, raw) => (raw + f[6]) / 6000 },
  { name: 'f87/6000+hdr', compute: (f, raw) => (raw + f[7]) / 6000 },
  // Single field as offset / 600
  { name: 'f83/600+hdr', compute: (f, raw) => (raw / 6000) + (f[3] / 600) },
  { name: 'f85/600+hdr', compute: (f, raw) => (raw / 6000) + (f[5] / 600) },
  // 2-byte combinations / 6000
  { name: '(f81+f83*256)/6000+hdr', compute: (f, raw) => { let v = f[1] + f[3]*256; return (raw + v) / 6000; } },
  { name: '(f83+f81*256)/6000+hdr', compute: (f, raw) => { let v = f[3] + f[1]*256; return (raw + v) / 6000; } },
  { name: '(f85+f87*256)/6000+hdr', compute: (f, raw) => { let v = f[5] + f[7]*256; return (raw + v) / 6000; } },
  { name: '(f87+f85*256)/6000+hdr', compute: (f, raw) => { let v = f[7] + f[5]*256; return (raw + v) / 6000; } },
  { name: '(f86+f87*256)/6000+hdr', compute: (f, raw) => { let v = f[6] + f[7]*256; return (raw + v) / 6000; } },
  // Direct value (not offset from header)
  { name: 'f83/6000 direct', compute: (f, raw) => f[3] / 6000 },
  { name: '(f83+f81*256)/6000 direct', compute: (f, raw) => (f[3] + f[1]*256) / 6000 },
];

const lonHypotheses = [...latHypotheses]; // Same set

// For each lat hypothesis, compute MAE against KML lat
console.log('\nLAT hypotheses (mean absolute error):');
for (const h of latHypotheses) {
  let totalErr = 0;
  let validCount = 0;
  for (const si of sampleIdxs) {
    const rec = flight.records[si];
    const kml = validKml[si];
    if (!kml) continue;
    const predicted = h.compute(rec.f, flight.latRaw);
    totalErr += Math.abs(predicted - kml.lat);
    validCount++;
  }
  const mae = totalErr / validCount;
  console.log(`  ${h.name.padEnd(35)} MAE=${mae.toFixed(6)}° ${mae < 0.01 ? '✓ GOOD' : mae < 0.1 ? '~ ok' : '✗'}`);
}

console.log('\nLON hypotheses (mean absolute error):');
for (const h of lonHypotheses) {
  let totalErr = 0;
  let validCount = 0;
  for (const si of sampleIdxs) {
    const rec = flight.records[si];
    const kml = validKml[si];
    if (!kml) continue;
    const predicted = h.compute(rec.f, flight.lonRaw);
    totalErr += Math.abs(predicted - kml.lon);
    validCount++;
  }
  const mae = totalErr / validCount;
  console.log(`  ${h.name.padEnd(35)} MAE=${mae.toFixed(6)}° ${mae < 0.01 ? '✓ GOOD' : mae < 0.1 ? '~ ok' : '✗'}`);
}

// 5. Brute-force search: try ALL possible 2-field combinations for lat, all for lon
console.log(`\n\n${'═'.repeat(70)}`);
console.log(`BRUTE FORCE: all 2-field combos (f[a] + f[b]*256) as lat/lon offset from header`);
console.log(`${'═'.repeat(70)}`);

for (const target of ['lat', 'lon'] as const) {
  const raw = target === 'lat' ? flight.latRaw : flight.lonRaw;
  
  console.log(`\n${target.toUpperCase()} best matches:`);
  
  const results: Array<{ name: string; mae: number }> = [];
  
  // Single field
  for (let a = 0; a < 16; a++) {
    let totalErr = 0;
    let vc = 0;
    for (const si of sampleIdxs) {
      const rec = flight.records[si];
      const kml = validKml[si];
      if (!kml) continue;
      const predicted = (raw + rec.f[a]) / 6000;
      const actual = target === 'lat' ? kml.lat : kml.lon;
      totalErr += Math.abs(predicted - actual);
      vc++;
    }
    results.push({ name: `f[${80+a}]/6000+hdr`, mae: totalErr / vc });
  }
  
  // Two-field combinations
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      if (a === b) continue;
      let totalErr = 0;
      let vc = 0;
      for (const si of sampleIdxs) {
        const rec = flight.records[si];
        const kml = validKml[si];
        if (!kml) continue;
        const val = rec.f[a] + rec.f[b] * 256;
        const predicted = (raw + val) / 6000;
        const actual = target === 'lat' ? kml.lat : kml.lon;
        totalErr += Math.abs(predicted - actual);
        vc++;
      }
      results.push({ name: `(f[${80+a}]+f[${80+b}]*256)/6000+hdr`, mae: totalErr / vc });
    }
  }
  
  // Sort by MAE
  results.sort((a, b) => a.mae - b.mae);
  for (const r of results.slice(0, 10)) {
    console.log(`  ${r.name.padEnd(45)} MAE=${r.mae.toFixed(6)}° ${r.mae < 0.01 ? '✓✓✓' : r.mae < 0.05 ? '✓' : ''}`);
  }
}
