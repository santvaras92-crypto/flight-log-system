"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

// Lycoming O-320-D2J limits
const ENGINE_LIMITS = {
  egt_max: 1500,
  cht_redline: 500,
  cht_caution: 400,
  oil_temp_max: 245,
  oil_temp_caution: 220,
  oil_press_max: 115,
  oil_press_min: 25,
  oil_press_normal_min: 55,
  rpm_max: 2700,
  fuel_flow_max: 12.0,
  hp_max: 160,
};

interface FlightSummary {
  id: number;
  flightNumber: number;
  flightDate: string;
  durationSec: number;
  maxEGT: number | null;
  maxCHT: number | null;
  maxOilTemp: number | null;
  minOilPress: number | null;
  avgRPM: number | null;
  avgFF: number | null;
  sourceFile: string | null;
  _count: { readings: number };
}

interface Reading {
  elapsedSec: number;
  timestamp: string;
  egt1: number | null; egt2: number | null; egt3: number | null; egt4: number | null;
  cht1: number | null; cht2: number | null; cht3: number | null; cht4: number | null;
  oilTemp: number | null; oilPress: number | null;
  rpm: number | null; map: number | null; hp: number | null;
  fuelFlow: number | null; fuelUsed: number | null; fuelRem: number | null;
  oat: number | null; volts: number | null; carbTemp: number | null;
}

