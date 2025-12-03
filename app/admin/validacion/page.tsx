import { prisma } from '@/lib/prisma';
import { approveFuel, rejectFuel } from '@/app/actions/validate-fuel';
import { approveDeposit, rejectDeposit } from '@/app/actions/validate-deposit';

export const dynamic = 'force-dynamic';

export default async function ValidacionPage() {
  const [pendingFuel, pendingDeposits] = await Promise.all([
    prisma.fuelLog.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fecha: true,
        litros: true,
        monto: true,
        detalle: true,
        imageUrl: true,
        createdAt: true,
        User: { select: { nombre: true, codigo: true } },
      },
    }),
    prisma.deposit.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fecha: true,
        monto: true,
        detalle: true,
        imageUrl: true,
        createdAt: true,
        User: { select: { nombre: true, codigo: true } },
      },
    }),
  ]);

  const getImageUrl = (imageUrl: string | null) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http')) return imageUrl;
    if (imageUrl.startsWith('/uploads/fuel/')) {
      return `/api/uploads/fuel/${imageUrl.split('/').pop()}`;
    }
    if (imageUrl.startsWith('/uploads/deposit/')) {
      return `/api/uploads/deposit/${imageUrl.split('/').pop()}`;
    }
    return imageUrl;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Validación de Registros</h1>
      
      {/* Pending Fuel Logs */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-amber-600">⛽</span>
          Combustible Pendiente
          {pendingFuel.length > 0 && (
            <span className="bg-amber-100 text-amber-800 text-sm px-2 py-0.5 rounded-full">
              {pendingFuel.length}
            </span>
          )}
        </h2>
        
        {pendingFuel.length === 0 ? (
          <p className="text-slate-500 italic">No hay registros de combustible pendientes.</p>
        ) : (
          <div className="grid gap-4">
            {pendingFuel.map((log) => (
              <div key={log.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* Image Section */}
                  <div className="md:w-1/3 bg-slate-100 p-4 flex items-center justify-center min-h-[200px]">
                    {log.imageUrl ? (
                      <a 
                        href={getImageUrl(log.imageUrl) || '#'} 
                        target="_blank" 
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={getImageUrl(log.imageUrl) || ''}
                          alt="Boleta combustible"
                          className="max-h-[300px] rounded-lg shadow-md hover:scale-105 transition-transform cursor-pointer"
                        />
                      </a>
                    ) : (
                      <div className="text-slate-400 text-center">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Sin imagen
                      </div>
                    )}
                  </div>
                  
                  {/* Details Section */}
                  <div className="md:w-2/3 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {log.User?.nombre || 'Desconocido'}
                          <span className="text-slate-500 font-mono text-sm ml-2">
                            ({log.User?.codigo || 'N/A'})
                          </span>
                        </h3>
                        <p className="text-slate-500 text-sm">
                          Registro #{log.id} • {new Date(log.createdAt).toLocaleString('es-CL')}
                        </p>
                      </div>
                      <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded">
                        PENDIENTE
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Fecha</p>
                        <p className="font-medium">{new Date(log.fecha).toLocaleDateString('es-CL')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Litros</p>
                        <p className="font-medium">{Number(log.litros).toFixed(1)} L</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Monto Ingresado</p>
                        <p className="font-bold text-lg text-blue-600">
                          ${Number(log.monto).toLocaleString('es-CL')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Detalle</p>
                        <p className="font-medium">{log.detalle || '-'}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 pt-4 border-t">
                      <form action={approveFuel}>
                        <input type="hidden" name="fuelLogId" value={log.id} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Aprobar
                        </button>
                      </form>
                      <form action={rejectFuel}>
                        <input type="hidden" name="fuelLogId" value={log.id} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending Deposits */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-emerald-600">💰</span>
          Depósitos Pendientes
          {pendingDeposits.length > 0 && (
            <span className="bg-emerald-100 text-emerald-800 text-sm px-2 py-0.5 rounded-full">
              {pendingDeposits.length}
            </span>
          )}
        </h2>
        
        {pendingDeposits.length === 0 ? (
          <p className="text-slate-500 italic">No hay depósitos pendientes de validación.</p>
        ) : (
          <div className="grid gap-4">
            {pendingDeposits.map((dep) => (
              <div key={dep.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* Image Section */}
                  <div className="md:w-1/3 bg-slate-100 p-4 flex items-center justify-center min-h-[200px]">
                    {dep.imageUrl ? (
                      <a 
                        href={getImageUrl(dep.imageUrl) || '#'} 
                        target="_blank" 
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={getImageUrl(dep.imageUrl) || ''}
                          alt="Comprobante depósito"
                          className="max-h-[300px] rounded-lg shadow-md hover:scale-105 transition-transform cursor-pointer"
                        />
                      </a>
                    ) : (
                      <div className="text-slate-400 text-center">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Sin imagen
                      </div>
                    )}
                  </div>
                  
                  {/* Details Section */}
                  <div className="md:w-2/3 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {dep.User?.nombre || 'Desconocido'}
                          <span className="text-slate-500 font-mono text-sm ml-2">
                            ({dep.User?.codigo || 'N/A'})
                          </span>
                        </h3>
                        <p className="text-slate-500 text-sm">
                          Depósito #{dep.id} • {new Date(dep.createdAt).toLocaleString('es-CL')}
                        </p>
                      </div>
                      <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded">
                        PENDIENTE
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Fecha</p>
                        <p className="font-medium">{new Date(dep.fecha).toLocaleDateString('es-CL')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Monto Ingresado</p>
                        <p className="font-bold text-lg text-emerald-600">
                          ${Number(dep.monto).toLocaleString('es-CL')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Detalle</p>
                        <p className="font-medium">{dep.detalle || '-'}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 pt-4 border-t">
                      <form action={approveDeposit}>
                        <input type="hidden" name="depositId" value={dep.id} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Aprobar
                        </button>
                      </form>
                      <form action={rejectDeposit}>
                        <input type="hidden" name="depositId" value={dep.id} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
