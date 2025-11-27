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
