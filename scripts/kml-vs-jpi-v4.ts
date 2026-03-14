/**
 * KML vs JPI V4 — Direct field-to-position comparison with proper alignment
 * 
 * Key findings so far:
 * - f83 = GPS altitude (pressure alt in feet, consistent +130m offset from WGS84)
 * - f87 range (-172 to 726) closely matches lat_delta * 6000 (-144 to 676)
 * - f86 range (-610 to 180) and lon_delta * 6000 is about (-244 to 127)
 * - Time offset: JPI starts 122 records before KML
 * - f81=f82=1020 = probably ground speed (102 knots * 10)
 * - f85 = probably track/heading
 * 
 * Let's do a DIRECT comparison at key flight moments
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');
const INIT_VALUE = 0xF0;

// Parse KML
const kmlContent = fs.readFileSync(path.join(JPI_DIR, 'CC-AQI 2026-03-01 133620.kml'), 'utf-8');
const coordRegex = /(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)/g;
const allKml: Array<{ lon: number; lat: number; alt: number }> = [];
let match;
while ((match = coordRegex.exec(kmlContent)) !== null) {
  allKml.push({ lon: parseFloat(match[1]), lat: parseFloat(match[2]), alt: parseFloat(match[3]) });
}
const validKml = allKml.filter(c => c.lon > -72 && c.lon < -70 && c.lat > -34 && c.lat < -33);

// Parse JPI
function readByte(d: Buffer, p: { v: number }): number { if (p.v >= d.length) throw new Error('EOF'); return d[p.v++]; }
function readU16BE(d: Buffer, p: { v: number }): number { return (readByte(d, p) << 8) | readByte(d, p); }

const data = fs.readFileSync(path.join(JPI_DIR, 'U260301.JPI'));
const pos = { v: 0 };
while (pos.v < data.length) {
  const start = pos.v;
  while (pos.v < data.length) {
    if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) { pos.v += 2; break; }
    pos.v++;
  }
  if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
}

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

const accum = new Int16Array(128);
for (let i = 0; i < 48; i++) accum[i] = INIT_VALUE;
for (let i = 48; i < 56; i++) accum[i] = 0;
accum[42] = 0; accum[30] = 0;
for (let i = 56; i < 64; i++) accum[i] = INIT_VALUE;
for (let i = 64; i < 128; i++) accum[i] = 0;

let elapsed = 0, ci = interval, rc = 0;
const records: Array<{ sec: number; accum: number[] }> = [];

while (pos.v < data.length && rc < 100000) {
  if (pos.v + 5 > data.length) break;
  const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
  if (df1 !== df2) { pos.v -= 4; break; }
  const rep = readByte(data, pos);
  if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
  for (let r = 0; r < rep; r++) { records.push({ sec: elapsed, accum: Array.from(accum) }); elapsed += ci; rc++; }
  const ff2 = new Array<number>(16).fill(0);
  for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
  const sf = new Array<number>(16).fill(0);
  for (let i = 0; i < 16; i++) if (df1 & (1 << i)) { if (i !== 6 && i !== 7) sf[i] = readByte(data, pos); }
  const sb = new Array<number>(128).fill(0);
  for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (sf[bi] & (1 << bit)) sb[bi * 8 + bit] = 1;
  sb[42] = sb[41]; for (let i = 0; i < 6; i++) sb[48 + i] = sb[i]; sb[79] = sb[78];
  for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) {
    const fi = bi * 8 + bit;
    if (ff2[bi] & (1 << bit)) { const d = readByte(data, pos); if (d !== 0) accum[fi] = sb[fi] ? accum[fi] - d : accum[fi] + d; }
  }
  readByte(data, pos);
  if (accum[16] === 0x02) ci = 1; else if (accum[16] === 0x03) ci = interval;
  records.push({ sec: elapsed, accum: Array.from(accum) }); elapsed += ci; rc++;
}

console.log(`JPI: ${records.length} records, header lat=${hdrLat.toFixed(6)} lon=${hdrLon.toFixed(6)}`);
console.log(`KML: ${validKml.length} valid points`);
console.log(`Offset: -122 (JPI starts 122s before first valid KML)\n`);

// ═══════════════════════════════════════════════════════════════
// KEY INSIGHT: Maybe f86 and f87 aren't raw position offsets
// but rather GROUND SPEED N/S and E/W components!
// f81=f82=1020 → ground speed = 102 knots
// f85 → track angle (maybe in degrees or 0.1 degrees)
// f86 → latitude rate? (speed * cos(track))  
// f87 → longitude rate? (speed * sin(track))
// Or maybe they ARE position but we need to check if
// the KML duplicates coordinates when stationary
// ═══════════════════════════════════════════════════════════════

// Check KML: how many unique consecutive positions?
let kmlUniqueConsec = 0;
for (let i = 1; i < validKml.length; i++) {
  if (validKml[i].lat !== validKml[i-1].lat || validKml[i].lon !== validKml[i-1].lon) {
    kmlUniqueConsec++;
  }
}
console.log(`KML: ${kmlUniqueConsec} position changes out of ${validKml.length} points`);
console.log(`KML changes about every ${(validKml.length / kmlUniqueConsec).toFixed(1)} seconds\n`);

// Check: what's the KML update rate?
let lastChange = 0;
const changeDiffs: number[] = [];
for (let i = 1; i < validKml.length; i++) {
  if (validKml[i].lat !== validKml[i-1].lat || validKml[i].lon !== validKml[i-1].lon) {
    if (lastChange > 0) changeDiffs.push(i - lastChange);
    lastChange = i;
  }
}
changeDiffs.sort((a,b) => a - b);
console.log(`KML position change intervals: min=${changeDiffs[0]}, median=${changeDiffs[Math.floor(changeDiffs.length/2)]}, max=${changeDiffs[changeDiffs.length-1]}`);
console.log(`Most common intervals: ${JSON.stringify(changeDiffs.slice(0, 20))}\n`);

// ═══════════════════════════════════════════════════════════════
// HYPOTHESIS: Maybe f85, f86, f87 encode ground speed, track, alt_rate
// f81 = f82 = ground speed (stabilize at 1020 = 102 knots)
// f83 = pressure altitude (in feet)
// f85 = ground track (degrees * some factor?)
// f86 = N/S speed component  
// f87 = E/W speed component
// 
// OR: f85/f86/f87 encode lat_delta, lon_delta in some unit per update
// ═══════════════════════════════════════════════════════════════

// Let's check if f85 could be track angle
// At rec#100 on ground: f85=-90 (sitting on ramp at SCCV, heading ~090?)
// f85=-240 later on ground: heading changed?
// f85=-154 in flight → -154 degrees? or -15.4?

// Better check: compare f85 to actual KML-derived track
console.log('═══════════════════════════════════════════════════════════════');
console.log('SPEED/TRACK ANALYSIS — comparing f81,f82,f85 to KML-derived values');
console.log('═══════════════════════════════════════════════════════════════\n');

const OFFSET = 122; // JPI record N = KML point N-122

console.log('jpi_rec | kml_idx | f81  | f82  | f85   | f86   | f87   | kml_spd(kt) | kml_trk  | kml_lat_delta | kml_lon_delta');
console.log('-'.repeat(140));

for (let ji = 1100; ji < Math.min(records.length, 5000); ji += 100) {
  const ki = ji - OFFSET;
  if (ki < 2 || ki >= validKml.length - 2) continue;
  
  const f81 = records[ji].accum[81];
  const f82 = records[ji].accum[82];
  const f85 = records[ji].accum[85];
  const f86 = records[ji].accum[86];
  const f87 = records[ji].accum[87];
  
  // KML-derived speed and track (using ±5 point window for smoothing)
  const dLat = validKml[ki+2].lat - validKml[ki-2].lat;
  const dLon = validKml[ki+2].lon - validKml[ki-2].lon;
  const dLatM = dLat * 111320;
  const dLonM = dLon * 111320 * Math.cos(validKml[ki].lat * Math.PI / 180);
  const speedMs = Math.sqrt(dLatM*dLatM + dLonM*dLonM) / 4; // per second (4s window)
  const speedKt = speedMs * 1.94384;
  const track = (Math.atan2(dLonM, dLatM) * 180 / Math.PI + 360) % 360;
  
  // KML lat/lon delta from header
  const kmlLatD = validKml[ki].lat - hdrLat;
  const kmlLonD = validKml[ki].lon - hdrLon;
  
  console.log(
    `${String(ji).padStart(7)} | ${String(ki).padStart(7)} | ${String(f81).padStart(4)} | ${String(f82).padStart(4)} | ${String(f85).padStart(5)} | ${String(f86).padStart(5)} | ${String(f87).padStart(5)} | ` +
    `${speedKt.toFixed(1).padStart(11)} | ${track.toFixed(1).padStart(8)} | ${kmlLatD.toFixed(6).padStart(13)} | ${kmlLonD.toFixed(6).padStart(13)}`
  );
}

// ═══════════════════════════════════════════════════════════════
// DIRECT COMPARISON: f87 vs lat_delta*6000, f86 vs lon_delta*6000
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('DIRECT: f86 & f87 as lat/lon offset from header (÷6000)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('jpi_rec | kml_lat     | f87_lat      | err_lat  | kml_lon     | f86_lon      | err_lon  | f85_lon      | err_lon2');
console.log('-'.repeat(130));

let sumErrLat = 0, sumErrLon86 = 0, sumErrLon85 = 0;
let cnt = 0;

for (let ji = 1100; ji < Math.min(records.length, 5000); ji += 50) {
  const ki = ji - OFFSET;
  if (ki < 0 || ki >= validKml.length) continue;
  
  const f85 = records[ji].accum[85];
  const f86 = records[ji].accum[86];
  const f87 = records[ji].accum[87];
  
  const predLat87 = hdrLat + f87 / 6000;
  const predLon86 = hdrLon + f86 / 6000;
  const predLon85 = hdrLon + f85 / 6000;
  
  const errLat = predLat87 - validKml[ki].lat;
  const errLon86 = predLon86 - validKml[ki].lon;
  const errLon85 = predLon85 - validKml[ki].lon;
  
  sumErrLat += Math.abs(errLat);
  sumErrLon86 += Math.abs(errLon86);
  sumErrLon85 += Math.abs(errLon85);
  cnt++;
  
  if (ji % 200 === 0 || ji === 1100) {
    console.log(
      `${String(ji).padStart(7)} | ${validKml[ki].lat.toFixed(6).padStart(11)} | ${predLat87.toFixed(6).padStart(12)} | ${errLat.toFixed(4).padStart(8)} | ` +
      `${validKml[ki].lon.toFixed(6).padStart(11)} | ${predLon86.toFixed(6).padStart(12)} | ${errLon86.toFixed(4).padStart(8)} | ` +
      `${predLon85.toFixed(6).padStart(12)} | ${errLon85.toFixed(4).padStart(8)}`
    );
  }
}

console.log(`\nMAE for in-flight records (${cnt} samples):`);
console.log(`  lat = f87/6000 + hdr: MAE = ${(sumErrLat/cnt).toFixed(6)}°  (${(sumErrLat/cnt * 111320).toFixed(0)}m)`);
console.log(`  lon = f86/6000 + hdr: MAE = ${(sumErrLon86/cnt).toFixed(6)}°  (${(sumErrLon86/cnt * 111320 * Math.cos(-33.4 * Math.PI / 180)).toFixed(0)}m)`);
console.log(`  lon = f85/6000 + hdr: MAE = ${(sumErrLon85/cnt).toFixed(6)}°  (${(sumErrLon85/cnt * 111320 * Math.cos(-33.4 * Math.PI / 180)).toFixed(0)}m)`);

// ═══════════════════════════════════════════════════════════════
// What about the actual Python decoder (SavvyAviation)?
// Their decoder probably does this correctly.
// Let's look at what SavvyAviation does with group 10 (fields 80-87)
// Group 8 = fields 64-71 (always zero)
// Group 9 = fields 72-79
// Group 10 = fields 80-87
// 
// Perhaps the encoding is: 
// latitude = (f86 << 8 | (f85 & 0xFF)) / some_divisor + header_lat
// longitude = (f87 << 8 | (f85 & 0xFF)) / some_divisor + header_lon
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('MULTI-BYTE COMBOS — 16-bit and 32-bit tests');
console.log('═══════════════════════════════════════════════════════════════\n');

// Let's think about what a GPS module sends via RS-232:
// Garmin GTN 650 outputs NMEA or aviation format
// Lat: 33°23.77'S = 33 + 23.77/60 = 33.3962°
// In 1/6000 degree: 33.3962 * 6000 = 200377
// In header: latRaw = -200377 (signed)
// 
// Per-record: maybe it's incremental lat/lon in 1/6000 degree from header
// f87 range -172 to 726 / 6000 = -0.029 to 0.121 degrees
// KML lat delta range: -0.029 to 0.121 degrees (from scatter!)
// THESE MATCH EXACTLY!

// Let me compute the implied divisor more carefully
console.log('FIELD vs KML DELTA — implied divisor for f86/f87:');
console.log('jpi_rec | f86   | kml_lonΔ*6000 | f86/kml_lon | f87   | kml_latΔ*6000 | f87/kml_lat');
console.log('-'.repeat(100));

for (let ji = 1100; ji < Math.min(records.length, 5000); ji += 100) {
  const ki = ji - OFFSET;
  if (ki < 0 || ki >= validKml.length) continue;
  
  const f86 = records[ji].accum[86];
  const f87 = records[ji].accum[87];
  const kmlLatD6000 = (validKml[ki].lat - hdrLat) * 6000;
  const kmlLonD6000 = (validKml[ki].lon - hdrLon) * 6000;
  
  const ratioLat = kmlLatD6000 !== 0 ? f87 / kmlLatD6000 : NaN;
  const ratioLon = kmlLonD6000 !== 0 ? f86 / kmlLonD6000 : NaN;
  
  console.log(
    `${String(ji).padStart(7)} | ${String(f86).padStart(5)} | ${kmlLonD6000.toFixed(1).padStart(13)} | ${isNaN(ratioLon) ? 'n/a'.padStart(11) : ratioLon.toFixed(3).padStart(11)} | ` +
    `${String(f87).padStart(5)} | ${kmlLatD6000.toFixed(1).padStart(13)} | ${isNaN(ratioLat) ? 'n/a'.padStart(11) : ratioLat.toFixed(3).padStart(11)}`
  );
}

// ═══════════════════════════════════════════════════════════════
// MAYBE: the issue is that f86/f87 update less frequently than 1 per second
// and hold their value between updates (like the KML does)
// Let's check when f86/f87 actually change and compare to KML changes
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('CHANGE FREQUENCY — when do f86/f87 update?');
console.log('═══════════════════════════════════════════════════════════════\n');

let lastF86 = records[0].accum[86], lastF87 = records[0].accum[87];
let f86Changes = 0, f87Changes = 0;
const f86ChangeIdxs: number[] = [];
const f87ChangeIdxs: number[] = [];

for (let i = 1; i < records.length; i++) {
  if (records[i].accum[86] !== lastF86) { f86Changes++; f86ChangeIdxs.push(i); lastF86 = records[i].accum[86]; }
  if (records[i].accum[87] !== lastF87) { f87Changes++; f87ChangeIdxs.push(i); lastF87 = records[i].accum[87]; }
}

console.log(`f86 changes: ${f86Changes} times across ${records.length} records`);
console.log(`f87 changes: ${f87Changes} times across ${records.length} records`);
console.log(`f86 avg interval: ${(records.length / f86Changes).toFixed(1)} records`);
console.log(`f87 avg interval: ${(records.length / f87Changes).toFixed(1)} records`);

// Distribution of change intervals
const f86intervals: number[] = [];
for (let i = 1; i < f86ChangeIdxs.length; i++) f86intervals.push(f86ChangeIdxs[i] - f86ChangeIdxs[i-1]);
f86intervals.sort((a,b) => a-b);
if (f86intervals.length > 0) {
  console.log(`f86 change interval distribution: min=${f86intervals[0]}, median=${f86intervals[Math.floor(f86intervals.length/2)]}, max=${f86intervals[f86intervals.length-1]}`);
}

const f87intervals: number[] = [];
for (let i = 1; i < f87ChangeIdxs.length; i++) f87intervals.push(f87ChangeIdxs[i] - f87ChangeIdxs[i-1]);
f87intervals.sort((a,b) => a-b);
if (f87intervals.length > 0) {
  console.log(`f87 change interval distribution: min=${f87intervals[0]}, median=${f87intervals[Math.floor(f87intervals.length/2)]}, max=${f87intervals[f87intervals.length-1]}`);
}

// Check first 20 f86 changes
console.log('\nFirst 20 f86 changes:');
for (let i = 0; i < Math.min(20, f86ChangeIdxs.length); i++) {
  const idx = f86ChangeIdxs[i];
  const val = records[idx].accum[86];
  const prev = records[idx-1].accum[86];
  console.log(`  rec#${idx}: ${prev} → ${val} (Δ=${val-prev})`);
}

console.log('\nFirst 20 f87 changes:');
for (let i = 0; i < Math.min(20, f87ChangeIdxs.length); i++) {
  const idx = f87ChangeIdxs[i];
  const val = records[idx].accum[87];
  const prev = records[idx-1].accum[87];
  console.log(`  rec#${idx}: ${prev} → ${val} (Δ=${val-prev})`);
}

// Also look at f85 changes
let lastF85 = records[0].accum[85];
const f85ChangeIdxs: number[] = [];
for (let i = 1; i < records.length; i++) {
  if (records[i].accum[85] !== lastF85) { f85ChangeIdxs.push(i); lastF85 = records[i].accum[85]; }
}
console.log(`\nf85 changes: ${f85ChangeIdxs.length} times`);
console.log('First 20 f85 changes:');
for (let i = 0; i < Math.min(20, f85ChangeIdxs.length); i++) {
  const idx = f85ChangeIdxs[i];
  const val = records[idx].accum[85];
  const prev = records[idx-1].accum[85];
  console.log(`  rec#${idx}: ${prev} → ${val} (Δ=${val-prev})`);
}
