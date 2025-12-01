import { prisma } from '@/lib/prisma';
import CountersClient from './counters-client';

export const dynamic = 'force-dynamic';

export default async function CountersPage() {
  // Obtener el último vuelo registrado
  const lastFlight = await prisma.flight.findFirst({
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      tach_inicio: true,
      tach_fin: true,
      diff_hobbs: true,
      diff_tach: true,
      airframe_hours: true,
      engine_hours: true,
      propeller_hours: true,
      User: {
        select: {
          nombre: true,
          codigo: true,
        },
      },
    },
  });

  // Obtener el avión
  const aircraft = await prisma.aircraft.findUnique({
    where: { matricula: 'CC-AQI' },
    select: {
      matricula: true,
      hobbs_actual: true,
      tach_actual: true,
    },
  });

  return (
    <div className="min-h-screen p-4 sm:p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Corregir Contadores
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Modifica los valores de HOBBS y TACH del último vuelo registrado
          </p>
        </div>

        <CountersClient 
          lastFlight={lastFlight ? {
            ...lastFlight,
            hobbs_inicio: lastFlight.hobbs_inicio?.toString() || null,
            hobbs_fin: lastFlight.hobbs_fin?.toString() || null,
            tach_inicio: lastFlight.tach_inicio?.toString() || null,
            tach_fin: lastFlight.tach_fin?.toString() || null,
            diff_hobbs: lastFlight.diff_hobbs?.toString() || null,
            diff_tach: lastFlight.diff_tach?.toString() || null,
            airframe_hours: lastFlight.airframe_hours?.toString() || null,
            engine_hours: lastFlight.engine_hours?.toString() || null,
            propeller_hours: lastFlight.propeller_hours?.toString() || null,
          } : null}
          aircraft={aircraft ? {
            ...aircraft,
            hobbs_actual: aircraft.hobbs_actual?.toString() || null,
            tach_actual: aircraft.tach_actual?.toString() || null,
          } : null}
        />
      </div>
    </div>
  );
}
