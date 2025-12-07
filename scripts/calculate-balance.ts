import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function calculate() {
  // 1. Total Revenue (suma de costo de vuelos)
  const totalRevenue = await prisma.flight.aggregate({
    _sum: { costo: true }
  });
  const revenue = Number(totalRevenue._sum.costo || 0);

  // 2. Depósitos de DB
  const depositsDB = await prisma.deposit.aggregate({
    _sum: { monto: true }
  });
  const depositsAmount = Number(depositsDB._sum.monto || 0);

  // 3. Pagos desde CSV
  let paymentsFromCSV = 0;
  try {
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
        paymentsFromCSV += amount;
      });
    }
  } catch {}

  // 4. Fuel charges (non-Stratus)
  const fuelCharges = await prisma.fuelLog.aggregate({
    where: {
      User: {
        email: { not: { contains: 'stratus' } }
      }
    },
    _sum: { monto: true }
  });
  const fuelAmount = Number(fuelCharges._sum.monto || 0);

  // 5. Fixed adjustment
  const FIXED_ADJUSTMENT = 20691074;

  // 6. Total Payments
  const totalPayments = paymentsFromCSV + depositsAmount;

  // 7. Pending Balance
  const pendingBalance = revenue - totalPayments - fuelAmount - FIXED_ADJUSTMENT;

  console.log('=== CÁLCULO BALANCE UNPAID (DASHBOARD) ===\n');
  console.log('Total Revenue (vuelos):', revenue.toLocaleString('es-CL'));
  console.log('');
  console.log('MENOS:');
  console.log('  - Pagos CSV:', paymentsFromCSV.toLocaleString('es-CL'));
  console.log('  - Depósitos DB:', depositsAmount.toLocaleString('es-CL'));
  console.log('  - Total Payments:', totalPayments.toLocaleString('es-CL'));
  console.log('  - Fuel Charges:', fuelAmount.toLocaleString('es-CL'));
  console.log('  - FIXED_ADJUSTMENT:', FIXED_ADJUSTMENT.toLocaleString('es-CL'));
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('BALANCE UNPAID:', pendingBalance.toLocaleString('es-CL'));
  console.log('═══════════════════════════════════════');

  await prisma.$disconnect();
}

calculate().catch(console.error);
