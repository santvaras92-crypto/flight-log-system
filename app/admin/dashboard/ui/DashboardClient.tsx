"use client";
import { useMemo, useState } from "react";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler } from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler);

type InitialData = {
  users: any[];
  aircraft: any[];
  flights: any[];
  submissions: any[];
  components: any[];
  transactions: any[];
};

export default function DashboardClient({ initialData }: { initialData: InitialData }) {
  const [tab, setTab] = useState("overview");
  const [filterAircraft, setFilterAircraft] = useState("");
  const [filterPilot, setFilterPilot] = useState("");
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('dash-theme') || 'light';
  });
  useEffect(() => { localStorage.setItem('dash-theme', theme); }, [theme]);

  const flights = useMemo(() => {
    return initialData.flights.filter(f =>
      (!filterAircraft || f.aircraftId.toLowerCase().includes(filterAircraft.toLowerCase()))
    );
  }, [initialData.flights, filterAircraft]);

  const submissions = useMemo(() => {
    return initialData.submissions.filter(s => {
      const u = initialData.users.find(u => u.id === s.pilotoId);
      return (!filterPilot || (u?.nombre || "").toLowerCase().includes(filterPilot.toLowerCase()));
    });
  }, [initialData.submissions, initialData.users, filterPilot]);

  const palette = theme === 'dark'
    ? { bg: 'bg-slate-900', card: 'bg-slate-800/80 backdrop-blur-sm', text: 'text-slate-100', subtext: 'text-slate-400', border: 'border-slate-700/50', accent: '#60a5fa', accent2: '#34d399', grid: 'rgba(148,163,184,0.2)', shadow: 'shadow-xl shadow-slate-900/10' }
    : { bg: 'bg-gradient-to-br from-indigo-50 via-white to-emerald-50', card: 'bg-white/90 backdrop-blur-sm', text: 'text-slate-900', subtext: 'text-slate-600', border: 'border-slate-200/60', accent: '#4f46e5', accent2: '#10b981', grid: 'rgba(100,116,139,0.15)', shadow: 'shadow-xl shadow-indigo-500/5' };

  return (
    <div className="bg-gradient-indigo-emerald min-h-screen w-full -mx-6 -my-8 px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gradient-indigo-emerald tracking-tight">Dashboard Operacional</h1>
          <p className="mt-1 text-slate-400 text-sm">Vuelos, pilotos, mantenimiento y finanzas.</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={filterAircraft} onChange={e=>setFilterAircraft(e.target.value)} placeholder="Filtrar aeronave" className="input-elegant px-4 py-2.5 text-sm" />
          <input value={filterPilot} onChange={e=>setFilterPilot(e.target.value)} placeholder="Filtrar piloto" className="input-elegant px-4 py-2.5 text-sm" />
          <button className="px-4 py-2.5 rounded-xl btn-gradient-indigo text-white hover:opacity-90 transition-all font-medium" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
            {theme==='dark'?'☀️ Claro':'🌙 Oscuro'}
          </button>
        </div>
      </header>

      <nav className="mb-6 flex gap-2">
        {[
          { id: "overview", label: "Resumen" },
          { id: "flights", label: "Vuelos" },
          { id: "pilots", label: "Pilotos" },
          { id: "maintenance", label: "Mantenimiento" },
          { id: "finance", label: "Finanzas" },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`tab-elegant ${tab===t.id ? 'active' : 'hover:border-slate-500'}`}>{t.label}</button>
        ))}
      </nav>

      {tab === "overview" && <Overview data={initialData} flights={flights} palette={palette} />}
      {tab === "flights" && <FlightsTable flights={flights} users={initialData.users} />}
      {tab === "pilots" && <PilotsTable users={initialData.users} flights={initialData.flights} transactions={initialData.transactions} />}
      {tab === "maintenance" && <MaintenanceTable components={initialData.components} aircraft={initialData.aircraft} />}
      {tab === "finance" && <FinanceCharts flights={initialData.flights} transactions={initialData.transactions} palette={palette} />}
    </div>
  );
}