interface FlightDetail {
  id: number;
  flightNumber: number;
  flightDate: string;
  engineModel: string;
  engineSerial: string;
  readings: Reading[];
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EngineAnalysis() {
  const [flights, setFlights] = useState<FlightSummary[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<FlightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [view, setView] = useState<"list" | "detail">("list");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chart refs
  const egtChartRef = useRef<HTMLCanvasElement>(null);
  const chtChartRef = useRef<HTMLCanvasElement>(null);
  const oilChartRef = useRef<HTMLCanvasElement>(null);
  const powerChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<ChartJS[]>([]);

  // Trend chart refs (fleet overview)
  const trendChtRef = useRef<HTMLCanvasElement>(null);
  const trendOilRef = useRef<HTMLCanvasElement>(null);
  const trendChartInstances = useRef<ChartJS[]>([]);

  // Load flights list
  const loadFlights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/engine-data");
      const data = await res.json();
      setFlights(data.flights || []);
    } catch (err) {
      console.error("Failed to load engine flights:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadFlights(); }, [loadFlights]);

  // Load flight detail
  const loadFlightDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setView("detail");
    try {
      const res = await fetch(`/api/engine-data?flightId=${id}`);
      const data = await res.json();
      setSelectedFlight(data.flight);
    } catch (err) {
      console.error("Failed to load flight detail:", err);
    }
    setLoadingDetail(false);
  }, []);

  // Upload CSV
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/engine-data", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        if (data.source === "jpi") {
          setUploadMsg({ type: "success", text: `✅ JPI: ${data.imported} flight(s) imported, ${data.totalReadings} readings${data.duplicates > 0 ? `, ${data.duplicates} duplicate(s) skipped` : ""}` });
        } else {
          setUploadMsg({ type: "success", text: `✅ Flight #${data.flightNumber} imported — ${data.readingsCount} readings` });
        }
        loadFlights();
      } else {
        setUploadMsg({ type: "error", text: `❌ ${data.error}` });
      }
    } catch (err: any) {
      setUploadMsg({ type: "error", text: `❌ ${err.message}` });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Summary stats for fleet overview
  const fleetStats = useMemo(() => {
    if (flights.length === 0) return null;
    const maxEGTs = flights.map(f => f.maxEGT).filter((v): v is number => v != null);
    const maxCHTs = flights.map(f => f.maxCHT).filter((v): v is number => v != null);
    const maxOilTs = flights.map(f => f.maxOilTemp).filter((v): v is number => v != null);
    const minOilPs = flights.map(f => f.minOilPress).filter((v): v is number => v != null);
    const avgRPMs = flights.map(f => f.avgRPM).filter((v): v is number => v != null);
    const avgFFs = flights.map(f => f.avgFF).filter((v): v is number => v != null);
    const totalHours = flights.reduce((s, f) => s + f.durationSec, 0) / 3600;

    return {
      totalFlights: flights.length,
      totalHours: totalHours.toFixed(1),
      avgMaxEGT: maxEGTs.length > 0 ? (maxEGTs.reduce((a, b) => a + b, 0) / maxEGTs.length).toFixed(0) : "—",
      peakEGT: maxEGTs.length > 0 ? Math.max(...maxEGTs).toFixed(0) : "—",
      avgMaxCHT: maxCHTs.length > 0 ? (maxCHTs.reduce((a, b) => a + b, 0) / maxCHTs.length).toFixed(0) : "—",
      peakCHT: maxCHTs.length > 0 ? Math.max(...maxCHTs).toFixed(0) : "—",
      avgOilTemp: maxOilTs.length > 0 ? (maxOilTs.reduce((a, b) => a + b, 0) / maxOilTs.length).toFixed(0) : "—",
      lowestOilPress: minOilPs.length > 0 ? Math.min(...minOilPs).toFixed(0) : "—",
      avgRPM: avgRPMs.length > 0 ? (avgRPMs.reduce((a, b) => a + b, 0) / avgRPMs.length).toFixed(0) : "—",
      avgFF: avgFFs.length > 0 ? (avgFFs.reduce((a, b) => a + b, 0) / avgFFs.length).toFixed(1) : "—",
      chtExceedances: maxCHTs.filter(v => v >= ENGINE_LIMITS.cht_redline).length,
      oilTempExceedances: maxOilTs.filter(v => v >= ENGINE_LIMITS.oil_temp_max).length,
    };
  }, [flights]);

  // ============ CHARTS (Detail View) ============
  useEffect(() => {
    // Cleanup old charts
    chartInstances.current.forEach(c => c.destroy());
    chartInstances.current = [];

    if (!selectedFlight || selectedFlight.readings.length === 0) return;

    const readings = selectedFlight.readings;
    const labels = readings.map(r => {
      const min = Math.floor(r.elapsedSec / 60);
      const sec = r.elapsedSec % 60;
      return `${min}:${sec.toString().padStart(2, "0")}`;
    });

    // Downsample if too many points (keep every Nth)
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
  }, [selectedFlight]);

  // ============ TREND CHARTS (Fleet Overview) ============
  useEffect(() => {
    trendChartInstances.current.forEach(c => c.destroy());
    trendChartInstances.current = [];

    if (flights.length < 2) return;

    // Sort flights chronologically for trends
    const sorted = [...flights].sort((a, b) => new Date(a.flightDate).getTime() - new Date(b.flightDate).getTime());
    const trendLabels = sorted.map(f => new Date(f.flightDate).toLocaleDateString("es-CL", { month: "short", year: "2-digit" }));

    const trendOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 } as const,
      interaction: { mode: "index" as const, intersect: false },
      plugins: { legend: { position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 10 } } } },
      scales: { x: { ticks: { maxTicksLimit: 15, font: { size: 9 } }, grid: { display: false } } },
      elements: { point: { radius: 1.5 }, line: { borderWidth: 1.5 } },
    };

    // --- CHT Trend ---
    if (trendChtRef.current) {
      const ctx = trendChtRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: trendLabels,
          datasets: [
            { label: "Max CHT", data: sorted.map(f => f.maxCHT), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", fill: true },
            { label: "Max EGT", data: sorted.map(f => f.maxEGT), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.05)", fill: false },
          ],
        },
        options: {
          ...trendOptions,
          plugins: {
            ...trendOptions.plugins,
            title: { display: true, text: "Temperature Trend — Max EGT & CHT per Flight", font: { size: 12, weight: "bold" as const }, color: "#334155" },
            annotation: {
              annotations: {
                chtLine: { type: "line" as const, yMin: ENGINE_LIMITS.cht_redline, yMax: ENGINE_LIMITS.cht_redline, borderColor: "rgba(239,68,68,0.4)", borderWidth: 1.5, borderDash: [4, 4] },
              },
            },
          },
          scales: { ...trendOptions.scales, y: { title: { display: true, text: "°F" } } },
        },
      });
      trendChartInstances.current.push(chart);
    }

    // --- Oil Trend ---
    if (trendOilRef.current) {
      const ctx = trendOilRef.current.getContext("2d")!;
      const chart = new ChartJS(ctx, {
        type: "line",
        data: {
          labels: trendLabels,
          datasets: [
            { label: "Max Oil Temp", data: sorted.map(f => f.maxOilTemp), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.1)", fill: true },
            { label: "Min Oil Press", data: sorted.map(f => f.minOilPress), borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.1)", fill: true },
          ],
        },
        options: {
          ...trendOptions,
          plugins: {
            ...trendOptions.plugins,
            title: { display: true, text: "Oil Health Trend — Max Temp & Min Press per Flight", font: { size: 12, weight: "bold" as const }, color: "#334155" },
            annotation: {
              annotations: {
                oilMax: { type: "line" as const, yMin: ENGINE_LIMITS.oil_temp_max, yMax: ENGINE_LIMITS.oil_temp_max, borderColor: "rgba(239,68,68,0.4)", borderWidth: 1.5, borderDash: [4, 4] },
              },
            },
          },
          scales: { ...trendOptions.scales, y: { title: { display: true, text: "°F / PSI" } } },
        },
      });
      trendChartInstances.current.push(chart);
    }

    return () => { trendChartInstances.current.forEach(c => c.destroy()); trendChartInstances.current = []; };
  }, [flights, view]);

  // ============ COMPUTED STATS FOR DETAIL ============
  const detailStats = useMemo(() => {
    if (!selectedFlight || selectedFlight.readings.length === 0) return null;
    const r = selectedFlight.readings;
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

    // EGT spread: max difference between cylinders at same timestamp
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
  }, [selectedFlight]);

  // ============ RENDER ============
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
        <span className="ml-3 text-slate-500">Loading engine data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            🔧 Engine Monitor — JPI EDM-830
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lycoming O-320-D2J · S/N RL-7662-39E · CC-AQI
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "detail" && (
            <button
              onClick={() => { setView("list"); setSelectedFlight(null); }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
            >
              ← Back to Fleet
            </button>
          )}
          <label className="relative cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.jpi,.JPI,application/octet-stream,text/csv,*/*"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${uploading ? "bg-slate-200 text-slate-400" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
              {uploading ? (
                <><span className="animate-spin">⏳</span> Uploading...</>
              ) : (
                <>📤 Upload CSV/JPI</>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Upload message */}
      {uploadMsg && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${uploadMsg.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {uploadMsg.text}
        </div>
      )}

      {/* ============ LIST VIEW ============ */}
      {view === "list" && (
        <>
          {/* Fleet Stats Cards */}
          {fleetStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {[
                { label: "Total Flights", value: fleetStats.totalFlights, icon: "✈️" },
                { label: "Monitor Hours", value: `${fleetStats.totalHours}h`, icon: "⏱️" },
                { label: "Avg Max CHT", value: `${fleetStats.avgMaxCHT}°F`, icon: "🌡️", warn: Number(fleetStats.avgMaxCHT) >= ENGINE_LIMITS.cht_caution },
                { label: "Peak EGT", value: `${fleetStats.peakEGT}°F`, icon: "🔥" },
                { label: "Avg Oil Temp", value: `${fleetStats.avgOilTemp}°F`, icon: "🛢️" },
                { label: "CHT Exceedances", value: fleetStats.chtExceedances, icon: "⚠️", warn: fleetStats.chtExceedances > 0 },
              ].map((s, i) => (
                <div key={i} className={`rounded-xl p-3 border ${s.warn ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
                  <div className="text-xs text-slate-500">{s.icon} {s.label}</div>
                  <div className={`text-lg font-bold mt-0.5 ${s.warn ? "text-red-600" : "text-slate-800"}`}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trend Charts */}
          {flights.length >= 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 250 }}>
                <canvas ref={trendChtRef}></canvas>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ height: 250 }}>
                <canvas ref={trendOilRef}></canvas>
              </div>
            </div>
          )}

          {/* Flights Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-700">Flight Log — {flights.length} recorded flights</h3>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {["#", "Date", "Duration", "Max EGT", "Max CHT", "Oil T", "Oil P", "Avg RPM", "Avg FF", "Pts"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flights.map(f => {
                    const chtWarn = f.maxCHT != null && f.maxCHT >= ENGINE_LIMITS.cht_caution;
                    const chtDanger = f.maxCHT != null && f.maxCHT >= ENGINE_LIMITS.cht_redline;
                    const oilWarn = f.maxOilTemp != null && f.maxOilTemp >= ENGINE_LIMITS.oil_temp_max;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => loadFlightDetail(f.id)}
                        className="border-t border-slate-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 font-mono text-slate-500">{f.flightNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(f.flightDate)}</td>
                        <td className="px-3 py-2">{formatDuration(f.durationSec)}</td>
                        <td className="px-3 py-2 font-mono">{f.maxEGT?.toFixed(0) || "—"}</td>
                        <td className={`px-3 py-2 font-mono font-semibold ${chtDanger ? "text-red-600" : chtWarn ? "text-amber-600" : ""}`}>
                          {f.maxCHT?.toFixed(0) || "—"}
                        </td>
                        <td className={`px-3 py-2 font-mono ${oilWarn ? "text-red-600 font-semibold" : ""}`}>{f.maxOilTemp?.toFixed(0) || "—"}</td>
                        <td className="px-3 py-2 font-mono">{f.minOilPress?.toFixed(0) || "—"}</td>
                        <td className="px-3 py-2 font-mono">{f.avgRPM?.toFixed(0) || "—"}</td>
                        <td className="px-3 py-2 font-mono">{f.avgFF?.toFixed(1) || "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{f._count.readings}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {flights.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📊</div>
              <p>No engine data yet. Upload a JPI EDM-830 CSV file to get started.</p>
            </div>
          )}
        </>
      )}

      {/* ============ DETAIL VIEW ============ */}
      {view === "detail" && (
        <>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
              <span className="ml-3 text-slate-500">Loading flight data...</span>
            </div>
          ) : selectedFlight && (
            <>
              {/* Flight Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      Flight #{selectedFlight.flightNumber} — {formatDate(selectedFlight.flightDate)}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedFlight.engineModel} · S/N {selectedFlight.engineSerial} · {selectedFlight.readings.length} data points
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

              {/* Per-Cylinder Summary Table */}
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
                          <th className="px-3 py-1.5 text-left font-semibold text-slate-600">CHT &gt;500°F</th>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
