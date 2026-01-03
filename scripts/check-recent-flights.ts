import { prisma } from '../lib/prisma';

async function checkRecentFlights() {
  const flights = await prisma.flight.findMany({
    where: { aircraftId: 'CC-AQI' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      submissionId: true,
      fecha: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      tach_inicio: true,
      tach_fin: true,
      diff_hobbs: true,
      diff_tach: true,
      createdAt: true,
    }
  });
  
  console.log('\n=== Últimos 5 vuelos (por createdAt DESC) ===\n');
  flights.forEach(f => {
    console.log(`ID: ${f.id}, Submission: ${f.submissionId}, Fecha: ${f.fecha.toISOString().split('T')[0]}`);
    console.log(`  Hobbs: ${f.hobbs_inicio} → ${f.hobbs_fin} (Δ ${f.diff_hobbs})`);
    console.log(`  Tach: ${f.tach_inicio} → ${f.tach_fin} (Δ ${f.diff_tach})`);
    console.log(`  Created: ${f.createdAt.toISOString()}`);
    console.log('');
  });

  const submissions = await prisma.flightSubmission.findMany({
    where: { id: { in: [22, 23] } },
    include: { Flight: true },
    orderBy: { id: 'asc' }
  });

  console.log('\n=== Submissions #22 y #23 ===\n');
  submissions.forEach(s => {
    console.log(`Submission #${s.id}:`);
    console.log(`  Hobbs Final: ${s.hobbsFinal}, Tach Final: ${s.tachFinal}`);
    console.log(`  Created: ${s.createdAt.toISOString()}`);
    if (s.Flight) {
      console.log(`  Flight ID: ${s.Flight.id}`);
      console.log(`    Hobbs: ${s.Flight.hobbs_inicio} → ${s.Flight.hobbs_fin} (Δ ${s.Flight.diff_hobbs})`);
      console.log(`    Tach: ${s.Flight.tach_inicio} → ${s.Flight.tach_fin} (Δ ${s.Flight.diff_tach})`);
    }
    console.log('');
  });

  await prisma.$disconnect();
}

checkRecentFlights();
