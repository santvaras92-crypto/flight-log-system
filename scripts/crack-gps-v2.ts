/**
 * GPS Cracker v2 — Focus on f83 for lat (works!) and find lon encoding
 * 
 * From Test C: f83 as lat offset works perfectly:
 *   lat = (headerLatRaw + f83) / 6000
 *   range: -33.396 to -32.86 ✓ (SCCV area, 0.5° range is ~55km flight)
 * 
 * But lon using f86+f87<<8 gives wrong values (-75 to -53 range too wide)
 * 
 * Need to find correct lon encoding from f85, f86, f87
 * 
 * KEY INSIGHT: Maybe field 82 is the lat "middle byte" and 83 is "high byte"
 * like EGT uses low+high. So lat = f81 + f83<<8 (skip f82 as something else)
 * 
 * Or: Maybe lat and lon both use 3 bytes but with the header position as BASE.
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

function crackV2(filePath: string) {
  const data = fs.readFileSync(filePath);
  const pos = { v: 0 };
  
  // Skip to $L line
  let protocol = 2;
  while (pos.v < data.length) {
    const start = pos.v;
    while (pos.v < data.length) {
      if (pos.v + 1 < data.length && data[pos.v] === 0x0d && data[pos.v + 1] === 0x0a) { 
        const line = data.subarray(start, pos.v).toString('ascii');
        pos.v += 2;
        let clean = line; const si = clean.lastIndexOf('*'); if (si >= 0) clean = clean.substring(0, si);
        if (clean.startsWith('$P')) protocol = parseInt(clean.substring(3)) || 2;
        if (clean.startsWith('$L')) break;
        break;
      }
      pos.v++;
    }
    if (data.subarray(start, pos.v).toString('ascii').includes('$L')) break;
  }

  // Flight header
  const words: number[] = [];
  for (let i = 0; i < 14; i++) words.push(readU16BE(data, pos));
  readByte(data, pos);

  let latRaw = (words[6] << 16) | words[7];
  let lonRaw = (words[8] << 16) | words[9];
  if (latRaw > 0x7fffffff) latRaw -= 0x100000000;
  if (lonRaw > 0x7fffffff) lonRaw -= 0x100000000;
  const interval = words[11] > 0 ? words[11] : 6;

  console.log(`File: ${path.basename(filePath)}, Flight #${words[0]}`);
  console.log(`Header: lat=${(latRaw/6000).toFixed(6)} lon=${(lonRaw/6000).toFixed(6)}`);
  console.log(`Header raw: lat=${latRaw} lon=${lonRaw}`);
  console.log(`lat bytes: [${latRaw & 0xFF}, ${(latRaw>>8) & 0xFF}, ${(latRaw>>16) & 0xFF}, ${(latRaw>>24) & 0xFF}]`);
  console.log(`lon bytes: [${lonRaw & 0xFF}, ${(lonRaw>>8) & 0xFF}, ${(lonRaw>>16) & 0xFF}, ${(lonRaw>>24) & 0xFF}]`);

  // Init accum
  const accum = new Array<number>(128);
  for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
  for (let i = 48; i < 56; i++) accum[i] = 0;
  accum[42] = 0; accum[30] = 0;
  for (let i = 64; i < 128; i++) accum[i] = 0;

  let elapsed = 0;
  let ci = interval;
  let rc = 0;

  // Collect all GPS snapshots
  const pts: Array<{
    rec: number; sec: number;
    f80: number; f81: number; f82: number; f83: number;
    f84: number; f85: number; f86: number; f87: number;
  }> = [];

  while (pos.v < data.length && rc < 50000) {
    if (pos.v + 5 > data.length) break;
    const df1 = readU16BE(data, pos);
    const df2 = readU16BE(data, pos);
    if (df1 !== df2) { pos.v -= 4; break; }
    const rep = readByte(data, pos);
    if (df1 === 0 && rep === 0) { readByte(data, pos); break; }

    for (let r = 0; r < rep; r++) {
      if (rc % 100 === 0 || rc < 3) {
        pts.push({
          rec: rc, sec: elapsed,
          f80: accum[80], f81: accum[81], f82: accum[82], f83: accum[83],
          f84: accum[84], f85: accum[85], f86: accum[86], f87: accum[87]
        });
      }
      elapsed += ci; rc++;
    }

    const ff = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) ff[i] = readByte(data, pos);
    const sf = new Array<number>(16).fill(0);
    for (let i = 0; i < 16; i++) if (df1 & (1 << i)) if (i !== 6 && i !== 7) sf[i] = readByte(data, pos);

    const sb = new Array<number>(128).fill(0);
    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) if (sf[bi] & (1 << bit)) sb[bi * 8 + bit] = 1;
    sb[42] = sb[41]; for (let i = 0; i < 6; i++) sb[48 + i] = sb[i]; sb[79] = sb[78];

    for (let bi = 0; bi < 16; bi++) for (let bit = 0; bit < 8; bit++) {
      const fi = bi * 8 + bit;
      if (ff[bi] & (1 << bit)) {
        const d = readByte(data, pos);
        if (d !== 0) accum[fi] = sb[fi] ? accum[fi] - d : accum[fi] + d;
      }
    }
    readByte(data, pos);

    if (accum[16] === 0x02) ci = 1; else if (accum[16] === 0x03) ci = interval;

    if (rc % 100 === 0 || rc < 3) {
      pts.push({
        rec: rc, sec: elapsed,
        f80: accum[80], f81: accum[81], f82: accum[82], f83: accum[83],
        f84: accum[84], f85: accum[85], f86: accum[86], f87: accum[87]
      });
    }
    elapsed += ci; rc++;
  }

  console.log(`\nTotal records: ${rc}`);

  // The key observation: f81 and f82 stabilize at 1020 (=4*255)
  // This looks like they're incrementing by 255 four times, then stopping
  // This pattern is suspicious — 255 is the max delta byte value
  // Maybe f81 and f82 are NOT part of lat at all
  // 
  // Let me look at what the ACTUAL lat/lon should be at various points
  // For a flight from SCCV (-33.396, -71.146):
  // - takeoff: -33.396, -71.146
  // - cruise nearby: lat should be -34 to -32, lon should be -72 to -70
  // - landing: back to -33.396, -71.146
  //
  // f83 varies: 0 → 3418 → 433 (at end, close to start)
  // range: 0 to 3418 delta → as latRaw offset that's 3418/6000 = 0.57° ≈ 63km
  // That's reasonable for a local training flight!
  //
  // For lon, what field combo gives a similar range?
  // f85: -240 to 0 → range 240 → 240/6000 = 0.04° = too small (4km)
  // f86: -610 to 180 → range 790 → 790/6000 = 0.13° ≈ 15km 
  // f87: -172 to 726 → range 898 → 898/6000 = 0.15° ≈ 17km
  //
  // None of the single lon fields have enough range individually
  // But f85 + f86*256 gives larger range...
  // Actually: f85 varies -240 to 0 and f86 varies -610 to 180
  // 2-byte signed: f85 + f86*256:
  //   min: -240 + (-610)*256 = -156400 → /6000 = -26° (too much)
  //   max: 0 + 180*256 = 46080 → /6000 = 7.7° (also too much)
  // 
  // Hmm, but those are ACCUMULATED values from delta compression.
  // Wait — the accumulator starts at 0 for these fields.
  // Each delta adds/subtracts. So the final value IS the accumulated GPS offset.
  // 
  // BUT: maybe the interpretation is that each field is a SEPARATE component:
  // f83 = latitude "degrees*100 + minutes" or similar?
  // 
  // Let me try: for f83 at record ~3500 (deep in flight), value=2930
  // If this is lat offset: -200377 + 2930 = -197447 → /6000 = -32.908
  // That's lat -32.908, which is ~55km north of SCCV. Reasonable!
  //
  // Now f85=-135, f86=130, f87=576 at same time
  // If lon uses JUST f85 as offset: -426878 + (-135) = -427013 → /6000 = -71.169
  // That's only 2km from start. For a flight 55km north, lon should change more.
  //
  // What if lon = f85 + f86*256?  -135 + 130*256 = 33145
  //   lonRaw + 33145 = -426878 + 33145 = -393733 → /6000 = -65.622
  //   Too far east (in Argentina)
  //
  // What if lon = f85 + f87*256?  -135 + 576*256 = 147321
  //   lonRaw + 147321 = -426878 + 147321 = -279557 → /6000 = -46.593
  //   Way too far east
  //
  // What if lon = f86 + f87*256?  130 + 576*256 = 147586
  //   lonRaw + 147586 = -426878 + 147586 = -279292 → /6000 = -46.549
  //   Still wrong
  
  // NEW APPROACH: What if 81=ground speed, 82=track angle, and only 83=something?
  // f81 stabilizes at 1020 → maybe that's 102.0 knots ground speed? That's reasonable!
  // f82 stabilizes at 1020 → maybe track angle? But degrees should be 0-360...
  // Actually if divided by 10: 102.0. As a heading that could work for some directions.
  // 
  // Let me check: 
  // f81 first changes at rec#85 with Δ=+255 → 255, then keeps adding to reach 1020
  // That's 4 additions of 255 each = 4*255 = 1020
  // This is suspicious — 255 is max byte value. 
  // Maybe the true value is 1020/10 = 102.0 knots ground speed?
  
  // Let me focus differently. What if fields 81 and 82 are ground speed and heading,
  // and fields 83,85,86,87 encode lat/lon?
  // f83 for lat looks correct. That leaves f85,f86,f87 for lon.
  
  // But the problem with 3-byte lon is that we tried it and got wrong values.
  // UNLESS the sign handling is different for GPS fields.
  //
  // CRITICAL INSIGHT: Groups 10 (fields 80-87) DO have sign flags in the decoder
  // (only groups 6,7 skip sign flags). But what if GPS fields 80-87 SHOULD skip them too?
  // OR: what if the sign propagation is different for GPS fields?
  
  // Let me check: the first non-zero values for f86 and f87 appear at rec#0 
  // with delta=-100 each. Then they stay at -100 for a while.
  // If -100 is wrong and it should be +100, then at rec#100:
  // f86 was -610 → would be 410 instead
  // f87 was 410 → would be -610 instead  
  // That looks like a sign swap between f86 and f87!

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`FOCUSED TESTS:`);
  console.log(`${'═'.repeat(70)}`);

  // Test: f83 = lat offset (confirmed), f85+f86*256 = lon offset but with corrected signs
  // What if we need to interpret accumulated values differently?
  // At the END of flight: f83=433, f85=-233, f86=-117, f87=-60
  // The plane should be back at SCCV (lat=-33.396, lon=-71.146)
  // lat check: (-200377 + 433) / 6000 = -33.324 (close to -33.396, off by 0.07°)
  //   Hmm, not exact. Maybe needs f81 or f82 as well?
  //   With f81=1020: (-200377 + 1020 + 433*???) ??? No, that overshoots.
  
  // Wait, let me reconsider the FIELD ASSIGNMENT.
  // Maybe it's not 81=lat_lo, 83=lat_hi. Let me check the field assignment
  // more carefully by looking at the INITIAL POSITION encoding.
  
  // Header: latRaw=-200377, lonRaw=-426878
  // These are stored as (words[6]<<16)|words[7] and (words[8]<<16)|words[9]
  // 
  // latRaw = -200377 = 0xFFFCF147
  // As bytes (LE): [0x47, 0xF1, 0xFC, 0xFF] = [71, 241, 252, 255]
  //
  // lonRaw = -426878 = 0xFFF97C82  
  // As bytes (LE): [0x82, 0x7C, 0xF9, 0xFF] = [130, 124, 249, 255]
  //
  // If the 4-byte accumulator fields map to these bytes:
  // lat: field 80=byte0, 81=byte1, 82=byte2, 83=byte3
  //   → accum should reach: 80=71, 81=241, 82=252, 83=255 (or similar)
  //   But they reach: 80=0, 81=1020, 82=1020, 83=433
  //   → NOT matching byte decomposition
  //
  // What if lat is stored as SIGNED accumulator where:
  //   accum value = latitude * 6000 as a full integer (not byte-decomposed)?
  //   Then accum[83] at end = 433, and expected lat offset from start = near 0
  //   → 433/6000 = 0.072° = ~8km  (reasonable for landing back near takeoff?)
  //   Actually the GPS might show the last recorded position, not necessarily
  //   exactly at SCCV if the recorder stopped while taxiing slightly off-center.
  
  // I think the CORRECT interpretation might be simpler than expected:
  // - f81 = ground speed (knots * 10 or just knots)
  // - f82 = track/heading
  // - f83 = latitude offset (from header position) in units of 1/6000 of a degree  
  // - f85 = some lon component
  // - f86 = some lon component  
  // - f87 = some lon component or altitude
  
  // Let me try: lon = header_lon + f85 (just f85 as offset)
  console.log(`\nLatLon Test: lat=(headerLat+f83)/6000, lon=(headerLon+f85)/6000`);
  console.log(`(f81=GS?, f82=TRK?, f86=?, f87=?)`);
  for (const pt of pts.filter((_, i) => i % 5 === 0).slice(0, 25)) {
    const lat = (latRaw + pt.f83) / 6000;
    const lon = (lonRaw + pt.f85) / 6000;
    console.log(`  rec#${String(pt.rec).padStart(5)} t=${String(pt.sec).padStart(5)}s: lat=${lat.toFixed(6)} lon=${lon.toFixed(6)} | GS?=${pt.f81} TRK?=${pt.f82} f86=${pt.f86} f87=${pt.f87}`);
  }

  // What if lat and lon use DIFFERENT field groups?
  // lat = 83 alone (works for range) 
  // lon: maybe it uses f86 alone (but range is -610 to 180 → 790/6000 = 0.13° too small)
  // or f87 alone (-172 to 726 → 898/6000 = 0.15° too small)
  // or (f86 + f87) combined somehow
  
  // Let me try lon = (headerLon + f86) with different divisors
  console.log(`\nLon tests with f86 only (different divisors):`);
  console.log(`  f86 range: -610 to 180`);
  console.log(`  As /6000 offset: ${(-610/6000).toFixed(4)} to ${(180/6000).toFixed(4)} degrees`);
  console.log(`  As /600 offset: ${(-610/600).toFixed(4)} to ${(180/600).toFixed(4)} degrees`);
  console.log(`  As /60 offset: ${(-610/60).toFixed(4)} to ${(180/60).toFixed(4)} degrees`);
  
  console.log(`\nLon tests with f87 only (different divisors):`);
  console.log(`  f87 range: -172 to 726`);
  console.log(`  As /6000 offset: ${(-172/6000).toFixed(4)} to ${(726/6000).toFixed(4)} degrees`);
  console.log(`  As /600 offset: ${(-172/600).toFixed(4)} to ${(600/600).toFixed(4)} degrees`);
  console.log(`  As /60 offset: ${(-172/60).toFixed(4)} to ${(726/60).toFixed(4)} degrees`);

  // Hmm, f87 with /60: -2.87 to 12.1 degrees → way too much
  // f87 with /600: -0.287 to 1.21 degrees → also too much (1.2° = 130km)
  // f86 with /600: -1.02 to 0.3 degrees → range of 1.3° = 145km  
  // For a ~55km north flight, I'd expect lon to vary by maybe 0.3-0.5°

  // WAIT. Let me look at this completely differently.
  // What if fields 81-83 and 85-87 form TWO separate 3-byte values
  // but they store ABSOLUTE lat/lon (not offset from header)?
  
  // If lat = (f81 + f82*256 + f83*65536) and this needs to be signed:
  // At start: all 0 → lat = 0/6000 = 0° — that's wrong
  // But maybe the accumulator should be SEEDED from the header?!
  // 
  // What if fields 80-83 should start at latRaw decomposed into bytes?
  // latRaw = -200377
  // As 4 bytes LE: [71, 241, 252, 255]
  // So accum[80] should start at 71, accum[81] at 241, accum[82] at 252, accum[83] at 255
  // 
  // But currently accum[80-83] starts at 0!
  // If we seed them:
  // After accumulating the first deltas at rec#0: f81 gets +255 → 241+255 = 496
  // That doesn't make sense either because 496 > 255 and it's supposed to be a byte field
  
  // Actually wait — the accumulator is NOT byte-limited.
  // RPM for example: accum[41] goes from 240 to values > 2000. 
  // So the accumulator is a full integer, and the final value for RPM is 
  // accum[41] + accum[42]*256.
  
  // So for GPS, if we SEED the accumulator:
  // accum[80] = latRaw & 0xFF = 71
  // accum[81] = (latRaw >> 8) & 0xFF = 241
  // accum[82] = (latRaw >> 16) & 0xFF = 252
  // accum[83] = (latRaw >> 24) & 0xFF = 255
  // Then reconstitute: accum[80] + accum[81]*256 + accum[82]*65536 + accum[83]*16777216
  // Initially = 71 + 241*256 + 252*65536 + 255*16777216 = -200377 (signed 32-bit) ✓
  
  // But wait, the deltas ADD to these. After first delta at rec#85:
  // f81 += 255 → 241 + 255 = 496
  // Then reconstitute: 71 + 496*256 + ... → that changes the lat value
  
  // Let me actually TRY this seeding approach!
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`SEEDED ACCUMULATOR TEST:`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Seeding accum[80-83] with latRaw bytes, accum[84-87] with lonRaw bytes`);
  
  // Re-compute with seeded accumulator
  const seed80 = latRaw & 0xFF;         // 71
  const seed81 = (latRaw >> 8) & 0xFF;  // 241
  const seed82 = (latRaw >> 16) & 0xFF; // 252  
  const seed83 = (latRaw >> 24) & 0xFF; // 255
  const seed84 = lonRaw & 0xFF;         // 130
  const seed85 = (lonRaw >> 8) & 0xFF;  // 124
  const seed86 = (lonRaw >> 16) & 0xFF; // 249
  const seed87 = (lonRaw >> 24) & 0xFF; // 255

  console.log(`Lat seeds: [${seed80}, ${seed81}, ${seed82}, ${seed83}]`);
  console.log(`Lon seeds: [${seed84}, ${seed85}, ${seed86}, ${seed87}]`);

  for (const pt of pts.filter((_, i) => i % 5 === 0).slice(0, 30)) {
    // Add seed to accumulated values
    const a80 = seed80 + pt.f80;
    const a81 = seed81 + pt.f81;
    const a82 = seed82 + pt.f82;
    const a83 = seed83 + pt.f83;
    const a84 = seed84 + pt.f84;
    const a85 = seed85 + pt.f85;
    const a86 = seed86 + pt.f86;
    const a87 = seed87 + pt.f87;

    // Reconstitute 32-bit values (treating each accum as a byte-width delta)
    // Need to handle carry between bytes
    // Actually this is wrong — the accum values aren't byte-clamped
    // Let me just add the total offset to the raw values
    
    // Total lat offset = pt.f80 + pt.f81*256 + pt.f82*65536 + pt.f83*16777216
    // But these are accumulated values where each byte-position accumulates independently
    // This is the nature of JPI delta compression
    
    let latOff = pt.f80 + pt.f81 * 256 + pt.f82 * 65536 + pt.f83 * 16777216;
    let lonOff = pt.f84 + pt.f85 * 256 + pt.f86 * 65536 + pt.f87 * 16777216;
    // Sign handling for 32-bit
    if (latOff > 0x7fffffff) latOff -= 0x100000000;
    if (lonOff > 0x7fffffff) lonOff -= 0x100000000;
    
    const lat = (latRaw + latOff) / 6000;
    const lon = (lonRaw + lonOff) / 6000;
    
    // Also try with just the meaningful fields (80 and 84 are always 0)
    let latOff2 = pt.f81 * 256 + pt.f83 * 16777216;
    let lonOff2 = pt.f85 * 256 + pt.f87 * 16777216;
    if (latOff2 > 0x7fffffff) latOff2 -= 0x100000000;
    if (lonOff2 > 0x7fffffff) lonOff2 -= 0x100000000;
    
    const lat2 = (latRaw + latOff2) / 6000;
    const lon2 = (lonRaw + lonOff2) / 6000;
    
    console.log(`  rec#${String(pt.rec).padStart(5)} t=${String(pt.sec).padStart(5)}s: ` +
      `lat4B=${lat.toFixed(4)} lon4B=${lon.toFixed(4)} | ` +
      `lat_81+83=${lat2.toFixed(4)} lon_85+87=${lon2.toFixed(4)} | ` +
      `f[80-87]=[${pt.f80},${pt.f81},${pt.f82},${pt.f83},${pt.f84},${pt.f85},${pt.f86},${pt.f87}]`);
  }

  // One more idea: maybe it's 2 16-bit values, not 4 8-bit
  // lat = f81 + f82<<8 (where f81,f82 are the two bytes of a 16-bit lat low word)
  // But f81 and f82 reach 1020 which is > 255... unless there's carry
  // No, in JPI delta compression each field IS an independent integer
  
  // Let me try: what if the fields map like EGT?
  // EGT: low=accum[0], high=accum[48] → value = low + high*256
  // GPS: lat_lo=accum[83], lat_hi=accum[81] → lat = lat_lo + lat_hi*256?
  // Or: lat_lo=accum[81], lat_hi=accum[83] → lat = lat_lo + lat_hi*256?
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`EGT-STYLE ENCODING TEST (lo+hi<<8):`);  
  console.log(`${'═'.repeat(70)}`);
  
  for (const pt of pts.filter((_, i) => i % 5 === 0).slice(0, 25)) {
    // Test: f81=lo, f83=hi for lat; f85=lo, f87=hi for lon
    let latV = pt.f81 + (pt.f83 << 8);
    let lonV = pt.f85 + (pt.f87 << 8);
    // Sign: these could be signed 16-bit accumulated
    // But they're bigger than 16-bit because accum isn't clamped
    
    const latA = (latRaw + latV) / 6000;
    const lonA = (lonRaw + lonV) / 6000;

    // Reverse: f83=lo, f81=hi  
    let latV2 = pt.f83 + (pt.f81 << 8);
    let lonV2 = pt.f87 + (pt.f85 << 8);
    
    const latB = (latRaw + latV2) / 6000;
    const lonB = (lonRaw + lonV2) / 6000;

    console.log(`  rec#${String(pt.rec).padStart(5)}: ` +
      `81lo+83hi: lat=${latA.toFixed(4)} lon=${lonA.toFixed(4)} | ` +
      `83lo+81hi: lat=${latB.toFixed(4)} lon=${lonB.toFixed(4)}`);
  }

  // MAYBE: f82 and f86 are ground speed and track, not lat/lon!
  // Let's check: f82 stabilizes at 1020, like f81.
  // If f82/10 = 102.0 → could be track angle (heading 102°)?
  // Actually 1020/10 = 102 → but heading can't be >360
  // 1020/1 = 1020 → not a valid heading
  // Maybe it's knots and heading but accumulated differently
  
  // FINAL IDEA: What if I'm wrong about which fields are GPS?
  // Let me check: are there ANY fields between 64-79 that change?
  // From the first diagnostic: fields 64-71 NEVER change (all zero)!
  // Fields 72-77 also never change.
  // Fields 78-79 are HOURS.
  // So GPS is definitely in 80-87 (the only changing fields above 64 besides HOURS).
  //
  // 6 changing fields: 81, 82, 83, 85, 86, 87
  // (80 and 84 never change — always 0)
  //
  // These 6 values could be: lat, lon, altitude, ground speed, track, distance
  // Let me check which pairs give valid Chile coordinates!

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`ALL POSSIBLE PAIRS as lat/lon offset from header (÷6000):`);
  console.log(`${'═'.repeat(70)}`);

  // Use a mid-flight point and check which combo gives valid Chile coords
  const midPt = pts[Math.floor(pts.length / 2)];
  console.log(`Using mid-flight point rec#${midPt.rec}: f81=${midPt.f81} f82=${midPt.f82} f83=${midPt.f83} f85=${midPt.f85} f86=${midPt.f86} f87=${midPt.f87}`);
  
  const fields = [
    { name: 'f81', val: midPt.f81 },
    { name: 'f82', val: midPt.f82 },
    { name: 'f83', val: midPt.f83 },
    { name: 'f85', val: midPt.f85 },
    { name: 'f86', val: midPt.f86 },
    { name: 'f87', val: midPt.f87 },
  ];

  for (let li = 0; li < fields.length; li++) {
    for (let lj = 0; lj < fields.length; lj++) {
      if (li === lj) continue;
      const latF = fields[li];
      const lonF = fields[lj];
      const lat = (latRaw + latF.val) / 6000;
      const lon = (lonRaw + lonF.val) / 6000;
      const valid = lat >= -45 && lat <= -25 && lon >= -80 && lon <= -60;
      if (valid) {
        console.log(`  ✓ ${latF.name}→lat, ${lonF.name}→lon: lat=${lat.toFixed(6)} lon=${lon.toFixed(6)}`);
      }
    }
  }
  
  // Also test with ALL field values as direct offsets divided by different scalars
  console.log(`\nDirect value tests for mid-flight point:`);
  for (const f of fields) {
    for (const div of [1, 6, 10, 60, 100, 600, 6000, 60000]) {
      const val = f.val / div;
      if (Math.abs(val) < 1000) {
        console.log(`  ${f.name}=${f.val} ÷ ${div} = ${val.toFixed(4)}`);
      }
    }
    console.log();
  }
}

const files = fs.readdirSync(JPI_DIR).filter(f => f.endsWith('.JPI') && !f.startsWith('Copia')).sort();
crackV2(path.join(JPI_DIR, files[files.length - 1]));
