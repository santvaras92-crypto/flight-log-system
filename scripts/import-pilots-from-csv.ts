import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function importPilots() {
  try {
    const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Skip header
    const dataLines = lines.slice(1);
    
    console.log(`📋 Found ${dataLines.length} pilots to import`);
    
    let imported = 0;
    let skipped = 0;
    
    for (const line of dataLines) {
      const parts = line.split(';');
      if (parts.length < 2) continue;
      
      const codigo = parts[0].trim();
      const nombre = parts[1].trim();
      
      if (!codigo || !nombre) continue;
      
      // Check if pilot already exists
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { codigo: codigo },
            { nombre: nombre }
          ]
        }
      });
      
      if (existing) {
        // Update codigo if missing
        if (!existing.codigo && codigo) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { codigo: codigo }
          });
          console.log(`✏️  Updated codigo for: ${nombre} -> ${codigo}`);
        } else {
          console.log(`⏭️  Skipped (exists): ${codigo} - ${nombre}`);
        }
        skipped++;
        continue;
      }
      
      // Create new pilot
      await prisma.user.create({
        data: {
          codigo: codigo,
          nombre: nombre,
          email: `${codigo.toLowerCase()}@aeroclub.com`,
          rol: 'PILOTO',
          saldo_cuenta: 0,
          tarifa_hora: 170000,
          password: randomUUID(),
        }
      });
      
      imported++;
      console.log(`✅ Imported: ${codigo} - ${nombre}`);
    }
    
    console.log(`\n✨ Import complete!`);
    console.log(`   Imported: ${imported}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${dataLines.length}`);
    
  } catch (error) {
    console.error('❌ Error importing pilots:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importPilots();
