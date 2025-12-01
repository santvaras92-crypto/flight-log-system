import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Obtener el último vuelo registrado
  const lastFlight = await prisma.flight.findFirst({
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      tach_inicio: true,
      tach_fin: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      diff_tach: true,
      diff_hobbs: true,
      User: { select: { nombre: true, codigo: true } },
    },
  });

  if (!lastFlight) {
    console.log('No hay vuelos registrados');
    return;
  }

  console.log('\n=== ÚLTIMO VUELO REGISTRADO ===');
  console.log('ID:', lastFlight.id);
  console.log('Fecha:', lastFlight.fecha);
  console.log('Piloto:', lastFlight.User?.nombre, `(${lastFlight.User?.codigo})`);
  console.log('\nHOBBS:');
  console.log('  Inicio:', lastFlight.hobbs_inicio);
  console.log('  Fin:', lastFlight.hobbs_fin);
  console.log('  Delta:', lastFlight.diff_hobbs);
  console.log('\nTACH:');
  console.log('  Inicio:', lastFlight.tach_inicio);
  console.log('  Fin:', lastFlight.tach_fin, '<-- VALOR ACTUAL');
  console.log('  Delta:', lastFlight.diff_tach);

  // Pedir el nuevo valor
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('\n💡 Para corregir el valor, ejecuta:');
    console.log('   npx tsx scripts/fix-last-tach.ts [NUEVO_VALOR_TACH]');
    console.log('\nEjemplo:');
    console.log('   npx tsx scripts/fix-last-tach.ts 570.0');
    return;
  }

  const newTachFin = parseFloat(args[0]);
  if (isNaN(newTachFin)) {
    console.error('❌ Error: El valor debe ser un número');
    return;
  }

  const tachInicio = lastFlight.tach_inicio ? parseFloat(lastFlight.tach_inicio.toString()) : 0;
  const newDiffTach = newTachFin - tachInicio;

  if (newDiffTach <= 0) {
    console.error(`❌ Error: El nuevo valor (${newTachFin}) debe ser mayor al inicio (${tachInicio})`);
    return;
  }

  console.log(`\n🔧 Actualizando TACH Final de ${lastFlight.tach_fin} a ${newTachFin}...`);
  console.log(`   Nuevo Delta TACH: ${newDiffTach.toFixed(1)} hrs`);

  await prisma.flight.update({
    where: { id: lastFlight.id },
    data: {
      tach_fin: newTachFin,
      diff_tach: newDiffTach,
    },
  });

  console.log('✅ Valor actualizado correctamente');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
