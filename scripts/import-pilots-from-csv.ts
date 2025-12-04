import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function importPilots() {
  try {
    // Leer del CSV de pilotos directamente
    const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    console.log(`📋 Leyendo ${lines.length - 1} pilotos del CSV...\n`);
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    
    // Saltar header (primera línea)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Formato: Codigo;Nombre Apellido
      const [codigo, nombreCompleto] = line.split(';').map(s => s.trim());
      
      if (!codigo || !nombreCompleto) {
        console.log(`⚠️  Línea ${i + 1} incompleta: ${line}`);
        continue;
      }
      
      const codigoUpper = codigo.toUpperCase();
      const email = `${codigo.toLowerCase()}@piloto.local`;
      
      // Verificar si ya existe por código
      const existing = await prisma.user.findFirst({
        where: { codigo: codigoUpper }
      });
      
      if (existing) {
        // Si existe pero el nombre es diferente, actualizar
        if (existing.nombre !== nombreCompleto) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { nombre: nombreCompleto }
          });
          console.log(`✏️  Actualizado: ${codigoUpper} - ${existing.nombre} → ${nombreCompleto}`);
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      
      // Crear nuevo piloto con el nombre completo del CSV
      await prisma.user.create({
        data: {
          codigo: codigoUpper,
          nombre: nombreCompleto,
          email: email,
          rol: 'PILOTO',
          saldo_cuenta: 0,
          tarifa_hora: 175000,
          password: randomUUID(),
        }
      });
      
      imported++;
      console.log(`✅ Importado: ${codigoUpper} - ${nombreCompleto}`);
    }
    
    console.log(`\n✨ Importación completa!`);
    console.log(`   Importados: ${imported}`);
    console.log(`   Actualizados: ${updated}`);
    console.log(`   Sin cambios: ${skipped}`);
    console.log(`   Total procesados: ${lines.length - 1}`);
    
  } catch (error) {
    console.error('❌ Error importando pilotos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importPilots();
