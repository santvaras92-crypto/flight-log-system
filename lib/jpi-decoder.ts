/**
 * JPI EDM-830 Binary File Decoder (TypeScript)
 * =============================================
 * Decodes .JPI binary files from JPI EDM-830 engine monitors.
 * Port of the Python decoder (jpi_decoder.py) for Cessna 172N CC-AQI
 * with Lycoming O-320-D2J engine.
 *
 * Format: ASCII header ($U,$A,$F,$T,$C,$P,$H,$D,$L lines)
 *         followed by binary delta-compressed flight data.
 */

// Initial values for accumulator fields
const INIT_VALUE = 0xf0; // 240
const INIT_HIGH_BYTE = 0x00;
const INIT_HP = 0x00;

// ─── Data Structures ────────────────────────────────────────────

export interface DecodedRecord {
  elapsedSec: number;
  timestamp: Date | null;
  egt1: number | null;
  egt2: number | null;
  egt3: number | null;
  egt4: number | null;
  cht1: number | null;
  cht2: number | null;
  cht3: number | null;
  cht4: number | null;
  oilTemp: number | null;
  oilPress: number | null;
  rpm: number | null;
  map: number | null;
  hp: number | null;
  fuelFlow: number | null;
  fuelUsed: number | null;
  fuelRem: number | null;
  oat: number | null;
  volts: number | null;
  carbTemp: number | null;
  latitude: number | null;
  longitude: number | null;
  gpsAltitude: number | null;  // pressure alt in feet from GPS (field 83)
  groundSpeed: number | null;  // knots (field 81)
}

export interface DecodedFlight {
  flightNumber: number;
  flightDate: Date;
  interval: number;
  durationSec: number;
  records: DecodedRecord[];
  sourceFile: string;
  latitude: number | null;   // GPS start position from GTN 650
  longitude: number | null;  // GPS start position from GTN 650
}

interface JPIHeader {
  tailNumber: string;
  fuelCapacity: number;
  month: number;
  day: number;
  year: number;
  hour: number;
  minute: number;
  protocol: number;
  model: number;
  flagsLow: number;
  flagsHigh: number;
  flights: Array<{ flightNum: number; dataWords: number }>;
  totalLength: number;
}

interface FlightHeader {
  flightNumber: number;
  flagsLow: number;
  flagsHigh: number;
  interval: number;
  date: Date | null;
  latRaw: number;  // GPS initial lat (raw signed 32-bit)
  lonRaw: number;  // GPS initial lon (raw signed 32-bit)
}

// ─── Decoder Class ──────────────────────────────────────────────

class JPIDecoderImpl {
  private data: Buffer;
  private pos: number;
  private header: JPIHeader;
  private sourceFile: string;

  constructor(data: Buffer, sourceFile: string) {
    this.data = data;
    this.pos = 0;
    this.sourceFile = sourceFile;
    this.header = {
      tailNumber: "",
      fuelCapacity: 40,
      month: 1,
      day: 1,
      year: 2020,
      hour: 0,
      minute: 0,
      protocol: 2,
      model: 0,
      flagsLow: 0,
      flagsHigh: 0,
      flights: [],
      totalLength: 0,
    };
  }

  decode(): DecodedFlight[] {
    this.pos = 0;
    this.parseHeader();
    return this.parseBinaryData();
  }

  // ── ASCII Header Parsing ───────────────────────────────────

  private readAsciiLine(): string | null {
    const start = this.pos;
    while (this.pos < this.data.length) {
      if (
        this.pos + 1 < this.data.length &&
        this.data[this.pos] === 0x0d &&
        this.data[this.pos + 1] === 0x0a
      ) {
        const line = this.data.subarray(start, this.pos).toString("ascii");
        this.pos += 2;
        return line;
      }
      this.pos++;
    }
    return null;
  }

  private parseHeaderLine(line: string): { type: string; values: string[] } {
    // Remove checksum: $X,val1,val2*CS
    let clean = line;
    const starIdx = clean.lastIndexOf("*");
    if (starIdx >= 0) clean = clean.substring(0, starIdx);

    if (clean.startsWith("$") && clean.length > 1) {
      const recType = clean[1];
      let rest = clean.substring(2);
      if (rest.startsWith(",")) rest = rest.substring(1);
      const values = rest.split(",").map((v) => v.trim());
      return { type: recType, values };
    }
    return { type: "", values: [] };
  }

