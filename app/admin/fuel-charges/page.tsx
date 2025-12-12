import { prisma } from '@/lib/prisma';
import { deleteFuelLog } from '@/app/actions/delete-fuel-log';

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
              <th className="px-3 py-2 border">Acciones</th>
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
                      href={
                        l.imageUrl.startsWith('/api/uploads/fuel-image') ? l.imageUrl :
                        l.imageUrl.startsWith('http') ? l.imageUrl :
                        l.imageUrl.startsWith('/uploads/fuel/') 
                          ? `/api/uploads/fuel-image?key=${encodeURIComponent(`fuel/${l.imageUrl.split('/').pop()}`)}`
                          : l.imageUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-blue-600"
                    >
                      Ver
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-3 py-2 border">
                  <form action={deleteFuelLog}>
                    <input type="hidden" name="fuelLogId" value={l.id} />
                    <button type="submit" className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
