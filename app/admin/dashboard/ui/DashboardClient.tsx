"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler } from "chart.js";
import { useEffect, useRef } from "react";
import { generateAccountStatementPDF } from "@/lib/generate-account-pdf";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler);

type InitialData = {
  users: any[];
  aircraft: any[];
  flights: any[];
  allFlights?: any[];
  allFlightsComplete?: any[];
  submissions: any[];
  components: any[];
  transactions: any[];
  fuelByCode?: Record<string, number>;
  fuelDetailsByCode?: Record<string, { fecha: string; litros: number; monto: number }[]>;
  csvPilotStats?: Record<string, { flights: number; hours: number; spent: number }>;
  depositsByCode?: Record<string, number>;
  depositsDetailsByCode?: Record<string, { fecha: string; descripcion: string; monto: number }[]>;
  pilotDirectory?: {
    initial: { code: string; name: string }[];
    registered: { id: number; code: string; name: string; email: string; createdAt: string | Date; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null }[];
  };
};
type PaginationInfo = { page: number; pageSize: number; total: number };

export default function DashboardClient({ initialData, pagination, allowedPilotCodes, registeredPilotCodes, csvPilotNames }: { initialData: InitialData; pagination?: PaginationInfo; allowedPilotCodes?: string[]; registeredPilotCodes?: string[]; csvPilotNames?: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [pilotSubTab, setPilotSubTab] = useState<"accounts" | "directory">("accounts");
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
          <FlightsTable 
            flights={flights} 
            allFlightsComplete={initialData.allFlightsComplete}
            users={initialData.users} 
            editMode={editMode} 
            clientOptions={
              (allowedPilotCodes || []).map(code => ({
                code: code.toUpperCase(),
                name: csvPilotNames?.[code.toUpperCase()] || code
              })).sort((a, b) => a.name.localeCompare(b.name))
            }
            depositsByCode={initialData.depositsByCode}
            depositsDetailsByCode={initialData.depositsDetailsByCode}
            fuelByCode={initialData.fuelByCode}
            fuelDetailsByCode={initialData.fuelDetailsByCode}
            csvPilotNames={csvPilotNames}
          />
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
      {tab === "pilots" && (
        <>
          <div className="mb-6 flex gap-3">
            <button
              onClick={() => setPilotSubTab("accounts")}
              className={`px-6 py-3 rounded-xl font-bold uppercase tracking-wide text-sm transition-all ${
                pilotSubTab === "accounts"
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
              }`}
            >
              Pilot Accounts
            </button>
            <button
              onClick={() => setPilotSubTab("directory")}
              className={`px-6 py-3 rounded-xl font-bold uppercase tracking-wide text-sm transition-all ${
                pilotSubTab === "directory"
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
              }`}
            >
              Pilot Directory
            </button>
          </div>
          {pilotSubTab === "accounts" && <PilotsTable users={initialData.users} flights={initialData.allFlights || initialData.flights} transactions={initialData.transactions} fuelByCode={initialData.fuelByCode} depositsByCode={initialData.depositsByCode} csvPilotStats={initialData.csvPilotStats} allowedPilotCodes={allowedPilotCodes} registeredPilotCodes={registeredPilotCodes} csvPilotNames={csvPilotNames} />}
          {pilotSubTab === "directory" && <PilotDirectory directory={initialData.pilotDirectory} />}
        </>
      )}
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

function FlightsTable({ flights, allFlightsComplete, users, editMode = false, clientOptions, depositsByCode, depositsDetailsByCode, fuelByCode, fuelDetailsByCode, csvPilotNames }: { 
  flights: any[]; 
  allFlightsComplete?: any[];
  users: any[]; 
  editMode?: boolean; 
  clientOptions?: { code: string; name: string }[];
  depositsByCode?: Record<string, number>;
  depositsDetailsByCode?: Record<string, { fecha: string; descripcion: string; monto: number }[]>;
  fuelByCode?: Record<string, number>;
  fuelDetailsByCode?: Record<string, { fecha: string; litros: number; monto: number }[]>;
  csvPilotNames?: Record<string, string>;
}) {
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState(false);
  
  // Filtros locales para la tabla
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  // Obtener años únicos para el dropdown - usar todos los vuelos si están disponibles
  const availableYears = useMemo(() => {
    const sourceFlights = allFlightsComplete || flights;
    const years = new Set(sourceFlights.map(f => new Date(f.fecha).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [flights, allFlightsComplete]);

  // Filtrar vuelos - usar allFlightsComplete cuando hay filtro de cliente para mostrar historial completo
  const filteredFlights = useMemo(() => {
    // Si hay filtro de cliente, usar todos los vuelos completos para mostrar historial completo
    const sourceFlights = filterClient && allFlightsComplete ? allFlightsComplete : flights;
    
    return sourceFlights.filter(f => {
      const fecha = new Date(f.fecha);
      const year = fecha.getFullYear();
      const month = fecha.getMonth() + 1;

      // Filtro por rango de fechas
      if (filterStartDate) {
        const start = new Date(filterStartDate);
        if (fecha < start) return false;
      }
      if (filterEndDate) {
        const end = new Date(filterEndDate);
        end.setHours(23, 59, 59, 999);
        if (fecha > end) return false;
      }

      // Filtro por año
      if (filterYear && year !== parseInt(filterYear)) return false;

      // Filtro por mes
      if (filterMonth && month !== parseInt(filterMonth)) return false;

      // Filtro por cliente (código exacto)
      if (filterClient) {
        const clientCode = (f.cliente || '').toUpperCase();
        if (clientCode !== filterClient.toUpperCase()) return false;
      }

      return true;
    });
  }, [flights, allFlightsComplete, filterStartDate, filterEndDate, filterClient, filterYear, filterMonth]);

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

  const clearFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterClient("");
    setFilterYear("");
    setFilterMonth("");
  };

  const hasActiveFilters = filterStartDate || filterEndDate || filterClient || filterYear || filterMonth;

  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Flight Log Entries
          <span className="ml-2 text-sm font-normal text-blue-200">
            ({filteredFlights.length} of {flights.length})
          </span>
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
      
      {/* Barra de filtros */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-600 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filtros:
          </span>
          
          {/* Fecha desde */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-500">Desde:</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Fecha hasta */}
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-500">Hasta:</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Año */}
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Año</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Mes */}
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Mes</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo</option>
            <option value="4">Abril</option>
            <option value="5">Mayo</option>
            <option value="6">Junio</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
          </select>
          
          {/* Cliente (dropdown) */}
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
          >
            <option value="">Cliente</option>
            {(clientOptions || []).map(c => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>

          {/* Limpiar filtros */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar
            </button>
          )}

          {/* Generar PDF - Solo visible cuando hay cliente seleccionado */}
          {filterClient && (
            <button
              onClick={async () => {
                const code = filterClient.toUpperCase();
                const clientName = csvPilotNames?.[code] || code;
                
                // Calculate totals from filtered flights
                const totalHours = filteredFlights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);
                const totalSpent = filteredFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0);
                const totalDeposits = depositsByCode?.[code] || 0;
                const totalFuel = fuelByCode?.[code] || 0;
                const balance = totalDeposits - totalSpent + totalFuel;

                // Get detailed deposits and fuel for this client
                const clientDeposits = (depositsDetailsByCode?.[code] || []).map(d => ({
                  fecha: d.fecha,
                  descripcion: d.descripcion,
                  monto: d.monto,
                }));
                const clientFuel = (fuelDetailsByCode?.[code] || []).map(f => ({
                  fecha: f.fecha,
                  descripcion: `${f.litros} litros`,
                  monto: f.monto,
                }));

                await generateAccountStatementPDF({
                  clientCode: code,
                  clientName: clientName,
                  flights: filteredFlights.map(f => ({
                    id: f.id,
                    fecha: f.fecha,
                    diff_hobbs: Number(f.diff_hobbs) || 0,
                    costo: Number(f.costo) || 0,
                    detalle: f.detalle || '',
                    piloto_raw: f.piloto_raw || '',
                  })),
                  deposits: clientDeposits,
                  fuelCredits: clientFuel,
                  totalFlights: filteredFlights.length,
                  totalHours,
                  totalSpent,
                  totalDeposits,
                  totalFuel,
                  balance,
                  dateRange: {
                    start: filterStartDate || undefined,
                    end: filterEndDate || undefined,
                  },
                });
              }}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Generar PDF
            </button>
          )}
        </div>
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
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Airplane Rate</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Instructor/SP</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredFlights.map(f => {
              const code = (f.cliente || '').toUpperCase();
              const u = users.find(u => u.id === (f as any).pilotoId) || users.find(u => (u.codigo || '').toUpperCase() === code);
              const pilotName = f.piloto_raw || u?.nombre || 'N/A';
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
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.diff_tach ?? ''} onChange={e=>handleChange(f.id,'diff_tach',e.target.value)} />
                    ) : (f.diff_tach != null ? `${Number(f.diff_tach).toFixed(1)} hrs` : '-')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.hobbs_inicio ?? ''} onChange={e=>handleChange(f.id,'hobbs_inicio',e.target.value)} />
                    ) : (f.hobbs_inicio != null ? Number(f.hobbs_inicio).toFixed(1) : '-')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.hobbs_fin ?? ''} onChange={e=>handleChange(f.id,'hobbs_fin',e.target.value)} />
                    ) : (f.hobbs_fin != null ? Number(f.hobbs_fin).toFixed(1) : '-')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-2 py-1 border rounded text-right" defaultValue={f.diff_hobbs ?? ''} onChange={e=>handleChange(f.id,'diff_hobbs',e.target.value)} />
                    ) : (f.diff_hobbs != null ? `${Number(f.diff_hobbs).toFixed(1)} hrs` : '-')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-900">
                    {editMode ? (
                      <input className="px-2 py-1 border rounded" defaultValue={pilotName} onChange={e=>handleChange(f.id,'piloto_raw',e.target.value)} />
                    ) : pilotName}
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
                      // Solo mostrar tarifa del vuelo para >= 25 nov 2025
                      const flightDate = new Date(f.fecha);
                      const nov25 = new Date('2025-11-25');
                      
                      if (flightDate >= nov25) {
                        // Vuelos nuevos: mostrar tarifa guardada en el vuelo
                        if (f.tarifa && Number(f.tarifa) > 0) {
                          return `$${Math.round(Number(f.tarifa)).toLocaleString("es-CL")}`;
                        }
                        return "-";
                      }
                      
                      // Vuelos antiguos: calcular desde costo/horas o usar tarifa del usuario
                      const horas = Number(f.diff_hobbs || 0);
                      const costoVal = Number(f.costo || 0);
                      if (horas > 0 && costoVal > 0) {
                        const rate = costoVal / horas;
                        return `$${Math.round(rate).toLocaleString("es-CL")}`;
                      }
                      if (u && Number(u.tarifa_hora) > 0) {
                        return `$${Math.round(Number(u.tarifa_hora)).toLocaleString("es-CL")}`;
                      }
                      return "-";
                    })()}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-mono text-right">
                    {(() => {
                      // Solo mostrar instructor_rate para vuelos >= 25 nov 2025
                      const flightDate = new Date(f.fecha);
                      const nov25 = new Date('2025-11-25');
                      if (flightDate < nov25) return "-";
                      const rate = f.instructor_rate ? Number(f.instructor_rate) : 0;
                      return rate > 0 ? `$${Math.round(rate).toLocaleString("es-CL")}` : "-";
                    })()}
                  </td>
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
function PilotsTable({ users, flights, transactions, fuelByCode, depositsByCode, csvPilotStats, allowedPilotCodes, registeredPilotCodes, csvPilotNames }: { users: any[]; flights: any[]; transactions: any[]; fuelByCode?: Record<string, number>; depositsByCode?: Record<string, number>; csvPilotStats?: Record<string, { flights: number; hours: number; spent: number }>; allowedPilotCodes?: string[]; registeredPilotCodes?: string[]; csvPilotNames?: Record<string, string> }) {
  const allowed = useMemo(() => {
    const base = new Set((allowedPilotCodes || []).map(c => String(c).toUpperCase()));
    (registeredPilotCodes || []).forEach(c => base.add(String(c).toUpperCase()));
    return base;
  }, [allowedPilotCodes, registeredPilotCodes]);
  
  const data = useMemo(() => {
    // Build aggregation per Code using flights where cliente == Code
    const byCode: Map<string, any> = new Map();

    // Seed from allowed pilot codes (CSV) and registered extra codes
    const allCodes = new Set<string>();
    (allowedPilotCodes || []).forEach(c => allCodes.add(String(c).toUpperCase()));
    (registeredPilotCodes || []).forEach(c => allCodes.add(String(c).toUpperCase()));

    // Map code -> user (if exists)
    const userByCode = new Map<string, any>();
    users.forEach(u => {
      const code = (u.codigo || '').toUpperCase();
      if (!code) return;
      if (allCodes.size === 0 || allCodes.has(code)) userByCode.set(code, u);
    });

    // Aggregate flights ONLY by cliente code (who paid)
    const flightsByCode = new Map<string, any[]>();
    flights.forEach(f => {
      const code = (f.cliente || '').toUpperCase();
      if (!code) return;
      if (!flightsByCode.has(code)) flightsByCode.set(code, []);
      flightsByCode.get(code)!.push(f);
    });

    // Build rows
    const result: any[] = [];
    const codesToShow = allCodes.size > 0 ? Array.from(allCodes) : Array.from(flightsByCode.keys());
    codesToShow.forEach(code => {
      const u = userByCode.get(code) || null;
      const fs = flightsByCode.get(code) || [];
      const csvStats = csvPilotStats?.[code];
      const flightsCount = csvStats?.flights ?? fs.length;
      const hours = csvStats?.hours ?? fs.reduce((a,b)=> a + Number(b.diff_hobbs || 0), 0);
      const totalSpent = csvStats?.spent ?? fs.reduce((a,b)=> a + Number(b.costo || 0), 0);
      const rateHr = hours > 0 ? totalSpent / hours : 0;
      const deposits = depositsByCode?.[code] ?? (u ? transactions.filter(t => t.userId === u.id && t.tipo === 'ABONO').reduce((a,b)=>a+Number(b.monto),0) : 0);
      const fuelCredit = (fuelByCode?.[code] || 0);
      const displayName = csvPilotNames?.[code] || u?.nombre || code;
      result.push({
        id: u?.id ?? null,
        codigo: code,
        nombre: displayName,
        email: u?.email || '-',
        tarifa_hora: rateHr,
        saldo_cuenta: Number(deposits) - Number(totalSpent) + Number(fuelCredit),
        flights: flightsCount,
        hours,
        spent: totalSpent,
        deposits,
        fuel: fuelCredit
      });
    });

    return result.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  }, [users, flights, transactions, fuelByCode, depositsByCode, csvPilotStats, allowedPilotCodes, registeredPilotCodes, csvPilotNames]); // Sort by codigo
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
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fuel</th>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono">${Number(p.fuel||0).toLocaleString("es-CL")}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">${Number(p.deposits).toLocaleString("es-CL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PilotDirectory({ directory }: { directory?: { initial: { code: string; name: string }[]; registered: { id: number; code: string; name: string; email: string; createdAt: string | Date; fechaNacimiento?: string | Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null }[] } }) {
  const [editMode, setEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const rows = useMemo(() => {
    const init = (directory?.initial || []).map(p => ({ 
      id: null as number | null, 
      code: p.code, 
      name: p.name, 
      source: 'CSV', 
      email: '-', 
      createdAt: '-', 
      fechaNacimiento: null as string | null, 
      fechaNacimientoDisplay: '-',
      telefono: '', 
      numeroLicencia: '', 
      tipoDocumento: '', 
      documento: '' 
    }));
    const reg = (directory?.registered || []).map(p => ({ 
      id: p.id,
      code: p.code, 
      name: p.name, 
      source: 'Registered', 
      email: p.email || '', 
      createdAt: p.createdAt ? new Date(p.createdAt as any).toLocaleDateString('es-CL') : '-',
      fechaNacimiento: p.fechaNacimiento ? new Date(p.fechaNacimiento as any).toISOString().split('T')[0] : null,
      fechaNacimientoDisplay: p.fechaNacimiento ? new Date(p.fechaNacimiento as any).toLocaleDateString('es-CL') : '-',
      telefono: p.telefono || '',
      numeroLicencia: p.numeroLicencia || '',
      tipoDocumento: p.tipoDocumento || '',
      documento: p.documento || '',
    }));
    return [...init, ...reg].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [directory]);

  const handleChange = (id: number, field: string, value: string) => {
    setEditedRows(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    let successCount = 0;
    let errorCount = 0;

    for (const [idStr, changes] of Object.entries(editedRows)) {
      const id = Number(idStr);
      if (!id || Object.keys(changes).length === 0) continue;

      try {
        const res = await fetch('/api/pilots/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...changes })
        });
        const data = await res.json();
        if (data.ok) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Error updating pilot ${id}:`, data.error);
        }
      } catch (e) {
        errorCount++;
        console.error(`Error updating pilot ${id}:`, e);
      }
    }

    setSaving(false);
    if (successCount > 0 && errorCount === 0) {
      setMessage(`✓ ${successCount} piloto(s) actualizado(s) correctamente`);
      setEditedRows({});
      // Reload page to refresh data
      setTimeout(() => window.location.reload(), 1000);
    } else if (errorCount > 0) {
      setMessage(`⚠ ${successCount} actualizados, ${errorCount} errores`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar al piloto "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    setDeletingId(id);
    setMessage(null);
    
    try {
      const res = await fetch('/api/pilots/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      
      if (data.ok) {
        setMessage(`✓ Piloto "${name}" eliminado correctamente`);
        setDeletedIds(prev => new Set([...prev, id]));
        // Reload page after 1 second
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMessage(`⚠ Error: ${data.error || 'No se pudo eliminar'}`);
      }
    } catch (e) {
      setMessage('⚠ Error de conexión al eliminar');
      console.error('Error deleting pilot:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const getEditedValue = (id: number | null, field: string, originalValue: any) => {
    if (!id) return originalValue;
    return editedRows[id]?.[field] !== undefined ? editedRows[id][field] : originalValue;
  };

  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6 flex justify-between items-center">
        <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          Pilot Directory
        </h3>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-sm px-3 py-1 rounded ${message.startsWith('✓') ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200'}`}>
              {message}
            </span>
          )}
          {editMode && Object.keys(editedRows).length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold text-sm disabled:opacity-50"
            >
              {saving ? 'Guardando...' : '💾 Guardar Cambios'}
            </button>
          )}
          <button
            onClick={() => {
              setEditMode(!editMode);
              if (editMode) setEditedRows({});
            }}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
              editMode 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-white/20 hover:bg-white/30 text-white'
            }`}
          >
            {editMode ? '✕ Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {editMode && <th className="px-4 py-4 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Acciones</th>}
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Code</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Nombre</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">F. Nacimiento</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Correo</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Teléfono</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">N° Licencia</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Tipo Doc.</th>
              <th className="px-4 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Documento</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {rows.filter(r => !deletedIds.has(r.id || 0)).map((r, idx) => {
              const canEdit = editMode && r.id !== null;
              return (
                <tr key={`${r.code}-${idx}`} className={`transition-colors ${canEdit ? 'bg-blue-50/50' : 'hover:bg-blue-50'}`}>
                  {editMode && (
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {r.id !== null ? (
                        <button
                          onClick={() => handleDelete(r.id!, r.name)}
                          disabled={deletingId === r.id}
                          className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-bold disabled:opacity-50"
                          title="Eliminar piloto"
                        >
                          {deletingId === r.id ? '...' : '🗑️'}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">CSV</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-blue-600 font-mono">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-20 px-2 py-1 border rounded text-sm font-mono"
                        defaultValue={r.code}
                        onChange={e => handleChange(r.id!, 'codigo', e.target.value)}
                      />
                    ) : r.code}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-full px-2 py-1 border rounded text-sm"
                        defaultValue={r.name}
                        onChange={e => handleChange(r.id!, 'nombre', e.target.value)}
                      />
                    ) : r.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="date"
                        className="w-36 px-2 py-1 border rounded text-sm"
                        defaultValue={r.fechaNacimiento || ''}
                        onChange={e => handleChange(r.id!, 'fechaNacimiento', e.target.value)}
                      />
                    ) : r.fechaNacimientoDisplay}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="email"
                        className="w-48 px-2 py-1 border rounded text-sm"
                        defaultValue={r.email !== '-' ? r.email : ''}
                        onChange={e => handleChange(r.id!, 'email', e.target.value)}
                      />
                    ) : r.email}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="tel"
                        className="w-32 px-2 py-1 border rounded text-sm"
                        defaultValue={r.telefono}
                        onChange={e => handleChange(r.id!, 'telefono', e.target.value)}
                      />
                    ) : (r.telefono || '-')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-28 px-2 py-1 border rounded text-sm"
                        defaultValue={r.numeroLicencia}
                        onChange={e => handleChange(r.id!, 'licencia', e.target.value)}
                      />
                    ) : (r.numeroLicencia || '-')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <select
                        className="w-24 px-2 py-1 border rounded text-sm"
                        defaultValue={r.tipoDocumento}
                        onChange={e => handleChange(r.id!, 'tipoDocumento', e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="RUT">RUT</option>
                        <option value="Pasaporte">Pasaporte</option>
                      </select>
                    ) : (r.tipoDocumento || '-')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-32 px-2 py-1 border rounded text-sm"
                        defaultValue={r.documento}
                        onChange={e => handleChange(r.id!, 'documento', e.target.value)}
                      />
                    ) : (r.documento || '-')}
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
