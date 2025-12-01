import { prisma } from "@/lib/prisma";
import AdminSubmissions from "./submissions-client";
import DownloadDashboardButton from "./download-button";

export const revalidate = 0;

export default async function AdminSubmissionsPage() {
  const submissions = await prisma.flightSubmission.findMany({
    include: {
      ImageLog: true,
      User: true,
      Aircraft: true,
      Flight: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Armar DTO con últimos contadores por fecha para calcular tiempo de vuelo
  const submissionsDto = await Promise.all(submissions.map(async (s) => {
    const lastFlight = await prisma.flight.findFirst({
      where: {
        aircraftId: s.Aircraft.matricula,
        ...(s.fechaVuelo ? { fecha: { lte: s.fechaVuelo } } : {}),
      },
      orderBy: { fecha: "desc" },
      select: { hobbs_fin: true, tach_fin: true },
    });

    // Si no hay vuelo previo, usar los actuales del avión como base
    const lastHobbs = (lastFlight?.hobbs_fin ?? s.Aircraft.hobbs_actual).toString();
    const lastTach = (lastFlight?.tach_fin ?? s.Aircraft.tach_actual).toString();

    // Serializar fechas y evitar tipos no serializables para el cliente
    return ({
    id: s.id,
    estado: s.estado,
    errorMessage: s.errorMessage,
    fechaVuelo: s.fechaVuelo?.toISOString() || null,
    hobbsInicial: s.hobbsInicial?.toString() || null,
    hobbsFinal: s.hobbsFinal?.toString() || null,
    deltaHobbs: s.deltaHobbs?.toString() || null,
    tachInicial: s.tachInicial?.toString() || null,
    tachFinal: s.tachFinal?.toString() || null,
    deltaTach: s.deltaTach?.toString() || null,
    cliente: s.cliente,
    copiloto: s.copiloto,
    detalle: s.detalle,
    instructorRate: s.instructorRate?.toString() || null,
    createdAt: s.createdAt.toISOString(),
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
      tarifa_hora: s.User.tarifa_hora?.toString() || "0",
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
    });
  }));

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Aprobación de Vuelos</h1>
          <p className="text-gray-600 mt-2">Revisa los reportes de vuelo, agrega el Rate Instructor/SP y aprueba para registrar el vuelo.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/dashboard" className="bg-[#003D82] text-white px-4 py-2 rounded hover:bg-[#0A2F5F] transition">Ver Dashboard</a>
          <DownloadDashboardButton />
        </div>
      </div>
      <AdminSubmissions initialData={submissionsDto} />
    </div>
  );
}
