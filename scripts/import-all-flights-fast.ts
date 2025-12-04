/**
 * Script optimizado para importar TODOS los vuelos desde Base de dato AQI.csv
 * - Usa batch inserts para máxima velocidad
 * - No salta ninguna fila
 * - Mapea pilotos por código directamente
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Parsear número con formato chileno (coma decimal)
function parseNum(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const cleaned = val.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Parsear fecha formato DD-MM-YY
function parseDate(val: string): Date | null {
  if (!val || val.trim() === "") return null;
  const parts = val.trim().split("-");
  if (parts.length !== 3) return null;
  
  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  
  // Ajustar año de 2 dígitos
  if (year < 100) {
    year = year > 50 ? 1900 + year : 2000 + year;
  }
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

// Parsear línea CSV con separador ;
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  console.log("🚀 Importación rápida de vuelos\n");
  
  // 1. Cargar mapa de pilotos (código -> id)
  console.log("📋 Cargando pilotos...");
  const pilots = await prisma.user.findMany({
    where: { rol: "PILOTO" },
    select: { id: true, codigo: true, nombre: true }
  });
  
  const pilotByCode = new Map<string, number>();
  const pilotByName = new Map<string, number>();
  
  for (const p of pilots) {
    if (p.codigo) {
      pilotByCode.set(p.codigo.toUpperCase(), p.id);
    }
    if (p.nombre) {
      // Mapear por apellido para fallback
      const parts = p.nombre.toLowerCase().split(" ");
      for (const part of parts) {
        if (part.length > 2) {
          pilotByName.set(part, p.id);
        }
      }
    }
  }
  console.log(`   ✓ ${pilots.length} pilotos cargados\n`);
  
  // 2. Verificar aeronave CC-AQI existe
  let aircraft = await prisma.aircraft.findUnique({ where: { matricula: "CC-AQI" } });
  if (!aircraft) {
    aircraft = await prisma.aircraft.create({
      data: {
        matricula: "CC-AQI",
        modelo: "Cessna 172 Skyhawk",
        hobbs_actual: 0,
        tach_actual: 0
      }
    });
    console.log("   ✓ Aeronave CC-AQI creada\n");
  }
  
  // 3. Leer CSV
  const csvPath = path.join(process.cwd(), "Base de dato AQI.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  
  console.log(`📂 Procesando ${lines.length - 1} vuelos...\n`);
  
  // 4. Parsear todos los vuelos
  const flights: any[] = [];
  const errors: string[] = [];
  
  // Columnas: Fecha;Tac. 1;Tac. 2;Dif. Taco;Hobbs I;Hobbs F;Dif. Hobbs;Piloto;Copiloto-instructor;Pilot ID;Airplane Rate;Instructor Rate;Total;AIRFRAME;ENGINE;PROPELLER;Detalle;Año;Mes
  //           0     1      2      3         4       5       6          7      8                   9        10            11              12    13       14     15       16      17   18
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cols = parseCSVLine(line);
    
    const fecha = parseDate(cols[0]);
    const tachInicio = parseNum(cols[1]);
    const tachFin = parseNum(cols[2]);
    const hobbsInicio = parseNum(cols[4]);
    const hobbsFin = parseNum(cols[5]);
    const pilotoRaw = (cols[7] || "").trim();
    const copiloto = (cols[8] || "").trim() || null;
    const pilotCode = (cols[9] || "").trim().toUpperCase();
    const tarifaStr = cols[10] || "";
    const instructorRateStr = cols[11] || "";
    const totalStr = cols[12] || "";
    const airframeStr = cols[13] || "";
    const engineStr = cols[14] || "";
    const propellerStr = cols[15] || "";
    const detalle = (cols[16] || "").trim() || null;
    const diffTach = parseNum(cols[3]);
    const diffHobbs = parseNum(cols[6]);
    
    // Validar fecha
    if (!fecha) {
      errors.push(`Fila ${i + 1}: Fecha inválida "${cols[0]}"`);
      continue;
    }
    
    // Buscar piloto por código
    let pilotoId: number | null = null;
    if (pilotCode && pilotByCode.has(pilotCode)) {
      pilotoId = pilotByCode.get(pilotCode)!;
    } else if (pilotoRaw) {
      // Fallback: buscar por apellido
      const apellido = pilotoRaw.toLowerCase().split(" ").pop() || "";
      if (pilotByName.has(apellido)) {
        pilotoId = pilotByName.get(apellido)!;
      }
    }
    
    // Parsear tarifa (eliminar $ y puntos de miles)
    const tarifa = parseNum(tarifaStr.replace(/\$/g, ""));
    const instructorRate = parseNum(instructorRateStr.replace(/\$/g, ""));
    const total = parseNum(totalStr.replace(/\$/g, ""));
    const airframe = parseNum(airframeStr);
    const engine = parseNum(engineStr);
    const propeller = parseNum(propellerStr);
    
    flights.push({
      fecha,
      tach_inicio: tachInicio,
      tach_fin: tachFin,
      hobbs_inicio: hobbsInicio,
      hobbs_fin: hobbsFin,
      diff_tach: diffTach,
      diff_hobbs: diffHobbs,
      piloto_raw: pilotoRaw || null,
      copiloto,
      cliente: pilotCode || null,
      pilotoId,
      tarifa,
      instructor_rate: instructorRate,
      instructor: copiloto,
      costo: total,
      airframe_hours: airframe,
      engine_hours: engine,
      propeller_hours: propeller,
      detalle,
      aircraftId: "CC-AQI",
      aprobado: true,
    });
  }
  
  console.log(`   ✓ ${flights.length} vuelos parseados`);
  if (errors.length > 0) {
    console.log(`   ⚠ ${errors.length} errores (mostrando primeros 5):`);
    errors.slice(0, 5).forEach(e => console.log(`     - ${e}`));
  }
  
  // 5. Limpiar vuelos existentes e insertar nuevos
  console.log("\n🗑️  Limpiando vuelos anteriores...");
  await prisma.flight.deleteMany({});
  
  console.log("💾 Insertando vuelos en lotes...");
  
  const BATCH_SIZE = 100;
  let inserted = 0;
  
  for (let i = 0; i < flights.length; i += BATCH_SIZE) {
    const batch = flights.slice(i, i + BATCH_SIZE);
    await prisma.flight.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    process.stdout.write(`\r   Progreso: ${inserted}/${flights.length}`);
  }
  
  console.log("\n");
  
  // 6. Actualizar contadores de aeronave con el último vuelo
  const lastFlight = flights[0]; // El primero es el más reciente
  if (lastFlight) {
    await prisma.aircraft.update({
      where: { matricula: "CC-AQI" },
      data: {
        hobbs_actual: lastFlight.hobbs_fin || 0,
        tach_actual: lastFlight.tach_fin || 0,
      }
    });
  }
  
  // 7. Resumen final
  const totalFlights = await prisma.flight.count();
  const withPilot = await prisma.flight.count({ where: { pilotoId: { not: null } } });
  
  console.log("✨ Importación completada!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   📊 Total vuelos: ${totalFlights}`);
  console.log(`   👤 Con piloto vinculado: ${withPilot}`);
  console.log(`   ❓ Sin piloto: ${totalFlights - withPilot}`);
  console.log(`   ✈️  Hobbs actual: ${lastFlight?.hobbs_fin || 0}`);
  console.log(`   🔧 Tach actual: ${lastFlight?.tach_fin || 0}`);
}

main()
  .catch(e => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
