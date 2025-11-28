import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function generateUniqueCodigo(baseName: string, existingCodes: Set<string>): Promise<string> {
  // Generate codigo from name: first letters of first and last name
  const parts = baseName.trim().split(/\s+/);
  let codigo = '';
  
  if (parts.length === 1) {
    // Single name: take first 2-3 letters
    codigo = parts[0].substring(0, 2).toUpperCase();
  } else {
    // Multiple parts: first letter of first name + first letter of last name
    codigo = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  
  // Make it unique by adding numbers if needed
  let finalCodigo = codigo;
  let counter = 1;
  while (existingCodes.has(finalCodigo)) {
    finalCodigo = `${codigo}${counter}`;
    counter++;
  }
  
  existingCodes.add(finalCodigo);
  return finalCodigo;
}

async function syncPilots() {
  try {
    console.log('🔄 Starting pilot synchronization...\n');
    
    const csvPath = path.join(process.cwd(), 'Base de dato pilotos', 'Base de dato pilotos.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    // Skip header
    const dataLines = lines.slice(1);
    
    console.log(`📋 Found ${dataLines.length} pilots in CSV\n`);
    
    // Parse CSV and detect duplicates
    const pilotMap = new Map<string, { codigo: string; nombre: string; line: number }>();
    const existingCodes = new Set<string>();
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const parts = line.split(';');
      if (parts.length < 2) continue;
      
      let codigo = parts[0].trim();
      const nombre = parts[1].trim();
      
      if (!nombre) continue;
      
      // If no codigo, generate one
      if (!codigo) {
        codigo = await generateUniqueCodigo(nombre, existingCodes);
        console.log(`🔧 Generated codigo for "${nombre}": ${codigo}`);
      } else {
        existingCodes.add(codigo);
      }
      
      // Check for duplicates by name (case insensitive)
      const normalizedName = nombre.toLowerCase().trim();
      
      if (pilotMap.has(normalizedName)) {
        const existing = pilotMap.get(normalizedName)!;
        console.log(`⚠️  Duplicate found: "${nombre}" (line ${existing.line + 2} and ${i + 2})`);
        console.log(`   Keeping most recent (line ${i + 2}): ${codigo}`);
      }
      
      // Always keep the latest entry (last occurrence in CSV)
      pilotMap.set(normalizedName, { codigo, nombre, line: i });
    }
    
    console.log(`\n✅ Unique pilots after deduplication: ${pilotMap.size}\n`);
    
    // Get valid pilot names and codes from CSV
    const validPilots = Array.from(pilotMap.values());
    const validCodigos = new Set(validPilots.map(p => p.codigo));
    const validNames = new Set(validPilots.map(p => p.nombre.toLowerCase().trim()));
    
    // Get all pilots from database
    const allDbPilots = await prisma.user.findMany({
      where: { rol: 'PILOTO' },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`💾 Database has ${allDbPilots.length} pilots\n`);
    
    // Process duplicates in database (same codigo or name)
    const processedCodigos = new Set<string>();
    const processedNames = new Set<string>();
    const pilotsToDelete: number[] = [];
    
    for (const dbPilot of allDbPilots) {
      const normalizedName = (dbPilot.nombre || '').toLowerCase().trim();
      const codigo = dbPilot.codigo;
      
      // Check if this pilot is in the CSV
      if (!validNames.has(normalizedName)) {
        // Not in CSV - mark for deletion
        pilotsToDelete.push(dbPilot.id);
        console.log(`🗑️  Will delete (not in CSV): ${dbPilot.codigo || 'NO-CODE'} - ${dbPilot.nombre}`);
        continue;
      }
      
      // Check for duplicates in database
      const isDuplicateCodigo = codigo && processedCodigos.has(codigo);
      const isDuplicateName = processedNames.has(normalizedName);
      
      if (isDuplicateCodigo || isDuplicateName) {
        // This is an older duplicate - delete it
        pilotsToDelete.push(dbPilot.id);
        console.log(`🗑️  Will delete (duplicate): ${dbPilot.codigo || 'NO-CODE'} - ${dbPilot.nombre} (ID: ${dbPilot.id})`);
        continue;
      }
      
      // This is the most recent entry - keep it
      if (codigo) processedCodigos.add(codigo);
      processedNames.add(normalizedName);
      
      // Update if needed
      const csvPilot = validPilots.find(p => p.nombre.toLowerCase().trim() === normalizedName);
      if (csvPilot && csvPilot.codigo !== codigo) {
        await prisma.user.update({
          where: { id: dbPilot.id },
          data: { codigo: csvPilot.codigo }
        });
        console.log(`✏️  Updated codigo: ${dbPilot.nombre} (${codigo || 'NO-CODE'} -> ${csvPilot.codigo})`);
      }
    }
    
    // Delete pilots not in CSV or duplicates (only if they have no flights)
    if (pilotsToDelete.length > 0) {
      console.log(`\n🗑️  Processing ${pilotsToDelete.length} pilots for deletion...`);
      
      let deleted = 0;
      let skippedWithFlights = 0;
      
      for (const pilotId of pilotsToDelete) {
        // Check if pilot has any flights
        const flightCount = await prisma.flight.count({
          where: { pilotoId: pilotId }
        });
        
        if (flightCount > 0) {
          // Can't delete - has flights. Mark with special codigo or just skip
          const pilot = await prisma.user.findUnique({ where: { id: pilotId } });
          console.log(`⚠️  Cannot delete ${pilot?.codigo || 'NO-CODE'} - ${pilot?.nombre} (has ${flightCount} flights)`);
          skippedWithFlights++;
        } else {
          // Safe to delete
          await prisma.user.delete({ where: { id: pilotId } });
          deleted++;
        }
      }
      
      console.log(`✅ Deleted ${deleted} pilots`);
      if (skippedWithFlights > 0) {
        console.log(`⚠️  Skipped ${skippedWithFlights} pilots with existing flights`);
      }
    }
    
    // Create or update pilots from CSV
    let created = 0;
    let updated = 0;
    
    for (const csvPilot of validPilots) {
      const normalizedName = csvPilot.nombre.toLowerCase().trim();
      
      const existing = await prisma.user.findFirst({
        where: {
          nombre: {
            equals: csvPilot.nombre,
            mode: 'insensitive'
          },
          rol: 'PILOTO'
        }
      });
      
      if (existing) {
        // Update if codigo changed
        if (existing.codigo !== csvPilot.codigo) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { codigo: csvPilot.codigo }
          });
          updated++;
          console.log(`✏️  Updated: ${csvPilot.codigo} - ${csvPilot.nombre}`);
        }
      } else {
        // Create new pilot
        await prisma.user.create({
          data: {
            codigo: csvPilot.codigo,
            nombre: csvPilot.nombre,
            email: `${csvPilot.codigo.toLowerCase()}@aeroclub.com`,
            rol: 'PILOTO',
            saldo_cuenta: 0,
            tarifa_hora: 170000,
            password: randomUUID(),
          }
        });
        created++;
        console.log(`✅ Created: ${csvPilot.codigo} - ${csvPilot.nombre}`);
      }
    }
    
    // Rewrite CSV with deduplicated and complete data
    const csvLines = ['Codigo;Piloto'];
    for (const pilot of validPilots.sort((a, b) => a.codigo.localeCompare(b.codigo))) {
      csvLines.push(`${pilot.codigo};${pilot.nombre}`);
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
    console.log(`\n📝 Updated CSV with ${validPilots.length} unique pilots`);
    
    console.log(`\n✨ Synchronization complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Attempted to delete: ${pilotsToDelete.length}`);
    console.log(`   Total in system: ${validPilots.length}`);
    console.log(`\n💡 Note: Pilots with existing flights cannot be deleted and remain in database.`);
    console.log(`   Use the Pilots tab to view only pilots with valid codes.`);
    
  } catch (error) {
    console.error('❌ Error syncing pilots:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncPilots();
