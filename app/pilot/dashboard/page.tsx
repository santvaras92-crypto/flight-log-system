import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PilotDashboardClient from "./ui/PilotDashboardClient";

export const revalidate = 0;

export default async function PilotDashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect("/login");
  }

  // Get pilot user data
  const user = await prisma.user.findUnique({
    where: { email: session.user.email! },
    select: {
      id: true,
      nombre: true,
      email: true,
      codigo: true,
      saldo_cuenta: true,
      tarifa_hora: true,
      rol: true,
    },
  });

  if (!user || user.rol !== "PILOTO") {
    redirect("/login");
  }

  const code = (user.codigo || "").toUpperCase();

  // Get flights where this pilot is the client (paid)
  const flights = await prisma.flight.findMany({
    where: { cliente: code },
    orderBy: { fecha: "desc" },
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
      detalle: true,
      aircraftId: true,
      piloto_raw: true,
    },
  });

  // Get transactions (deposits and fuel credits)
  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      monto: true,
      tipo: true,
      createdAt: true,
      Flight: {
        select: {
          id: true,
          fecha: true,
          diff_hobbs: true,
        },
      },
    },
  });

  // Calculate totals
  const totalFlights = flights.length;
  const totalHours = flights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
  const totalSpent = flights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
  
  const deposits = transactions
    .filter(t => t.tipo === "ABONO")
    .map(t => ({
      id: t.id,
      fecha: t.createdAt.toISOString(),
      monto: Number(t.monto),
      descripcion: "Depósito",
    }));
  
  const totalDeposits = deposits.reduce((sum, d) => sum + d.monto, 0);

  // Fuel credits (if any - you may need to adjust based on your fuel tracking)
  const totalFuel = 0; // TODO: implement fuel tracking if needed

  const balance = Number(user.saldo_cuenta);

  const data = {
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      codigo: code,
      saldo_cuenta: balance,
      tarifa_hora: Number(user.tarifa_hora),
    },
    flights: flights.map(f => ({
      ...f,
      fecha: f.fecha.toISOString(),
      hobbs_inicio: f.hobbs_inicio ? Number(f.hobbs_inicio) : null,
      hobbs_fin: f.hobbs_fin ? Number(f.hobbs_fin) : null,
      tach_inicio: f.tach_inicio ? Number(f.tach_inicio) : null,
      tach_fin: f.tach_fin ? Number(f.tach_fin) : null,
      diff_hobbs: f.diff_hobbs ? Number(f.diff_hobbs) : null,
      diff_tach: f.diff_tach ? Number(f.diff_tach) : null,
      costo: f.costo ? Number(f.costo) : null,
      tarifa: f.tarifa ? Number(f.tarifa) : null,
      instructor_rate: f.instructor_rate ? Number(f.instructor_rate) : null,
    })),
    deposits,
    summary: {
      totalFlights,
      totalHours,
      totalSpent,
      totalDeposits,
      totalFuel,
      balance,
    },
  };

  return <PilotDashboardClient data={data} />;
}
