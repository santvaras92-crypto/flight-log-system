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

    if (submission.Flight) {
      return { success: false, error: "No se puede cancelar: el submission ya tiene vuelo registrado" };
    }

    if (submission.estado === "COMPLETADO") {
      return { success: false, error: "No se puede cancelar: ya está completado" };
    }

    await prisma.flightSubmission.update({
      where: { id: submissionId },
      data: {
        estado: "CANCELADO",
        errorMessage: reason ? `Cancelado: ${reason}` : "Cancelado por administrador",
      },
    });

    return { success: true };
  } catch (e: any) {
    console.error("Error al cancelar submission:", e);
    return { success: false, error: e?.message || "Error desconocido al cancelar" };
  }
}
