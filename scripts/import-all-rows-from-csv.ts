import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(p => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  return new Date(fullYear, month - 1, day);
}

function toNum(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const cleaned = val.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function run() {
  const csvPath = path.join(process.cwd(), "Base de dato AQI.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.error("❌ No se encontró Base de dato AQI.csv");
    return;
  }

  console.log("📂 Leyendo CSV completo...");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  
  console.log(`📊 Total líneas en CSV: ${lines.length}`);
  console.log("⚠️  MODO: Importar TODO tal cual (sin filtros)\n");
  
  // Header
  const header = parseCSVLine(lines[0]);
  console.log("Columnas detectadas:", header.slice(0, 13));
  
  // Índices de columnas
  const COL_FECHA = 0;
  const COL_TACH_I = 2;
  const COL_TACH_F = 3;
  const COL_DIFF_TACH = 4;
  const COL_HOBBS_I = 5;
  const COL_HOBBS_F = 6;
  const COL_DIFF_HOBBS = 7;
  const COL_PILOTO = 8;
  const COL_COPILOTO = 9;
  const COL_CLIENTE = 10;
  const COL_TARIFA = 11;
  const COL_INSTRUCTOR = 12;
  const COL_TOTAL = 13;
  const COL_AIRFRAME = 14;
  const COL_ENGINE = 15;
  const COL_PROPELLER = 16;
  const COL_DETALLE = 17;

  const MATRICULA = "CC-AQI";
  
  // Verificar aeronave existe
  const aircraft = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
  if (!aircraft) {
    console.error(`❌ Aeronave ${MATRICULA} no encontrada en BD`);
    return;
  }

  console.log(`✅ Aeronave ${MATRICULA} encontrada\n`);
  console.log("🔄 Iniciando importación...\n");

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    
    // Extraer valores RAW (sin validación)
    const fechaStr = row[COL_FECHA]?.trim();
    const fecha = parseDate(fechaStr);
    
    const tach_inicio = toNum(row[COL_TACH_I]);
    const tach_fin = toNum(row[COL_TACH_F]);
    const diff_tach = toNum(row[COL_DIFF_TACH]);
    
    const hobbs_inicio = toNum(row[COL_HOBBS_I]);
    const hobbs_fin = toNum(row[COL_HOBBS_F]);
    const diff_hobbs = toNum(row[COL_DIFF_HOBBS]);
    
    const piloto = row[COL_PILOTO]?.trim() || null;
    const copiloto = row[COL_COPILOTO]?.trim() || null;
    const cliente = row[COL_CLIENTE]?.trim() || null;
    const instructor = row[COL_INSTRUCTOR]?.trim() || null;
    const detalle = row[COL_DETALLE]?.trim() || null;
    
    const costo = toNum(row[COL_TOTAL]);
    const airframe_hours = toNum(row[COL_AIRFRAME]);
    const engine_hours = toNum(row[COL_ENGINE]);
    const propeller_hours = toNum(row[COL_PROPELLER]);

    // Progreso cada 50 filas
    if (i % 50 === 0) {
      console.log(`📝 Procesando fila ${i}/${lines.length - 1} | Importados: ${imported} | Actualizados: ${updated} | Errores: ${errors}`);
    }

    // Si no hay fecha, saltar esta fila específica (filas completamente vacías)
    if (!fecha) {
      if (fechaStr) {
        console.log(`⚠️  Fila ${i}: Fecha inválida "${fechaStr}", saltando...`);
      }
      continue;
    }

    // Buscar si ya existe (por fecha + hobbs)
    let existingFlight = null;
    if (hobbs_inicio !== null && hobbs_fin !== null) {
      const flights = await prisma.flight.findMany({
        where: {
          fecha: {
            gte: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
            lt: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
          },
          hobbs_inicio,
          hobbs_fin
        }
      });
      
      if (flights.length > 0) {
        existingFlight = flights[0];
      }
    }

    try {
      if (existingFlight) {
        // Actualizar vuelo existente
        await prisma.flight.update({
          where: { id: existingFlight.id },
          data: {
            tach_inicio,
            tach_fin,
            diff_tach,
            diff_hobbs,
            costo,
            copiloto,
            cliente,
            instructor,
            detalle,
            airframe_hours,
            engine_hours,
            propeller_hours
          }
        });
        
        if (updated < 10) {
          console.log(`✏️  Actualizado: ${fechaStr} | Hobbs ${hobbs_inicio}→${hobbs_fin} | Piloto: ${piloto || 'N/A'}`);
        }
        updated++;
      } else {
        // Crear nuevo vuelo (sin pilotoId si no hay piloto)
        await prisma.flight.create({
          data: {
            fecha,
            tach_inicio,
            tach_fin,
            diff_tach,
            hobbs_inicio,
            hobbs_fin,
            diff_hobbs,
            costo,
            aircraftId: MATRICULA,
            pilotoId: null, // No intentamos matchear piloto
            copiloto,
            cliente,
            instructor,
            detalle,
            airframe_hours,
            engine_hours,
            propeller_hours
          }
        });

        if (imported < 10) {
          console.log(`➕ Creado: ${fechaStr} | Hobbs ${hobbs_inicio || '-'}→${hobbs_fin || '-'} | Piloto: ${piloto || 'N/A'} | Copiloto: ${copiloto || '-'}`);
        }
        imported++;
      }
    } catch (e: any) {
      console.error(`❌ Error fila ${i} (${fechaStr}):`, e.message);
      errors++;
      if (errors > 20) {
        console.error("⛔ Demasiados errores, abortando...");
        break;
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMEN FINAL:");
  console.log("=".repeat(60));
  console.log(`   ➕ Nuevos vuelos creados:  ${imported}`);
  console.log(`   ✏️  Vuelos actualizados:    ${updated}`);
  console.log(`   ❌ Errores:                 ${errors}`);
  console.log(`   📝 Total filas procesadas: ${lines.length - 1}`);
  console.log(`   ✅ Total importado:        ${imported + updated}`);
  console.log("=".repeat(60));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
