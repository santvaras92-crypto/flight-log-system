import { prisma } from "@/lib/prisma";
import DashboardClient from "./ui/DashboardClient";

export const revalidate = 0;

export default async function AdminDashboardPage() {
  const [users, aircraft, flights, submissions, components, transactions] = await Promise.all([
    prisma.user.findMany(),
    prisma.aircraft.findMany(),
    prisma.flight.findMany({ orderBy: { fecha: "desc" }, take: 200 }),
    prisma.flightSubmission.findMany({ include: { imageLogs: true, flight: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.component.findMany(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);

  const data = {
    users: users.map(u => ({ ...u, saldo_cuenta: Number(u.saldo_cuenta), tarifa_hora: Number(u.tarifa_hora) })),
    aircraft: aircraft.map(a => ({ ...a, hobbs_actual: Number(a.hobbs_actual), tach_actual: Number(a.tach_actual) })),
    flights: flights.map(f => ({ ...f, hobbs_inicio: Number(f.hobbs_inicio), hobbs_fin: Number(f.hobbs_fin), tach_inicio: Number(f.tach_inicio), tach_fin: Number(f.tach_fin), diff_hobbs: Number(f.diff_hobbs), diff_tach: Number(f.diff_tach), costo: Number(f.costo) })),
    submissions: submissions.map(s => ({ ...s, imageLogs: s.imageLogs.map(img => ({ ...img, valorExtraido: img.valorExtraido ? Number(img.valorExtraido) : null, confianza: img.confianza ? Number(img.confianza) : null })), flight: s.flight ? { ...s.flight, diff_hobbs: Number(s.flight.diff_hobbs), diff_tach: Number(s.flight.diff_tach), costo: Number(s.flight.costo) } : null })),
    components: components.map(c => ({ ...c, horas_acumuladas: Number(c.horas_acumuladas), limite_tbo: Number(c.limite_tbo) })),
    transactions: transactions.map(t => ({ ...t, monto: Number(t.monto) })),
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <DashboardClient initialData={data} />
      </div>
    </div>
  );
}
