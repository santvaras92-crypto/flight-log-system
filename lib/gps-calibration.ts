/**
 * GPS Calibration Engine
 * 
 * Learns correction parameters by comparing JPI GPS tracks with reference KML tracks.
 * Each time a KML is uploaded, the system:
 *   1. Compares aligned JPI vs KML positions
 *   2. Computes systematic offset (lat/lon bias) and optimal smoothing window
 *   3. Updates running averages in the GpsCalibration table
 * 
 * For future JPI-only tracks, the learned corrections are applied at display time.
 */

import { prisma } from "@/lib/prisma";

export interface CalibrationResult {
  latOffsetDeg: number;   // mean(JPI_lat - KML_lat)
  lonOffsetDeg: number;   // mean(JPI_lon - KML_lon)
  smoothingWindow: number; // optimal MA window that minimizes error vs KML
  avgErrorMeters: number;  // mean position error before correction
  avgErrorCorrectedMeters: number; // mean error after offset + smoothing
  pointsCompared: number;
}

interface GpsPoint {
  lat: number;
  lng: number;
  elapsed: number;
}

/**
 * Compare JPI GPS track against KML reference track and compute correction parameters.
 * Both tracks must be aligned by elapsed time (same engine flight).
 */
export function computeCalibration(
  jpiPoints: GpsPoint[],
  kmlPoints: GpsPoint[],
): CalibrationResult | null {
  if (jpiPoints.length < 10 || kmlPoints.length < 10) return null;

  // Align points by nearest elapsed time (within 10 sec tolerance)
  const pairs: { jpi: GpsPoint; kml: GpsPoint }[] = [];
  let kmlIdx = 0;

  for (const jpi of jpiPoints) {
    // Find nearest KML point by elapsed time
    while (kmlIdx < kmlPoints.length - 1 &&
      Math.abs(kmlPoints[kmlIdx + 1].elapsed - jpi.elapsed) < Math.abs(kmlPoints[kmlIdx].elapsed - jpi.elapsed)) {
      kmlIdx++;
    }
    const kml = kmlPoints[kmlIdx];
    if (Math.abs(kml.elapsed - jpi.elapsed) <= 10) {
      pairs.push({ jpi, kml });
    }
  }

  if (pairs.length < 10) return null;

  // 1. Compute systematic offset (mean bias)
  let sumLatOff = 0, sumLonOff = 0;
  for (const { jpi, kml } of pairs) {
    sumLatOff += jpi.lat - kml.lat;
    sumLonOff += jpi.lng - kml.lng;
  }
  const latOffsetDeg = sumLatOff / pairs.length;
  const lonOffsetDeg = sumLonOff / pairs.length;

  // 2. Compute average error before correction
  let sumError = 0;
  for (const { jpi, kml } of pairs) {
    sumError += haversineMeters(jpi.lat, jpi.lng, kml.lat, kml.lng);
  }
  const avgErrorMeters = sumError / pairs.length;

  // 3. Find optimal smoothing window by trying different values
  //    Test windows from 3 to 31 (odd numbers), find the one that minimizes
  //    the mean error between smoothed-JPI and KML
  const windowsToTest = [3, 5, 7, 9, 11, 13, 15, 19, 23, 27, 31];
  let bestWindow = 1;
  let bestError = avgErrorMeters; // baseline = no smoothing, with offset correction

  // First compute error with just offset correction (no smoothing)
  let sumErrOffset = 0;
  for (const { jpi, kml } of pairs) {
    sumErrOffset += haversineMeters(jpi.lat - latOffsetDeg, jpi.lng - lonOffsetDeg, kml.lat, kml.lng);
  }
  bestError = sumErrOffset / pairs.length;

  for (const w of windowsToTest) {
    if (w >= jpiPoints.length) continue;

    // Smooth the JPI track with moving average of window w
    const smoothed = movingAverage(jpiPoints, w);

    // Re-align smoothed JPI to KML and compute error
    let smoothIdx = 0;
    let totalErr = 0;
    let count = 0;

    for (const { kml } of pairs) {
      // Find nearest smoothed point
      while (smoothIdx < smoothed.length - 1 &&
        Math.abs(smoothed[smoothIdx + 1].elapsed - kml.elapsed) <
        Math.abs(smoothed[smoothIdx].elapsed - kml.elapsed)) {
        smoothIdx++;
      }
      if (Math.abs(smoothed[smoothIdx].elapsed - kml.elapsed) <= 10) {
        totalErr += haversineMeters(
          smoothed[smoothIdx].lat - latOffsetDeg,
          smoothed[smoothIdx].lng - lonOffsetDeg,
          kml.lat, kml.lng
        );
        count++;
      }
    }

    if (count > 0) {
      const err = totalErr / count;
      if (err < bestError) {
        bestError = err;
        bestWindow = w;
      }
    }
  }

  return {
    latOffsetDeg,
    lonOffsetDeg,
    smoothingWindow: bestWindow,
    avgErrorMeters,
    avgErrorCorrectedMeters: bestError,
    pointsCompared: pairs.length,
  };
}

