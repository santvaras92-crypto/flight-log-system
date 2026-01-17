"use client";

import { useState, useMemo, useEffect } from "react";

interface UploadResponse {
  success: boolean;
  submissionId?: number;
  message?: string;
  error?: string;
  images?: {
    hobbs: string;
    tach: string;
  };
}

interface SubmissionStatus {
  id: number;
  estado: string;
  errorMessage: string | null;
  piloto: {
    nombre: string;
    email: string;
  };
  aircraft: {
    matricula: string;
    modelo: string | null;
  };
  images: Array<{
    tipo: string;
    imageUrl: string;
    valorExtraido: number | null;
    confianza: number | null;
    validadoManual: boolean;
  }>;
  flight: {
    diff_hobbs: number;
    diff_tach: number;
    costo: number;
  } | null;
}

type PilotOption = { id: number; nombre: string; email: string };

interface LastCounters {
  hobbs: number | null;
  tach: number | null;
}

interface LastComponents {
  airframe: number | null;
  engine: number | null;
  propeller: number | null;
}

export default function FlightUploadForm({ 
  pilots = [] as PilotOption[], 
  lastCounters = { hobbs: null, tach: null } as LastCounters,
  lastComponents = { airframe: null, engine: null, propeller: null } as LastComponents
}: { 
  pilots?: PilotOption[];
  lastCounters?: LastCounters;
  lastComponents?: LastComponents;
}) {
  const [pilotoId, setPilotoId] = useState(pilots.length ? String(pilots[0].id) : "");
  const [hobbsImage, setHobbsImage] = useState<File | null>(null);
  const [tachImage, setTachImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  
  // Campos obligatorios
  const [hobbsManual, setHobbsManual] = useState<string>("");
  const [tachManual, setTachManual] = useState<string>("");
  const [fechaVuelo, setFechaVuelo] = useState<string>(new Date().toISOString().split("T")[0]);
  
  // Nuevos campos
  const [copiloto, setCopiloto] = useState<string>("");
  const [detalle, setDetalle] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Calcular deltas en tiempo real
  const deltaHobbs = useMemo(() => {
    if (!hobbsManual || lastCounters.hobbs === null) return null;
    const val = parseFloat(hobbsManual) - lastCounters.hobbs;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [hobbsManual, lastCounters.hobbs]);

  const deltaTach = useMemo(() => {
    if (!tachManual || lastCounters.tach === null) return null;
    const val = parseFloat(tachManual) - lastCounters.tach;
    return isNaN(val) || val <= 0 ? null : Number(val.toFixed(1));
  }, [tachManual, lastCounters.tach]);

  // Calcular ratio actual Hobbs/Tach
  const hobbsTachRatio = useMemo(() => {
    if (deltaHobbs === null || deltaTach === null || deltaTach === 0) return null;
    return deltaHobbs / deltaTach;
  }, [deltaHobbs, deltaTach]);

  // Estado para ratio esperado basado en buckets
  const [expectedRatioData, setExpectedRatioData] = useState<{
    expectedRatio: number;
    minRatio: number;
    maxRatio: number;
    bucket: string;
    sampleSize: number;
  } | null>(null);

  // Obtener ratio esperado basado en deltaTach
  useEffect(() => {
    if (deltaTach === null || deltaTach <= 0) {
      setExpectedRatioData(null);
      return;
    }

    async function fetchExpectedRatio() {
      try {
        const response = await fetch(`/api/expected-ratio?tachDelta=${deltaTach}`);
        if (response.ok) {
          const data = await response.json();
          setExpectedRatioData(data);
        }
      } catch (error) {
        console.error('Error fetching expected ratio:', error);
      }
    }

    fetchExpectedRatio();
  }, [deltaTach]);

  // Validar ratio con rangos específicos por bucket
  const ratioWarning = useMemo(() => {
    if (hobbsTachRatio === null || !expectedRatioData) return null;
    
    const { expectedRatio, minRatio, maxRatio, bucket, sampleSize } = expectedRatioData;
    
    if (hobbsTachRatio < minRatio || hobbsTachRatio > maxRatio) {
      return {
        ratio: hobbsTachRatio.toFixed(2),
        expected: expectedRatio.toFixed(2),
        bucket,
        sampleSize,
        message: hobbsTachRatio < minRatio 
          ? "Δ Hobbs parece bajo respecto a Δ Tach" 
          : "Δ Hobbs parece alto respecto a Δ Tach"
      };
    }
    return null;
  }, [hobbsTachRatio, expectedRatioData]);

  // Obtener nombre del piloto seleccionado
  const selectedPilot = useMemo(() => {
    return pilots.find(p => String(p.id) === pilotoId);
  }, [pilots, pilotoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar que tenga valores manuales obligatorios
    if (!hobbsManual || !tachManual) {
      alert("Por favor ingresa los valores de Hobbs y Tach");
      return;
    }

    const hobbsNum = parseFloat(hobbsManual);
    const tachNum = parseFloat(tachManual);
    
    if (isNaN(hobbsNum) || isNaN(tachNum)) {
      alert("Los valores de Hobbs y Tach deben ser números válidos");
      return;
    }

    if (lastCounters.hobbs !== null && hobbsNum <= lastCounters.hobbs) {
      alert(`El Hobbs debe ser mayor a ${lastCounters.hobbs.toFixed(1)}`);
      return;
    }

    if (lastCounters.tach !== null && tachNum <= lastCounters.tach) {
      alert(`El Tach debe ser mayor a ${lastCounters.tach.toFixed(1)}`);
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append("pilotoId", pilotoId);
      formData.append("matricula", "CC-AQI"); // Siempre CC-AQI
      formData.append("fechaVuelo", fechaVuelo);
      formData.append("hobbsManual", hobbsManual);
      formData.append("tachManual", tachManual);
      formData.append("copiloto", copiloto);
      formData.append("detalle", detalle);
      
      if (hobbsImage) formData.append("hobbsImage", hobbsImage);
      if (tachImage) formData.append("tachImage", tachImage);

      const response = await fetch("/api/upload-flight", {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await response.json();
      setResult(data);

      if (data.success && data.submissionId) {
        setTimeout(() => checkStatus(data.submissionId!), 2000);
      }
    } catch (error) {
      console.error("Error:", error);
      setResult({ success: false, error: "Error al enviar el vuelo" });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (submissionId: number) => {
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/submission-status?id=${submissionId}`);
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.submission);
      }
    } catch (error) {
      console.error("Error al consultar estado:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      PENDIENTE: "bg-yellow-500 text-white",
      PROCESANDO: "bg-[#003D82] text-white",
      REVISION: "bg-orange-500 text-white",
      COMPLETADO: "bg-green-600 text-white",
      ERROR: "bg-[#D32F2F] text-white",
      ESPERANDO_APROBACION: "bg-amber-500 text-white",
    };

    const labels: Record<string, string> = {
      ESPERANDO_APROBACION: "ESPERANDO APROBACIÓN",
    };

    return (
      <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wide shadow-lg ${styles[estado] || "bg-gray-500 text-white"}`}>
        {labels[estado] || estado}
      </span>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Main Form */}
        <form onSubmit={handleSubmit} className="executive-card mb-8 shadow-lg">
          {/* Form Header */}
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-b-2 bg-gradient-to-r from-blue-600 to-indigo-700" style={{ borderColor: 'var(--aviation-blue-600)' }}>
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wide text-white">Registro de Vuelo · CC-AQI</h2>
          </div>

          <div className="p-4 sm:p-8">
            {/* Piloto y Fecha */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Pilot Selection */}
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Piloto al Mando *
                </label>
                {pilots.length > 0 ? (
                  <select
                    value={pilotoId}
                    onChange={(e) => setPilotoId(e.target.value)}
                    className="executive-input"
                    required
                  >
                    <option value="">Seleccionar piloto...</option>
                    {pilots.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-4 rounded-lg border-2" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--accent-warning)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-warning)' }}>No hay pilotos registrados en el directorio.</p>
                  </div>
                )}
              </div>

              {/* Fecha del vuelo */}
              <div className="space-y-2">
                <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Fecha del Vuelo *
                </label>
                <input
                  type="date"
                  value={fechaVuelo}
                  onChange={(e) => setFechaVuelo(e.target.value)}
                  className="executive-input"
                  required
                />
              </div>
            </div>

            {/* Últimos contadores */}
            {(lastCounters.hobbs !== null || lastCounters.tach !== null) && (
              <div className="rounded-xl p-4 mb-4 sm:mb-6 border-2" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--accent-warning)' }}>
                <h3 className="text-xs sm:text-sm font-bold mb-2 uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--accent-warning)' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Últimos Contadores Registrados
                </h3>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>HOBBS:</span>
                    <span className="font-mono font-bold text-base sm:text-lg" style={{ color: 'var(--aviation-blue-400)' }}>
                      {lastCounters.hobbs !== null ? lastCounters.hobbs.toFixed(1) : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>TACH:</span>
                    <span className="font-mono font-bold text-base sm:text-lg" style={{ color: 'var(--aviation-blue-400)' }}>
                      {lastCounters.tach !== null ? lastCounters.tach.toFixed(1) : "N/A"}
                    </span>
                  </div>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Los nuevos valores deben ser mayores a estos</p>
              </div>
            )}

            {/* Contadores Section - OBLIGATORIO */}
            <div className="rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--accent-success)' }}>
              <h3 className="text-base sm:text-lg font-bold mb-4 uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--accent-success)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Contadores Finales (Obligatorio)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Hobbs Final *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={lastCounters.hobbs !== null ? lastCounters.hobbs + 0.1 : 0}
                    value={hobbsManual}
                    onChange={(e) => setHobbsManual(e.target.value)}
                    placeholder={lastCounters.hobbs !== null ? `Mayor a ${lastCounters.hobbs.toFixed(1)}` : "Ej: 2058.5"}
                    className="executive-input font-mono font-bold text-base sm:text-lg"
                    required
                  />
                  {deltaHobbs !== null && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                      <span className="text-xs font-bold uppercase" style={{ color: 'var(--aviation-blue-400)' }}>Δ Hobbs:</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--aviation-blue-500)' }}>{deltaHobbs.toFixed(1)} hrs</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Tach Final *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={lastCounters.tach !== null ? lastCounters.tach + 0.1 : 0}
                    value={tachManual}
                    onChange={(e) => setTachManual(e.target.value)}
                    placeholder={lastCounters.tach !== null ? `Mayor a ${lastCounters.tach.toFixed(1)}` : "Ej: 570.3"}
                    className="executive-input font-mono font-bold text-base sm:text-lg"
                    required
                  />
                  {deltaTach !== null && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
                      <span className="text-xs font-bold uppercase" style={{ color: '#A78BFA' }}>Δ Tach:</span>
                      <span className="font-mono font-bold" style={{ color: '#C4B5FD' }}>{deltaTach.toFixed(1)} hrs</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Warning de relación Hobbs/Tach */}
              {ratioWarning && (
                <div className="mt-4 p-3 sm:p-4 rounded-lg border-2" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--accent-warning)' }}>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--accent-warning)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-bold text-sm sm:text-base" style={{ color: 'var(--accent-warning)' }}>⚠️ Verificar Contadores</p>
                      <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {ratioWarning.message}. Ratio actual: <span className="font-mono font-bold">{ratioWarning.ratio}</span>{' '}
                        (esperado: {ratioWarning.expected} para {ratioWarning.bucket}h)
                      </p>
                      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                        Para vuelos de {ratioWarning.bucket}h Tach, se espera ratio {ratioWarning.expected} (basado en {ratioWarning.sampleSize} vuelos). Verifica los valores.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Información adicional */}
            <div className="rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-primary)' }}>
              <h3 className="text-base sm:text-lg font-bold mb-4 uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--aviation-blue-500)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Información Adicional
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Copiloto / Instructor
                  </label>
                  <input
                    type="text"
                    value={copiloto}
                    onChange={(e) => setCopiloto(e.target.value)}
                    placeholder="Nombre del copiloto o instructor (opcional)"
                    className="executive-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Detalle del Vuelo
                  </label>
                  <textarea
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    placeholder="Observaciones o detalles adicionales del vuelo (opcional)"
                    rows={3}
                    className="executive-input resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Image Upload Section - Opcional */}
            <div className="rounded-xl p-4 sm:p-6 mb-4 sm:mb-6" style={{ background: 'var(--bg-tertiary)' }}>
              <h3 className="text-base sm:text-lg font-bold mb-4 uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--aviation-blue-500)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Fotos de Medidores (Opcional)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="rounded-xl p-4 sm:p-6 border-2 border-dashed transition-all" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--aviation-blue-600)' }}>
                  <div className="text-center mb-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full mb-3" style={{ background: 'rgba(37, 99, 235, 0.15)' }}>
                      <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--aviation-blue-500)' }}>H</span>
                    </div>
                    <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Hobbs Meter
                    </label>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setHobbsImage(e.target.files?.[0] || null)}
                    className="w-full text-xs sm:text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:cursor-pointer"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                  />
                  {hobbsImage && (
                    <div className="mt-3 p-3 rounded-lg border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--accent-success)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--accent-success)' }}>✓ {hobbsImage.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(hobbsImage.size / 1024).toFixed(0)} KB</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl p-4 sm:p-6 border-2 border-dashed transition-all" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                  <div className="text-center mb-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full mb-3" style={{ background: 'rgba(37, 99, 235, 0.15)' }}>
                      <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--aviation-blue-500)' }}>T</span>
                    </div>
                    <label className="block text-xs sm:text-sm font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Tachometer
                    </label>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setTachImage(e.target.files?.[0] || null)}
                    className="w-full text-xs sm:text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:cursor-pointer"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                  />
                  {tachImage && (
                    <div className="mt-3 p-3 rounded-lg border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--accent-success)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--accent-success)' }}>✓ {tachImage.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(tachImage.size / 1024).toFixed(0)} KB</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Preview de Bitácora */}
            {deltaHobbs !== null && deltaTach !== null && selectedPilot && (
              <div className="rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 shadow-lg" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--aviation-blue-500)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base sm:text-lg font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--aviation-blue-500)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    VISTA PREVIA - BITÁCORA CC-AQI
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-colors" 
                    style={{ 
                      background: showPreview ? 'var(--aviation-blue-500)' : 'var(--bg-tertiary)',
                      color: showPreview ? 'white' : 'var(--aviation-blue-500)',
                      border: '1px solid var(--aviation-blue-500)'
                    }}
                  >
                    {showPreview ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                
                {showPreview && (
                  <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <div className="inline-block min-w-full align-middle">
                      <div className="overflow-hidden shadow-lg ring-1 ring-black ring-opacity-5 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-300 bg-white text-xs sm:text-sm">
                          <thead className="bg-slate-700">
                            <tr>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>DATE</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>HOBBS</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>BLOCK<br/>TIME</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>TAC</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>TACH.<br/>TIME</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" colSpan={3}>TOTAL TIME IN SERVICE</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>PILOT<br/>LICENSE</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>INSTRUCTOR/<br/>COPILOT</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>ROUTE</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-2 text-center font-bold text-white text-[10px] sm:text-xs" rowSpan={2}>REMARKS<br/>SIGNATURE</th>
                            </tr>
                            <tr>
                              <th className="border border-slate-400 px-2 sm:px-3 py-1 text-center font-bold text-white text-[9px] sm:text-[10px]">AIRFRAME</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-1 text-center font-bold text-white text-[9px] sm:text-[10px]">ENGINE</th>
                              <th className="border border-slate-400 px-2 sm:px-3 py-1 text-center font-bold text-white text-[9px] sm:text-[10px]">PROPELLER</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            <tr className="hover:bg-gray-50">
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono text-gray-900 whitespace-nowrap">{fechaVuelo}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-gray-900">{hobbsManual}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-blue-600">{deltaHobbs.toFixed(1)}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-gray-900">{tachManual}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-blue-600">{deltaTach.toFixed(1)}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-gray-900">
                                {lastComponents.airframe !== null ? (lastComponents.airframe + deltaTach).toFixed(1) : "--"}
                              </td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-gray-900">
                                {lastComponents.engine !== null ? (lastComponents.engine + deltaTach).toFixed(1) : "--"}
                              </td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-mono font-bold text-gray-900">
                                {lastComponents.propeller !== null ? (lastComponents.propeller + deltaTach).toFixed(1) : "--"}
                              </td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center font-semibold text-gray-900">{selectedPilot.nombre}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center text-gray-900">{copiloto || "--"}</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center text-gray-900">LOCAL</td>
                              <td className="border border-slate-300 px-2 sm:px-3 py-2 sm:py-3 text-center text-gray-900">{detalle || "S/Obs"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm mt-3 italic" style={{ color: 'var(--text-tertiary)' }}>
                      * Los valores mostrados son una vista previa. Se confirmarán al aprobar el vuelo.
                    </p>
                    {/* Diagnóstico: muestra bases y deltas usados para trazabilidad */}
                    <div className="mt-3 p-3 rounded-lg text-[10px] sm:text-xs font-mono" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      <div className="flex flex-wrap gap-3 sm:gap-4">
                        <span className="whitespace-nowrap">Base A/E/P: {lastComponents.airframe !== null ? lastComponents.airframe.toFixed(1) : "--"} / {lastComponents.engine !== null ? lastComponents.engine.toFixed(1) : "--"} / {lastComponents.propeller !== null ? lastComponents.propeller.toFixed(1) : "--"}</span>
                        <span className="whitespace-nowrap">Δ Tach usado: {deltaTach.toFixed(1)}</span>
                        <span className="whitespace-nowrap">Δ Hobbs: {deltaHobbs.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !pilotoId}
              className="btn-executive btn-executive-primary w-full py-4 px-8 text-base sm:text-lg uppercase tracking-wide shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Enviando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Enviar Vuelo para Aprobación
                </span>
              )}
            </button>
          </div>
        </form>

        {/* Result Messages */}
        {result && (
          <div className="rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 shadow-lg border-2" style={{ background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderColor: result.success ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            <div className="flex items-center gap-3 mb-2">
              {result.success ? (
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-success)' }}>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-danger)' }}>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              <h3 className="font-bold text-lg sm:text-xl" style={{ color: result.success ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                {result.success ? "¡Vuelo Enviado!" : "Error al Enviar"}
              </h3>
            </div>
            <p className="ml-11 sm:ml-13 font-medium text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              {result.success 
                ? "Tu vuelo ha sido enviado y está esperando aprobación del administrador. Recibirás una notificación cuando sea procesado."
                : (result.message || result.error)}
            </p>
            {result.submissionId && (
              <p className="text-xs sm:text-sm mt-2 ml-11 sm:ml-13 font-mono" style={{ color: 'var(--text-muted)' }}>
                ID de Envío: #{result.submissionId}
              </p>
            )}
          </div>
        )}

        {checkingStatus && (
          <div className="rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 shadow-lg border-2" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'var(--aviation-blue-600)' }}>
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 h-6 sm:w-6 sm:h-6" viewBox="0 0 24 24" style={{ color: 'var(--aviation-blue-500)' }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="font-bold text-sm sm:text-base" style={{ color: 'var(--aviation-blue-500)' }}>Consultando estado...</p>
            </div>
          </div>
        )}

        {/* Status Panel */}
        {status && (
          <div className="executive-card">
            <div className="executive-header px-4 sm:px-8 py-4 sm:py-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-wide text-white">Estado del Vuelo</h2>
                {getEstadoBadge(status.estado)}
              </div>
            </div>

            <div className="p-4 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: 'var(--bg-tertiary)' }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Piloto</p>
                  <p className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{status.piloto.nombre}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Aeronave</p>
                  <p className="text-lg sm:text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {status.aircraft.matricula} {status.aircraft.modelo && `(${status.aircraft.modelo})`}
                  </p>
                </div>
              </div>

              {status.images && status.images.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="text-base sm:text-lg font-bold mb-4 uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>Imágenes Enviadas</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {status.images.map((img, idx) => (
                      <div key={idx} className="rounded-xl overflow-hidden shadow-lg border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                        <div className="px-4 sm:px-6 py-3 sm:py-4 text-white" style={{ background: img.tipo === "HOBBS" ? 'linear-gradient(135deg, var(--aviation-blue-600), var(--aviation-blue-700))' : 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
                          <h4 className="font-bold text-sm sm:text-lg uppercase tracking-wide">{img.tipo} Meter</h4>
                        </div>
                        <img src={img.imageUrl} alt={img.tipo} className="w-full h-48 sm:h-64 object-cover" />
                        <div className="p-4 sm:p-6">
                          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                            <span className="text-xs sm:text-sm font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Lectura:</span>
                            <span className="text-xl sm:text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                              {img.valorExtraido !== null ? img.valorExtraido : "---"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {status.flight && (
                <div className="rounded-2xl p-4 sm:p-8 shadow-xl border-2" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--accent-success)' }}>
                  <div className="flex items-center gap-3 mb-4 sm:mb-6">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-success)' }}>
                      <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-bold uppercase tracking-wide" style={{ color: 'var(--accent-success)' }}>Vuelo Registrado</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    <div className="rounded-xl p-4 sm:p-6 shadow-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Tiempo Hobbs</p>
                      <p className="text-3xl sm:text-4xl font-bold font-mono" style={{ color: 'var(--aviation-blue-500)' }}>{status.flight.diff_hobbs.toFixed(1)}</p>
                      <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>horas</p>
                    </div>
                    <div className="rounded-xl p-4 sm:p-6 shadow-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Tiempo Tach</p>
                      <p className="text-3xl sm:text-4xl font-bold font-mono text-indigo-500">{status.flight.diff_tach.toFixed(1)}</p>
                      <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>horas</p>
                    </div>
                    <div className="rounded-xl p-4 sm:p-6 shadow-lg" style={{ background: 'var(--bg-elevated)' }}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Costo Vuelo</p>
                      <p className="text-3xl sm:text-4xl font-bold font-mono" style={{ color: 'var(--accent-success)' }}>${status.flight.costo.toLocaleString()}</p>
                      <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>total</p>
                    </div>
                  </div>
                </div>
              )}

              {status.errorMessage && (
                <div className="rounded-2xl p-4 sm:p-6 mt-4 sm:mt-6 border-2" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--accent-danger)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-danger)' }}>
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-base sm:text-lg" style={{ color: 'var(--accent-danger)' }}>Error de Procesamiento</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{status.errorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              {result?.submissionId && (
                <button
                  onClick={() => checkStatus(result.submissionId!)}
                  className="mt-4 sm:mt-6 w-full btn-executive btn-executive-secondary py-4 px-6 uppercase tracking-wide flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar Estado
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
