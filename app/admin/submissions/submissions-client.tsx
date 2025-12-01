"use client";

import { useState, useTransition } from "react";
import { approveFlightSubmission } from "@/app/actions/approve-flight";
import { cancelFlightSubmission } from "@/app/actions/cancel-submission";

interface DecimalLike {
  toNumber?: () => number;
}

interface ImageLogDto {
  id: number;
  tipo: string;
  imageUrl: string;
  valorExtraido: any;
  confianza: any;
  validadoManual: boolean;
}

interface SubmissionDto {
  id: number;
  estado: string;
  errorMessage: string | null;
  createdAt: string;
  fechaVuelo: string | null;
  hobbsFinal: any;
  tachFinal: any;
  cliente: string | null;
  copiloto: string | null;
  detalle: string | null;
  instructorRate: any;
  piloto: { id: number; nombre: string; codigo: string | null; tarifa_hora: any };
  aircraft: { matricula: string };
  lastHobbs: any;
  lastTach: any;
  imageLogs: ImageLogDto[];
  flight: null | { id: number; diff_hobbs: any; diff_tach: any; costo: any };
}

function safeNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  if (v.toNumber) return v.toNumber();
  return null;
}

const estadoColors: Record<string, string> = {
  PENDIENTE: "badge-warning",
  PROCESANDO: "badge-info",
  REVISION: "badge-warning",
  ESPERANDO_APROBACION: "badge-warning",
  COMPLETADO: "badge-success",
  ERROR: "badge-danger",
  CANCELADO: "badge-secondary",
};

const estadoStyles: Record<string, { bg: string; color: string; border: string }> = {
  PENDIENTE: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-warning)', border: 'var(--accent-warning)' },
  PROCESANDO: { bg: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-info)', border: 'var(--accent-info)' },
  REVISION: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-warning)', border: 'var(--accent-warning)' },
  ESPERANDO_APROBACION: { bg: 'rgba(168, 85, 247, 0.15)', color: '#A78BFA', border: '#A78BFA' },
  COMPLETADO: { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-success)', border: 'var(--accent-success)' },
  ERROR: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-danger)', border: 'var(--accent-danger)' },
  CANCELADO: { bg: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)', border: 'var(--text-muted)' },
};

