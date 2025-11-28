import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    const flightId = Number(id);
    if (!flightId) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    // Delete related transaction first to avoid FK issues
    await prisma.transaction.deleteMany({ where: { flightId: flightId } });
    await prisma.flight.delete({ where: { id: flightId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Delete flight error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
