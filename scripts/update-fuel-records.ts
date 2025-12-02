import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buscar usuario "Cer"
  const userCer = await prisma.user.findFirst({
    where: { codigo: 'Cer' },
    select: { id: true, codigo: true, nombre: true },
  });

  if (!userCer) {
    console.log('❌ Usuario con código "Cer" no encontrado');
    return;
  }

  console.log(`✅ Usuario encontrado: ${userCer.nombre} (${userCer.codigo})`);

  // Fecha específica
  const fecha = new Date('2021-11-07T00:00:00.000Z');
  const fechaFin = new Date('2021-11-08T00:00:00.000Z');

  // Buscar registros del 07-11-21 con los litros específicos
  const registros = await prisma.fuelLog.findMany({
    where: {
      fecha: { gte: fecha, lt: fechaFin },
      OR: [
        { litros: 78.9 },
        { litros: 89 },
      ],
    },
    include: { User: { select: { codigo: true, nombre: true } } },
  });

  console.log(`\n📋 Registros encontrados: ${registros.length}`);

  for (const r of registros) {
    const litros = Number(r.litros);
    const monto = Number(r.monto);
    
    console.log(`\n🔍 Registro ID ${r.id}:`);
    console.log(`   Fecha: ${r.fecha.toISOString().slice(0, 10)}`);
    console.log(`   Usuario actual: ${r.User?.codigo} - ${r.User?.nombre}`);
    console.log(`   Litros: ${litros}`);
    console.log(`   Monto: $${monto.toLocaleString()}`);

    // Actualizar solo si no es ya del usuario Cer
    if (r.userId !== userCer.id) {
      await prisma.fuelLog.update({
        where: { id: r.id },
        data: { userId: userCer.id },
      });
      console.log(`   ✅ Actualizado a: Cer - ${userCer.nombre}`);
    } else {
      console.log(`   ℹ️  Ya pertenece a Cer`);
    }
  }

  console.log('\n✅ Proceso completado');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
  })
  .finally(() => prisma.$disconnect());
