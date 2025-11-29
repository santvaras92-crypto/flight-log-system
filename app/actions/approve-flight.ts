"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Aprueba un FlightSubmission pendiente y crea el vuelo correspondiente.
 * Usa los datos almacenados en el submission (hobbsFinal, tachFinal, fechaVuelo, etc.)
 * y agrega el rate e instructorRate proporcionados por el admin.
 *
 * @param submissionId - ID del FlightSubmission a aprobar
 * @param rate - Tarifa base por hora del vuelo
 * @param instructorRate - Tarifa de instructor/SP por hora (puede ser 0)
 */
export async function approveFlightSubmission(
  submissionId: number,
  rate: number,
  instructorRate: number
): Promise<{ success: boolean; error?: string; flightId?: number }> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Obtener el submission con todos sus datos
      const submission = await tx.flightSubmission.findUnique({
        where: { id: submissionId },
        include: {
          User: true,
          Aircraft: true,
        },
      });

      if (!submission) {
        return { success: false, error: "Submission no encontrado" };
      }

      if (submission.estado !== "ESPERANDO_APROBACION") {
        return { success: false, error: `El submission no está esperando aprobación (estado: ${submission.estado})` };
      }

      // 2. Validar datos requeridos
      if (!submission.hobbsFinal || !submission.tachFinal) {
        return { success: false, error: "El submission no tiene valores de Hobbs/Tach" };
      }

      const nuevoHobbs = new Prisma.Decimal(submission.hobbsFinal.toString());
      const nuevoTach = new Prisma.Decimal(submission.tachFinal.toString());
      const rateDec = new Prisma.Decimal(rate || 0);
      const instructorRateDec = new Prisma.Decimal(instructorRate || 0);

      // 3. Obtener los máximos actuales de la tabla Flight
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

      const lastHobbs = maxHobbsFlight?.hobbs_fin 
        ? new Prisma.Decimal(maxHobbsFlight.hobbs_fin.toString()) 
        : new Prisma.Decimal(submission.Aircraft.hobbs_actual.toString());
      const lastTach = maxTachFlight?.tach_fin 
        ? new Prisma.Decimal(maxTachFlight.tach_fin.toString()) 
        : new Prisma.Decimal(submission.Aircraft.tach_actual.toString());

      // 4. Validar que los nuevos contadores sean mayores
      if (nuevoHobbs.lte(lastHobbs) || nuevoTach.lte(lastTach)) {
        return { 
          success: false, 
          error: `Los contadores deben ser mayores a los actuales (Hobbs: ${lastHobbs}, Tach: ${lastTach})` 
        };
      }

      // 5. Calcular diferencias
      const diffHobbs = nuevoHobbs.minus(lastHobbs);
      const diffTach = nuevoTach.minus(lastTach);

      // 6. Calcular el costo total: (rate + instructor_rate) * horas
      // A partir del 25/nov/2025 el total se calcula con Rate + Instructor/SP
      const tarifaTotal = rateDec.plus(instructorRateDec);
      const costo = diffHobbs.mul(tarifaTotal);

      // 7. Crear el registro del vuelo
      const flight = await tx.flight.create({
        data: {
          fecha: submission.fechaVuelo || new Date(),
          hobbs_inicio: lastHobbs.toNumber(),
          hobbs_fin: nuevoHobbs.toNumber(),
          tach_inicio: lastTach.toNumber(),
          tach_fin: nuevoTach.toNumber(),
          diff_hobbs: diffHobbs.toNumber(),
          diff_tach: diffTach.toNumber(),
          costo: costo.toNumber(),
          tarifa: tarifaTotal.toNumber(),
          pilotoId: submission.pilotoId,
          aircraftId: submission.aircraftId,
          // Campos opcionales del submission
          cliente: submission.cliente,
          copiloto: submission.copiloto,
          detalle: submission.detalle,
        },
      });

      // 8. Actualizar los contadores del avión
      await tx.aircraft.update({
        where: { matricula: submission.aircraftId },
        data: {
          hobbs_actual: nuevoHobbs.toNumber(),
          tach_actual: nuevoTach.toNumber(),
        },
      });

      // 9. Actualizar los componentes del avión
      await tx.component.updateMany({
        where: { aircraftId: submission.aircraftId },
        data: {
          horas_acumuladas: {
            increment: diffTach.toNumber(),
          },
        },
      });

      // 10. Crear la transacción de cobro
      await tx.transaction.create({
        data: {
          monto: costo.negated().toNumber(),
          tipo: "CARGO_VUELO",
          userId: submission.pilotoId,
          flightId: flight.id,
        },
      });

      // 11. Actualizar el saldo del piloto
      await tx.user.update({
        where: { id: submission.pilotoId },
        data: {
          saldo_cuenta: {
            decrement: costo.toNumber(),
          },
        },
      });

      // 12. Actualizar el submission a COMPLETADO y enlazar el flight
      await tx.flightSubmission.update({
        where: { id: submissionId },
        data: {
          estado: "COMPLETADO",
          rate: rateDec.toNumber(),
          instructorRate: instructorRateDec.toNumber(),
          Flight: { connect: { id: flight.id } },
        },
      });

      // 13. Actualizar el flight para enlazar el submission
      await tx.flight.update({
        where: { id: flight.id },
        data: {
          submissionId: submissionId,
        },
      });

      return { success: true, flightId: flight.id };
    });
  } catch (error) {
    console.error("Error al aprobar submission:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido al aprobar",
    };
  }
}