/**
 * Update the GpsCalibration table with new learned parameters.
 * Uses exponential moving average to blend with previous calibrations.
 */
export async function updateCalibration(
  aircraftId: string,
  newCal: CalibrationResult,
): Promise<void> {
  const existing = await prisma.gpsCalibration.findUnique({
    where: { aircraftId },
  });

  if (!existing || existing.sampleCount === 0) {
    // First calibration — use values directly
    await prisma.gpsCalibration.upsert({
      where: { aircraftId },
      create: {
        aircraftId,
        latOffsetDeg: newCal.latOffsetDeg,
        lonOffsetDeg: newCal.lonOffsetDeg,
        smoothingWindow: newCal.smoothingWindow,
        avgErrorMeters: newCal.avgErrorMeters,
        sampleCount: 1,
      },
      update: {
        latOffsetDeg: newCal.latOffsetDeg,
        lonOffsetDeg: newCal.lonOffsetDeg,
        smoothingWindow: newCal.smoothingWindow,
        avgErrorMeters: newCal.avgErrorMeters,
        sampleCount: 1,
        lastUpdated: new Date(),
      },
    });
    return;
  }

  // Blend with exponential moving average — recent calibrations weigh more
  // alpha = 0.3 means 30% new, 70% old (converges after ~5 samples)
  const alpha = 0.3;
  const blendedLat = existing.latOffsetDeg * (1 - alpha) + newCal.latOffsetDeg * alpha;
  const blendedLon = existing.lonOffsetDeg * (1 - alpha) + newCal.lonOffsetDeg * alpha;
  const blendedError = existing.avgErrorMeters * (1 - alpha) + newCal.avgErrorMeters * alpha;

  // For smoothing window, use the one that gave the best corrected error
  // Keep existing if new calibration's window didn't improve much
  const blendedWindow = newCal.avgErrorCorrectedMeters < blendedError * 0.8
    ? newCal.smoothingWindow
    : existing.smoothingWindow;

  await prisma.gpsCalibration.update({
    where: { aircraftId },
    data: {
      latOffsetDeg: blendedLat,
      lonOffsetDeg: blendedLon,
      smoothingWindow: blendedWindow,
      avgErrorMeters: blendedError,
      sampleCount: existing.sampleCount + 1,
      lastUpdated: new Date(),
    },
  });
}

/**
 * Get current calibration parameters for an aircraft.
 * Returns defaults if no calibration exists yet.
 */
export async function getCalibration(aircraftId: string = "CC-AQI") {
  const cal = await prisma.gpsCalibration.findUnique({
    where: { aircraftId },
  });

  return {
    latOffsetDeg: cal?.latOffsetDeg ?? 0,
    lonOffsetDeg: cal?.lonOffsetDeg ?? 0,
    smoothingWindow: cal?.smoothingWindow ?? 11,  // default: 11-point MA
    sampleCount: cal?.sampleCount ?? 0,
    avgErrorMeters: cal?.avgErrorMeters ?? 0,
  };
}

// ─── Utility functions ─────────────────────────────────────────

/**
 * Moving average smoothing for GPS tracks.
 * Preserves start/end points, smooths the middle.
 */
export function movingAverage(points: GpsPoint[], window: number): GpsPoint[] {
  if (window <= 1 || points.length <= window) return points;

  const half = Math.floor(window / 2);
  const result: GpsPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    const count = end - start + 1;

    let sumLat = 0, sumLng = 0;
    for (let j = start; j <= end; j++) {
      sumLat += points[j].lat;
      sumLng += points[j].lng;
    }

    result.push({
      lat: sumLat / count,
      lng: sumLng / count,
      elapsed: points[i].elapsed,
    });
  }

  return result;
}

/**
 * Apply calibration corrections to a GPS track:
 *   1. Subtract systematic offset
 *   2. Apply moving average smoothing
 */
export function applyCalibration(
  points: GpsPoint[],
  calibration: { latOffsetDeg: number; lonOffsetDeg: number; smoothingWindow: number },
): GpsPoint[] {
  if (points.length < 3) return points;

  // Step 1: Remove systematic offset
  const corrected = points.map(p => ({
    lat: p.lat - calibration.latOffsetDeg,
    lng: p.lng - calibration.lonOffsetDeg,
    elapsed: p.elapsed,
  }));

  // Step 2: Smooth with learned window
  return movingAverage(corrected, calibration.smoothingWindow);
}

/**
 * Haversine distance in meters
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
