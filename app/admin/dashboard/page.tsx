import { prisma } from "@/lib/prisma";
import DashboardClient from "./ui/DashboardClient";

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

  const data = {
    users: users.map(u => ({ ...u, saldo_cuenta: Number(u.saldo_cuenta), tarifa_hora: Number(u.tarifa_hora) })),
    aircraft: aircraft.map(a => ({ ...a, hobbs_actual: Number(a.hobbs_actual), tach_actual: Number(a.tach_actual) })),
    flights: flights.map(f => ({ ...f, hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin), tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin), diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach), costo: Number(f.costo) })),
    submissions: submissions.map(s => ({ ...s, imageLogs: s.ImageLog.map(img => ({ ...img, valorExtraido: img.valorExtraido ? Number(img.valorExtraido) : null, confianza: img.confianza ? Number(img.confianza) : null })), flight: s.Flight ? { ...s.Flight, diff_hobbs: Number(s.Flight.diff_hobbs), diff_tach: Number(s.Flight.diff_tach), costo: Number(s.Flight.costo) } : null })),
    components: components.map(c => ({ ...c, horas_acumuladas: Number(c.horas_acumuladas), limite_tbo: Number(c.limite_tbo) })),
    transactions: transactions.map(t => ({ ...t, monto: Number(t.monto) })),
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient initialData={data} pagination={{ page, pageSize, total: totalFlights }} />
      </div>
    </div>
  );
}
