import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking historical maintenance data...\n');

  const flightsWithMaintenance = await prisma.flight.findMany({
    where: {
      OR: [
        { airframe_hours: { not: null } },
        { engine_hours: { not: null } },
        { propeller_hours: { not: null } },
      ]
    },
    orderBy: { fecha: 'desc' },
    take: 10,
    select: {
      fecha: true,
      airframe_hours: true,
      engine_hours: true,
      propeller_hours: true,
    }
  });

  console.log(`Found ${flightsWithMaintenance.length} flights with maintenance data:\n`);
  
  flightsWithMaintenance.forEach(f => {
    console.log(`${new Date(f.fecha).toISOString().slice(0,10)} | AF: ${f.airframe_hours} | EN: ${f.engine_hours} | PR: ${f.propeller_hours}`);
  });

  const total = await prisma.flight.count({
    where: {
      OR: [
        { airframe_hours: { not: null } },
        { engine_hours: { not: null } },
        { propeller_hours: { not: null } },
      ]
    }
  });

  console.log(`\n📊 Total flights with maintenance data: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
