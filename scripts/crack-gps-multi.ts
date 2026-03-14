/**
 * GPS Multi-flight Test
 * Test encoding hypothesis across MULTIPLE flights from different files
 * If f83 is lat offset, it should start near 0 and end near 0 (same airport)
 * For flights to different destinations, the mid-flight lat should differ
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');
const INIT_VALUE = 0xf0;

function readByte(d: Buffer, p: { v: number }): number { if (p.v >= d.length) throw new Error('EOF'); return d[p.v++]; }
function readU16BE(d: Buffer, p: { v: number }): number { return (readByte(d, p) << 8) | readByte(d, p); }

interface FlightGPS {
  file: string;
  flightNum: number;
  headerLat: number;
  headerLon: number;
  duration: number;
  startVals: number[];  // f80-f87 at start
  midVals: number[];    // f80-f87 at middle
  endVals: number[];    // f80-f87 at end
  maxF83: number;
  minF83: number;
  maxF85: number;
  minF85: number;
  maxF86: number;
  minF86: number;
  maxF87: number;
  minF87: number;
}

function analyzeFlight(filePath: string, flightIdx: number = 0): FlightGPS | null {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  let protocol = 2;
  const flights: Array<{ flightNum: number; dataWords: number }> = [];
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
          if (vals.length >= 2) flights.push({ flightNum: parseInt(vals[0])||0, dataWords: parseInt(vals[1])||0 });
        }
        break;
      }
      pos.v++;
    }
    if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
  }

  if (flightIdx >= flights.length) return null;

  // Skip preceding flights
  for (let fi = 0; fi < flightIdx; fi++) {
    // Parse flight header
    if (protocol >= 2) {
      for (let i = 0; i < 14; i++) readU16BE(data, pos);
      readByte(data, pos);
    } else {
      for (let i = 0; i < 7; i++) readU16BE(data, pos);
      readByte(data, pos);
    }
    // Skip records
    const accum = new Array(128).fill(0);
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

  // Parse target flight
  const words: number[] = [];
  for (let i = 0; i < 14; i++) words.push(readU16BE(data, pos));
  readByte(data, pos);

  let latRaw = (words[6] << 16) | words[7];
  let lonRaw = (words[8] << 16) | words[9];
  if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
  if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
  const interval = words[11] > 0 ? words[11] : 6;

  if (latRaw === 0 && lonRaw === 0) return null; // No GPS

  const accum = new Array<number>(128);
  for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0; accum[30] = 0;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  let elapsed = 0;
  let ci = interval;
  let rc = 0;

  let maxF83 = -Infinity, minF83 = Infinity;
  let maxF85 = -Infinity, minF85 = Infinity;
  let maxF86 = -Infinity, minF86 = Infinity;
  let maxF87 = -Infinity, minF87 = Infinity;

  const getSnap = () => [accum[80], accum[81], accum[82], accum[83], accum[84], accum[85], accum[86], accum[87]];
  
  let startSnap: number[] = [];
  let midSnap: number[] = [];
  let endSnap: number[] = [];
  let totalRecords = 0;

  // First pass: count records
  const savedPos = pos.v;
  const tempAccum = [...accum];
  while (pos.v < data.length && totalRecords < 50000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
    totalRecords += rep;
    const ff2 = new Array(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff2[i] = readByte(data, pos);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) readByte(data, pos);
    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (ff2[bi] & (1 << bit)) readByte(data, pos);
    readByte(data, pos);
    totalRecords++;
  }
  const midPoint = Math.floor(totalRecords / 2);

  // Reset and do real pass
  pos.v = savedPos;
  for (let i = 0; i < 128; i++) accum[i] = tempAccum[i];
  rc = 0;

  while (pos.v < data.length && rc < 50000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readU16BE(data, pos); const df2 = readU16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    for (let r = 0; r < rep; r++) {
      if (rc === 0) startSnap = getSnap();
      if (rc === midPoint) midSnap = getSnap();
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

    maxF83 = Math.max(maxF83, accum[83]);
    minF83 = Math.min(minF83, accum[83]);
    maxF85 = Math.max(maxF85, accum[85]);
    minF85 = Math.min(minF85, accum[85]);
    maxF86 = Math.max(maxF86, accum[86]);
    minF86 = Math.min(minF86, accum[86]);
    maxF87 = Math.max(maxF87, accum[87]);
    minF87 = Math.min(minF87, accum[87]);

    if (rc === midPoint) midSnap = getSnap();
    elapsed += ci; rc++;
  }
  endSnap = getSnap();
  if (startSnap.length === 0) startSnap = [0,0,0,0,0,0,0,0];
  if (midSnap.length === 0) midSnap = endSnap;

  return {
    file: path.basename(filePath),
    flightNum: words[0],
    headerLat: latRaw / 6000,
    headerLon: lonRaw / 6000,
    duration: elapsed,
    startVals: startSnap,
    midVals: midSnap,
    endVals: endSnap,
    maxF83, minF83, maxF85, minF85, maxF86, minF86, maxF87, minF87
  };
}

// Analyze multiple files
const files = fs.readdirSync(JPI_DIR).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();

console.log(`Analyzing ${files.length} JPI files...\n`);
console.log('File          | Flt# | Hdr Lat    | Hdr Lon    | Dur min | end f81 | end f82 | end f83 | end f85 | end f86 | end f87 | f83 range | f85 range | f86 range | f87 range');
console.log('-'.repeat(200));

let analyzed = 0;
for (const file of files.slice(-20)) { // Last 20 files
  try {
    const result = analyzeFlight(path.join(JPI_DIR, file));
    if (!result) continue;
    if (result.duration < 600) continue; // Skip short flights
    
    const e = result.endVals;
    console.log(
      `${result.file.padEnd(14)}| ${String(result.flightNum).padStart(4)} | ` +
      `${result.headerLat.toFixed(4).padStart(10)} | ${result.headerLon.toFixed(4).padStart(10)} | ` +
      `${(result.duration/60).toFixed(0).padStart(7)} | ` +
      `${String(e[1]).padStart(7)} | ${String(e[2]).padStart(7)} | ${String(e[3]).padStart(7)} | ` +
      `${String(e[5]).padStart(7)} | ${String(e[6]).padStart(7)} | ${String(e[7]).padStart(7)} | ` +
      `${String(result.maxF83 - result.minF83).padStart(9)} | ` +
      `${String(result.maxF85 - result.minF85).padStart(9)} | ` +
      `${String(result.maxF86 - result.minF86).padStart(9)} | ` +
      `${String(result.maxF87 - result.minF87).padStart(9)}`
    );
    analyzed++;
  } catch (e) {
    // skip
  }
}

console.log(`\nAnalyzed ${analyzed} flights`);

// Now test with the BEST hypothesis:
// f81 = ground speed (÷10 = knots)
// f82 = track angle (÷10 = degrees) or maybe also GS
// f83 = lat offset from header (÷6000 = degrees)
// f85 = lon offset from header (÷6000 = degrees)
// f86 = altitude? (÷? = feet)
// f87 = altitude? or distance?

console.log(`\n\nDETAILED TRACK for most recent flight:`);
const lastResult = analyzeFlight(path.join(JPI_DIR, files[files.length - 1]));
if (lastResult) {
  console.log(`\nHeader: lat=${lastResult.headerLat.toFixed(6)} lon=${lastResult.headerLon.toFixed(6)}`);
  console.log(`\nIf f83=lat, f85=lon (÷6000 + header):`);
  console.log(`  Start: lat=${(lastResult.headerLat + lastResult.startVals[3]/6000).toFixed(6)} lon=${(lastResult.headerLon + lastResult.startVals[5]/6000).toFixed(6)}`);
  console.log(`  Mid:   lat=${(lastResult.headerLat + lastResult.midVals[3]/6000).toFixed(6)} lon=${(lastResult.headerLon + lastResult.midVals[5]/6000).toFixed(6)}`);
  console.log(`  End:   lat=${(lastResult.headerLat + lastResult.endVals[3]/6000).toFixed(6)} lon=${(lastResult.headerLon + lastResult.endVals[5]/6000).toFixed(6)}`);
  
  console.log(`\nf85 range: ${lastResult.minF85} to ${lastResult.maxF85} → lon range: ${((lastResult.maxF85-lastResult.minF85)/6000).toFixed(4)}°`);
  console.log(`f83 range: ${lastResult.minF83} to ${lastResult.maxF83} → lat range: ${((lastResult.maxF83-lastResult.minF83)/6000).toFixed(4)}°`);
  
  console.log(`\nExpected for local flight from SCCV: lat range ~0.3-0.8°, lon range ~0.2-0.5°`);
  console.log(`f83 lat range: ${((lastResult.maxF83-lastResult.minF83)/6000).toFixed(4)}° — ${((lastResult.maxF83-lastResult.minF83)/6000) >= 0.1 ? '✓ plausible' : '✗ too small'}`);
  console.log(`f85 lon range: ${((lastResult.maxF85-lastResult.minF85)/6000).toFixed(4)}° — ${((lastResult.maxF85-lastResult.minF85)/6000) >= 0.1 ? '✓ plausible' : '✗ too small'}`);
  console.log(`f86 lon range: ${((lastResult.maxF86-lastResult.minF86)/6000).toFixed(4)}° — ${((lastResult.maxF86-lastResult.minF86)/6000) >= 0.1 ? '✓ plausible' : '✗ too small'}`);
  console.log(`f87 lon range: ${((lastResult.maxF87-lastResult.minF87)/6000).toFixed(4)}° — ${((lastResult.maxF87-lastResult.minF87)/6000) >= 0.1 ? '✓ plausible' : '✗ too small'}`);
}
