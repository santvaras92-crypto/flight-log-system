import fs from 'fs';
import path from 'path';

// Parse Chilean number format (1.234,56 -> 1234.56)
function parseCL(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
const content = fs.readFileSync(fuelPath, 'utf-8');
const lines = content.split('\n').filter(l => l.trim());

console.log(`⛽ Calculating fuel consumed since Sep 9, 2020...\n`);

const cutoffDate = new Date('2020-09-09');
let totalLitersSince = 0;
let countSince = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  const dateStr = (parts[0] || '').trim();
  
  if (!dateStr) continue;
  
  // Parse date (DD-MM-YY format)
  const dateParts = dateStr.split('-');
  if (dateParts.length !== 3) continue;
  
  const day = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);
  let year = parseInt(dateParts[2]);
  
  // Convert 2-digit year to 4-digit
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }
  
  const fuelDate = new Date(year, month - 1, day);
  
  if (fuelDate >= cutoffDate) {
    const litrosStr = (parts[2] || '').trim();
    const litros = parseCL(litrosStr);
    if (litros > 0) {
      totalLitersSince += litros;
      countSince++;
    }
  }
}

console.log(`Fuel records since Sep 9, 2020: ${countSince}`);
console.log(`Total liters since Sep 9, 2020: ${totalLitersSince.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`);
console.log(`Total gallons since Sep 9, 2020: ${(totalLitersSince / 3.78541).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GAL`);