function Overview({ data, flights, palette }: { data: InitialData; flights: any[]; palette: any }) {
  const hoursByDay = useMemo(() => {
    const map: Record<string, number> = {};
    flights.slice().reverse().forEach(f => {
      const day = new Date(f.fecha).toISOString().slice(0,10);
      map[day] = (map[day] || 0) + Number(f.diff_hobbs);
    });
    const labels = Object.keys(map).sort();
    const values = labels.map(l => map[l]);
    return { labels, values };
  }, [flights]);

  const totalHours = data.flights.reduce((a,b)=>a+Number(b.diff_hobbs),0);
  const totalRevenue = data.flights.reduce((a,b)=>a+Number(b.costo||0),0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="Total Vuelos" value={data.flights.length} accent="#3b82f6" palette={palette} />
        <StatCard title="Horas Hobbs" value={totalHours.toFixed(1)} accent="#10b981" palette={palette} />
        <StatCard title="Pilotos activos" value={data.users.filter(u=>u.rol==='PILOTO').length} accent="#f59e0b" palette={palette} />
        <StatCard title="Ingresos" value={`$${Number(totalRevenue).toLocaleString('es-CL')}`} accent="#ef4444" palette={palette} />
      </div>
      <div className="card-elegant p-6">
        <h3 className="font-bold text-lg mb-4 text-slate-200">Horas por día</h3>
        <LineChart labels={hoursByDay.labels} values={hoursByDay.values} palette={palette} />
      </div>
    </div>
  );
}

