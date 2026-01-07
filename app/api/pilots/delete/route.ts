import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // Verify admin session
    const session = await getServerSession(authOptions);
    if (!session || (session as any)?.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID de piloto requerido" }, { status: 400 });
    }

    // Check if pilot exists
    const pilot = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        Flight: { take: 1 },
        FlightSubmission: { take: 1 },
      }
    });

    if (!pilot) {
      return NextResponse.json({ ok: false, error: "Piloto no encontrado" }, { status: 404 });
    }

    // Check if pilot has flights or submissions
    if (pilot.Flight.length > 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "No se puede eliminar: el piloto tiene vuelos registrados" 
      }, { status: 400 });
    }

    if (pilot.FlightSubmission.length > 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "No se puede eliminar: el piloto tiene submissions pendientes" 
      }, { status: 400 });
    }

    // Delete the pilot
    await prisma.user.delete({
      where: { id: Number(id) }
    });

    return NextResponse.json({ ok: true, message: "Piloto eliminado correctamente" });
  } catch (error) {
    console.error("Error deleting pilot:", error);
    return NextResponse.json({ ok: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
