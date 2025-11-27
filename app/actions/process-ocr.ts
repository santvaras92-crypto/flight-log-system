"use server";

import { prisma } from "@/lib/prisma";
import { extractMeterValue } from "@/lib/ocr-service";

/**
 * Paso 2: Procesa las imágenes con OCR usando GPT-4o Vision
 */
export async function processOCR(submissionId: number) {
  try {
    await prisma.flightSubmission.update({
      where: { id: submissionId },
      data: { estado: "PROCESANDO" },
    });

    const submission = await prisma.flightSubmission.findUnique({
      where: { id: submissionId },
      include: { imageLogs: true },
    });

    if (!submission) {
      throw new Error("Submission no encontrada");
    }

    // Procesar cada imagen con GPT-4o Vision OCR
    for (const imageLog of submission.imageLogs) {
      try {
        const ocrResult = await extractMeterValue(
          imageLog.imageUrl,
          imageLog.tipo
        );

        await prisma.imageLog.update({
          where: { id: imageLog.id },
          data: {
            valorExtraido: ocrResult.value,
            confianza: ocrResult.confidence,
          },
        });
      } catch (ocrError) {
        console.error(`Error procesando ${imageLog.tipo}:`, ocrError);
        
        await prisma.imageLog.update({
          where: { id: imageLog.id },
          data: {
            confianza: 0,
          },
        });
      }
    }

    // Verificar si la confianza es suficiente para auto-aprobar
    const updatedSubmission = await prisma.flightSubmission.findUnique({
      where: { id: submissionId },
      include: { imageLogs: true },
    });

    const minConfidence = 85;
    const allHighConfidence = updatedSubmission!.imageLogs.every(
      (img) => 
        img.confianza && 
        img.confianza.toNumber() >= minConfidence &&
        img.valorExtraido !== null
    );

    if (allHighConfidence) {
      await autoRegisterFlight(submissionId);
    } else {
      await prisma.flightSubmission.update({
        where: { id: submissionId },
        data: { estado: "REVISION" },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error en OCR:", error);
    
    await prisma.flightSubmission.update({
      where: { id: submissionId },
      data: {
        estado: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Error desconocido",
      },
    });

    return { success: false, error: "Error al procesar OCR" };
  }
}

/**
 * Registra automáticamente el vuelo si el OCR tiene alta confianza
 */
async function autoRegisterFlight(submissionId: number) {
  return await prisma.$transaction(async (tx) => {
    const submission = await tx.flightSubmission.findUnique({
      where: { id: submissionId },
      include: {
        imageLogs: true,
        piloto: true,
        aircraft: true,
      },
    });

    if (!submission) {
      throw new Error("Submission no encontrada");
    }

    const hobbsLog = submission.imageLogs.find((img) => img.tipo === "HOBBS");
    const tachLog = submission.imageLogs.find((img) => img.tipo === "TACH");

    if (!hobbsLog?.valorExtraido || !tachLog?.valorExtraido) {
      throw new Error("Valores de OCR no disponibles");
    }

    const nuevoHobbs = hobbsLog.valorExtraido;
    const nuevoTach = tachLog.valorExtraido;

    // Validar contadores
    if (
      nuevoHobbs.lte(submission.aircraft.hobbs_actual) ||
      nuevoTach.lte(submission.aircraft.tach_actual)
    ) {
      throw new Error("Los nuevos contadores deben ser mayores a los actuales");
    }

    // Calcular diferencias
    const diffHobbs = nuevoHobbs.minus(submission.aircraft.hobbs_actual);
    const diffTach = nuevoTach.minus(submission.aircraft.tach_actual);

    // Calcular costo
    const costo = diffHobbs.mul(submission.piloto.tarifa_hora);

    // Crear el vuelo
    const flight = await tx.flight.create({
      data: {
        submissionId,
        hobbs_inicio: submission.aircraft.hobbs_actual,
        hobbs_fin: nuevoHobbs,
        tach_inicio: submission.aircraft.tach_actual,
        tach_fin: nuevoTach,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo,
        pilotoId: submission.pilotoId,
        aircraftId: submission.aircraftId,
      },
    });

    // Actualizar contadores del avión
    await tx.aircraft.update({
      where: { matricula: submission.aircraftId },
      data: {
        hobbs_actual: nuevoHobbs,
        tach_actual: nuevoTach,
      },
    });

    // Actualizar componentes
    await tx.component.updateMany({
      where: { aircraftId: submission.aircraftId },
      data: {
        horas_acumuladas: {
          increment: diffTach,
        },
      },
    });

    // Crear transacción de cobro
    await tx.transaction.create({
      data: {
        monto: costo.negated(),
        tipo: "CARGO_VUELO",
        userId: submission.pilotoId,
        flightId: flight.id,
      },
    });

    // Actualizar saldo del piloto
    await tx.user.update({
      where: { id: submission.pilotoId },
      data: {
        saldo_cuenta: {
          decrement: costo,
        },
      },
    });

    // Marcar submission como completada
    await tx.flightSubmission.update({
      where: { id: submissionId },
      data: { estado: "COMPLETADO" },
    });

    return flight;
  });
}
