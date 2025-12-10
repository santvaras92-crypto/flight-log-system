// rebuild trigger 1765397735
// Railway rebuild fix - Dec 7, 2025
'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

interface UpdateCountersInput {
  flightId: number;
  hobbs_inicio: number;
  hobbs_fin: number;
  tach_inicio: number;
  tach_fin: number;
}

export async function updateCounters(input: UpdateCountersInput) {
  try {
    const { flightId, hobbs_inicio, hobbs_fin, tach_inicio, tach_fin } = input;

    // Validar que los valores finales sean mayores a los iniciales
    if (hobbs_fin <= hobbs_inicio) {
      return { success: false, error: 'HOBBS final debe ser mayor a HOBBS inicio' };
    }
    if (tach_fin <= tach_inicio) {
      return { success: false, error: 'TACH final debe ser mayor a TACH inicio' };
    }

    // Calcular deltas
    const diff_hobbs = new Prisma.Decimal(hobbs_fin).minus(hobbs_inicio);
    const diff_tach = new Prisma.Decimal(tach_fin).minus(tach_inicio);

    // Obtener el vuelo actual para recalcular componentes
    const currentFlight = await prisma.flight.findUnique({
      where: { id: flightId },
      select: { 
        airframe_hours: true, 
        engine_hours: true, 
        propeller_hours: true,
        diff_tach: true,
      },
    });

    if (!currentFlight) {
      return { success: false, error: 'Vuelo no encontrado' };
    }

    // Recalcular horas de componentes
    // Restar el diff_tach anterior y sumar el nuevo
    const oldDiffTach = currentFlight.diff_tach ? new Prisma.Decimal(currentFlight.diff_tach.toString()) : new Prisma.Decimal(0);
    const adjustment = diff_tach.minus(oldDiffTach);

    const newAirframeHours = currentFlight.airframe_hours 
      ? new Prisma.Decimal(currentFlight.airframe_hours.toString()).plus(adjustment)
      : null;
    const newEngineHours = currentFlight.engine_hours
      ? new Prisma.Decimal(currentFlight.engine_hours.toString()).plus(adjustment)
      : null;
    const newPropellerHours = currentFlight.propeller_hours
      ? new Prisma.Decimal(currentFlight.propeller_hours.toString()).plus(adjustment)
      : null;

    // Actualizar el vuelo
    await prisma.flight.update({
      where: { id: flightId },
      data: {
        hobbs_inicio: new Prisma.Decimal(hobbs_inicio),
        hobbs_fin: new Prisma.Decimal(hobbs_fin),
        tach_inicio: new Prisma.Decimal(tach_inicio),
        tach_fin: new Prisma.Decimal(tach_fin),
        diff_hobbs,
        diff_tach,
        airframe_hours: newAirframeHours,
        engine_hours: newEngineHours,
        propeller_hours: newPropellerHours,
      },
    });

    // Actualizar el aircraft con los nuevos valores finales
    await prisma.aircraft.update({
      where: { matricula: 'CC-AQI' },
      data: {
        hobbs_actual: new Prisma.Decimal(hobbs_fin),
        tach_actual: new Prisma.Decimal(tach_fin),
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating counters:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
// Railway rebuild Wed Dec 10 16:59:50 -03 2025
