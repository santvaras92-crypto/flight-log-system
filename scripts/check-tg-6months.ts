import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date('2026-01-15'); // Fecha actual
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  console.log('=== VERIFICACIÓN VUELOS TG ===');
  console.log('Fecha actual:', now.toISOString().split('T')[0]);
  console.log('6 meses atrás:', sixMonthsAgo.toISOString().split('T')[0]);
  console.log('');
  
  // Buscar usuario TG
  const user = await prisma.user.findFirst({
    where: { codigo: 'TG' }
  });
  
  if (!user) {
    console.log('❌ Usuario con código TG no encontrado');
    return;
  }
  
  console.log('✅ Usuario encontrado:', user.nombre, '- Código:', user.codigo);
  console.log('');
  
  // Todos los vuelos de TG (como cliente)
  const allFlights = await prisma.flight.findMany({
    where: { cliente: 'TG' },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      diff_hobbs: true,
      diff_tach: true,
      cliente: true,
      piloto_raw: true
    }
  });
  
  console.log('Total vuelos de TG (como cliente) en DB:', allFlights.length);
  console.log('');
  
  // Vuelos últimos 6 meses
  const flights6M = allFlights.filter(f => f.fecha >= sixMonthsAgo);
  
  console.log('Vuelos últimos 6 meses:', flights6M.length);
  console.log('');
  
  let totalHobbs = 0;
  let totalTach = 0;
  
  flights6M.forEach(f => {
    const hobbs = Number(f.diff_hobbs) || 0;
    const tach = Number(f.diff_tach) || 0;
    totalHobbs += hobbs;
    totalTach += tach;
    console.log(`${f.fecha.toISOString().split('T')[0]} | Hobbs: ${hobbs.toFixed(2)}h | Tach: ${tach.toFixed(2)}h | Piloto: ${f.piloto_raw || 'N/A'} | ID: ${f.id}`);
  });
  
  console.log('');
  console.log('═══════════════════════════════');
  console.log('TOTAL HOBBS últimos 6 meses:', totalHobbs.toFixed(2), 'h');
  console.log('TOTAL TACH últimos 6 meses:', totalTach.toFixed(2), 'h');
  console.log('═══════════════════════════════');
  
  await prisma.$disconnect();
}

main();
