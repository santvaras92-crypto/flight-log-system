import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// DELETE: eliminar depósito
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.deposit.delete({ where: { id: Number(params.id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting deposit:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH: editar depósito
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any)?.rol !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { amount, date, description, reference } = await req.json();

    const deposit = await prisma.deposit.update({
      where: { id: Number(params.id) },
      data: {
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(date && { date: new Date(date) }),
        ...(description !== undefined && { description }),
        ...(reference !== undefined && { reference }),
      },
    });

    return NextResponse.json({ ok: true, deposit });
  } catch (error) {
    console.error("Error updating deposit:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
