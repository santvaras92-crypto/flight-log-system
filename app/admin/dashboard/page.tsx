import { prisma } from "@/lib/prisma";
import DashboardClient from "./ui/DashboardClient";
import fs from "fs";
import path from "path";

export const revalidate = 0;

export default async function AdminDashboardPage({ searchParams }: { searchParams?: { page?: string; pageSize?: string } }) {
  const page = Number(searchParams?.page || 1);
  const pageSize = Number(searchParams?.pageSize || 200);
  const skip = (page - 1) * pageSize;
  const [users, aircraft, flights, submissions, components, transactions, totalFlights] = await Promise.all([
    prisma.user.findMany(),
    prisma.aircraft.findMany(),
    prisma.flight.findMany({ orderBy: { fecha: "desc" }, skip, take: pageSize }),
    prisma.flightSubmission.findMany({ include: { ImageLog: true, Flight: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.component.findMany(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.flight.count(),
  ]);

  // Read allowed pilot codes from official CSV (Base de dato pilotos)
  let allowedPilotCodes: string[] = [];
  try {
    const csvPath = path.join(process.cwd(), "Base de dato pilotos", "Base de dato pilotos.csv");
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      allowedPilotCodes = Array.from(new Set(
        lines.slice(1) // skip header
          .map(l => l.split(";")[0]?.trim().toUpperCase())
          .filter(Boolean) as string[]
      ));
    }
  } catch (e) {
    // Ignore CSV errors; fallback will show current behavior
    allowedPilotCodes = [];
  }

  // Build maintenance items: use DB baseline + add Δ Tach from flights after baseline date
  // Baseline components are stored in DB with initial values (AIRFRAME 2722.8, ENGINE 569.6, PROPELLER 1899.0)
  // Future flights will increment these values
  const baselineDate = new Date('2025-11-28T00:00:00Z'); // Date when baseline was set
  
  const maintenanceComponents = await Promise.all(
    aircraft.map(async (a) => {
      // Get baseline from DB (if exists)
      const dbComponents = await prisma.component.findMany({ 
        where: { aircraftId: a.matricula },
        orderBy: { tipo: 'asc' }
      });
      
      // Calculate additional hours from flights after baseline
      const additionalTach = await prisma.flight.aggregate({
        where: { 
          aircraftId: a.matricula,
          fecha: { gte: baselineDate }
        },
        _sum: { diff_tach: true }
      });
      const increment = Number(additionalTach._sum.diff_tach || 0);

      // If DB has components, use them + increment; otherwise compute from all flights (legacy)
      if (dbComponents.length > 0) {
        return dbComponents.map(c => ({
          id: String(c.id),
          aircraftId: c.aircraftId,
          tipo: c.tipo,
          horas_acumuladas: Number(c.horas_acumuladas) + increment,
          limite_tbo: Number(c.limite_tbo)
        }));
      } else {
        // Fallback: compute from all flights (for aircraft without baseline)
        const allTach = await prisma.flight.aggregate({
          where: { aircraftId: a.matricula },
          _sum: { diff_tach: true }
        });
        const total = Number(allTach._sum.diff_tach || 0);
        return [
          { id: `${a.matricula}-AF`, aircraftId: a.matricula, tipo: 'AIRFRAME', horas_acumuladas: total, limite_tbo: 30000 },
          { id: `${a.matricula}-EN`, aircraftId: a.matricula, tipo: 'ENGINE', horas_acumuladas: total, limite_tbo: 2000 },
          { id: `${a.matricula}-PR`, aircraftId: a.matricula, tipo: 'PROPELLER', horas_acumuladas: total, limite_tbo: 2000 },
        ];
      }
    })
  );
  const computedComponents = maintenanceComponents.flat();

  const data = {
    users: users.map(u => ({ ...u, saldo_cuenta: Number(u.saldo_cuenta), tarifa_hora: Number(u.tarifa_hora) })),
    aircraft: aircraft.map(a => ({ ...a, hobbs_actual: Number(a.hobbs_actual), tach_actual: Number(a.tach_actual) })),
    flights: flights.map(f => ({ ...f, hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin), tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin), diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach), costo: Number(f.costo) })),
    submissions: submissions.map(s => ({ ...s, imageLogs: s.ImageLog.map(img => ({ ...img, valorExtraido: img.valorExtraido ? Number(img.valorExtraido) : null, confianza: img.confianza ? Number(img.confianza) : null })), flight: s.Flight ? { ...s.Flight, diff_hobbs: Number(s.Flight.diff_hobbs), diff_tach: Number(s.Flight.diff_tach), costo: Number(s.Flight.costo) } : null })),
    components: computedComponents.map(c => ({ ...c, horas_acumuladas: Number(c.horas_acumuladas), limite_tbo: Number(c.limite_tbo) })),
    transactions: transactions.map(t => ({ ...t, monto: Number(t.monto) })),
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient initialData={data} pagination={{ page, pageSize, total: totalFlights }} allowedPilotCodes={allowedPilotCodes} />
      </div>
    </div>
  );
}
