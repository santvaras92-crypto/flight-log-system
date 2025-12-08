import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    const flightId = Number(id);
    if (!flightId) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    // Get flight data before deletion to revert changes
    const flight = await prisma.flight.findUnique({
      where: { id: flightId },
      select: {
        id: true,
        pilotoId: true,
        aircraftId: true,
        diff_hobbs: true,
        diff_tach: true,
        costo: true,
        tarifa: true,
        instructor_rate: true,
      }
    });

    if (!flight) {
      return NextResponse.json({ ok: false, error: "Vuelo no encontrado" }, { status: 404 });
    }

    // Calculate total cost that was charged (tarifa + instructor_rate)
    const totalCost = Number(flight.costo || 0);
    const diffHobbs = Number(flight.diff_hobbs || 0);
    const diffTach = Number(flight.diff_tach || 0);

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Delete related transaction first
      await tx.transaction.deleteMany({ where: { flightId: flightId } });

      // 2. Revert pilot balance (add back the cost)
      if (flight.pilotoId && totalCost > 0) {
        await tx.user.update({
          where: { id: flight.pilotoId },
          data: {
            saldo_cuenta: { increment: totalCost }
          }
        });
      }

      // 3. Revert aircraft counters (subtract the diff)
      if (diffHobbs > 0 || diffTach > 0) {
        await tx.aircraft.update({
          where: { matricula: flight.aircraftId },
          data: {
            hobbs_actual: { decrement: diffHobbs },
            tach_actual: { decrement: diffTach }
          }
        });
      }

      // 4. Revert component hours (subtract diff_hobbs from all components)
      if (diffHobbs > 0) {
        await tx.component.updateMany({
          where: { aircraftId: flight.aircraftId },
          data: {
            horas_acumuladas: { decrement: diffHobbs }
          }
        });
      }

      // 5. Delete the flight
      await tx.flight.delete({ where: { id: flightId } });
    });

    return NextResponse.json({ 
      ok: true, 
      reverted: {
        balance: totalCost,
        hobbs: diffHobbs,
        tach: diffTach
      }
    });
  } catch (e: any) {
    console.error("Delete flight error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
