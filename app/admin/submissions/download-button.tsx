"use client";
import { useState } from "react";

export default function DownloadDashboardButton() {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch("/api/export/dashboard");
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flight-log-dashboard-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error al descargar dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {loading ? "Exportando..." : "Descargar Dashboard Offline"}
    </button>
  );
}
