"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, annotationPlugin);

const FlightMap = dynamic(() => import("@/app/components/FlightMap"), {
  ssr: false,
  loading: () => <div className="h-[350px] bg-slate-50 rounded-xl border border-slate-200 animate-pulse" />,
});

// Lycoming O-320-D2J limits
const ENGINE_LIMITS = {
  egt_max: 1500,
  cht_redline: 430,
  cht_caution: 400,
  oil_temp_max: 245,
  oil_temp_caution: 220,
  oil_press_max: 115,
  oil_press_min: 25,
  oil_press_normal_min: 55,
  rpm_max: 2700,
  fuel_flow_max: 12.0,
};

interface Reading {
  elapsedSec: number;
  timestamp: string;
  egt1: number | null; egt2: number | null; egt3: number | null; egt4: number | null;
  cht1: number | null; cht2: number | null; cht3: number | null; cht4: number | null;
  oilTemp: number | null; oilPress: number | null;
  rpm: number | null; map: number | null; hp: number | null;
  fuelFlow: number | null; fuelUsed: number | null; fuelRem: number | null;
  oat: number | null; volts: number | null; carbTemp: number | null;
  latitude: number | null; longitude: number | null;
  gpsAlt: number | null; groundSpd: number | null;
}

interface FlightDetail {
  id: number;
  flightNumber: number;
  flightDate: string;
  durationSec: number;
  engineModel: string;
  engineSerial: string;
  maxEGT: number | null;
  maxCHT: number | null;
  maxOilTemp: number | null;
  minOilPress: number | null;
  avgRPM: number | null;
  avgFF: number | null;
  readings: Reading[];
  linkedFlight?: {
    id: number;
    fecha: string;
    diffHobbs: number | null;
    diffTach: number | null;
    costo: number | null;
    piloto: string | null;
    copiloto: string | null;
    cliente: string | null;
    instructor: string | null;
    detalle: string | null;
    aerodromoSalida: string | null;
    aerodromoDestino: string | null;
  } | null;
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PilotEngineDetail({
  engineFlightId,
  onClose,
}: {
  engineFlightId: number;
  onClose: () => void;
}) {
  const [flight, setFlight] = useState<FlightDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Chart refs
  const egtChartRef = useRef<HTMLCanvasElement>(null);
  const chtChartRef = useRef<HTMLCanvasElement>(null);
  const oilChartRef = useRef<HTMLCanvasElement>(null);
  const powerChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<ChartJS[]>([]);

  // Fetch full flight detail
  useEffect(() => {
    setLoading(true);
    fetch(`/api/engine-data?flightId=${engineFlightId}`)
      .then(r => r.json())
      .then(d => setFlight(d.flight))
      .catch(() => setFlight(null))
      .finally(() => setLoading(false));
  }, [engineFlightId]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ============ COMPUTED STATS ============
  const detailStats = useMemo(() => {
    if (!flight || flight.readings.length === 0) return null;
    const r = flight.readings;
    const val = (arr: (number | null)[]) => arr.filter((v): v is number => v != null && v > 0);

    const egt1 = val(r.map(x => x.egt1)), egt2 = val(r.map(x => x.egt2));
    const egt3 = val(r.map(x => x.egt3)), egt4 = val(r.map(x => x.egt4));
    const cht1 = val(r.map(x => x.cht1)), cht2 = val(r.map(x => x.cht2));
    const cht3 = val(r.map(x => x.cht3)), cht4 = val(r.map(x => x.cht4));
    const oilT = val(r.map(x => x.oilTemp)), oilP = val(r.map(x => x.oilPress));
    const rpms = val(r.map(x => x.rpm)), ffs = val(r.map(x => x.fuelFlow));

    const avg = (a: number[]) => a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const max = (a: number[]) => a.length > 0 ? Math.max(...a) : 0;
    const min = (a: number[]) => a.length > 0 ? Math.min(...a) : 0;

    // EGT spread
    const egtSpreads = r.map(x => {
      const vals = [x.egt1, x.egt2, x.egt3, x.egt4].filter((v): v is number => v != null && v > 100);
      if (vals.length < 2) return 0;
      return Math.max(...vals) - Math.min(...vals);
    });
    const maxEGTSpread = Math.max(...egtSpreads);
    const avgEGTSpread = avg(egtSpreads.filter(v => v > 0));

    return {
      egt: {
        maxPerCyl: [max(egt1), max(egt2), max(egt3), max(egt4)],
        avgPerCyl: [avg(egt1), avg(egt2), avg(egt3), avg(egt4)],
        maxSpread: maxEGTSpread,
        avgSpread: avgEGTSpread,
      },
      cht: {
        maxPerCyl: [max(cht1), max(cht2), max(cht3), max(cht4)],
        avgPerCyl: [avg(cht1), avg(cht2), avg(cht3), avg(cht4)],
        exceedances: [cht1, cht2, cht3, cht4].map(c => c.filter(v => v >= ENGINE_LIMITS.cht_redline).length),
      },
      oil: {
        maxTemp: max(oilT), avgTemp: avg(oilT),
        minPress: min(oilP), avgPress: avg(oilP),
      },
      power: {
        maxRPM: max(rpms), avgRPM: avg(rpms),
        avgFF: avg(ffs), maxFF: max(ffs),
      },
    };
  }, [flight]);

  // ============ CHARTS ============
  useEffect(() => {
    chartInstances.current.forEach(c => c.destroy());
    chartInstances.current = [];

    if (!flight || flight.readings.length === 0) return;

    const readings = flight.readings;
    const labels = readings.map(r => {
      const min = Math.floor(r.elapsedSec / 60);
      const sec = r.elapsedSec % 60;
      return `${min}:${sec.toString().padStart(2, "0")}`;
    });

    const MAX_POINTS = 300;
    const step = readings.length > MAX_POINTS ? Math.ceil(readings.length / MAX_POINTS) : 1;
    const dsLabels = labels.filter((_, i) => i % step === 0);
    const ds = (arr: (number | null)[]) => arr.filter((_, i) => i % step === 0);

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 } as const,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
      },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } },
    };

    // --- EGT Chart ---
    if (egtChartRef.current) {
      const ctx = egtChartRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: dsLabels,
          datasets: [
            { label: "EGT 1", data: ds(readings.map(r => r.egt1)), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)" },
            { label: "EGT 2", data: ds(readings.map(r => r.egt2)), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.1)" },
            { label: "EGT 3", data: ds(readings.map(r => r.egt3)), borderColor: "#eab308", backgroundColor: "rgba(234,179,8,0.1)" },
            { label: "EGT 4", data: ds(readings.map(r => r.egt4)), borderColor: "#84cc16", backgroundColor: "rgba(132,204,22,0.1)" },
          ],
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: "Exhaust Gas Temperature (EGT) — °F", font: { size: 13, weight: "bold" as const }, color: "#334155" },
            annotation: {
              annotations: {
                egtMax: { type: "line" as const, yMin: ENGINE_LIMITS.egt_max, yMax: ENGINE_LIMITS.egt_max, borderColor: "rgba(239,68,68,0.6)", borderWidth: 2, borderDash: [6, 3], label: { display: true, content: `MAX ${ENGINE_LIMITS.egt_max}°F`, position: "start" as const, font: { size: 10 }, backgroundColor: "rgba(239,68,68,0.8)" } },
              },
            },
          },
          scales: { ...commonOptions.scales, y: { title: { display: true, text: "°F" }, min: 200 } },
        },
      });
      chartInstances.current.push(chart);
    }

    // --- CHT Chart ---
    if (chtChartRef.current) {
      const ctx = chtChartRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: dsLabels,
          datasets: [
            { label: "CHT 1", data: ds(readings.map(r => r.cht1)), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)" },
            { label: "CHT 2", data: ds(readings.map(r => r.cht2)), borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.1)" },
            { label: "CHT 3", data: ds(readings.map(r => r.cht3)), borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.1)" },
            { label: "CHT 4", data: ds(readings.map(r => r.cht4)), borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,0.1)" },
          ],
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: "Cylinder Head Temperature (CHT) — °F", font: { size: 13, weight: "bold" as const }, color: "#334155" },
            annotation: {
              annotations: {
                chtRedline: { type: "line" as const, yMin: ENGINE_LIMITS.cht_redline, yMax: ENGINE_LIMITS.cht_redline, borderColor: "rgba(239,68,68,0.7)", borderWidth: 2, borderDash: [6, 3], label: { display: true, content: `REDLINE ${ENGINE_LIMITS.cht_redline}°F`, position: "start" as const, font: { size: 10 }, backgroundColor: "rgba(239,68,68,0.8)" } },
                chtCaution: { type: "line" as const, yMin: ENGINE_LIMITS.cht_caution, yMax: ENGINE_LIMITS.cht_caution, borderColor: "rgba(234,179,8,0.5)", borderWidth: 1.5, borderDash: [4, 4], label: { display: true, content: `CAUTION ${ENGINE_LIMITS.cht_caution}°F`, position: "end" as const, font: { size: 9 }, backgroundColor: "rgba(234,179,8,0.7)" } },
              },
            },
          },
          scales: { ...commonOptions.scales, y: { title: { display: true, text: "°F" }, min: 50 } },
        },
      });
      chartInstances.current.push(chart);
    }

    // --- Oil Chart (dual axis) ---
    if (oilChartRef.current) {
      const ctx = oilChartRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: dsLabels,
          datasets: [
            { label: "Oil Temp °F", data: ds(readings.map(r => r.oilTemp)), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.1)", yAxisID: "y" },
            { label: "Oil Press PSI", data: ds(readings.map(r => r.oilPress)), borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.1)", yAxisID: "y1" },
          ],
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: "Oil Temperature & Pressure", font: { size: 13, weight: "bold" as const }, color: "#334155" },
            annotation: {
              annotations: {
                oilTMax: { type: "line" as const, yMin: ENGINE_LIMITS.oil_temp_max, yMax: ENGINE_LIMITS.oil_temp_max, borderColor: "rgba(239,68,68,0.5)", borderWidth: 1.5, borderDash: [6, 3], yScaleID: "y", label: { display: true, content: `MAX ${ENGINE_LIMITS.oil_temp_max}°F`, position: "start" as const, font: { size: 9 }, backgroundColor: "rgba(239,68,68,0.7)" } },
                oilPMin: { type: "line" as const, yMin: ENGINE_LIMITS.oil_press_min, yMax: ENGINE_LIMITS.oil_press_min, borderColor: "rgba(239,68,68,0.5)", borderWidth: 1.5, borderDash: [6, 3], yScaleID: "y1", label: { display: true, content: `MIN ${ENGINE_LIMITS.oil_press_min} PSI`, position: "end" as const, font: { size: 9 }, backgroundColor: "rgba(239,68,68,0.7)" } },
              },
            },
          },
          scales: {
            ...commonOptions.scales,
            y: { position: "left" as const, title: { display: true, text: "Temp °F" }, min: 50 },
            y1: { position: "right" as const, title: { display: true, text: "Press PSI" }, min: 0, max: 130, grid: { drawOnChartArea: false } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    // --- Power Chart (RPM, MAP, FF) ---
    if (powerChartRef.current) {
      const ctx = powerChartRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: dsLabels,
          datasets: [
            { label: "RPM", data: ds(readings.map(r => r.rpm)), borderColor: "#6366f1", backgroundColor: "rgba(99,102,241,0.1)", yAxisID: "y" },
            { label: "MAP inHg", data: ds(readings.map(r => r.map)), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", yAxisID: "y1" },
            { label: "FF GPH", data: ds(readings.map(r => r.fuelFlow)), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", yAxisID: "y2" },
          ],
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: "Power — RPM / MAP / Fuel Flow", font: { size: 13, weight: "bold" as const }, color: "#334155" },
          },
          scales: {
            ...commonOptions.scales,
            y: { position: "left" as const, title: { display: true, text: "RPM" }, min: 0 },
            y1: { position: "right" as const, title: { display: true, text: "MAP inHg" }, min: 10, max: 30, grid: { drawOnChartArea: false } },
            y2: { position: "right" as const, title: { display: true, text: "FF GPH" }, min: 0, max: 14, grid: { drawOnChartArea: false }, ticks: { display: false } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    return () => { chartInstances.current.forEach(c => c.destroy()); chartInstances.current = []; };
  }, [flight]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-5xl mx-4 my-6 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              🔧 Engine Monitor — JPI EDM-830
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Lycoming O-320-D2J · S/N RL-7662-39E · CC-AQI
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Cerrar (Esc)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
              <span className="ml-3 text-slate-500">Cargando datos del motor...</span>
            </div>
          ) : !flight ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">⚠️</div>
              <p>No se pudieron cargar los datos del motor.</p>
            </div>
          ) : (
            <>
              {/* Flight Header Stats */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      Flight #{flight.flightNumber} — {formatDate(flight.flightDate)}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {flight.engineModel || "O-320-D2J"} · S/N {flight.engineSerial || "RL-7662-39E"} · {flight.readings.length} data points
                    </p>
                  </div>
                  {detailStats && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                        <span className="text-slate-500">EGT Spread</span>
                        <span className="ml-1 font-bold text-slate-700">{detailStats.egt.maxSpread.toFixed(0)}°F max / {detailStats.egt.avgSpread.toFixed(0)}°F avg</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                        <span className="text-slate-500">Oil</span>
                        <span className="ml-1 font-bold text-slate-700">{detailStats.oil.maxTemp.toFixed(0)}°F / {detailStats.oil.minPress.toFixed(0)} PSI</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                        <span className="text-slate-500">Avg RPM</span>
                        <span className="ml-1 font-bold text-slate-700">{detailStats.power.avgRPM.toFixed(0)}</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                        <span className="text-slate-500">Avg FF</span>
                        <span className="ml-1 font-bold text-slate-700">{detailStats.power.avgFF.toFixed(1)} GPH</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Flight Info */}
              {flight.linkedFlight && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-3">
                  <div className="flex flex-wrap gap-3 items-center text-xs">
                    <span className="font-bold text-blue-700 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                      Flight Log #{flight.linkedFlight.id}
                    </span>
                    {flight.linkedFlight.piloto && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-slate-700">✈ {flight.linkedFlight.piloto}</span>
                    )}
                    {flight.linkedFlight.copiloto && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-slate-600">+{flight.linkedFlight.copiloto}</span>
                    )}
                    {flight.linkedFlight.diffHobbs != null && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-slate-700 font-mono">{flight.linkedFlight.diffHobbs.toFixed(1)}h hobbs</span>
                    )}
                    {flight.linkedFlight.costo != null && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-green-700 font-mono">${flight.linkedFlight.costo.toLocaleString('es-CL')}</span>
                    )}
                    {(flight.linkedFlight.aerodromoSalida || flight.linkedFlight.aerodromoDestino) && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-slate-600">
                        {flight.linkedFlight.aerodromoSalida || '?'} → {flight.linkedFlight.aerodromoDestino || '?'}
                      </span>
                    )}
                    {flight.linkedFlight.detalle && (
                      <span className="bg-white/80 rounded-md px-2 py-0.5 text-slate-500 italic truncate max-w-[250px]" title={flight.linkedFlight.detalle}>
                        {flight.linkedFlight.detalle}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Per-Cylinder Analysis Table */}
              {detailStats && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
                    <h4 className="text-xs font-semibold text-slate-600">Per-Cylinder Analysis</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Cyl</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Max EGT</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Avg EGT</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Max CHT</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">Avg CHT</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">CHT &gt;{ENGINE_LIMITS.cht_redline}°F</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0, 1, 2, 3].map(i => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 font-bold text-slate-700">#{i + 1}</td>
                            <td className="px-3 py-1.5 font-mono">{detailStats.egt.maxPerCyl[i].toFixed(0)}°F</td>
                            <td className="px-3 py-1.5 font-mono text-slate-500">{detailStats.egt.avgPerCyl[i].toFixed(0)}°F</td>
                            <td className={`px-3 py-1.5 font-mono font-semibold ${detailStats.cht.maxPerCyl[i] >= ENGINE_LIMITS.cht_redline ? "text-red-600" : detailStats.cht.maxPerCyl[i] >= ENGINE_LIMITS.cht_caution ? "text-amber-600" : ""}`}>
                              {detailStats.cht.maxPerCyl[i].toFixed(0)}°F
                            </td>
                            <td className="px-3 py-1.5 font-mono text-slate-500">{detailStats.cht.avgPerCyl[i].toFixed(0)}°F</td>
                            <td className={`px-3 py-1.5 font-mono ${detailStats.cht.exceedances[i] > 0 ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                              {detailStats.cht.exceedances[i]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4 Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 300 }}>
                  <canvas ref={egtChartRef}></canvas>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 300 }}>
                  <canvas ref={chtChartRef}></canvas>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 300 }}>
                  <canvas ref={oilChartRef}></canvas>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 300 }}>
                  <canvas ref={powerChartRef}></canvas>
                </div>
              </div>

              {/* GPS Flight Track Map */}
              {flight.readings.some(r => r.latitude != null && r.longitude != null) && (
                <div>
                  <FlightMap
                    points={flight.readings
                      .filter(r => r.latitude != null && r.longitude != null)
                      .map(r => ({
                        lat: r.latitude!,
                        lng: r.longitude!,
                        alt: r.gpsAlt ?? undefined,
                        spd: r.groundSpd ?? undefined,
                        elapsed: r.elapsedSec,
                      }))}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
