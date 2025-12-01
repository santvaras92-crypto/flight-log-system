import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function importPilots() {
  try {
    const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    const pilotCodesSet = new Set<string>();
    const pilotNames: Record<string, string> = {};
    
    // Saltar header, extraer códigos únicos
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      const pilotIdStr = (fields[9] || '').trim().toUpperCase();
      const pilotName = (fields[7] || '').trim();
      
      if (pilotIdStr && pilotIdStr !== '') {
        pilotCodesSet.add(pilotIdStr);
        if (pilotName && !pilotNames[pilotIdStr]) {
          pilotNames[pilotIdStr] = pilotName;
        }
      }
    }
    
    const pilotCodes = Array.from(pilotCodesSet).sort();
    console.log(`📋 Códigos únicos encontrados: ${pilotCodes.length}\n`);
    
    let imported = 0;
    let skipped = 0;
    
    for (const codigo of pilotCodes) {
      const nombre = pilotNames[codigo] || codigo;
      const email = `${codigo.toLowerCase()}@piloto.local`;
      
      // Check if pilot already exists
      const existing = await prisma.user.findFirst({
        where: { codigo: codigo }
      });
      
      if (existing) {
        console.log(`⏭️  Ya existe: ${codigo} - ${existing.nombre}`);
        skipped++;
        continue;
      }
      
      // Create new pilot
      await prisma.user.create({
        data: {
          codigo: codigo,
          nombre: nombre,
          email: email,
          rol: 'PILOTO',
          saldo_cuenta: 0,
          tarifa_hora: 175,
          password: randomUUID(),
        }
      });
      
      imported++;
      console.log(`✅ Importado: ${codigo} - ${nombre}`);
    }
    
    console.log(`\n✨ Importación completa!`);
    console.log(`   Importados: ${imported}`);
    console.log(`   Ya existían: ${skipped}`);
    console.log(`   Total: ${pilotCodes.length}`);
    
  } catch (error) {
    console.error('❌ Error importando pilotos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importPilots();
