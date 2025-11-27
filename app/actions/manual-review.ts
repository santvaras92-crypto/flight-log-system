"use server";

import { prisma } from "@/lib/prisma";

/**
 * Permite a un ADMIN validar manualmente los valores de OCR
 */
export async function manualReviewAndApprove(
  submissionId: number,
  hobbsValue: number,
  tachValue: number,
  adminId: number
) {
  try {
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || admin.rol !== "ADMIN") {
      throw new Error("No autorizado");
    }

    const submission = await prisma.flightSubmission.findUnique({
      where: { id: submissionId },
      include: { ImageLog: true },
    });

    if (!submission) {
      throw new Error("Submission no encontrada");
    }

    const hobbsLog = submission.ImageLog.find((img) => img.tipo === "HOBBS");
    const tachLog = submission.ImageLog.find((img) => img.tipo === "TACH");

    if (hobbsLog) {
      await prisma.imageLog.update({
        where: { id: hobbsLog.id },
        data: {
          valorExtraido: hobbsValue,
          validadoManual: true,
          confianza: 100,
        },
      });
    }

    if (tachLog) {
      await prisma.imageLog.update({
        where: { id: tachLog.id },
        data: {
          valorExtraido: tachValue,
          validadoManual: true,
          confianza: 100,
        },
      });
    }

    await autoRegisterFlightForReview(submissionId);

    return { success: true };
  } catch (error) {
    console.error("Error en revisión manual:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Error desconocido" 
    };
  }
}

async function autoRegisterFlightForReview(submissionId: number) {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.flightSubmission.findUnique({
      where: { id: submissionId },
      include: {
        ImageLog: true,
        User: true,
        Aircraft: true,
      },
    });

    if (!submission) throw new Error("Submission no encontrada");

    const hobbsLog = submission.ImageLog.find((img) => img.tipo === "HOBBS");
    const tachLog = submission.ImageLog.find((img) => img.tipo === "TACH");

    if (!hobbsLog?.valorExtraido || !tachLog?.valorExtraido) {
      throw new Error("Valores de OCR no disponibles");
    }

    const nuevoHobbs = hobbsLog.valorExtraido;
    const nuevoTach = tachLog.valorExtraido;

    if (
      nuevoHobbs.lte(submission.Aircraft.hobbs_actual) ||
      nuevoTach.lte(submission.Aircraft.tach_actual)
    ) {
      throw new Error("Los nuevos contadores deben ser mayores a los actuales");
    }

    const diffHobbs = nuevoHobbs.minus(submission.Aircraft.hobbs_actual);
    const diffTach = nuevoTach.minus(submission.Aircraft.tach_actual);
    const costo = diffHobbs.mul(submission.User.tarifa_hora);

    const flight = await tx.flight.create({
      data: {
        submissionId,
        hobbs_inicio: submission.Aircraft.hobbs_actual,
        hobbs_fin: nuevoHobbs,
        tach_inicio: submission.Aircraft.tach_actual,
        tach_fin: nuevoTach,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo,
        pilotoId: submission.pilotoId,
        aircraftId: submission.aircraftId,
      },
    });

    await tx.aircraft.update({
      where: { matricula: submission.aircraftId },
      data: {
        hobbs_actual: nuevoHobbs,
        tach_actual: nuevoTach,
      },
    });

    await tx.component.updateMany({
      where: { aircraftId: submission.aircraftId },
      data: {
        horas_acumuladas: { increment: diffTach },
      },
    });

    await tx.transaction.create({
      data: {
        monto: costo.negated(),
        tipo: "CARGO_VUELO",
        userId: submission.pilotoId,
        flightId: flight.id,
      },
    });

    await tx.user.update({
      where: { id: submission.pilotoId },
      data: {
        saldo_cuenta: { decrement: costo },
      },
    });

    await tx.flightSubmission.update({
      where: { id: submissionId },
      data: { estado: "COMPLETADO" },
    });

    return flight;
  });
}
