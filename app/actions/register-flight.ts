// rebuild trigger 1765397735
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
 * @param fechaVuelo - Fecha del vuelo (opcional, por defecto hoy).
 */
export async function registerFlight(
  pilotoId: number,
  matricula: string,
  nuevoHobbs: number,
  nuevoTach: number,
  fechaVuelo?: Date
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

    // 2. Obtener los máximos actuales de la tabla Flight
    const maxHobbsFlight = await tx.flight.findFirst({
      where: { aircraftId: matricula, hobbs_fin: { not: null } },
      orderBy: { hobbs_fin: "desc" },
      select: { hobbs_fin: true },
    });

    const maxTachFlight = await tx.flight.findFirst({
      where: { aircraftId: matricula, tach_fin: { not: null } },
      orderBy: { tach_fin: "desc" },
      select: { tach_fin: true },
    });

    const lastHobbs = maxHobbsFlight?.hobbs_fin || aircraft.hobbs_actual;
    const lastTach = maxTachFlight?.tach_fin || aircraft.tach_actual;

    const nuevoHobbsDec = new Decimal(nuevoHobbs);
    const nuevoTachDec = new Decimal(nuevoTach);

    if (nuevoHobbsDec.lte(lastHobbs) || nuevoTachDec.lte(lastTach)) {
      throw new Error(`Los nuevos contadores deben ser mayores a los actuales (Hobbs: ${lastHobbs}, Tach: ${lastTach})`);
    }

    // 3. Calcular diferencias de contadores (Decimal)
    const diffHobbs = nuevoHobbsDec.minus(lastHobbs);
    const diffTach = nuevoTachDec.minus(lastTach);

    // 4. Calcular el costo del vuelo (Decimal)
    const costo = diffHobbs.mul(piloto.tarifa_hora);

    // 5. Crear el registro del vuelo
    const flight = await tx.flight.create({
      data: {
        fecha: fechaVuelo || new Date(),
        hobbs_inicio: lastHobbs,
        hobbs_fin: nuevoHobbsDec,
        tach_inicio: lastTach,
        tach_fin: nuevoTachDec,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo,
        tarifa: piloto.tarifa_hora,
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