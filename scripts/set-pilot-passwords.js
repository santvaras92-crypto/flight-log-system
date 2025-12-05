const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const GENERIC_PASSWORD = 'aeroclub2024';

async function setGenericPasswords() {
  console.log('=== ASIGNANDO CONTRASEÑA GENÉRICA A PILOTOS ===\n');
  console.log(`Contraseña genérica: ${GENERIC_PASSWORD}\n`);
  
  // Hash the generic password
  const hashedPassword = await bcrypt.hash(GENERIC_PASSWORD, 10);
  console.log('Password hasheado correctamente con bcrypt.\n');
  
  // Get all pilots
  const pilots = await prisma.user.findMany({
    where: { rol: 'PILOTO' },
    select: { id: true, nombre: true, codigo: true, email: true, password: true }
  });
  
  console.log(`Total pilotos encontrados: ${pilots.length}\n`);
  
  // Check which ones have invalid passwords (not bcrypt hashes)
  const needsUpdate = pilots.filter(p => !p.password || !p.password.startsWith('$2'));
  
  console.log(`Pilotos con contraseña inválida (no bcrypt): ${needsUpdate.length}`);
  console.log(`Pilotos con contraseña válida (bcrypt): ${pilots.length - needsUpdate.length}\n`);
  
  if (needsUpdate.length === 0) {
    console.log('✓ Todos los pilotos ya tienen contraseñas bcrypt válidas.');
    console.log('  Si quieres resetear todas las contraseñas, usa --force');
    await prisma.$disconnect();
    return;
  }
  
  // Update pilots with invalid passwords
  console.log('Actualizando pilotos con contraseñas inválidas...\n');
  
  let updated = 0;
  for (const pilot of needsUpdate) {
    await prisma.user.update({
      where: { id: pilot.id },
      data: { password: hashedPassword }
    });
    console.log(`  ✓ [${pilot.codigo || 'N/A'}] ${pilot.nombre}`);
    updated++;
  }
  
  console.log(`\n=== RESUMEN ===`);
  console.log(`Pilotos actualizados: ${updated}`);
  console.log(`Contraseña asignada: ${GENERIC_PASSWORD}`);
  console.log(`\nLos pilotos pueden ahora hacer login con su email y la contraseña "${GENERIC_PASSWORD}"`);
  
  await prisma.$disconnect();
}

// Check for --force flag to reset ALL passwords
const forceReset = process.argv.includes('--force');

async function forceResetAllPasswords() {
  console.log('=== RESETEANDO TODAS LAS CONTRASEÑAS (--force) ===\n');
  console.log(`Contraseña genérica: ${GENERIC_PASSWORD}\n`);
  
  const hashedPassword = await bcrypt.hash(GENERIC_PASSWORD, 10);
  
  const result = await prisma.user.updateMany({
    where: { rol: 'PILOTO' },
    data: { password: hashedPassword }
  });
  
  console.log(`✓ ${result.count} pilotos actualizados con contraseña "${GENERIC_PASSWORD}"`);
  
  await prisma.$disconnect();
}

if (forceReset) {
  forceResetAllPasswords();
} else {
  setGenericPasswords();
}
