import { prisma } from '../lib/prisma';

async function findSantiago() {
  const pilots = await prisma.user.findMany({
    where: {
      OR: [
        { nombre: { contains: 'Santiago', mode: 'insensitive' } },
        { nombre: { contains: 'Varas', mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      email: true,
      documento: true
    },
    take: 10
  });
  
  console.log('Pilotos encontrados:', JSON.stringify(pilots, null, 2));
  
  // Buscar específicamente por documento
  const byDoc = await prisma.user.findFirst({
    where: { documento: '18166515-7' }
  });
  console.log('\nPor documento 18166515-7:', byDoc ? byDoc.nombre : 'No encontrado');
  
  await prisma.$disconnect();
}

findSantiago();
