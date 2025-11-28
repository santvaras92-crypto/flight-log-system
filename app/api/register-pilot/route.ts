import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { codigo, nombre, apellido, fecha_nacimiento, email, telefono, licencia } = body;

    // Validar campos requeridos (Código es opcional ahora)
    if (!nombre || !email) {
      return NextResponse.json(
        { ok: false, error: "Nombre y email son requeridos" },
        { status: 400 }
      );
    }

    let codeToUse = codigo ? codigo.trim().toUpperCase() : null;
    if (codeToUse === "") codeToUse = null;

    // Check if codigo already exists (only if provided)
    if (codeToUse) {
      const existingCodigo = await prisma.user.findFirst({
        where: { codigo: codeToUse }
      });
      
      if (existingCodigo) {
        return NextResponse.json(
          { ok: false, error: "Ya existe un piloto con ese código." },
          { status: 409 }
        );
      }
    }

    // Build display name (nombre + apellido)
    const displayName = [nombre, apellido].filter(Boolean).join(" ");

    // Crear el piloto
    const user = await prisma.user.create({
      data: {
        codigo: codeToUse,
        nombre: displayName || nombre,
        email: email.trim().toLowerCase(),
        rol: "PILOTO",
        saldo_cuenta: 0,
        tarifa_hora: 170000,
        password: randomUUID(), // Password temporal
        fecha_nacimiento: fecha_nacimiento ? new Date(fecha_nacimiento) : null,
        telefono: telefono || null,
        licencia: licencia || null,
      },
    });

    // Append to CSV file only if code exists
    if (codeToUse) {
      try {
        const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
        const newLine = `\n${codeToUse};${displayName}`;
        fs.appendFileSync(csvPath, newLine, 'utf-8');
      } catch (csvError) {
        console.error("Error updating CSV:", csvError);
        // Don't fail the request if CSV update fails
      }
    }

    return NextResponse.json({ ok: true, pilotId: user.id });
  } catch (e: any) {
    console.error("Error creating pilot:", e);
    
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un usuario con ese correo o código." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