  private parseHeader(): void {
    while (this.pos < this.data.length) {
      const line = this.readAsciiLine();
      if (line === null) break;

      const { type, values } = this.parseHeaderLine(line);

      switch (type) {
        case "U":
          this.header.tailNumber = values[0]?.trim() || "";
          break;

        case "F":
          if (values.length >= 5) {
            this.header.fuelCapacity = parseFloat(values[1]) || 40;
          }
          break;

        case "T":
          if (values.length >= 6) {
            this.header.month = parseInt(values[0]) || 1;
            this.header.day = parseInt(values[1]) || 1;
            const yr = parseInt(values[2]) || 0;
            this.header.year = yr < 75 ? yr + 2000 : yr + 1900;
            this.header.hour = parseInt(values[3]) || 0;
            this.header.minute = parseInt(values[4]) || 0;
          }
          break;

        case "C":
          if (values.length >= 3) {
            this.header.model = parseInt(values[0]) || 0;
            this.header.flagsLow = parseInt(values[1]) || 0;
            this.header.flagsHigh = parseInt(values[2]) || 0;
          }
          break;

        case "P":
          this.header.protocol = parseInt(values[0]) || 2;
          break;

        case "D":
          if (values.length >= 2) {
            const flightNum = parseInt(values[0]) || 0;
            const dataWords = parseInt(values[1]) || 0;
            this.header.flights.push({ flightNum, dataWords });
          }
          break;

        case "L":
          this.header.totalLength = parseInt(values[0]) || 0;
          return; // End of header, binary data follows
      }
    }
  }

  // ── Binary Data Parsing ────────────────────────────────────

  private readByte(): number {
    if (this.pos >= this.data.length) throw new Error("Unexpected EOF");
    return this.data[this.pos++];
  }

  private readUint16BE(): number {
    const hi = this.readByte();
    const lo = this.readByte();
    return (hi << 8) | lo;
  }

  private parseBinaryData(): DecodedFlight[] {
    const flights: DecodedFlight[] = [];

    for (const { flightNum, dataWords } of this.header.flights) {
      try {
        const flight = this.parseFlight(flightNum, dataWords);
        if (flight && flight.records.length > 5) {
          flights.push(flight);
        }
      } catch (e) {
        // Skip corrupted flights
        continue;
      }
    }

    return flights;
  }

  private parseFlight(
    expectedFlightNum: number,
    dataWords: number
  ): DecodedFlight | null {
    const dataBytes = dataWords * 2;
    const flightStartPos = this.pos;

    try {
      let fhdr = this.parseFlightHeader();

      if (fhdr.flightNumber !== expectedFlightNum) {
        // Try offset -1
        this.pos = flightStartPos - 1;
        try {
          fhdr = this.parseFlightHeader();
          if (fhdr.flightNumber !== expectedFlightNum) {
            this.pos = flightStartPos + dataBytes;
            return null;
          }
        } catch {
          this.pos = flightStartPos + dataBytes;
          return null;
        }
      }

      const records = this.parseDataRecords(fhdr);

      const durationSec =
        records.length > 0
          ? Math.max(...records.map((r) => r.elapsedSec))
          : 0;

      // Extract GPS start position from flight header
      // Divide raw signed 32-bit by 6,000 to get decimal degrees
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (fhdr.latRaw !== 0 || fhdr.lonRaw !== 0) {
        const latDeg = fhdr.latRaw / 6000;
        const lonDeg = fhdr.lonRaw / 6000;
        // Bounding box: South America
        if (latDeg >= -60 && latDeg <= -10 && lonDeg >= -80 && lonDeg <= -55) {
          latitude = Math.round(latDeg * 1000000) / 1000000;
          longitude = Math.round(lonDeg * 1000000) / 1000000;
        }
      }

      return {
        flightNumber: fhdr.flightNumber,
        flightDate: fhdr.date || new Date(),
        interval: fhdr.interval,
        durationSec,
        records,
        sourceFile: this.sourceFile,
        latitude,
        longitude,
      };
    } catch (e) {
      this.pos = flightStartPos + dataBytes;
      return null;
    }
  }

