import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

export default async function Home() {
  // Cargar pilotos del Pilot Directory (misma lógica que el Dashboard)
  // El Pilot Directory incluye:
  // 1. Pilotos del CSV que están registrados en DB
  // 2. Pilotos registrados en DB que NO están en CSV (nuevos registros con email real)
  
  let pilotDirectoryPilots: { id: number; nombre: string; email: string }[] = [];
  
  try {
    // Leer CSV para obtener códigos permitidos y nombres
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    const allowedPilotCodes: string[] = [];
    const csvPilotNames = new Map<string, string>();
    
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      lines.slice(1).forEach(l => {
        const [code, name] = l.split(";");
        if (code && name) {
          const upperCode = code.trim().toUpperCase();
          allowedPilotCodes.push(upperCode);
          csvPilotNames.set(upperCode, name.trim());
        }
      });
    }
    
    // Buscar todos los pilotos registrados en la DB
    const allPilots = await prisma.user.findMany({
      where: { 
        rol: "PILOTO",
        codigo: { not: null }
      },
      select: { id: true, nombre: true, email: true, codigo: true },
    });
    
    // Construir lista del Pilot Directory:
    allPilots.forEach(p => {
      if (!p.codigo) return;
      
      const upperCode = p.codigo.toUpperCase();
      const isInCSV = allowedPilotCodes.includes(upperCode);
      const hasRealEmail = p.email && !p.email.endsWith("@piloto.local");
      
      // Incluir si:
      // - Está en el CSV (initial del Pilot Directory)
      // - O NO está en CSV pero tiene email real (registered del Pilot Directory)
      if (isInCSV || (!isInCSV && hasRealEmail)) {
        pilotDirectoryPilots.push({
          id: p.id,
          nombre: csvPilotNames.get(upperCode) || p.nombre, // Preferir nombre del CSV
          email: p.email
        });
      }
    });
    
    // Ordenar por nombre
    pilotDirectoryPilots.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
  } catch (e) {
    console.error("Error cargando Pilot Directory:", e);
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
