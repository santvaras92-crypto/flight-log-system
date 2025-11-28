"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler } from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler);

type InitialData = {
  users: any[];
  aircraft: any[];
  flights: any[];
  allFlights?: any[];
  submissions: any[];
  components: any[];
  transactions: any[];
};
type PaginationInfo = { page: number; pageSize: number; total: number };

export default function DashboardClient({ initialData, pagination, allowedPilotCodes }: { initialData: InitialData; pagination?: PaginationInfo; allowedPilotCodes?: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [filterAircraft, setFilterAircraft] = useState("");
  const [filterPilot, setFilterPilot] = useState("");
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('dash-theme') || 'light';
  });
  const [yearFilter, setYearFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"desc"|"asc">("desc");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(pagination?.page || 1);
  const [editMode, setEditMode] = useState(false);
  const [activeDaysLimit, setActiveDaysLimit] = useState<number>(30);
  const [showActivePilots, setShowActivePilots] = useState(false);
  const pageSize = pagination?.pageSize || 100;
  useEffect(() => { localStorage.setItem('dash-theme', theme); }, [theme]);

  const flights = useMemo(() => {
    const filtered = initialData.flights
      .filter(f => (!filterAircraft || f.aircraftId.toLowerCase().includes(filterAircraft.toLowerCase())))
      .filter(f => {
        if (!yearFilter) return true;
        const y = new Date(f.fecha).getFullYear().toString();
        return y === yearFilter;
      })
      .filter(f => {
        const d = new Date(f.fecha).getTime();
        const after = startDate ? new Date(startDate).getTime() : -Infinity;
        const before = endDate ? new Date(endDate).getTime() : Infinity;
        return d >= after && d <= before;
      })
    const sorted = filtered.slice().sort((a,b)=>{
      const da = new Date(a.fecha).getTime();
      const db = new Date(b.fecha).getTime();
      return sortOrder === 'desc' ? db - da : da - db;
    });
    // Client-side slice when no server pagination is provided; otherwise server already paginated.
    if (!pagination) {
      const start = (currentPage-1)*pageSize;
      return sorted.slice(start, start+pageSize);
    }
    return sorted;
  }, [initialData.flights, filterAircraft, yearFilter, sortOrder, startDate, endDate, currentPage]);

  const submissions = useMemo(() => {
    return initialData.submissions.filter(s => {
      const u = initialData.users.find(u => u.id === s.pilotoId);
      return (!filterPilot || (u?.nombre || "").toLowerCase().includes(filterPilot.toLowerCase()));
    });
  }, [initialData.submissions, initialData.users, filterPilot]);

  const palette = theme === 'dark'
    ? { bg: 'bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900', card: 'bg-slate-800/90 backdrop-blur-lg border-2 border-slate-700/50', text: 'text-white', subtext: 'text-slate-300', border: 'border-slate-600', accent: '#3b82f6', accent2: '#10b981', grid: 'rgba(148,163,184,0.15)', shadow: 'shadow-2xl' }
    : { bg: 'bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100', card: 'bg-white/95 backdrop-blur-lg border-2 border-slate-200', text: 'text-slate-900', subtext: 'text-slate-600', border: 'border-slate-300', accent: '#2563eb', accent2: '#059669', grid: 'rgba(100,116,139,0.1)', shadow: 'shadow-2xl' };

  return (
    <div className={`min-h-screen ${palette.bg} -mx-6 -my-8 px-6 py-8`}>
      {/* Header estilo Jeppesen */}
      <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] shadow-2xl rounded-2xl mb-8">
        <div className="px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.png" 
                alt="CC-AQI" 
                  className="h-[6.48rem] w-auto"
              />
              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight">Operations Dashboard</h1>
                <p className="mt-1.5 text-blue-50 text-base font-medium">Flight Operations • Maintenance • Finance</p>
              </div>
            </div>
            {/* Controls: normalize size + allow wrap to avoid overflow */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                className="h-12 px-4 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white font-bold shadow-lg flex items-center gap-2"
                onClick={()=>setEditMode(e=>!e)}
                title={editMode ? "Salir de edición" : "Modo edición"}
              >
                {editMode ? (
                  <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
                {editMode ? "Editar (candado abierto)" : "Modo edición"}
              </button>
              {/** shared control styles for consistent alignment */}
              {(() => {
                const controlClass = "h-12 px-4 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white placeholder-blue-200 font-medium focus:bg-white/20 focus:border-white/40 transition-all shadow-lg py-0";
                const buttonClass = "h-12 px-5 bg-white/20 backdrop-blur-sm hover:bg-white/30 border-2 border-white/30 rounded-xl text-white font-bold transition-all shadow-lg flex items-center gap-2";
                return (
                  <>
                    <input 
                      value={filterAircraft} 
                      onChange={e=>setFilterAircraft(e.target.value)} 
                      placeholder="Filter aircraft..." 
                      className={`${controlClass} min-w-[220px]`}
                    />
                    <input 
                      value={filterPilot} 
                      onChange={e=>setFilterPilot(e.target.value)} 
                      placeholder="Filter pilot..." 
                      className={`${controlClass} min-w-[220px]`}
                    />
                    <button 
                      className={buttonClass}
                      onClick={()=>setTheme(theme==='dark'?'light':'dark')}
                    >
                      {theme==='dark'?<>☀️ Light</>:<>🌙 Dark</>}
                    </button>
                    <select
                      value={yearFilter}
                      onChange={e=>setYearFilter(e.target.value)}
                      className={`${controlClass} min-w-[140px] appearance-none`}
                    >
                      <option value="">All years</option>
                      {Array.from(new Set(initialData.flights.map(f=>new Date(f.fecha).getFullYear()).sort((a,b)=>b-a))).map(y=>
                        <option key={y} value={y.toString()}>{y}</option>
                      )}
                    </select>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e=>{ setStartDate(e.target.value); setCurrentPage(1); }}
                      className={`${controlClass} min-w-[160px]`}
                      title="Start date"
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={e=>{ setEndDate(e.target.value); setCurrentPage(1); }}
                      className={`${controlClass} min-w-[160px]`}
                      title="End date"
                    />
                    <button
                      onClick={()=>setSortOrder(sortOrder==='desc'?'asc':'desc')}
                      className={buttonClass}
                      title="Toggle sort order"
                    >
                      {sortOrder==='desc' ? 'Newest first' : 'Oldest first'}
                    </button>
                    <div className="flex items-center gap-2 h-12 px-4 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl text-white shadow-lg">
                      <label className="text-xs font-bold whitespace-nowrap">Active days:</label>
                      <button
                        onClick={() => setActiveDaysLimit(Math.max(1, activeDaysLimit - 10))}
                        className="px-2 py-1 bg-white/20 hover:bg-white/30 border border-white/30 rounded text-white font-bold text-sm transition-colors"
                        title="Decrease by 10 days"
                      >
                        -10
                      </button>
                      <input 
                        type="number" 
                        min="1" 
                        max="365"
                        step="10"
                        value={activeDaysLimit} 
                        onChange={e => setActiveDaysLimit(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                        className="w-16 px-2 py-1 bg-white/20 border border-white/30 rounded text-white text-center font-mono focus:bg-white/30 focus:outline-none"
                      />
                      <button
                        onClick={() => setActiveDaysLimit(Math.min(365, activeDaysLimit + 10))}
                        className="px-2 py-1 bg-white/20 hover:bg-white/30 border border-white/30 rounded text-white font-bold text-sm transition-colors"
                        title="Increase by 10 days"
                      >
                        +10
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Estilo ForeFlight */}
      <nav className="mb-8 flex gap-2 bg-white/5 backdrop-blur-sm p-2 rounded-2xl border-2 border-white/10">
        {[
          { id: "overview", label: "Overview", icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 16a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" },
          { id: "flights", label: "Flight Log", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
          { id: "pilots", label: "Pilots", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
          { id: "maintenance", label: "Maintenance", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
          { id: "finance", label: "Finance", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
        ].map(t => (
          <button 
            key={t.id} 
            onClick={()=>setTab(t.id)}
            className={`flex-1 px-6 py-4 rounded-xl font-bold uppercase tracking-wide text-sm transition-all flex items-center justify-center gap-2 ${
              tab===t.id 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview data={initialData} flights={flights} palette={palette} allowedPilotCodes={allowedPilotCodes} activeDaysLimit={activeDaysLimit} showActivePilots={showActivePilots} setShowActivePilots={setShowActivePilots} />}
      {tab === "flights" && (
        <>
          <FlightsTable flights={flights} users={initialData.users} editMode={editMode} />
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-b-2xl mt-2">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              onClick={()=>{
                const prev = Math.max(1, currentPage-1);
                setCurrentPage(prev);
                if (pagination) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('page', String(prev));
                  params.set('pageSize', String(pageSize));
                  router.push(`/admin/dashboard?${params.toString()}`);
                }
              }}
              disabled={currentPage===1}
            >
              ← Prev
            </button>
            
            <div className="flex items-center gap-2">
              {(() => {
                const totalPages = pagination ? Math.ceil((pagination.total || 0) / pageSize) : Math.ceil(initialData.flights.length / pageSize);
                const pages: (number | string)[] = [];
                
                // Siempre mostrar primera página
                pages.push(1);
                
                // Calcular rango alrededor de página actual
                const rangeStart = Math.max(2, currentPage - 2);
                const rangeEnd = Math.min(totalPages - 1, currentPage + 2);
                
                // Agregar ... si hay gap después de página 1
                if (rangeStart > 2) pages.push('...');
                
                // Agregar páginas del rango
                for (let i = rangeStart; i <= rangeEnd; i++) {
                  pages.push(i);
                }
                
                // Agregar ... si hay gap antes de última página
                if (rangeEnd < totalPages - 1) pages.push('...');
                
                // Siempre mostrar última página
                if (totalPages > 1) pages.push(totalPages);
                
                return pages.map((p, idx) => {
                  if (p === '...') {
                    return <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">...</span>;
                  }
                  const pageNum = p as number;
                  const isActive = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        setCurrentPage(pageNum);
                        if (pagination) {
                          const params = new URLSearchParams(searchParams.toString());
                          params.set('page', String(pageNum));
                          params.set('pageSize', String(pageSize));
                          router.push(`/admin/dashboard?${params.toString()}`);
                        }
                      }}
                      className={`min-w-[40px] px-3 py-2 rounded-lg font-semibold transition-all ${
                        isActive 
                          ? 'bg-blue-600 text-white shadow-lg' 
                          : 'bg-white text-slate-600 hover:bg-blue-50 border border-slate-300'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                });
              })()}
            </div>
            
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
              onClick={()=>{
                const next = currentPage+1;
                if (pagination) {
                  const maxPages = Math.ceil((pagination.total||0) / pageSize);
                  if (next > maxPages) return;
                }
                setCurrentPage(next);
                if (pagination) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('page', String(next));
                  params.set('pageSize', String(pageSize));
                  router.push(`/admin/dashboard?${params.toString()}`);
                }
              }}
              disabled={pagination ? currentPage >= Math.ceil((pagination.total||0)/pageSize) : flights.length < pageSize}
            >
              Next →
            </button>
          </div>
        </>
      )}
      {tab === "pilots" && <PilotsTable users={initialData.users} flights={initialData.flights} transactions={initialData.transactions} allowedPilotCodes={allowedPilotCodes} />}
      {tab === "maintenance" && <MaintenanceTable components={initialData.components} aircraft={initialData.aircraft} />}
      {tab === "finance" && <FinanceCharts flights={initialData.flights} transactions={initialData.transactions} palette={palette} />}
    </div>
  );
}

function Overview({ data, flights, palette, allowedPilotCodes, activeDaysLimit, showActivePilots, setShowActivePilots }: { data: InitialData; flights: any[]; palette: any; allowedPilotCodes?: string[]; activeDaysLimit: number; showActivePilots: boolean; setShowActivePilots: (v: boolean) => void }) {
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

  // Compute Active Pilots: pilots from CSV who flew in last X days
  const activePilots = useMemo(() => {
    const allowed = new Set((allowedPilotCodes || []).map(c => String(c).toUpperCase()));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - activeDaysLimit);
    const cutoffTime = cutoffDate.getTime();

    const allFlightsData = data.allFlights || data.flights; // Use allFlights if available, fallback to paginated flights

    // Map allowed pilot codes to user IDs
    const codeToUserId = new Map<string, number>();
    data.users.forEach(u => {
      const code = (u.codigo || '').toUpperCase();
      if (code && allowed.has(code)) codeToUserId.set(code, u.id);
    });

    const pilotIds = new Set<number>();
    allFlightsData.forEach(f => {
      const t = new Date(f.fecha).getTime();
      if (t < cutoffTime) return;
      // We may not have pilotoId in the lightweight dataset; rely on cliente code mapping
      const code = ((f as any).cliente || '').toUpperCase();
      const uid = codeToUserId.get(code);
      if (uid) pilotIds.add(uid);
    });

    return data.users.filter(u => {
      if (u.rol !== 'PILOTO') return false;
      const code = (u.codigo || '').toUpperCase();
      const passesAllowed = allowed.size > 0 ? (code && allowed.has(code)) : true;
      return passesAllowed && pilotIds.has(u.id);
    });
  }, [data.users, data.flights, data.allFlights, allowedPilotCodes, activeDaysLimit]);

  const totalHours = data.flights.reduce((a,b)=>a+Number(b.diff_hobbs),0);
  const totalRevenue = data.flights.reduce((a,b)=>a+Number(b.costo||0),0);
  return (
    <div className="space-y-6">
      {/* Stats Grid - Estilo ForeFlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="Total Flights" value={data.flights.length} accent="#3b82f6" icon="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" palette={palette} />
        <StatCard title="Hobbs Hours" value={totalHours.toFixed(1)} accent="#10b981" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" palette={palette} />
        <StatCard 
          title="Active Pilots" 
          value={activePilots.length} 
          accent="#f59e0b" 
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" 
          palette={palette}
          onClick={() => setShowActivePilots(!showActivePilots)}
        />
        <StatCard title="Revenue" value={`$${Number(totalRevenue).toLocaleString('es-CL')}`} accent="#ef4444" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" palette={palette} />
      </div>

      {/* Active Pilots Modal */}
      {showActivePilots && (
        <div className={`${palette.card} rounded-2xl ${palette.shadow} overflow-hidden`}>
          <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Active Pilots (last {activeDaysLimit} days)
            </h3>
            <button 
              onClick={() => setShowActivePilots(false)}
              className="text-white hover:text-red-400 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-8">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Last Flight</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {activePilots.map(p => {
                    const lastFlight = data.flights
                      .filter(f => f.pilotoId === p.id)
                      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
                    return (
                      <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 font-mono">{p.codigo}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{p.nombre}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {lastFlight ? new Date(lastFlight.fecha).toLocaleDateString('es-CL') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Chart Card - Estilo Jeppesen */}
      <div className={`${palette.card} rounded-2xl ${palette.shadow} overflow-hidden`}>
        <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
          <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Flight Hours Trend
          </h3>
        </div>
        <div className="p-8">
          <LineChart labels={hoursByDay.labels} values={hoursByDay.values} palette={palette} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, accent, icon, palette, onClick }: { title: string; value: string | number; accent: string; icon: string; palette: any; onClick?: () => void }) {
  return (
    <div 
      className={`${palette.card} rounded-2xl p-6 ${palette.shadow} relative overflow-hidden group hover:scale-105 transition-transform duration-300 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full opacity-5" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }} />
      <div className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
        <svg className="w-7 h-7" style={{ color: accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="relative z-10">
        <p className={`text-xs font-bold ${palette.subtext} uppercase tracking-wider mb-3`}>{title}</p>
        <p className={`text-4xl font-bold ${palette.text} tracking-tight`}>{value}</p>
        <div className="mt-4 h-1 w-16 rounded-full" style={{ background: accent }} />
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

function FlightsTable({ flights, users, editMode = false }: { flights: any[]; users: any[]; editMode?: boolean }) {
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState(false);
  const handleChange = (id: number, field: string, value: any) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const applySave = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(drafts).map(([id, data]) => ({ id: Number(id), ...data }));
      if (payload.length === 0) return;
      const res = await fetch('/api/flights/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: payload }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || 'Error al guardar cambios');
      } else {
        alert('Cambios guardados');
        setDrafts({});
        // Opcional: refresh via location
        location.reload();
      }
    } catch (e) {
      alert('Error de red al guardar');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Flight Log Entries
          {editMode && (
            <button
              onClick={applySave}
              disabled={saving}
              className="ml-auto px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-bold disabled:opacity-40"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Tach I</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Tach F</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Δ Tach</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Hobbs I</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Hobbs F</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Δ Hobbs</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Pilot</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Copilot/Instructor</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Client</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Instructor/SP</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {flights.map(f => {
              const code = (f.cliente || '').toUpperCase();
              const u = users.find(u => u.id === (f as any).pilotoId) || users.find(u => (u.codigo || '').toUpperCase() === code);
              return (
                <tr key={f.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">
                    {editMode ? (
                      <input type="date" className="px-2 py-1 border rounded" value={new Date(f.fecha).toISOString().slice(0,10)} onChange={e=>handleChange(f.id,'fecha',e.target.value)} />
                    ) : (
                      new Date(f.fecha).toLocaleDateString("es-CL")
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={Number(f.tach_inicio).toFixed(1)} onChange={e=>handleChange(f.id,'tach_inicio',e.target.value)} />
                    ) : Number(f.tach_inicio).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={Number(f.tach_fin).toFixed(1)} onChange={e=>handleChange(f.id,'tach_fin',e.target.value)} />
                    ) : Number(f.tach_fin).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">{Number(f.diff_tach).toFixed(1)} hrs</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">
                      {editMode ? (
                        <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.diff_tach ?? ''} onChange={e=>handleChange(f.id,'diff_tach',e.target.value)} />
                      ) : (f.diff_tach != null ? `${Number(f.diff_tach).toFixed(1)} hrs` : '-')}
                    </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={Number(f.hobbs_inicio).toFixed(1)} onChange={e=>handleChange(f.id,'hobbs_inicio',e.target.value)} />
                    ) : Number(f.hobbs_inicio).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={Number(f.hobbs_fin).toFixed(1)} onChange={e=>handleChange(f.id,'hobbs_fin',e.target.value)} />
                    ) : Number(f.hobbs_fin).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">{Number(f.diff_hobbs).toFixed(1)} hrs</td>
                                    <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">
                                      {editMode ? (
                                        <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.diff_hobbs ?? ''} onChange={e=>handleChange(f.id,'diff_hobbs',e.target.value)} />
                                      ) : (f.diff_hobbs != null ? `${Number(f.diff_hobbs).toFixed(1)} hrs` : '-')}
                                    </td>
                                      ) : (f.tach_inicio != null ? Number(f.tach_inicio).toFixed(1) : '-')}
                                      ) : (f.tach_fin != null ? Number(f.tach_fin).toFixed(1) : '-')}
                                      ) : (f.hobbs_inicio != null ? Number(f.hobbs_inicio).toFixed(1) : '-')}
                                      ) : (f.hobbs_fin != null ? Number(f.hobbs_fin).toFixed(1) : '-')}
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-900">
                    {editMode ? (
                      <input className="px-2 py-1 border rounded" defaultValue={u?.nombre || ''} onChange={e=>handleChange(f.id,'pilotoNombre',e.target.value)} />
                    ) : (u?.nombre || "N/A")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                    {editMode ? (
                      <input className="px-2 py-1 border rounded" defaultValue={f.copiloto || ''} onChange={e=>handleChange(f.id,'copiloto',e.target.value)} />
                    ) : (f.copiloto || "-")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                    {editMode ? (
                      <input className="px-2 py-1 border rounded" defaultValue={f.cliente || ''} onChange={e=>handleChange(f.id,'cliente',e.target.value)} />
                    ) : (f.cliente || "-")}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {(() => {
                      const horas = Number(f.diff_hobbs);
                      const rate = horas > 0 ? Number(f.costo) / horas : (u ? Number(u.tarifa_hora) : 0);
                      return rate > 0 ? `$${Math.round(rate).toLocaleString("es-CL")}` : "-";
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                    {editMode ? (
                      <input className="px-2 py-1 border rounded" defaultValue={f.instructor || ''} onChange={e=>handleChange(f.id,'instructor',e.target.value)} />
                    ) : (f.instructor || "-")}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-green-600 text-right">${Number(f.costo).toLocaleString("es-CL")}</td>
                                    <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-green-600 text-right">{f.costo != null ? `$${Number(f.costo).toLocaleString("es-CL")}` : '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={f.detalle || ""}>
                    {editMode ? (
                      <input className="w-full px-2 py-1 border rounded" defaultValue={f.detalle || ''} onChange={e=>handleChange(f.id,'detalle',e.target.value)} />
                    ) : (f.detalle || "-")}
                  </td>
                  {editMode && (
                    <td className="px-2 py-3 whitespace-nowrap text-xs text-right">
                      <button
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                        onClick={async ()=>{
                          if (!confirm('¿Eliminar este vuelo por completo?')) return;
                          const res = await fetch('/api/flights/delete', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ id: f.id }) });
                          const json = await res.json();
                          if (!json.ok) alert(json.error||'Error al eliminar'); else location.reload();
                        }}
                        title="Eliminar vuelo"
                      >
                        Borrar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function PilotsTable({ users, flights, transactions, allowedPilotCodes }: { users: any[]; flights: any[]; transactions: any[]; allowedPilotCodes?: string[] }) {
  const allowed = useMemo(() => new Set((allowedPilotCodes || []).map(c => String(c).toUpperCase())), [allowedPilotCodes]);
  const data = users
    .filter(u => {
      if (u.rol !== 'PILOTO') return false;
      const code = (u.codigo || '').toUpperCase();
      // If allowed list exists, strictly enforce membership; else fallback to legacy behavior (has codigo)
      return allowed.size > 0 ? (code && allowed.has(code)) : Boolean(code);
    })
    .map(u => {
      const f = flights.filter(f => (f as any).pilotoId === u.id || ((f.cliente || '').toUpperCase() === (u.codigo || '').toUpperCase()));
      const spent = transactions.filter(t => t.userId === u.id && t.tipo === 'CARGO_VUELO').reduce((a,b)=>a+Number(b.monto),0);
      const deposits = transactions.filter(t => t.userId === u.id && t.tipo === 'ABONO').reduce((a,b)=>a+Number(b.monto),0);
      return { ...u, flights: f.length, hours: f.reduce((a,b)=>a+Number(b.diff_hobbs),0), spent: spent, deposits: deposits };
    })
    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')); // Sort by codigo
  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Pilot Accounts
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Code</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Pilot</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Flights</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Hours</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Rate/Hr</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Balance</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Total Spent</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Deposits</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {data.map(p => (
              <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 font-mono">{p.codigo || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{p.nombre}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{p.flights}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{p.hours.toFixed(1)} hrs</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">${Number(p.tarifa_hora).toLocaleString("es-CL")}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">${Number(p.saldo_cuenta).toLocaleString("es-CL")}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">${Number(-p.spent).toLocaleString("es-CL")}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">${Number(p.deposits).toLocaleString("es-CL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenanceTable({ components, aircraft }: { components: any[]; aircraft: any[] }) {
  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Component Status
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Aircraft</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Hours</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">TBO</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Remaining</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Life %</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {components.map(c => {
              const restante = Number(c.limite_tbo) - Number(c.horas_acumuladas);
              const pct = (Number(c.horas_acumuladas)/Number(c.limite_tbo))*100;
              const colorClass = pct > 80 ? 'text-red-600 font-bold' : pct > 60 ? 'text-orange-500 font-bold' : 'text-green-600 font-bold';
              return (
                <tr key={c.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600 font-mono">{c.aircraftId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{c.tipo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{Number(c.horas_acumuladas).toFixed(1)} hrs</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{Number(c.limite_tbo).toFixed(0)} hrs</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{restante.toFixed(1)} hrs</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${colorClass}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
    const g1 = ctx.createLinearGradient(0, 0, 0, 220);
    g1.addColorStop(0, `${palette.accent}88`);
    g1.addColorStop(1, `${palette.accent}22`);
    const g2 = ctx.createLinearGradient(0, 0, 0, 220);
    g2.addColorStop(0, `${palette.accent2}88`);
    g2.addColorStop(1, `${palette.accent2}22`);
    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthly.labels,
        datasets: [
          { label: "Hours", data: monthly.hours, backgroundColor: g1, borderColor: palette.accent, borderRadius: 8, borderWidth: 2, maxBarThickness: 24 },
          { label: "Revenue", data: monthly.revenue, backgroundColor: g2, borderColor: palette.accent2, borderRadius: 8, borderWidth: 2, maxBarThickness: 24 },
        ],
      },
      options: { 
        responsive: true, 
        plugins: { 
          legend: { 
            position: "top",
            labels: {
              font: { size: 13, weight: 'bold' },
              padding: 15,
              usePointStyle: true
            }
          }, 
          tooltip: { 
            backgroundColor: '#0f172a', 
            titleColor: '#fff', 
            bodyColor: '#e2e8f0',
            padding: 12,
            borderColor: palette.accent,
            borderWidth: 1,
            cornerRadius: 8
          } 
        }, 
        scales: { 
          x: { 
            grid: { color: palette.grid },
            ticks: { font: { weight: 'bold' } }
          }, 
          y: { 
            grid: { color: palette.grid },
            ticks: { font: { weight: 'bold' } }
          } 
        } 
      },
    });
    return () => chart.destroy();
  }, [monthly]);

  return (
    <div className={`${palette.card} rounded-2xl ${palette.shadow} overflow-hidden`}>
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Financial Performance
        </h3>
      </div>
      <div className="p-8">
        <canvas ref={barRef} height={160} />
      </div>
    </div>
  );
}
