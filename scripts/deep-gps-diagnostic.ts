/**
 * Deep GPS Diagnostic for JPI EDM-830 files
 * ===========================================
 * Manually parses binary data to find GPS coordinates in per-record data.
 * 
 * The EDM-830 with a GTN 650 GPS definitely stores per-record lat/lon
 * (SavvyAviation can plot full GPS tracks from these files).
 * 
 * This script:
 * 1. Reads one flight raw binary
 * 2. Dumps ALL accumulator fields that ever change from their init value
 * 3. Tries multiple GPS encoding hypotheses
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INIT_VALUE = 0xf0; // 240
const JPI_DIR = path.join(__dirname, '..', 'Engine Analisis');

function readByte(data: Buffer, pos: { v: number }): number {
  if (pos.v >= data.length) throw new Error('EOF');
  return data[pos.v++];
}

function readUint16BE(data: Buffer, pos: { v: number }): number {
  const hi = readByte(data, pos);
  const lo = readByte(data, pos);
  return (hi << 8) | lo;
}

function readAsciiLine(data: Buffer, pos: { v: number }): string | null {
  const start = pos.v;
  while (pos.v < data.length) {
    if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) {
      const line = data.subarray(start, pos.v).toString('ascii');
      pos.v += 2;
      return line;
    }
    pos.v++;
  }
  return null;
}

function parseHeaderLine(line: string): { type: string; values: string[] } {
  let clean = line;
  const starIdx = clean.lastIndexOf('*');
  if (starIdx >= 0) clean = clean.substring(0, starIdx);
  if (clean.startsWith('$') && clean.length > 1) {
    const recType = clean[1];
    let rest = clean.substring(2);
    if (rest.startsWith(',')) rest = rest.substring(1);
    return { type: recType, values: rest.split(',').map(v => v.trim()) };
  }
  return { type: '', values: [] };
}

interface FileHeader {
  protocol: number;
  flights: Array<{ flightNum: number; dataWords: number }>;
}

function parseFileHeader(data: Buffer, pos: { v: number }): FileHeader {
  const hdr: FileHeader = { protocol: 2, flights: [] };
  while (pos.v < data.length) {
    const line = readAsciiLine(data, pos);
    if (!line) break;
    const { type, values } = parseHeaderLine(line);
    if (type === 'P') hdr.protocol = parseInt(values[0]) || 2;
    if (type === 'D' && values.length >= 2) {
      hdr.flights.push({ flightNum: parseInt(values[0]) || 0, dataWords: parseInt(values[1]) || 0 });
    }
    if (type === 'L') break;
  }
  return hdr;
}

interface FlightHdr {
  flightNumber: number;
  interval: number;
  latRaw: number;
  lonRaw: number;
  date: string;
}

function parseFlightHeader(data: Buffer, pos: { v: number }, protocol: number): FlightHdr {
  if (protocol >= 2) {
    const words: number[] = [];
    for (let i = 0; i < 14; i++) words.push(readUint16BE(data, pos));
    readByte(data, pos); // checksum

    let latCombined = (words[6] << 16) | words[7];
    let lonCombined = (words[8] << 16) | words[9];
    if (latCombined > 0x7fffffff) latCombined -= 0x100000000;
    if (lonCombined > 0x7fffffff) lonCombined -= 0x100000000;

    const dateRaw = words[12];
    const day = dateRaw & 0x1f;
    const month = (dateRaw >> 5) & 0x0f;
    let year = (dateRaw >> 9) & 0x7f;
    year = year < 75 ? year + 2000 : year + 1900;
    const timeRaw = words[13];
    const secs = (timeRaw & 0x1f) * 2;
    const mins = (timeRaw >> 5) & 0x3f;
    const hrs = (timeRaw >> 11) & 0x1f;

    return {
      flightNumber: words[0],
      interval: words[11] > 0 ? words[11] : 6,
      latRaw: latCombined,
      lonRaw: lonCombined,
      date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
    };
  }
  // Old format
  const words: number[] = [];
  for (let i = 0; i < 7; i++) words.push(readUint16BE(data, pos));
  readByte(data, pos);
  return {
    flightNumber: words[0],
    interval: words[3] > 0 ? words[3] : 6,
    latRaw: 0, lonRaw: 0,
    date: 'old-format'
  };
}

function analyzeOneFlight(filePath: string, flightIndex: number = 0) {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  const fileHdr = parseFileHeader(data, pos);
  
  console.log(`\nFile: ${path.basename(filePath)}`);
  console.log(`Protocol: ${fileHdr.protocol}, Flights: ${fileHdr.flights.length}`);

  if (flightIndex >= fileHdr.flights.length) {
    console.log(`Flight index ${flightIndex} out of range`);
    return;
  }

  // Skip to the desired flight
  for (let fi = 0; fi < flightIndex; fi++) {
    const { dataWords } = fileHdr.flights[fi];
    // Parse and skip this flight
    const fhdr = parseFlightHeader(data, pos, fileHdr.protocol);
    // We need to skip the data section - but it's variable length due to delta encoding
    // So we just read through it
    const accum = new Array(128).fill(0);
    for (let i = 0; i < 128; i++) accum[i] = i < 48 ? INIT_VALUE : (i < 56 ? 0 : (i < 64 ? INIT_VALUE : 0));
    accum[42] = 0;
    accum[30] = 0;
    
    let count = 0;
    while (pos.v < data.length && count < 50000) {
      const df1 = readUint16BE(data, pos);
      const df2 = readUint16BE(data, pos);
      if (df1 !== df2) { pos.v -= 4; break; }
      const rep = readByte(data, pos);
      if (df1 === 0 && rep === 0) { readByte(data, pos); break; }
      
      const ff = new Array(16).fill(0);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff[i] = readByte(data, pos);
      for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) readByte(data, pos);
      
      for (let bi = 0; bi < 16; bi++)
        for (let bit = 0; bit < 8; bit++)
          if (ff[bi] & (1 << bit)) readByte(data, pos);
      
      readByte(data, pos);
      count++;
    }
  }

  // Now parse the target flight in detail
  const { flightNum, dataWords } = fileHdr.flights[flightIndex];
  const fhdr = parseFlightHeader(data, pos, fileHdr.protocol);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Flight #${fhdr.flightNumber} | Date: ${fhdr.date} | Interval: ${fhdr.interval}s`);
  console.log(`Header GPS: latRaw=${fhdr.latRaw} lonRaw=${fhdr.lonRaw}`);
  console.log(`Header GPS (÷6000): lat=${(fhdr.latRaw / 6000).toFixed(6)} lon=${(fhdr.lonRaw / 6000).toFixed(6)}`);
  console.log(`${'='.repeat(70)}`);

  // Initialize accumulator
  const accum = new Array<number>(128);
  for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0;
  accum[30] = 0;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  // Track which fields ever change
  const fieldEverChanged = new Set<number>();
  const fieldMinVal = new Array<number>(128).fill(Infinity);
  const fieldMaxVal = new Array<number>(128).fill(-Infinity);
  const fieldFirstChange: Map<number, { record: number; oldVal: number; newVal: number; delta: number; sign: number }> = new Map();
  
  // Store full accumulator snapshots for GPS fields
  const gpsSnapshots: Array<{ record: number; fields: number[] }> = [];
  
  let recordCount = 0;
  let totalRecords = 0;
  
  // Track decode flags across all records
  const decFlagsHist: Map<number, number> = new Map();

  while (pos.v < data.length && totalRecords < 50000) {
    if (pos.v + 5 > data.length) break;

    const df1 = readUint16BE(data, pos);
    const df2 = readUint16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    decFlagsHist.set(df1, (decFlagsHist.get(df1) || 0) + 1);

    totalRecords += rep; // repeat records

    // Read field flags
    const fieldFlags = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) {
      if (df1 & (1 << i)) fieldFlags[i] = readByte(data, pos);
    }

    // Read sign flags
    const signFlags = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) {
      if (df1 & (1 << i)) {
        if (i !== 6 && i !== 7) {
          signFlags[i] = readByte(data, pos);
        }
      }
    }

    // Expand sign bits
    const signBits = new Array<number>(128).fill(0);
    for (let bi = 0; bi < 16; bi++) {
      for (let bit = 0; bit < 8; bit++) {
        if (signFlags[bi] & (1 << bit)) signBits[bi * 8 + bit] = 1;
      }
    }
    signBits[42] = signBits[41];
    for (let i = 0; i < 6; i++) signBits[48 + i] = signBits[i];
    signBits[79] = signBits[78];

    // Read and apply deltas
    for (let bi = 0; bi < 16; bi++) {
      for (let bit = 0; bit < 8; bit++) {
        const fieldIdx = bi * 8 + bit;
        if (fieldFlags[bi] & (1 << bit)) {
          const delta = readByte(data, pos);
          if (delta !== 0) {
            const oldVal = accum[fieldIdx];
            if (signBits[fieldIdx]) {
              accum[fieldIdx] -= delta;
            } else {
              accum[fieldIdx] += delta;
            }
            fieldEverChanged.add(fieldIdx);
            if (!fieldFirstChange.has(fieldIdx)) {
              fieldFirstChange.set(fieldIdx, {
                record: totalRecords,
                oldVal,
                newVal: accum[fieldIdx],
                delta,
                sign: signBits[fieldIdx]
              });
            }
          }
        }
      }
    }

    // Track min/max for all fields
    for (let i = 0; i < 128; i++) {
      fieldMinVal[i] = Math.min(fieldMinVal[i], accum[i]);
      fieldMaxVal[i] = Math.max(fieldMaxVal[i], accum[i]);
    }

    readByte(data, pos); // checksum

    // Save snapshot of fields 60-95 every 50 records
    if (totalRecords % 50 === 0 || totalRecords <= 5) {
      gpsSnapshots.push({
        record: totalRecords,
        fields: accum.slice(60, 96)
      });
    }

    totalRecords++;
    recordCount++;
  }

  console.log(`\nTotal delta records parsed: ${recordCount}, Total data points: ${totalRecords}`);
  
  console.log(`\nDecode flags histogram:`);
  const sortedFlags = [...decFlagsHist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [flags, count] of sortedFlags.slice(0, 10)) {
    const bits = [];
    for (let i = 0; i < 16; i++) if (flags & (1 << i)) bits.push(i);
    console.log(`  0x${flags.toString(16).padStart(4, '0')} (groups: [${bits.join(',')}]) → ${count} times`);
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`FIELDS THAT CHANGED (any non-zero delta throughout the flight):`);
  console.log(`${'─'.repeat(70)}`);
  
  const FIELD_NAMES: Record<number, string> = {
    0: 'EGT1-lo', 1: 'EGT2-lo', 2: 'EGT3-lo', 3: 'EGT4-lo',
    4: 'EGT5-lo', 5: 'EGT6-lo', 6: 'TIT1-lo', 7: 'TIT2-lo',
    8: 'CHT1', 9: 'CHT2', 10: 'CHT3', 11: 'CHT4',
    12: 'CHT5', 13: 'CHT6', 14: 'CLD', 15: 'OIL-T',
    16: 'MARK', 17: 'OIL-P', 18: 'CDT/CRB', 19: 'IAT',
    20: 'VOLTS', 21: 'OAT', 22: 'FUEL-USED', 23: 'FUEL-FLOW',
    24: '?24', 25: '?25', 26: '?26', 27: '?27',
    28: '?28', 29: '?29', 30: 'HP', 31: '?31',
    32: '?32', 33: '?33', 34: '?34', 35: '?35',
    36: '?36', 37: '?37', 38: '?38', 39: '?39',
    40: 'MAP', 41: 'RPM-lo', 42: 'RPM-hi',
    43: '?43', 44: '?44', 45: '?45', 46: '?46', 47: '?47',
    48: 'EGT1-hi', 49: 'EGT2-hi', 50: 'EGT3-hi', 51: 'EGT4-hi',
    52: 'EGT5-hi', 53: 'EGT6-hi', 54: 'TIT1-hi', 55: 'TIT2-hi',
    // Fields 64-71: suspected GPS group 1
    64: 'GPS?-64', 65: 'GPS?-65', 66: 'GPS?-66', 67: 'GPS?-67',
    68: 'GPS?-68', 69: 'GPS?-69', 70: 'GPS?-70', 71: 'GPS?-71',
    // Fields 72-79
    72: '?72', 73: '?73', 74: '?74', 75: '?75',
    76: '?76', 77: '?77', 78: 'HOURS-lo', 79: 'HOURS-hi',
    // Fields 80-87: suspected GPS group 2
    80: 'GPS?-80', 81: 'GPS?-81', 82: 'GPS?-82', 83: 'GPS?-83',
    84: 'GPS?-84', 85: 'GPS?-85', 86: 'GPS?-86', 87: 'GPS?-87',
    // Fields 88-95
    88: '?88', 89: '?89', 90: '?90', 91: '?91',
    92: '?92', 93: '?93', 94: '?94', 95: '?95',
  };
  
  const changedFields = [...fieldEverChanged].sort((a, b) => a - b);
  for (const f of changedFields) {
    const name = FIELD_NAMES[f] || `field-${f}`;
    const fc = fieldFirstChange.get(f)!;
    console.log(
      `  [${String(f).padStart(3)}] ${name.padEnd(12)} ` +
      `min=${String(fieldMinVal[f]).padStart(7)} max=${String(fieldMaxVal[f]).padStart(7)} ` +
      `first_change: rec#${fc.record} old=${fc.oldVal} Δ=${fc.sign ? '-' : '+'}${fc.delta} → ${fc.newVal}`
    );
  }

  // Now try to interpret GPS from various field combinations
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`GPS INTERPRETATION ATTEMPTS:`);
  console.log(`${'─'.repeat(70)}`);
  
  // Hypothesis 1: Fields 64-67 = lat (4 bytes), 68-71 = lon (4 bytes)
  // Combined as (f64 + f65*256 + f66*65536 + f67*16777216) signed ÷ 6000
  console.log(`\nH1: 4-byte combo (64-67=lat, 68-71=lon) ÷ 6000:`);
  for (const snap of gpsSnapshots.slice(0, 5)) {
    const f = snap.fields; // offset from 60
    const lat4 = f[4] + (f[5] << 8) + (f[6] << 16) + (f[7] << 24);
    const lon4 = f[8] + (f[9] << 8) + (f[10] << 16) + (f[11] << 24);
    // Signed
    const latS = lat4 > 0x7fffffff ? lat4 - 0x100000000 : lat4;
    const lonS = lon4 > 0x7fffffff ? lon4 - 0x100000000 : lon4;
    console.log(`  rec#${snap.record}: raw lat=${latS} lon=${lonS} → lat=${(latS/6000).toFixed(4)} lon=${(lonS/6000).toFixed(4)}`);
  }

  // Hypothesis 2: Fields 80-83 = lat, 84-87 = lon (4 bytes each)
  console.log(`\nH2: 4-byte combo (80-83=lat, 84-87=lon) ÷ 6000:`);
  for (const snap of gpsSnapshots.slice(0, 5)) {
    const f = snap.fields; // offset from 60
    const lat4 = f[20] + (f[21] << 8) + (f[22] << 16) + (f[23] << 24);
    const lon4 = f[24] + (f[25] << 8) + (f[26] << 16) + (f[27] << 24);
    const latS = lat4 > 0x7fffffff ? lat4 - 0x100000000 : lat4;
    const lonS = lon4 > 0x7fffffff ? lon4 - 0x100000000 : lon4;
    console.log(`  rec#${snap.record}: raw lat=${latS} lon=${lonS} → lat=${(latS/6000).toFixed(4)} lon=${(lonS/6000).toFixed(4)}`);
  }

  // Hypothesis 3: 2-byte pairs (like RPM encoding)
  // Maybe lat = f[64] + f[65]*256, lon = f[66] + f[67]*256 (in 1/10 minute format?)
  console.log(`\nH3: 2-byte pairs (64+65=lat, 66+67=lon):`);
  for (const snap of gpsSnapshots.slice(0, 5)) {
    const f = snap.fields;
    const lat2 = f[4] + (f[5] << 8);
    const lon2 = f[6] + (f[7] << 8);
    const latS = lat2 > 32767 ? lat2 - 65536 : lat2;
    const lonS = lon2 > 32767 ? lon2 - 65536 : lon2;
    console.log(`  rec#${snap.record}: raw lat=${latS} lon=${lonS} → /6000: lat=${(latS/6000).toFixed(6)} lon=${(lonS/6000).toFixed(6)} → /600: lat=${(latS/600).toFixed(4)} lon=${(lonS/600).toFixed(4)} → /60: lat=${(latS/60).toFixed(4)} lon=${(lonS/60).toFixed(4)}`);
  }

  // Hypothesis 4: Maybe GPS uses BIG-endian byte order (like flight header)
  // header uses (word[6] << 16) | word[7] which is big-endian 32-bit
  console.log(`\nH4: Big-endian 4-byte (64=MSB, 67=LSB for lat, 68-71 for lon) ÷ 6000:`);
  for (const snap of gpsSnapshots.slice(0, 5)) {
    const f = snap.fields;
    const lat4 = (f[4] << 24) + (f[5] << 16) + (f[6] << 8) + f[7];
    const lon4 = (f[8] << 24) + (f[9] << 16) + (f[10] << 8) + f[11];
    const latS = lat4 > 0x7fffffff ? lat4 - 0x100000000 : lat4;
    const lonS = lon4 > 0x7fffffff ? lon4 - 0x100000000 : lon4;
    console.log(`  rec#${snap.record}: raw lat=${latS} lon=${lonS} → lat=${(latS/6000).toFixed(4)} lon=${(lonS/6000).toFixed(4)}`);
  }

  // Hypothesis 5: Fields 80-83 with big-endian
  console.log(`\nH5: Big-endian 4-byte (80-83=lat, 84-87=lon) ÷ 6000:`);
  for (const snap of gpsSnapshots.slice(0, 5)) {
    const f = snap.fields;
    const lat4 = (f[20] << 24) + (f[21] << 16) + (f[22] << 8) + f[23];
    const lon4 = (f[24] << 24) + (f[25] << 16) + (f[26] << 8) + f[27];
    const latS = lat4 > 0x7fffffff ? lat4 - 0x100000000 : lat4;
    const lonS = lon4 > 0x7fffffff ? lon4 - 0x100000000 : lon4;
    console.log(`  rec#${snap.record}: raw lat=${latS} lon=${lonS} → lat=${(latS/6000).toFixed(4)} lon=${(lonS/6000).toFixed(4)}`);
  }

  // Hypothesis 6: Maybe the GPS accumulator should be SEEDED from the header position
  // and then per-record deltas modify it. The deltas being zero would mean "same position"
  // but as the plane moves, there should be non-zero deltas... unless fields 64-71 are NOT the GPS fields!
  // Let's check fields 80-87 more carefully with header seed
  console.log(`\nH6: Seed accum[80-83] from header lat, accum[84-87] from header lon, check evolution:`);
  console.log(`  Header latRaw=${fhdr.latRaw} → bytes: [${fhdr.latRaw & 0xFF}, ${(fhdr.latRaw >> 8) & 0xFF}, ${(fhdr.latRaw >> 16) & 0xFF}, ${(fhdr.latRaw >> 24) & 0xFF}]`);
  console.log(`  Header lonRaw=${fhdr.lonRaw} → bytes: [${fhdr.lonRaw & 0xFF}, ${(fhdr.lonRaw >> 8) & 0xFF}, ${(fhdr.lonRaw >> 16) & 0xFF}, ${(fhdr.lonRaw >> 24) & 0xFF}]`);

  // Final field values dump for fields 60-95
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`FINAL ACCUMULATOR VALUES for fields 60-127:`);
  for (let i = 60; i < 128; i++) {
    if (accum[i] !== 0 || fieldEverChanged.has(i)) {
      const name = FIELD_NAMES[i] || `field-${i}`;
      console.log(`  [${i}] ${name}: ${accum[i]} (0x${(accum[i] & 0xFF).toString(16).padStart(2, '0')}) ${fieldEverChanged.has(i) ? 'CHANGED' : 'static'}`);
    }
  }

  // SNAPSHOTS evolution
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`ACCUMULATOR SNAPSHOTS (fields 60-95) over time:`);
  console.log(`${'─'.repeat(70)}`);
  for (const snap of gpsSnapshots) {
    // Only show non-zero or changing fields
    const interesting: string[] = [];
    for (let i = 0; i < 36; i++) {
      const fi = 60 + i;
      if (snap.fields[i] !== 0 || fieldEverChanged.has(fi)) {
        interesting.push(`[${fi}]=${snap.fields[i]}`);
      }
    }
    if (interesting.length > 0) {
      console.log(`  rec#${snap.record}: ${interesting.join(' ')}`);
    }
  }

  // Hypothesis 7: Check if there are fields above 95 that change
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`ALL CHANGED FIELDS ABOVE 60:`);
  for (const f of changedFields.filter(f => f >= 60)) {
    console.log(`  [${f}] final=${accum[f]} min=${fieldMinVal[f]} max=${fieldMaxVal[f]}`);
  }

  // Hypothesis 8: Maybe GPS is in decode flag groups 8 (fields 64-71)
  // but the sign handling is different - maybe bytes 8,9 don't have sign flags either
  // Let's check: byte groups 6 and 7 skip sign flags. What about 8,9,10?
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`SIGN FLAG ANALYSIS:`);
  console.log(`Groups 6,7 (fields 48-63) have NO sign flags in current decoder.`);
  console.log(`What if groups 8,9,10 (fields 64-87) also skip sign flags?`);
  console.log(`This would shift ALL subsequent delta bytes, potentially fixing alignment!`);
}

// Find a recent file with GPS in header
const files = fs.readdirSync(JPI_DIR).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();

// Use the most recent file
const testFile = files[files.length - 1]; // Most recent
console.log(`Testing with most recent file: ${testFile}`);
analyzeOneFlight(path.join(JPI_DIR, testFile), 0);

// Also try a file from mid-2024 (more likely to have flight data)
if (files.length > 10) {
  const midFile = files[Math.floor(files.length * 0.8)];
  console.log(`\n\n${'#'.repeat(70)}`);
  console.log(`Testing with second file: ${midFile}`);
  analyzeOneFlight(path.join(JPI_DIR, midFile), 0);
}
