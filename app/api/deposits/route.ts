import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET: listar depósitos
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

    const deposits = await prisma.deposit.findMany({
      where,
      include: { User: { select: { nombre: true, codigo: true } } },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ deposits });
  } catch (error) {
    console.error("Error fetching deposits:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: crear nuevo depósito
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { userId, amount, date, description, reference } = await req.json();

    if (!userId || !amount) {
      return NextResponse.json({ error: "userId y amount requeridos" }, { status: 400 });
    }

    const deposit = await prisma.deposit.create({
      data: {
        userId: Number(userId),
        amount: Number(amount),
        date: date ? new Date(date) : new Date(),
        description,
        reference,
      },
    });

    return NextResponse.json({ ok: true, deposit });
  } catch (error) {
    console.error("Error creating deposit:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
