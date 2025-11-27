import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const submissionId = request.nextUrl.searchParams.get("id");

    if (!submissionId) {
      return NextResponse.json(
        { error: "Se requiere el ID de la submission" },
        { status: 400 }
      );
    }

    const submission = await prisma.flightSubmission.findUnique({
      where: { id: Number(submissionId) },
      include: {
        ImageLog: true,
        User: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        Aircraft: {
          select: {
            matricula: true,
            modelo: true,
            hobbs_actual: true,
            tach_actual: true,
          },
        },
        Flight: {
          include: {
            Transaction: true,
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
        piloto: submission.User,
        aircraft: submission.Aircraft,
        images: submission.ImageLog.map((img) => ({
          tipo: img.tipo,
          imageUrl: img.imageUrl,
          valorExtraido: img.valorExtraido?.toNumber(),
          confianza: img.confianza?.toNumber(),
          validadoManual: img.validadoManual,
        })),
        flight: submission.Flight ? {
          id: submission.Flight.id,
          fecha: submission.Flight.fecha,
          hobbs_inicio: submission.Flight.hobbs_inicio.toNumber(),
          hobbs_fin: submission.Flight.hobbs_fin.toNumber(),
          tach_inicio: submission.Flight.tach_inicio.toNumber(),
          tach_fin: submission.Flight.tach_fin.toNumber(),
          diff_hobbs: submission.Flight.diff_hobbs.toNumber(),
          diff_tach: submission.Flight.diff_tach.toNumber(),
          costo: submission.Flight.costo.toNumber(),
          transaction: submission.Flight.Transaction ? {
            monto: submission.Flight.Transaction.monto.toNumber(),
            tipo: submission.Flight.Transaction.tipo,
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
