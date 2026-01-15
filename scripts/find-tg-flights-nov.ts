import { prisma } from '../lib/prisma';

async function main() {
  // Find all TG flights in November 2025
  const flights = await prisma.flight.findMany({
    where: {
      cliente: 'TG',
      fecha: {
        gte: new Date('2025-11-01'),
        lte: new Date('2025-11-30'),
      },
    },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      diff_hobbs: true,
      tach_inicio: true,
      tach_fin: true,
      diff_tach: true,
      cliente: true,
      copiloto: true,
      instructor: true,
      costo: true,
    }
  });

  if (flights.length === 0) {
    console.log('❌ No se encontraron vuelos de TG en noviembre 2025');
    return;
  }

  console.log(`\n📋 Vuelos de TG en noviembre 2025 (${flights.length} total):\n`);
  
  flights.forEach(f => {
    console.log(`ID: ${f.id}`);
    console.log(`Fecha: ${f.fecha.toISOString().split('T')[0]}`);
    console.log(`Hobbs: ${f.hobbs_inicio} → ${f.hobbs_fin} (Δ ${f.diff_hobbs})`);
    console.log(`Tach: ${f.tach_inicio} → ${f.tach_fin} (Δ ${f.diff_tach})`);
    console.log(`Copiloto: ${f.copiloto || '(ninguno)'}`);
    console.log(`Instructor: ${f.instructor || '(ninguno)'}`);
    console.log(`Costo: $${f.costo}`);
    console.log('---');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
