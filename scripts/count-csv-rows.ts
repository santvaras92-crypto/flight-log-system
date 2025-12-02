import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV not found at: ${csvPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, 'utf-8');

// Detect delimiter
const firstLine = raw.split(/\r?\n/, 1)[0] || '';
const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

const records = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  delimiter,
  relax_quotes: true,
  trim: true,
});

console.log(`\n📄 CSV: ${csvPath}`);
console.log(`Delimiter: "${delimiter}"`);
console.log(`Total rows (excluding header): ${records.length}\n`);
