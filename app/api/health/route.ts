import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let dbConnected = false;
  let userCount = 0;
  let aircraftCount = 0;
  let flightCount = 0;
  let dbError: string | null = null;

  try {
    // Test database connection with timeout
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 5000))
    ]);
    
    // Get some basic stats
    const results = await Promise.all([
      prisma.user.count(),
      prisma.aircraft.count(),
      prisma.flight.count(),
    ]);
    [userCount, aircraftCount, flightCount] = results;
    dbConnected = true;
  } catch (error) {
    dbError = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Health check DB connection failed:', dbError);
  }

  try {

    const key = process.env.OPENAI_API_KEY || "";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const r2Endpoint = process.env.R2_ENDPOINT?.trim();
    const r2Configured = !!(
      r2Endpoint &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
    );

    return NextResponse.json({
      status: dbConnected ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        ...(dbConnected ? {
          stats: {
            users: userCount,
            aircraft: aircraftCount,
            flights: flightCount,
          }
        } : {
          error: dbError,
          note: "Application is running but database is not ready"
        }),
      },
      environment: process.env.NODE_ENV,
      ocr: {
        model,
        keyPresent: Boolean(key),
        keyPrefix: key ? key.slice(0, 8) + "…" : null,
      },
      r2: {
        status: r2Configured ? "enabled" : "disabled",
        note: r2Configured ? "Uploads try R2 first with local fallback" : "Using Railway volume for persistent storage",
        configured: r2Configured,
        endpointPrefix: r2Endpoint ? `${r2Endpoint.slice(0, 30)}...` : null,
      },
      storage: {
        type: process.env.RAILWAY_VOLUME_MOUNT_PATH ? "railway-volume" : "local-public",
        path: process.env.RAILWAY_VOLUME_MOUNT_PATH || "public/uploads",
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
