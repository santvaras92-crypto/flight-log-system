'use server';

import { prisma } from '@/lib/prisma';

interface RegisterOverhaulInput {
  componentId: number;          // Component DB id
  tipo: string;                 // AIRFRAME | ENGINE | PROPELLER
  aircraftId: string;           // e.g. 'CC-AQI'
  overhaulAirframeHours: number; // AIRFRAME hours at which the overhaul was done
  overhaulDate: string;          // ISO date string
  notes?: string;
}

/**
 * Registra un overhaul para un componente.
 * Usa AIRFRAME como referencia estable porque TACH se reinicia con overhauls de motor.
 * 
 * Fórmula: horas_desde_overhaul = airframe_actual - last_overhaul_airframe
 * 
 * También recalcula propeller_hours en todos los vuelos posteriores al overhaul.
 */
export async function registerOverhaul(input: RegisterOverhaulInput) {
  try {
    const { componentId, tipo, aircraftId, overhaulAirframeHours, overhaulDate, notes } = input;

    // Validate
    if (overhaulAirframeHours <= 0) {
      return { success: false, error: 'Las horas de airframe del overhaul deben ser mayores a 0' };
    }

    // Get the current airframe hours from the last flight
    const lastFlight = await prisma.flight.findFirst({
      where: { aircraftId },
      orderBy: { fecha: 'desc' },
      select: { airframe_hours: true },
    });

    const currentAirframe = lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : null;

    if (currentAirframe === null) {
      return { success: false, error: 'No se encontraron vuelos con horas de airframe para esta aeronave' };
    }

    if (overhaulAirframeHours > currentAirframe) {
      return { success: false, error: `Las horas de airframe del overhaul (${overhaulAirframeHours}) no pueden ser mayores a las actuales (${currentAirframe})` };
    }

    // Update the component with overhaul data
    await prisma.component.update({
      where: { id: componentId },
      data: {
        last_overhaul_airframe: overhaulAirframeHours,
        last_overhaul_date: new Date(overhaulDate),
        overhaul_notes: notes || null,
      },
    });

    // If it's ENGINE or PROPELLER, recalculate the component hours on flights
    // after the overhaul point (identified by airframe_hours >= overhaulAirframeHours)
    if (tipo === 'ENGINE' || tipo === 'PROPELLER') {
      // Find the flight closest to the overhaul airframe hours (the overhaul baseline flight)
      // This is the flight where airframe_hours is closest to overhaulAirframeHours from below
      const baselineFlight = await prisma.flight.findFirst({
        where: {
          aircraftId,
          airframe_hours: { lte: overhaulAirframeHours },
        },
        orderBy: { airframe_hours: 'desc' },
        select: { id: true, airframe_hours: true, fecha: true },
      });

      // Get all flights after the overhaul point, ordered chronologically
      const flightsAfterOverhaul = await prisma.flight.findMany({
        where: {
          aircraftId,
          airframe_hours: { gt: overhaulAirframeHours },
        },
        orderBy: { fecha: 'asc' },
        select: { id: true, airframe_hours: true, diff_tach: true },
      });

      // Recalculate component hours for each flight after overhaul
      // hours_since_overhaul = flight.airframe_hours - overhaulAirframeHours
      const fieldName = tipo === 'ENGINE' ? 'engine_hours' : 'propeller_hours';

      for (const flight of flightsAfterOverhaul) {
        const hoursSinceOverhaul = Number(flight.airframe_hours) - overhaulAirframeHours;
        
        await prisma.flight.update({
          where: { id: flight.id },
          data: {
            [fieldName]: Number(hoursSinceOverhaul.toFixed(1)),
          },
        });
      }

      console.log(`Overhaul registrado: ${tipo} en ${aircraftId}. Recalculados ${flightsAfterOverhaul.length} vuelos.`);
    }

    return { 
      success: true, 
      message: `Overhaul de ${tipo} registrado exitosamente. Horas recalculadas.`,
      hoursSinceOverhaul: currentAirframe - overhaulAirframeHours,
    };
  } catch (error: any) {
    console.error('Error registering overhaul:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Gets overhaul data for all components of an aircraft
 */
export async function getComponentOverhauls(aircraftId: string) {
  try {
    const components = await prisma.component.findMany({
      where: { aircraftId },
      select: {
        id: true,
        tipo: true,
        last_overhaul_airframe: true,
        last_overhaul_date: true,
        overhaul_notes: true,
      },
    });

    return {
      success: true,
      components: components.map(c => ({
        ...c,
        last_overhaul_airframe: c.last_overhaul_airframe ? Number(c.last_overhaul_airframe) : null,
        last_overhaul_date: c.last_overhaul_date?.toISOString() || null,
      })),
    };
  } catch (error: any) {
    return { success: false, error: error.message, components: [] };
  }
}
