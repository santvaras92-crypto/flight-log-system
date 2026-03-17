/**
 * KML Parser for GPS track data
 * Parses KML files (from ForeFlight, Garmin, FlightAware, etc.)
 * to extract GPS coordinates and timestamps.
 *
 * Supports:
 * - gx:Track with <when> + <gx:coord> (Google Earth / ForeFlight)
 * - LineString with <coordinates> (generic KML)
 * - Placemark with Point coordinates
 */

export interface KmlPoint {
  latitude: number;
  longitude: number;
  altitude: number | null; // meters MSL
  timestamp: Date | null;
  groundSpeed: number | null; // knots, computed between points
}

export interface KmlTrack {
  name: string;
  points: KmlPoint[];
  startTime: Date | null;
  endTime: Date | null;
  durationSec: number;
}

/**
 * Parse KML text content and extract GPS tracks
 */
export function parseKml(kmlText: string): KmlTrack[] {
  const tracks: KmlTrack[] = [];

  // Try gx:Track format first (most common for aviation)
  const gxTracks = parseGxTracks(kmlText);
  if (gxTracks.length > 0) {
    tracks.push(...gxTracks);
  }

  // Try Track (non-gx namespace) format
  const plainTracks = parsePlainTracks(kmlText);
  if (plainTracks.length > 0) {
    tracks.push(...plainTracks);
  }

  // Try LineString format
  const lineStrings = parseLineStrings(kmlText);
  if (lineStrings.length > 0) {
    tracks.push(...lineStrings);
  }

  // Compute ground speed between points
  for (const track of tracks) {
    computeGroundSpeeds(track.points);
  }

  return tracks;
}

/**
 * Parse gx:Track elements (ForeFlight, Google Earth)
 * Format:
 * <gx:Track>
 *   <when>2024-01-15T14:30:00Z</when>
 *   <gx:coord>-70.123 -33.456 500</gx:coord>
 *   ...
 * </gx:Track>
 */
function parseGxTracks(kml: string): KmlTrack[] {
  const tracks: KmlTrack[] = [];

  // Match gx:Track blocks
  const trackRegex = /<gx:Track\b[^>]*>([\s\S]*?)<\/gx:Track>/gi;
  let trackMatch;
  let trackIndex = 0;

  while ((trackMatch = trackRegex.exec(kml)) !== null) {
    const block = trackMatch[1];
    const points: KmlPoint[] = [];

    // Extract <when> timestamps
    const whenRegex = /<when>(.*?)<\/when>/gi;
    const timestamps: (Date | null)[] = [];
    let whenMatch;
    while ((whenMatch = whenRegex.exec(block)) !== null) {
      try {
        timestamps.push(new Date(whenMatch[1].trim()));
      } catch {
        timestamps.push(null);
      }
    }

    // Extract <gx:coord> coordinates (lng lat alt, space-separated)
    const coordRegex = /<gx:coord>(.*?)<\/gx:coord>/gi;
    let coordMatch;
    let coordIndex = 0;
    while ((coordMatch = coordRegex.exec(block)) !== null) {
      const parts = coordMatch[1].trim().split(/\s+/);
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          points.push({
            latitude: lat,
            longitude: lng,
            altitude: alt !== null && !isNaN(alt) ? alt : null,
            timestamp: coordIndex < timestamps.length ? timestamps[coordIndex] : null,
            groundSpeed: null,
          });
        }
      }
      coordIndex++;
    }

    if (points.length > 0) {
      const validTimestamps = points.map(p => p.timestamp).filter((t): t is Date => t !== null);
      const startTime = validTimestamps.length > 0 ? new Date(Math.min(...validTimestamps.map(t => t.getTime()))) : null;
      const endTime = validTimestamps.length > 0 ? new Date(Math.max(...validTimestamps.map(t => t.getTime()))) : null;
      const durationSec = startTime && endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : 0;

      tracks.push({
        name: `Track ${++trackIndex}`,
        points,
        startTime,
        endTime,
        durationSec,
      });
    }
  }

  return tracks;
}

/**
 * Parse Track elements (non-gx namespace)
 * Some KML files use <Track> instead of <gx:Track>
 */
function parsePlainTracks(kml: string): KmlTrack[] {
  const tracks: KmlTrack[] = [];

  // Match Track blocks that aren't gx:Track
  const trackRegex = /<Track\b[^>]*>([\s\S]*?)<\/Track>/gi;
  let trackMatch;
  let trackIndex = 0;

  while ((trackMatch = trackRegex.exec(kml)) !== null) {
    // Skip if this is actually inside a gx:Track
    const matchStart = trackMatch.index;
    const prefix = kml.substring(Math.max(0, matchStart - 3), matchStart);
    if (prefix.endsWith('gx:')) continue;

    const block = trackMatch[1];
    const points: KmlPoint[] = [];

    const whenRegex = /<when>(.*?)<\/when>/gi;
    const timestamps: (Date | null)[] = [];
    let whenMatch;
    while ((whenMatch = whenRegex.exec(block)) !== null) {
      try {
        timestamps.push(new Date(whenMatch[1].trim()));
      } catch {
        timestamps.push(null);
      }
    }

    // coord elements (may be <coord> or <gx:coord>)
    const coordRegex = /<coord>(.*?)<\/coord>/gi;
    let coordMatch;
    let coordIndex = 0;
    while ((coordMatch = coordRegex.exec(block)) !== null) {
      const parts = coordMatch[1].trim().split(/\s+/);
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          points.push({
            latitude: lat,
            longitude: lng,
            altitude: alt !== null && !isNaN(alt) ? alt : null,
            timestamp: coordIndex < timestamps.length ? timestamps[coordIndex] : null,
            groundSpeed: null,
          });
        }
      }
      coordIndex++;
    }

    if (points.length > 0) {
      const validTimestamps = points.map(p => p.timestamp).filter((t): t is Date => t !== null);
      const startTime = validTimestamps.length > 0 ? new Date(Math.min(...validTimestamps.map(t => t.getTime()))) : null;
      const endTime = validTimestamps.length > 0 ? new Date(Math.max(...validTimestamps.map(t => t.getTime()))) : null;
      const durationSec = startTime && endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : 0;

      tracks.push({
        name: `Track ${++trackIndex}`,
        points,
        startTime,
        endTime,
        durationSec,
      });
    }
  }

  return tracks;
}

