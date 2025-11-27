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

export default function FlightUploadForm() {
  const [pilotoId, setPilotoId] = useState("2"); // Juan Pérez por defecto
  const [matricula, setMatricula] = useState("CC-AQI");
  const [hobbsImage, setHobbsImage] = useState<File | null>(null);
  const [tachImage, setTachImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hobbsImage || !tachImage) {
      alert("Por favor selecciona ambas imágenes");
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append("pilotoId", pilotoId);
      formData.append("matricula", matricula);
      formData.append("hobbsImage", hobbsImage);
      formData.append("tachImage", tachImage);

      const response = await fetch("/api/upload-flight", {
        method: "POST",
        body: formData,
      });

      const data: UploadResponse = await response.json();
      setResult(data);

      if (data.success && data.submissionId) {
        // Esperar un poco y luego consultar el estado
        setTimeout(() => checkStatus(data.submissionId!), 2000);
      }
    } catch (error) {
      console.error("Error:", error);
      setResult({ success: false, error: "Error al enviar las imágenes" });
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
      PENDIENTE: "bg-yellow-100 text-yellow-800",
      PROCESANDO: "bg-blue-100 text-blue-800",
      REVISION: "bg-orange-100 text-orange-800",
      COMPLETADO: "bg-green-100 text-green-800",
      ERROR: "bg-red-100 text-red-800",
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${styles[estado] || "bg-gray-100 text-gray-800"}`}>
        {estado}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Registrar Vuelo - Sistema OCR</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 mb-6">
        <div className="mb-4">
          <label className="block text-gray-700 font-semibold mb-2">
            Piloto
          </label>
          <select
            value={pilotoId}
            onChange={(e) => setPilotoId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="2">Juan Pérez</option>
            <option value="3">María González</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 font-semibold mb-2">
            Matrícula de Aeronave
          </label>
          <input
            type="text"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="CC-AQI"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Foto del Contador Hobbs
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setHobbsImage(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
            {hobbsImage && (
              <p className="text-sm text-gray-600 mt-1">
                {hobbsImage.name} ({(hobbsImage.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Foto del Contador Tach
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setTachImage(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
            {tachImage && (
              <p className="text-sm text-gray-600 mt-1">
                {tachImage.name} ({(tachImage.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {loading ? "Enviando..." : "Enviar Fotos y Procesar OCR"}
        </button>
      </form>

      {result && (
        <div className={`rounded-lg p-6 mb-6 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <h3 className="font-bold text-lg mb-2">
            {result.success ? "✅ Imágenes Enviadas" : "❌ Error"}
          </h3>
          <p className="text-gray-700">
            {result.message || result.error}
          </p>
          {result.submissionId && (
            <p className="text-sm text-gray-600 mt-2">
              ID de Submission: {result.submissionId}
            </p>
          )}
        </div>
      )}

      {checkingStatus && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800">🔄 Consultando estado del OCR...</p>
        </div>
      )}

      {status && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Estado del Procesamiento</h2>
            {getEstadoBadge(status.estado)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Piloto</p>
              <p className="font-semibold">{status.piloto.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Aeronave</p>
              <p className="font-semibold">
                {status.aircraft.matricula} {status.aircraft.modelo && `(${status.aircraft.modelo})`}
              </p>
            </div>
          </div>

          <h3 className="font-bold text-lg mb-3">Resultados del OCR</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {status.images.map((img, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{img.tipo}</h4>
                  {img.validadoManual && (
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                      Validado Manualmente
                    </span>
                  )}
                </div>
                <img src={img.imageUrl} alt={img.tipo} className="w-full h-48 object-cover rounded mb-2" />
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="text-gray-600">Valor extraído:</span>{" "}
                    <span className="font-semibold">
                      {img.valorExtraido !== null ? img.valorExtraido : "Pendiente"}
                    </span>
                  </p>
                  <p className="text-sm">
                    <span className="text-gray-600">Confianza:</span>{" "}
                    <span className="font-semibold">
                      {img.confianza !== null ? `${img.confianza}%` : "N/A"}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {status.flight && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <h3 className="font-bold text-lg mb-2">✅ Vuelo Registrado</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Horas Hobbs</p>
                  <p className="text-xl font-bold">{status.flight.diff_hobbs.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Horas Tach</p>
                  <p className="text-xl font-bold">{status.flight.diff_tach.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Costo</p>
                  <p className="text-xl font-bold">${status.flight.costo.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {status.errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <p className="text-red-800">
                <strong>Error:</strong> {status.errorMessage}
              </p>
            </div>
          )}

          {result?.submissionId && (
            <button
              onClick={() => checkStatus(result.submissionId!)}
              className="mt-4 w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition"
            >
              🔄 Actualizar Estado
            </button>
          )}
        </div>
      )}
    </div>
  );
}
