"use client";

import { useState } from "react";

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

export default function FlightUploadForm({ 
  pilots = [] as PilotOption[], 
  lastCounters = { hobbs: null, tach: null } as LastCounters 
}: { 
  pilots?: PilotOption[];
  lastCounters?: LastCounters;
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
  const [cliente, setCliente] = useState<string>("");
  const [copiloto, setCopiloto] = useState<string>("");
  const [detalle, setDetalle] = useState<string>("");

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
      formData.append("cliente", cliente);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="CC-AQI" 
              className="h-[4.664rem] w-auto"
            />
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Flight Log Entry</h1>
              <p className="text-blue-50 text-sm font-medium mt-1">Sistema de Registro de Vuelos CC-AQI</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Main Form */}
        <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl overflow-hidden mb-8">
          {/* Form Header */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-8 py-6 border-b-2 border-blue-200">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Información del Vuelo - CC-AQI</h2>
          </div>

          <div className="p-8">
            {/* Piloto y Fecha */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Pilot Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Piloto al Mando *
                </label>
                {pilots.length > 0 ? (
                  <select
                    value={pilotoId}
                    onChange={(e) => setPilotoId(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
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
                  <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-slate-800">
                    <p className="text-sm font-semibold">No hay pilotos registrados en el directorio.</p>
                  </div>
                )}
              </div>

              {/* Fecha del vuelo */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Fecha del Vuelo *
                </label>
                <input
                  type="date"
                  value={fechaVuelo}
                  onChange={(e) => setFechaVuelo(e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  required
                />
              </div>
            </div>

            {/* Últimos contadores */}
            {(lastCounters.hobbs !== null || lastCounters.tach !== null) && (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-4 mb-6 border-2 border-amber-200">
                <h3 className="text-sm font-bold text-amber-800 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Últimos Contadores Registrados
                </h3>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-600">HOBBS:</span>
                    <span className="font-mono font-bold text-lg text-[#003D82]">
                      {lastCounters.hobbs !== null ? lastCounters.hobbs.toFixed(1) : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-600">TACH:</span>
                    <span className="font-mono font-bold text-lg text-[#003D82]">
                      {lastCounters.tach !== null ? lastCounters.tach.toFixed(1) : "N/A"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-700 mt-2">Los nuevos valores deben ser mayores a estos</p>
              </div>
            )}

            {/* Contadores Section - OBLIGATORIO */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 mb-6 border-2 border-green-300">
              <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Contadores Finales (Obligatorio)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Hobbs Final *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={lastCounters.hobbs !== null ? lastCounters.hobbs + 0.1 : 0}
                    value={hobbsManual}
                    onChange={(e) => setHobbsManual(e.target.value)}
                    placeholder={lastCounters.hobbs !== null ? `Mayor a ${lastCounters.hobbs.toFixed(1)}` : "Ej: 2058.5"}
                    className="w-full px-4 py-3 bg-white border-2 border-green-400 rounded-lg font-mono font-bold text-slate-900 text-lg focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all shadow-sm"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Tach Final *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={lastCounters.tach !== null ? lastCounters.tach + 0.1 : 0}
                    value={tachManual}
                    onChange={(e) => setTachManual(e.target.value)}
                    placeholder={lastCounters.tach !== null ? `Mayor a ${lastCounters.tach.toFixed(1)}` : "Ej: 570.3"}
                    className="w-full px-4 py-3 bg-white border-2 border-green-400 rounded-lg font-mono font-bold text-slate-900 text-lg focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all shadow-sm"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Información adicional */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Información Adicional
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Nombre del cliente (opcional)"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                    Copiloto
                  </label>
                  <input
                    type="text"
                    value={copiloto}
                    onChange={(e) => setCopiloto(e.target.value)}
                    placeholder="Nombre del copiloto (opcional)"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Detalle del Vuelo
                </label>
                <textarea
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Observaciones o detalles adicionales del vuelo (opcional)"
                  rows={3}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-semibold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all shadow-sm resize-none"
                />
              </div>
            </div>

            {/* Image Upload Section - Opcional */}
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Fotos de Medidores (Opcional)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-6 border-2 border-dashed border-blue-300 hover:border-blue-500 transition-all">
                  <div className="text-center mb-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-3">
                      <span className="text-2xl font-bold text-[#003D82]">H</span>
                    </div>
                    <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                      Hobbs Meter
                    </label>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setHobbsImage(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-[#003D82] hover:file:bg-blue-100 cursor-pointer"
                  />
                  {hobbsImage && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs font-semibold text-green-800">✓ {hobbsImage.name}</p>
                      <p className="text-xs text-green-600">{(hobbsImage.size / 1024).toFixed(0)} KB</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl p-6 border-2 border-dashed border-slate-300 hover:border-[#003D82] transition-all">
                  <div className="text-center mb-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-3">
                      <span className="text-2xl font-bold text-[#003D82]">T</span>
                    </div>
                    <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">
                      Tachometer
                    </label>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setTachImage(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-[#003D82] hover:file:bg-blue-100 cursor-pointer"
                  />
                  {tachImage && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs font-semibold text-green-800">✓ {tachImage.name}</p>
                      <p className="text-xs text-green-600">{(tachImage.size / 1024).toFixed(0)} KB</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !pilotoId}
              className="w-full bg-gradient-to-r from-[#003D82] to-[#0A2F5F] hover:from-[#0A2F5F] hover:to-[#003D82] text-white py-4 px-8 rounded-xl font-bold text-lg uppercase tracking-wide shadow-xl hover:shadow-2xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
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
          <div className={`rounded-2xl p-6 mb-8 shadow-lg ${result.success ? "bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300" : "bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300"}`}>
            <div className="flex items-center gap-3 mb-2">
              {result.success ? (
                <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              <h3 className="font-bold text-xl">
                {result.success ? "¡Vuelo Enviado!" : "Error al Enviar"}
              </h3>
            </div>
            <p className="text-slate-700 ml-13 font-medium">
              {result.success 
                ? "Tu vuelo ha sido enviado y está esperando aprobación del administrador. Recibirás una notificación cuando sea procesado."
                : (result.message || result.error)}
            </p>
            {result.submissionId && (
              <p className="text-sm text-slate-600 mt-2 ml-13 font-mono">
                ID de Envío: #{result.submissionId}
              </p>
            )}
          </div>
        )}

        {checkingStatus && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-2xl p-6 mb-8 shadow-lg">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-blue-800 font-bold">Consultando estado...</p>
            </div>
          </div>
        )}

        {/* Status Panel */}
        {status && (
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold uppercase tracking-wide">Estado del Vuelo</h2>
                {getEstadoBadge(status.estado)}
              </div>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-6 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Piloto</p>
                  <p className="text-xl font-bold text-slate-900">{status.piloto.nombre}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Aeronave</p>
                  <p className="text-xl font-bold text-slate-900 font-mono">
                    {status.aircraft.matricula} {status.aircraft.modelo && `(${status.aircraft.modelo})`}
                  </p>
                </div>
              </div>

              {status.images && status.images.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide">Imágenes Enviadas</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {status.images.map((img, idx) => (
                      <div key={idx} className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-lg">
                        <div className={`px-6 py-4 ${img.tipo === "HOBBS" ? "bg-gradient-to-r from-blue-500 to-blue-600" : "bg-gradient-to-r from-indigo-500 to-indigo-600"} text-white`}>
                          <h4 className="font-bold text-lg uppercase tracking-wide">{img.tipo} Meter</h4>
                        </div>
                        <img src={img.imageUrl} alt={img.tipo} className="w-full h-64 object-cover" />
                        <div className="p-6">
                          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <span className="text-sm font-bold text-slate-600 uppercase">Lectura:</span>
                            <span className="text-2xl font-bold text-slate-900 font-mono">
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
                <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 border-2 border-green-300 rounded-2xl p-8 shadow-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-green-900 uppercase tracking-wide">Vuelo Registrado</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-xl p-6 shadow-lg">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tiempo Hobbs</p>
                      <p className="text-4xl font-bold text-blue-600 font-mono">{status.flight.diff_hobbs.toFixed(1)}</p>
                      <p className="text-sm text-slate-600 mt-1">horas</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-lg">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tiempo Tach</p>
                      <p className="text-4xl font-bold text-indigo-600 font-mono">{status.flight.diff_tach.toFixed(1)}</p>
                      <p className="text-sm text-slate-600 mt-1">horas</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 shadow-lg">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Costo Vuelo</p>
                      <p className="text-4xl font-bold text-green-600 font-mono">${status.flight.costo.toLocaleString()}</p>
                      <p className="text-sm text-slate-600 mt-1">total</p>
                    </div>
                  </div>
                </div>
              )}

              {status.errorMessage && (
                <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-300 rounded-2xl p-6 mt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-red-900 text-lg">Error de Procesamiento</p>
                      <p className="text-red-700">{status.errorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              {result?.submissionId && (
                <button
                  onClick={() => checkStatus(result.submissionId!)}
                  className="mt-6 w-full bg-gradient-to-r from-slate-100 to-slate-200 hover:from-slate-200 hover:to-slate-300 text-slate-800 py-4 px-6 rounded-xl font-bold uppercase tracking-wide shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
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
