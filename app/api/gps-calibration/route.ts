import { NextResponse } from "next/server";
import { getCalibration } from "@/lib/gps-calibration";

/**
 * GET /api/gps-calibration
 * Returns current GPS calibration parameters for CC-AQI
 */
export async function GET() {
  try {
    const cal = await getCalibration("CC-AQI");
    return NextResponse.json(cal);
  } catch (error: any) {
    console.error("GPS calibration fetch error:", error);
    // Return safe defaults on error
    return NextResponse.json({
      latOffsetDeg: 0,
      lonOffsetDeg: 0,
      smoothingWindow: 11,
      sampleCount: 0,
      avgErrorMeters: 0,
    });
  }
}
