import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";

export default async function Home() {
  // Solo pilotos registrados (con cuenta en el sistema)
  const allPilots = await prisma.user.findMany({
    where: { 
      rol: "PILOTO",
    },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true, codigo: true },
  });

  // Filtrar pilotos con email (registrados)
  const pilots = allPilots.filter((p) => p.email !== null);

  // Obtener los máximos Hobbs y Tach de los vuelos registrados para CC-AQI
  const maxHobbsFlight = await prisma.flight.findFirst({
    where: { aircraftId: "CC-AQI", hobbs_fin: { not: null } },
    orderBy: { hobbs_fin: "desc" },
    select: { hobbs_fin: true },
  });

  const maxTachFlight = await prisma.flight.findFirst({
    where: { aircraftId: "CC-AQI", tach_fin: { not: null } },
    orderBy: { tach_fin: "desc" },
    select: { tach_fin: true },
  });

  const lastCounters = {
    hobbs: maxHobbsFlight?.hobbs_fin ? Number(maxHobbsFlight.hobbs_fin) : null,
    tach: maxTachFlight?.tach_fin ? Number(maxTachFlight.tach_fin) : null,
  };

  return <FlightUploadForm pilots={pilots} lastCounters={lastCounters} />;
}
