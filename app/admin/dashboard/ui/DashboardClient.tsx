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
  fuelLogs?: any[];
  fuelByCode?: Record<string, number>;
  fuelDetailsByCode?: Record<string, { fecha: string; litros: number; monto: number }[]>;
  csvPilotStats?: Record<string, { flights: number; hours: number; spent: number }>;
  depositsByCode?: Record<string, number>;
  depositsDetailsByCode?: Record<string, { fecha: string; descripcion: string; monto: number }[]>;
  pilotDirectory?: {
    initial: { id: number | null; code: string; name: string; email?: string | null; createdAt?: Date | null; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null; source?: string }[];
    registered: { id: number; code: string; name: string; email: string | null; createdAt: string | Date; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null }[];
  };
  aircraftYearlyStats?: { matricula: string; avgHoursPerYear: number; totalHours: number; yearsOfOperation: number }[];
};
type PaginationInfo = { page: number; pageSize: number; total: number };
type OverviewMetrics = {
  totalHours: number;
  totalFlights: number;
  totalRevenue: number;
  fuelConsumed: number;
  hoursSinceSep2020: number;
  fuelRateLph?: number;
  fuelRateGph?: number;
  activePilots: number;
  pendingBalance: number;
  thisMonthFlights: number;
  thisMonthHours: number;
  nextInspections?: {
    oilChangeRemaining: number;
    hundredHourRemaining: number;
  };
};

