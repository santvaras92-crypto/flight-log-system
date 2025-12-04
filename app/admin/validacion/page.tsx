import { prisma } from '@/lib/prisma';
import ValidacionClient from './validacion-client';

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
    const lastFlight = await prisma.flight.findFirst({
      where: {
        aircraftId: s.Aircraft.matricula,
        ...(s.fechaVuelo ? { fecha: { lte: s.fechaVuelo } } : {}),
      },
      orderBy: { fecha: 'desc' },
      select: { hobbs_fin: true, tach_fin: true },
    });

    const lastHobbs = (lastFlight?.hobbs_fin ?? s.Aircraft.hobbs_actual).toString();
    const lastTach = (lastFlight?.tach_fin ?? s.Aircraft.tach_actual).toString();

    return {
      id: s.id,
      estado: s.estado,
      errorMessage: s.errorMessage,
      fechaVuelo: s.fechaVuelo?.toISOString() || null,
      hobbsFinal: s.hobbsFinal?.toString() || null,
      tachFinal: s.tachFinal?.toString() || null,
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
          <h1 className="text-3xl font-bold text-slate-800">Centro de Validación</h1>
          <p className="text-slate-500 mt-1">
            {totalPending > 0 
              ? `${totalPending} registro${totalPending !== 1 ? 's' : ''} pendiente${totalPending !== 1 ? 's' : ''} de aprobación`
              : 'No hay registros pendientes'}
          </p>
        </div>
        <a 
          href="/admin/dashboard" 
          className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
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
