"use client";

import { useState, useMemo, useEffect } from "react";

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
    oilChangeRemaining: number;
    hundredHourRemaining: number;
    fuelRateLph: number;
    fuelRateGph: number;
    usageStats?: {
      rate30d: number;
      rate60d: number;
      rate90d: number;
      weightedRate: number;
      trend: number;
      stdDev: number;
    };
    hobbsTachRatio: number;
    activityStats?: {
      flightsPerMonth: number;
      avgDaysBetweenFlights: number;
      daysSinceLastFlight: number | null;
      lastFlightDate: string | null;
      flightsThisMonth: number;
      flightsThisYear: number;
      activityTrend: number;
      hours3Months: number;
      hours6Months: number;
      flights3Months: number;
      flights6Months: number;
    };
  };
};

// Palette matching admin dashboard exactly
const palette = {
  bg: 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100',
  card: 'bg-white/95 backdrop-blur-sm border border-slate-200',
  text: 'text-slate-900',
  subtext: 'text-slate-600',
  border: 'border-slate-200',
  shadow: 'shadow-lg'
};

const defaultCardOrder = ['totalHours', 'totalFlights', 'thisMonth', 'avgFlightTime', 'myActivity', 'lastFlight', 'fuelRate', 'deposits', 'flightCost', 'balance', 'fuel', 'nextInspections'];

