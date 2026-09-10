// Import historical fuel records from CSV into FuelLog.
// CSV: Combustible/Planilla control combustible.csv (jun 2018 – 28 nov 2025)
// DB already has records from 29 nov 2025 onward → import only CSV rows up to 2025-11-28.
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

const CSV = path.join(__dirname, '..', 'Combustible', 'Planilla control combustible.csv');
const CUTOFF = new Date('2025-11-29T00:00:00Z'); // DB coverage starts here

function parseNum(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim());
  return isNaN(n) ? null : n;
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const raw = fs.readFileSync(CSV, 'utf-8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').slice(1).filter(l => l.trim());

  // Pick an admin user to own the historical records
  const admin = await prisma.user.findFirst({ where: { rol: 'ADMIN' }, orderBy: { id: 'asc' } });
  if (!admin) throw new Error('No admin user found');
  console.log('Owner user:', admin.id, admin.email ?? '');

  const rows: { fecha: Date; litros: number; monto: number; detalle: string }[] = [];
  for (const line of lines) {
    const [fechaS, cuenta, litrosS, montoS] = line.split(';');
    const m = fechaS?.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
    if (!m) continue;
    const fecha = new Date(Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
    const litros = parseNum(litrosS);
    const monto = parseNum(montoS);
    if (!litros || !monto || litros <= 0 || monto <= 0) continue;
    if (fecha >= CUTOFF) continue; // already covered by DB
    rows.push({ fecha, litros, monto, detalle: `Histórico CSV · Cuenta: ${cuenta?.trim() || '?'}` });
  }
  rows.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  console.log(`Parsed ${rows.length} importable rows (${rows[0]?.fecha.toISOString().slice(0, 10)} → ${rows[rows.length - 1]?.fecha.toISOString().slice(0, 10)})`);
  const totL = rows.reduce((s, r) => s + r.litros, 0);
  const totM = rows.reduce((s, r) => s + r.monto, 0);
  console.log(`Totals: ${totL.toFixed(1)} L · $${totM.toLocaleString('es-CL')} CLP`);

  // Safety: skip any that already exist (same fecha day + litros + monto)
  const existing = await prisma.fuelLog.findMany({ select: { fecha: true, litros: true, monto: true } });
  const key = (f: Date, l: number, m: number) => `${f.toISOString().slice(0, 10)}|${l}|${m}`;
  const existSet = new Set(existing.map(e => key(e.fecha, Number(e.litros), Number(e.monto))));
  const toInsert = rows.filter(r => !existSet.has(key(r.fecha, r.litros, r.monto)));
  console.log(`To insert: ${toInsert.length} (skipped ${rows.length - toInsert.length} duplicates)`);

  if (dryRun) { console.log('DRY RUN — nothing written'); await prisma.$disconnect(); return; }

  const res = await prisma.fuelLog.createMany({
    data: toInsert.map(r => ({
      userId: admin.id,
      fecha: r.fecha,
      litros: r.litros,
      monto: r.monto,
      detalle: r.detalle,
      estado: 'APROBADO',
    })),
  });
  console.log('Inserted:', res.count);
  console.log('Total FuelLog now:', await prisma.fuelLog.count());
  await prisma.$disconnect();
})();