  private parseFlightHeader(): FlightHeader {
    const hdr: FlightHeader = {
      flightNumber: 0,
      flagsLow: 0,
      flagsHigh: 0,
      interval: 6,
      date: null,
      latRaw: 0,
      lonRaw: 0,
    };

    if (this.header.protocol >= 2) {
      // 14 words + 1 checksum byte
      const words: number[] = [];
      for (let i = 0; i < 14; i++) {
        words.push(this.readUint16BE());
      }
      this.readByte(); // checksum

      hdr.flightNumber = words[0];
      hdr.flagsLow = words[1];
      hdr.flagsHigh = words[2];
      hdr.interval = words[11] > 0 ? words[11] : 6;

      // GPS initial position (words 6-9)
      // Two 16-bit words combined into signed 32-bit value
      let latCombined = (words[6] << 16) | words[7];
      let lonCombined = (words[8] << 16) | words[9];
      if (latCombined > 0x7fffffff) latCombined -= 0x100000000;
      if (lonCombined > 0x7fffffff) lonCombined -= 0x100000000;
      hdr.latRaw = latCombined;
      hdr.lonRaw = lonCombined;

      // Date (word 12)
      const dateRaw = words[12];
      const day = dateRaw & 0x1f;
      const month = (dateRaw >> 5) & 0x0f;
      let year = (dateRaw >> 9) & 0x7f;
      year = year < 75 ? year + 2000 : year + 1900;

      // Time (word 13)
      const timeRaw = words[13];
      const secs = (timeRaw & 0x1f) * 2;
      const mins = (timeRaw >> 5) & 0x3f;
      const hrs = (timeRaw >> 11) & 0x1f;

      try {
        hdr.date = new Date(year, month - 1, day, hrs, mins, secs);
      } catch {
        hdr.date = null;
      }
    } else {
      // Old format: 7 words + 1 checksum byte
      const words: number[] = [];
      for (let i = 0; i < 7; i++) {
        words.push(this.readUint16BE());
      }
      this.readByte(); // checksum

      hdr.flightNumber = words[0];
      hdr.flagsLow = words[1];
      hdr.flagsHigh = words[2];
      hdr.interval = words[3] > 0 ? words[3] : 6;

      const dateRaw = words[4];
      const day = dateRaw & 0x1f;
      const month = (dateRaw >> 5) & 0x0f;
      let year = (dateRaw >> 9) & 0x7f;
      year = year < 75 ? year + 2000 : year + 1900;

      const timeRaw = words[5];
      const secs = (timeRaw & 0x1f) * 2;
      const mins = (timeRaw >> 5) & 0x3f;
      const hrs = (timeRaw >> 11) & 0x1f;

      try {
        hdr.date = new Date(year, month - 1, day, hrs, mins, secs);
      } catch {
        hdr.date = null;
      }
    }

    return hdr;
  }