export default function AdminSubmissions({ initialData }: { initialData: SubmissionDto[] }) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<string>("PENDIENTE");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [rates, setRates] = useState<Record<number, string>>({});
  const [instructorRates, setInstructorRates] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const filtered = data.filter((s) => {
    if (filter === "ALL") return true;
    return s.estado === filter;
  });

  async function handleApprove(submissionId: number) {
    setMessage(null);
    setPendingId(submissionId);
    
    const rate = rates[submissionId] ? parseFloat(rates[submissionId]) : 0;
    const instructorRate = instructorRates[submissionId] ? parseFloat(instructorRates[submissionId]) : 0;

    startTransition(async () => {
      try {
        const res = await approveFlightSubmission(submissionId, rate, instructorRate);
        if (res.success) {
          setMessage(`✓ Vuelo #${submissionId} registrado exitosamente.`);
          setData((prev) => prev.map((p) => p.id === submissionId ? { ...p, estado: "COMPLETADO" } : p));
        } else {
          setMessage(`✗ Error: ${res.error}`);
        }
      } catch (e: any) {
        setMessage(`✗ Error: ${e.message}`);
      } finally {
        setPendingId(null);
      }
    });
  }

  async function handleCancel(submissionId: number) {
    setMessage(null);
    setPendingId(submissionId);
    startTransition(async () => {
      try {
        const res = await cancelFlightSubmission(submissionId);
        if (res.success) {
          setMessage(`✓ Submission #${submissionId} cancelado.`);
          setData((prev) => prev.map((p) => (p.id === submissionId ? { ...p, estado: "CANCELADO" } : p)));
        } else {
          setMessage(`✗ Error: ${res.error}`);
        }
      } catch (e: any) {
        setMessage(`✗ Error: ${e.message}`);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="executive-input w-full sm:w-auto"
          >
            <option value="PENDIENTE">Esperando Aprobación</option>
            <option value="ALL">Todos</option>
            <option value="COMPLETADO">Completados</option>
            <option value="ERROR">Errores</option>
            <option value="CANCELADO">Cancelados</option>
          </select>
          {message && (
            <div className="text-xs sm:text-sm px-4 py-2 rounded-lg border flex-1" style={{ 
              background: message.startsWith('✓') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderColor: message.startsWith('✓') ? 'var(--accent-success)' : 'var(--accent-danger)',
              color: message.startsWith('✓') ? 'var(--accent-success)' : 'var(--accent-danger)'
            }}>
              {message}
            </div>
          )}
        </div>

      <div className="space-y-4 sm:space-y-6">
        {filtered.length === 0 && (
          <p className="text-center py-12" style={{ color: 'var(--text-muted)' }}>No hay submissions en este estado</p>
        )}
        {filtered.map((s) => {
          const hobbsFinal = safeNum(s.hobbsFinal);
          const tachFinal = safeNum(s.tachFinal);
          const lastHobbs = safeNum(s.lastHobbs);
          const blockTime = hobbsFinal != null && lastHobbs != null && hobbsFinal > lastHobbs
            ? Number((hobbsFinal - lastHobbs).toFixed(1))
            : null;
          const pilotoTarifa = safeNum(s.piloto.tarifa_hora) || 0;
          const estilo = estadoStyles[s.estado] || estadoStyles.PENDIENTE;
          
          return (
            <div key={s.id} className="executive-card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-lg sm:text-xl" style={{ color: 'var(--text-primary)' }}>Reporte #{s.id}</h2>
                  <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-medium">{s.piloto.codigo ? `${s.piloto.codigo} - ` : ''}{s.piloto.nombre}</span>
                    {' · '}{s.aircraft.matricula}
                    {' · '}{s.fechaVuelo ? new Date(s.fechaVuelo).toLocaleDateString('es-CL') : 'Sin fecha'}
                  </p>
                </div>
                <span className="inline-block px-3 py-1 rounded-full text-xs sm:text-sm font-medium border" style={{ 
                  background: estilo.bg,
                  color: estilo.color,
                  borderColor: estilo.border
                }}>
                  {s.estado === 'PENDIENTE' ? 'Esperando Aprobación' : s.estado}
                </span>
              </div>

              {/* Información del vuelo */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-4 p-3 sm:p-4 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Hobbs Final</p>
                  <p className="font-mono font-bold text-base sm:text-lg" style={{ color: 'var(--text-primary)' }}>{hobbsFinal?.toFixed(1) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Tach Final</p>
                  <p className="font-mono font-bold text-base sm:text-lg" style={{ color: 'var(--text-primary)' }}>{tachFinal?.toFixed(1) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Cliente</p>
                  <p className="font-medium text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>{s.piloto.codigo || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Copiloto</p>
                  <p className="font-medium text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>{s.copiloto || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Tiempo en Vuelo</p>
                  <p className="font-mono font-bold text-base sm:text-lg" style={{ color: 'var(--aviation-blue-500)' }}>{blockTime?.toFixed(1) || '—'}</p>
                </div>
              </div>

              {/* Fecha del vuelo visible también como chip */}
              <div className="mb-3">
                <span className="inline-block text-xs px-2 py-1 rounded border" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}>
                  Fecha volada: {s.fechaVuelo ? new Date(s.fechaVuelo).toLocaleDateString('es-CL') : '—'}
                </span>
              </div>

              {s.detalle && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--aviation-blue-600)' }}>
                  <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-tertiary)' }}>Detalle / Observaciones</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.detalle}</p>
                </div>
              )}

              {/* Imágenes si las hay */}
              {s.imageLogs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                  {s.imageLogs.map((img) => (
                    <div key={img.id} className="border rounded-lg p-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{img.tipo}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{img.imageUrl}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Panel de aprobación */}
              {s.estado === "PENDIENTE" && (
                <div className="rounded-lg p-4 sm:p-5 border-2" style={{ background: 'rgba(168, 85, 247, 0.1)', borderColor: '#A78BFA' }}>
                  <h4 className="text-sm font-bold mb-3 sm:mb-4 uppercase tracking-wide" style={{ color: '#A78BFA' }}>Aprobar Vuelo</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4">
                    <div>
                      <label className="text-xs block mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Rate ($/hr)
                        <span style={{ color: '#A78BFA' }} className="ml-1">*</span>
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={rates[s.id] ?? ""}
                        onChange={(e) => setRates((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="170000"
                        className="executive-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs block mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Instructor/SP ($/hr)
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={instructorRates[s.id] ?? ""}
                        onChange={(e) => setInstructorRates((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="0"
                        className="executive-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs block mb-1 font-semibold" style={{ color: 'var(--text-secondary)' }}>Total por hora</label>
                      <input
                        type="text"
                        readOnly
                        value={`$${((parseFloat(rates[s.id] || '0') || 0) + (parseFloat(instructorRates[s.id] || '0') || 0)).toLocaleString('es-CL')}`}
                        className="executive-input font-bold opacity-75"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      disabled={isPending && pendingId === s.id}
                      onClick={() => handleApprove(s.id)}
                      className="btn-executive btn-executive-primary w-full sm:w-auto"
                    >
                      {isPending && pendingId === s.id ? "Procesando..." : "✓ Aprobar y Registrar Vuelo"}
                    </button>
                    <button
                      disabled={isPending && pendingId === s.id}
                      onClick={() => handleCancel(s.id)}
                      className="btn-executive btn-executive-secondary w-full sm:w-auto"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {s.estado === "COMPLETADO" && s.flight && (
                <div className="rounded-lg p-3 border" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'var(--accent-success)' }}>
                  <p className="text-sm" style={{ color: 'var(--accent-success)' }}>
                    <span className="font-bold">✓ Vuelo registrado</span>
                    {' · '}Δ Hobbs: {safeNum(s.flight.diff_hobbs)?.toFixed(1)}
                    {' · '}Costo: ${safeNum(s.flight.costo)?.toLocaleString('es-CL')}
                  </p>
                </div>
              )}

              {s.errorMessage && (
                <p className="text-xs mt-2" style={{ color: 'var(--accent-danger)' }}>Error: {s.errorMessage}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
