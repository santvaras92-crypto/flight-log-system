import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Get some basic stats
    const results = await Promise.all([
      prisma.user.count(),
      prisma.aircraft.count(),
      prisma.flight.count(),
    ]);
    const [userCount, aircraftCount, flightCount] = results;

    const key = process.env.OPENAI_API_KEY || "";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        stats: {
          users: userCount,
          aircraft: aircraftCount,
          flights: flightCount,
        },
      },
      environment: process.env.NODE_ENV,
      ocr: {
        model,
        keyPresent: Boolean(key),
        keyPrefix: key ? key.slice(0, 8) + "…" : null,
      },
      r2: {
        configured: !!(process.env.R2_ENDPOINT && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
        endpoint: process.env.R2_ENDPOINT ? "set" : "missing",
        bucket: process.env.R2_BUCKET || "missing",
        accessKeyId: process.env.R2_ACCESS_KEY_ID ? "set" : "missing",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ? "set" : "missing",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        environment: process.env.NODE_ENV,
      },
      { status: 503 }
    );
  }
}
