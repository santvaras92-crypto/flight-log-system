import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. CSV total
  const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const delimiter = (raw.split(/\r?\n/, 1)[0].match(/;/g) || []).length >= (raw.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    relax_quotes: true,
    trim: true,
  }) as any[];

  function parseCL(input: any): number {
    if (input == null) return 0;
    const s = String(input).trim();
    if (!s) return 0;
    const normalized = s.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  let csvTotal = 0;
  for (const r of records) {
    const hobbs = parseCL(r['Dif. Hobbs']);
    if (hobbs > 0) csvTotal += hobbs;
  }

  // 2. Database total
  const flights = await prisma.flight.findMany({
    select: { diff_hobbs: true }
  });
  
  let dbTotal = 0;
  for (const f of flights) {
    if (f.diff_hobbs) {
      dbTotal += Number(f.diff_hobbs);
    }
  }

  // 3. Combined
  const combined = csvTotal + dbTotal;

  function toCL(n: number, decimals = 1) {
    return n.toFixed(decimals).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  console.log(`\n✈️ TOTAL FLIGHT HOURS:`);
  console.log(`CSV (Base de dato AQI.csv): ${toCL(csvTotal, 1)} hrs (${records.length} flights)`);
  console.log(`Database (Prisma): ${toCL(dbTotal, 1)} hrs (${flights.length} flights)`);
  console.log(`= TOTAL COMBINED: ${toCL(combined, 1)} hrs\n`);

  await prisma.$disconnect();
}

main();
