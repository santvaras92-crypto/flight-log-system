const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPilots() {
  const pilots = await prisma.user.findMany({
    where: { rol: 'PILOTO' },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      email: true,
      password: true,
    },
    orderBy: { nombre: 'asc' }
  });
  
  console.log('=== PILOTOS EN LA BASE DE DATOS ===\n');
  
  const withPassword = pilots.filter(p => p.password && p.password.length > 0);
  const withoutPassword = pilots.filter(p => !p.password || p.password.length === 0);
  const withRealEmail = pilots.filter(p => p.email && !p.email.endsWith('@piloto.local'));
  
  console.log('Total pilotos:', pilots.length);
  console.log('Con contraseña:', withPassword.length);
  console.log('Sin contraseña:', withoutPassword.length);
  console.log('Con email real (no @piloto.local):', withRealEmail.length);
  console.log('');
  
  console.log('--- PILOTOS CON CONTRASEÑA ---');
  withPassword.forEach(p => {
    console.log(`  [${p.codigo || 'N/A'}] ${p.nombre} - ${p.email || 'sin email'}`);
  });
  
  console.log('');
  console.log('--- PILOTOS SIN CONTRASEÑA (no pueden acceder) ---');
  withoutPassword.slice(0, 30).forEach(p => {
    console.log(`  [${p.codigo || 'N/A'}] ${p.nombre} - ${p.email || 'sin email'}`);
  });
  if (withoutPassword.length > 30) {
    console.log(`  ... y ${withoutPassword.length - 30} más`);
  }
  
  await prisma.$disconnect();
}

checkPilots();
