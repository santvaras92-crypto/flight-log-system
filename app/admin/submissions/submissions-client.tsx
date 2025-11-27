"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { manualReviewAndApprove } from "@/app/actions/manual-review";

interface DecimalLike {
  toNumber?: () => number;
  // fallback for already converted numbers
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
  piloto: { id: number; nombre: string };
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
  PROCESANDO: "bg-blue-100 text-blue-800",
  REVISION: "bg-orange-100 text-orange-800",
  COMPLETADO: "bg-green-100 text-green-800",
  ERROR: "bg-red-100 text-red-800",
};

export default function AdminSubmissions({ initialData }: { initialData: SubmissionDto[] }) {
  const [data, setData] = useState(initialData);
  const [filter, setFilter] = useState<string>("ALL");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [overrideHobbs, setOverrideHobbs] = useState<Record<number, string>>({});
  const [overrideTach, setOverrideTach] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const filtered = data.filter((s) => {
    if (filter === "ALL") return true;
    return s.estado === filter;
  });

  async function handleManualApprove(submissionId: number, pilotoId: number) {
    setMessage(null);
    setPendingId(submissionId);
    const hobbsValStr = overrideHobbs[submissionId];
    const tachValStr = overrideTach[submissionId];

    const submission = data.find((d) => d.id === submissionId);
    if (!submission) return;

    const hobbsLog = submission.imageLogs.find((l) => l.tipo === "HOBBS");
    const tachLog = submission.imageLogs.find((l) => l.tipo === "TACH");

    const hobbsVal = hobbsValStr ? Number(hobbsValStr) : safeNum(hobbsLog?.valorExtraido);
    const tachVal = tachValStr ? Number(tachValStr) : safeNum(tachLog?.valorExtraido);

    if (hobbsVal == null || tachVal == null) {
      setMessage("Valores Hobbs/Tach inválidos");
      setPendingId(null);
      return;
    }

    startTransition(async () => {
      try {
        const res = await manualReviewAndApprove(submissionId, hobbsVal, tachVal, 1); // adminId=1 (seed)
        if (res.success) {
          setMessage(`Submission ${submissionId} aprobada manualmente.`);
          // Refrescar estado local marcando COMPLETADO
          setData((prev) => prev.map((p) => p.id === submissionId ? { ...p, estado: "COMPLETADO" } : p));
        } else {
          setMessage(res.error || "Error desconocido al aprobar");
        }
      } catch (e: any) {
        setMessage(e.message || "Error inesperado");
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
          <option value="ALL">Todos</option>
          <option value="REVISION">Pendientes de Revisión</option>
          <option value="ERROR">Errores</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="PROCESANDO">Procesando</option>
          <option value="COMPLETADO">Completados</option>
        </select>
        {message && (
          <div className="text-sm px-3 py-2 rounded bg-gray-100 border">{message}</div>
        )}
      </div>

      <div className="space-y-6">
        {filtered.map((s) => {
          const hobbs = safeNum(s.imageLogs.find((l) => l.tipo === "HOBBS")?.valorExtraido);
          const tach = safeNum(s.imageLogs.find((l) => l.tipo === "TACH")?.valorExtraido);
          const estadoClass = estadoColors[s.estado] || "bg-gray-100 text-gray-800";
          return (
            <div key={s.id} className="border rounded-lg bg-white shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-lg">Submission #{s.id}</h2>
                  <p className="text-sm text-gray-600">Piloto: {s.piloto.nombre} · Aeronave: {s.aircraft.matricula}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoClass}`}>{s.estado}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {s.imageLogs.map((img) => (
                  <div key={img.id} className="border rounded p-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold">{img.tipo}</span>
                      {img.validadoManual && (
                        <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Manual</span>
                      )}
                    </div>
                    <div className="w-full h-32 bg-gray-50 flex items-center justify-center text-gray-400 text-xs mb-2">
                      {/* Placeholder: For real images use <Image /> component */}
                      {img.imageUrl}
                    </div>
                    <p className="text-xs">Valor: {safeNum(img.valorExtraido) ?? "—"}</p>
                    <p className="text-xs">Confianza: {safeNum(img.confianza) ?? "—"}%</p>
                  </div>
                ))}
                <div className="border rounded p-2">
                  <h3 className="text-xs font-semibold mb-2">Vuelo</h3>
                  {s.flight ? (
                    <div className="space-y-1 text-xs">
                      <p>Hobbs Δ: {safeNum(s.flight.diff_hobbs)}</p>
                      <p>Tach Δ: {safeNum(s.flight.diff_tach)}</p>
                      <p>Costo: ${safeNum(s.flight.costo)?.toLocaleString()}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No registrado</p>
                  )}
                </div>
              </div>

              {(s.estado === "REVISION" || s.estado === "ERROR") && (
                <div className="bg-gray-50 border rounded p-3">
                  <h4 className="text-sm font-semibold mb-2">Aprobación Manual</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-600">Hobbs Override</label>
                      <input
                        type="number"
                        step="0.1"
                        value={overrideHobbs[s.id] ?? ""}
                        onChange={(e) => setOverrideHobbs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder={hobbs != null ? hobbs.toString() : ""}
                        className="mt-1 w-full border rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Tach Override</label>
                      <input
                        type="number"
                        step="0.1"
                        value={overrideTach[s.id] ?? ""}
                        onChange={(e) => setOverrideTach((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder={tach != null ? tach.toString() : ""}
                        className="mt-1 w-full border rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    disabled={isPending && pendingId === s.id}
                    onClick={() => handleManualApprove(s.id, s.piloto.id)}
                    className="px-4 py-2 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {isPending && pendingId === s.id ? "Procesando..." : "Aprobar Manualmente"}
                  </button>
                  {s.errorMessage && (
                    <p className="text-xs text-red-600 mt-2">Error: {s.errorMessage}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
