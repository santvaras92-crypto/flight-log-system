"use client";

import { useState, useMemo } from "react";
import { signOut } from "next-auth/react";

interface Flight {
  id: number;
  fecha: string;
  hobbs_inicio: number | null;
  hobbs_fin: number | null;
  tach_inicio: number | null;
  tach_fin: number | null;
  diff_hobbs: number | null;
  diff_tach: number | null;
  costo: number | null;
  tarifa: number | null;
  instructor_rate: number | null;
  copiloto: string | null;
  cliente: string | null;
  detalle: string | null;
  aircraftId: string;
  piloto_raw: string | null;
}

interface Deposit {
  id: number;
  fecha: string;
  monto: number;
  descripcion: string;
}

interface PilotData {
  user: {
    id: number;
    nombre: string;
    email: string;
    codigo: string;
    saldo_cuenta: number;
    tarifa_hora: number;
  };
  flights: Flight[];
  deposits: Deposit[];
  summary: {
    totalFlights: number;
    totalHours: number;
    totalSpent: number;
    totalDeposits: number;
    totalFuel: number;
    balance: number;
  };
}

export default function PilotDashboardClient({ data }: { data: PilotData }) {
  const [yearFilter, setYearFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const filteredFlights = useMemo(() => {
    return data.flights.filter(f => {
      if (yearFilter) {
        const year = new Date(f.fecha).getFullYear().toString();
        if (year !== yearFilter) return false;
      }
      if (startDate) {
        const flightDate = new Date(f.fecha).getTime();
        const start = new Date(startDate).getTime();
        if (flightDate < start) return false;
      }
      if (endDate) {
        const flightDate = new Date(f.fecha).getTime();
        const end = new Date(endDate).getTime();
        if (flightDate > end) return false;
      }
      return true;
    });
  }, [data.flights, yearFilter, startDate, endDate]);

  const filteredSummary = useMemo(() => {
    const totalFlights = filteredFlights.length;
    const totalHours = filteredFlights.reduce((sum, f) => sum + (f.diff_hobbs || 0), 0);
    const totalSpent = filteredFlights.reduce((sum, f) => sum + (f.costo || 0), 0);
    return { totalFlights, totalHours, totalSpent };
  }, [filteredFlights]);

  const years = useMemo(() => {
    return Array.from(new Set(data.flights.map(f => new Date(f.fecha).getFullYear()))).sort((a, b) => b - a);
  }, [data.flights]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] shadow-2xl">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.png" 
                alt="CC-AQI" 
                className="h-[6.48rem] w-auto"
              />
              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight">Mi Cuenta de Vuelo</h1>
                <p className="mt-1.5 text-blue-50 text-base font-medium">
                  {data.user.nombre} • {data.user.codigo}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="h-12 px-5 bg-white/20 backdrop-blur-sm hover:bg-white/30 border-2 border-white/30 rounded-xl text-white font-bold transition-all shadow-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">Balance</h3>
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className={`text-3xl font-bold ${data.summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${data.summary.balance.toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-slate-500 mt-1">Saldo actual</p>
          </div>

          <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">Total Vuelos</h3>
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <p className="text-3xl font-bold text-blue-600">{data.summary.totalFlights}</p>
            <p className="text-xs text-slate-500 mt-1">Vuelos registrados</p>
          </div>

          <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">Horas Voladas</h3>
              <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-3xl font-bold text-indigo-600">{data.summary.totalHours.toFixed(1)}</p>
            <p className="text-xs text-slate-500 mt-1">Horas totales</p>
          </div>

          <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">Total Gastado</h3>
              <svg className="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-3xl font-bold text-orange-600">${data.summary.totalSpent.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-500 mt-1">En vuelos</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6 mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filtros
          </h3>
          <div className="flex flex-wrap gap-4">
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
            >
              <option value="">Todos los años</option>
              {years.map(y => (
                <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
              placeholder="Desde"
            />
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
              placeholder="Hasta"
            />
            {(yearFilter || startDate || endDate) && (
              <button
                onClick={() => {
                  setYearFilter("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpiar
              </button>
            )}
          </div>
          {(yearFilter || startDate || endDate) && (
            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-800">
                Resultados filtrados: {filteredSummary.totalFlights} vuelos • {filteredSummary.totalHours.toFixed(1)} hrs • ${filteredSummary.totalSpent.toLocaleString('es-CL')}
              </p>
            </div>
          )}
        </div>

        {/* Deposits Table */}
        {data.deposits.length > 0 && (
          <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-8 py-6">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Depósitos ({data.deposits.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Descripción</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Monto</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {data.deposits.map(d => (
                    <tr key={d.id} className="hover:bg-green-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(d.fecha).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{d.descripcion}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-right">
                        ${d.monto.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Flights Table */}
        <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#003D82] to-[#0A2F5F] px-8 py-6">
            <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Detalle de Vuelos ({filteredFlights.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Horas</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Avión</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Instructor/SP</th>
                  <th className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Costo Total</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Detalle</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredFlights.map(f => {
                  const horas = f.diff_hobbs || 0;
                  const nov25 = new Date('2025-11-25');
                  const flightDate = new Date(f.fecha);
                  let avion = 0;
                  let instructor = 0;
                  
                  if (f.tarifa != null || f.instructor_rate != null) {
                    const rate = f.tarifa || 0;
                    const ir = f.instructor_rate || 0;
                    avion = horas * rate;
                    instructor = horas * ir;
                  } else if (flightDate < nov25 && f.costo) {
                    avion = f.costo;
                    instructor = 0;
                  } else if (f.costo) {
                    avion = f.costo;
                  }

                  return (
                    <tr key={f.id} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 font-medium">
                        {new Date(f.fecha).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-semibold text-blue-600 font-mono text-right">
                        {horas ? `${horas.toFixed(1)} hrs` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-600 font-mono text-right">
                        {avion ? `$${Math.round(avion).toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-600 font-mono text-right">
                        {instructor ? `$${Math.round(instructor).toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-bold text-green-600 font-mono text-right">
                        {f.costo ? `$${Math.round(f.costo).toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate" title={f.detalle || ""}>
                        {f.detalle || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bank Transfer Info */}
        <div className="mt-8 bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Datos para Transferencia
          </h3>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-700 font-semibold">SANTIAGO NICOLAS VARAS SAAVEDRA</p>
            <p className="text-sm text-slate-600">RUT: 18.166.515-7</p>
            <p className="text-sm text-slate-600">Cuenta Corriente Nº 0-000-75-79256-5</p>
            <p className="text-sm text-slate-600">Banco Santander</p>
            <p className="text-sm text-slate-600">Email: SANTVARAS92@GMAIL.COM</p>
          </div>
        </div>
      </div>
    </div>
  );
}
