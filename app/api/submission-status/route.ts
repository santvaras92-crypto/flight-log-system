import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("id");

    if (!submissionId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la submission" },
        { status: 400 }
      );
    }

    const submission = await prisma.flightSubmission.findUnique({
      where: { id: Number(submissionId) },
      include: {
        imageLogs: true,
        piloto: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        aircraft: {
          select: {
            matricula: true,
            modelo: true,
            hobbs_actual: true,
            tach_actual: true,
          },
        },
        flight: {
          include: {
            transaction: true,
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        estado: submission.estado,
        errorMessage: submission.errorMessage,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        piloto: submission.piloto,
        aircraft: submission.aircraft,
        images: submission.imageLogs.map((img) => ({
          tipo: img.tipo,
          imageUrl: img.imageUrl,
          valorExtraido: img.valorExtraido?.toNumber(),
          confianza: img.confianza?.toNumber(),
          validadoManual: img.validadoManual,
        })),
        flight: submission.flight ? {
          id: submission.flight.id,
          fecha: submission.flight.fecha,
          hobbs_inicio: submission.flight.hobbs_inicio.toNumber(),
          hobbs_fin: submission.flight.hobbs_fin.toNumber(),
          tach_inicio: submission.flight.tach_inicio.toNumber(),
          tach_fin: submission.flight.tach_fin.toNumber(),
          diff_hobbs: submission.flight.diff_hobbs.toNumber(),
          diff_tach: submission.flight.diff_tach.toNumber(),
          costo: submission.flight.costo.toNumber(),
          transaction: submission.flight.transaction ? {
            monto: submission.flight.transaction.monto.toNumber(),
            tipo: submission.flight.transaction.tipo,
          } : null,
        } : null,
      },
    });
  } catch (error) {
    console.error("Error obteniendo status:", error);
    return NextResponse.json(
      { error: "Error al obtener el estado de la submission" },
      { status: 500 }
    );
  }
}
