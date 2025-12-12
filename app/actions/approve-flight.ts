// rebuild trigger 1765397735
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

      if (submission.estado !== "PENDIENTE" && submission.estado !== "ESPERANDO_APROBACION") {
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

      // 3. Obtener el último vuelo por fecha para calcular baselines y componentes
      const lastFlight = await tx.flight.findFirst({
        where: { aircraftId: submission.aircraftId },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        select: { 
          hobbs_fin: true, 
          tach_fin: true,
          airframe_hours: true, 
          engine_hours: true, 
          propeller_hours: true 
        },
      });

      const lastHobbs = lastFlight?.hobbs_fin 
        ? new Prisma.Decimal(lastFlight.hobbs_fin.toString()) 
        : new Prisma.Decimal(submission.Aircraft.hobbs_actual.toString());
      const lastTach = lastFlight?.tach_fin 
        ? new Prisma.Decimal(lastFlight.tach_fin.toString()) 
        : new Prisma.Decimal(submission.Aircraft.tach_actual.toString());
      
      // Obtener últimas horas de componentes
      const lastAirframe = lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : null;
      const lastEngine = lastFlight?.engine_hours ? Number(lastFlight.engine_hours) : null;
      const lastPropeller = lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : null;

      // 4. Calcular diferencias (validación ya hecha en el formulario de registro)
      const diffHobbs = nuevoHobbs.minus(lastHobbs);
      const diffTach = nuevoTach.minus(lastTach);

      // 5. Calcular el costo total: (rate + instructor_rate) * horas
      // A partir del 25/nov/2025 el total se calcula con Rate + Instructor/SP
      const tarifaTotal = rateDec.plus(instructorRateDec);
      const costo = diffHobbs.mul(tarifaTotal);

      // 6. Crear el registro del vuelo
      // Calcular nuevas horas de componentes (solo si hay valores previos)
      const newAirframe = lastAirframe !== null ? Number((lastAirframe + diffTach.toNumber()).toFixed(1)) : null;
      const newEngine = lastEngine !== null ? Number((lastEngine + diffTach.toNumber()).toFixed(1)) : null;
      const newPropeller = lastPropeller !== null ? Number((lastPropeller + diffTach.toNumber()).toFixed(1)) : null;

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
          tarifa: rateDec.toNumber(),
          instructor_rate: instructorRateDec.toNumber(),
          airframe_hours: newAirframe,
          engine_hours: newEngine,
          propeller_hours: newPropeller,
          pilotoId: submission.pilotoId,
          aircraftId: submission.aircraftId,
          // Cliente = código del piloto (ej. "FA" para Franco Acosta)
          cliente: submission.User?.codigo || null,
          copiloto: submission.copiloto,
          detalle: submission.detalle,
          aerodromoSalida: submission.aerodromoSalida || 'SCCV',
          aerodromoDestino: submission.aerodromoDestino || 'SCCV',
        },
      });

      // 7. Actualizar los contadores del avión
      await tx.aircraft.update({
        where: { matricula: submission.aircraftId },
        data: {
          hobbs_actual: nuevoHobbs.toNumber(),
          tach_actual: nuevoTach.toNumber(),
        },
      });

      // 8. Actualizar los componentes del avión con los valores exactos del vuelo
      if (newAirframe !== null) {
        await tx.component.updateMany({
          where: { aircraftId: submission.aircraftId, tipo: "AIRFRAME" },
          data: { horas_acumuladas: newAirframe },
        });
      }
      if (newEngine !== null) {
        await tx.component.updateMany({
          where: { aircraftId: submission.aircraftId, tipo: "ENGINE" },
          data: { horas_acumuladas: newEngine },
        });
      }
      if (newPropeller !== null) {
        await tx.component.updateMany({
          where: { aircraftId: submission.aircraftId, tipo: "PROPELLER" },
          data: { horas_acumuladas: newPropeller },
        });
      }

      // 9. Crear la transacción de cobro
      await tx.transaction.create({
        data: {
          monto: costo.negated().toNumber(),
          tipo: "CARGO_VUELO",
          userId: submission.pilotoId,
          flightId: flight.id,
        },
      });

      // 10. Actualizar el saldo del piloto
      await tx.user.update({
        where: { id: submission.pilotoId },
        data: {
          saldo_cuenta: {
            decrement: costo.toNumber(),
          },
        },
      });

      // 11. Actualizar el submission a COMPLETADO y enlazar el flight
      await tx.flightSubmission.update({
        where: { id: submissionId },
        data: {
          estado: "COMPLETADO",
          rate: rateDec.toNumber(),
          instructorRate: instructorRateDec.toNumber(),
          Flight: { connect: { id: flight.id } },
        },
      });

      // 12. Actualizar el flight para enlazar el submission
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
