import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

export default async function Home() {
  // Leer pilotos del Pilot Directory (CSV oficial)
  let pilotDirectoryPilots: { id: number; nombre: string; email: string }[] = [];
  
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      const csvCodes = lines.slice(1).map(l => {
        const [code] = l.split(";");
        return (code || '').trim().toUpperCase();
      }).filter(c => c);
      
      // Buscar usuarios registrados que tengan código en el CSV
      const registeredPilots = await prisma.user.findMany({
        where: { 
          rol: "PILOTO",
          codigo: { not: null }
        },
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true, email: true, codigo: true },
      });
      
      // Filtrar solo pilotos cuyo código está en el Pilot Directory
      pilotDirectoryPilots = registeredPilots.filter(p => 
        p.codigo && csvCodes.includes(p.codigo.toUpperCase())
      );
    }
  } catch (e) {
    console.error("Error leyendo Pilot Directory:", e);
  }

  // Obtener los últimos Hobbs y Tach del vuelo más reciente para CC-AQI
  const lastFlight = await prisma.flight.findFirst({
    where: { aircraftId: "CC-AQI" },
    orderBy: { fecha: "desc" },
    select: { hobbs_fin: true, tach_fin: true },
  });

  const lastCounters = {
    hobbs: lastFlight?.hobbs_fin ? Number(lastFlight.hobbs_fin) : null,
    tach: lastFlight?.tach_fin ? Number(lastFlight.tach_fin) : null,
  };

  return <FlightUploadForm pilots={pilotDirectoryPilots} lastCounters={lastCounters} />;
}
