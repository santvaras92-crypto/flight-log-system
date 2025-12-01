import FlightUploadForm from "./components/FlightUploadForm";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import { prisma } from "../lib/prisma";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function Home() {
  // Cargar pilotos directamente del Excel Pilot Directory (sin DB)
  let pilotDirectoryPilots: { id: string; nombre: string; email: string }[] = [];
  
  try {
    // Leer Excel Pilot Directory
    const pilotDirExcel = await prisma.sheetState.findUnique({
      where: { key: 'pilot_directory' }
    });

    if (pilotDirExcel?.matrix && Array.isArray(pilotDirExcel.matrix) && pilotDirExcel.matrix.length > 1) {
      const pilotRows = (pilotDirExcel.matrix as any[][]).slice(1); // Omitir header (fila 0)
      
      // Estructura del Excel: ["Código","Nombre","Email","Teléfono","Estado","Observaciones"]
      // Columna A (índice 0): Código
      // Columna B (índice 1): Nombre
      // Columna C (índice 2): Email
      
      let index = 0;
      for (const row of pilotRows) {
        const codigo = row[0] ? String(row[0]).trim() : null;
        const nombre = row[1] ? String(row[1]).trim() : null;
        const email = row[2] ? String(row[2]).trim() : null;
        
        if (!nombre) continue; // Solo requerimos el nombre
        
        // Usar el código como ID, o un índice si no hay código
        const id = codigo || `pilot_${index}`;
        
        pilotDirectoryPilots.push({
          id: id,
          nombre: nombre,
          email: email || `${id}@piloto.local`
        });
        
        index++;
      }
    }
    
    // Ordenar por nombre
    pilotDirectoryPilots.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    console.log('👥 Pilotos cargados del Excel:', pilotDirectoryPilots.length);
    console.log('📋 Primeros 3 pilotos:', pilotDirectoryPilots.slice(0, 3));
    
  } catch (e) {
    console.error("Error cargando Pilot Directory:", e);
  }

  // Obtener los últimos Hobbs, Tach y componentes del Excel (flight_entries)
  const excelState = await prisma.sheetState.findUnique({
    where: { key: 'flight_entries' }
  });

  console.log('📊 Excel State:', {
    exists: !!excelState,
    hasMatrix: !!excelState?.matrix,
    isArray: Array.isArray(excelState?.matrix),
    length: excelState?.matrix ? (excelState.matrix as any[]).length : 0
  });

  let lastHobbs = null;
  let lastTach = null;
  let lastAirframe = null;
  let lastEngine = null;
  let lastPropeller = null;

  if (excelState?.matrix && Array.isArray(excelState.matrix) && excelState.matrix.length > 1) {
    const lastFlight = (excelState.matrix as any[])[1]; // Fila 1: Primera fila de datos (fila 0 es el header)
    console.log('🛫 Last Flight Row:', lastFlight);
    
    // Función para parsear números con coma decimal
    const parseExcelNumber = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const str = String(val).replace(',', '.').trim();
      const num = parseFloat(str);
      return isNaN(num) ? null : num;
    };
    
    // Columnas: ["Fecha","TACH I","TACH F","Δ TACH","HOBBS I","HOBBS F","Δ HOBBS",
    //           "Piloto","Copiloto/Instructor","Cliente","Rate","Instructor/SP Rate",
    //           "Total","AIRFRAME","ENGINE","PROPELLER","Detalle"]
    lastHobbs = parseExcelNumber(lastFlight[5]); // HOBBS F (columna 5)
    lastTach = parseExcelNumber(lastFlight[2]); // TACH F (columna 2)
    lastAirframe = parseExcelNumber(lastFlight[13]); // AIRFRAME (columna 13)
    lastEngine = parseExcelNumber(lastFlight[14]); // ENGINE (columna 14)
    lastPropeller = parseExcelNumber(lastFlight[15]); // PROPELLER (columna 15)
    
    console.log('📍 Parsed Counters:', { lastHobbs, lastTach, lastAirframe, lastEngine, lastPropeller });
  }

  // Si el Excel está vacío, usar valores iniciales del Aircraft
  if (lastHobbs === null || lastTach === null) {
    const aircraft = await prisma.aircraft.findUnique({
      where: { matricula: "CC-AQI" }
    });
    lastHobbs = aircraft?.hobbs_actual ? Number(aircraft.hobbs_actual) : null;
    lastTach = aircraft?.tach_actual ? Number(aircraft.tach_actual) : null;
  }

  // Si los componentes están vacíos en el Excel, usar valores de la tabla Component
  if (lastAirframe === null || lastEngine === null || lastPropeller === null) {
    const components = await prisma.component.findMany({
      where: { aircraftId: "CC-AQI" },
      select: { tipo: true, horas_acumuladas: true },
    });
    const getComp = (tipo: string) => {
      const c = components.find((x) => x.tipo.toUpperCase() === tipo);
      return c?.horas_acumuladas ? Number(c.horas_acumuladas) : null;
    };
    if (lastAirframe === null) lastAirframe = getComp("AIRFRAME");
    if (lastEngine === null) lastEngine = getComp("ENGINE");
    if (lastPropeller === null) lastPropeller = getComp("PROPELLER");
  }

  const lastCounters = {
    hobbs: lastHobbs,
    tach: lastTach,
  };

  const lastComponents = {
    airframe: lastAirframe,
    engine: lastEngine,
    propeller: lastPropeller,
  };

  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Registrar Vuelo"
        subtitle="Flight Operations • Upload and validate Hobbs/Tach"
        actions={
          <a
            href="/pilot/select"
            className="btn-executive btn-executive-secondary"
          >
            Mi Cuenta
          </a>
        }
      />
      {/** Tabs removed under header per request */}

      <div className="px-6 py-8">
        <FlightUploadForm pilots={pilotDirectoryPilots} lastCounters={lastCounters} lastComponents={lastComponents} />
      </div>
    </div>
  );
}
