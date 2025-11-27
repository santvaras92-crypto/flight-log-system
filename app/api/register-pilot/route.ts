import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, apellido, fecha_nacimiento, email, telefono, licencia } = body;

    // Validar campos requeridos
    if (!nombre || !email) {
      return NextResponse.json(
        { ok: false, error: "Nombre y email son requeridos" },
        { status: 400 }
      );
    }

    // Build display name (nombre + apellido)
    const displayName = [nombre, apellido].filter(Boolean).join(" ");

    // Crear el piloto
    const user = await prisma.user.create({
      data: {
        nombre: displayName || nombre,
        email: email.trim().toLowerCase(),
        rol: "PILOTO",
        saldo_cuenta: 0,
        tarifa_hora: 170000,
        password: randomUUID(), // Password temporal
      },
    });

    return NextResponse.json({ ok: true, pilotId: user.id });
  } catch (e: any) {
    console.error("Error creating pilot:", e);
    
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un usuario con ese correo." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
