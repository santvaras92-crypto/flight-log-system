import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Obtener el último vuelo por hobbs_fin DESC
    const lastFlight = await prisma.flight.findFirst({
      where: { aircraftId: "CC-AQI", hobbs_fin: { not: null } },
      orderBy: { hobbs_fin: "desc" },
      select: { 
        hobbs_fin: true, 
        tach_fin: true,
        airframe_hours: true,
        engine_hours: true,
        propeller_hours: true,
        aerodromoDestino: true,
      },
    });

    const lastCounters = {
      hobbs: lastFlight?.hobbs_fin ? Number(lastFlight.hobbs_fin) : null,
      tach: lastFlight?.tach_fin ? Number(lastFlight.tach_fin) : null,
    };

    const lastComponents = {
      airframe: lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : null,
      engine: lastFlight?.engine_hours ? Number(lastFlight.engine_hours) : null,
      propeller: lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : null,
    };

    const lastAerodromoDestino = lastFlight?.aerodromoDestino || 'SCCV';

    return NextResponse.json({
      lastCounters,
      lastComponents,
      lastAerodromoDestino,
    });
  } catch (error) {
    console.error('Error fetching last flight:', error);
    return NextResponse.json(
      { error: 'Error al obtener último vuelo' },
      { status: 500 }
    );
  }
}
