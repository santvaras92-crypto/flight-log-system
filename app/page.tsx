import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

export default async function Home() {
  // Leer pilotos del Pilot Directory (CSV oficial) - solo los registrados en DB
  let pilotDirectoryPilots: { id: number; nombre: string; email: string }[] = [];
  
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      
      // Crear mapa de código -> nombre completo del CSV
      const csvPilotNames = new Map<string, string>();
      lines.slice(1).forEach(l => {
        const [code, name] = l.split(";");
        if (code && name) {
          csvPilotNames.set(code.trim().toUpperCase(), name.trim());
        }
      });
      
      // Buscar usuarios registrados en la DB con código en el CSV
      const registeredPilots = await prisma.user.findMany({
        where: { 
          rol: "PILOTO",
          codigo: { not: null }
        },
        select: { id: true, nombre: true, email: true, codigo: true },
      });
      
      // Solo incluir pilotos que están en el CSV Y registrados en DB
      registeredPilots.forEach(p => {
        if (p.codigo) {
          const csvName = csvPilotNames.get(p.codigo.toUpperCase());
          if (csvName) {
            // Piloto está en CSV y en DB - usar nombre del CSV (completo)
            pilotDirectoryPilots.push({
              id: p.id,
              nombre: csvName,
              email: p.email
            });
          }
        }
      });
      
      // Ordenar por nombre
      pilotDirectoryPilots.sort((a, b) => a.nombre.localeCompare(b.nombre));
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
