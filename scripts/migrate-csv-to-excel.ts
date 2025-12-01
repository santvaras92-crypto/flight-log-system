import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Formato: "DD-MM-YY" (ej: "02-12-17")
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  let year = parseInt(parts[2]);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  // Convertir año de 2 dígitos a 4 dígitos
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }
  
  const date = new Date(year, month, day);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function parseDecimal(str: string): string {
  if (!str) return "";
  const cleaned = str.replace(',', '.').trim();
  if (!cleaned) return "";
  const num = parseFloat(cleaned);
  return isNaN(num) ? "" : num.toFixed(1);
}

function parseNumber(str: string): string {
  if (!str) return "";
  const cleaned = str.replace(/[$,]/g, '').replace(/\./g, '').trim();
  if (!cleaned) return "";
  const num = parseFloat(cleaned);
  return isNaN(num) ? "" : String(num);
}

async function main() {
  console.log('🚀 Migrando CSV a Excel flight_entries...\n');

  const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ No se encontró el archivo:', csvPath);
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  console.log(`Total líneas en CSV: ${lines.length}`);

  // Header del Excel
  const header = [
    "Fecha","TACH I","TACH F","Δ TACH","HOBBS I","HOBBS F","Δ HOBBS",
    "Piloto","Copiloto/Instructor","Cliente","Rate","Instructor/SP Rate",
    "Total","AIRFRAME","ENGINE","PROPELLER","Detalle"
  ];

  const rows: any[][] = [];

  // Procesar cada línea del CSV (saltar header en línea 0)
  let processed = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    
    // Estructura CSV esperada:
    // 0: Fecha, 1: ?, 2: Tach_i, 3: Tach_f, 4: diff_tach,
    // 5: Hobbs_i, 6: Hobbs_f, 7: diff_hobbs,
    // 8: Piloto, 9: Copiloto, 10: Cliente, 11: Tarifa,
    // 12: Instructor, 13: ?, 14: Airframe, 15: Engine, 16: Propeller,
    // 17: Detalle, 18: Year, 19: Month
    
    const fecha = parseDate(fields[0]);
    if (!fecha) {
      skipped++;
      continue;
    }

    const tachI = parseDecimal(fields[2]);
    const tachF = parseDecimal(fields[3]);
    const deltaTach = parseDecimal(fields[4]);
    const hobbsI = parseDecimal(fields[5]);
    const hobbsF = parseDecimal(fields[6]);
    const deltaHobbs = parseDecimal(fields[7]);
    const piloto = (fields[8] || "").trim();
    const copiloto = (fields[9] || "").trim();
    const cliente = (fields[10] || "").trim();
    const rate = parseNumber(fields[11]);
    const instrRate = parseNumber(fields[12]);
    const airframe = parseDecimal(fields[14]);
    const engine = parseDecimal(fields[15]);
    const propeller = parseDecimal(fields[16]);
    const detalle = (fields[17] || "").trim();

    // Calcular total si hay rate y deltaHobbs
    let total = "";
    if (rate && deltaHobbs) {
      const rateNum = parseFloat(rate);
      const deltaNum = parseFloat(deltaHobbs);
      const instrNum = instrRate ? parseFloat(instrRate) : 0;
      if (!isNaN(rateNum) && !isNaN(deltaNum)) {
        total = String(Math.round((rateNum + instrNum) * deltaNum));
      }
    }

    const row = [
      fecha,       // 0: Fecha
      tachI,       // 1: TACH I
      tachF,       // 2: TACH F
      deltaTach,   // 3: Δ TACH
      hobbsI,      // 4: HOBBS I
      hobbsF,      // 5: HOBBS F
      deltaHobbs,  // 6: Δ HOBBS
      piloto,      // 7: Piloto
      copiloto,    // 8: Copiloto/Instructor
      cliente,     // 9: Cliente
      rate,        // 10: Rate
      instrRate,   // 11: Instructor/SP Rate
      total,       // 12: Total
      airframe,    // 13: AIRFRAME
      engine,      // 14: ENGINE
      propeller,   // 15: PROPELLER
      detalle      // 16: Detalle
    ];

    rows.push(row);
    processed++;

    if (processed % 100 === 0) {
      console.log(`  Procesados: ${processed}`);
    }
  }

  // Ordenar por fecha descendente (más recientes primero)
  rows.sort((a, b) => {
    const dateA = a[0] || "";
    const dateB = b[0] || "";
    return dateB.localeCompare(dateA);
  });

  // Crear matriz completa con header
  const matrix = [header, ...rows];

  console.log(`\n✅ Procesados: ${processed} vuelos`);
  console.log(`⚠️  Omitidos: ${skipped} vuelos (sin fecha válida)`);
  console.log(`\n📊 Guardando en SheetState...`);

  // Guardar en SheetState
  await prisma.sheetState.upsert({
    where: { key: 'flight_entries' },
    update: { 
      matrix,
      updatedAt: new Date()
    },
    create: {
      key: 'flight_entries',
      matrix,
      formulas: {},
      namedExpressions: [
        { name: "rate", expression: "175000" },
        { name: "instrRate", expression: "30000" }
      ]
    }
  });

  console.log(`✅ ${processed} vuelos migrados al Excel flight_entries`);
  
  // Verificar
  const state = await prisma.sheetState.findUnique({
    where: { key: 'flight_entries' }
  });
  
  if (state?.matrix && Array.isArray(state.matrix)) {
    console.log(`\n✅ Verificación: Excel tiene ${(state.matrix as any[]).length - 1} filas de datos`);
    
    // Mostrar primeros 3 vuelos
    const data = state.matrix as any[][];
    console.log('\n📋 Primeros 3 vuelos:');
    for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
      const row = data[i];
      console.log(`  ${i}. ${row[0]} | Piloto: ${row[7]} | Hobbs: ${row[5]} | Tach: ${row[2]}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
