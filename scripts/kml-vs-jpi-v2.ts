/**
 * KML vs JPI Comparison V2 — Rosetta Stone for GPS encoding
 * 
 * Uses the March 1 KML (matching flight #937 in U260301.JPI)
 * to crack the per-record GPS encoding in the JPI binary format.
 * 
 * KML: "CC-AQI 2026-03-01 133620.kml" — same flight as JPI flight #937
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');
const INIT_VALUE = 0xF0; // 240

// ═══════════════════════════════════════════════════════════════
// 1. PARSE KML
// ═══════════════════════════════════════════════════════════════
const kmlPath = path.join(JPI_DIR, 'CC-AQI 2026-03-01 133620.kml');
const kmlContent = fs.readFileSync(kmlPath, 'utf-8');
const coordRegex = /(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)/g;
const allKml: Array<{ lon: number; lat: number; alt: number }> = [];
let match;
while ((match = coordRegex.exec(kmlContent)) !== null) {
  allKml.push({ lon: parseFloat(match[1]), lat: parseFloat(match[2]), alt: parseFloat(match[3]) });
}

// Filter GPS glitches (startup noise far from Chile)
const validKml = allKml.filter(c => c.lon > -72 && c.lon < -70 && c.lat > -34 && c.lat < -33);
console.log(`KML: ${allKml.length} total, ${validKml.length} valid (Chile)`);
console.log(`  First valid: lon=${validKml[0].lon.toFixed(6)} lat=${validKml[0].lat.toFixed(6)} alt=${validKml[0].alt.toFixed(1)}`);
console.log(`  Last valid:  lon=${validKml[validKml.length-1].lon.toFixed(6)} lat=${validKml[validKml.length-1].lat.toFixed(6)}`);
console.log(`  Lat range: ${Math.min(...validKml.map(c=>c.lat)).toFixed(6)} to ${Math.max(...validKml.map(c=>c.lat)).toFixed(6)}`);
console.log(`  Lon range: ${Math.min(...validKml.map(c=>c.lon)).toFixed(6)} to ${Math.max(...validKml.map(c=>c.lon)).toFixed(6)}`);

// ═══════════════════════════════════════════════════════════════
// 2. PARSE JPI — full accumulator decode for flight #937
// ═══════════════════════════════════════════════════════════════
function readByte(d: Buffer, p: { v: number }): number { if (p.v >= d.length) throw new Error('EOF'); return d[p.v++]; }
function readU16BE(d: Buffer, p: { v: number }): number { return (readByte(d, p) << 8) | readByte(d, p); }

function parseJpiFlight(filePath: string, targetFlightIdx: number) {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  // Parse text header lines
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

  console.log(`\nJPI file: ${path.basename(filePath)}, protocol=${protocol}`);
  console.log(`Flights in file: ${flightList.length}`);

  // Skip to the target flight
  for (let fi = 0; fi < targetFlightIdx; fi++) {
    const words: number[] = [];
    for (let i = 0; i < 14; i++) words.push(readU16BE(data, pos));
    readByte(data, pos); // checksum
    let count = 0;
    while (pos.v < data.length && count < 100000) {
      const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
      if (df1 !== df2) { pos.v -= 4; break; }
      const rep = readByte(data, pos);
      if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
      const ff2 = new Array(16).fill(0);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) readByte(data, pos);
      for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (ff2[bi] & (1 << bit)) readByte(data, pos);
      readByte(data, pos); // checksum
      count++;
    }
  }

  // Parse target flight header
  const hdrWords: number[] = [];
  for (let i = 0; i < 14; i++) hdrWords.push(readU16BE(data, pos));
  readByte(data, pos); // checksum

  let latRaw = (hdrWords[6] << 16) | hdrWords[7];
  let lonRaw = (hdrWords[8] << 16) | hdrWords[9];
  if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
  if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
  const interval = hdrWords[11] > 0 ? hdrWords[11] : 6;

  const dateRaw = hdrWords[12];
  const day = dateRaw & 0x1f;
  const month = (dateRaw >> 5) & 0x0f;
  let year = (dateRaw >> 9) & 0x7f;
  year = year < 75 ? year + 2000 : year + 1900;
  const timeRaw = hdrWords[13];
  const secs = (timeRaw & 0x1f) * 2;
  const mins = (timeRaw >> 5) & 0x3f;
  const hrs = (timeRaw >> 11) & 0x1f;

  console.log(`Flight #${hdrWords[0]}: ${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')} UTC`);
  console.log(`Header GPS: lat=${(latRaw/6000).toFixed(6)} lon=${(lonRaw/6000).toFixed(6)}`);
  console.log(`Interval: ${interval}s, dataWords: ${hdrWords[10]}`);

  // Initialize accumulator
  const accum = new Int16Array(128);
  for (let i = 0; i < 48; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0; accum[30] = 0;
  for (let i = 56; i < 64; i++) accum[i] = INIT_VALUE;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  // Parse all data records
  let elapsed = 0;
  let ci = interval;
  let rc = 0;

  // Store snapshots of ALL 128 accum fields per record
  const records: Array<{
    idx: number;
    sec: number;
    accum: number[];  // full snapshot of all 128 fields
    decodeFlags: number;
  }> = [];

  while (pos.v < data.length && rc < 100000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    // Emit repeat records BEFORE applying deltas
    for (let r = 0; r < rep; r++) {
      records.push({ idx: rc, sec: elapsed, accum: Array.from(accum), decodeFlags: df1 });
      elapsed += ci; rc++;
    }

    // Read field flags
    const ff2 = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);

    // Read sign flags
    const sf = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) {
      if (i !== 6 && i !== 7) sf[i] = readByte(data, pos);
    }

    // Expand sign bits
    const sb = new Array<number>(128).fill(0);
    for (let bi = 0; bi < 16; bi++) {
      for (let bit = 0; bit < 8; bit++) {
        if (sf[bi] & (1 << bit)) sb[bi * 8 + bit] = 1;
      }
    }
    // Propagations
    sb[42] = sb[41];
    for (let i = 0; i < 6; i++) sb[48 + i] = sb[i];
    sb[79] = sb[78];

    // Apply deltas
    for (let bi = 0; bi < 16; bi++) {
      for (let bit = 0; bit < 8; bit++) {
        const fi = bi * 8 + bit;
        if (ff2[bi] & (1 << bit)) {
          const d = readByte(data, pos);
          if (d !== 0) {
            accum[fi] = sb[fi] ? accum[fi] - d : accum[fi] + d;
          }
        }
      }
    }

    readByte(data, pos); // checksum

    // Check for interval change
    if (accum[16] === 0x02) ci = 1;
    else if (accum[16] === 0x03) ci = interval;

    // Emit post-delta record
    records.push({ idx: rc, sec: elapsed, accum: Array.from(accum), decodeFlags: df1 });
    elapsed += ci; rc++;
  }

  return { records, latRaw, lonRaw, interval, flightNum: hdrWords[0] };
}

// Flight #937 is index 0 in U260301.JPI
const jpiFile = path.join(JPI_DIR, 'U260301.JPI');
const flight = parseJpiFlight(jpiFile, 0);
console.log(`Total JPI records: ${flight.records.length}`);

// ═══════════════════════════════════════════════════════════════
// 3. ALIGNMENT — figure out how KML points map to JPI records
// ═══════════════════════════════════════════════════════════════
// KML has 1 point per second (SavvyAviation standard), JPI has 1 or 6 sec interval
// KML points may include pre-engine start/post-shutdown periods
// JPI records: 5189 records at 1s = 86.5 min
// KML: ~5104 valid points at 1s = 85 min
// These are very close! Try 1:1 alignment first.

console.log(`\n${'═'.repeat(70)}`);
console.log('ALIGNMENT ANALYSIS');
console.log(`${'═'.repeat(70)}`);
console.log(`JPI records: ${flight.records.length} (interval: ${flight.interval}s)`);
console.log(`KML valid points: ${validKml.length}`);
console.log(`JPI duration: ${flight.records[flight.records.length-1].sec}s = ${(flight.records[flight.records.length-1].sec/60).toFixed(1)} min`);
console.log(`KML estimated duration: ${validKml.length}s = ${(validKml.length/60).toFixed(1)} min`);

// The ratio should tell us if 1:1 alignment works
const ratio = flight.records.length / validKml.length;
console.log(`Ratio JPI/KML: ${ratio.toFixed(3)}`);

// ═══════════════════════════════════════════════════════════════
// 4. DUMP RAW FIELD VALUES for first 200 records
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('RAW FIELD DUMP — fields 64-95 for first 100 non-repeating records');
console.log(`${'═'.repeat(70)}`);

// Find records where fields actually change
let lastAccum83 = -9999;
let changeCount = 0;
console.log('rec# | sec  | f64-71                           | f80-87                           | f83_d   | f85_d   | f86_d   | f87_d');
console.log('-'.repeat(140));

for (let i = 0; i < Math.min(flight.records.length, 300); i++) {
  const rec = flight.records[i];
  const f83 = rec.accum[83];
  if (f83 !== lastAccum83 || i < 10 || i % 50 === 0) {
    const f64_71 = rec.accum.slice(64, 72).map(v => String(v).padStart(4)).join(',');
    const f80_87 = rec.accum.slice(80, 88).map(v => String(v).padStart(4)).join(',');
    // deltas from initial
    const d83 = rec.accum[83];
    const d85 = rec.accum[85];
    const d86 = rec.accum[86] + 100; // initial was -100
    const d87 = rec.accum[87] + 100;
    console.log(
      `${String(i).padStart(5)} | ${String(rec.sec).padStart(5)} | ${f64_71} | ${f80_87} | ${String(d83).padStart(7)} | ${String(d85).padStart(7)} | ${String(d86).padStart(7)} | ${String(d87).padStart(7)}`
    );
    lastAccum83 = f83;
    changeCount++;
    if (changeCount > 80) break;
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. CORRELATION ANALYSIS — for each field, compute correlation 
//    with KML lat and KML lon across ALL records
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('CORRELATION ANALYSIS — Pearson r between each accum field and KML lat/lon');
console.log(`${'═'.repeat(70)}`);

function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i]*x[i]; syy += y[i]*y[i];
    sxy += x[i]*y[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n*sxx - sx*sx) * (n*syy - sy*sy));
  return den === 0 ? 0 : num / den;
}

// Use 1:1 alignment (since ratio ≈ 1.0)
const alignCount = Math.min(flight.records.length, validKml.length);
const kmlLats = validKml.slice(0, alignCount).map(c => c.lat);
const kmlLons = validKml.slice(0, alignCount).map(c => c.lon);
const kmlAlts = validKml.slice(0, alignCount).map(c => c.alt);

console.log(`\nUsing ${alignCount} aligned points (1:1 mapping)\n`);

// Test fields 64-95
console.log('Field | Corr w/ LAT  | Corr w/ LON  | Corr w/ ALT  | Range          | Note');
console.log('-'.repeat(100));

for (let fi = 64; fi < 96; fi++) {
  const vals = flight.records.slice(0, alignCount).map(r => r.accum[fi]);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV;
  
  if (range === 0) {
    console.log(`f${fi.toString().padStart(3)}  | ${'n/a'.padStart(12)} | ${'n/a'.padStart(12)} | ${'n/a'.padStart(12)} | ${String(minV).padStart(6)}→${String(maxV).padStart(6)} | CONSTANT`);
    continue;
  }
  
  const rLat = pearsonR(vals, kmlLats);
  const rLon = pearsonR(vals, kmlLons);
  const rAlt = pearsonR(vals, kmlAlts);
  
  let note = '';
  if (Math.abs(rLat) > 0.7) note += ' LAT!';
  if (Math.abs(rLon) > 0.7) note += ' LON!';
  if (Math.abs(rAlt) > 0.7) note += ' ALT!';
  if (Math.abs(rLat) > 0.9 || Math.abs(rLon) > 0.9 || Math.abs(rAlt) > 0.9) note += ' ★★★';
  
  console.log(
    `f${fi.toString().padStart(3)}  | ${rLat.toFixed(6).padStart(12)} | ${rLon.toFixed(6).padStart(12)} | ${rAlt.toFixed(6).padStart(12)} | ${String(minV).padStart(6)}→${String(maxV).padStart(6)} | ${note}`
  );
}

// ═══════════════════════════════════════════════════════════════
// 6. MULTI-FIELD COMBOS — test combinations of highly correlated fields
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('MULTI-FIELD COMBO CORRELATION — testing (a + b*256) combos');
console.log(`${'═'.repeat(70)}`);

const activeFields = [81, 82, 83, 85, 86, 87]; // fields with nonzero range

type ComboResult = { name: string; rLat: number; rLon: number; rAlt: number };
const comboResults: ComboResult[] = [];

// Single fields
for (const a of activeFields) {
  const vals = flight.records.slice(0, alignCount).map(r => r.accum[a]);
  comboResults.push({
    name: `f${a}`,
    rLat: pearsonR(vals, kmlLats),
    rLon: pearsonR(vals, kmlLons),
    rAlt: pearsonR(vals, kmlAlts),
  });
}

// a + b*256
for (const a of activeFields) {
  for (const b of activeFields) {
    if (a === b) continue;
    const vals = flight.records.slice(0, alignCount).map(r => r.accum[a] + r.accum[b] * 256);
    comboResults.push({
      name: `f${a}+f${b}*256`,
      rLat: pearsonR(vals, kmlLats),
      rLon: pearsonR(vals, kmlLons),
      rAlt: pearsonR(vals, kmlAlts),
    });
  }
}

// a*256 + b
for (const a of activeFields) {
  for (const b of activeFields) {
    if (a === b) continue;
    const vals = flight.records.slice(0, alignCount).map(r => r.accum[a] * 256 + r.accum[b]);
    const already = comboResults.find(c => c.name === `f${b}+f${a}*256`);
    if (!already) {
      comboResults.push({
        name: `f${a}*256+f${b}`,
        rLat: pearsonR(vals, kmlLats),
        rLon: pearsonR(vals, kmlLons),
        rAlt: pearsonR(vals, kmlAlts),
      });
    }
  }
}

// Also try 4-byte combos for lat/lon (like header uses)
// (f[a]<<24 + f[b]<<16 + f[c]<<8 + f[d]) / 6000
for (const a of [83, 85]) {
  for (const b of [86, 87]) {
    const vals = flight.records.slice(0, alignCount).map(r => {
      return (r.accum[a] << 8) | (r.accum[b] & 0xFF);
    });
    comboResults.push({
      name: `(f${a}<<8)|f${b}`,
      rLat: pearsonR(vals, kmlLats),
      rLon: pearsonR(vals, kmlLons),
      rAlt: pearsonR(vals, kmlAlts),
    });
  }
}

// Sort by best absolute correlation with lat
console.log('\nBest LAT correlations:');
const byLat = [...comboResults].sort((a, b) => Math.abs(b.rLat) - Math.abs(a.rLat));
for (const r of byLat.slice(0, 15)) {
  console.log(`  ${r.name.padEnd(25)} rLat=${r.rLat.toFixed(6).padStart(10)} rLon=${r.rLon.toFixed(6).padStart(10)} rAlt=${r.rAlt.toFixed(6).padStart(10)}`);
}

console.log('\nBest LON correlations:');
const byLon = [...comboResults].sort((a, b) => Math.abs(b.rLon) - Math.abs(a.rLon));
for (const r of byLon.slice(0, 15)) {
  console.log(`  ${r.name.padEnd(25)} rLat=${r.rLat.toFixed(6).padStart(10)} rLon=${r.rLon.toFixed(6).padStart(10)} rAlt=${r.rAlt.toFixed(6).padStart(10)}`);
}

console.log('\nBest ALT correlations:');
const byAlt = [...comboResults].sort((a, b) => Math.abs(b.rAlt) - Math.abs(a.rAlt));
for (const r of byAlt.slice(0, 15)) {
  console.log(`  ${r.name.padEnd(25)} rLat=${r.rLat.toFixed(6).padStart(10)} rLon=${r.rLon.toFixed(6).padStart(10)} rAlt=${r.rAlt.toFixed(6).padStart(10)}`);
}

// ═══════════════════════════════════════════════════════════════
// 7. ACTUAL POSITION CALCULATION — for the best candidates
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('POSITION TESTING — header + offset/divisor for best candidates');
console.log(`${'═'.repeat(70)}`);

// For the top lat/lon candidates, actually compute positions and MAE
const hdrLat = flight.latRaw / 6000;
const hdrLon = flight.lonRaw / 6000;

const candidates = [
  // Single fields with various divisors
  ...activeFields.flatMap(f => [
    { name: `lat=hdr+f${f}/6000`, latFn: (r: number[]) => hdrLat + r[f]/6000, lonFn: null },
    { name: `lon=hdr+f${f}/6000`, latFn: null, lonFn: (r: number[]) => hdrLon + r[f]/6000 },
    { name: `lat=hdr+f${f}/600`, latFn: (r: number[]) => hdrLat + r[f]/600, lonFn: null },
    { name: `lon=hdr+f${f}/600`, latFn: null, lonFn: (r: number[]) => hdrLon + r[f]/600 },
    { name: `lat=hdr+f${f}/60`, latFn: (r: number[]) => hdrLat + r[f]/60, lonFn: null },
    { name: `lon=hdr+f${f}/60`, latFn: null, lonFn: (r: number[]) => hdrLon + r[f]/60 },
    { name: `lat=hdr+f${f}/60000`, latFn: (r: number[]) => hdrLat + r[f]/60000, lonFn: null },
    { name: `lon=hdr+f${f}/60000`, latFn: null, lonFn: (r: number[]) => hdrLon + r[f]/60000 },
  ]),
  // 2-field combos
  ...activeFields.flatMap(a => activeFields.filter(b => b !== a).flatMap(b => [
    { name: `lat=hdr+(f${a}+f${b}*256)/6000`, latFn: (r: number[]) => hdrLat + (r[a]+r[b]*256)/6000, lonFn: null },
    { name: `lon=hdr+(f${a}+f${b}*256)/6000`, latFn: null, lonFn: (r: number[]) => hdrLon + (r[a]+r[b]*256)/6000 },
  ])),
  // Direct raw / 6000 (not offset from header)
  ...activeFields.flatMap(f => [
    { name: `lat=f${f}/6000 direct`, latFn: (r: number[]) => r[f]/6000, lonFn: null },
    { name: `lon=f${f}/6000 direct`, latFn: null, lonFn: (r: number[]) => r[f]/6000 },
  ]),
  // Header raw + field (no division — field IS the offset in 6000ths)
  ...activeFields.flatMap(f => [
    { name: `lat=(hdrRaw+f${f})/6000`, latFn: (r: number[]) => (flight.latRaw + r[f])/6000, lonFn: null },
    { name: `lon=(hdrRaw+f${f})/6000`, latFn: null, lonFn: (r: number[]) => (flight.lonRaw + r[f])/6000 },
  ]),
];

// Test every 10th point for speed  
const testIndices: number[] = [];
for (let i = 0; i < alignCount; i += 10) testIndices.push(i);

type PositionResult = { name: string; mae: number; minErr: number; maxErr: number };

const latResults: PositionResult[] = [];
const lonResults: PositionResult[] = [];

for (const c of candidates) {
  if (c.latFn) {
    let totalErr = 0, minErr = Infinity, maxErr = -Infinity;
    for (const i of testIndices) {
      const predicted = c.latFn(flight.records[i].accum);
      const err = Math.abs(predicted - validKml[i].lat);
      totalErr += err;
      minErr = Math.min(minErr, err);
      maxErr = Math.max(maxErr, err);
    }
    latResults.push({ name: c.name, mae: totalErr / testIndices.length, minErr, maxErr });
  }
  if (c.lonFn) {
    let totalErr = 0, minErr = Infinity, maxErr = -Infinity;
    for (const i of testIndices) {
      const predicted = c.lonFn(flight.records[i].accum);
      const err = Math.abs(predicted - validKml[i].lon);
      totalErr += err;
      minErr = Math.min(minErr, err);
      maxErr = Math.max(maxErr, err);
    }
    lonResults.push({ name: c.name, mae: totalErr / testIndices.length, minErr, maxErr });
  }
}

latResults.sort((a, b) => a.mae - b.mae);
lonResults.sort((a, b) => a.mae - b.mae);

console.log('\nBest LAT formulas (by MAE):');
for (const r of latResults.slice(0, 20)) {
  console.log(`  ${r.name.padEnd(40)} MAE=${r.mae.toFixed(6)}° minErr=${r.minErr.toFixed(6)}° maxErr=${r.maxErr.toFixed(6)}° ${r.mae < 0.005 ? '★★★' : r.mae < 0.01 ? '★★' : r.mae < 0.02 ? '★' : ''}`);
}

console.log('\nBest LON formulas (by MAE):');
for (const r of lonResults.slice(0, 20)) {
  console.log(`  ${r.name.padEnd(40)} MAE=${r.mae.toFixed(6)}° minErr=${r.minErr.toFixed(6)}° maxErr=${r.maxErr.toFixed(6)}° ${r.mae < 0.005 ? '★★★' : r.mae < 0.01 ? '★★' : r.mae < 0.02 ? '★' : ''}`);
}

// ═══════════════════════════════════════════════════════════════
// 8. VISUAL COMPARISON — print best candidate track vs KML 
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('VISUAL: Best candidate vs KML (every 200 points)');
console.log(`${'═'.repeat(70)}`);

if (latResults.length > 0 && lonResults.length > 0) {
  const bestLatName = latResults[0].name;
  const bestLonName = lonResults[0].name;
  console.log(`Best lat: ${bestLatName} (MAE=${latResults[0].mae.toFixed(6)}°)`);
  console.log(`Best lon: ${bestLonName} (MAE=${lonResults[0].mae.toFixed(6)}°)`);
  
  // Find the actual functions
  const bestLatCandidate = candidates.find(c => c.name === bestLatName && c.latFn);
  const bestLonCandidate = candidates.find(c => c.name === bestLonName && c.lonFn);
  
  if (bestLatCandidate?.latFn && bestLonCandidate?.lonFn) {
    console.log('\nrec# | KML lat      | Pred lat     | err_lat  | KML lon      | Pred lon     | err_lon');
    console.log('-'.repeat(100));
    for (let i = 0; i < alignCount; i += 200) {
      const predLat = bestLatCandidate.latFn(flight.records[i].accum);
      const predLon = bestLonCandidate.lonFn(flight.records[i].accum);
      const errLat = predLat - validKml[i].lat;
      const errLon = predLon - validKml[i].lon;
      console.log(
        `${String(i).padStart(5)} | ${validKml[i].lat.toFixed(6).padStart(12)} | ${predLat.toFixed(6).padStart(12)} | ${errLat.toFixed(4).padStart(8)} | ` +
        `${validKml[i].lon.toFixed(6).padStart(12)} | ${predLon.toFixed(6).padStart(12)} | ${errLon.toFixed(4).padStart(8)}`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. EXHAUSTIVE DIVISOR SEARCH for single fields
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('EXHAUSTIVE DIVISOR SEARCH — testing divisors 1 to 100000');
console.log(`${'═'.repeat(70)}`);

// For the most promising fields, try to find the exact divisor
for (const fi of [83, 85, 86, 87]) {
  // Pick mid-flight sample where both KML and JPI should be well-aligned
  const midIdx = Math.floor(alignCount / 2);
  const accumVal = flight.records[midIdx].accum[fi];
  const kmlLatDelta = validKml[midIdx].lat - hdrLat;
  const kmlLonDelta = validKml[midIdx].lon - hdrLon;
  
  if (accumVal !== 0) {
    const impliedDivisorLat = accumVal / kmlLatDelta;
    const impliedDivisorLon = accumVal / kmlLonDelta;
    console.log(`f${fi} at midpoint (idx=${midIdx}): val=${accumVal}, kmlLatΔ=${kmlLatDelta.toFixed(6)}, kmlLonΔ=${kmlLonDelta.toFixed(6)}`);
    console.log(`  Implied divisor for LAT: ${impliedDivisorLat.toFixed(2)}`);
    console.log(`  Implied divisor for LON: ${impliedDivisorLon.toFixed(2)}`);
  }
  
  // Try at multiple sample points
  console.log(`  Sampling f${fi} divisor across flight:`);
  for (let si = 100; si < alignCount; si += Math.floor(alignCount/10)) {
    const v = flight.records[si].accum[fi];
    if (v === 0) continue;
    const dLat = validKml[si].lat - hdrLat;
    const dLon = validKml[si].lon - hdrLon;
    if (Math.abs(dLat) > 0.001) {
      console.log(`    idx=${si}: f${fi}=${v}, latΔ=${dLat.toFixed(6)}, divLat=${(v/dLat).toFixed(1)}, lonΔ=${dLon.toFixed(6)}, divLon=${(v/dLon).toFixed(1)}`);
    }
  }
}
