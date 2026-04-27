import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Borra el último batch de movimientos bancarios subidos por cartola.
 *
 * Cada upload de cartola stampa un `uploadBatchId` (UUID) en todos los
 * movimientos que crea. Este endpoint identifica el batch más reciente
 * (el de mayor `createdAt`) y lo borra entero.
 *
 * GET    → preview (no borra). Devuelve los movimientos que se borrarían.
 * DELETE → borra. Requiere ?confirm=true.
 */

async function getLastBatch() {
  const last = await prisma.bankMovement.findFirst({
    where: { uploadBatchId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { uploadBatchId: true, createdAt: true },
  });

  if (!last?.uploadBatchId) {
    return { movements: [], batchId: null as string | null, uploadedAt: null as Date | null };
  }

  const movements = await prisma.bankMovement.findMany({
    where: { uploadBatchId: last.uploadBatchId },
    orderBy: { correlativo: "asc" },
    select: {
      id: true,
      correlativo: true,
      fecha: true,
      descripcion: true,
      egreso: true,
      ingreso: true,
      tipo: true,
      createdAt: true,
    },
  });

  return { movements, batchId: last.uploadBatchId, uploadedAt: last.createdAt };
}

export async function GET() {
  try {
    const { movements, batchId, uploadedAt } = await getLastBatch();
    if (movements.length === 0) {
      return NextResponse.json({ ok: true, count: 0, movements: [] });
    }
    return NextResponse.json({
      ok: true,
      count: movements.length,
      batchId,
      uploadedAt,
      firstCorrelativo: movements[0].correlativo,
      lastCorrelativo: movements[movements.length - 1].correlativo,
      movements: movements.map((m) => ({
        correlativo: m.correlativo,
        fecha: m.fecha.toISOString().slice(0, 10),
        descripcion: m.descripcion,
        egreso: m.egreso ? Number(m.egreso) : null,
        ingreso: m.ingreso ? Number(m.ingreso) : null,
        tipo: m.tipo,
      })),
    });
  } catch (error: any) {
    console.error("delete-last-cartola GET error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("confirm") !== "true") {
      return NextResponse.json(
        { ok: false, error: "Falta ?confirm=true para evitar borrados accidentales" },
        { status: 400 }
      );
    }

    const { movements, batchId } = await getLastBatch();
    if (!batchId || movements.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, message: "No hay batch reciente para borrar" });
    }

    const result = await prisma.bankMovement.deleteMany({ where: { uploadBatchId: batchId } });

    return NextResponse.json({
      ok: true,
      deleted: result.count,
      batchId,
      firstCorrelativo: movements[0].correlativo,
      lastCorrelativo: movements[movements.length - 1].correlativo,
      message: `Se borraron ${result.count} movimientos (#${movements[0].correlativo}–#${movements[movements.length - 1].correlativo}).`,
    });
  } catch (error: any) {
    console.error("delete-last-cartola DELETE error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Error" }, { status: 500 });
  }
}
