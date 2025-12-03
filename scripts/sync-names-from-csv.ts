import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

async function syncNamesFromCSV() {
  const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(1); // Skip header
  
  const csvPilots: Record<string, string> = {};
  
  for (const line of lines) {
    const [codigo, nombre] = line.split(';').map(s => s.trim());
    if (codigo && nombre) {
      csvPilots[codigo] = nombre;
    }
  }
  
  console.log(`Encontrados ${Object.keys(csvPilots).length} pilotos en CSV\n`);
  
  const dbPilots = await prisma.user.findMany({
    select: { id: true, nombre: true, codigo: true }
  });
  
  let updated = 0;
  
  for (const pilot of dbPilots) {
    const codigo = pilot.codigo?.trim();
    if (!codigo) continue;
    
    const csvName = csvPilots[codigo];
    if (csvName && csvName !== pilot.nombre) {
      console.log(`Actualizando ${codigo}: "${pilot.nombre}" → "${csvName}"`);
      
      await prisma.user.update({
        where: { id: pilot.id },
        data: { nombre: csvName }
      });
      
      updated++;
    }
  }
  
  console.log(`\n✅ ${updated} pilotos actualizados con nombres completos del CSV`);
  await prisma.$disconnect();
}

syncNamesFromCSV();
