import { prisma } from '../lib/prisma';

async function main() {
  const flightId = 1494;
  
  // Actualizar SOLO el campo copiloto
  const updated = await prisma.flight.update({
    where: { id: flightId },
    data: {
      copiloto: 'Santiago Varas'
    },
    select: {
      id: true,
      fecha: true,
      cliente: true,
      copiloto: true,
      instructor: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      tach_inicio: true,
      tach_fin: true,
    }
  });

  console.log('\n✅ Vuelo actualizado:');
  console.log(`ID: ${updated.id}`);
  console.log(`Fecha: ${updated.fecha.toISOString().split('T')[0]}`);
  console.log(`Cliente: ${updated.cliente}`);
  console.log(`Copiloto: ${updated.copiloto}`);
  console.log(`Hobbs: ${updated.hobbs_inicio} → ${updated.hobbs_fin}`);
  console.log(`Tach: ${updated.tach_inicio} → ${updated.tach_fin}`);
  console.log('');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
