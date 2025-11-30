import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

export default async function Home() {
  // Leer pilotos del Pilot Directory (CSV oficial) - mostrar TODOS con nombre completo
  let pilotDirectoryPilots: { id: number; nombre: string; email: string }[] = [];
  
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      
      // Crear mapa de código -> nombre completo del CSV
      const csvPilots: { code: string; name: string }[] = [];
      lines.slice(1).forEach(l => {
        const [code, name] = l.split(";");
        if (code && name) {
          csvPilots.push({ code: code.trim(), name: name.trim() });
        }
      });
      
      // Buscar usuarios registrados en la DB
      const registeredPilots = await prisma.user.findMany({
        where: { 
          rol: "PILOTO",
          codigo: { not: null }
        },
        select: { id: true, nombre: true, email: true, codigo: true },
      });
      
      // Crear mapa de código -> datos de DB
      const dbPilotMap = new Map<string, { id: number; email: string }>();
      registeredPilots.forEach(p => {
        if (p.codigo) {
          dbPilotMap.set(p.codigo.toUpperCase(), { id: p.id, email: p.email });
        }
      });
      
      // Para cada piloto del CSV, buscar si está registrado en DB
      // Si está registrado, usar su ID real. Si no, usar ID temporal negativo
      let tempId = -1;
      csvPilots.forEach(csvPilot => {
        const dbData = dbPilotMap.get(csvPilot.code.toUpperCase());
        if (dbData) {
          pilotDirectoryPilots.push({
            id: dbData.id,
            nombre: csvPilot.name, // Usar nombre del CSV (completo)
            email: dbData.email
          });
        } else {
          // Piloto en CSV pero no registrado en DB - asignar ID temporal
          pilotDirectoryPilots.push({
            id: tempId--,
            nombre: csvPilot.name,
            email: ''
          });
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
