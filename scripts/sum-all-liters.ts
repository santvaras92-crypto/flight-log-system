import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
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

let totalLiters = 0;
let rowsWithLiters = 0;

const literKeys = ['Litros cargados', 'Litros', 'litros', 'LITROS'];

for (const r of records) {
  let liters = 0;
  for (const key of literKeys) {
    if (r[key]) {
      liters = parseCL(r[key]);
      break;
    }
  }
  
  if (liters > 0) {
    totalLiters += liters;
    rowsWithLiters++;
  }
}

function toCL(n: number, decimals = 3) {
  return n.toFixed(decimals).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

console.log(`\n⛽ TOTAL LITERS IN CSV:`);
console.log(`Total rows: 668`);
console.log(`Rows with liters > 0: ${rowsWithLiters}`);
console.log(`Total liters: ${toCL(totalLiters, 3)} L\n`);
