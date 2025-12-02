import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

(async () => {
  // Get CSV payments
  let csvPayments = 0;
  const paymentsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
  if (fs.existsSync(paymentsPath)) {
    const raw = fs.readFileSync(paymentsPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    
    const parseCurrency = (value?: string) => {
      if (!value) return 0;
      const cleaned = value.replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.');
      if (!cleaned) return 0;
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : 0;
    };
    
    lines.slice(1).forEach(line => {
      const cols = line.split(';');
      const amount = parseCurrency(cols[2]);
      csvPayments += amount;
    });
  }
  
  // Get DB data
  const [totalRevenue, totalDeposits] = await Promise.all([
    prisma.flight.aggregate({ _sum: { costo: true } }),
    prisma.deposit.aggregate({ _sum: { monto: true } })
  ]);
  
  const totalCosto = Number(totalRevenue._sum.costo || 0);
  const dbDeposits = Number(totalDeposits._sum.monto || 0);
  const totalPayments = csvPayments + dbDeposits;
  const FIXED_ADJUSTMENT = 22471361;
  const pendingBalance = totalCosto - totalPayments - FIXED_ADJUSTMENT;
  
  console.log('');
  console.log('💰 CÁLCULO DE PENDING BALANCE (CSV + DB + AJUSTE)');
  console.log('━'.repeat(60));
  console.log('Total a cobrar (vuelos):       $' + totalCosto.toLocaleString('es-CL'));
  console.log('');
  console.log('Pagos del CSV:                 $' + csvPayments.toLocaleString('es-CL'));
  console.log('Depósitos en DB:               $' + dbDeposits.toLocaleString('es-CL'));
  console.log('                               ' + '─'.repeat(30));
  console.log('Total depositado:              $' + totalPayments.toLocaleString('es-CL'));
  console.log('');
  console.log('Ajuste fijo:                   $' + FIXED_ADJUSTMENT.toLocaleString('es-CL'));
  console.log('━'.repeat(60));
  console.log('PENDING BALANCE:               $' + pendingBalance.toLocaleString('es-CL'));
  console.log('');
  
  await prisma.$disconnect();
})();
