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
});

function parseCL(input: any): number {
  if (input == null) return 0;
  const s = String(input).trim();
  if (!s) return 0;
  const normalized = s.replace(/\$/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseDMY(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.replace(/\//g, '-').trim();
  const [d, m, y] = s.split('-');
  if (!d || !m || !y) return null;
  const yyyy = y.length === 2 ? (Number(y) >= 70 ? `19${y}` : `20${y}`) : y;
  const dt = new Date(`${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  return isNaN(dt.getTime()) ? null : dt;
}

const START_LITERS = new Date('2020-08-27');

let totalMontoAll = 0;
let totalMontoSince2020 = 0;
let totalLitersSince2020 = 0;
let rowsAll = 0;
let rowsSince2020 = 0;
let rowsWithLiters = 0;

for (const r of records) {
  rowsAll++;
  
  const monto = parseCL(r['Monto'] || r['monto'] || r['MONTO']);
  totalMontoAll += monto;
  
  const fechaStr = r['Fecha'] || r['fecha'] || r['FECHA'];
  const dt = parseDMY(fechaStr || '');
  
  if (dt && dt >= START_LITERS) {
    rowsSince2020++;
    totalMontoSince2020 += monto;
    
    const liters = parseCL(r['Litros cargados'] || r['Litros'] || r['litros']);
    if (liters > 0) {
      totalLitersSince2020 += liters;
      rowsWithLiters++;
    }
  }
}

function toCL(n: number, decimals = 0) {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

console.log('\n💰 FUEL AMOUNTS:');
console.log(`Total rows in CSV: ${rowsAll}`);
console.log(`Total $ (all rows desde 2018): $${toCL(totalMontoAll)}`);
console.log(`\nSince 27-08-2020:`);
console.log(`  Rows: ${rowsSince2020}`);
console.log(`  Total $: $${toCL(totalMontoSince2020)}`);
console.log(`  Rows with liters: ${rowsWithLiters}`);
console.log(`  Total liters: ${toCL(totalLitersSince2020, 3).replace('.', ',')} L\n`);
