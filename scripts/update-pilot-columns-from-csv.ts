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
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(p => parseInt(p, 10));
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  return new Date(fullYear, month - 1, day);
}

function toNum(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const cleaned = val.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function run() {
  const csvPath = path.join(process.cwd(), "Base de dato AQI.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.error("❌ No se encontró Base de dato AQI.csv");
    return;
  }

  console.log("📂 Leyendo CSV...");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  
  console.log(`📊 Total líneas en CSV: ${lines.length}`);
  
  // Header (primera línea)
  const header = parseCSVLine(lines[0]);
  console.log("Columnas:", header);
  
  // Índices de columnas
  const COL_FECHA = 0;
  const COL_HOBBS_I = 5;
  const COL_HOBBS_F = 6;
  const COL_PILOTO = 8;
  const COL_COPILOTO = 9;
  const COL_CLIENTE = 10;
  const COL_TARIFA = 11;
  const COL_INSTRUCTOR = 12;
  const COL_DETALLE = 17;

  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  console.log("\n🔄 Actualizando vuelos...\n");

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    
    const fechaStr = row[COL_FECHA]?.trim();
    const hobbsI = toNum(row[COL_HOBBS_I]);
    const hobbsF = toNum(row[COL_HOBBS_F]);
    const piloto = row[COL_PILOTO]?.trim() || null; // raw pilot name from CSV
    const copiloto = row[COL_COPILOTO]?.trim() || null;
    const cliente = row[COL_CLIENTE]?.trim() || null;
    const tarifa = toNum(row[COL_TARIFA]);
    const instructor = row[COL_INSTRUCTOR]?.trim() || null;
    const detalle = row[COL_DETALLE]?.trim() || null;

    if (!fechaStr || hobbsI === null || hobbsF === null) {
      skipped++;
      continue;
    }

    const fecha = parseDate(fechaStr);
    if (!fecha) {
      skipped++;
      continue;
    }

    // Buscar vuelo por fecha + hobbs_inicio + hobbs_fin
    const flights = await prisma.flight.findMany({
      where: {
        fecha: {
          gte: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
          lt: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
        },
        hobbs_inicio: hobbsI,
        hobbs_fin: hobbsF
      }
    });

    if (flights.length === 0) {
      if (notFound < 10) {
        console.log(`⚠️  No encontrado: ${fechaStr} | Hobbs ${hobbsI}→${hobbsF} | Piloto: ${piloto}`);
      }
      notFound++;
      continue;
    }

    if (flights.length > 1) {
      console.log(`⚠️  Múltiples vuelos encontrados para ${fechaStr} Hobbs ${hobbsI}→${hobbsF}, actualizando el primero`);
    }

    const flight = flights[0];

    // Actualizar solo si hay cambios
    const needsUpdate = 
      flight.copiloto !== copiloto ||
      flight.cliente !== cliente ||
      flight.instructor !== instructor ||
      flight.detalle !== detalle ||
      flight.piloto_raw !== piloto ||
      flight.tarifa?.toString() !== tarifa?.toString();

    if (needsUpdate) {
      await prisma.flight.update({
        where: { id: flight.id },
        data: {
          copiloto: copiloto || null,
          cliente: cliente || null,
          instructor: instructor || null,
          detalle: detalle || null,
          piloto_raw: piloto || null,
          tarifa: tarifa || null
        }
      });

      if (updated < 10) {
        console.log(`✅ Actualizado: ${fechaStr} | Piloto: ${piloto} | Copiloto: ${copiloto || '-'} | Instructor: ${instructor || '-'}`);
      }
      updated++;
    } else {
      skipped++;
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   ✅ Actualizados: ${updated}`);
  console.log(`   ⚠️  No encontrados: ${notFound}`);
  console.log(`   ⏭️  Sin cambios: ${skipped}`);
  console.log(`   📝 Total procesados: ${lines.length - 1}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
