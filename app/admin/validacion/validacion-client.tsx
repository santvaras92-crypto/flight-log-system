'use client';

import { useState, useTransition } from 'react';
import { approveFuel, rejectFuel } from '../../actions/validate-fuel';
import { approveDeposit, rejectDeposit } from '../../actions/validate-deposit';
import { approveFlightSubmission } from '../../actions/approve-flight';
import { cancelFlightSubmission } from '../../actions/cancel-submission';
import ImagePreviewModal from '../../components/ImagePreviewModal';

interface FuelItem {
  id: number;
  fecha: string;
  litros: number;
  monto: number;
  detalle: string | null;
  imageUrl: string | null;
  createdAt: string;
  pilotName: string;
  pilotCode: string;
}

interface DepositItem {
  id: number;
  fecha: string;
  monto: number;
  detalle: string | null;
  imageUrl: string | null;
  createdAt: string;
  pilotName: string;
  pilotCode: string;
}

interface FlightItem {
  id: number;
  estado: string;
  errorMessage: string | null;
  fechaVuelo: string | null;
  hobbsFinal: string | null;
  tachFinal: string | null;
  cliente: string | null;
  copiloto: string | null;
  detalle: string | null;
  instructorRate: string | null;
  createdAt: string;
  lastHobbs: string;
  lastTach: string;
  imageLogs: {
    id: number;
    tipo: string;
    imageUrl: string;
    valorExtraido: string | null;
    confianza: string | null;
    validadoManual: boolean;
  }[];
  piloto: {
    id: number;
    nombre: string;
    codigo: string | null;
    tarifa_hora: string;
  };
  aircraft: {
    matricula: string;
    modelo?: string | null;
  };
  flight: {
    id: number;
    diff_hobbs: string | null;
    diff_tach: string | null;
    costo: string | null;
  } | null;
}

interface UFInfo {
  valor: number;
  fecha: string;
  defaultRate: number;
  defaultInstructorRate: number;
}

type Tab = 'flights' | 'deposits' | 'fuel';

