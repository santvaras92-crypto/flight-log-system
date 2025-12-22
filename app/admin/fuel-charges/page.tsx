import { prisma } from '@/lib/prisma';
import FuelChargesTable from './FuelChargesTable';

export const dynamic = 'force-dynamic';

export default async function FuelChargesPage() {
  const logs = await prisma.fuelLog.findMany({
    orderBy: { fecha: 'desc' },
    select: {
      id: true,
      fecha: true,
      litros: true,
      monto: true,
      detalle: true,
      imageUrl: true,
      userId: true,
      User: { select: { nombre: true, codigo: true } },
    },
  });

  // Serialize Decimal fields for client component
  const serializedLogs = logs.map(l => ({
    ...l,
    litros: Number(l.litros),
    monto: Number(l.monto),
  }));

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Registros de Combustible</h1>
      <FuelChargesTable logs={serializedLogs} />
    </div>
  );
}
