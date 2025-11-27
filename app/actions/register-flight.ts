"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js-light";

/**
 * Registra un vuelo y actualiza los contadores y transacciones asociadas.
 *
 * @param pilotoId - ID del piloto que realiza el vuelo.
 * @param matricula - Matrícula de la aeronave utilizada.
 * @param nuevoHobbs - Nuevo valor del contador Hobbs al finalizar el vuelo.
 * @param nuevoTach - Nuevo valor del contador Tach al finalizar el vuelo.
 */
export async function registerFlight(
  pilotoId: number,
  matricula: string,
  nuevoHobbs: number,
  nuevoTach: number
) {
  return await prisma.$transaction(async (tx: any) => {
    // 1. Obtener datos actuales del avión y del piloto
    const aircraft = await tx.aircraft.findUnique({
      where: { matricula },
    });

    if (!aircraft) {
      throw new Error("Aeronave no encontrada");
    }

    const piloto = await tx.user.findUnique({
      where: { id: pilotoId },
    });

    if (!piloto) {
      throw new Error("Piloto no encontrado");
    }

    // 2. Validar que los nuevos contadores sean mayores a los actuales (Decimal)
    const hobbsActual = aircraft.hobbs_actual; // Prisma.Decimal
    const tachActual = aircraft.tach_actual; // Prisma.Decimal

    const nuevoHobbsDec = new Decimal(nuevoHobbs);
    const nuevoTachDec = new Decimal(nuevoTach);

    if (nuevoHobbsDec.lte(hobbsActual) || nuevoTachDec.lte(tachActual)) {
      throw new Error("Los nuevos contadores deben ser mayores a los actuales");
    }

    // 3. Calcular diferencias de contadores (Decimal)
    const diffHobbs = nuevoHobbsDec.minus(hobbsActual);
    const diffTach = nuevoTachDec.minus(tachActual);

    // 4. Calcular el costo del vuelo (Decimal)
    const costo = diffHobbs.mul(piloto.tarifa_hora);

    // 5. Crear el registro del vuelo
    const flight = await tx.flight.create({
      data: {
        hobbs_inicio: hobbsActual,
        hobbs_fin: nuevoHobbsDec,
        tach_inicio: tachActual,
        tach_fin: nuevoTachDec,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo,
        pilotoId,
        aircraftId: matricula,
      },
    });

    // 6. Actualizar los contadores del avión
    await tx.aircraft.update({
      where: { matricula },
      data: {
        hobbs_actual: nuevoHobbsDec,
        tach_actual: nuevoTachDec,
      },
    });

    // 7. Actualizar los componentes del avión
    await tx.component.updateMany({
      where: { aircraftId: matricula },
      data: {
        horas_acumuladas: {
          increment: diffTach,
        },
      },
    });

    // 8. Crear la transacción de cobro
    await tx.transaction.create({
      data: {
        monto: costo.negated(),
        tipo: "CARGO_VUELO",
        userId: pilotoId,
        flightId: flight.id,
      },
    });

    // 9. Actualizar el saldo del piloto
    await tx.user.update({
      where: { id: pilotoId },
      data: {
        saldo_cuenta: {
          decrement: costo,
        },
      },
    });

    return flight;
  });
}