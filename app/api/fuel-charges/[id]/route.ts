import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// DELETE: eliminar cargo de combustible
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.fuelCharge.delete({ where: { id: Number(params.id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting fuel charge:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH: editar cargo de combustible
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { liters, pricePerLiter, date, location, reference } = await req.json();

    const data: any = {};
    if (liters !== undefined) data.liters = Number(liters);
    if (pricePerLiter !== undefined) data.pricePerLiter = Number(pricePerLiter);
    if (liters !== undefined || pricePerLiter !== undefined) {
      const charge = await prisma.fuelCharge.findUnique({ where: { id: Number(params.id) } });
      data.totalAmount = (liters ?? charge?.liters ?? 0) * (pricePerLiter ?? charge?.pricePerLiter ?? 0);
    }
    if (date) data.date = new Date(date);
    if (location !== undefined) data.location = location;
    if (reference !== undefined) data.reference = reference;

    const fuelCharge = await prisma.fuelCharge.update({
      where: { id: Number(params.id) },
      data,
    });

    return NextResponse.json({ ok: true, fuelCharge });
  } catch (error) {
    console.error("Error updating fuel charge:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
