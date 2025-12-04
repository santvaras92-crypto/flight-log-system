import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      codigo,
      nombre,
      fechaNacimiento,
      email,
      telefono,
      licencia,
      tipoDocumento,
      documento,
      tarifa_hora
    } = body || {};

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID de piloto requerido" }, { status: 400 });
    }

    // Verificar que el piloto existe
    const existing = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Piloto no encontrado" }, { status: 404 });
    }

    // Si se cambia el email, verificar que no esté en uso (si no está vacío)
    if (email !== undefined && email && email.trim() !== '') {
      if (email !== existing.email) {
        const emailInUse = await prisma.user.findFirst({ where: { email, NOT: { id: Number(id) } } });
        if (emailInUse) {
          return NextResponse.json({ ok: false, error: "Email ya está en uso por otro usuario" }, { status: 409 });
        }
      }
    }

    // Si se cambia el código, verificar que no esté en uso
    if (codigo && codigo !== existing.codigo) {
      const codigoInUse = await prisma.user.findFirst({ where: { codigo, NOT: { id: Number(id) } } });
      if (codigoInUse) {
        return NextResponse.json({ ok: false, error: "Código ya está en uso por otro piloto" }, { status: 409 });
      }
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updateData: any = {};
    
    if (codigo !== undefined) updateData.codigo = codigo || null;
    if (nombre !== undefined) updateData.nombre = nombre;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (telefono !== undefined) updateData.telefono = telefono || null;
    if (licencia !== undefined) updateData.licencia = licencia || null;
    if (tipoDocumento !== undefined) updateData.tipoDocumento = tipoDocumento || null;
    if (documento !== undefined) updateData.documento = documento || null;
    if (tarifa_hora !== undefined) updateData.tarifa_hora = Number(tarifa_hora) || 0;
    if (fechaNacimiento !== undefined) {
      updateData.fechaNacimiento = fechaNacimiento ? new Date(fechaNacimiento) : null;
    }

    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data: updateData
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (e: any) {
    console.error("Error updating pilot:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error de servidor" }, { status: 500 });
  }
}