export default function PilotDashboardClient({ data }: { data: PilotData }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showAllFlights, setShowAllFlights] = useState(false);
  const [cardOrder, setCardOrder] = useState<string[]>(defaultCardOrder);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [touchStartPos, setTouchStartPos] = useState<{x: number, y: number}>({x: 0, y: 0});

  // Load card order from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pilot-overview-card-order');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === defaultCardOrder.length) {
          setCardOrder(parsed);
        }
      } catch {}
    }
  }, []);

  // Save card order to localStorage
  const saveCardOrder = (order: string[]) => {
    localStorage.setItem('pilot-overview-card-order', JSON.stringify(order));
    setCardOrder(order);
  };

  // Drag handlers
  const handleDragStart = (cardId: string) => {
    setDraggedCard(cardId);
    setIsDragEnabled(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetCardId: string) => {
    if (!draggedCard || draggedCard === targetCardId) return;
    const newOrder = [...cardOrder];
    const draggedIdx = newOrder.indexOf(draggedCard);
    const targetIdx = newOrder.indexOf(targetCardId);
    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedCard);
    saveCardOrder(newOrder);
    setDraggedCard(null);
    setIsDragEnabled(false);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setIsDragEnabled(false);
  };

  // Touch handlers for mobile drag
  const handleTouchStart = (e: React.TouchEvent, cardId: string) => {
    setTouchStartTime(Date.now());
    setTouchStartPos({x: e.touches[0].clientX, y: e.touches[0].clientY});
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggedCard) return;
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    const targetCard = elements.find(el => el.getAttribute('data-card-id'));
    if (targetCard) {
      const targetId = targetCard.getAttribute('data-card-id');
      if (targetId && targetId !== draggedCard) {
        handleDrop(targetId);
        setDraggedCard(targetId);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, cardId: string) => {
    const elapsed = Date.now() - touchStartTime;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.x);
    const dy = Math.abs(touch.clientY - touchStartPos.y);
    
    if (elapsed > 300 && dx < 10 && dy < 10 && !draggedCard) {
      setDraggedCard(cardId);
      setIsDragEnabled(true);
    } else {
      setDraggedCard(null);
      setIsDragEnabled(false);
    }
  };

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

  // Overview cards definition (same style as admin)
  const overviewCards: Record<string, JSX.Element> = {
    totalHours: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Horas Totales</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{data.metrics.totalHours.toLocaleString()}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">horas de vuelo</p>
      </div>
    ),
    totalFlights: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Total Vuelos</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{data.metrics.totalFlights.toLocaleString()}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">vuelos registrados</p>
      </div>
    ),
    thisMonth: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Este Mes</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{data.metrics.thisMonthFlights}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">{data.metrics.thisMonthHours} hrs voladas</p>
      </div>
    ),
    avgFlightTime: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-rose-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Tiempo Prom.</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{data.metrics.avgFlightTime}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">hrs por vuelo</p>
      </div>
    ),
    myActivity: (() => {
      const stats = data.metrics.activityStats;
      if (!stats) {
        return (
          <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] flex flex-col`}>
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center mb-2 sm:mb-4">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Tu Actividad</h3>
            <div className="text-xl sm:text-3xl font-bold text-slate-400 mb-0.5 sm:mb-1">—</div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">Sin datos</p>
          </div>
        );
      }
      
      const trend = stats.activityTrend;
      const trendColor = trend > 5 ? 'text-green-600' : trend < -5 ? 'text-orange-600' : 'text-blue-600';
      const trendIcon = trend > 5 ? '↗️' : trend < -5 ? '↘️' : '→';
      const trendText = trend > 5 ? `+${trend}%` : trend < -5 ? `${trend}%` : 'estable';
      
      const formatLastFlightDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
      };
      
      const thisMonthHours = data.metrics.thisMonthHours;
      
      return (
        <div className={`${palette.card} rounded-xl p-3 sm:p-4 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-slate-900 text-xs sm:text-sm font-bold uppercase tracking-wide">Tu Actividad</h3>
            </div>
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[8px] sm:text-[10px] font-bold rounded-full">📊 STATS</span>
          </div>
          
          {/* Main stat */}
          <div className="text-center mb-1 sm:mb-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.flightsPerMonth}</div>
            <div className="text-xs sm:text-sm text-slate-600 font-medium">vuelos/mes</div>
            <div className={`text-xs sm:text-sm font-semibold ${trendColor} mt-1`}>
              {trendIcon} {trendText} vs mes anterior
            </div>
          </div>
          
          {/* Divider */}
          <div className="border-t border-slate-200 my-1"></div>
          
          {/* Last flight and hours inline */}
          <div className="space-y-0.5 sm:space-y-1.5">
            {stats.daysSinceLastFlight !== null && (
              <div className="text-[10px] sm:text-xs">
                <span className="text-slate-600">📅 Último:</span>
                <span className="ml-1 font-semibold text-slate-900">hace {stats.daysSinceLastFlight}d</span>
                {stats.lastFlightDate && <span className="text-slate-500 ml-1">({formatLastFlightDate(stats.lastFlightDate)})</span>}
              </div>
            )}
            
            <div className="text-[10px] sm:text-xs text-slate-700 flex flex-wrap items-center gap-x-1">
              <span className="text-slate-600">⏱️</span>
              <span className="font-semibold text-slate-900">{thisMonthHours.toFixed(1)}h</span>
              <span className="text-slate-500">({stats.flightsThisMonth})</span>
              <span className="text-slate-400">•</span>
              <span className="font-semibold text-slate-900">{stats.hours3Months.toFixed(1)}h</span>
              <span className="text-slate-500">(3M,{stats.flights3Months})</span>
              <span className="text-slate-400">•</span>
              <span className="font-semibold text-slate-900">{stats.hours6Months.toFixed(1)}h</span>
              <span className="text-slate-500">(6M,{stats.flights6Months})</span>
            </div>
          </div>
          
          {/* Footer */}
          <div className="mt-auto pt-1 border-t border-slate-200">
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <div className="text-slate-600">
                📆 Este año: <span className="font-semibold text-slate-800">{stats.flightsThisYear}</span>
              </div>
            </div>
          </div>
        </div>
      );
    })(),
    lastFlight: (() => {
      // Find the most recent flight
      const sortedFlights = [...data.flights].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const lastFlight = sortedFlights[0];
      
      if (!lastFlight) {
        return (
          <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col bg-slate-50`}>
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-200 flex items-center justify-center mb-2 sm:mb-4">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <h3 className="text-slate-400 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Último Vuelo</h3>
            <div className="text-xl sm:text-3xl font-bold text-slate-400 mb-0.5 sm:mb-1">—</div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">Sin vuelos registrados</p>
          </div>
        );
      }
      
      const lastFlightDate = new Date(lastFlight.fecha);
      const today = new Date();
      const daysSince = Math.floor((today.getTime() - lastFlightDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determine color based on days
      const getStatusStyle = () => {
        if (daysSince >= 60) return {
          bg: 'bg-red-50',
          iconBg: 'bg-red-100',
          iconText: 'text-red-600',
          textColor: 'text-red-600',
          badge: 'bg-red-100 text-red-700',
          badgeText: '⚠️ INACTIVO',
          ring: 'ring-2 ring-red-400'
        };
        if (daysSince >= 30) return {
          bg: 'bg-yellow-50',
          iconBg: 'bg-yellow-100',
          iconText: 'text-yellow-600',
          textColor: 'text-yellow-600',
          badge: 'bg-yellow-100 text-yellow-700',
          badgeText: '⚠️',
          ring: ''
        };
        return {
          bg: 'bg-green-50',
          iconBg: 'bg-green-100',
          iconText: 'text-green-600',
          textColor: 'text-green-600',
          badge: 'bg-green-100 text-green-700',
          badgeText: '✅',
          ring: ''
        };
      };
      
      const style = getStatusStyle();
      const formattedDate = lastFlightDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
      
      return (
        <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col ${style.bg} ${style.ring}`}>
          <div className="flex items-start justify-between mb-2 sm:mb-4">
            <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full ${style.iconBg} flex items-center justify-center`}>
              <svg className={`w-4 h-4 sm:w-6 sm:h-6 ${style.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 ${style.badge} text-[9px] sm:text-xs font-semibold rounded-full`}>
              {style.badgeText}
            </span>
          </div>
          <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Último Vuelo</h3>
          <div className={`text-xl sm:text-3xl font-bold ${style.textColor} mb-0.5 sm:mb-1`}>
            {daysSince === 0 ? 'Hoy' : daysSince === 1 ? 'Ayer' : `hace ${daysSince}d`}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">{formattedDate}</p>
          <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">
            {daysSince >= 60 ? '⚠️ Más de 60 días sin volar' : daysSince >= 30 ? 'Más de 30 días sin volar' : 'Actividad reciente'}
          </p>
        </div>
      );
    })(),
    fuelRate: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-100 text-green-700 text-[9px] sm:text-xs font-semibold rounded-full">LIVE</span>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Fuel Rate</h3>
        <div className="space-y-0.5 sm:space-y-1">
          <div className="text-lg sm:text-3xl font-bold text-slate-900">
            {data.metrics.fuelRateLph.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm sm:text-xl text-slate-600">L/H</span>
          </div>
          <div className="text-base sm:text-xl font-semibold text-amber-600">
            {data.metrics.fuelRateGph.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs sm:text-base text-slate-600">GAL/H</span>
          </div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Since Sep 9, 2020 • Excludes 10% idle</p>
      </div>
    ),
    deposits: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Depósitos</h3>
        <div className="text-lg sm:text-3xl font-bold text-green-600 mb-0.5 sm:mb-1">{formatCurrency(data.metrics.totalDeposits)}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">total abonado</p>
      </div>
    ),
    flightCost: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Costo Vuelos</h3>
        <div className="text-lg sm:text-3xl font-bold text-red-600 mb-0.5 sm:mb-1">{formatCurrency(data.metrics.totalCost)}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">total consumido</p>
      </div>
    ),
    balance: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col ${data.metrics.balance >= 0 ? 'ring-2 ring-green-400' : 'ring-2 ring-red-400'}`}>
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full ${data.metrics.balance >= 0 ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center`}>
            <svg className={`w-4 h-4 sm:w-6 sm:h-6 ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 ${data.metrics.balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-[9px] sm:text-xs font-semibold rounded-full`}>
            {data.metrics.balance >= 0 ? 'A FAVOR' : 'PAGAR'}
          </span>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Tu Saldo</h3>
        <div className={`text-lg sm:text-3xl font-bold ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'} mb-0.5 sm:mb-1`}>
          {formatCurrency(Math.abs(data.metrics.balance))}
        </div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">{data.metrics.balance >= 0 ? 'a favor' : 'pendiente'}</p>
      </div>
    ),
    fuel: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-orange-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Combustible</h3>
        <div className="text-lg sm:text-3xl font-bold text-orange-600 mb-0.5 sm:mb-1">{formatCurrency(data.metrics.totalFuel)}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">total registrado</p>
      </div>
    ),
    nextInspections: (() => {
      const stats = data.metrics.usageStats;
      const oilRemaining = data.metrics.oilChangeRemaining;
      const hundredRemaining = data.metrics.hundredHourRemaining;
      const hobbsTachRatio = data.metrics.hobbsTachRatio || 1.25;
      const weightedRate = stats?.weightedRate || 0;
      const stdDev = stats?.stdDev || 0;
      const trend = stats?.trend || 0;
      
      // Intervals for progress calculation
      const OIL_INTERVAL = 50; // TACH hours
      const HUNDRED_HR_INTERVAL = 100; // TACH hours
      
      // Calculate predictions
      const calcPrediction = (hoursRemaining: number) => {
        if (weightedRate <= 0) return { days: 0, minDays: 0, maxDays: 0, date: null, minDate: null, maxDate: null };
        
        const days = Math.round(hoursRemaining / weightedRate);
        const uncertainty = 1.96 * stdDev * Math.sqrt(days) / weightedRate;
        const minDays = Math.max(1, Math.round(days - uncertainty));
        const maxDays = Math.round(days + uncertainty);
        
        const today = new Date();
        const date = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
        const minDate = new Date(today.getTime() + minDays * 24 * 60 * 60 * 1000);
        const maxDate = new Date(today.getTime() + maxDays * 24 * 60 * 60 * 1000);
        
        return { days, minDays, maxDays, date, minDate, maxDate };
      };
      
      const oilPred = calcPrediction(oilRemaining);
      const hundredPred = calcPrediction(hundredRemaining);
      
      const formatDateShort = (d: Date | null) => d ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '') : '-';
      
      // Progress bar color based on remaining percentage
      const getProgressColor = (remaining: number, total: number) => {
        const pct = (remaining / total) * 100;
        if (pct <= 20) return 'bg-red-500';
        if (pct <= 40) return 'bg-orange-500';
        if (pct <= 60) return 'bg-yellow-500';
        return 'bg-green-500';
      };
      
      const getProgressBg = (remaining: number, total: number) => {
        const pct = (remaining / total) * 100;
        if (pct <= 20) return 'bg-red-100';
        if (pct <= 40) return 'bg-orange-100';
        if (pct <= 60) return 'bg-yellow-100';
        return 'bg-green-100';
      };
      
      const oilPct = Math.min(100, Math.max(0, 100 - (oilRemaining / OIL_INTERVAL) * 100));
      const hundredPct = Math.min(100, Math.max(0, 100 - (hundredRemaining / HUNDRED_HR_INTERVAL) * 100));
      const oilHobbsRemaining = oilRemaining * hobbsTachRatio;
      const hundredHobbsRemaining = hundredRemaining * hobbsTachRatio;
      
      return (
        <div className={`${palette.card} rounded-xl p-3 sm:p-4 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-slate-900 text-xs sm:text-sm font-bold uppercase tracking-wide">Estado Avión</h3>
            </div>
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[8px] sm:text-[10px] font-bold rounded-full">🔮 SMART</span>
          </div>
          
          {/* Oil Change Section */}
          <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-700">🛢️ CAMBIO ACEITE</span>
              <span className="text-[10px] sm:text-xs font-mono text-slate-600">{oilPct.toFixed(0)}%</span>
            </div>
            <div className={`w-full h-2.5 sm:h-3 rounded-full ${getProgressBg(oilRemaining, OIL_INTERVAL)} overflow-hidden`}>
              <div 
                className={`h-full rounded-full ${getProgressColor(oilRemaining, OIL_INTERVAL)} transition-all duration-500`}
                style={{ width: `${oilPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="text-[10px] sm:text-xs text-slate-800 font-bold">
                {oilRemaining.toFixed(1)} TACH <span className="text-slate-500 font-semibold">({oilHobbsRemaining.toFixed(1)} HOBBS)</span>
              </div>
              {weightedRate > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-900 font-bold flex items-center gap-1">
                  📅 {formatDateShort(oilPred.date)} <span className="text-slate-600 font-semibold">{oilPred.days}d</span>
                </div>
              )}
            </div>
          </div>
          
          {/* 100hr Inspection Section */}
          <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-700">⚙️ INSPECCIÓN 100 HRS</span>
              <span className="text-[10px] sm:text-xs font-mono text-slate-600">{hundredPct.toFixed(0)}%</span>
            </div>
            <div className={`w-full h-2.5 sm:h-3 rounded-full ${getProgressBg(hundredRemaining, HUNDRED_HR_INTERVAL)} overflow-hidden`}>
              <div 
                className={`h-full rounded-full ${getProgressColor(hundredRemaining, HUNDRED_HR_INTERVAL)} transition-all duration-500`}
                style={{ width: `${hundredPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <div className="text-[10px] sm:text-xs text-slate-800 font-bold">
                {hundredRemaining.toFixed(1)} TACH <span className="text-slate-500 font-semibold">({hundredHobbsRemaining.toFixed(1)} HOBBS)</span>
              </div>
              {weightedRate > 0 && (
                <div className="text-[10px] sm:text-xs text-slate-900 font-bold flex items-center gap-1">
                  📅 {formatDateShort(hundredPred.date)} <span className="text-slate-600 font-semibold">{hundredPred.days}d</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Usage Stats Footer - Simplified for pilots */}
          <div className="mt-auto pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <div className="flex flex-col gap-0.5 text-slate-700">
                <span className="font-extrabold text-slate-900">{(weightedRate * 7).toFixed(1)} TACH/sem</span>
                <span className="font-semibold text-slate-800">{(weightedRate * hobbsTachRatio * 7).toFixed(1)} HOBBS/sem</span>
              </div>
              <span className={`font-semibold ${trend > 0 ? 'text-orange-600' : trend < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                {trend > 0 ? '↗️' : trend < 0 ? '↘️' : '→'} {Math.abs(trend).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      );
    })(),
  };

  // Render draggable card
  const renderCard = (cardId: string, content: JSX.Element) => {
    const isDragging = draggedCard === cardId;
    const isBeingDragged = isDragEnabled && draggedCard === cardId;
    // Complex cards span 2 columns on mobile
    const isComplexCard = cardId === 'nextInspections';
    return (
      <div
        key={cardId}
        data-card-id={cardId}
        draggable
        onDragStart={() => handleDragStart(cardId)}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(cardId)}
        onDragEnd={handleDragEnd}
        onTouchStart={(e) => handleTouchStart(e, cardId)}
        onTouchMove={handleTouchMove}
        onTouchEnd={(e) => handleTouchEnd(e, cardId)}
        className={`${isDragging ? 'opacity-50 scale-95' : 'opacity-100'} ${isComplexCard ? 'col-span-2 lg:col-span-1' : ''} transition-all duration-150 cursor-move select-none`}
        style={{ 
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: isBeingDragged ? 'none' : 'auto'
        }}
      >
        {content}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards - Same style as admin */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {cardOrder.map(cardId => overviewCards[cardId] ? renderCard(cardId, overviewCards[cardId]) : null)}
      </div>

      {/* Flights Table */}
      <div className={`${palette.card} rounded-xl ${palette.shadow} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
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
                <th className="px-4 py-3 text-left font-medium text-slate-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Aeronave</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Hobbs</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Horas</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Costo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Instructor</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedFlights.map((flight) => (
                <tr key={flight.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{formatDate(flight.fecha)}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{flight.aircraftId || '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {flight.hobbs_inicio.toFixed(1)} → {flight.hobbs_fin.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {flight.diff_hobbs.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatCurrency(flight.costo)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{flight.copiloto || flight.instructor || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-[200px]" title={flight.detalle || ''}>
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
      <div className="grid md:grid-cols-2 gap-6">
        {/* Deposits */}
        <div className={`${palette.card} rounded-xl ${palette.shadow} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-200">
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
                {data.deposits.db.map((d) => (
                  <tr key={`db-${d.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{formatDate(d.fecha)}</td>
                    <td className="px-4 py-2 text-slate-600">{d.detalle || 'Depósito'}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-medium">
                      {formatCurrency(d.monto)}
                    </td>
                  </tr>
                ))}
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
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 font-medium">Total</span>
              <span className="font-bold text-green-600">{formatCurrency(data.metrics.totalDeposits)}</span>
            </div>
          </div>
        </div>

        {/* Fuel */}
        <div className={`${palette.card} rounded-xl ${palette.shadow} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-200">
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
                {data.fuel.db.map((f) => (
                  <tr key={`db-${f.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{formatDate(f.fecha)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{f.litros.toFixed(1)} L</td>
                    <td className="px-4 py-2 text-right text-orange-600 font-medium">
                      {formatCurrency(f.monto)}
                    </td>
                  </tr>
                ))}
                {data.fuel.csv.map((f, i) => (
                  <tr key={`csv-${i}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{f.fecha}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{f.litros.toFixed(1)} L</td>
                    <td className="px-4 py-2 text-right text-orange-600 font-medium">
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
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 font-medium">Total</span>
              <span className="font-bold text-orange-600">{formatCurrency(data.metrics.totalFuel)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Summary */}
      <div className={`${palette.card} rounded-xl ${palette.shadow} p-6`}>
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
          <div className={`flex justify-between items-center py-3 ${data.metrics.balance >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg px-4 mt-2`}>
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
