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
  hobbsInicial: any;
  hobbsFinal: any;
  deltaHobbs: any;
  tachInicial: any;
  tachFinal: any;
  deltaTach: any;
  cliente: string | null;
  copiloto: string | null;
  detalle: string | null;
  instructorRate: any;
  piloto: { id: number; nombre: string; codigo: string | null; tarifa_hora: any };
  aircraft: { matricula: string };
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
  PENDIENTE: "bg-yellow-100 text-yellow-800",
  PROCESANDO: "bg-blue-50 text-[#003D82]",
  REVISION: "bg-orange-100 text-orange-800",
  ESPERANDO_APROBACION: "bg-purple-100 text-purple-800",
  COMPLETADO: "bg-green-100 text-green-800",
  ERROR: "bg-red-50 text-[#D32F2F]",
  CANCELADO: "bg-gray-100 text-gray-700",
};

export default function AdminSubmissions({ initialData }: { initialData: SubmissionDto[] }) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<string>("ESPERANDO_APROBACION");
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
    <div>
      <div className="flex items-center gap-4 mb-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border px-3 py-2 rounded"
        >
          <option value="ESPERANDO_APROBACION">Esperando Aprobación</option>
          <option value="ALL">Todos</option>
          <option value="COMPLETADO">Completados</option>
          <option value="ERROR">Errores</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
        {message && (
          <div className={`text-sm px-3 py-2 rounded border ${message.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {filtered.length === 0 && (
          <p className="text-gray-500 text-center py-8">No hay submissions en este estado</p>
        )}
        {filtered.map((s) => {
          const hobbsFinal = safeNum(s.hobbsFinal);
          const tachFinal = safeNum(s.tachFinal);
          const deltaHobbs = safeNum(s.deltaHobbs); // Usar el delta que viene del formulario
          const blockTime = deltaHobbs; // Tiempo en vuelo = Delta Hobbs
          const pilotoTarifa = safeNum(s.piloto.tarifa_hora) || 0;
          const estadoClass = estadoColors[s.estado] || "bg-gray-100 text-gray-800";
          
          return (
            <div key={s.id} className="border rounded-lg bg-white shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-lg">Reporte #{s.id}</h2>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">{s.piloto.codigo ? `${s.piloto.codigo} - ` : ''}{s.piloto.nombre}</span>
                    {' · '}{s.aircraft.matricula}
                    {' · '}{s.fechaVuelo ? new Date(s.fechaVuelo).toLocaleDateString('es-CL') : 'Sin fecha'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoClass}`}>
                  {s.estado === 'ESPERANDO_APROBACION' ? 'Esperando Aprobación' : s.estado}
                </span>
              </div>

              {/* Información del vuelo */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 bg-gray-50 p-3 rounded">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Hobbs Final</p>
                  <p className="font-mono font-bold text-lg">{hobbsFinal?.toFixed(1) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Tach Final</p>
                  <p className="font-mono font-bold text-lg">{tachFinal?.toFixed(1) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Cliente</p>
                  <p className="font-medium">{s.piloto.codigo || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Copiloto</p>
                  <p className="font-medium">{s.copiloto || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Tiempo en Vuelo</p>
                  <p className="font-mono font-bold text-lg">{blockTime?.toFixed(1) || '—'}</p>
                </div>
              </div>

              {/* Fecha del vuelo visible también como chip */}
              <div className="mb-3">
                <span className="inline-block text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  Fecha volada: {s.fechaVuelo ? new Date(s.fechaVuelo).toLocaleDateString('es-CL') : '—'}
                </span>
              </div>

              {s.detalle && (
                <div className="mb-4 bg-blue-50 p-3 rounded">
                  <p className="text-xs text-gray-500 uppercase mb-1">Detalle / Observaciones</p>
                  <p className="text-sm">{s.detalle}</p>
                </div>
              )}

              {/* Imágenes si las hay */}
              {s.imageLogs.length > 0 && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {s.imageLogs.map((img) => (
                    <div key={img.id} className="border rounded p-2">
                      <p className="text-xs font-semibold mb-1">{img.tipo}</p>
                      <p className="text-xs text-gray-500 truncate">{img.imageUrl}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Panel de aprobación */}
              {s.estado === "ESPERANDO_APROBACION" && (
                <div className="bg-purple-50 border border-purple-200 rounded p-4">
                  <h4 className="text-sm font-bold mb-3 text-purple-800">Aprobar Vuelo</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        Rate ($/hr)
                        <span className="text-purple-600 ml-1">*</span>
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={rates[s.id] ?? ""}
                        onChange={(e) => setRates((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="170000"
                        className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        Instructor/SP ($/hr)
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={instructorRates[s.id] ?? ""}
                        onChange={(e) => setInstructorRates((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Total por hora</label>
                      <input
                        type="text"
                        readOnly
                        value={`$${((parseFloat(rates[s.id] || '0') || 0) + (parseFloat(instructorRates[s.id] || '0') || 0)).toLocaleString('es-CL')}`}
                        className="w-full border rounded px-3 py-2 text-sm bg-gray-100 font-bold"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      disabled={isPending && pendingId === s.id}
                      onClick={() => handleApprove(s.id)}
                      className="px-6 py-2 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                    >
                      {isPending && pendingId === s.id ? "Procesando..." : "✓ Aprobar y Registrar Vuelo"}
                    </button>
                    <button
                      disabled={isPending && pendingId === s.id}
                      onClick={() => handleCancel(s.id)}
                      className="px-6 py-2 rounded text-sm font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-200 border border-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {s.estado === "COMPLETADO" && s.flight && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-sm text-green-800">
                    <span className="font-bold">✓ Vuelo registrado</span>
                    {' · '}Δ Hobbs: {safeNum(s.flight.diff_hobbs)?.toFixed(1)}
                    {' · '}Costo: ${safeNum(s.flight.costo)?.toLocaleString('es-CL')}
                  </p>
                </div>
              )}

              {s.errorMessage && (
                <p className="text-xs text-red-600 mt-2">Error: {s.errorMessage}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
