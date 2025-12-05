"use client";

import { useState, useMemo } from "react";

type Flight = {
  id: number;
  fecha: string;
  hobbs_inicio: number;
  hobbs_fin: number;
  tach_inicio: number;
  tach_fin: number;
  diff_hobbs: number;
  diff_tach: number;
  costo: number;
  tarifa: number | null;
  instructor_rate: number | null;
  copiloto: string | null;
  cliente: string | null;
  instructor: string | null;
  detalle: string | null;
  aircraftId: string | null;
  piloto_raw: string | null;
  pilotoId: number | null;
};

type PilotData = {
  pilot: {
    id: number;
    nombre: string;
    codigo: string | null;
    email: string | null;
    saldo_cuenta: number;
    tarifa_hora: number;
  };
  flights: Flight[];
  deposits: {
    db: { id: number; fecha: string; monto: number; detalle: string | null }[];
    csv: { fecha: string; descripcion: string; monto: number }[];
  };
  fuel: {
    db: { id: number; fecha: string; litros: number; monto: number; detalle: string | null }[];
    csv: { fecha: string; litros: number; monto: number }[];
  };
  metrics: {
    totalFlights: number;
    totalHours: number;
    totalCost: number;
    totalDeposits: number;
    totalFuel: number;
    balance: number;
    thisMonthFlights: number;
    thisMonthHours: number;
    avgFlightTime: number;
  };
};

