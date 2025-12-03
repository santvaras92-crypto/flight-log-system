import { prisma } from '../lib/prisma';

const nameMapping: Record<string, string> = {
  'S. Varas': 'Santiago Varas',
  'J. Varas': 'José Varas',
  'P. Silva': 'Pablo Silva',
  'M. Camposano': 'Max Camposano',
  // Agrega más según necesites
};

async function expandAbbreviatedNames() {
  console.log('Expandiendo nombres abreviados...\n');
  
  for (const [abbreviated, fullName] of Object.entries(nameMapping)) {
    const pilots = await prisma.user.findMany({
      where: { nombre: abbreviated },
      select: { id: true, nombre: true, codigo: true, email: true }
    });
    
    for (const pilot of pilots) {
      console.log(`Actualizando: ${pilot.nombre} (${pilot.codigo}) → ${fullName}`);
      
      await prisma.user.update({
        where: { id: pilot.id },
        data: { nombre: fullName }
      });
    }
  }
  
  console.log('\n✅ Nombres expandidos correctamente');
  await prisma.$disconnect();
}

expandAbbreviatedNames().catch(console.error);
