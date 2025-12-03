import { prisma } from '@/lib/prisma';
import path from 'path';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';

export default async function FuelChargesPage() {
  const logsRaw = await prisma.fuelLog.findMany({
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
  const logs = await Promise.all(
    logsRaw.map(async (l) => {
      const filename = l.imageUrl?.startsWith('/uploads/fuel/') ? l.imageUrl.split('/').pop() || '' : '';
      const filePath = filename ? path.join(process.cwd(), 'public', 'uploads', 'fuel', filename) : '';
      let exists = false;
      try {
        if (filePath) {
          await fs.access(filePath);
          exists = true;
        }
      } catch {}
      return { ...l, exists };
    })
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Registros de Combustible</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 border">ID</th>
              <th className="px-3 py-2 border">Fecha</th>
              <th className="px-3 py-2 border">Piloto</th>
              <th className="px-3 py-2 border">Litros</th>
              <th className="px-3 py-2 border">Monto</th>
              <th className="px-3 py-2 border">Detalle</th>
              <th className="px-3 py-2 border">Boleta</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 border">{l.id}</td>
                <td className="px-3 py-2 border">{new Date(l.fecha).toLocaleDateString()}</td>
                <td className="px-3 py-2 border">{l.User ? `${l.User.nombre} (${l.User.codigo || '#'+l.userId})` : `#${l.userId}`}</td>
                <td className="px-3 py-2 border">{Number(l.litros)}</td>
                <td className="px-3 py-2 border">${Number(l.monto).toLocaleString()}</td>
                <td className="px-3 py-2 border">{l.detalle || ''}</td>
                <td className="px-3 py-2 border">
                  {l.imageUrl ? (
                    <a
                      href={l.imageUrl.startsWith('/uploads/fuel/')
                        ? `/api/uploads/fuel/${l.imageUrl.split('/').pop()}`
                        : l.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`underline ${l.exists ? 'text-blue-600' : 'text-slate-400 pointer-events-none'}`}
                    >
                      {l.exists ? 'Ver' : 'No disponible'}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