export default function PilotDashboardClient({ data }: { data: PilotData }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showAllFlights, setShowAllFlights] = useState(false);

  // Get available years from flights
  const availableYears = useMemo(() => {
    const years = new Set(data.flights.map(f => new Date(f.fecha).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [data.flights]);

  // Filter flights by year
  const filteredFlights = useMemo(() => {
    if (!selectedYear) return data.flights;
    return data.flights.filter(f => new Date(f.fecha).getFullYear() === selectedYear);
  }, [data.flights, selectedYear]);

  // Recalculate metrics for filtered flights
  const filteredMetrics = useMemo(() => {
    const totalHours = filteredFlights.reduce((sum, f) => sum + (f.diff_hobbs || 0), 0);
    const totalCost = filteredFlights.reduce((sum, f) => sum + (f.costo || 0), 0);
    return {
      totalFlights: filteredFlights.length,
      totalHours: Number(totalHours.toFixed(1)),
      totalCost: totalCost,
    };
  }, [filteredFlights]);

  const displayedFlights = showAllFlights ? filteredFlights : filteredFlights.slice(0, 20);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Total Hours */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Horas Totales</div>
          <div className="text-2xl font-bold text-slate-800">{data.metrics.totalHours}</div>
          <div className="text-xs text-slate-400 mt-1">hrs de vuelo</div>
        </div>

        {/* Total Flights */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Total Vuelos</div>
          <div className="text-2xl font-bold text-slate-800">{data.metrics.totalFlights}</div>
          <div className="text-xs text-slate-400 mt-1">vuelos registrados</div>
        </div>

        {/* This Month */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Este Mes</div>
          <div className="text-2xl font-bold text-slate-800">{data.metrics.thisMonthFlights}</div>
          <div className="text-xs text-slate-400 mt-1">{data.metrics.thisMonthHours} hrs</div>
        </div>

        {/* Average Flight Time */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Tiempo Promedio</div>
          <div className="text-2xl font-bold text-slate-800">{data.metrics.avgFlightTime}</div>
          <div className="text-xs text-slate-400 mt-1">hrs por vuelo</div>
        </div>

        {/* Total Deposits */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Depósitos</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(data.metrics.totalDeposits)}</div>
          <div className="text-xs text-slate-400 mt-1">total abonado</div>
        </div>

        {/* Total Flight Cost */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Costo Vuelos</div>
          <div className="text-2xl font-bold text-red-600">{formatCurrency(data.metrics.totalCost)}</div>
          <div className="text-xs text-slate-400 mt-1">total consumido</div>
        </div>

        {/* Balance */}
        <div className={`bg-white rounded-xl shadow-sm p-4 border-2 ${data.metrics.balance >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="text-sm text-slate-500 mb-1">Tu Saldo</div>
          <div className={`text-2xl font-bold ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(data.metrics.balance)}
          </div>
          <div className="text-xs text-slate-400 mt-1">{data.metrics.balance >= 0 ? 'a favor' : 'por pagar'}</div>
        </div>

        {/* Fuel Credits */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Combustible</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(data.metrics.totalFuel)}</div>
          <div className="text-xs text-slate-400 mt-1">total registrado</div>
        </div>
      </div>

      {/* Flights Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Mis Vuelos</h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedYear || ''}
              onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : null)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los años</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            {selectedYear && (
              <span className="text-sm text-slate-500">
                {filteredMetrics.totalFlights} vuelos, {filteredMetrics.totalHours} hrs
              </span>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Fecha</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Aeronave</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Hobbs</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Horas</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Costo</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Instructor</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedFlights.map((flight) => (
                <tr key={flight.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700">{formatDate(flight.fecha)}</td>
                  <td className="px-4 py-2 text-slate-700">{flight.aircraftId || '-'}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {flight.hobbs_inicio.toFixed(1)} → {flight.hobbs_fin.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">
                    {flight.diff_hobbs.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    {formatCurrency(flight.costo)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{flight.instructor || '-'}</td>
                  <td className="px-4 py-2 text-slate-500 truncate max-w-[200px]" title={flight.detalle || ''}>
                    {flight.detalle || '-'}
                  </td>
                </tr>
              ))}
              {displayedFlights.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay vuelos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredFlights.length > 20 && !showAllFlights && (
          <div className="px-4 py-3 border-t border-slate-200 text-center">
            <button
              onClick={() => setShowAllFlights(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Ver todos los vuelos ({filteredFlights.length})
            </button>
          </div>
        )}
        
        {showAllFlights && filteredFlights.length > 20 && (
          <div className="px-4 py-3 border-t border-slate-200 text-center">
            <button
              onClick={() => setShowAllFlights(false)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Mostrar menos
            </button>
          </div>
        )}
      </div>

      {/* Balance Details */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Deposits */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800">Depósitos</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Fecha</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Descripción</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* DB deposits */}
                {data.deposits.db.map((d) => (
                  <tr key={`db-${d.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{formatDate(d.fecha)}</td>
                    <td className="px-4 py-2 text-slate-600">{d.detalle || 'Depósito'}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-medium">
                      {formatCurrency(d.monto)}
                    </td>
                  </tr>
                ))}
                {/* CSV deposits */}
                {data.deposits.csv.map((d, i) => (
                  <tr key={`csv-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{d.fecha}</td>
                    <td className="px-4 py-2 text-slate-600">{d.descripcion || 'Depósito'}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-medium">
                      {formatCurrency(d.monto)}
                    </td>
                  </tr>
                ))}
                {data.deposits.db.length === 0 && data.deposits.csv.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No hay depósitos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total</span>
              <span className="font-bold text-green-600">{formatCurrency(data.metrics.totalDeposits)}</span>
            </div>
          </div>
        </div>

        {/* Fuel */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800">Combustible</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Fecha</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600">Litros</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-600">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* DB fuel */}
                {data.fuel.db.map((f) => (
                  <tr key={`db-${f.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{formatDate(f.fecha)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{f.litros.toFixed(1)} L</td>
                    <td className="px-4 py-2 text-right text-blue-600 font-medium">
                      {formatCurrency(f.monto)}
                    </td>
                  </tr>
                ))}
                {/* CSV fuel */}
                {data.fuel.csv.map((f, i) => (
                  <tr key={`csv-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{f.fecha}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{f.litros.toFixed(1)} L</td>
                    <td className="px-4 py-2 text-right text-blue-600 font-medium">
                      {formatCurrency(f.monto)}
                    </td>
                  </tr>
                ))}
                {data.fuel.db.length === 0 && data.fuel.csv.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No hay registros de combustible
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total</span>
              <span className="font-bold text-blue-600">{formatCurrency(data.metrics.totalFuel)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Resumen de Cuenta</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-600">Total Depósitos</span>
            <span className="font-medium text-green-600">+ {formatCurrency(data.metrics.totalDeposits)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-slate-600">Total Vuelos ({data.metrics.totalFlights} vuelos)</span>
            <span className="font-medium text-red-600">- {formatCurrency(data.metrics.totalCost)}</span>
          </div>
          <div className="flex justify-between items-center py-3 bg-slate-50 rounded-lg px-3 mt-2">
            <span className="font-semibold text-slate-700">Saldo Actual</span>
            <span className={`text-xl font-bold ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.metrics.balance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
