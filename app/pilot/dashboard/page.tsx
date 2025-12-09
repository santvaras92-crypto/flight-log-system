import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PilotDashboardClient from "./ui/PilotDashboardClient";
import fs from "fs";
import path from "path";

export const revalidate = 0;

export default async function PilotDashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || (session as any).role !== "PILOTO") {
    redirect("/login");
  }

  const userId = parseInt((session as any).userId);
  
  // Get the logged-in pilot's data
  const pilot = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      email: true,
      saldo_cuenta: true,
      tarifa_hora: true,
      fechaNacimiento: true,
      licencia: true,
      telefono: true,
    }
  });

  if (!pilot) {
    redirect("/login");
  }

  const pilotCode = (pilot.codigo || '').toUpperCase();

  // Get all flights for this pilot (only by pilotoId to match admin dashboard)
  const pilotFlights = await prisma.flight.findMany({
    where: {
      pilotoId: userId
    },
    orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      fecha: true,
      createdAt: true,
      hobbs_inicio: true,
      hobbs_fin: true,
      tach_inicio: true,
      tach_fin: true,
      diff_hobbs: true,
      diff_tach: true,
      costo: true,
      tarifa: true,
      instructor_rate: true,
      copiloto: true,
      cliente: true,
      instructor: true,
      detalle: true,
      aircraftId: true,
      piloto_raw: true,
      pilotoId: true,
      aerodromoSalida: true,
      aerodromoDestino: true,
    }
  });

  // Get deposits for this pilot
  const pilotDeposits = await prisma.deposit.findMany({
    where: { userId: userId },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      monto: true,
      detalle: true,
    }
  });

  // Get fuel logs for this pilot
  const pilotFuelLogs = await prisma.fuelLog.findMany({
    where: { userId: userId },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      litros: true,
      monto: true,
      detalle: true,
    }
  });

  // Compute Next Inspections (Oil Change and 100-hour) - same logic as admin dashboard
  const OIL_INTERVAL = 50;
  const INSPECT_100_INTERVAL = 100;

  const toNumber = (v: any) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as any).toNumber === 'function') {
      try { return (v as any).toNumber(); } catch { return Number(v as any) || null; }
    }
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  const getCurrentTach = async (): Promise<number | null> => {
    const latest = await prisma.flight.findFirst({
      orderBy: { fecha: 'desc' },
      select: { tach_fin: true, tach_inicio: true, diff_tach: true }
    });
    if (!latest) return null;
    const fin = toNumber(latest.tach_fin);
    const ini = toNumber(latest.tach_inicio);
    const diff = toNumber(latest.diff_tach);
    if (fin != null) return fin;
    if (ini != null && diff != null) return ini + diff;
    return ini;
  };

  const getLastTachForDetalle = async (keyword: string): Promise<number | null> => {
    const flight = await prisma.flight.findFirst({
      where: { detalle: { contains: keyword, mode: 'insensitive' } },
      orderBy: { fecha: 'desc' },
      select: { tach_inicio: true, tach_fin: true, diff_tach: true }
    });
    if (!flight) return null;
    const ini = toNumber(flight.tach_inicio);
    const fin = toNumber(flight.tach_fin);
    const diff = toNumber(flight.diff_tach);
    return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
  };

  // Oil change is also done during 100hr inspections, so find the most recent of either
  const getLastOilChangeTach = async (): Promise<number | null> => {
    const flights = await prisma.flight.findMany({
      where: {
        OR: [
          { detalle: { contains: 'CAMBIO DE ACEITE', mode: 'insensitive' } },
          { detalle: { contains: 'REVISION 100 HRS', mode: 'insensitive' } },
          { detalle: { contains: 'REVISION 100 HORAS', mode: 'insensitive' } },
        ]
      },
      orderBy: { fecha: 'desc' },
      take: 1,
      select: { tach_inicio: true, tach_fin: true, diff_tach: true }
    });
    if (flights.length === 0) return null;
    const flight = flights[0];
    const ini = toNumber(flight.tach_inicio);
    const fin = toNumber(flight.tach_fin);
    const diff = toNumber(flight.diff_tach);
    return ini != null ? ini : (fin != null && diff != null ? fin - diff : null);
  };

  const currentTach = await getCurrentTach();
  const oilTachBase = await getLastOilChangeTach();
  const inspectTachBase = await getLastTachForDetalle('REVISION 100 HRS');

  const oilUsed = oilTachBase != null && currentTach != null ? (currentTach - oilTachBase) : (currentTach != null ? (currentTach % OIL_INTERVAL) : 0);
  const inspectUsed = inspectTachBase != null && currentTach != null ? (currentTach - inspectTachBase) : (currentTach != null ? (currentTach % INSPECT_100_INTERVAL) : 0);

  const oilChangeRemaining = Math.max(0, OIL_INTERVAL - (oilUsed < 0 ? 0 : oilUsed));
  const hundredHourRemaining = Math.max(0, INSPECT_100_INTERVAL - (inspectUsed < 0 ? 0 : inspectUsed));

  // === PREDICTIVE STATISTICS (same as admin dashboard) ===
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const prevThirtyStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const prevThirtyEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  
  const [flights30d, flights60d, flights90d, flightsPrev30d, flightsThisYear] = await Promise.all([
    prisma.flight.findMany({ where: { fecha: { gte: thirtyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true, fecha: true } }),
    prisma.flight.findMany({ where: { fecha: { gte: sixtyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
    prisma.flight.findMany({ where: { fecha: { gte: ninetyDaysAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
    prisma.flight.findMany({ where: { fecha: { gte: prevThirtyStart, lt: prevThirtyEnd } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true } }),
    prisma.flight.findMany({ where: { fecha: { gte: oneYearAgo } }, select: { diff_tach: true, tach_inicio: true, tach_fin: true, diff_hobbs: true } }),
  ]);
  
  const computeTachHours = (flights: { diff_tach: any; tach_inicio: any; tach_fin: any }[]) => {
    let sum = 0;
    for (const f of flights) {
      const dt = toNumber(f.diff_tach);
      const ti = toNumber(f.tach_inicio);
      const tf = toNumber(f.tach_fin);
      const d = dt !== null ? dt : (ti !== null && tf !== null ? (tf - ti) : 0);
      if (!isNaN(d) && d > 0) sum += d;
    }
    return sum;
  };
  
  const hours30d = computeTachHours(flights30d);
  const hours60d = computeTachHours(flights60d);
  const hours90d = computeTachHours(flights90d);
  const hoursPrev30d = computeTachHours(flightsPrev30d);
  
  // Calculate HOBBS/TACH ratio from last 365 days
  const tachThisYear = computeTachHours(flightsThisYear);
  let hobbsThisYear = 0;
  for (const f of flightsThisYear) {
    const dh = toNumber((f as any).diff_hobbs);
    if (dh !== null && !isNaN(dh) && dh > 0) hobbsThisYear += dh;
  }
  const hobbsTachRatio = tachThisYear > 0 ? hobbsThisYear / tachThisYear : 1.25;
  
  const rate30d = hours30d / 30;
  const rate60d = hours60d / 60;
  const rate90d = hours90d / 90;
  const ratePrev30d = hoursPrev30d / 30;
  
  const weightedRate = (rate30d * 3 + rate60d * 2 + rate90d * 1) / 6;
  const trend = ratePrev30d > 0 ? ((rate30d - ratePrev30d) / ratePrev30d) * 100 : 0;
  
  // Standard deviation
  const flightsByDay = new Map<string, number>();
  for (const f of flights30d) {
    const dateKey = new Date(f.fecha).toISOString().slice(0, 10);
    const dt = toNumber(f.diff_tach);
    const ti = toNumber(f.tach_inicio);
    const tf = toNumber(f.tach_fin);
    const d = dt !== null ? dt : (ti !== null && tf !== null ? (tf - ti) : 0);
    flightsByDay.set(dateKey, (flightsByDay.get(dateKey) || 0) + (d > 0 ? d : 0));
  }
  const dailyHours: number[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    dailyHours.push(flightsByDay.get(dateKey) || 0);
  }
  const mean = dailyHours.reduce((a, b) => a + b, 0) / dailyHours.length;
  const variance = dailyHours.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / dailyHours.length;
  const stdDev = Math.sqrt(variance);

  // Global Fuel Rate calculation (same as admin dashboard - aircraft-wide, not pilot-specific)
  const sep9_2020 = new Date('2020-09-09');
  
  // Get total fuel consumed since Sep 9, 2020 from CSV
  let globalFuelLitros = 0;
  try {
    const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
    if (fs.existsSync(fuelPath)) {
      const content = fs.readFileSync(fuelPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        const dateStr = (parts[0] || '').trim();
        if (!dateStr) continue;
        const dateParts = dateStr.split('-');
        if (dateParts.length !== 3) continue;
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]);
        let year = parseInt(dateParts[2]);
        if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
        const fuelDate = new Date(year, month - 1, day);
        if (fuelDate >= sep9_2020) {
          const litrosStr = (parts[2] || '').trim().replace(',', '.');
          const litros = parseFloat(litrosStr);
          if (!isNaN(litros) && litros > 0) {
            globalFuelLitros += litros;
          }
        }
      }
    }
  } catch {}
  
  // Add DB fuel logs since Sep 9, 2020
  const dbFuelSinceSep = await prisma.fuelLog.findMany({
    where: { fecha: { gte: sep9_2020 } },
    select: { litros: true, fecha: true }
  });
  const dbFuelLatest = dbFuelSinceSep.length > 0 ? dbFuelSinceSep.reduce((max, f) => f.fecha > max ? f.fecha : max, sep9_2020) : null;
  // Only add DB fuel if it's after CSV data
  if (dbFuelLatest) {
    for (const f of dbFuelSinceSep) {
      globalFuelLitros += Number(f.litros) || 0;
    }
  }
  
  // Get total hours since Sep 9, 2020 (all flights, not just this pilot)
  const allFlightsSinceSep = await prisma.flight.findMany({
    where: { fecha: { gte: sep9_2020 } },
    select: { hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true }
  });
  const globalHoursSinceSep = allFlightsSinceSep.reduce((sum, f) => {
    const dh = toNumber(f.diff_hobbs);
    const hi = toNumber(f.hobbs_inicio);
    const hf = toNumber(f.hobbs_fin);
    const d = dh !== null ? dh : (hi !== null && hf !== null ? (hf - hi) : 0);
    return sum + (d > 0 ? d : 0);
  }, 0);
  
  // Apply 10% idle adjustment
  const effectiveHours = globalHoursSinceSep > 0 ? globalHoursSinceSep * 0.9 : 0;
  const fuelRateLph = effectiveHours > 0 ? Number((globalFuelLitros / effectiveHours).toFixed(2)) : 0;
  const fuelRateGph = fuelRateLph > 0 ? Number((fuelRateLph / 3.78541).toFixed(2)) : 0;

  // Read CSV deposits for this pilot code
  let csvDeposits: { fecha: string; descripcion: string; monto: number }[] = [];
  try {
    const depositsPath = path.join(process.cwd(), 'Pago pilotos', 'Pago pilotos.csv');
    if (fs.existsSync(depositsPath)) {
      const content = fs.readFileSync(depositsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        const code = (parts[3] || '').trim().toUpperCase();
        if (code !== pilotCode) continue;
        const fecha = (parts[0] || '').trim();
        const descripcion = (parts[1] || '').trim();
        const montoStr = (parts[2] || '').trim();
        const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
        const monto = parseFloat(cleaned) || 0;
        csvDeposits.push({ fecha, descripcion, monto });
      }
    }
  } catch {}

  // Read CSV fuel for this pilot code
  let csvFuel: { fecha: string; litros: number; monto: number }[] = [];
  try {
    const fuelPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
    if (fs.existsSync(fuelPath)) {
      const content = fs.readFileSync(fuelPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(';');
        const code = (parts[1] || '').trim().toUpperCase();
        if (code !== pilotCode) continue;
        const fecha = (parts[0] || '').trim();
        const litrosStr = (parts[2] || '').trim().replace(',', '.');
        const montoStr = (parts[3] || '').trim();
        const litros = parseFloat(litrosStr) || 0;
        const cleaned = montoStr.replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
        const monto = parseFloat(cleaned) || 0;
        csvFuel.push({ fecha, litros, monto });
      }
    }
  } catch {}

  // Calculate totals

  const totalFlightHours = pilotFlights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);
  const totalFlightCost = pilotFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0);
  const totalDepositsDB = pilotDeposits.reduce((sum, d) => sum + (Number(d.monto) || 0), 0);
  const totalDepositsCSV = csvDeposits.reduce((sum, d) => sum + d.monto, 0);
  const totalDeposits = totalDepositsDB + totalDepositsCSV;
  const totalFuelDB = pilotFuelLogs.reduce((sum, f) => sum + (Number(f.monto) || 0), 0);
  const totalFuelCSV = csvFuel.reduce((sum, f) => sum + f.monto, 0);
  const totalFuel = totalFuelDB + totalFuelCSV;

  // Balance = Deposits - Flight Costs - Fuel (igual que Flight Log Entries)
  const balance = totalDeposits - totalFlightCost - totalFuel;

  // This month stats
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonthFlights = pilotFlights.filter(f => new Date(f.fecha) >= firstDayOfMonth);
  const thisMonthHours = thisMonthFlights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);

  // Average flight time
  const avgFlightTime = pilotFlights.length > 0 ? totalFlightHours / pilotFlights.length : 0;

  const data = {
    pilot: {
      id: pilot.id,
      nombre: pilot.nombre,
      codigo: pilot.codigo,
      email: pilot.email,
      saldo_cuenta: Number(pilot.saldo_cuenta),
      tarifa_hora: Number(pilot.tarifa_hora),
    },
    flights: pilotFlights.map(f => ({
      ...f,
      fecha: f.fecha.toISOString(),
      hobbs_inicio: Number(f.hobbs_inicio),
      hobbs_fin: Number(f.hobbs_fin),
      tach_inicio: Number(f.tach_inicio),
      tach_fin: Number(f.tach_fin),
      diff_hobbs: Number(f.diff_hobbs),
      diff_tach: Number(f.diff_tach),
      costo: Number(f.costo),
      tarifa: f.tarifa ? Number(f.tarifa) : null,
      instructor_rate: f.instructor_rate ? Number(f.instructor_rate) : null,
    })),
    deposits: {
      db: pilotDeposits.map(d => ({
        id: d.id,
        fecha: d.fecha.toISOString(),
        monto: Number(d.monto),
        detalle: d.detalle,
      })),
      csv: csvDeposits,
    },
    fuel: {
      db: pilotFuelLogs.map(f => ({
        id: f.id,
        fecha: f.fecha.toISOString(),
        litros: Number(f.litros),
        monto: Number(f.monto),
        detalle: f.detalle,
      })),
      csv: csvFuel,
    },
    metrics: {
      totalFlights: pilotFlights.length,
      totalHours: Number(totalFlightHours.toFixed(1)),
      totalCost: totalFlightCost,
      totalDeposits: totalDeposits,
      totalFuel: totalFuel,
      balance: balance,
      thisMonthFlights: thisMonthFlights.length,
      thisMonthHours: Number(thisMonthHours.toFixed(1)),
      avgFlightTime: Number(avgFlightTime.toFixed(2)),
      oilChangeRemaining: Number(oilChangeRemaining.toFixed(1)),
      hundredHourRemaining: Number(hundredHourRemaining.toFixed(1)),
      fuelRateLph: fuelRateLph,
      fuelRateGph: fuelRateGph,
      usageStats: {
        rate30d: Number(rate30d.toFixed(3)),
        rate60d: Number(rate60d.toFixed(3)),
        rate90d: Number(rate90d.toFixed(3)),
        weightedRate: Number(weightedRate.toFixed(3)),
        trend: Number(trend.toFixed(1)),
        stdDev: Number(stdDev.toFixed(3)),
      },
      hobbsTachRatio: Number(hobbsTachRatio.toFixed(2)),
    }
  };

  return <PilotDashboardClient data={data} />;
}