/**
 * Parse LineString elements with <coordinates>
 * Format: lng,lat,alt lng,lat,alt ...
 * No timestamps available in this format
 */
function parseLineStrings(kml: string): KmlTrack[] {
  const tracks: KmlTrack[] = [];

  const lsRegex = /<LineString\b[^>]*>([\s\S]*?)<\/LineString>/gi;
  let lsMatch;
  let trackIndex = 0;

  while ((lsMatch = lsRegex.exec(kml)) !== null) {
    const block = lsMatch[1];
    const coordsMatch = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(block);
    if (!coordsMatch) continue;

    const points: KmlPoint[] = [];
    const coordPairs = coordsMatch[1].trim().split(/\s+/);

    for (const pair of coordPairs) {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          points.push({
            latitude: lat,
            longitude: lng,
            altitude: alt !== null && !isNaN(alt) ? alt : null,
            timestamp: null,
            groundSpeed: null,
          });
        }
      }
    }

    if (points.length > 0) {
      // Try to find a name from parent Placemark
      tracks.push({
        name: `LineString ${++trackIndex}`,
        points,
        startTime: null,
        endTime: null,
        durationSec: 0,
      });
    }
  }

  return tracks;
}

/**
 * Compute ground speed in knots between consecutive GPS points
 */
function computeGroundSpeeds(points: KmlPoint[]): void {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev.timestamp && curr.timestamp) {
      const dtSec = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dtSec > 0) {
        const distNm = haversineNm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        const speedKts = (distNm / dtSec) * 3600;
        curr.groundSpeed = Math.round(speedKts * 10) / 10;
      }
    }
  }
}

/**
 * Haversine distance in nautical miles
 */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R_NM = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_NM * c;
}

/**
 * Match KML GPS points to engine readings by elapsed time.
 * 
 * Strategy:
 * - If KML has timestamps: align by absolute time matching
 * - If KML has no timestamps: distribute points proportionally over the reading duration
 * 
 * @param kmlPoints - GPS points from KML
 * @param readingCount - Number of engine monitor readings
 * @param readingIntervalSec - Interval between readings (typically 6 sec for JPI EDM-830)
 * @param flightStartTime - Start time of the engine monitor flight
 * @returns Array of {readingIndex, point} mappings
 */
export function matchKmlToReadings(
  kmlPoints: KmlPoint[],
  readingCount: number,
  readingIntervalSec: number,
  flightStartTime: Date,
): { readingIndex: number; point: KmlPoint }[] {
  const results: { readingIndex: number; point: KmlPoint }[] = [];

  if (kmlPoints.length === 0 || readingCount === 0) return results;

  const flightDurationSec = readingCount * readingIntervalSec;
  const flightEndTime = new Date(flightStartTime.getTime() + flightDurationSec * 1000);

  // Check if KML has timestamps
  const hasTimestamps = kmlPoints.some(p => p.timestamp !== null);

  if (hasTimestamps) {
    // Strategy 1: Match by absolute timestamp
    // For each reading, find the nearest KML point
    for (let i = 0; i < readingCount; i++) {
      const readingTime = new Date(flightStartTime.getTime() + i * readingIntervalSec * 1000);

      let bestIndex = -1;
      let bestDiff = Infinity;

      for (let j = 0; j < kmlPoints.length; j++) {
        if (!kmlPoints[j].timestamp) continue;
        const diff = Math.abs(readingTime.getTime() - kmlPoints[j].timestamp!.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIndex = j;
        }
      }

      // Only match if within 30 seconds tolerance
      if (bestIndex >= 0 && bestDiff <= 30000) {
        results.push({ readingIndex: i, point: kmlPoints[bestIndex] });
      }
    }
  } else {
    // Strategy 2: Distribute proportionally
    // Map KML points to readings by proportional position
    for (let j = 0; j < kmlPoints.length; j++) {
      const ratio = kmlPoints.length > 1 ? j / (kmlPoints.length - 1) : 0;
      const readingIndex = Math.round(ratio * (readingCount - 1));
      results.push({ readingIndex, point: kmlPoints[j] });
    }
  }

  return results;
}

/**
 * Convert altitude from meters to feet
 */
export function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084);
}
