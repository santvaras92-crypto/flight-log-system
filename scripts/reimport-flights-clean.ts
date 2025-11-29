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
  if (!val || val.trim() === '' || val.includes('#REF')) return null;
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
  
  console.log(`📊 Total líneas: ${lines.length - 1} vuelos\n`);

  // Parsear todas las filas
  const flights: any[] = [];
  let skipped = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    
    const fecha = parseDate(row[0]?.trim());
    if (!fecha) {
      skipped++;
      continue;
    }

    flights.push({
      fecha,
      tach_inicio: toNum(row[2]),
      tach_fin: toNum(row[3]),
      diff_tach: toNum(row[4]),
      hobbs_inicio: toNum(row[5]),
      hobbs_fin: toNum(row[6]),
      diff_hobbs: toNum(row[7]),
      piloto_raw: row[8]?.trim() || null,
      copiloto: row[9]?.trim() || null,
      cliente: row[10]?.trim() || null,
      tarifa: toNum(row[11]),
      instructor: row[12]?.trim() || null,
      costo: toNum(row[13]),
      detalle: row[17]?.trim() || null,
      aircraftId: "CC-AQI",
      pilotoId: null,
    });
  }

  console.log(`✅ ${flights.length} vuelos parseados (${skipped} omitidos sin fecha)`);

  // Borrar todos los vuelos existentes
  console.log("\n🗑️  Borrando vuelos existentes...");
  const deleted = await prisma.flight.deleteMany({});
  console.log(`   Eliminados: ${deleted.count}`);

  // Insertar todos de una vez
  console.log("\n📥 Insertando vuelos desde CSV...");
  const created = await prisma.flight.createMany({
    data: flights,
    skipDuplicates: true,
  });
  console.log(`   Creados: ${created.count}`);

  // Verificar
  const total = await prisma.flight.count();
  console.log(`\n🎉 ¡Importación completada!`);
  console.log(`   Total en BD: ${total} vuelos`);
  
  // Mostrar distribución por año
  const byYear = await prisma.$queryRaw<{year: string, count: bigint}[]>`
    SELECT EXTRACT(YEAR FROM fecha)::text as year, COUNT(*)::bigint as count 
    FROM "Flight" 
    GROUP BY year 
    ORDER BY year
  `;
  console.log("\n📊 Vuelos por año:");
  byYear.forEach(r => console.log(`   ${r.year}: ${r.count}`));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
