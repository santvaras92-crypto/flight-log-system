// rebuild trigger 1765397735
"use server";

import { prisma } from "@/lib/prisma";

export async function cancelFlightSubmission(
  submissionId: number,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const submission = await prisma.flightSubmission.findUnique({
      where: { id: submissionId },
      include: { Flight: true },
    });

    if (!submission) return { success: false, error: "Submission no encontrado" };

    if (submission.estado === "COMPLETADO") {
      return { success: false, error: "No se puede cancelar: ya está completado" };
    }

    // Usar transacción para eliminar Flight y actualizar submission
    await prisma.$transaction(async (tx) => {
      // 1. Si existe Flight asociado, eliminarlo junto con su transacción
      if (submission.Flight) {
        const flightId = submission.Flight.id;
        
        // Eliminar transacción asociada al vuelo (si existe)
        await tx.transaction.deleteMany({
          where: { flightId: flightId },
        });

        // Eliminar el Flight
        await tx.flight.delete({
          where: { id: flightId },
        });

        // Revertir contadores del avión al estado anterior
        // Obtener el vuelo anterior (si existe)
        const previousFlight = await tx.flight.findFirst({
          where: { aircraftId: submission.Flight.aircraftId },
          orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
          select: { 
            hobbs_fin: true, 
            tach_fin: true,
            airframe_hours: true,
            engine_hours: true,
            propeller_hours: true,
          },
        });

        if (previousFlight) {
          // Actualizar contadores del avión al vuelo anterior
          await tx.aircraft.update({
            where: { matricula: submission.Flight.aircraftId },
            data: {
              hobbs_actual: previousFlight.hobbs_fin ? Number(previousFlight.hobbs_fin) : 0,
              tach_actual: previousFlight.tach_fin ? Number(previousFlight.tach_fin) : 0,
            },
          });

          // Actualizar componentes al vuelo anterior
          if (previousFlight.airframe_hours !== null) {
            await tx.component.updateMany({
              where: { aircraftId: submission.Flight.aircraftId, tipo: "AIRFRAME" },
              data: { horas_acumuladas: Number(previousFlight.airframe_hours) },
            });
          }
          if (previousFlight.engine_hours !== null) {
            await tx.component.updateMany({
              where: { aircraftId: submission.Flight.aircraftId, tipo: "ENGINE" },
              data: { horas_acumuladas: Number(previousFlight.engine_hours) },
            });
          }
          if (previousFlight.propeller_hours !== null) {
            await tx.component.updateMany({
              where: { aircraftId: submission.Flight.aircraftId, tipo: "PROPELLER" },
              data: { horas_acumuladas: Number(previousFlight.propeller_hours) },
            });
          }
        }
      }

      // 2. Actualizar el submission a CANCELADO
      await tx.flightSubmission.update({
        where: { id: submissionId },
        data: {
          estado: "CANCELADO",
          errorMessage: reason ? `Cancelado: ${reason}` : "Cancelado por administrador",
        },
      });
    });

    return { success: true };
  } catch (e: any) {
    console.error("Error al cancelar submission:", e);
    return { success: false, error: e?.message || "Error desconocido al cancelar" };
  }
}
