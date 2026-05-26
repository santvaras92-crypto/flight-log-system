import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/reset-gps-calibration?aircraftId=CC-AQI
 *
 * Reset (zero out) the learned GPS calibration for a given aircraft.
 * Use when accumulated EMA drift causes JPI tracks to render offset.
 * Returns the previous calibration values for reference.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const aircraftId = url.searchParams.get("aircraftId") ?? "CC-AQI";

    const previous = await prisma.gpsCalibration.findUnique({
      where: { aircraftId },
    });

    await prisma.gpsCalibration.upsert({
      where: { aircraftId },
      create: {
        aircraftId,
        latOffsetDeg: 0,
        lonOffsetDeg: 0,
        smoothingWindow: 11,
        avgErrorMeters: 0,
        sampleCount: 0,
      },
      update: {
        latOffsetDeg: 0,
        lonOffsetDeg: 0,
        smoothingWindow: 11,
        avgErrorMeters: 0,
        sampleCount: 0,
        lastUpdated: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      aircraftId,
      previous: previous
        ? {
            latOffsetDeg: previous.latOffsetDeg,
            lonOffsetDeg: previous.lonOffsetDeg,
            smoothingWindow: previous.smoothingWindow,
            avgErrorMeters: previous.avgErrorMeters,
            sampleCount: previous.sampleCount,
            lastUpdated: previous.lastUpdated,
          }
        : null,
      message: `Calibration reset for ${aircraftId}. Next KML upload will start learning fresh.`,
    });
  } catch (error: any) {
    console.error("Reset GPS calibration error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/reset-gps-calibration?aircraftId=CC-AQI
 * Inspect current calibration without resetting.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const aircraftId = url.searchParams.get("aircraftId") ?? "CC-AQI";
  const cal = await prisma.gpsCalibration.findUnique({
    where: { aircraftId },
  });
  if (!cal) {
    return NextResponse.json({ aircraftId, calibration: null });
  }
  // Approx ground offset at mid-Chile lat
  const offsetMeters = Math.sqrt(
    (cal.latOffsetDeg * 111320) ** 2 + (cal.lonOffsetDeg * 93000) ** 2,
  );
  return NextResponse.json({
    aircraftId,
    calibration: {
      latOffsetDeg: cal.latOffsetDeg,
      lonOffsetDeg: cal.lonOffsetDeg,
      offsetMeters: Math.round(offsetMeters),
      smoothingWindow: cal.smoothingWindow,
      avgErrorMeters: cal.avgErrorMeters,
      sampleCount: cal.sampleCount,
      lastUpdated: cal.lastUpdated,
    },
  });
}
