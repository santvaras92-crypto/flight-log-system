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

const defaultCardOrder = ['totalHours', 'totalFlights', 'thisMonth', 'avgFlightTime', 'deposits', 'flightCost', 'balance', 'fuel', 'nextInspections'];

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
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Horas Totales</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">{data.metrics.totalHours.toLocaleString()}</div>
        <p className="text-sm text-slate-600 font-medium">horas de vuelo</p>
      </div>
    ),
    totalFlights: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Total Vuelos</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">{data.metrics.totalFlights.toLocaleString()}</div>
        <p className="text-sm text-slate-600 font-medium">vuelos registrados</p>
      </div>
    ),
    thisMonth: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Este Mes</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">{data.metrics.thisMonthFlights}</div>
        <p className="text-sm text-slate-600 font-medium">{data.metrics.thisMonthHours} horas voladas</p>
      </div>
    ),
    avgFlightTime: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Tiempo Promedio</h3>
        <div className="text-3xl font-bold text-slate-900 mb-1">{data.metrics.avgFlightTime}</div>
        <p className="text-sm text-slate-600 font-medium">hrs por vuelo</p>
      </div>
    ),
    deposits: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Depósitos</h3>
        <div className="text-3xl font-bold text-green-600 mb-1">{formatCurrency(data.metrics.totalDeposits)}</div>
        <p className="text-sm text-slate-600 font-medium">total abonado</p>
      </div>
    ),
    flightCost: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Costo Vuelos</h3>
        <div className="text-3xl font-bold text-red-600 mb-1">{formatCurrency(data.metrics.totalCost)}</div>
        <p className="text-sm text-slate-600 font-medium">total consumido</p>
      </div>
    ),
    balance: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow} ${data.metrics.balance >= 0 ? 'ring-2 ring-green-400' : 'ring-2 ring-red-400'}`}>
        <div className="flex items-start justify-between mb-4">
          <div className={`w-12 h-12 rounded-full ${data.metrics.balance >= 0 ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center`}>
            <svg className={`w-6 h-6 ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <span className={`px-2 py-1 ${data.metrics.balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-xs font-semibold rounded-full`}>
            {data.metrics.balance >= 0 ? 'A FAVOR' : 'POR PAGAR'}
          </span>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Tu Saldo</h3>
        <div className={`text-3xl font-bold ${data.metrics.balance >= 0 ? 'text-green-600' : 'text-red-600'} mb-1`}>
          {formatCurrency(Math.abs(data.metrics.balance))}
        </div>
        <p className="text-sm text-slate-600 font-medium">{data.metrics.balance >= 0 ? 'saldo a favor' : 'saldo pendiente'}</p>
      </div>
    ),
    fuel: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Combustible</h3>
        <div className="text-3xl font-bold text-orange-600 mb-1">{formatCurrency(data.metrics.totalFuel)}</div>
        <p className="text-sm text-slate-600 font-medium">total registrado</p>
      </div>
    ),
    nextInspections: (
      <div className={`${palette.card} rounded-xl p-6 ${palette.shadow}`}>
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Próximas Inspecciones</h3>
        <div className="space-y-2">
          <div>
            <div className="text-sm text-slate-600 font-medium">Cambio Aceite</div>
            <div className="text-2xl font-bold text-slate-900">{data.metrics.oilChangeRemaining} hrs</div>
          </div>
          <div>
            <div className="text-sm text-slate-600 font-medium">Inspección 100hr</div>
            <div className="text-2xl font-bold text-slate-900">{data.metrics.hundredHourRemaining} hrs</div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Basado en horas TACH</p>
      </div>
    ),
  };

  // Render draggable card
  const renderCard = (cardId: string, content: JSX.Element) => {
    const isDragging = draggedCard === cardId;
    const isBeingDragged = isDragEnabled && draggedCard === cardId;
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
        className={`${isDragging ? 'opacity-50 scale-95' : 'opacity-100'} transition-all duration-150 cursor-move select-none`}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <td className="px-4 py-3 text-slate-600">{flight.instructor || '-'}</td>
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
