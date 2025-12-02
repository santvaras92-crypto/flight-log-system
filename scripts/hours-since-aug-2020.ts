import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Parse Chilean number format (1.234,56 -> 1234.56)
function parseCL(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const records = parse(content, { 
  columns: true, 
  skip_empty_lines: true,
  bom: true,
  delimiter: ';'
}) as any[];

console.log(`📅 Calculating hours since 09-09-2020...\n`);

const cutoffDate = new Date('2020-09-09');
let totalHoursSince = 0;
let countSince = 0;

// Try different column name variations
const dateColumns = ['Fecha', 'fecha', 'Date', 'date'];
const hobbsColumns = ['Dif. Hobbs', 'Diff Hobbs', 'Hobbs Diff', 'Dif Hobbs'];

records.forEach((row) => {
  // Find date column
  let dateStr = '';
  for (const col of dateColumns) {
    if (row[col]) {
      dateStr = row[col];
      break;
    }
  }
  
  if (!dateStr) return;
  
  // Parse date (DD-MM-YY format)
  const parts = dateStr.split('-');
  if (parts.length !== 3) return;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  
  // Convert 2-digit year to 4-digit
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }
  
  const flightDate = new Date(year, month - 1, day);
  
  if (flightDate >= cutoffDate) {
    // Find hobbs column
    let hobbsStr = '';
    for (const col of hobbsColumns) {
      if (row[col]) {
        hobbsStr = row[col];
        break;
      }
    }
    
    const hobbs = parseCL(hobbsStr);
    if (hobbs > 0) {
      totalHoursSince += hobbs;
      countSince++;
    }
  }
});

console.log(`Flights since 09-09-2020: ${countSince}`);
console.log(`Total hours since 09-09-2020: ${totalHoursSince.toFixed(1)} hrs`);

// Calculate fuel consumption rate
const totalLiters = 28724.184; // From sum-all-liters.ts
const litersPerHour = totalLiters / totalHoursSince;
const gallonsPerHour = litersPerHour / 3.78541; // 1 gallon AVGAS = 3.78541 liters

console.log(`\n⛽ FUEL CONSUMPTION RATE:`);
console.log(`${litersPerHour.toFixed(2)} L/H`);
console.log(`${gallonsPerHour.toFixed(2)} GAL/H`);
