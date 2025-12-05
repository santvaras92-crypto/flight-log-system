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

  // Get all flights for this pilot (by pilotoId or cliente/piloto_raw matching code)
  const pilotFlights = await prisma.flight.findMany({
    where: {
      OR: [
        { pilotoId: userId },
        { cliente: { equals: pilotCode, mode: 'insensitive' } },
        { piloto_raw: { contains: pilotCode, mode: 'insensitive' } }
      ]
    },
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
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

  // Balance = Deposits - Flight Costs - Fuel (fuel is already debited from account)
  // Actually fuel charges are deducted from balance, so:
  // Balance = Deposits - Flight Costs  (fuel is already included in the account balance on DB)
  const balance = totalDeposits - totalFlightCost;

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
        fecha: d.fecha,
        monto: Number(d.monto),
        detalle: d.detalle,
      })),
      csv: csvDeposits,
    },
    fuel: {
      db: pilotFuelLogs.map(f => ({
        id: f.id,
        fecha: f.fecha,
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
    }
  };

  return <PilotDashboardClient data={data} />;
}
