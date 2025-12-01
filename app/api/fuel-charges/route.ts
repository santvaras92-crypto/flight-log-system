import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET: listar cargos de combustible
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const role = (session.user as any)?.rol;

    const where: any = {};
    if (role === "PILOTO") {
      where.userId = (session.user as any).id;
    } else if (userId) {
      where.userId = Number(userId);
    }

    const fuelCharges = await prisma.fuelCharge.findMany({
      where,
      include: { User: { select: { nombre: true, codigo: true } } },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ fuelCharges });
  } catch (error) {
    console.error("Error fetching fuel charges:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: crear nuevo cargo de combustible
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { userId, liters, pricePerLiter, date, location, reference } = await req.json();

    if (!userId || !liters || !pricePerLiter) {
      return NextResponse.json({ error: "userId, liters y pricePerLiter requeridos" }, { status: 400 });
    }

    const totalAmount = Number(liters) * Number(pricePerLiter);

    const fuelCharge = await prisma.fuelCharge.create({
      data: {
        userId: Number(userId),
        liters: Number(liters),
        pricePerLiter: Number(pricePerLiter),
        totalAmount,
        date: date ? new Date(date) : new Date(),
        location,
        reference,
      },
    });

    return NextResponse.json({ ok: true, fuelCharge });
  } catch (error) {
    console.error("Error creating fuel charge:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
