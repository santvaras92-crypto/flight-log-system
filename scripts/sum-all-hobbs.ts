import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

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

let totalHobbs = 0;
let rowsWithHobbs = 0;
let totalRows = 0;

// Possible column names for DIFF HOBBS
const hobbsKeys = ['Dif. Hobbs', 'Diff. Hobbs', 'Diff Hobbs', 'DIFF HOBBS', 'diff hobbs', 'Diff hobbs', 'Hobbs Diff'];

for (const r of records) {
  totalRows++;
  let hobbs = 0;
  
  for (const key of hobbsKeys) {
    if (r[key]) {
      hobbs = parseCL(r[key]);
      break;
    }
  }
  
  if (hobbs > 0) {
    totalHobbs += hobbs;
    rowsWithHobbs++;
  }
}

function toCL(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

console.log(`\n✈️ TOTAL DIFF HOBBS IN CSV:`);
console.log(`CSV file: ${csvPath}`);
console.log(`Total rows: ${totalRows}`);
console.log(`Rows with Diff Hobbs > 0: ${rowsWithHobbs}`);
console.log(`Total Hobbs hours: ${toCL(totalHobbs, 1)} hrs\n`);
