"use server";

import { prisma } from "@/lib/prisma";

/**
 * Paso 1: El piloto envía las fotos de Hobbs y Tach
 * Esta acción crea un FlightSubmission y almacena las imágenes
 */
export async function submitFlightImages(
  pilotoId: number,
  matricula: string,
  hobbsImageUrl: string,
  tachImageUrl: string
) {
  try {
    const submission = await prisma.flightSubmission.create({
      data: {
        pilotoId,
        aircraftId: matricula,
        estado: "PENDIENTE",
        imageLogs: {
          create: [
            {
              tipo: "HOBBS",
              imageUrl: hobbsImageUrl,
            },
            {
              tipo: "TACH",
              imageUrl: tachImageUrl,
            },
          ],
        },
      },
      include: {
        imageLogs: true,
      },
    });

    return { success: true, submissionId: submission.id };
  } catch (error) {
    console.error("Error al enviar imágenes:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Error al procesar las imágenes" 
    };
  }
}