  private parseDataRecords(flightHdr: FlightHeader): DecodedRecord[] {
    const records: DecodedRecord[] = [];
    let elapsed = 0;
    const interval = flightHdr.interval > 0 ? flightHdr.interval : 6;
    let currentInterval = interval;

    // Delta-compression accumulator (128 fields)
    const accum = new Array<number>(128);
    for (let i = 0; i < 128; i++) accum[i] = INIT_VALUE;
    // High bytes (fields 48-55) init to 0
    for (let i = 48; i < 56; i++) accum[i] = INIT_HIGH_BYTE;
    // RPM high byte (field 42) init to 0
    accum[42] = 0;
    // HP (field 30) init to 0
    accum[30] = INIT_HP;
    // Fields 64+ init to 0
    for (let i = 64; i < 128; i++) accum[i] = 0;

    const MAX_RECORDS = 50000;
    let recordCount = 0;

    while (this.pos < this.data.length && recordCount < MAX_RECORDS) {
      try {
        if (this.pos + 5 > this.data.length) break;

        // Read decode flags (duplicated for error detection)
        const decodeFlags1 = this.readUint16BE();
        const decodeFlags2 = this.readUint16BE();

        if (decodeFlags1 !== decodeFlags2) {
          this.pos -= 4;
          break;
        }

        // Read repeat count
        const repeatCount = this.readByte();

        // End-of-flight marker
        if (decodeFlags1 === 0 && repeatCount === 0) {
          this.readByte(); // checksum
          break;
        }

        // Emit repeated copies of previous record
        for (let r = 0; r < repeatCount; r++) {
          records.push(
            this.makeRecord(accum, elapsed, flightHdr, currentInterval)
          );
          elapsed += currentInterval;
          recordCount++;
        }

        // Read field flags (which bytes changed)
        const fieldFlags = new Array<number>(16).fill(0);
        for (let i = 0; i < 16; i++) {
          if (decodeFlags1 & (1 << i)) {
            fieldFlags[i] = this.readByte();
          }
        }

        // Read sign flags (direction of delta)
        const signFlags = new Array<number>(16).fill(0);
        for (let i = 0; i < 16; i++) {
          if (decodeFlags1 & (1 << i)) {
            // Bytes 6 and 7 (bits 48-63) have no sign flags
            if (i !== 6 && i !== 7) {
              signFlags[i] = this.readByte();
            }
          }
        }

        // Expand sign flags to 128 individual bits
        const signBits = new Array<number>(128).fill(0);
        for (let byteIdx = 0; byteIdx < 16; byteIdx++) {
          for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            const fieldIdx = byteIdx * 8 + bitIdx;
            if (signFlags[byteIdx] & (1 << bitIdx)) {
              signBits[fieldIdx] = 1;
            }
          }
        }

        // Propagate sign from low byte to high byte for composite fields
        // RPM: field 42 (high) uses sign of field 41 (low)
        signBits[42] = signBits[41];
        // EGT1-6: fields 48-53 (high) use sign of fields 0-5 (low)
        for (let i = 0; i < 6; i++) {
          signBits[48 + i] = signBits[i];
        }
        // HOURS: field 79 (high) uses sign of field 78 (low)
        signBits[79] = signBits[78];

        // Read and apply deltas
        for (let byteIdx = 0; byteIdx < 16; byteIdx++) {
          for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            const fieldIdx = byteIdx * 8 + bitIdx;
            if (fieldFlags[byteIdx] & (1 << bitIdx)) {
              const delta = this.readByte();
              if (delta !== 0) {
                if (signBits[fieldIdx]) {
                  accum[fieldIdx] = accum[fieldIdx] - delta;
                } else {
                  accum[fieldIdx] = accum[fieldIdx] + delta;
                }
              }
            }
          }
        }

        // Checksum byte
        this.readByte();

        // Check mark value for interval changes
        const markVal = accum[16];
        if (markVal === 0x02) {
          currentInterval = 1;
        } else if (markVal === 0x03) {
          currentInterval = interval;
        }

        // Create record
        records.push(
          this.makeRecord(accum, elapsed, flightHdr, currentInterval)
        );
        elapsed += currentInterval;
        recordCount++;
      } catch {
        break;
      }
    }

    return records;
  }

  private makeRecord(
    accum: number[],
    elapsed: number,
    flightHdr: FlightHeader,
    _interval: number
  ): DecodedRecord {
    let timestamp: Date | null = null;
    if (flightHdr.date) {
      timestamp = new Date(flightHdr.date.getTime() + elapsed * 1000);
    }

    // EGT: low byte (fields 0-3) + high byte (fields 48-51) << 8
    let egt1 = accum[0] + (accum[48] << 8);
    let egt2 = accum[1] + (accum[49] << 8);
    let egt3 = accum[2] + (accum[50] << 8);
    let egt4 = accum[3] + (accum[51] << 8);

    // Filter invalid EGTs
    if (egt1 > 2000 || egt1 < 0) egt1 = 0;
    if (egt2 > 2000 || egt2 < 0) egt2 = 0;
    if (egt3 > 2000 || egt3 < 0) egt3 = 0;
    if (egt4 > 2000 || egt4 < 0) egt4 = 0;

    // CHT (fields 8-11) - direct value in °F
    let cht1 = accum[8];
    let cht2 = accum[9];
    let cht3 = accum[10];
    let cht4 = accum[11];

    // Filter invalid CHTs
    if (cht1 > 600 || cht1 < 0 || cht1 === INIT_VALUE) cht1 = 0;
    if (cht2 > 600 || cht2 < 0 || cht2 === INIT_VALUE) cht2 = 0;
    if (cht3 > 600 || cht3 < 0 || cht3 === INIT_VALUE) cht3 = 0;
    if (cht4 > 600 || cht4 < 0 || cht4 === INIT_VALUE) cht4 = 0;

    // Oil Temp (field 15)
    let oilTemp = accum[15];
    if (oilTemp > 500 || oilTemp === INIT_VALUE) oilTemp = 0;

    // Oil Pressure (field 17)
    let oilPress = accum[17];
    if (oilPress > 200 || oilPress === INIT_VALUE) oilPress = 0;

    // Carburetor/CDT temp (field 18)
    let carbTemp = accum[18];
    if (carbTemp === INIT_VALUE) carbTemp = 0;

    // Volts (field 20) - divide by 10
    let volts = accum[20] / 10.0;
    if (volts > 40 || volts < 5) volts = 0;

    // OAT (field 21) - can be negative (signed via delta compression)
    let oat = accum[21];
    if (oat === INIT_VALUE || Math.abs(oat) > 150) oat = 0;

    // Fuel Used (field 22) - divide by 10
    let fuelUsed = accum[22] / 10.0;
    if (fuelUsed > 100 || fuelUsed === INIT_VALUE / 10.0) fuelUsed = 0;

    // Fuel Flow (field 23) - divide by 10
    let fuelFlow = accum[23] / 10.0;
    if (fuelFlow > 30 || fuelFlow === INIT_VALUE / 10.0) fuelFlow = 0;

    // Fuel remaining
    const fuelRem = Math.max(0, this.header.fuelCapacity - fuelUsed);

    // HP (field 30)
    const hp = accum[30];

    // MAP (field 40) - divide by 10
    let mapPress = accum[40] / 10.0;
    if (mapPress > 35 || mapPress < 5) mapPress = 0;

    // RPM: low byte (field 41) + high byte (field 42) << 8
    const rpmRaw = accum[41] + (accum[42] << 8);
    const rpm = rpmRaw > 0 && rpmRaw < 5000 ? rpmRaw : 0;

    // GPS per-record position from GTN 650 via EDM-830
    // f86 = longitude offset from header in 1/6000 degree units
    // f87 = latitude offset from header in 1/6000 degree units
    // f83 = GPS pressure altitude in feet
    // f81 = ground speed (knots × 10)
    let latitude: number | null = null;
    let longitude: number | null = null;
    let gpsAltitude: number | null = null;
    let groundSpeed: number | null = null;

    if (flightHdr.latRaw !== 0 || flightHdr.lonRaw !== 0) {
      const latDeg = (flightHdr.latRaw + accum[87]) / 6000;
      const lonDeg = (flightHdr.lonRaw + accum[86]) / 6000;
      // Validate within South America bounding box
      if (latDeg >= -60 && latDeg <= -10 && lonDeg >= -80 && lonDeg <= -55) {
        latitude = Math.round(latDeg * 1000000) / 1000000;
        longitude = Math.round(lonDeg * 1000000) / 1000000;
      }
      // GPS altitude (field 83) — pressure altitude in feet
      const altFeet = accum[83];
      if (altFeet >= 0 && altFeet < 30000) {
        gpsAltitude = altFeet;
      }
      // Ground speed (field 81) — knots × 10
      const gsRaw = accum[81];
      if (gsRaw > 0 && gsRaw < 5000) {
        groundSpeed = gsRaw / 10;
      }
    }

    return {
      elapsedSec: elapsed,
      timestamp,
      egt1: egt1 || null,
      egt2: egt2 || null,
      egt3: egt3 || null,
      egt4: egt4 || null,
      cht1: cht1 || null,
      cht2: cht2 || null,
      cht3: cht3 || null,
      cht4: cht4 || null,
      oilTemp: oilTemp || null,
      oilPress: oilPress || null,
      rpm: rpm || null,
      map: mapPress || null,
      hp: hp || null,
      fuelFlow: fuelFlow || null,
      fuelUsed: fuelUsed || null,
      fuelRem: fuelRem || null,
      oat: oat || null,
      volts: volts || null,
      carbTemp: carbTemp || null,
      latitude,
      longitude,
      gpsAltitude,
      groundSpeed,
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Decode a JPI binary file buffer into an array of decoded flights.
 * Each flight contains metadata and an array of sensor readings.
 */
export function decodeJPI(
  buffer: Buffer,
  sourceFile: string = "upload.jpi"
): DecodedFlight[] {
  const decoder = new JPIDecoderImpl(buffer, sourceFile);
  return decoder.decode();
}
