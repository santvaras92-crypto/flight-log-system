import { prisma } from '../lib/prisma';

async function showAbbreviated() {
  const pilots = await prisma.user.findMany({
    select: { id: true, nombre: true, codigo: true },
    orderBy: { codigo: 'asc' }
  });
  
  const abbreviated = pilots.filter(p => p.nombre?.match(/^[A-Z]\.?\s+/));
  
  console.log('Pilotos con nombres abreviados en la BD:\n');
  abbreviated.forEach(p => {
    console.log(`${p.codigo?.padEnd(10)} | ${p.nombre}`);
  });
  
  console.log(`\nTotal: ${abbreviated.length} pilotos con iniciales`);
  
  await prisma.$disconnect();
}

showAbbreviated();
