import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const sep9_2020 = new Date('2020-09-09');
  
  // CSV fuel
  let csvFuel = 0;
  let csvLatestDate: Date | null = null;
  const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
  const content = fs.readFileSync(fuelPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    const dateStr = (parts[0] || '').trim();
    if (!dateStr) continue;
    
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) continue;
    
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    let year = parseInt(dateParts[2]);
    if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
    
    const fuelDate = new Date(year, month - 1, day);
    
    if (fuelDate >= sep9_2020) {
      const litrosStr = (parts[2] || '').trim().replace(',', '.');
      const litros = parseFloat(litrosStr);
      if (!isNaN(litros) && litros > 0) {
        csvFuel += litros;
        if (!csvLatestDate || fuelDate > csvLatestDate) {
          csvLatestDate = fuelDate;
        }
      }
    }
  }
  
  // New DB fuel after CSV
  const cutoffDate = csvLatestDate || new Date('2024-01-01');
  const dbNewFuel = await prisma.fuelLog.aggregate({
    where: { fecha: { gt: cutoffDate } },
    _sum: { litros: true }
  });
  
  const newDbFuel = Number(dbNewFuel._sum.litros || 0);
  const totalFuel = csvFuel + newDbFuel;
  
  // Hours since Sep 9, 2020
  const hours = await prisma.flight.aggregate({
    where: { fecha: { gte: sep9_2020 } },
    _sum: { diff_hobbs: true }
  });
  
  const totalHours = Number(hours._sum.diff_hobbs || 0);
  const effectiveHours = totalHours * 0.9;
  const fuelRateLph = effectiveHours > 0 ? totalFuel / effectiveHours : 0;
  const fuelRateGph = fuelRateLph / 3.78541;
  
  console.log('CSV Fuel (hasta', csvLatestDate?.toISOString().split('T')[0], '):', csvFuel.toFixed(2), 'L');
  console.log('New DB Fuel (después de CSV):', newDbFuel.toFixed(2), 'L');
  console.log('\n📊 FUEL CONSUMED:');
  console.log('  Total:', totalFuel.toFixed(2), 'L');
  console.log('  Total:', (totalFuel / 3.78541).toFixed(2), 'GAL');
  console.log('\n⛽ FUEL RATE:');
  console.log('  Rate:', fuelRateLph.toFixed(2), 'L/H');
  console.log('  Rate:', fuelRateGph.toFixed(2), 'GAL/H');
  console.log('  (Excludes 10% idle time)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
