/**
 * KML vs JPI V3 — Time-aligned comparison with cross-correlation
 * 
 * The problem: KML and JPI don't start at the same time.
 * Solution: Use f83 (which correlates with altitude at r=0.87) to find
 * the time offset, then test lat/lon with correct alignment.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');
const INIT_VALUE = 0xF0;

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
const validKml = allKml.filter(c => c.lon > -72 && c.lon < -70 && c.lat > -34 && c.lat < -33);
console.log(`KML: ${validKml.length} valid points`);

// ═══════════════════════════════════════════════════════════════
// 2. PARSE JPI
// ═══════════════════════════════════════════════════════════════
function readByte(d: Buffer, p: { v: number }): number { if (p.v >= d.length) throw new Error('EOF'); return d[p.v++]; }
function readU16BE(d: Buffer, p: { v: number }): number { return (readByte(d, p) << 8) | readByte(d, p); }

const data = fs.readFileSync(path.join(JPI_DIR, 'U260301.JPI'));
const pos = { v: 0 };

// Skip text header
let protocol = 2;
while (pos.v < data.length) {
  const start = pos.v;
  while (pos.v < data.length) {
    if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) {
      const line = data.subarray(start, pos.v).toString('ascii');
      pos.v += 2;
      let clean = line; const si = clean.lastIndexOf('*'); if (si >= 0) clean = clean.substring(0, si);
      if (clean.startsWith('$P')) protocol = parseInt(clean.substring(3)) || 2;
      break;
    }
    pos.v++;
  }
  if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
}

// Parse flight header (flight #937 = index 0)
const hdrWords: number[] = [];
for (let i = 0; i < 14; i++) hdrWords.push(readU16BE(data, pos));
readByte(data, pos);

let latRaw = (hdrWords[6] << 16) | hdrWords[7];
let lonRaw = (hdrWords[8] << 16) | hdrWords[9];
if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
const interval = hdrWords[11] > 0 ? hdrWords[11] : 6;
const hdrLat = latRaw / 6000;
const hdrLon = lonRaw / 6000;

console.log(`JPI Flight #${hdrWords[0]}, interval=${interval}s`);
console.log(`Header GPS: lat=${hdrLat.toFixed(6)} lon=${hdrLon.toFixed(6)}`);

// Initialize accumulator
const accum = new Int16Array(128);
for (let i = 0; i < 48; i++) accum[i] = INIT_VALUE;
for (let i = 48; i < 56; i++) accum[i] = 0;
accum[42] = 0; accum[30] = 0;
for (let i = 56; i < 64; i++) accum[i] = INIT_VALUE;
for (let i = 64; i < 128; i++) accum[i] = 0;

let elapsed = 0;
let ci = interval;
let rc = 0;

const records: Array<{ sec: number; accum: number[] }> = [];

while (pos.v < data.length && rc < 100000) {
  if (pos.v + 5 > data.length) break;
  const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
  if (df1 !== df2) { pos.v -= 4; break; }
  const rep = readByte(data, pos);
  if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

  for (let r = 0; r < rep; r++) {
    records.push({ sec: elapsed, accum: Array.from(accum) });
    elapsed += ci; rc++;
  }

  const ff2 = new Array<number>(16).fill(0);
  for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
  const sf = new Array<number>(16).fill(0);
  for (let i = 0; i < 16; i++) if (df1 & (1 << i)) { if (i !== 6 && i !== 7) sf[i] = readByte(data, pos); }
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

  records.push({ sec: elapsed, accum: Array.from(accum) });
  elapsed += ci; rc++;
}

console.log(`JPI records: ${records.length}`);

// ═══════════════════════════════════════════════════════════════
// 3. FIND TIME OFFSET using altitude cross-correlation
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('TIME ALIGNMENT via altitude cross-correlation');
console.log(`${'═'.repeat(70)}`);

// f83 correlates best with altitude (r=0.87)
// KML altitude is in meters. What's f83's scale?
// f83 range: 0→3418. KML alt: 73→570m. 
// Let's try f83 * some factor = altitude in meters

// First check: what IS f83 likely representing?
// KML alt range = 570-73 = 497m. f83 range = 3418. 
// 3418 / 497 ≈ 6.88 → could be in feet! (1 ft = 0.3048m, 497m = 1630 ft)
// 3418 / 1630 ≈ 2.1 → maybe f83 is alt in 0.5ft increments? or just ft scaled differently
// But the header GPS is at airport altitude ~210m = 689ft
// f83 starts at 0, so it's an OFFSET from initial altitude

// Let's just normalize both and cross-correlate
const jpiAlt = records.map(r => r.accum[83]);
const kmlAlt = validKml.map(c => c.alt);

// Normalize
function normalize(arr: number[]): number[] {
  const mean = arr.reduce((a,b) => a+b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a,b) => a + (b-mean)**2, 0) / arr.length);
  return std === 0 ? arr.map(() => 0) : arr.map(v => (v - mean) / std);
}

const jpiNorm = normalize(jpiAlt);
const kmlNorm = normalize(kmlAlt);

// Cross-correlation: try offsets from -500 to +500
let bestOffset = 0;
let bestCorr = -Infinity;

console.log('\nTesting offsets -500 to +500...');

for (let offset = -500; offset <= 500; offset++) {
  let sum = 0;
  let count = 0;
  for (let k = 0; k < Math.min(records.length, validKml.length); k++) {
    const ki = k + offset; // KML index
    if (ki >= 0 && ki < validKml.length && k < records.length) {
      sum += jpiNorm[k] * kmlNorm[ki];
      count++;
    }
  }
  const corr = count > 0 ? sum / count : 0;
  if (corr > bestCorr) {
    bestCorr = corr;
    bestOffset = offset;
  }
}

console.log(`Best offset: ${bestOffset} (JPI record 0 = KML point ${bestOffset})`);
console.log(`Cross-correlation at best offset: ${bestCorr.toFixed(6)}`);

// Also check: maybe the KML starts BEFORE JPI
// offset > 0 means KML starts before JPI (skip first `offset` KML points)
// offset < 0 means JPI starts before KML

// ═══════════════════════════════════════════════════════════════
// 4. VERIFY altitude alignment visually
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('ALTITUDE ALIGNMENT CHECK (every 200 records)');
console.log(`${'═'.repeat(70)}`);

// Also find the BEST divisor for f83 → altitude
// f83 / divisor + base_alt = kml_alt
// Use mid-flight sample
const midJpi = Math.floor(records.length / 2);
const midKml = midJpi + bestOffset;
if (midKml >= 0 && midKml < validKml.length) {
  const f83Val = records[midJpi].accum[83];
  const kmlAltVal = validKml[midKml].alt;
  const baseAlt = validKml[bestOffset >= 0 ? bestOffset : 0].alt;
  console.log(`Mid-flight: f83=${f83Val}, KML alt=${kmlAltVal}m, base_alt=${baseAlt}m`);
  if (f83Val !== 0) {
    const impliedDiv = f83Val / (kmlAltVal - baseAlt);
    console.log(`Implied f83 divisor: ${impliedDiv.toFixed(4)}`);
    console.log(`If f83 is in feet*10: ${f83Val/10} ft = ${f83Val * 0.3048 / 10}m, delta=${(f83Val * 0.3048 / 10).toFixed(1)}m vs KML delta ${(kmlAltVal-baseAlt).toFixed(1)}m`);
    // Maybe f83 is altitude in feet? 
    // f83=3418 → 3418ft = 1041m. KML max alt = 570m. base = 73m. delta = 497m
    // 3418 * 0.3048 = 1041.6m. That's too much.
    // What about f83 / 2 → 1709ft = 520m. Close to max alt!
    // Or f83 in decimeters: 3418 / 10 = 341.8m + 73 = 415m. Nope.
    // f83 * 0.3048 / 2 = 520m. With base 73 → 593m. KML max is 570. Close!
    console.log(`\nScaling tests:`);
    console.log(`  f83 as feet: ${(f83Val * 0.3048).toFixed(1)}m (+ base ${baseAlt}m = ${(f83Val * 0.3048 + baseAlt).toFixed(1)}m)`);
    console.log(`  f83/2 as feet: ${(f83Val / 2 * 0.3048).toFixed(1)}m (+ base ${baseAlt}m = ${(f83Val / 2 * 0.3048 + baseAlt).toFixed(1)}m)`);
    console.log(`  f83/10 as meters: ${(f83Val / 10).toFixed(1)}m (+ base ${baseAlt}m = ${(f83Val / 10 + baseAlt).toFixed(1)}m)`);
    console.log(`  KML alt at this point: ${kmlAltVal}m`);
  }
}

console.log('\nrec# | JPI f83 | f83/10+base | KML alt(m) | err(m) | f83*0.3048+base | err(m)');
console.log('-'.repeat(90));

for (let ji = 0; ji < records.length; ji += 200) {
  const ki = ji + bestOffset;
  if (ki < 0 || ki >= validKml.length) continue;
  const f83 = records[ji].accum[83];
  const kmlA = validKml[ki].alt;
  const baseAlt = validKml[Math.max(0, bestOffset)].alt;
  const pred1 = f83 / 10 + baseAlt;
  const pred2 = f83 * 0.3048 + baseAlt;
  console.log(
    `${String(ji).padStart(5)} | ${String(f83).padStart(7)} | ${pred1.toFixed(1).padStart(11)} | ${kmlA.toFixed(1).padStart(10)} | ${(pred1-kmlA).toFixed(1).padStart(6)} | ${pred2.toFixed(1).padStart(15)} | ${(pred2-kmlA).toFixed(1).padStart(6)}`
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. WITH CORRECT ALIGNMENT, test lat/lon fields
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log(`LAT/LON CORRELATION WITH TIME-ALIGNED DATA (offset=${bestOffset})`);
console.log(`${'═'.repeat(70)}`);

const alignedCount = Math.min(
  records.length,
  bestOffset >= 0 ? validKml.length - bestOffset : validKml.length
);

const alignedKmlLat: number[] = [];
const alignedKmlLon: number[] = [];
const alignedKmlAlt: number[] = [];

for (let ji = 0; ji < alignedCount; ji++) {
  const ki = ji + bestOffset;
  if (ki >= 0 && ki < validKml.length) {
    alignedKmlLat.push(validKml[ki].lat);
    alignedKmlLon.push(validKml[ki].lon);
    alignedKmlAlt.push(validKml[ki].alt);
  }
}

// Test ALL fields 0-127 for correlation with aligned lat/lon
function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
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

console.log('\nField | Corr LAT | Corr LON | Corr ALT | Range');
console.log('-'.repeat(80));

const fieldVals: Map<number, number[]> = new Map();

for (let fi = 0; fi < 128; fi++) {
  const vals: number[] = [];
  for (let ji = 0; ji < alignedCount && ji < alignedKmlLat.length; ji++) {
    vals.push(records[ji].accum[fi]);
  }
  fieldVals.set(fi, vals);
  
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  if (maxV === minV) continue; // skip constant
  
  const rLat = pearsonR(vals, alignedKmlLat);
  const rLon = pearsonR(vals, alignedKmlLon);
  const rAlt = pearsonR(vals, alignedKmlAlt);
  
  if (Math.abs(rLat) > 0.3 || Math.abs(rLon) > 0.3 || Math.abs(rAlt) > 0.3) {
    let note = '';
    if (Math.abs(rLat) > 0.8) note += ' ★LAT';
    if (Math.abs(rLon) > 0.8) note += ' ★LON';
    if (Math.abs(rAlt) > 0.8) note += ' ★ALT';
    console.log(
      `f${fi.toString().padStart(3)}  | ${rLat.toFixed(4).padStart(8)} | ${rLon.toFixed(4).padStart(8)} | ${rAlt.toFixed(4).padStart(8)} | ${minV}→${maxV} ${note}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. TWO-FIELD COMBO CORRELATIONS (time-aligned)
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('TWO-FIELD COMBOS (time-aligned) — testing lo+hi*256, (a<<8)|b, etc');
console.log(`${'═'.repeat(70)}`);

const active = [81, 82, 83, 85, 86, 87]; // nonzero fields

type ComboR = { name: string; rLat: number; rLon: number; rAlt: number };
const combos: ComboR[] = [];

// Single
for (const a of active) {
  const v = fieldVals.get(a)!;
  combos.push({ name: `f${a}`, rLat: pearsonR(v, alignedKmlLat), rLon: pearsonR(v, alignedKmlLon), rAlt: pearsonR(v, alignedKmlAlt) });
}

// a + b*256
for (const a of active) {
  for (const b of active) {
    if (a === b) continue;
    const v = records.slice(0, alignedKmlLat.length).map(r => r.accum[a] + r.accum[b] * 256);
    combos.push({ name: `f${a}+f${b}*256`, rLat: pearsonR(v, alignedKmlLat), rLon: pearsonR(v, alignedKmlLon), rAlt: pearsonR(v, alignedKmlAlt) });
  }
}

// (a<<8) | (b & 0xFF)
for (const a of active) {
  for (const b of active) {
    if (a === b) continue;
    const v = records.slice(0, alignedKmlLat.length).map(r => (r.accum[a] << 8) | (r.accum[b] & 0xFF));
    combos.push({ name: `(f${a}<<8)|(f${b}&0xFF)`, rLat: pearsonR(v, alignedKmlLat), rLon: pearsonR(v, alignedKmlLon), rAlt: pearsonR(v, alignedKmlAlt) });
  }
}

// Sort by best lat
console.log('\nTop LAT combos:');
combos.sort((a, b) => Math.abs(b.rLat) - Math.abs(a.rLat));
for (const c of combos.slice(0, 20)) {
  console.log(`  ${c.name.padEnd(30)} rLat=${c.rLat.toFixed(4).padStart(8)} rLon=${c.rLon.toFixed(4).padStart(8)} rAlt=${c.rAlt.toFixed(4).padStart(8)}`);
}

console.log('\nTop LON combos:');
combos.sort((a, b) => Math.abs(b.rLon) - Math.abs(a.rLon));
for (const c of combos.slice(0, 20)) {
  console.log(`  ${c.name.padEnd(30)} rLat=${c.rLat.toFixed(4).padStart(8)} rLon=${c.rLon.toFixed(4).padStart(8)} rAlt=${c.rAlt.toFixed(4).padStart(8)}`);
}

// ═══════════════════════════════════════════════════════════════
// 7. POSITION MAE with best alignment
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('POSITION MAE — best candidates with time alignment');
console.log(`${'═'.repeat(70)}`);

// Test key formulas
const formulas: Array<{
  name: string;
  lat: (accum: number[]) => number;
  lon: (accum: number[]) => number;
}> = [
  {
    name: 'f87/6000 lat, f85/6000 lon',
    lat: a => hdrLat + a[87] / 6000,
    lon: a => hdrLon + a[85] / 6000,
  },
  {
    name: 'f87/6000 lat, f86/6000 lon',
    lat: a => hdrLat + a[87] / 6000,
    lon: a => hdrLon + a[86] / 6000,
  },
  {
    name: 'f86/6000 lat, f87/6000 lon',
    lat: a => hdrLat + a[86] / 6000,
    lon: a => hdrLon + a[87] / 6000,
  },
  {
    name: 'f85/6000 lat, f86/6000 lon',
    lat: a => hdrLat + a[85] / 6000,
    lon: a => hdrLon + a[86] / 6000,
  },
  {
    name: 'hdrRaw+f87 lat, hdrRaw+f85 lon /6000',
    lat: a => (latRaw + a[87]) / 6000,
    lon: a => (lonRaw + a[85]) / 6000,
  },
  {
    name: 'hdrRaw+f87 lat, hdrRaw+f86 lon /6000',
    lat: a => (latRaw + a[87]) / 6000,
    lon: a => (lonRaw + a[86]) / 6000,
  },
];

// Also generate ALL pairs for both offsets from header
for (const a of active) {
  for (const b of active) {
    if (a === b) continue;
    formulas.push({
      name: `f${a}/6000 lat, f${b}/6000 lon`,
      lat: acc => hdrLat + acc[a] / 6000,
      lon: acc => hdrLon + acc[b] / 6000,
    });
  }
}

for (const f of formulas) {
  let totalLatErr = 0, totalLonErr = 0;
  let count = 0;
  for (let ji = 0; ji < alignedKmlLat.length; ji += 5) {
    const ki = ji; // already aligned
    const predLat = f.lat(records[ji].accum);
    const predLon = f.lon(records[ji].accum);
    totalLatErr += Math.abs(predLat - alignedKmlLat[ki]);
    totalLonErr += Math.abs(predLon - alignedKmlLon[ki]);
    count++;
  }
  const maeLat = totalLatErr / count;
  const maeLon = totalLonErr / count;
  const combined = maeLat + maeLon;
  if (combined < 0.06) { // only show promising ones
    console.log(`  ${f.name.padEnd(45)} MAE_lat=${maeLat.toFixed(5)}° MAE_lon=${maeLon.toFixed(5)}° combined=${combined.toFixed(5)}°`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. SCATTER: f85 vs KML_lon_delta, f87 vs KML_lat_delta
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('SCATTER — field values vs KML deltas from header (every 100 records)');
console.log(`${'═'.repeat(70)}`);

console.log('\nrec# | KML_latΔ   | f85      | f86      | f87      | KML_lonΔ   | f85      | f86      | f87');
console.log('-'.repeat(110));

for (let ji = 0; ji < alignedKmlLat.length; ji += 100) {
  const latDelta = alignedKmlLat[ji] - hdrLat;
  const lonDelta = alignedKmlLon[ji] - hdrLon;
  const f85 = records[ji].accum[85];
  const f86 = records[ji].accum[86];
  const f87 = records[ji].accum[87];
  console.log(
    `${String(ji).padStart(5)} | ${latDelta.toFixed(6).padStart(10)} | ${String(f85).padStart(8)} | ${String(f86).padStart(8)} | ${String(f87).padStart(8)} | ${lonDelta.toFixed(6).padStart(10)} | ${String(f85).padStart(8)} | ${String(f86).padStart(8)} | ${String(f87).padStart(8)}`
  );
}

// ═══════════════════════════════════════════════════════════════
// 9. FINAL ATTEMPT — Maybe the fields encode ground speed/track
//    instead of position, and we need to integrate!
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log('INTEGRATION TEST — maybe f85,f86,f87 are velocity components?');
console.log(`${'═'.repeat(70)}`);

// f81 and f82 stabilize at 1020 early (perhaps ground speed * 10?)
// 1020/10 = 102 knots = reasonable for C172
// f83 correlates with altitude → GPS altitude
// f85 range -240→0 → could be track/heading related
// f86 range -610→180 → velocity N/S component?
// f87 range -172→726 → velocity E/W component?

// Let's try: f81/f82 = ground speed (knots*10?)
// f85 = track angle?
// Or maybe f86/f87 are lat_speed/lon_speed per second
// and we need to INTEGRATE them to get position

// Integration approach: position = header + cumulative_sum(velocity * dt) / divisor
// Since dt=1s, just sum the per-record values

// But wait — the accumulator values ARE already cumulative sums of deltas!
// So maybe the deltas themselves (not accumulated values) give velocity?
// Let's check by computing per-record deltas for f86 and f87

console.log('\nPer-record DELTAS for f86 and f87 (first few changes):');
let prevF86 = records[0].accum[86], prevF87 = records[0].accum[87];
let deltaCount = 0;
for (let i = 1; i < Math.min(records.length, 500); i++) {
  const d86 = records[i].accum[86] - prevF86;
  const d87 = records[i].accum[87] - prevF87;
  if (d86 !== 0 || d87 !== 0) {
    if (deltaCount < 30) {
      console.log(`  rec#${i}: Δf86=${d86}, Δf87=${d87}`);
    }
    deltaCount++;
  }
  prevF86 = records[i].accum[86];
  prevF87 = records[i].accum[87];
}
console.log(`Total records with changes in f86 or f87: ${deltaCount} (first 500 records)`);

// Also: what if f81/f82 are ground speed and f85 is track?
// Ground speed in knots, track in degrees
// Then: lat_rate = speed * cos(track) and lon_rate = speed * sin(track)
console.log('\nGround speed / track hypothesis:');
for (let ji = 200; ji < Math.min(records.length, 3000); ji += 200) {
  const ki = ji;
  if (ki >= alignedKmlLat.length) break;
  const f81 = records[ji].accum[81];
  const f82 = records[ji].accum[82];
  const f85 = records[ji].accum[85];
  
  // KML-derived ground speed and track
  if (ki > 0 && ki < alignedKmlLat.length - 1) {
    const dLat = alignedKmlLat[ki+1] - alignedKmlLat[ki-1];
    const dLon = alignedKmlLon[ki+1] - alignedKmlLon[ki-1];
    const dLatM = dLat * 111320; // approx meters per degree lat
    const dLonM = dLon * 111320 * Math.cos(alignedKmlLat[ki] * Math.PI / 180);
    const speedMs = Math.sqrt(dLatM*dLatM + dLonM*dLonM) / 2; // per second
    const speedKt = speedMs * 1.94384;
    const track = Math.atan2(dLonM, dLatM) * 180 / Math.PI;
    console.log(`  rec#${ji}: f81=${f81}, f82=${f82}, f85=${f85} | KML speed=${speedKt.toFixed(1)}kt track=${track.toFixed(1)}°`);
  }
}
