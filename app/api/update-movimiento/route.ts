import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/update-movimiento
 * Deletes BankMovement records by correlativo(s).
 * Body: { correlativos: number[] }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { correlativos } = body;

    if (!correlativos || !Array.isArray(correlativos) || correlativos.length === 0) {
      return NextResponse.json({ ok: false, error: "correlativos (array) es requerido" }, { status: 400 });
    }

    const nums = correlativos.map(Number).filter(n => !isNaN(n));
    if (nums.length === 0) {
      return NextResponse.json({ ok: false, error: "No hay correlativos válidos" }, { status: 400 });
    }

    const result = await prisma.bankMovement.deleteMany({
      where: { correlativo: { in: nums } },
    });

    return NextResponse.json({
      ok: true,
      deleted: result.count,
      message: `${result.count} movimiento(s) eliminado(s)`,
    });
  } catch (err: any) {
    console.error("Error deleting movimientos:", err);
    return NextResponse.json({ ok: false, error: err.message || "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/update-movimiento
 * Updates a single field in BankMovement by correlativo number.
 * Body: { correlativo: number, field: 'tipo' | 'cliente' | 'descripcion', value: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { correlativo, field, value } = body;

    if (!correlativo || !field) {
      return NextResponse.json({ ok: false, error: "correlativo y field son requeridos" }, { status: 400 });
    }

    const allowedFields = ["tipo", "cliente", "descripcion"];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ ok: false, error: `Campo '${field}' no permitido. Solo: ${allowedFields.join(", ")}` }, { status: 400 });
    }

    const newValue = (value ?? "").toString().trim();

    const updated = await prisma.bankMovement.update({
      where: { correlativo: Number(correlativo) },
      data: { [field]: newValue || null },
    });

    return NextResponse.json({
      ok: true,
      correlativo: updated.correlativo,
      field,
      value: newValue,
      message: `Correlativo #${updated.correlativo}: ${field} actualizado a "${newValue}"`,
    });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return NextResponse.json({ ok: false, error: `Correlativo no encontrado` }, { status: 404 });
    }
    console.error("Error updating movimiento:", err);
    return NextResponse.json({ ok: false, error: err.message || "Error interno" }, { status: 500 });
  }
}
