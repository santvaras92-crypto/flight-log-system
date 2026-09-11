import { prisma } from '../lib/prisma';
(async () => {
  const aircraft = await prisma.aircraft.findMany();
  for (const a of aircraft) console.log('AIRCRAFT:', JSON.stringify(a));
  const engine = await prisma.component.findFirst({ where: { tipo: 'ENGINE' } });
  console.log('ENGINE component:', JSON.stringify(engine));
  const lastFlight = await prisma.flight.findFirst({
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    select: { fecha: true, tach_fin: true, hobbs_fin: true },
  });
  console.log('Last flight:', JSON.stringify(lastFlight));
  await prisma.$disconnect();
})();
