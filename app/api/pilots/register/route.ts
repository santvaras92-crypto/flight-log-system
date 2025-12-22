import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUniquePilotCode } from "@/lib/codegen";
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      nombre,
      apellido,
      fechaNacimiento,
      email,
      telefono,
      numeroLicencia,
      tipoDocumento,
      documento,
      tarifaHora
    } = body || {};

    if (!nombre || !email) {
      return NextResponse.json({ ok: false, error: "Nombre y correo son requeridos" }, { status: 400 });
    }

    const existingEmail = await prisma.user.findFirst({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ ok: false, error: "Email ya está en uso" }, { status: 409 });
    }

    const codigo = await generateUniquePilotCode(nombre, apellido);
    const hashedPassword = await bcrypt.hash('aqi', 10);

    const user = await prisma.user.create({
      data: {
        nombre: `${nombre}${apellido ? " " + apellido : ""}`.trim(),
        email,
        telefono: telefono || null,
        licencia: numeroLicencia || null,
        tipoDocumento: tipoDocumento || null,
        documento: documento || null,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        codigo,
        rol: "PILOTO",
        tarifa_hora: tarifaHora != null ? Number(tarifaHora) : 0,
        password: hashedPassword, // Default password: aqi
      }
    });

    return NextResponse.json({ ok: true, codigo, userId: user.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error de servidor" }, { status: 500 });
  }
}
