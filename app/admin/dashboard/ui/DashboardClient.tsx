"use client";
import { useMemo, useState } from "react";
import ExecutiveHeader from "@/app/components/ExecutiveHeader";
import ExecutiveNav from "@/app/components/ExecutiveNav";
import ExcelGrid from "@/app/components/ExcelGrid";
import { 
  PaperAirplaneIcon, 
  UsersIcon, 
  CurrencyDollarIcon,
  ClockIcon,
  ChartBarIcon,
  WrenchScrewdriverIcon 
} from "@heroicons/react/24/outline";

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
    registered: { id: number; code: string; name: string; email: string; createdAt: string | Date }[];
  };
};

type PaginationInfo = { page: number; pageSize: number; total: number };

export default function DashboardClient({ 
  initialData, 
  pagination, 
  allowedPilotCodes, 
  registeredPilotCodes, 
  csvPilotNames 
}: { 
  initialData: InitialData; 
  pagination?: PaginationInfo; 
  allowedPilotCodes?: string[]; 
  registeredPilotCodes?: string[]; 
  csvPilotNames?: Record<string, string> 
}) {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [activeDaysLimit, setActiveDaysLimit] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<"overview" | "flights" | "pilots" | "maintenance">("overview");

  // Calculate statistics
  const stats = useMemo(() => {
    const totalFlights = initialData.flights.length;
    const totalHours = initialData.flights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);
    
    // Active pilots (flights in last N days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - activeDaysLimit);
    const recentFlights = (initialData.allFlights || initialData.flights).filter((f: any) => {
      return new Date(f.fecha) >= cutoffDate;
    });
    const uniquePilots = new Set(recentFlights.map((f: any) => f.cliente).filter(Boolean));
    const activePilots = uniquePilots.size;

    return { totalFlights, totalHours, activePilots };
  }, [initialData, activeDaysLimit]);

  const filteredFlights = useMemo(() => {
    return initialData.flights.filter(f => {
      const d = new Date(f.fecha).getTime();
      const after = startDate ? new Date(startDate).getTime() : -Infinity;
      const before = endDate ? new Date(endDate).getTime() : Infinity;
      return d >= after && d <= before;
    });
  }, [initialData.flights, startDate, endDate]);

  return (
    <div className="min-h-screen">
      <ExecutiveHeader 
        title="Operations Dashboard"
        subtitle="Flight Operations • Maintenance • Finance"
        actions={
          <div className="flex gap-3 flex-wrap">
            <input 
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="executive-input"
              placeholder="dd-mm-yyyy"
            />
            <input 
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="executive-input"
              placeholder="dd-mm-yyyy"
            />
            <select
              value={activeDaysLimit}
              onChange={e => setActiveDaysLimit(Number(e.target.value))}
              className="executive-input"
            >
              <option value="-10">-10</option>
              <option value="30">30</option>
              <option value="+10">+10</option>
            </select>
            <button className="btn-executive btn-executive-primary">
              Newest first
            </button>
          </div>
        }
      />

      <ExecutiveNav />

      {/* Tab Navigation */}
      <div className="mt-8 flex gap-2 border-b-2 border-gray-200">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-6 py-3 font-semibold transition-all ${
            activeTab === "overview"
              ? "text-blue-600 border-b-4 border-blue-600 -mb-0.5"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          📊 Overview
        </button>
        <button
          onClick={() => setActiveTab("flights")}
          className={`px-6 py-3 font-semibold transition-all ${
            activeTab === "flights"
              ? "text-blue-600 border-b-4 border-blue-600 -mb-0.5"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          ✈️ Flight Log (Excel)
        </button>
        <button
          onClick={() => setActiveTab("pilots")}
          className={`px-6 py-3 font-semibold transition-all ${
            activeTab === "pilots"
              ? "text-blue-600 border-b-4 border-blue-600 -mb-0.5"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          👥 Pilots Account (Excel)
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`px-6 py-3 font-semibold transition-all ${
            activeTab === "maintenance"
              ? "text-blue-600 border-b-4 border-blue-600 -mb-0.5"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🔧 Maintenance (Excel)
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
          {/* Overview Stats */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Flights</div>
              <div className="text-4xl font-bold text-navy-950">{stats.totalFlights}</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
              <PaperAirplaneIcon className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 h-1 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full"></div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Hobbs Hours</div>
              <div className="text-4xl font-bold text-navy-950">{stats.totalHours.toFixed(1)}</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <ClockIcon className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 h-1 bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full"></div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Pilots</div>
              <div className="text-4xl font-bold text-navy-950">{stats.activePilots}</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
              <UsersIcon className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 h-1 bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"></div>
        </div>
      </div>

      {/* Flight Hours Trend */}
      <div className="mt-8 executive-card">
        <div className="flex items-center gap-3 mb-6">
          <ChartBarIcon className="w-6 h-6 text-navy-900" />
          <h2 className="text-xl font-bold text-navy-950">Flight Hours Trend</h2>
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          Chart placeholder - integrate Chart.js here
        </div>
      </div>

      {/* Recent Flights Table */}
      <div className="mt-8 executive-card">
        <h2 className="text-xl font-bold text-navy-950 mb-6">Recent Flights</h2>
        <div className="executive-table-container">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Aircraft</th>
                <th>Pilot</th>
                <th>Hobbs</th>
                <th>Tach</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlights.slice(0, 20).map((flight, idx) => (
                <tr key={flight.id}>
                  <td>{new Date(flight.fecha).toLocaleDateString()}</td>
                  <td className="font-mono font-semibold text-blue-600">{flight.aircraftId}</td>
                  <td>{flight.cliente || '-'}</td>
                  <td className="font-mono">{Number(flight.diff_hobbs || 0).toFixed(1)}</td>
                  <td className="font-mono">{Number(flight.diff_tach || 0).toFixed(1)}</td>
                  <td className="font-semibold text-emerald-600">${Number(flight.costo || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance Status */}
      <div className="mt-8 executive-card">
        <div className="flex items-center gap-3 mb-6">
          <WrenchScrewdriverIcon className="w-6 h-6 text-navy-900" />
          <h2 className="text-xl font-bold text-navy-950">Maintenance Status</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {initialData.components.slice(0, 6).map(comp => {
            const remaining = comp.limite_tbo - comp.horas_acumuladas;
            const percentage = (comp.horas_acumuladas / comp.limite_tbo) * 100;
            const status = percentage > 90 ? 'critical' : percentage > 75 ? 'warning' : 'ok';
            
            return (
              <div key={comp.id} className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold text-navy-900">{comp.tipo}</div>
                  <div className={`text-xs font-bold px-2 py-1 rounded-full ${
                    status === 'critical' ? 'bg-red-100 text-red-700' :
                    status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {percentage.toFixed(0)}%
                  </div>
                </div>
                <div className="text-sm text-gray-600 font-mono mb-3">
                  {comp.horas_acumuladas.toFixed(1)} / {comp.limite_tbo} hrs
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      status === 'critical' ? 'bg-gradient-to-r from-red-500 to-red-600' :
                      status === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                      'bg-gradient-to-r from-green-500 to-green-600'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {remaining > 0 ? `${remaining.toFixed(0)} hrs remaining` : 'TBO exceeded'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}

      {/* Flight Log Tab - Excel Grid */}
      {activeTab === "flights" && (
        <div className="mt-8">
          <ExcelGrid 
            gridKey="flight_entries"
            initialData={[
              ["Fecha", "Matrícula", "Piloto", "Hobbs Inicio", "Hobbs Fin", "Δ Hobbs", "Tach Inicio", "Tach Fin", "Δ Tach", "Costo", "Tarifa", "Detalle"],
              ...filteredFlights.map(f => [
                new Date(f.fecha).toLocaleDateString(),
                f.aircraftId,
                f.cliente || "",
                f.hobbs_inicio,
                f.hobbs_fin,
                f.diff_hobbs,
                f.tach_inicio,
                f.tach_fin,
                f.diff_tach,
                f.costo,
                f.tarifa || "",
                f.detalle || ""
              ])
            ]}
          />
        </div>
      )}

      {/* Pilots Account Tab - Excel Grid */}
      {activeTab === "pilots" && (
        <div className="mt-8">
          <ExcelGrid 
            gridKey="pilots_account"
            initialData={[
              ["Código", "Nombre", "Email", "Saldo", "Tarifa/Hora", "Total Vuelos", "Total Horas", "Total Gastado"],
              ...initialData.users
                .filter(u => u.rol === "PILOTO")
                .map(u => {
                  const userFlights = initialData.flights.filter(f => f.cliente === u.codigo);
                  const totalFlights = userFlights.length;
                  const totalHours = userFlights.reduce((sum, f) => sum + Number(f.diff_hobbs || 0), 0);
                  const totalSpent = userFlights.reduce((sum, f) => sum + Number(f.costo || 0), 0);
                  
                  return [
                    u.codigo || "",
                    u.nombre,
                    u.email,
                    u.saldo_cuenta,
                    u.tarifa_hora,
                    totalFlights,
                    totalHours.toFixed(1),
                    totalSpent.toFixed(0)
                  ];
                })
            ]}
          />
        </div>
      )}

      {/* Maintenance Tab - Excel Grid */}
      {activeTab === "maintenance" && (
        <div className="mt-8">
          <ExcelGrid 
            gridKey="maintenance"
            initialData={[
              ["Matrícula", "Componente", "Horas Acumuladas", "Límite TBO", "Horas Restantes", "% Usado", "Estado"],
              ...initialData.components.map(c => {
                const remaining = c.limite_tbo - c.horas_acumuladas;
                const percentage = ((c.horas_acumuladas / c.limite_tbo) * 100).toFixed(1);
                const status = Number(percentage) > 90 ? "CRÍTICO" : Number(percentage) > 75 ? "ADVERTENCIA" : "OK";
                
                return [
                  c.aircraftId,
                  c.tipo,
                  c.horas_acumuladas.toFixed(1),
                  c.limite_tbo,
                  remaining.toFixed(1),
                  percentage + "%",
                  status
                ];
              })
            ]}
          />
        </div>
      )}
    </div>
  );
}
