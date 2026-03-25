import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/engine-data/[id]/unlink
// Unlinks an engine monitor record from its flight and optionally marks it as ground run
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const engineId = parseInt(params.id);
    if (isNaN(engineId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const markGroundRun = body.markGroundRun === true;

    const existing = await prisma.engineMonitorFlight.findUnique({
      where: { id: engineId },
      select: { id: true, linkedFlightId: true, isGroundRun: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Engine record not found" }, { status: 404 });
    }

    await prisma.engineMonitorFlight.update({
      where: { id: engineId },
      data: {
        linkedFlightId: null,
        ...(markGroundRun ? { isGroundRun: true } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      unlinked: true,
      markedGroundRun: markGroundRun,
    });
  } catch (error: any) {
    console.error("Engine unlink error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
