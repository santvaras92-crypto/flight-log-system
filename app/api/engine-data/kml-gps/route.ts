import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseKml, matchKmlToReadings, metersToFeet } from "@/lib/kml-parser";
import { computeCalibration, updateCalibration } from "@/lib/gps-calibration";

/**
 * POST /api/engine-data/kml-gps
 * Upload a KML file to overlay GPS data on an existing EngineMonitorFlight
 *
 * FormData:
 *  - file: KML file
 *  - engineFlightId: ID of the EngineMonitorFlight to update
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const engineFlightId = formData.get("engineFlightId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No KML file provided" }, { status: 400 });
    }
    if (!engineFlightId) {
      return NextResponse.json({ error: "engineFlightId is required" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".kml") && !filename.endsWith(".kmz")) {
      return NextResponse.json(
        { error: "File must be .kml format" },
        { status: 400 }
      );
    }

    // Read KML content
    const kmlText = await file.text();

    // Parse KML
    const tracks = parseKml(kmlText);
    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "No GPS tracks found in KML file. Supported formats: gx:Track, Track, LineString." },
        { status: 400 }
      );
    }

    // Use the track with the most points
    const track = tracks.reduce((best, t) => t.points.length > best.points.length ? t : best);

    // Fetch the engine flight and its readings
    const engineFlight = await prisma.engineMonitorFlight.findUnique({
      where: { id: parseInt(engineFlightId) },
      include: {
        readings: {
          orderBy: { elapsedSec: "asc" },
          select: { id: true, elapsedSec: true, timestamp: true, latitude: true, longitude: true },
        },
      },
    });

    if (!engineFlight) {
      return NextResponse.json(
        { error: `Engine flight #${engineFlightId} not found` },
        { status: 404 }
      );
    }

    const readings = engineFlight.readings;
    if (readings.length === 0) {
      return NextResponse.json(
        { error: `Engine flight #${engineFlightId} has no readings` },
        { status: 400 }
      );
    }

    // Check how many readings already have GPS
    const existingGpsCount = readings.filter(
      r => r.latitude !== null && r.longitude !== null &&
        Number(r.latitude) !== 0 && Number(r.longitude) !== 0
    ).length;

    // Determine reading interval (usually 6 sec for JPI EDM-830)
    const readingIntervalSec = readings.length > 1
      ? Math.round((readings[readings.length - 1].elapsedSec - readings[0].elapsedSec) / (readings.length - 1))
      : 6;

    // Match KML points to readings
    const matches = matchKmlToReadings(
      track.points,
      readings.length,
      readingIntervalSec,
      new Date(readings[0].timestamp),
    );

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Could not match any KML GPS points to engine readings. Time ranges may not overlap." },
        { status: 400 }
      );
    }

    // ─── Learn from JPI vs KML comparison before overwriting ───
    let calibrationInfo: { avgError: number; correctedError: number; window: number } | null = null;
    if (existingGpsCount > 10) {
      try {
        // Build JPI points array from current (pre-overwrite) readings
        const jpiPoints = readings
          .filter(r => r.latitude !== null && r.longitude !== null &&
            Number(r.latitude) !== 0 && Number(r.longitude) !== 0)
          .map(r => ({
            lat: Number(r.latitude),
            lng: Number(r.longitude),
            elapsed: r.elapsedSec,
          }));

        // Build KML points array from the matches
        const kmlPoints = matches
          .map(({ readingIndex, point }) => ({
            lat: point.latitude,
            lng: point.longitude,
            elapsed: readings[readingIndex]?.elapsedSec ?? 0,
          }));

        const cal = computeCalibration(jpiPoints, kmlPoints);
        if (cal) {
          await updateCalibration(engineFlight.aircraftId, cal);
          calibrationInfo = {
            avgError: Math.round(cal.avgErrorMeters),
            correctedError: Math.round(cal.avgErrorCorrectedMeters),
            window: cal.smoothingWindow,
          };
          console.log(
            `GPS Calibration updated for ${engineFlight.aircraftId}: ` +
            `offset=(${cal.latOffsetDeg.toFixed(6)}, ${cal.lonOffsetDeg.toFixed(6)}), ` +
            `window=${cal.smoothingWindow}, error=${cal.avgErrorMeters.toFixed(0)}m → ${cal.avgErrorCorrectedMeters.toFixed(0)}m`
          );
        }
      } catch (e) {
        console.error("GPS calibration learning error (non-critical):", e);
      }
    }

    // Mark GPS source as KML
    await prisma.engineMonitorFlight.update({
      where: { id: parseInt(engineFlightId) },
      data: { gpsSource: "kml" },
    });

    // Update readings with GPS data using raw SQL bulk UPDATE for speed
    let updatedCount = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(({ readingIndex, point }) => {
          const reading = readings[readingIndex];
          if (!reading) return null;
          const alt = point.altitude !== null ? metersToFeet(point.altitude) : null;
          return `(${reading.id}, ${point.latitude}, ${point.longitude}, ${alt ?? 'NULL'}, ${point.groundSpeed ?? 'NULL'})`;
        })
        .filter((v): v is string => v !== null);

      if (values.length === 0) continue;

      await prisma.$executeRawUnsafe(`
        UPDATE "EngineMonitorReading" AS r
        SET "latitude" = v.lat, "longitude" = v.lng, "gpsAlt" = v.alt, "groundSpd" = v.spd
        FROM (VALUES ${values.join(',')}) AS v(id, lat, lng, alt, spd)
        WHERE r.id = v.id;
      `);
      updatedCount += values.length;
    }

    return NextResponse.json({
      success: true,
      engineFlightId: parseInt(engineFlightId),
      trackName: track.name,
      kmlPointCount: track.points.length,
      readingCount: readings.length,
      matchedCount: matches.length,
      updatedCount,
      existingGpsOverwritten: existingGpsCount,
      trackDuration: track.durationSec ? `${Math.round(track.durationSec / 60)} min` : "unknown",
      calibration: calibrationInfo,
    });
  } catch (error: any) {
    console.error("KML GPS import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
