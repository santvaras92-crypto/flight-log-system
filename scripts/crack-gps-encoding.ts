/**
 * GPS Encoding Cracker — Test fields 81-83 (lat?) and 85-87 (lon?)
 * 
 * Header GPS: latRaw=-200377 lonRaw=-426878
 * These as bytes: 
 *   lat: -200377 → 0xFFFCF147 → bytes [0x47, 0xF1, 0xFC, 0xFF] = [71, 241, 252, 255]
 *   lon: -426878 → 0xFFF97C82 → bytes [0x82, 0x7C, 0xF9, 0xFF] = [130, 124, 249, 255]
 * 
 * Observation: fields 81,82 stabilize at 1020 (=4*255), field 83 varies 0→3418
 * Fields 85 varies -240→0, fields 86,87 vary widely
 * 
 * HYPOTHESIS: Maybe GPS uses a DIFFERENT accumulator seed based on flight header position
 * The accum fields start at 0, but should start at header lat/lon values!
 * Then the per-record deltas would be relative to the initial position.
 * 
 * But wait — the accumulator for fields 64+ IS initialized to 0.
 * The deltas are ADDED to 0. So the accum values ARE the absolute GPS values,
 * built up from zero through accumulated deltas.
 * 
 * Let me try: maybe the format is that fields 81+82*256+83*65536 = latRaw
 * and fields 85+86*256+87*65536 = lonRaw, and we need to combine with header seed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

const INIT_VALUE = 0xf0;
const JPI_DIR = path.join(__dirname2, '..', 'Engine Analisis');

function readByte(data: Buffer, pos: { v: number }): number {
  if (pos.v >= data.length) throw new Error('EOF');
  return data[pos.v++];
}
function readUint16BE(data: Buffer, pos: { v: number }): number {
  const hi = readByte(data, pos); const lo = readByte(data, pos);
  return (hi << 8) | lo;
}
function readAsciiLine(data: Buffer, pos: { v: number }): string | null {
  const start = pos.v;
  while (pos.v < data.length) {
    if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) {
      const line = data.subarray(start, pos.v).toString('ascii');
      pos.v += 2; return line;
    }
    pos.v++;
  }
  return null;
}

function crackGPS(filePath: string) {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  // Parse file header
  let protocol = 2;
  const flights: Array<{ flightNum: number; dataWords: number }> = [];
  while (pos.v < data.length) {
    const line = readAsciiLine(data, pos);
    if (!line) break;
    let clean = line;
    const si = clean.lastIndexOf('*');
    if (si >= 0) clean = clean.substring(0, si);
    if (!clean.startsWith('$')) continue;
    const type = clean[1];
    let rest = clean.substring(2);
    if (rest.startsWith(',')) rest = rest.substring(1);
    const vals = rest.split(',').map(v => v.trim());
    if (type === 'P') protocol = parseInt(vals[0]) || 2;
    if (type === 'D' && vals.length >= 2) flights.push({ flightNum: parseInt(vals[0])||0, dataWords: parseInt(vals[1])||0 });
    if (type === 'L') break;
  }

  // Parse first flight header
  const words: number[] = [];
  for (let i = 0; i < 14; i++) words.push(readUint16BE(data, pos));
  readByte(data, pos);

  let latRaw = (words[6] << 16) | words[7];
  let lonRaw = (words[8] << 16) | words[9];
  if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
  if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
  
  const interval = words[11] > 0 ? words[11] : 6;
  
  console.log(`File: ${path.basename(filePath)}, Flight #${words[0]}, Interval: ${interval}s`);
  console.log(`Header GPS: lat=${(latRaw/6000).toFixed(6)} lon=${(lonRaw/6000).toFixed(6)} (raw: ${latRaw}, ${lonRaw})`);
  
  // Initialize accumulator
  const accum = new Array<number>(128);
  for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0; accum[30] = 0;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  let elapsed = 0;
  let currentInterval = interval;
  let recordCount = 0;

  // Collect GPS track points
  const track: Array<{ rec: number; sec: number; f81: number; f82: number; f83: number; f85: number; f86: number; f87: number }> = [];

  while (pos.v < data.length && recordCount < 50000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readUint16BE(data, pos);
    const df2 = readUint16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    for (let r = 0; r < rep; r++) {
      track.push({ rec: recordCount, sec: elapsed, f81: accum[81], f82: accum[82], f83: accum[83], f85: accum[85], f86: accum[86], f87: accum[87] });
      elapsed += currentInterval;
      recordCount++;
    }

    const fieldFlags = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) fieldFlags[i] = readByte(data, pos);
    
    const signFlags = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) signFlags[i] = readByte(data, pos);

    const signBits = new Array<number>(128).fill(0);
    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (signFlags[bi] & (1 << bit)) signBits[bi * 8 + bit] = 1;
    signBits[42] = signBits[41];
    for (let i = 0; i < 6; i++) signBits[48 + i] = signBits[i];
    signBits[79] = signBits[78];

    for (let bi = 0; bi < 16; bi++) {
      for (let bit = 0; bit < 8; bit++) {
        const fi = bi * 8 + bit;
        if (fieldFlags[bi] & (1 << bit)) {
          const delta = readByte(data, pos);
          if (delta !== 0) {
            accum[fi] = signBits[fi] ? accum[fi] - delta : accum[fi] + delta;
          }
        }
      }
    }
    readByte(data, pos);

    const markVal = accum[16];
    if (markVal === 0x02) currentInterval = 1;
    else if (markVal === 0x03) currentInterval = interval;

    track.push({ rec: recordCount, sec: elapsed, f81: accum[81], f82: accum[82], f83: accum[83], f85: accum[85], f86: accum[86], f87: accum[87] });
    elapsed += currentInterval;
    recordCount++;
  }

  console.log(`\nTotal records: ${recordCount}, Duration: ${elapsed}s = ${(elapsed/60).toFixed(1)} min`);

  // Now try different encoding interpretations
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`ENCODING TESTS (sampled every ~5 min):`);
  console.log(`${'═'.repeat(70)}`);

  const sampleInterval = Math.max(1, Math.floor(track.length / 20));

  // Test A: f81+f82*256+f83*65536 for lat, f85+f86*256+f87*65536 for lon (seeded from header)
  console.log(`\nTest A: 3-byte LE (81+82<<8+83<<16 = lat accum, 85+86<<8+87<<16 = lon accum)`);
  console.log(`  Combined with header seed (header lat/lon + accum offset)`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    // Try combining: the accum fields might be OFFSETS from header position
    const latOffset = t.f81 + (t.f82 << 8) + (t.f83 << 16);
    const lonOffset = t.f85 + (t.f86 << 8) + (t.f87 << 16);
    // Signed 24-bit
    const latOS = latOffset > 0x7FFFFF ? latOffset - 0x1000000 : latOffset;
    const lonOS = lonOffset > 0x7FFFFF ? lonOffset - 0x1000000 : lonOffset;
    
    const lat = (latRaw + latOS) / 6000;
    const lon = (lonRaw + lonOS) / 6000;
    console.log(`  rec#${String(t.rec).padStart(5)} t=${String(t.sec).padStart(5)}s: f[81,82,83]=[${t.f81},${t.f82},${t.f83}] f[85,86,87]=[${t.f85},${t.f86},${t.f87}] → latOff=${latOS} lonOff=${lonOS} → lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
  }

  // Test B: Direct 3-byte as absolute coordinates ÷ 6000
  console.log(`\nTest B: 3-byte LE direct ÷ 6000 (no header seed):`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    let latV = t.f81 + (t.f82 << 8) + (t.f83 << 16);
    let lonV = t.f85 + (t.f86 << 8) + (t.f87 << 16);
    if (latV > 0x7FFFFF) latV -= 0x1000000;
    if (lonV > 0x7FFFFF) lonV -= 0x1000000;
    console.log(`  rec#${String(t.rec).padStart(5)}: raw lat=${latV} lon=${lonV} → lat=${(latV/6000).toFixed(6)} lon=${(lonV/6000).toFixed(6)}`);
  }

  // Test C: 2-byte pairs (83+82<<8 for lat, 87+86<<8 for lon) + header seed
  // Since 81 and 82 seem to stabilize at 1020 (~4*255), maybe they're not GPS
  // Maybe only 83=lat and 85,86,87=lon (different sizes)?
  console.log(`\nTest C: Single byte f83 as lat offset, 2-byte f86+f87<<8 as lon offset:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    const lat = (latRaw + t.f83) / 6000;
    const lonOff = t.f86 + (t.f87 << 8);
    const lonOS = lonOff > 32767 ? lonOff - 65536 : lonOff;
    const lon = (lonRaw + lonOS) / 6000;
    console.log(`  rec#${String(t.rec).padStart(5)}: latOff=${t.f83} lonOff=${lonOS} → lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
  }

  // Test D: Maybe f83 is lat scaled differently, f85 is lon 
  // IMPORTANT: What if the accum values ARE the coordinates in some format?
  // Header: lat=-33.396, lon=-71.146
  // f83 final = 433, f85 final = -233
  // f86 final = -117, f87 final = -60
  console.log(`\nTest D: f83 as lat offset ÷10 arcmin, (f85+(f86<<8)+(f87<<16)) as lon:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    const lat = -33.396 + (t.f83 / 6000);
    let lonV = t.f85 + (t.f86 << 8) + (t.f87 << 16);
    if (lonV > 0x7FFFFF) lonV -= 0x1000000;
    const lon = -71.146 + (lonV / 6000);
    console.log(`  rec#${String(t.rec).padStart(5)}: f83=${t.f83} → lat=${lat.toFixed(6)} | lonV=${lonV} → lon=${lon.toFixed(6)}`);
  }

  // Test E: Maybe 81-83 is latitude as 3-byte absolute (÷ some divisor) and 85-87 similarly
  // latRaw = -200377 (header). accum[81]=1020, [82]=1020, [83]=433
  // If we interpret 1020 + 1020*256 + 433*65536 = 1020 + 261120 + 28377088 = 28639228
  // ÷ 6000 = 4773. That's not a valid lat.
  // But if signed: stays positive, not helpful.
  // 
  // Let's try: maybe the encoding stores degrees and minutes separately
  // Or maybe it uses field 80 (=0) as MSB making it 4 bytes: 0+1020*1+1020*256+433*65536
  
  // Test F: Swap byte order for 81-83 → (83 + 82*256 + 81*65536) 
  console.log(`\nTest F: 3-byte BE (f83 + f82<<8 + f81<<16) as lat, (f87 + f86<<8 + f85<<16) as lon, + header seed:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    let latV = t.f83 + (t.f82 << 8) + (t.f81 << 16);
    let lonV = t.f87 + (t.f86 << 8) + (t.f85 << 16);
    if (latV > 0x7FFFFF) latV -= 0x1000000;
    if (lonV > 0x7FFFFF) lonV -= 0x1000000;
    const lat = (latRaw + latV) / 6000;
    const lon = (lonRaw + lonV) / 6000;
    console.log(`  rec#${String(t.rec).padStart(5)}: latV=${latV} lonV=${lonV} → lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
  }

  // Test G: Same as F but direct (not offset from header)
  console.log(`\nTest G: 3-byte BE (f83 + f82<<8 + f81<<16) direct ÷ 6000:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    let latV = t.f83 + (t.f82 << 8) + (t.f81 << 16);
    let lonV = t.f87 + (t.f86 << 8) + (t.f85 << 16);
    if (latV > 0x7FFFFF) latV -= 0x1000000;
    if (lonV > 0x7FFFFF) lonV -= 0x1000000;
    console.log(`  rec#${String(t.rec).padStart(5)}: latV=${latV} lonV=${lonV} → lat=${(latV/6000).toFixed(6)} lon=${(lonV/6000).toFixed(6)}`);
  }

  // Test H: 4-byte with field 80 and 84 (both stay 0)
  // f80 + f81<<8 + f82<<16 + f83<<24 LE
  console.log(`\nTest H: 4-byte LE (f80 + f81<<8 + f82<<16 + f83<<24), same for 84-87:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    let latV = 0 + (t.f81 << 8) + (t.f82 << 16) + (t.f83 << 24);
    let lonV = 0 + (t.f85 << 8) + (t.f86 << 16) + (t.f87 << 24);
    // Signed 32-bit
    if (latV > 0x7fffffff) latV -= 0x100000000;
    if (lonV > 0x7fffffff) lonV -= 0x100000000;
    const lat = latV / 6000;
    const lon = lonV / 6000;
    console.log(`  rec#${String(t.rec).padStart(5)}: latV=${latV} lonV=${lonV} → lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
  }
  
  // Test I: Maybe like RPM/EGT pattern where high byte is separate
  // What if f81=lat_lo, f83=lat_hi, and f85=lon_lo, f87=lon_hi?
  console.log(`\nTest I: f81=lat_lo + f83<<8=lat_hi, f85=lon_lo + f87<<8=lon_hi, + header seed ÷ 6000:`);
  for (let i = 0; i < track.length; i += sampleInterval) {
    const t = track[i];
    let latV = t.f81 + (t.f83 << 8);
    let lonV = t.f85 + (t.f87 << 8);
    if (latV > 32767) latV -= 65536;
    if (lonV > 32767) lonV -= 65536;
    const lat = (latRaw + latV) / 6000;
    const lon = (lonRaw + lonV) / 6000;
    console.log(`  rec#${String(t.rec).padStart(5)}: latV=${latV} lonV=${lonV} → lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
  }
}

const files = fs.readdirSync(JPI_DIR).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();
crackGPS(path.join(JPI_DIR, files[files.length - 1]));
