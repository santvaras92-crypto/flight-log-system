import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findFirst({
    where: { nombre: { contains: 'Pizarro' } },
    select: { id: true, nombre: true, email: true, codigo: true }
  });
  
  if (!user) { 
    console.log('Usuario no encontrado'); 
    await prisma.$disconnect();
    return; 
  }
  
  console.log('=== USUARIO ===');
  console.log('ID:', user.id, '| Nombre:', user.nombre, '| Código:', user.codigo);
  
  const flights = await prisma.flight.findMany({
    where: { pilotoId: user.id },
    select: { costo: true, diff_hobbs: true }
  });
  
  const totalCosto = flights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
  const totalHoras = flights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
  
  console.log('');
  console.log('=== VUELOS ===');
  console.log('Total vuelos:', flights.length);
  console.log('Total horas:', totalHoras.toFixed(1));
  console.log('Total costo:', totalCosto.toLocaleString('es-CL'));
  
  const deposits = await prisma.deposit.findMany({
    where: { userId: user.id },
    select: { monto: true }
  });
  
  const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.monto || 0), 0);
  
  console.log('');
  console.log('=== DEPÓSITOS ===');
  console.log('Total depósitos:', deposits.length);
  console.log('Total monto:', totalDeposits.toLocaleString('es-CL'));
  
  console.log('');
  console.log('=== BALANCE ===');
  console.log('Costo vuelos - Depósitos =', (totalCosto - totalDeposits).toLocaleString('es-CL'));
  
  await prisma.$disconnect();
}

check().catch(console.error);