export default function ValidacionClient({
  fuelData,
  depositData,
  flightsData,
  ufInfo,
}: {
  fuelData: FuelItem[];
  depositData: DepositItem[];
  flightsData: FlightItem[];
  ufInfo: UFInfo;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('flights');
  const [isPending, startTransition] = useTransition();
  const [rates, setRates] = useState<Record<number, string>>({});
  const [instructorRates, setInstructorRates] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // Format UF value for display
  const formatUFDisplay = (value: number) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Get rate for a flight (default is UF-based rate)
  const getRate = (flightId: number) => {
    return rates[flightId] !== undefined 
      ? rates[flightId] 
      : ufInfo.defaultRate.toString();
  };

  const getImageUrl = (imageUrl: string | null) => {
    if (!imageUrl) return null;
    
    // New format: /api/uploads/fuel-image?key=...
    if (imageUrl.startsWith('/api/uploads/fuel-image')) return imageUrl;
    
    // Legacy R2 URLs (direct HTTPS)
    if (imageUrl.startsWith('http')) return imageUrl;
    
    // Legacy local paths - convert to new API format
    if (imageUrl.startsWith('/uploads/fuel/')) {
      const filename = imageUrl.split('/').pop();
      return `/api/uploads/fuel-image?key=${encodeURIComponent(`fuel/${filename}`)}`;
    }
    if (imageUrl.startsWith('/uploads/deposit/')) {
      const filename = imageUrl.split('/').pop();
      return `/api/uploads/fuel-image?key=${encodeURIComponent(`deposit/${filename}`)}`;
    }
    
    return imageUrl;
  };

  const tabs = [
    { id: 'flights' as Tab, label: 'Vuelos', icon: '✈️', count: flightsData.length, color: 'blue' },
    { id: 'deposits' as Tab, label: 'Depósitos', icon: '💰', count: depositData.length, color: 'emerald' },
    { id: 'fuel' as Tab, label: 'Combustible', icon: '⛽', count: fuelData.length, color: 'amber' },
  ];

  const handleApproveFlightSubmission = async (submissionId: number, hasCopiloto: boolean) => {
    const rate = parseFloat(getRate(submissionId));
    // Default instructor rate: 1.3 UF si hay copiloto, 0 si no
    const defaultInstRate = hasCopiloto ? ufInfo.defaultInstructorRate.toString() : '0';
    const instructorRate = parseFloat(instructorRates[submissionId] ?? defaultInstRate);

    startTransition(async () => {
      const result = await approveFlightSubmission(submissionId, rate, instructorRate);
      if (result?.success) {
        setMessage('✓ Vuelo aprobado correctamente');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage(`Error: ${result?.error || 'Error al aprobar'}`);
      }
    });
  };

  const handleCancelFlightSubmission = async (submissionId: number) => {
    if (!confirm('¿Cancelar esta submission?')) return;

    startTransition(async () => {
      const result = await cancelFlightSubmission(submissionId);
      if (result?.success) {
        setMessage('✓ Submission cancelada');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage(`Error: ${result?.error || 'Error al cancelar'}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.startsWith('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-4 py-2 sm:py-3 rounded-t-lg font-medium transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
              activeTab === tab.id
                ? `bg-${tab.color}-600 text-white shadow-lg`
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            style={activeTab === tab.id ? {
              backgroundColor: tab.color === 'blue' ? '#2563eb' : tab.color === 'emerald' ? '#059669' : '#d97706'
            } : {}}
          >
            <span>{tab.icon}</span>
            <span className="hidden xs:inline sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`px-1.5 sm:px-2 py-0.5 text-xs rounded-full ${
                activeTab === tab.id ? 'bg-white/30' : 'bg-slate-300'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {/* Flights Tab */}
        {activeTab === 'flights' && (
          <div className="space-y-4">
            {flightsData.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="text-4xl block mb-2">✈️</span>
                No hay vuelos pendientes de aprobación
              </div>
            ) : (
              flightsData.map((flight) => {
                const hobbsFinal = parseFloat(flight.hobbsFinal || '0');
                const lastHobbs = parseFloat(flight.lastHobbs || '0');
                const tachFinal = parseFloat(flight.tachFinal || '0');
                const lastTach = parseFloat(flight.lastTach || '0');
                const diffHobbs = hobbsFinal - lastHobbs;
                const diffTach = tachFinal - lastTach;
                const rate = parseFloat(getRate(flight.id));
                const instRate = parseFloat(instructorRates[flight.id] ?? (flight.copiloto ? ufInfo.defaultInstructorRate.toString() : '0'));
                // Costo = horas * (tarifa + instructor_rate)
                const estimatedCost = diffHobbs * (rate + instRate);

                return (
                  <div key={flight.id} className="bg-white border-2 border-blue-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-4 text-white">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-bold text-lg">
                            {flight.piloto.nombre}
                            <span className="font-mono text-blue-200 ml-2">({flight.piloto.codigo || 'N/A'})</span>
                          </h3>
                          <p className="text-blue-200 text-sm">
                            Submission #{flight.id} • {flight.aircraft.matricula}
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-amber-500 text-white text-sm font-medium rounded-full">
                          {flight.estado}
                        </span>
                      </div>
                    </div>

                    <div className="p-6">
                      {/* Images */}
                      {flight.imageLogs.length > 0 && (
                        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
                          {flight.imageLogs.map((img) => (
                            <a 
                              key={img.id}
                              href={img.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-shrink-0"
                            >
                              <img 
                                src={img.imageUrl} 
                                alt={img.tipo}
                                className="h-32 rounded-lg shadow border hover:scale-105 transition-transform"
                              />
                              <p className="text-xs text-center text-slate-500 mt-1">{img.tipo}</p>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Flight Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Fecha Vuelo</p>
                          <p className="font-medium">{flight.fechaVuelo ? new Date(flight.fechaVuelo).toLocaleDateString('es-CL') : '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">HOBBS (Inicio → Fin)</p>
                          <p className="font-mono">
                            <span className="text-slate-500">{lastHobbs.toFixed(1)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-bold text-blue-600">{hobbsFinal.toFixed(1)}</span>
                          </p>
                          <p className="text-xs font-bold text-green-600">Δ {diffHobbs.toFixed(1)} hrs</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">TACH (Inicio → Fin)</p>
                          <p className="font-mono">
                            <span className="text-slate-500">{lastTach.toFixed(1)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-bold text-blue-600">{tachFinal.toFixed(1)}</span>
                          </p>
                          <p className="text-xs font-bold text-green-600">Δ {diffTach.toFixed(1)} hrs</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Tiempo Vuelo</p>
                          <p className="font-mono font-bold text-green-600 text-xl">{diffHobbs.toFixed(1)} hrs</p>
                        </div>
                      </div>

                      {/* UF Badge and Rate Inputs */}
                      <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                        {/* UF Info Badge */}
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                          <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full">
                            <span className="text-sm">📊</span>
                            <span className="text-sm font-medium">UF del día: ${formatUFDisplay(ufInfo.valor)}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Tarifa: 4.5 UF × ${formatUFDisplay(ufInfo.valor)} = <span className="font-semibold">${ufInfo.defaultRate.toLocaleString('es-CL')}</span>/hora
                            <br/>
                            Instructor: 1.3 UF × ${formatUFDisplay(ufInfo.valor)} = <span className="font-semibold">${ufInfo.defaultInstructorRate.toLocaleString('es-CL')}</span>/hora
                          </div>
                        </div>

                        {/* Rate Inputs Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 uppercase block mb-1">Tarifa/Hora (editable)</label>
                            <input
                              type="number"
                              value={getRate(flight.id)}
                              onChange={(e) => setRates({ ...rates, [flight.id]: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                              placeholder={ufInfo.defaultRate.toString()}
                            />
                            <p className="text-xs text-slate-400 mt-1">Base: 4.5 UF = ${ufInfo.defaultRate.toLocaleString('es-CL')}</p>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 uppercase block mb-1">Instructor/SP Rate</label>
                            <input
                              type="number"
                              value={instructorRates[flight.id] ?? (flight.copiloto ? ufInfo.defaultInstructorRate.toString() : '0')}
                              onChange={(e) => setInstructorRates({ ...instructorRates, [flight.id]: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                              placeholder={flight.copiloto ? ufInfo.defaultInstructorRate.toString() : '0'}
                            />
                            <p className="text-xs text-slate-400 mt-1">Base: 1.3 UF = ${ufInfo.defaultInstructorRate.toLocaleString('es-CL')}</p>
                            {flight.copiloto && (
                              <p className="text-xs text-slate-400 mt-1">Copiloto: {flight.copiloto}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 uppercase block mb-1">Costo Estimado</label>
                            <p className="px-3 py-2 bg-green-100 text-green-800 font-bold rounded-lg font-mono text-lg">
                              ${estimatedCost.toLocaleString('es-CL')}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {diffHobbs.toFixed(2)} hrs × (${rate.toLocaleString('es-CL')} + ${instRate.toLocaleString('es-CL')})
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 pt-4 border-t">
                        <button
                          onClick={() => handleApproveFlightSubmission(flight.id, !!flight.copiloto)}
                          disabled={isPending}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Aprobar Vuelo
                        </button>
                        <button
                          onClick={() => handleCancelFlightSubmission(flight.id)}
                          disabled={isPending}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Deposits Tab */}
        {activeTab === 'deposits' && (
          <div className="space-y-4">
            {depositData.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="text-4xl block mb-2">💰</span>
                No hay depósitos pendientes de aprobación
              </div>
            ) : (
              depositData.map((dep) => (
                <div key={dep.id} className="bg-white border-2 border-emerald-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Image */}
                    <div className="md:w-1/3 bg-slate-100 p-4 flex items-center justify-center min-h-[200px]">
                      {dep.imageUrl ? (
                        <button
                          onClick={() => setImageModalUrl(getImageUrl(dep.imageUrl))}
                          className="cursor-pointer"
                        >
                          <img
                            src={getImageUrl(dep.imageUrl) || ''}
                            alt="Comprobante"
                            className="max-h-[300px] rounded-lg shadow-md hover:scale-105 transition-transform"
                          />
                        </button>
                      ) : (
                        <div className="text-slate-400 text-center">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Sin imagen
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="md:w-2/3 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {dep.pilotName}
                            <span className="text-slate-500 font-mono text-sm ml-2">({dep.pilotCode})</span>
                          </h3>
                          <p className="text-slate-500 text-sm">
                            Depósito #{dep.id} • {new Date(dep.createdAt).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded">
                          PENDIENTE
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Fecha</p>
                          <p className="font-medium">{new Date(dep.fecha).toLocaleDateString('es-CL')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Monto</p>
                          <p className="font-bold text-lg text-emerald-600">
                            ${dep.monto.toLocaleString('es-CL')}
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
                          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Aprobar
                          </button>
                        </form>
                        <form action={rejectDeposit}>
                          <input type="hidden" name="depositId" value={dep.id} />
                          <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
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
              ))
            )}
          </div>
        )}

        {/* Fuel Tab */}
        {activeTab === 'fuel' && (
          <div className="space-y-4">
            {fuelData.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="text-4xl block mb-2">⛽</span>
                No hay registros de combustible pendientes
              </div>
            ) : (
              fuelData.map((fuel) => (
                <div key={fuel.id} className="bg-white border-2 border-amber-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Image */}
                    <div className="md:w-1/3 bg-slate-100 p-4 flex items-center justify-center min-h-[200px]">
                      {fuel.imageUrl ? (
                        <button
                          onClick={() => setImageModalUrl(getImageUrl(fuel.imageUrl))}
                          className="cursor-pointer"
                        >
                          <img
                            src={getImageUrl(fuel.imageUrl) || ''}
                            alt="Boleta"
                            className="max-h-[300px] rounded-lg shadow-md hover:scale-105 transition-transform"
                          />
                        </button>
                      ) : (
                        <div className="text-slate-400 text-center">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Sin imagen
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="md:w-2/3 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {fuel.pilotName}
                            <span className="text-slate-500 font-mono text-sm ml-2">({fuel.pilotCode})</span>
                          </h3>
                          <p className="text-slate-500 text-sm">
                            Registro #{fuel.id} • {new Date(fuel.createdAt).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded">
                          PENDIENTE
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Fecha</p>
                          <p className="font-medium">{new Date(fuel.fecha).toLocaleDateString('es-CL')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Litros</p>
                          <p className="font-medium">{fuel.litros.toFixed(1)} L</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Monto</p>
                          <p className="font-bold text-lg text-amber-600">
                            ${fuel.monto.toLocaleString('es-CL')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Detalle</p>
                          <p className="font-medium">{fuel.detalle || '-'}</p>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4 border-t">
                        <form action={approveFuel}>
                          <input type="hidden" name="fuelLogId" value={fuel.id} />
                          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Aprobar
                          </button>
                        </form>
                        <form action={rejectFuel}>
                          <input type="hidden" name="fuelLogId" value={fuel.id} />
                          <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
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
              ))
            )}
          </div>
        )}
      </div>

      {/* Image Modal */}
      <ImagePreviewModal
        imageUrl={imageModalUrl}
        onClose={() => setImageModalUrl(null)}
        alt="Boleta"
      />
    </div>
  );
}
