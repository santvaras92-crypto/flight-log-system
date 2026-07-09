'use client';

import { useState, useTransition } from 'react';
import { approveFuel, rejectFuel } from '../../actions/validate-fuel';
import { approveDeposit, rejectDeposit } from '../../actions/validate-deposit';
import { approveFlightSubmission } from '../../actions/approve-flight';
import { cancelFlightSubmission } from '../../actions/cancel-submission';
import ImagePreviewModal from '../../components/ImagePreviewModal';
import { formatFecha } from '../../../lib/date-utils';
import { Icon, type IconName } from '../../components/Icon';

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
  ufValor: number;
  defaultRate: number;
  defaultInstructorRate: number;
}

type Tab = 'flights' | 'deposits' | 'fuel';

export default function ValidacionClient({
  fuelData,
  depositData,
  flightsData,
}: {
  fuelData: FuelItem[];
  depositData: DepositItem[];
  flightsData: FlightItem[];
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

  // Get rate for a flight (default is the UF-based rate of the flight's date)
  const getRate = (flightId: number, defaultRate: number) => {
    return rates[flightId] !== undefined 
      ? rates[flightId] 
      : defaultRate.toString();
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
    { id: 'flights' as Tab, label: 'Vuelos', icon: 'airframe' as IconName, count: flightsData.length, color: 'blue' },
    { id: 'deposits' as Tab, label: 'Depósitos', icon: 'money' as IconName, count: depositData.length, color: 'emerald' },
    { id: 'fuel' as Tab, label: 'Combustible', icon: 'fuel' as IconName, count: fuelData.length, color: 'amber' },
  ];

  const handleApproveFlightSubmission = async (flight: FlightItem) => {
    const submissionId = flight.id;
    const rate = parseFloat(getRate(submissionId, flight.defaultRate));
    // Default instructor rate: 1.3 UF (de la fecha del vuelo) si hay copiloto, 0 si no
    const defaultInstRate = flight.copiloto ? flight.defaultInstructorRate.toString() : '0';
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
        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.startsWith('✓') ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300'}`}>
          <Icon name={message.startsWith('✓') ? 'checkCircle' : 'warning'} className="w-5 h-5 flex-shrink-0" />
          <span>{message.replace(/^✓\s*/, '')}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 border-b border-slate-200 dark:border-edge pb-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 sm:px-4 py-2 sm:py-3 rounded-t-lg font-medium transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
              activeTab === tab.id
                ? `bg-${tab.color}-600 text-white shadow-lg`
                : 'bg-slate-100 dark:bg-muted text-slate-600 dark:text-foreground-soft hover:bg-slate-200 dark:hover:bg-white/10'
            }`}
            style={activeTab === tab.id ? {
              backgroundColor: tab.color === 'blue' ? '#2563eb' : tab.color === 'emerald' ? '#059669' : '#d97706'
            } : {}}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
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
              <div className="text-center py-12 text-slate-500 dark:text-muted-foreground">
                <div className="flex justify-center mb-3"><Icon name="airframe" className="w-8 h-8 text-slate-300" /></div>
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
                const rate = parseFloat(getRate(flight.id, flight.defaultRate));
                const instRate = parseFloat(instructorRates[flight.id] ?? (flight.copiloto ? flight.defaultInstructorRate.toString() : '0'));
                // Costo = horas * (tarifa + instructor_rate)
                const estimatedCost = diffHobbs * (rate + instRate);

                return (
                  <div key={flight.id} className="bg-white dark:bg-card border-2 border-blue-200 dark:border-blue-500/30 rounded-xl shadow-lg overflow-hidden">
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
                              <p className="text-xs text-center text-slate-500 dark:text-muted-foreground mt-1">{img.tipo}</p>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Flight Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Fecha Vuelo</p>
                          <p className="font-medium">{flight.fechaVuelo ? formatFecha(flight.fechaVuelo) : '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">HOBBS (Inicio → Fin)</p>
                          <p className="font-mono">
                            <span className="text-slate-500 dark:text-muted-foreground">{lastHobbs.toFixed(1)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">{hobbsFinal.toFixed(1)}</span>
                          </p>
                          <p className="text-xs font-bold text-green-600 dark:text-green-400">Δ {diffHobbs.toFixed(1)} hrs</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">TACH (Inicio → Fin)</p>
                          <p className="font-mono">
                            <span className="text-slate-500 dark:text-muted-foreground">{lastTach.toFixed(1)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">{tachFinal.toFixed(1)}</span>
                          </p>
                          <p className="text-xs font-bold text-green-600 dark:text-green-400">Δ {diffTach.toFixed(1)} hrs</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Tiempo Vuelo</p>
                          <p className="font-mono font-bold text-green-600 dark:text-green-400 text-xl">{diffHobbs.toFixed(1)} hrs</p>
                        </div>
                      </div>

                      {/* UF Badge and Rate Inputs */}
                      <div className="mb-6 p-4 bg-slate-50 dark:bg-muted rounded-lg">
                        {/* UF Info Badge */}
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-edge">
                          <div className="flex items-center gap-2 bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 px-3 py-1.5 rounded-full">
                            <Icon name="chart" className="w-4 h-4" />
                            <span className="text-sm font-medium">UF del vuelo: ${formatUFDisplay(flight.ufValor)}</span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-muted-foreground">
                            Tarifa: 4.5 UF × ${formatUFDisplay(flight.ufValor)} = <span className="font-semibold">${flight.defaultRate.toLocaleString('es-CL')}</span>/hora
                            <br/>
                            Instructor: 1.3 UF × ${formatUFDisplay(flight.ufValor)} = <span className="font-semibold">${flight.defaultInstructorRate.toLocaleString('es-CL')}</span>/hora
                          </div>
                        </div>

                        {/* Rate Inputs Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase block mb-1">Tarifa/Hora (editable)</label>
                            <input
                              type="number"
                              value={getRate(flight.id, flight.defaultRate)}
                              onChange={(e) => setRates({ ...rates, [flight.id]: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                              placeholder={flight.defaultRate.toString()}
                            />
                            <p className="text-xs text-slate-400 dark:text-faint mt-1">Base: 4.5 UF = ${flight.defaultRate.toLocaleString('es-CL')}</p>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase block mb-1">Instructor/SP Rate</label>
                            <input
                              type="number"
                              value={instructorRates[flight.id] ?? (flight.copiloto ? flight.defaultInstructorRate.toString() : '0')}
                              onChange={(e) => setInstructorRates({ ...instructorRates, [flight.id]: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                              placeholder={flight.copiloto ? flight.defaultInstructorRate.toString() : '0'}
                            />
                            <p className="text-xs text-slate-400 dark:text-faint mt-1">Base: 1.3 UF = ${flight.defaultInstructorRate.toLocaleString('es-CL')}</p>
                            {flight.copiloto && (
                              <p className="text-xs text-slate-400 dark:text-faint mt-1">Copiloto: {flight.copiloto}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 dark:text-muted-foreground uppercase block mb-1">Costo Estimado</label>
                            <p className="px-3 py-2 bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300 font-bold rounded-lg font-mono text-lg">
                              ${estimatedCost.toLocaleString('es-CL')}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-1">
                              {diffHobbs.toFixed(2)} hrs × (${rate.toLocaleString('es-CL')} + ${instRate.toLocaleString('es-CL')})
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 pt-4 border-t">
                        <button
                          onClick={() => handleApproveFlightSubmission(flight)}
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
              <div className="text-center py-12 text-slate-500 dark:text-muted-foreground">
                <div className="flex justify-center mb-3"><Icon name="money" className="w-8 h-8 text-slate-300" /></div>
                No hay depósitos pendientes de aprobación
              </div>
            ) : (
              depositData.map((dep) => (
                <div key={dep.id} className="bg-white dark:bg-card border-2 border-emerald-200 dark:border-emerald-500/30 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Image */}
                    <div className="md:w-1/3 bg-slate-100 dark:bg-muted p-4 flex items-center justify-center min-h-[200px]">
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
                        <div className="text-slate-400 dark:text-faint text-center">
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
                            <span className="text-slate-500 dark:text-muted-foreground font-mono text-sm ml-2">({dep.pilotCode})</span>
                          </h3>
                          <p className="text-slate-500 dark:text-muted-foreground text-sm">
                            Depósito #{dep.id} • {new Date(dep.createdAt).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <span className="bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-medium px-2 py-1 rounded">
                          PENDIENTE
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Fecha</p>
                          <p className="font-medium">{formatFecha(dep.fecha)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Monto</p>
                          <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                            ${dep.monto.toLocaleString('es-CL')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Detalle</p>
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
              <div className="text-center py-12 text-slate-500 dark:text-muted-foreground">
                <div className="flex justify-center mb-3"><Icon name="fuel" className="w-8 h-8 text-slate-300" /></div>
                No hay registros de combustible pendientes
              </div>
            ) : (
              fuelData.map((fuel) => (
                <div key={fuel.id} className="bg-white dark:bg-card border-2 border-amber-200 dark:border-amber-500/30 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Image */}
                    <div className="md:w-1/3 bg-slate-100 dark:bg-muted p-4 flex items-center justify-center min-h-[200px]">
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
                        <div className="text-slate-400 dark:text-faint text-center">
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
                            <span className="text-slate-500 dark:text-muted-foreground font-mono text-sm ml-2">({fuel.pilotCode})</span>
                          </h3>
                          <p className="text-slate-500 dark:text-muted-foreground text-sm">
                            Registro #{fuel.id} • {new Date(fuel.createdAt).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <span className="bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-medium px-2 py-1 rounded">
                          PENDIENTE
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Fecha</p>
                          <p className="font-medium">{formatFecha(fuel.fecha)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Litros</p>
                          <p className="font-medium">{fuel.litros.toFixed(1)} L</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Monto</p>
                          <p className="font-bold text-lg text-amber-600 dark:text-amber-400">
                            ${fuel.monto.toLocaleString('es-CL')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground uppercase">Detalle</p>
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