export default function DashboardClient({ initialData, overviewMetrics, pagination, allowedPilotCodes, registeredPilotCodes, csvPilotNames }: { initialData: InitialData; overviewMetrics?: OverviewMetrics; pagination?: PaginationInfo; allowedPilotCodes?: string[]; registeredPilotCodes?: string[]; csvPilotNames?: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [pilotSubTab, setPilotSubTab] = useState<"accounts" | "directory" | "deposits">("accounts");
  const [filterAircraft, setFilterAircraft] = useState("");
  const [filterPilot, setFilterPilot] = useState("");
  const [theme, setTheme] = useState<string>('hybrid');
  const [yearFilter, setYearFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"desc"|"asc">("desc");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(pagination?.page || 1);
  const [editMode, setEditMode] = useState(false);
  const [activeDaysLimit, setActiveDaysLimit] = useState<number>(30);
  const [showActivePilots, setShowActivePilots] = useState(false);
  const [cardOrder, setCardOrder] = useState<string[]>([]);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const pageSize = pagination?.pageSize || 100;
  useEffect(() => { localStorage.setItem('dash-theme', theme); }, [theme]);
  
  // Load card order from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('overview-card-order');
    if (saved) {
      try {
        setCardOrder(JSON.parse(saved));
      } catch {
        setCardOrder(['fuelRate', 'totalHours', 'totalFlights', 'nextInspections', 'fuelConsumed', 'activePilots', 'pendingBalance', 'thisMonth', 'avgFlightTime']);
      }
    } else {
      setCardOrder(['fuelRate', 'totalHours', 'totalFlights', 'nextInspections', 'fuelConsumed', 'activePilots', 'pendingBalance', 'thisMonth', 'avgFlightTime']);
    }
  }, []);

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
      });
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
  }, [initialData.flights, filterAircraft, yearFilter, sortOrder, startDate, endDate, currentPage, pageSize, pagination]);

  const submissions = useMemo(() => {
    return initialData.submissions.filter(s => {
      const u = initialData.users.find(u => u.id === s.pilotoId);
      return (!filterPilot || (u?.nombre || "").toLowerCase().includes(filterPilot.toLowerCase()));
    });
  }, [initialData.submissions, initialData.users, filterPilot]);

  const palette = {
    bg: 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100',
    card: 'bg-white/95 backdrop-blur-sm border border-slate-200',
    text: 'text-slate-900',
    subtext: 'text-slate-600',
    border: 'border-slate-200',
    accent: '#2563eb',
    accent2: '#059669',
    grid: 'rgba(100,116,139,0.08)',
    shadow: 'shadow-lg'
  };

  // Drag and drop handlers for Overview cards (mouse and touch)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [touchHoldTimer, setTouchHoldTimer] = useState<NodeJS.Timeout | null>(null);
  const [isDragEnabled, setIsDragEnabled] = useState(false);

  const handleDragStart = (cardId: string) => {
    setDraggedCard(cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetCardId: string) => {
    if (!draggedCard || draggedCard === targetCardId) {
      setDraggedCard(null);
      return;
    }
    
    const newOrder = [...cardOrder];
    const draggedIndex = newOrder.indexOf(draggedCard);
    const targetIndex = newOrder.indexOf(targetCardId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCard(null);
      return;
    }
    
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedCard);
    
    setCardOrder(newOrder);
    localStorage.setItem('overview-card-order', JSON.stringify(newOrder));
    setDraggedCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
  };

  // Touch handlers for mobile - require 300ms hold before drag activates
  const handleTouchStart = (e: React.TouchEvent, cardId: string) => {
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    
    // Start a timer - only enable drag after 300ms hold
    const timer = setTimeout(() => {
      setDraggedCard(cardId);
      setIsDragEnabled(true);
      // Haptic feedback on supported devices
      if (navigator.vibrate) navigator.vibrate(50);
    }, 300);
    
    setTouchHoldTimer(timer);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
    
    // If moved before hold timer completes, cancel drag and allow scroll
    if (!isDragEnabled && (deltaX > 10 || deltaY > 10)) {
      if (touchHoldTimer) {
        clearTimeout(touchHoldTimer);
        setTouchHoldTimer(null);
      }
      setTouchStartPos(null);
      return;
    }
    
    // If drag is enabled, prevent scrolling
    if (isDragEnabled && draggedCard) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, targetCardId: string) => {
    // Clear the hold timer
    if (touchHoldTimer) {
      clearTimeout(touchHoldTimer);
      setTouchHoldTimer(null);
    }
    
    if (!draggedCard || !isDragEnabled) {
      setDraggedCard(null);
      setIsDragEnabled(false);
      setTouchStartPos(null);
      return;
    }
    
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the card element
    let cardElement = element;
    while (cardElement && !cardElement.getAttribute('data-card-id')) {
      cardElement = cardElement.parentElement;
    }
    
    const droppedOnCardId = cardElement?.getAttribute('data-card-id');
    
    if (droppedOnCardId && droppedOnCardId !== draggedCard) {
      handleDrop(droppedOnCardId);
    } else {
      setDraggedCard(null);
    }
    
    setIsDragEnabled(false);
    setTouchStartPos(null);
  };

  // Render individual metric card with drag-and-drop
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

  // Define all Overview cards
  const overviewCards: Record<string, JSX.Element> = overviewMetrics ? {
    fuelRate: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
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
            {typeof overviewMetrics?.fuelRateLph === 'number' 
              ? overviewMetrics.fuelRateLph.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
              : '0,00'} <span className="text-sm sm:text-xl text-slate-600">L/H</span>
          </div>
          <div className="text-base sm:text-xl font-semibold text-amber-600">
            {typeof overviewMetrics?.fuelRateGph === 'number' 
              ? overviewMetrics.fuelRateGph.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
              : '0,00'} <span className="text-xs sm:text-base text-slate-600">GAL/H</span>
          </div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Since Sep 9, 2020 • Excludes 10% idle</p>
      </div>
    ),
    totalHours: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Total Hours</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{overviewMetrics.totalHours.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Flight hours</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Since Dec 2, 2017</p>
      </div>
    ),
    totalFlights: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Total Flights</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{overviewMetrics.totalFlights.toLocaleString('es-CL')}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Completed</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">8+ years of operations</p>
      </div>
    ),
    nextInspections: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Inspections</h3>
        <div className="space-y-1 sm:space-y-2">
          <div>
            <div className="text-[10px] sm:text-sm text-slate-600 font-medium">Oil</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-900">{(overviewMetrics?.nextInspections?.oilChangeRemaining ?? 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs sm:text-base text-slate-600">hrs</span></div>
          </div>
          <div>
            <div className="text-[10px] sm:text-sm text-slate-600 font-medium">100hr</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-900">{(overviewMetrics?.nextInspections?.hundredHourRemaining ?? 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs sm:text-base text-slate-600">hrs</span></div>
          </div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Based on TACH</p>
      </div>
    ),
    fuelConsumed: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-orange-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Fuel</h3>
        <div className="space-y-0.5 sm:space-y-1">
          <div className="text-lg sm:text-3xl font-bold text-slate-900">{(overviewMetrics?.fuelConsumed || 0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-xs sm:text-lg text-slate-600">L</span></div>
          <div className="text-base sm:text-xl font-semibold text-orange-600">{(((overviewMetrics?.fuelConsumed || 0) / 3.78541)).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-xs sm:text-base text-slate-600">GAL</span></div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Since Sep 9, 2020</p>
      </div>
    ),
    activePilots: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-purple-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Pilots</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{overviewMetrics.activePilots}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Active</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Last 6 months</p>
      </div>
    ),
    pendingBalance: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-yellow-100 flex items-center justify-center">
            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-700 text-[9px] sm:text-xs font-semibold rounded-full">PEND</span>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Balance</h3>
        <div className="text-lg sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">${overviewMetrics.pendingBalance.toLocaleString('es-CL')}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Unpaid</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Auto-calculated</p>
      </div>
    ),
    thisMonth: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-cyan-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">This Month</h3>
        <div className="space-y-0.5 sm:space-y-1">
          <div className="text-lg sm:text-3xl font-bold text-slate-900">{overviewMetrics.thisMonthFlights} <span className="text-xs sm:text-lg text-slate-600">flights</span></div>
          <div className="text-base sm:text-xl font-semibold text-cyan-600">{overviewMetrics.thisMonthHours.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs sm:text-base text-slate-600">hrs</span></div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Dec 2025</p>
      </div>
    ),
    avgFlightTime: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow}`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-rose-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Avg Time</h3>
        <div className="text-xl sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">
          {overviewMetrics.totalFlights > 0 ? (overviewMetrics.totalHours / overviewMetrics.totalFlights).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} <span className="text-sm sm:text-xl text-slate-600">hrs</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Per flight</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">{overviewMetrics.totalHours.toLocaleString('es-CL', { minimumFractionDigits: 1 })} ÷ {overviewMetrics.totalFlights.toLocaleString('es-CL')}</p>
      </div>
    ),
  } : {};

  return (
    <div className={`min-h-screen ${palette.bg} -mx-6 -my-8 px-4 sm:px-6 py-6 sm:py-8`}>
      {/* Navigation Tabs - Mobile Responsive */}
      <nav className="mb-6 sm:mb-8 flex gap-1 sm:gap-2 bg-white/90 backdrop-blur-sm p-2 rounded-xl border border-slate-200 shadow-sm">
        {[
          { id: "overview", label: "Overview", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
          { id: "flights", label: "Flights", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
          { id: "pilots", label: "Pilots", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
          { id: "fuel", label: "Fuel", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" },
          { id: "maintenance", label: "Mx", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
        ].map(t => (
          <button 
            key={t.id} 
            onClick={()=>setTab(t.id)}
            className={`flex-1 min-w-0 px-2 sm:px-6 py-3 sm:py-4 rounded-lg font-bold uppercase tracking-wide text-xs sm:text-sm transition-all flex items-center justify-center gap-1 sm:gap-2 ${
              tab===t.id 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
            </svg>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </nav>

      {tab === "overview" && overviewMetrics && cardOrder.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {cardOrder.map(cardId => overviewCards[cardId] ? renderCard(cardId, overviewCards[cardId]) : null)}
          </div>
        </div>
      )}

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
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 border-2 border-slate-200 rounded-b-2xl mt-2">
            <button
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors text-sm sm:text-base"
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
              ← <span className="hidden sm:inline">Prev</span>
            </button>
            
            {/* Mobile: show only current page / total */}
            <span className="sm:hidden text-sm font-semibold text-slate-600">
              {currentPage} / {pagination ? Math.ceil((pagination.total || 0) / pageSize) : Math.ceil(initialData.flights.length / pageSize)}
            </span>
            
            {/* Desktop: show page buttons */}
            <div className="hidden sm:flex items-center gap-2">
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
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors text-sm sm:text-base"
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
              <span className="hidden sm:inline">Next</span> →
            </button>
          </div>
        </>
      )}
      {tab === "pilots" && (
        <>
          <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setPilotSubTab("accounts")}
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${
                pilotSubTab === "accounts"
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Pilot </span>Accounts
            </button>
            <button
              onClick={() => setPilotSubTab("directory")}
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${
                pilotSubTab === "directory"
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
              }`}
            >
              <span className="hidden sm:inline">Pilot </span>Directory
            </button>
            <button
              onClick={() => setPilotSubTab("deposits")}
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${
                pilotSubTab === "deposits"
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
              }`}
            >
              Deposits
            </button>
          </div>
          {pilotSubTab === "accounts" && <PilotsTable users={initialData.users} flights={initialData.allFlights || initialData.flights} transactions={initialData.transactions} fuelByCode={initialData.fuelByCode} depositsByCode={initialData.depositsByCode} csvPilotStats={initialData.csvPilotStats} allowedPilotCodes={allowedPilotCodes} registeredPilotCodes={registeredPilotCodes} csvPilotNames={csvPilotNames} />}
          {pilotSubTab === "directory" && <PilotDirectory directory={initialData.pilotDirectory} />}
          {pilotSubTab === "deposits" && <DepositsTable depositsDetailsByCode={initialData.depositsDetailsByCode} csvPilotNames={csvPilotNames} />}
        </>
      )}
      {tab === "fuel" && <FuelTable logs={initialData.fuelLogs || []} />}
      {tab === "maintenance" && <MaintenanceTable components={initialData.components} aircraft={initialData.aircraft} aircraftYearlyStats={initialData.aircraftYearlyStats || []} overviewMetrics={overviewMetrics} />}
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

  // Calculate pilot balance summary when client filter is active
  const pilotBalanceSummary = useMemo(() => {
    if (!filterClient) return null;

    const code = filterClient.toUpperCase();
    const clientName = csvPilotNames?.[code] || code;
    
    const totalHours = filteredFlights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);
    const totalSpent = filteredFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0);
    const totalDeposits = depositsByCode?.[code] || 0;
    const totalFuel = fuelByCode?.[code] || 0;
    const balance = totalDeposits - totalSpent + totalFuel;

    const deposits = depositsDetailsByCode?.[code] || [];
    const fuelCredits = fuelDetailsByCode?.[code] || [];

    return {
      code,
      name: clientName,
      totalFlights: filteredFlights.length,
      totalHours,
      totalSpent,
      totalDeposits,
      totalFuel,
      balance,
      deposits,
      fuelCredits,
    };
  }, [filterClient, filteredFlights, depositsByCode, fuelByCode, depositsDetailsByCode, fuelDetailsByCode, csvPilotNames]);

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

      {/* Filter and PDF Generation Bar */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">Pilot ID:</span>
          
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
          >
            <option value="">All Pilots</option>
            {(clientOptions || []).map(c => (
              <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
            ))}
          </select>

          {filterClient && (
            <>
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg font-medium transition-colors"
              >
                Clear
              </button>
              
              <button
                onClick={async () => {
                  const code = filterClient.toUpperCase();
                  const clientName = csvPilotNames?.[code] || code;
                  
                  const totalHours = filteredFlights.reduce((sum, f) => sum + (Number(f.diff_hobbs) || 0), 0);
                  const totalSpent = filteredFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0);
                  const totalDeposits = depositsByCode?.[code] || 0;
                  const totalFuel = fuelByCode?.[code] || 0;
                  const balance = totalDeposits - totalSpent + totalFuel;

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
                      tarifa: f.tarifa ? Number(f.tarifa) : undefined,
                      instructor_rate: f.instructor_rate ? Number(f.instructor_rate) : undefined,
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
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-md"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Account Statement PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pilot Balance Summary Preview */}
      {pilotBalanceSummary && (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 px-6 py-6 border-b-2 border-blue-200">
          <div className="mb-4">
            <h4 className="text-lg font-bold text-slate-900 mb-1">{pilotBalanceSummary.name}</h4>
            <p className="text-sm text-slate-600">Pilot ID: {pilotBalanceSummary.code}</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Total Flights</div>
              <div className="text-2xl font-bold text-blue-600">{pilotBalanceSummary.totalFlights}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-emerald-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Total Hours</div>
              <div className="text-2xl font-bold text-emerald-600">{pilotBalanceSummary.totalHours.toFixed(1)}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Total Spent</div>
              <div className="text-xl font-bold text-amber-700">${pilotBalanceSummary.totalSpent.toLocaleString('es-CL')}</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border-2 shadow-md ${pilotBalanceSummary.balance >= 0 ? 'border-emerald-400' : 'border-red-400'}`}>
              <div className="text-xs text-slate-500 font-medium mb-1">Balance</div>
              <div className={`text-2xl font-bold ${pilotBalanceSummary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${pilotBalanceSummary.balance.toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Deposits */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Deposits
                </h5>
                <span className="text-lg font-bold text-emerald-600">${pilotBalanceSummary.totalDeposits.toLocaleString('es-CL')}</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {pilotBalanceSummary.deposits.length > 0 ? (
                  pilotBalanceSummary.deposits.map((d, i) => (
                    <div key={i} className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                      <span className="truncate mr-2">{d.fecha}: {d.descripcion}</span>
                      <span className="font-semibold whitespace-nowrap">${d.monto.toLocaleString('es-CL')}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 italic">No deposits</p>
                )}
              </div>
            </div>

            {/* Fuel Credits */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Fuel Credits
                </h5>
                <span className="text-lg font-bold text-amber-600">${pilotBalanceSummary.totalFuel.toLocaleString('es-CL')}</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {pilotBalanceSummary.fuelCredits.length > 0 ? (
                  pilotBalanceSummary.fuelCredits.map((f, i) => (
                    <div key={i} className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                      <span className="truncate mr-2">{f.fecha}: {f.litros}L</span>
                      <span className="font-semibold whitespace-nowrap">${f.monto.toLocaleString('es-CL')}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 italic">No fuel credits</p>
                )}
              </div>
            </div>

            {/* Account Summary */}
            <div className="bg-gradient-to-br from-slate-100 to-blue-100 rounded-lg p-4 border-2 border-blue-300 shadow-md">
              <h5 className="text-sm font-bold text-slate-800 mb-3">Account Summary</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Deposits:</span>
                  <span className="font-semibold text-emerald-700">+${pilotBalanceSummary.totalDeposits.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fuel Credits:</span>
                  <span className="font-semibold text-amber-700">+${pilotBalanceSummary.totalFuel.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-300 pt-2">
                  <span className="text-slate-600">Total Credit:</span>
                  <span className="font-bold text-blue-700">${(pilotBalanceSummary.totalDeposits + pilotBalanceSummary.totalFuel).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Flight Charges:</span>
                  <span className="font-semibold text-red-600">-${pilotBalanceSummary.totalSpent.toLocaleString('es-CL')}</span>
                </div>
                <div className={`flex justify-between border-t-2 pt-2 ${pilotBalanceSummary.balance >= 0 ? 'border-emerald-400' : 'border-red-400'}`}>
                  <span className="font-bold text-slate-800">Balance:</span>
                  <span className={`font-bold text-lg ${pilotBalanceSummary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ${pilotBalanceSummary.balance.toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full divide-y divide-slate-200" style={{ minWidth: '1400px' }}>
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Fecha</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Tac. 1</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Tac. 2</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Dif. Taco</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Hobbs I</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Hobbs F</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Horas</th>
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Piloto</th>
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Copiloto</th>
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">ID</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Tarifa</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Inst. Rate</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Total</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">AIRFRAME</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">ENGINE</th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">PROPELLER</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">AD Sal</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">AD Dest</th>
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Detalle</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Año</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Mes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredFlights.map(f => {
              const code = (f.cliente || '').toUpperCase();
              const u = users.find(u => u.id === (f as any).pilotoId) || users.find(u => (u.codigo || '').toUpperCase() === code);
              const pilotName = f.piloto_raw || u?.nombre || 'N/A';
              const fecha = new Date(f.fecha);
              const año = fecha.getFullYear();
              const mesNombres = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const mes = mesNombres[fecha.getMonth()];
              
              return (
                <tr key={f.id} className="hover:bg-blue-50 transition-colors">
                  {/* Fecha */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-medium">
                    {editMode ? (
                      <input type="date" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" value={fecha.toISOString().slice(0,10)} onChange={e=>handleChange(f.id,'fecha',e.target.value)} />
                    ) : (
                      fecha.toLocaleDateString("es-CL")
                    )}
                  </td>
                  
                  {/* Tac. 1 */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={Number(f.tach_inicio).toFixed(1)} onChange={e=>handleChange(f.id,'tach_inicio',e.target.value)} />
                    ) : Number(f.tach_inicio).toFixed(1)}
                  </td>
                  
                  {/* Tac. 2 */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={Number(f.tach_fin).toFixed(1)} onChange={e=>handleChange(f.id,'tach_fin',e.target.value)} />
                    ) : Number(f.tach_fin).toFixed(1)}
                  </td>
                  
                  {/* Dif. Taco */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.diff_tach ?? ''} onChange={e=>handleChange(f.id,'diff_tach',e.target.value)} />
                    ) : (f.diff_tach != null ? Number(f.diff_tach).toFixed(1) : '-')}
                  </td>
                  
                  {/* Hobbs I */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.hobbs_inicio ?? ''} onChange={e=>handleChange(f.id,'hobbs_inicio',e.target.value)} />
                    ) : (f.hobbs_inicio != null ? Number(f.hobbs_inicio).toFixed(1) : '-')}
                  </td>
                  
                  {/* Hobbs F */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.hobbs_fin ?? ''} onChange={e=>handleChange(f.id,'hobbs_fin',e.target.value)} />
                    ) : (f.hobbs_fin != null ? Number(f.hobbs_fin).toFixed(1) : '-')}
                  </td>
                  
                  {/* Dif. Hobbs (Horas) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.diff_hobbs ?? ''} onChange={e=>handleChange(f.id,'diff_hobbs',e.target.value)} />
                    ) : (f.diff_hobbs != null ? Number(f.diff_hobbs).toFixed(1) : '-')}
                  </td>
                  
                  {/* Piloto */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-700 font-medium max-w-[60px] sm:max-w-none truncate">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" defaultValue={pilotName} onChange={e=>handleChange(f.id,'piloto_raw',e.target.value)} />
                    ) : pilotName}
                  </td>
                  
                  {/* Copiloto-instructor */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" defaultValue={f.copiloto || ''} onChange={e=>handleChange(f.id,'copiloto',e.target.value)} />
                    ) : (f.copiloto || '-')}
                  </td>
                  
                  {/* Pilot ID (Cliente) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-700 font-semibold">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-12" defaultValue={f.cliente || ''} onChange={e=>handleChange(f.id,'cliente',e.target.value)} />
                    ) : (f.cliente || '-')}
                  </td>
                  
                  {/* Airplane Rate (Tarifa) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.tarifa || ''} onChange={e=>handleChange(f.id,'tarifa',e.target.value)} />
                    ) : (f.tarifa ? `$${Number(f.tarifa).toLocaleString('es-CL')}` : '-')}
                  </td>
                  
                  {/* Instructor/ Safety Pilot Rate */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.instructor_rate || ''} onChange={e=>handleChange(f.id,'instructor_rate',e.target.value)} />
                    ) : (f.instructor_rate ? `$${Number(f.instructor_rate).toLocaleString('es-CL')}` : '-')}
                  </td>
                  
                  {/* Total */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-bold text-green-700 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.costo ?? ''} onChange={e=>handleChange(f.id,'costo',e.target.value)} />
                    ) : (f.costo != null ? `$${Number(f.costo).toLocaleString('es-CL')}` : '-')}
                  </td>
                  
                  {/* AIRFRAME */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {f.airframe_hours != null ? Number(f.airframe_hours).toFixed(1) : '-'}
                  </td>
                  
                  {/* ENGINE */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {f.engine_hours != null ? Number(f.engine_hours).toFixed(1) : '-'}
                  </td>
                  
                  {/* PROPELLER */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {f.propeller_hours != null ? Number(f.propeller_hours).toFixed(1) : '-'}
                  </td>
                  
                  {/* AD Salida */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {f.aerodromoSalida || '-'}
                  </td>
                  
                  {/* AD Destino */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {f.aerodromoDestino || '-'}
                  </td>
                  
                  {/* Detalle */}
                  <td className="px-2 py-2 text-[10px] sm:text-xs text-slate-600 max-w-[80px] truncate">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" defaultValue={f.detalle || ''} onChange={e=>handleChange(f.id,'detalle',e.target.value)} />
                    ) : (f.detalle || '-')}
                  </td>
                  
                  {/* Año */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 text-center font-medium">
                    {año}
                  </td>
                  
                  {/* Mes */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 text-center">
                    {mes}
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

  function FuelTable({ logs }: { logs: any[] }) {
    const [filterPilot, setFilterPilot] = useState('');
    const [filterSource, setFilterSource] = useState<'ALL' | 'CSV' | 'DB'>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;
    
    // Get unique pilots for filter dropdown
    const pilots = useMemo(() => {
      const unique = new Map<string, string>();
      logs.forEach(l => {
        if (l.pilotCode && !unique.has(l.pilotCode)) {
          unique.set(l.pilotCode, l.pilotName || l.pilotCode);
        }
      });
      return Array.from(unique.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [logs]);
    
    // Filter and paginate
    const filteredLogs = useMemo(() => {
      let result = logs;
      if (filterPilot) {
        result = result.filter(l => l.pilotCode === filterPilot);
      }
      if (filterSource !== 'ALL') {
        result = result.filter(l => l.source === filterSource);
      }
      return result;
    }, [logs, filterPilot, filterSource]);
    
    const totalPages = Math.ceil(filteredLogs.length / pageSize);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    
    // Stats
    const totalMonto = filteredLogs.reduce((sum, l) => sum + (l.monto || 0), 0);
    const totalLitros = filteredLogs.reduce((sum, l) => sum + (l.litros || 0), 0);
    
    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-lg p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">Piloto:</label>
              <select 
                value={filterPilot} 
                onChange={e => { setFilterPilot(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Todos</option>
                {pilots.map(([code, name]) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600">Fuente:</label>
              <select 
                value={filterSource} 
                onChange={e => { setFilterSource(e.target.value as any); setCurrentPage(1); }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="ALL">Todas</option>
                <option value="CSV">Histórico (CSV)</option>
                <option value="DB">App (DB)</option>
              </select>
            </div>
            <div className="ml-auto flex gap-4 text-sm">
              <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg font-semibold">
                {filteredLogs.length} registros
              </span>
              <span className="px-3 py-2 bg-green-100 text-green-800 rounded-lg font-semibold">
                ${totalMonto.toLocaleString('es-CL')} total
              </span>
              <span className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg font-semibold">
                {totalLitros.toFixed(1)} L total
              </span>
            </div>
          </div>
        </div>
        
        {/* Table */}
        <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
            <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
              Registros de Combustible (Histórico + App)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Piloto</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Litros</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fuente</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Detalle</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Boleta</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {paginatedLogs.map((l) => (
                  <tr key={l.id} className={`hover:bg-blue-50 transition-colors ${l.source === 'CSV' ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                      {new Date(l.fecha).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {l.pilotName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-indigo-600">
                      {l.pilotCode || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600 font-mono">
                      {l.litros > 0 ? `${l.litros.toFixed(1)} L` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-green-600">
                      ${l.monto.toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        l.source === 'CSV' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {l.source === 'CSV' ? 'Histórico' : 'App'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {l.detalle || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {l.imageUrl ? (
                        <a
                          href={l.imageUrl.startsWith('/uploads/fuel/')
                            ? `/api/uploads/fuel/${l.imageUrl.split('/').pop()}`
                            : l.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`underline font-medium ${l.exists ? 'text-blue-600 hover:text-blue-800' : 'text-slate-400 pointer-events-none'}`}
                        >
                          {l.exists ? 'Ver' : 'No disponible'}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {l.source === 'DB' && typeof l.id === 'number' ? (
                        <form action={require('@/app/actions/delete-fuel-log').deleteFuelLog} onSubmit={(e)=>{ if(!confirm(`¿Eliminar registro ${l.id}?`)) { e.preventDefault(); } }}>
                          <input type="hidden" name="fuelLogId" value={l.id} />
                          <button type="submit" className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs">
                            Eliminar
                          </button>
                        </form>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Mostrando {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredLogs.length)} de {filteredLogs.length}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  ← Anterior
                </button>
                <span className="px-3 py-1 text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

function PilotDirectory({ directory }: { directory?: { initial: { id: number | null; code: string; name: string; email?: string | null; createdAt?: Date | null; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null; source?: string }[]; registered: { id: number; code: string; name: string; email: string | null; createdAt: string | Date; fechaNacimiento?: string | Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null }[] } }) {
  const [editMode, setEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());

  const rows = useMemo(() => {
    const init = (directory?.initial || []).map(p => ({ 
      id: p.id, 
      code: p.code, 
      name: p.name, 
      source: 'CSV', 
      email: p.email || '-', 
      createdAt: p.createdAt ? new Date(p.createdAt as any).toLocaleDateString('es-CL') : '-', 
      fechaNacimiento: p.fechaNacimiento ? new Date(p.fechaNacimiento as any).toISOString().split('T')[0] : null, 
      fechaNacimientoDisplay: p.fechaNacimiento ? new Date(p.fechaNacimiento as any).toLocaleDateString('es-CL') : '-',
      telefono: p.telefono || '', 
      numeroLicencia: p.numeroLicencia || '', 
      tipoDocumento: p.tipoDocumento || '', 
      documento: p.documento || '' 
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
    let lastError = '';

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
          lastError = data.error || 'Error desconocido';
          console.error(`Error updating pilot ${id}:`, data.error);
        }
      } catch (e) {
        errorCount++;
        lastError = 'Error de conexión';
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
      setMessage(`⚠ ${errorCount === 1 ? lastError : `${successCount} actualizados, ${errorCount} errores: ${lastError}`}`);
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
          <a
            href="/pilots/new"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold text-sm transition-colors"
          >
            ➕ Nuevo Piloto
          </a>
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
                        placeholder="Email (opcional)"
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

function MaintenanceTable({ components, aircraft, aircraftYearlyStats, overviewMetrics }: { components: any[]; aircraft: any[]; aircraftYearlyStats: any[]; overviewMetrics?: OverviewMetrics }) {
  // Calculate predicted inspection dates
  const getPredictedDate = (hoursRemaining: number) => {
    // Use CC-AQI stats (main aircraft)
    const stats = aircraftYearlyStats.find(s => s.matricula === 'CC-AQI');
    if (!stats || stats.avgHoursPerYear <= 0) return null;
    
    const yearsToInspection = hoursRemaining / stats.avgHoursPerYear;
    const daysToInspection = Math.round(yearsToInspection * 365);
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + daysToInspection);
    
    return {
      date: predictedDate,
      daysRemaining: daysToInspection,
      avgHoursPerYear: stats.avgHoursPerYear
    };
  };
  
  // Build inspection items for Oil Change and 100-Hour
  const inspectionItems = [
    {
      id: 'oil-change',
      name: 'Oil Change',
      interval: 50,
      remaining: overviewMetrics?.nextInspections?.oilChangeRemaining ?? 0,
      icon: '🛢️'
    },
    {
      id: '100-hour',
      name: '100-Hour Inspection',
      interval: 100,
      remaining: overviewMetrics?.nextInspections?.hundredHourRemaining ?? 0,
      icon: '🔧'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Component Status Table */}
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

      {/* Next Inspections Prediction - Oil Change & 100-Hour */}
      <div className="bg-white/95 backdrop-blur-lg border-2 border-amber-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-8 py-6">
          <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Next Inspections (Predictive Analysis)
          </h3>
          <p className="text-amber-100 text-sm mt-1">Based on CC-AQI historical flight hours average</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-amber-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Inspection Type</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Interval</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Hrs Remaining</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Avg Hrs/Year</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Est. Inspection Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Days Until</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {inspectionItems.map(item => {
                const prediction = getPredictedDate(item.remaining);
                const urgencyClass = prediction && prediction.daysRemaining < 8 
                  ? 'bg-red-50 border-l-4 border-red-500' 
                  : prediction && prediction.daysRemaining < 20 
                    ? 'bg-amber-50 border-l-4 border-amber-500' 
                    : 'hover:bg-blue-50';
                
                return (
                  <tr key={item.id} className={`transition-colors ${urgencyClass}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                      <span className="mr-2">{item.icon}</span>
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{item.interval} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold font-mono">
                      <span className={item.remaining < 10 ? 'text-red-600' : item.remaining < 20 ? 'text-amber-600' : 'text-green-600'}>
                        {item.remaining.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono font-bold">
                      {prediction ? `${prediction.avgHoursPerYear.toFixed(1)} hrs/yr` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {prediction ? prediction.date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin datos'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {prediction ? (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                          prediction.daysRemaining < 8 ? 'bg-red-100 text-red-700' :
                          prediction.daysRemaining < 20 ? 'bg-amber-100 text-amber-700' :
                          prediction.daysRemaining < 30 ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {prediction.daysRemaining} días
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Predictions based on CC-AQI average yearly flight hours ({aircraftYearlyStats.find(s => s.matricula === 'CC-AQI')?.avgHoursPerYear.toFixed(1) || 'N/A'} hrs/year).
          </p>
        </div>
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

function DepositsTable({ depositsDetailsByCode, csvPilotNames }: { depositsDetailsByCode?: Record<string, { fecha: string; descripcion: string; monto: number }[]>; csvPilotNames?: Record<string, string> }) {
  const [sortBy, setSortBy] = useState<"date" | "pilot" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const allDeposits = useMemo(() => {
    const deposits: { code: string; pilotName: string; fecha: string; descripcion: string; monto: number }[] = [];
    if (!depositsDetailsByCode) return deposits;

    Object.entries(depositsDetailsByCode).forEach(([code, records]) => {
      const pilotName = csvPilotNames?.[code] || code;
      records.forEach(r => {
        deposits.push({ code, pilotName, fecha: r.fecha, descripcion: r.descripcion, monto: r.monto });
      });
    });

    return deposits.sort((a, b) => {
      if (sortBy === "date") {
        const diff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
        return sortOrder === "desc" ? diff : -diff;
      }
      if (sortBy === "pilot") {
        const diff = a.pilotName.localeCompare(b.pilotName);
        return sortOrder === "desc" ? -diff : diff;
      }
      if (sortBy === "amount") {
        const diff = b.monto - a.monto;
        return sortOrder === "desc" ? diff : -diff;
      }
      return 0;
    });
  }, [depositsDetailsByCode, csvPilotNames, sortBy, sortOrder]);

  const totalAmount = useMemo(() => allDeposits.reduce((sum, d) => sum + d.monto, 0), [allDeposits]);

  const toggleSort = (column: "date" | "pilot" | "amount") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            All Deposits — {allDeposits.length} records
          </h3>
          <p className="text-blue-200 text-sm mt-2">Total: ${totalAmount.toLocaleString('es-CL')}</p>
        </div>
        <a
          href="/admin/deposits"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-yellow-900 font-bold rounded-lg transition-all flex items-center gap-2 shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Corregir Depósito
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 border-b-2 border-slate-300">
            <tr>
              <th 
                className="px-6 py-4 text-left font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition"
                onClick={() => toggleSort("date")}
              >
                Date {sortBy === "date" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
              <th 
                className="px-6 py-4 text-left font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition"
                onClick={() => toggleSort("pilot")}
              >
                Pilot {sortBy === "pilot" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
              <th className="px-6 py-4 text-left font-bold text-slate-700 uppercase tracking-wider">
                Description
              </th>
              <th 
                className="px-6 py-4 text-right font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition"
                onClick={() => toggleSort("amount")}
              >
                Amount {sortBy === "amount" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {allDeposits.map((d, idx) => (
              <tr key={idx} className="hover:bg-blue-50 transition">
                <td className="px-6 py-4 text-slate-700 font-medium">{d.fecha}</td>
                <td className="px-6 py-4 text-slate-900 font-semibold">
                  {d.pilotName}
                  <span className="ml-2 text-xs text-slate-500 font-normal">({d.code})</span>
                </td>
                <td className="px-6 py-4 text-slate-600">{d.descripcion}</td>
                <td className="px-6 py-4 text-right text-green-700 font-bold">
                  ${d.monto.toLocaleString('es-CL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
