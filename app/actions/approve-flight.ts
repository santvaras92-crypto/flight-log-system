// rebuild trigger 1765397735
"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Aprueba un FlightSubmission pendiente y actualiza el vuelo existente.
 * Asigna tarifa e instructor_rate y crea la transacción de cobro.
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
      // 1. Obtener el submission con todos sus datos y el Flight asociado
      const submission = await tx.flightSubmission.findUnique({
        where: { id: submissionId },
        include: {
          User: true,
          Aircraft: true,
          Flight: true,
        },
      });

      if (!submission) {
        return { success: false, error: "Submission no encontrado" };
      }

      if (submission.estado !== "PENDIENTE" && submission.estado !== "ESPERANDO_APROBACION") {
        return { success: false, error: `El submission no está esperando aprobación (estado: ${submission.estado})` };
      }

      if (!submission.Flight) {
        return { success: false, error: "El submission no tiene un vuelo asociado" };
      }

      const flight = submission.Flight;
      const rateDec = new Prisma.Decimal(rate || 0);
      const instructorRateDec = new Prisma.Decimal(instructorRate || 0);

      // 2. Calcular el costo total: (rate + instructor_rate) * diff_hobbs
      const diffHobbs = flight.diff_hobbs ? new Prisma.Decimal(flight.diff_hobbs.toString()) : new Prisma.Decimal(0);
      const tarifaTotal = rateDec.plus(instructorRateDec);
      const costo = diffHobbs.mul(tarifaTotal);

      // 3. Actualizar el Flight con tarifa, instructor_rate y costo
      await tx.flight.update({
        where: { id: flight.id },
        data: {
          tarifa: rateDec.toNumber(),
          instructor_rate: instructorRateDec.toNumber(),
          costo: costo.toNumber(),
          aprobado: true,
        },
      });

      // 4. Crear la transacción de cobro
      await tx.transaction.create({
        data: {
          monto: costo.negated().toNumber(),
          tipo: "CARGO_VUELO",
          userId: submission.pilotoId,
          flightId: flight.id,
        },
      });

      // 5. Actualizar el saldo del piloto
      await tx.user.update({
        where: { id: submission.pilotoId },
        data: {
          saldo_cuenta: {
            decrement: costo.toNumber(),
          },
        },
      });

      // 6. Actualizar el submission a COMPLETADO
      await tx.flightSubmission.update({
        where: { id: submissionId },
        data: {
          estado: "COMPLETADO",
          rate: rateDec.toNumber(),
          instructorRate: instructorRateDec.toNumber(),
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
