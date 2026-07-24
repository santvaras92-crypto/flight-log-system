import { prisma } from '@/lib/prisma';
import ValidacionClient from './validacion-client';
import { getUFValueForDate, calculateUFRate } from '@/lib/uf-service';

export const dynamic = 'force-dynamic';

export default async function ValidacionPage() {
  // Fetch all pending items in parallel
  const [pendingFuel, pendingDeposits, pendingFlights] = await Promise.all([
    // Pending Fuel
    prisma.fuelLog.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fecha: true,
        litros: true,
        monto: true,
        detalle: true,
        imageUrl: true,
        createdAt: true,
        User: { select: { nombre: true, codigo: true } },
      },
    }),
    // Pending Deposits
    prisma.deposit.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fecha: true,
        monto: true,
        detalle: true,
        imageUrl: true,
        createdAt: true,
        User: { select: { nombre: true, codigo: true } },
      },
    }),
    // Pending Flights
    prisma.flightSubmission.findMany({
      where: { 
        estado: { in: ['PENDIENTE', 'ESPERANDO_APROBACION', 'REVISION'] }
      },
      include: {
        ImageLog: true,
        User: true,
        Aircraft: true,
        Flight: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Process flight submissions with last counter values
  const flightsDto = await Promise.all(pendingFlights.map(async (s) => {
    // If submission already has a Flight, use its data directly
    let lastHobbs: string;
    let lastTach: string;

    if (s.Flight) {
      // Use the Flight's inicio values (already calculated correctly)
      lastHobbs = s.Flight.hobbs_inicio?.toString() || '0';
      lastTach = s.Flight.tach_inicio?.toString() || '0';
    } else {
      // If no Flight yet, get the last flight by hobbs_fin DESC
      const lastFlight = await prisma.flight.findFirst({
        where: { aircraftId: s.Aircraft.matricula, hobbs_fin: { not: null } },
        orderBy: { hobbs_fin: 'desc' },
        select: { hobbs_fin: true, tach_fin: true },
      });

      lastHobbs = (lastFlight?.hobbs_fin ?? s.Aircraft.hobbs_actual).toString();
      lastTach = (lastFlight?.tach_fin ?? s.Aircraft.tach_actual).toString();
    }

    // UF of the FLIGHT date (not the approval date), so the rate is the one
    // that was valid the day the flight actually happened.
    const flightDate = s.Flight?.fecha ?? s.fechaVuelo ?? new Date();
    const uf = await getUFValueForDate(flightDate);
    const defaultRate = calculateUFRate(4.5, uf.valor);
    const defaultInstructorRate = calculateUFRate(1.3, uf.valor);

    return {
      id: s.id,
      estado: s.estado,
      errorMessage: s.errorMessage,
      fechaVuelo: s.fechaVuelo?.toISOString() || null,
      hobbsFinal: s.hobbsFinal?.toString() || null,
      tachFinal: s.tachFinal?.toString() || null,
      // Real Δ Hobbs from the Flight record. In stuck-hobbs mode the meter
      // doesn't advance, so hobbsFinal - lastHobbs would wrongly show 0.0.
      diffHobbs: s.Flight?.diff_hobbs?.toString() || null,
      cliente: s.cliente,
      copiloto: s.copiloto,
      detalle: s.detalle,
      instructorRate: s.instructorRate?.toString() || null,
      createdAt: s.createdAt.toISOString(),
      lastHobbs,
      lastTach,
      imageLogs: s.ImageLog.map((img) => ({
        id: img.id,
        tipo: img.tipo,
        imageUrl: img.imageUrl,
        valorExtraido: img.valorExtraido?.toString() || null,
        confianza: img.confianza?.toString() || null,
        validadoManual: img.validadoManual,
      })),
      piloto: {
        id: s.User.id,
        nombre: s.User.nombre,
        codigo: s.User.codigo,
        tarifa_hora: s.User.tarifa_hora?.toString() || '0',
      },
      aircraft: {
        matricula: s.Aircraft.matricula,
        modelo: s.Aircraft.modelo,
      },
      flight: s.Flight ? {
        id: s.Flight.id,
        diff_hobbs: s.Flight.diff_hobbs?.toString() || null,
        diff_tach: s.Flight.diff_tach?.toString() || null,
        costo: s.Flight.costo?.toString() || null,
      } : null,
      ufValor: uf.valor,
      defaultRate,
      defaultInstructorRate,
    };
  }));

  // Serialize data for client
  const fuelData = pendingFuel.map(log => ({
    id: log.id,
    fecha: log.fecha.toISOString(),
    litros: Number(log.litros),
    monto: Number(log.monto),
    detalle: log.detalle,
    imageUrl: log.imageUrl,
    createdAt: log.createdAt.toISOString(),
    pilotName: log.User?.nombre || 'Desconocido',
    pilotCode: log.User?.codigo || 'N/A',
  }));

  const depositData = pendingDeposits.map(dep => ({
    id: dep.id,
    fecha: dep.fecha.toISOString(),
    monto: Number(dep.monto),
    detalle: dep.detalle,
    imageUrl: dep.imageUrl,
    createdAt: dep.createdAt.toISOString(),
    pilotName: dep.User?.nombre || 'Desconocido',
    pilotCode: dep.User?.codigo || 'N/A',
  }));

  const totalPending = fuelData.length + depositData.length + flightsDto.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-foreground">Centro de Validación</h1>
          <p className="text-slate-500 dark:text-muted-foreground mt-1">
            {totalPending > 0 
              ? `${totalPending} registro${totalPending !== 1 ? 's' : ''} pendiente${totalPending !== 1 ? 's' : ''} de aprobación`
              : 'No hay registros pendientes'}
          </p>
        </div>
        <a 
          href="/admin/dashboard" 
          className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
        >
          ← Volver al Dashboard
        </a>
      </div>

      <ValidacionClient 
        fuelData={fuelData}
        depositData={depositData}
        flightsData={flightsDto}
      />
    </div>
  );
}