function StatCard({ title, value, accent, palette }: { title: string; value: string | number; accent: string; palette: any }) {
  return (
    <div className="stat-card group">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wide">{title}</p>
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 12px ${accent}88` }} />
        </div>
        <p className="text-3xl font-bold text-slate-100 tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function LineChart({ labels, values, palette }: { labels: string[]; values: number[]; palette: any }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, `${palette.accent}33`);
    gradient.addColorStop(1, `${palette.accent}00`);
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ label: "Horas", data: values, borderColor: palette.accent, backgroundColor: gradient, tension: 0.35, pointRadius: 2, fill: true }],
      },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#fff', bodyColor: '#e2e8f0' } }, scales: { x: { grid: { color: palette.grid } }, y: { grid: { color: palette.grid } } } },
    });
    return () => chart.destroy();
  }, [labels, values]);
  return <canvas ref={ref} height={120} />;
}

function FlightsTable({ flights, users }: { flights: any[]; users: any[] }) {
  return (
    <div className="table-elegant">
      <table className="min-w-full">
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Piloto</th>
            <th>Aeronave</th>
            <th>Δ Hobbs</th>
            <th>Δ Tach</th>
            <th>Costo</th>
          </tr>
        </thead>
        <tbody>
          {flights.map(f => {
            const u = users.find(u => u.id === f.pilotoId);
            return (
              <tr key={f.id}>
                <td className="font-medium text-slate-300">#{f.id}</td>
                <td className="text-slate-400">{new Date(f.fecha).toLocaleString("es-CL")}</td>
                <td className="text-slate-300">{u?.nombre || "N/A"}</td>
                <td className="font-semibold text-blue-400">{f.aircraftId}</td>
                <td className="text-slate-400">{Number(f.diff_hobbs).toFixed(1)} hrs</td>
                <td className="text-slate-400">{Number(f.diff_tach).toFixed(1)} hrs</td>
                <td className="font-semibold text-emerald-400">${Number(f.costo).toLocaleString("es-CL")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PilotsTable({ users, flights, transactions }: { users: any[]; flights: any[]; transactions: any[] }) {
  const data = users.filter(u=>u.rol==='PILOTO').map(u => {
    const f = flights.filter(f => f.pilotoId === u.id);
    const spent = transactions.filter(t => t.userId === u.id && t.tipo === 'CARGO_VUELO').reduce((a,b)=>a+Number(b.monto),0);
    const deposits = transactions.filter(t => t.userId === u.id && t.tipo === 'ABONO').reduce((a,b)=>a+Number(b.monto),0);
    return { ...u, flights: f.length, hours: f.reduce((a,b)=>a+Number(b.diff_hobbs),0), spent: spent, deposits: deposits };
  });
  return (
    <div className="table-elegant">
      <table className="min-w-full">
        <thead>
          <tr>
            <th>Código</th>
            <th>Piloto</th>
            <th>Vuelos</th>
            <th>Horas</th>
            <th>Tarifa/Hora</th>
            <th>Saldo</th>
            <th>Gasto total</th>
            <th>Abonos</th>
          </tr>
        </thead>
        <tbody>
          {data.map(p => (
            <tr key={p.id}>
              <td className="font-semibold text-blue-400">{p.codigo || '-'}</td>
              <td className="font-medium text-slate-200">{p.nombre}</td>
              <td className="text-slate-400">{p.flights}</td>
              <td className="text-slate-400">{p.hours.toFixed(1)} hrs</td>
              <td className="text-slate-400">${Number(p.tarifa_hora).toLocaleString("es-CL")}</td>
              <td className="font-semibold text-emerald-400">${Number(p.saldo_cuenta).toLocaleString("es-CL")}</td>
              <td className="text-slate-400">${Number(-p.spent).toLocaleString("es-CL")}</td>
              <td className="text-slate-400">${Number(p.deposits).toLocaleString("es-CL")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaintenanceTable({ components, aircraft }: { components: any[]; aircraft: any[] }) {
  return (
    <div className="table-elegant">
      <table className="min-w-full">
        <thead>
          <tr>
            <th>Aeronave</th>
            <th>Tipo</th>
            <th>Horas</th>
            <th>TBO</th>
            <th>Restante</th>
            <th>% Vida</th>
          </tr>
        </thead>
        <tbody>
          {components.map(c => {
            const restante = Number(c.limite_tbo) - Number(c.horas_acumuladas);
            const pct = (Number(c.horas_acumuladas)/Number(c.limite_tbo))*100;
            const colorClass = pct > 80 ? 'text-red-400 font-bold' : pct > 60 ? 'text-orange-400 font-semibold' : 'text-emerald-400 font-semibold';
            return (
              <tr key={c.id}>
                <td className="font-semibold text-blue-400">{c.aircraftId}</td>
                <td className="text-slate-300">{c.tipo}</td>
                <td className="text-slate-400">{Number(c.horas_acumuladas).toFixed(1)} hrs</td>
                <td className="text-slate-400">{Number(c.limite_tbo).toFixed(0)} hrs</td>
                <td className="text-slate-400">{restante.toFixed(1)} hrs</td>
                <td className={colorClass}>{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FinanceCharts({ flights, transactions, palette }: { flights: any[]; transactions: any[]; palette: any }) {
  const monthly = useMemo(() => {
    const map: Record<string, { hours: number; revenue: number }> = {};
    flights.forEach(f => {
      const k = new Date(f.fecha).toISOString().slice(0,7);
      map[k] = map[k] || { hours: 0, revenue: 0 };
      map[k].hours += Number(f.diff_hobbs);
      map[k].revenue += Number(f.costo);
    });
    const labels = Object.keys(map).sort();
    const hours = labels.map(l => map[l].hours);
    const revenue = labels.map(l => map[l].revenue);
    return { labels, hours, revenue };
  }, [flights]);

  const barRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!barRef.current) return;
    const ctx = barRef.current.getContext("2d");
    if (!ctx) return;
    const g1 = ctx.createLinearGradient(0, 0, 0, 180);
    g1.addColorStop(0, `${palette.accent}66`);
    g1.addColorStop(1, `${palette.accent}00`);
    const g2 = ctx.createLinearGradient(0, 0, 0, 180);
    g2.addColorStop(0, `${palette.accent2}66`);
    g2.addColorStop(1, `${palette.accent2}00`);
    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthly.labels,
        datasets: [
          { label: "Horas", data: monthly.hours, backgroundColor: g1, borderColor: palette.accent, borderRadius: 6, maxBarThickness: 18 },
          { label: "Ingresos", data: monthly.revenue, backgroundColor: g2, borderColor: palette.accent2, borderRadius: 6, maxBarThickness: 18 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" }, tooltip: { backgroundColor: '#0f172a', titleColor: '#fff', bodyColor: '#e2e8f0' } }, scales: { x: { grid: { color: palette.grid } }, y: { grid: { color: palette.grid } } } },
    });
    return () => chart.destroy();
  }, [monthly]);

  return (
    <div className="card-elegant p-6">
      <h3 className="font-bold text-lg mb-4 text-slate-200">Horas e ingresos por mes</h3>
      <canvas ref={barRef} height={140} />
    </div>
  );
}
