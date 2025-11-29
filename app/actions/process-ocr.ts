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
      include: { ImageLog: true },
    });

    if (!submission) {
      throw new Error("Submission no encontrada");
    }

    // Procesar cada imagen con GPT-4o Vision OCR
    for (const imageLog of submission.ImageLog) {
      try {
        const tipo: "HOBBS" | "TACH" | null =
          imageLog.tipo === "HOBBS" || imageLog.tipo === "TACH"
            ? (imageLog.tipo as "HOBBS" | "TACH")
            : null;

        if (!tipo) {
          console.warn(`Tipo de imagen no válido: ${imageLog.tipo}. Se omite.`);
          continue;
        }

        const ocrResult = await extractMeterValue(imageLog.imageUrl, tipo);

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
      include: { ImageLog: true },
    });

    const minConfidence = 50;
    const allHighConfidence = updatedSubmission!.ImageLog.every(
      (img: any) => 
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
  return await prisma.$transaction(async (tx: any) => {
    const submission = await tx.flightSubmission.findUnique({
      where: { id: submissionId },
      include: {
        ImageLog: true,
        User: true,
        Aircraft: true,
      },
    });

    if (!submission) {
      throw new Error("Submission no encontrada");
    }

    const hobbsLog = submission.ImageLog.find((img: any) => img.tipo === "HOBBS");
    const tachLog = submission.ImageLog.find((img: any) => img.tipo === "TACH");

    if (!hobbsLog?.valorExtraido || !tachLog?.valorExtraido) {
      throw new Error("Valores de OCR no disponibles");
    }

    const nuevoHobbs = hobbsLog.valorExtraido;
    const nuevoTach = tachLog.valorExtraido;

    // Obtener los máximos actuales de la tabla Flight
    const maxHobbsFlight = await tx.flight.findFirst({
      where: { aircraftId: submission.aircraftId, hobbs_fin: { not: null } },
      orderBy: { hobbs_fin: "desc" },
      select: { hobbs_fin: true },
    });

    const maxTachFlight = await tx.flight.findFirst({
      where: { aircraftId: submission.aircraftId, tach_fin: { not: null } },
      orderBy: { tach_fin: "desc" },
      select: { tach_fin: true },
    });

    const lastHobbs = maxHobbsFlight?.hobbs_fin || submission.Aircraft.hobbs_actual;
    const lastTach = maxTachFlight?.tach_fin || submission.Aircraft.tach_actual;

    // Validar contadores contra los máximos de Flight
    if (nuevoHobbs.lte(lastHobbs) || nuevoTach.lte(lastTach)) {
      throw new Error(`Los nuevos contadores deben ser mayores a los actuales (Hobbs: ${lastHobbs}, Tach: ${lastTach})`);
    }

    // Calcular diferencias
    const diffHobbs = nuevoHobbs.minus(lastHobbs);
    const diffTach = nuevoTach.minus(lastTach);

    // Calcular costo
    const costo = diffHobbs.mul(submission.User.tarifa_hora);

    // Crear el vuelo
    const flight = await tx.flight.create({
      data: {
        submissionId,
        fecha: submission.fechaVuelo || new Date(),
        hobbs_inicio: lastHobbs,
        hobbs_fin: nuevoHobbs,
        tach_inicio: lastTach,
        tach_fin: nuevoTach,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo,
        tarifa: submission.User.tarifa_hora,
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
