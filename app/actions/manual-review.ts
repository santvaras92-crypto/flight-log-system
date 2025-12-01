"use server";

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

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

    // Obtener últimos contadores del Excel (flight_entries)
    const excelState = await tx.sheetState.findUnique({
      where: { key: 'flight_entries' }
    });

    let lastHobbs = submission.Aircraft.hobbs_actual;
    let lastTach = submission.Aircraft.tach_actual;
    let lastAirframe = 0;
    let lastEngine = 0;
    let lastPropeller = 0;

    // Si hay datos en el Excel, usar el primer vuelo (fila 1, después del header)
    if (excelState?.matrix && Array.isArray(excelState.matrix) && excelState.matrix.length > 1) {
      const lastRow = (excelState.matrix as any[])[1];
      // Columnas: ["Fecha","TACH I","TACH F","Δ TACH","HOBBS I","HOBBS F","Δ HOBBS",
      //           "Piloto","Copiloto/Instructor","Cliente","Rate","Instructor/SP Rate",
      //           "Total","AIRFRAME","ENGINE","PROPELLER","Detalle"]
      if (lastRow[5]) lastHobbs = new Decimal(lastRow[5]); // HOBBS F
      if (lastRow[2]) lastTach = new Decimal(lastRow[2]); // TACH F
      if (lastRow[13]) lastAirframe = Number(lastRow[13]); // AIRFRAME
      if (lastRow[14]) lastEngine = Number(lastRow[14]); // ENGINE
      if (lastRow[15]) lastPropeller = Number(lastRow[15]); // PROPELLER
    } else {
      // Si Excel vacío, leer componentes de la DB
      const components = await tx.component.findMany({
        where: { aircraftId: submission.aircraftId }
      });
      const getComp = (tipo: string) => {
        const c = components.find(x => x.tipo.toUpperCase() === tipo);
        return c?.horas_acumuladas ? Number(c.horas_acumuladas) : 0;
      };
      lastAirframe = getComp("AIRFRAME");
      lastEngine = getComp("ENGINE");
      lastPropeller = getComp("PROPELLER");
    }

    if (nuevoHobbs.lte(lastHobbs) || nuevoTach.lte(lastTach)) {
      throw new Error(`Los nuevos contadores deben ser mayores a los actuales (Hobbs: ${lastHobbs}, Tach: ${lastTach})`);
    }

    const diffHobbs = nuevoHobbs.minus(lastHobbs);
    const diffTach = nuevoTach.minus(lastTach);
    
    // Obtener rate del submission o del usuario
    const rate = submission.rate || submission.User.tarifa_hora;
    const instrRate = submission.instructorRate || new Decimal(0);
    
    const costoAvion = diffHobbs.mul(rate);
    const costoInstructor = new Decimal(instrRate).gt(0) ? diffHobbs.mul(instrRate) : new Decimal(0);
    const costoTotal = costoAvion.plus(costoInstructor);

    // Calcular nuevos componentes
    const newAirframe = lastAirframe + Number(diffTach);
    const newEngine = lastEngine + Number(diffTach);
    const newPropeller = lastPropeller + Number(diffTach);

    // **AGREGAR FILA AL EXCEL**
    const newRow = [
      submission.fechaVuelo?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      Number(lastTach).toFixed(1),              // TACH I
      Number(nuevoTach).toFixed(1),            // TACH F
      Number(diffTach).toFixed(1),             // Δ TACH
      Number(lastHobbs).toFixed(1),            // HOBBS I
      Number(nuevoHobbs).toFixed(1),           // HOBBS F
      Number(diffHobbs).toFixed(1),            // Δ HOBBS
      submission.User.nombre,                   // Piloto
      submission.copiloto || "",                // Copiloto/Instructor
      submission.cliente || "",                 // Cliente
      Number(rate),                             // Rate
      Number(instrRate),                        // Instructor Rate
      Number(costoTotal),                       // Total
      newAirframe.toFixed(1),                   // AIRFRAME
      newEngine.toFixed(1),                     // ENGINE
      newPropeller.toFixed(1),                  // PROPELLER
      submission.detalle || ""                  // Detalle
    ];

    // Cargar matriz actual
    let matrix = excelState?.matrix as any[][] || [
      ["Fecha","TACH I","TACH F","Δ TACH","HOBBS I","HOBBS F","Δ HOBBS",
       "Piloto","Copiloto/Instructor","Cliente","Rate","Instructor/SP Rate",
       "Total","AIRFRAME","ENGINE","PROPELLER","Detalle"]
    ];

    // Insertar nueva fila en posición 1 (vuelos más recientes arriba)
    matrix.splice(1, 0, newRow);

    // Guardar Excel actualizado
    await tx.sheetState.upsert({
      where: { key: 'flight_entries' },
      update: { matrix, updatedAt: new Date() },
      create: {
        key: 'flight_entries',
        matrix,
        formulas: {},
        namedExpressions: [
          { name: "rate", expression: String(rate) },
          { name: "instrRate", expression: String(instrRate) }
        ]
      }
    });

    // Actualizar contadores del aircraft
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
        horas_acumuladas: { increment: diffTach },
      },
    });

    // Crear transacción de cargo
    await tx.transaction.create({
      data: {
        monto: costoTotal.negated(),
        tipo: "CARGO_VUELO",
        userId: submission.pilotoId,
      },
    });

    // Actualizar saldo del piloto
    await tx.user.update({
      where: { id: submission.pilotoId },
      data: {
        saldo_cuenta: { decrement: costoTotal },
      },
    });

    // Marcar submission como completada
    await tx.flightSubmission.update({
      where: { id: submissionId },
      data: { estado: "COMPLETADO" },
    });

    return { success: true, row: newRow };
  });
}
