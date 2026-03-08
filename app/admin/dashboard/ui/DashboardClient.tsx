"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler } from "chart.js";
import { useEffect, useRef } from "react";
import { generateAccountStatementPDF } from "../../../../lib/generate-account-pdf";
import ImagePreviewModal from "../../../components/ImagePreviewModal";
import { registerOverhaul } from "../../../actions/register-overhaul";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler);

// Helper function to format currency with Chilean format (dot as thousands separator, no decimals)
const formatCurrency = (value: number): string => {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 0 });
};

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
  depositsDetailsByCode?: Record<string, { id?: number; fecha: string; descripcion: string; monto: number; source?: 'CSV' | 'DB' }[]>;
  pilotDirectory?: {
    initial: { id: number | null; code: string; name: string; email?: string | null; createdAt?: Date | null; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null; source?: string }[];
    registered: { id: number; code: string; name: string; email: string | null; createdAt: string | Date; fechaNacimiento?: Date | null; telefono?: string | null; numeroLicencia?: string | null; tipoDocumento?: string | null; documento?: string | null }[];
  };
  aircraftYearlyStats?: { matricula: string; avgHoursPerYear: number; totalHours: number; yearsOfOperation: number }[];
  bankMovements?: { correlativo: number; fecha: string; descripcion: string; egreso: number | null; ingreso: number | null; saldo: number; tipo: string; cliente: string | null; attachmentUrl?: string | null }[];
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
    // Predictive stats
    usageStats?: {
      rate30d: number;  // hrs/day last 30 days
      rate60d: number;  // hrs/day last 60 days  
      rate90d: number;  // hrs/day last 90 days
      rateAnnual: number;  // hrs/day last 365 days
      weightedRate: number;  // hybrid: 2/3 annual + 1/3 90d
      trend: number;  // % change vs previous period
      stdDev: number;  // standard deviation
    };
  };
  annualStats?: {
    // TACH hours
    tachThisYear: number;
    tachPrevYear: number;
    tachTrend: number;
    // HOBBS hours
    hobbsThisYear: number;
    hobbsPrevYear: number;
    hobbsTrend: number;
    // Real ratio
    hobbsTachRatio: number;
    // Monthly averages
    avgMonthlyTachThisYear: number;
    avgMonthlyTachPrevYear: number;
    avgMonthlyHobbsThisYear: number;
    avgMonthlyHobbsPrevYear: number;
    avgHoursTrend: number;
    // Flights
    avgMonthlyFlightsThisYear: number;
    avgMonthlyFlightsPrevYear: number;
    flightsTrend: number;
  };
};

export default function DashboardClient({ initialData, overviewMetrics, pagination, allowedPilotCodes, registeredPilotCodes, csvPilotNames }: { initialData: InitialData; overviewMetrics?: OverviewMetrics; pagination?: PaginationInfo; allowedPilotCodes?: string[]; registeredPilotCodes?: string[]; csvPilotNames?: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [pilotSubTab, setPilotSubTab] = useState<"accounts" | "directory" | "deposits">("accounts");
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filterAircraft, setFilterAircraft] = useState("");
  const [filterPilot, setFilterPilot] = useState("");
  const [theme, setTheme] = useState<string>('hybrid');
  const [yearFilter, setYearFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
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
        const parsed = JSON.parse(saved);
        // Ensure annualStats is included if not present
        if (!parsed.includes('annualStats')) {
          parsed.push('annualStats');
          localStorage.setItem('overview-card-order', JSON.stringify(parsed));
        }
        setCardOrder(parsed);
      } catch {
        setCardOrder(['fuelRate', 'totalHours', 'totalFlights', 'nextInspections', 'fuelConsumed', 'activePilots', 'pendingBalance', 'thisMonth', 'avgFlightTime', 'annualStats']);
      }
    } else {
      setCardOrder(['fuelRate', 'totalHours', 'totalFlights', 'nextInspections', 'fuelConsumed', 'activePilots', 'pendingBalance', 'thisMonth', 'avgFlightTime', 'annualStats']);
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
    const sorted = filtered.slice().sort((a, b) => {
      const da = new Date(a.fecha).getTime();
      const db = new Date(b.fecha).getTime();
      return sortOrder === 'desc' ? db - da : da - db;
    });
    // Client-side slice when no server pagination is provided; otherwise server already paginated.
    if (!pagination) {
      const start = (currentPage - 1) * pageSize;
      return sorted.slice(start, start + pageSize);
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

  // Backup functions
  const handleGenerateBackup = async (action: 'email' | 'download') => {
    setBackupLoading(true);
    setBackupMessage(null);

    try {
      const response = await fetch(`/api/export/complete-backup?action=${action}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error generando backup');
      }

      if (action === 'download') {
        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'FlightLog-Backup.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setBackupMessage({ type: 'success', text: '✓ Backup descargado exitosamente' });
      } else {
        // Email sent
        const result = await response.json();
        setBackupMessage({ type: 'success', text: `✓ Backup enviado a santvaras92@gmail.com` });
      }

      setTimeout(() => {
        setShowBackupModal(false);
        setBackupMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Error generating backup:', error);
      setBackupMessage({
        type: 'error',
        text: `⚠ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
      });
    } finally {
      setBackupLoading(false);
    }
  };

  // Render individual metric card with drag-and-drop
  const renderCard = (cardId: string, content: JSX.Element) => {
    const isDragging = draggedCard === cardId;
    const isBeingDragged = isDragEnabled && draggedCard === cardId;
    // Complex cards span 2 columns on mobile
    const isComplexCard = cardId === 'nextInspections' || cardId === 'activePilots';
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

  // Define all Overview cards
  const overviewCards: Record<string, JSX.Element> = overviewMetrics ? {
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
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
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
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
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
    nextInspections: (() => {
      const stats = overviewMetrics?.nextInspections?.usageStats;
      const oilRemaining = overviewMetrics?.nextInspections?.oilChangeRemaining ?? 0;
      const hundredRemaining = overviewMetrics?.nextInspections?.hundredHourRemaining ?? 0;
      const weightedRate = stats?.weightedRate || 0;
      const stdDev = stats?.stdDev || 0;
      const trend = stats?.trend || 0;
      const hobbsTachRatio = overviewMetrics?.annualStats?.hobbsTachRatio || 1.25;

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

      const formatDate = (d: Date | null) => d ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '-';
      const formatDateShort = (d: Date | null) => d ? d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '') : '-';

      // Format days as human-readable: "X,Y a" / "Xm" / "Xd"
      const fmtTime = (days: number): string => {
        if (days <= 0) return '0d';
        if (days < 30) return `${days}d`;
        if (days < 365) return `${Math.floor(days / 30)}m`;
        return `${(days / 365).toFixed(1)}a`;
      };

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
              <h3 className="text-slate-900 text-xs sm:text-sm font-bold uppercase tracking-wide">Inspecciones</h3>
            </div>
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[8px] sm:text-[10px] font-bold rounded-full">🔮 SMART</span>
          </div>

          {/* Oil Change Section */}
          <div className="mb-2 sm:mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-700">🛢️ ACEITE</span>
              <span className="text-[10px] sm:text-xs font-mono text-slate-600">{oilPct.toFixed(0)}%</span>
            </div>
            <div className={`w-full h-2 sm:h-2.5 rounded-full ${getProgressBg(oilRemaining, OIL_INTERVAL)} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${getProgressColor(oilRemaining, OIL_INTERVAL)} transition-all duration-500`}
                style={{ width: `${oilPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[9px] sm:text-[11px] text-slate-900 font-extrabold">
                {oilRemaining.toFixed(1)} TACH <span className="text-slate-600 font-semibold">({oilHobbsRemaining.toFixed(1)} HOBBS)</span>
              </div>
              {weightedRate > 0 && (
                <div className="text-[9px] sm:text-[11px] text-slate-900 font-bold flex items-center gap-1">
                  ⏱️ ~{fmtTime(oilPred.days)} <span className="hidden sm:inline text-slate-500">({fmtTime(oilPred.minDays)}-{fmtTime(oilPred.maxDays)})</span>
                </div>
              )}
            </div>
          </div>

          {/* 100hr Inspection Section */}
          <div className="mb-2 sm:mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-700">⚙️ 100 HORAS</span>
              <span className="text-[10px] sm:text-xs font-mono text-slate-600">{hundredPct.toFixed(0)}%</span>
            </div>
            <div className={`w-full h-2 sm:h-2.5 rounded-full ${getProgressBg(hundredRemaining, HUNDRED_HR_INTERVAL)} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${getProgressColor(hundredRemaining, HUNDRED_HR_INTERVAL)} transition-all duration-500`}
                style={{ width: `${hundredPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[9px] sm:text-[11px] text-slate-900 font-extrabold">
                {hundredRemaining.toFixed(1)} TACH <span className="text-slate-600 font-semibold">({hundredHobbsRemaining.toFixed(1)} HOBBS)</span>
              </div>
              {weightedRate > 0 && (
                <div className="text-[9px] sm:text-[11px] text-slate-900 font-bold flex items-center gap-1">
                  ⏱️ ~{fmtTime(hundredPred.days)} <span className="hidden sm:inline text-slate-500">({fmtTime(hundredPred.minDays)}-{fmtTime(hundredPred.maxDays)})</span>
                </div>
              )}
            </div>
          </div>

          {/* Usage Stats Footer */}
          <div className="mt-auto pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-[9px] sm:text-[11px]">
              <div className="flex flex-col gap-0.5 text-slate-700">
                <span className="font-extrabold text-slate-900">{(weightedRate * 7).toFixed(1)} TACH/sem</span>
                <span className="font-semibold text-slate-800">{(weightedRate * hobbsTachRatio * 7).toFixed(1)} HOBBS/sem</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={`font-semibold ${trend > 0 ? 'text-orange-600' : trend < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {trend > 0 ? '↗️' : trend < 0 ? '↘️' : '→'} {Math.abs(trend).toFixed(0)}%
                </span>
                <div className="flex items-center gap-1 text-slate-600">
                  <span>H/T</span>
                  <span className="font-mono font-semibold text-slate-800">{hobbsTachRatio.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    })(),
    fuelConsumed: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-orange-100 flex items-center justify-center mb-2 sm:mb-4">
          <svg className="w-4 h-4 sm:w-6 sm:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Fuel</h3>
        <div className="space-y-0.5 sm:space-y-1">
          <div className="text-lg sm:text-3xl font-bold text-slate-900">{(overviewMetrics?.fuelConsumed || 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs sm:text-lg text-slate-600">L</span></div>
          <div className="text-base sm:text-xl font-semibold text-orange-600">{(((overviewMetrics?.fuelConsumed || 0) / 3.78541)).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs sm:text-base text-slate-600">GAL</span></div>
        </div>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Since Sep 9, 2020</p>
      </div>
    ),
    activePilots: (() => {
      // Calculate active pilots from last 60 days
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      // Normalize "today" to midnight local time for accurate day diff
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const recentFlights = (initialData.allFlightsComplete || initialData.flights || [])
        .filter(f => new Date(f.fecha) >= sixtyDaysAgo);

      // Map each code to their most recent flight date
      const codeToLastFlight = new Map<string, Date>();
      recentFlights.forEach(f => {
        const code = ((f as any).cliente || '').toUpperCase().trim();
        if (!code) return;
        // Parse flight date as local date to avoid UTC shift
        const raw = new Date(f.fecha);
        const flightDate = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
        const existing = codeToLastFlight.get(code);
        if (!existing || flightDate > existing) {
          codeToLastFlight.set(code, flightDate);
        }
      });

      // Pre-compute total spent per pilot code from ALL DB flights (same source as Flights tab)
      const allFlights = initialData.allFlightsComplete || initialData.flights || [];
      const spentByCode = new Map<string, number>();
      allFlights.forEach(f => {
        const c = ((f as any).cliente || '').toUpperCase().trim();
        if (!c) return;
        spentByCode.set(c, (spentByCode.get(c) || 0) + (Number(f.costo) || 0));
      });

      // Build array with name and days since last flight
      const activePilotsData = Array.from(codeToLastFlight.entries())
        .map(([code, lastFlightDate]) => {
          const daysSince = Math.round((today.getTime() - lastFlightDate.getTime()) / (1000 * 60 * 60 * 24));

          // Try to find name from CSV pilot names first, then from registered users
          let name = csvPilotNames?.[code];
          if (!name) {
            const user = initialData.users.find(u => u.codigo?.toUpperCase() === code);
            name = user?.nombre || code;
          }

          // Calculate pilot balance (must match Flights tab & Pilot Accounts)
          const spent = Math.round(spentByCode.get(code) || 0);
          const deposits = Math.round(initialData.depositsByCode?.[code] || 0);
          const fuel = Math.round(initialData.fuelByCode?.[code] || 0);
          const balance = deposits - spent + fuel;

          return {
            name,
            code,
            daysSince,
            balance
          };
        })
        .sort((a, b) => a.daysSince - b.daysSince); // Sort by most recent first

      return (
        <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="px-1.5 sm:px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] sm:text-xs font-bold rounded-full">{activePilotsData.length}</span>
          </div>
          <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Pilotos Activos</h3>
          <p className="text-[9px] sm:text-xs text-slate-500 mb-2">Últimos 60 días</p>
          <div className="max-h-24 sm:max-h-32 overflow-y-auto space-y-0.5">
            {activePilotsData.map((pilot, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] sm:text-xs">
                <span className="text-slate-700 truncate flex-1 min-w-0">{pilot.name}</span>
                <span className={`ml-1 text-right font-mono tabular-nums text-[9px] sm:text-[11px] ${pilot.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {pilot.balance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(pilot.balance))}
                </span>
                <span className={`ml-1.5 w-7 text-right font-mono text-[10px] sm:text-xs ${pilot.daysSince === 0 ? 'text-green-600 font-bold' : pilot.daysSince <= 7 ? 'text-emerald-500' : pilot.daysSince <= 30 ? 'text-slate-500' : 'text-orange-500'}`}>
                  {pilot.daysSince === 0 ? 'hoy' : `${pilot.daysSince}d`}
                </span>
              </div>
            ))}
            {activePilotsData.length === 0 && (
              <div className="text-[10px] sm:text-xs text-slate-400 italic">Sin vuelos recientes</div>
            )}
          </div>
        </div>
      );
    })(),
    pendingBalance: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-yellow-100 flex items-center justify-center">
            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-700 text-[9px] sm:text-xs font-semibold rounded-full">PEND</span>
        </div>
        <h3 className="text-slate-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wide mb-1 sm:mb-2">Balance</h3>
        <div className="text-lg sm:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">${formatCurrency(overviewMetrics.pendingBalance)}</div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">Unpaid</p>
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">Auto-calculated</p>
      </div>
    ),
    thisMonth: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
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
        <p className="text-[9px] sm:text-xs text-slate-500 mt-2 sm:mt-3 hidden sm:block">{new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Santiago' })}</p>
      </div>
    ),
    avgFlightTime: (
      <div className={`${palette.card} rounded-xl p-3 sm:p-6 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] lg:overflow-y-auto flex flex-col`}>
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
    ...(overviewMetrics?.annualStats ? {
      annualStats: (() => {
        const stats = overviewMetrics.annualStats;

        const renderTrend = (value: number) => {
          const isPositive = value >= 0;
          return (
            <span className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-md ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
              {isPositive ? '↗' : '↘'} {Math.abs(value).toFixed(0)}%
            </span>
          );
        };

        return (
          <div className={`${palette.card} rounded-xl p-3 sm:p-4 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] flex flex-col justify-between`}>

            {/* Header (Coincide con las otras tarjetas) */}
            <div className="flex items-start justify-between mb-1 sm:mb-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-violet-100 flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="px-2 py-1 bg-violet-50 text-violet-700 text-[9px] sm:text-[10px] font-bold rounded-full border border-violet-100">
                Ratio H/T: {stats.hobbsTachRatio.toFixed(2)}
              </span>
            </div>

            <div>
              <h3 className="text-slate-500 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide">Estadísticas Anuales</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400 mb-1 sm:mb-2">Últimos 365 días</p>
            </div>

            {/* Clean List Data */}
            <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 mt-auto">

              {/* HOBBS Row */}
              <div className="flex items-end justify-between border-b border-slate-100/60 pb-1.5 sm:pb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs sm:text-sm">🕐</span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 tracking-wider">HOBBS</span>
                  </div>
                  <div className="text-lg sm:text-2xl font-bold text-slate-900 leading-none">
                    {stats.hobbsThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {renderTrend(stats.hobbsTrend)}
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{stats.avgMonthlyHobbsThisYear.toFixed(1)}/mes</div>
                </div>
              </div>

              {/* TACH Row */}
              <div className="flex items-end justify-between border-b border-slate-100/60 pb-1.5 sm:pb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs sm:text-sm">⏱️</span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 tracking-wider">TACH</span>
                  </div>
                  <div className="text-base sm:text-xl font-bold text-slate-800 leading-none">
                    {stats.tachThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {renderTrend(stats.tachTrend)}
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{stats.avgMonthlyTachThisYear.toFixed(1)}/mes</div>
                </div>
              </div>

              {/* VUELOS Row */}
              <div className="flex items-center justify-between pt-0.5 sm:pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm">✈️</span>
                  <span className="text-[10px] sm:text-xs text-slate-600">
                    <span className="font-bold text-slate-900 text-sm sm:text-base">{(stats.avgMonthlyFlightsThisYear * 12).toFixed(0)}</span> vuelos
                  </span>
                </div>
                {renderTrend(stats.flightsTrend)}
              </div>

            </div>
          </div>
        );
      })()
    } : {}),
  } : {};

  return (
    <div className={`min-h-screen ${palette.bg} -mx-6 -my-8 px-4 sm:px-6 py-6 sm:py-8`}>
      {/* Backup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-bold text-slate-900 mb-4">💾 Generar Backup Completo</h3>

            {backupMessage && (
              <div className={`mb-4 p-3 rounded-lg ${backupMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {backupMessage.text}
              </div>
            )}

            <p className="text-slate-600 mb-6">
              Este backup incluye <strong>toda la información histórica</strong> desde el primer vuelo hasta hoy:
            </p>

            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>✈️ Todos los vuelos registrados</li>
              <li>💰 Depósitos completos (DB + CSV)</li>
              <li>⛽ Combustible histórico</li>
              <li>👥 Pilotos con balances</li>
              <li>🛩️ Aeronaves y mantenimiento</li>
              <li>📝 Transacciones y pendientes</li>
            </ul>

            <div className="space-y-3">
              <button
                onClick={() => handleGenerateBackup('download')}
                disabled={backupLoading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {backupLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Generando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Descargar Ahora</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerateBackup('email')}
                disabled={backupLoading}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {backupLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Enviar por Email</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setShowBackupModal(false);
                  setBackupMessage(null);
                }}
                disabled={backupLoading}
                className="w-full px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              El backup se genera con todos los datos históricos.<br />
              Tamaño estimado: 2-5 MB
            </p>
          </div>
        </div>
      )}

      {/* Navigation Tabs - Mobile Responsive */}
      <div className="mb-6 sm:mb-8 space-y-3">
        <nav className="flex gap-1 sm:gap-2 bg-white/90 backdrop-blur-sm p-2 rounded-xl border border-slate-200 shadow-sm">
          {[
            { id: "overview", label: "Overview", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
            { id: "flights", label: "Flights", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
            { id: "pilots", label: "Pilots", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
            { id: "fuel", label: "Fuel", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" },
            { id: "maintenance", label: "Mx", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
            { id: "finance", label: "Finance", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-0 px-2 sm:px-6 py-3 sm:py-4 rounded-lg font-bold uppercase tracking-wide text-xs sm:text-sm transition-all flex items-center justify-center gap-1 sm:gap-2 ${tab === t.id
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
      </div>

      {tab === "overview" && overviewMetrics && cardOrder.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {cardOrder.map(cardId => overviewCards[cardId] ? renderCard(cardId, overviewCards[cardId]) : null)}
          </div>
        </div>
      )}

      {tab === "flights" && (
        <>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${editMode
                ? 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
            >
              {editMode ? '✏️ Modo Edición ON' : '✏️ Editar Celdas'}
            </button>
          </div>
          <FlightsTable
            flights={flights}
            allFlightsComplete={initialData.allFlightsComplete}
            users={initialData.users}
            editMode={editMode}
            clientOptions={(() => {
              // Combine CSV pilots and registered pilots
              const allCodes = new Set<string>();
              (allowedPilotCodes || []).forEach(c => allCodes.add(c.toUpperCase()));
              (registeredPilotCodes || []).forEach(c => allCodes.add(c.toUpperCase()));

              return Array.from(allCodes).map(code => ({
                code,
                name: csvPilotNames?.[code] || initialData.users.find(u => u.codigo === code)?.nombre || code
              })).sort((a, b) => a.name.localeCompare(b.name));
            })()}
            depositsByCode={initialData.depositsByCode}
            depositsDetailsByCode={initialData.depositsDetailsByCode}
            fuelByCode={initialData.fuelByCode}
            fuelDetailsByCode={initialData.fuelDetailsByCode}
            csvPilotNames={csvPilotNames}
          />
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 border-2 border-slate-200 rounded-b-2xl mt-2">
            <button
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors text-sm sm:text-base"
              onClick={() => {
                const prev = Math.max(1, currentPage - 1);
                setCurrentPage(prev);
                if (pagination) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('page', String(prev));
                  params.set('pageSize', String(pageSize));
                  router.push(`/admin/dashboard?${params.toString()}`);
                }
              }}
              disabled={currentPage === 1}
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
                      className={`min-w-[40px] px-3 py-2 rounded-lg font-semibold transition-all ${isActive
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
              onClick={() => {
                const next = currentPage + 1;
                if (pagination) {
                  const maxPages = Math.ceil((pagination.total || 0) / pageSize);
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
              disabled={pagination ? currentPage >= Math.ceil((pagination.total || 0) / pageSize) : flights.length < pageSize}
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
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${pilotSubTab === "accounts"
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
                }`}
            >
              <span className="hidden sm:inline">Pilot </span>Accounts
            </button>
            <button
              onClick={() => setPilotSubTab("directory")}
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${pilotSubTab === "directory"
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl'
                : 'bg-white/50 text-slate-600 hover:bg-white/80 border-2 border-slate-200'
                }`}
            >
              <span className="hidden sm:inline">Pilot </span>Directory
            </button>
            <button
              onClick={() => setPilotSubTab("deposits")}
              className={`flex-1 min-w-[100px] px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold uppercase tracking-wide text-xs sm:text-sm transition-all ${pilotSubTab === "deposits"
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
      {tab === "finance" && <FinanzasTable movements={initialData.bankMovements || []} palette={palette} />}

      {/* Backup Button - Final de la página */}
      <div className="mt-8 flex justify-center pb-8">
        <button
          onClick={() => setShowBackupModal(true)}
          className="px-8 py-4 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white rounded-xl font-bold hover:from-blue-800 hover:via-blue-900 hover:to-indigo-950 transition-all shadow-lg flex items-center gap-3 text-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span>💾 Generar Backup Completo</span>
        </button>
      </div>
    </div>
  );
}

function Overview({ data, flights, palette, allowedPilotCodes, activeDaysLimit, showActivePilots, setShowActivePilots }: { data: InitialData; flights: any[]; palette: any; allowedPilotCodes?: string[]; activeDaysLimit: number; showActivePilots: boolean; setShowActivePilots: (v: boolean) => void }) {
  const hoursByDay = useMemo(() => {
    const map: Record<string, number> = {};
    flights.slice().reverse().forEach(f => {
      const day = new Date(f.fecha).toISOString().slice(0, 10);
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

  const totalHours = data.flights.reduce((a, b) => a + Number(b.diff_hobbs), 0);
  const totalRevenue = data.flights.reduce((a, b) => a + Number(b.costo || 0), 0);
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
        <StatCard title="Revenue" value={`$${formatCurrency(Number(totalRevenue))}`} accent="#ef4444" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" palette={palette} />
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
  depositsDetailsByCode?: Record<string, { id?: number; fecha: string; descripcion: string; monto: number; source?: 'CSV' | 'DB' }[]>;
  fuelByCode?: Record<string, number>;
  fuelDetailsByCode?: Record<string, { fecha: string; litros: number; monto: number }[]>;
  csvPilotNames?: Record<string, string>;
}) {
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const handleDeleteFlight = async (flightId: number, pilotName: string, fecha: string, costo: number) => {
    const confirmMsg = `¿Eliminar este vuelo?\n\nPiloto: ${pilotName}\nFecha: ${fecha}\nCosto: $${formatCurrency(costo)}\n\nEsto revertirá:\n• Saldo del piloto (+$${formatCurrency(costo)})\n• Contadores del avión\n• Horas de componentes`;

    if (!confirm(confirmMsg)) return;

    setDeletingId(flightId);
    try {
      const res = await fetch('/api/flights/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flightId }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || 'Error al eliminar vuelo');
      } else {
        alert(`Vuelo eliminado.\nSaldo revertido: +$${json.reverted?.balance ? formatCurrency(json.reverted.balance) : formatCurrency(costo)}`);
        location.reload();
      }
    } catch (e) {
      alert('Error de red al eliminar');
    } finally {
      setDeletingId(null);
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
    const totalSpent = Math.round(filteredFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0));
    const totalDeposits = Math.round(depositsByCode?.[code] || 0);
    const totalFuel = Math.round(fuelByCode?.[code] || 0);
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
                  const totalSpent = Math.round(filteredFlights.reduce((sum, f) => sum + (Number(f.costo) || 0), 0));
                  const totalDeposits = Math.round(depositsByCode?.[code] || 0);
                  const totalFuel = Math.round(fuelByCode?.[code] || 0);
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
              <div className="text-xl font-bold text-amber-700">${formatCurrency(pilotBalanceSummary.totalSpent)}</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border-2 shadow-md ${pilotBalanceSummary.balance >= 0 ? 'border-emerald-400' : 'border-red-400'}`}>
              <div className="text-xs text-slate-500 font-medium mb-1">Balance</div>
              <div className={`text-2xl font-bold ${pilotBalanceSummary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                ${formatCurrency(pilotBalanceSummary.balance)}
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
                <span className="text-lg font-bold text-emerald-600">${formatCurrency(pilotBalanceSummary.totalDeposits)}</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {pilotBalanceSummary.deposits.length > 0 ? (
                  pilotBalanceSummary.deposits.map((d, i) => (
                    <div key={i} className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                      <span className="truncate mr-2">{d.fecha}: {d.descripcion}</span>
                      <span className="font-semibold whitespace-nowrap">${formatCurrency(d.monto)}</span>
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
                <span className="text-lg font-bold text-amber-600">${formatCurrency(pilotBalanceSummary.totalFuel)}</span>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                {pilotBalanceSummary.fuelCredits.length > 0 ? (
                  pilotBalanceSummary.fuelCredits.map((f, i) => (
                    <div key={i} className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                      <span className="truncate mr-2">{f.fecha}: {f.litros}L</span>
                      <span className="font-semibold whitespace-nowrap">${formatCurrency(f.monto)}</span>
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
                  <span className="font-semibold text-emerald-700">+${formatCurrency(pilotBalanceSummary.totalDeposits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Fuel Credits:</span>
                  <span className="font-semibold text-amber-700">+${formatCurrency(pilotBalanceSummary.totalFuel)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-300 pt-2">
                  <span className="text-slate-600">Total Credit:</span>
                  <span className="font-bold text-blue-700">${formatCurrency(pilotBalanceSummary.totalDeposits + pilotBalanceSummary.totalFuel)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Flight Charges:</span>
                  <span className="font-semibold text-red-600">-${formatCurrency(pilotBalanceSummary.totalSpent)}</span>
                </div>
                <div className={`flex justify-between border-t-2 pt-2 ${pilotBalanceSummary.balance >= 0 ? 'border-emerald-400' : 'border-red-400'}`}>
                  <span className="font-bold text-slate-800">Balance:</span>
                  <span className={`font-bold text-lg ${pilotBalanceSummary.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ${formatCurrency(pilotBalanceSummary.balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto px-4 sm:px-0">
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
              <th className="px-2 py-2 text-left text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Detalle</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Año</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Mes</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-red-600 uppercase tracking-wider whitespace-nowrap">🗑️</th>
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
                      <input type="date" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" value={fecha.toISOString().slice(0, 10)} onChange={e => handleChange(f.id, 'fecha', e.target.value)} />
                    ) : (
                      fecha.toLocaleDateString("es-CL")
                    )}
                  </td>

                  {/* Tac. 1 */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={Number(f.tach_inicio).toFixed(1)} onChange={e => handleChange(f.id, 'tach_inicio', e.target.value)} />
                    ) : Number(f.tach_inicio).toFixed(1)}
                  </td>

                  {/* Tac. 2 */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={Number(f.tach_fin).toFixed(1)} onChange={e => handleChange(f.id, 'tach_fin', e.target.value)} />
                    ) : Number(f.tach_fin).toFixed(1)}
                  </td>

                  {/* Dif. Taco */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.diff_tach ?? ''} onChange={e => handleChange(f.id, 'diff_tach', e.target.value)} />
                    ) : (f.diff_tach != null ? Number(f.diff_tach).toFixed(1) : '-')}
                  </td>

                  {/* Hobbs I */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.hobbs_inicio ?? ''} onChange={e => handleChange(f.id, 'hobbs_inicio', e.target.value)} />
                    ) : (f.hobbs_inicio != null ? Number(f.hobbs_inicio).toFixed(1) : '-')}
                  </td>

                  {/* Hobbs F */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.hobbs_fin ?? ''} onChange={e => handleChange(f.id, 'hobbs_fin', e.target.value)} />
                    ) : (f.hobbs_fin != null ? Number(f.hobbs_fin).toFixed(1) : '-')}
                  </td>

                  {/* Dif. Hobbs (Horas) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-semibold text-blue-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.diff_hobbs ?? ''} onChange={e => handleChange(f.id, 'diff_hobbs', e.target.value)} />
                    ) : (f.diff_hobbs != null ? Number(f.diff_hobbs).toFixed(1) : '-')}
                  </td>

                  {/* Piloto */}
                  <td
                    className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-700 font-medium"
                    title={pilotName}
                  >
                    {editMode ? (
                      <input
                        type="text"
                        className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full"
                        defaultValue={pilotName}
                        onChange={e => handleChange(f.id, 'piloto_raw', e.target.value)}
                      />
                    ) : (
                      pilotName
                    )}
                  </td>

                  {/* Copiloto-instructor */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" defaultValue={f.copiloto || ''} onChange={e => handleChange(f.id, 'copiloto', e.target.value)} />
                    ) : (f.copiloto || '-')}
                  </td>

                  {/* Pilot ID (Cliente) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-700 font-semibold">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-12" defaultValue={f.cliente || ''} onChange={e => handleChange(f.id, 'cliente', e.target.value)} />
                    ) : (f.cliente || '-')}
                  </td>

                  {/* Airplane Rate (Tarifa) */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.tarifa || ''} onChange={e => handleChange(f.id, 'tarifa', e.target.value)} />
                    ) : (f.tarifa ? `$${formatCurrency(Number(f.tarifa))}` : '-')}
                  </td>

                  {/* Instructor/ Safety Pilot Rate */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.instructor_rate || ''} onChange={e => handleChange(f.id, 'instructor_rate', e.target.value)} />
                    ) : (f.instructor_rate ? `$${formatCurrency(Number(f.instructor_rate))}` : '-')}
                  </td>

                  {/* Total */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs font-bold text-green-700 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="1000" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-20" defaultValue={f.costo ?? ''} onChange={e => handleChange(f.id, 'costo', e.target.value)} />
                    ) : (f.costo != null ? `$${formatCurrency(Number(f.costo))}` : '-')}
                  </td>

                  {/* AIRFRAME */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.airframe_hours != null ? Number(f.airframe_hours).toFixed(1) : ''} onChange={e => handleChange(f.id, 'airframe_hours', e.target.value)} />
                    ) : (f.airframe_hours != null ? Number(f.airframe_hours).toFixed(1) : '-')}
                  </td>

                  {/* ENGINE */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.engine_hours != null ? Number(f.engine_hours).toFixed(1) : ''} onChange={e => handleChange(f.id, 'engine_hours', e.target.value)} />
                    ) : (f.engine_hours != null ? Number(f.engine_hours).toFixed(1) : '-')}
                  </td>

                  {/* PROPELLER */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-mono text-right">
                    {editMode ? (
                      <input type="number" step="0.1" className="px-1 py-1 border rounded text-right text-[10px] sm:text-xs w-16" defaultValue={f.propeller_hours != null ? Number(f.propeller_hours).toFixed(1) : ''} onChange={e => handleChange(f.id, 'propeller_hours', e.target.value)} />
                    ) : (f.propeller_hours != null ? Number(f.propeller_hours).toFixed(1) : '-')}
                  </td>

                  {/* AD Salida */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-16" defaultValue={f.aerodromoSalida || ''} onChange={e => handleChange(f.id, 'aerodromoSalida', e.target.value)} />
                    ) : (f.aerodromoSalida || '-')}
                  </td>

                  {/* AD Destino */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-16" defaultValue={f.aerodromoDestino || ''} onChange={e => handleChange(f.id, 'aerodromoDestino', e.target.value)} />
                    ) : (f.aerodromoDestino || '-')}
                  </td>

                  {/* Detalle */}
                  <td className="px-2 py-2 text-[10px] sm:text-xs text-slate-600 whitespace-nowrap max-w-[300px] overflow-x-auto">
                    {editMode ? (
                      <input type="text" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" defaultValue={f.detalle || ''} onChange={e => handleChange(f.id, 'detalle', e.target.value)} />
                    ) : (
                      <span>{f.detalle || '-'}</span>
                    )}
                  </td>

                  {/* Año */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 text-center font-medium">
                    {año}
                  </td>

                  {/* Mes */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 text-center">
                    {mes}
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-2 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleDeleteFlight(
                        f.id,
                        pilotName,
                        fecha.toLocaleDateString('es-CL'),
                        Number(f.costo || 0)
                      )}
                      disabled={deletingId === f.id}
                      className="px-2 py-1 text-[10px] sm:text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                      title="Eliminar vuelo y revertir saldo/contadores"
                    >
                      {deletingId === f.id ? '...' : '✕'}
                    </button>
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
      userByCode.set(code, u);
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
      const hours = csvStats?.hours ?? fs.reduce((a, b) => a + Number(b.diff_hobbs || 0), 0);
      const totalSpent = csvStats?.spent ?? fs.reduce((a, b) => a + Number(b.costo || 0), 0);
      const rateHr = hours > 0 ? totalSpent / hours : 0;
      const deposits = depositsByCode?.[code] ?? (u ? transactions.filter(t => t.userId === u.id && t.tipo === 'ABONO').reduce((a, b) => a + Number(b.monto), 0) : 0);
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono">${Number(p.fuel || 0).toLocaleString("es-CL")}</td>
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
  const [fuelImageModalUrl, setFuelImageModalUrl] = useState<string | null>(null);
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
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">$/L</th>
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
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-slate-700">
                    {l.litros > 0 && l.monto > 0 ? `$${Math.round(l.monto / l.litros).toLocaleString('es-CL')}` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${l.source === 'CSV' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                      {l.source === 'CSV' ? 'Histórico' : 'App'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                    {l.detalle || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {l.imageUrl ? (
                      <button
                        onClick={() => {
                          const url = l.imageUrl.startsWith('/api/uploads/fuel-image') ? l.imageUrl :
                            l.imageUrl.startsWith('http') ? l.imageUrl :
                              l.imageUrl.startsWith('/uploads/fuel/')
                                ? `/api/uploads/fuel-image?key=${encodeURIComponent(`fuel/${l.imageUrl.split('/').pop()}`)}`
                                : l.imageUrl;
                          setFuelImageModalUrl(url);
                        }}
                        className="underline font-medium text-blue-600 hover:text-blue-800"
                      >
                        Ver
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {l.source === 'DB' && typeof l.id === 'number' ? (
                      <form action={require('../../../actions/delete-fuel-log').deleteFuelLog} onSubmit={(e) => { if (!confirm(`¿Eliminar registro ${l.id}?`)) { e.preventDefault(); } }}>
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

      {/* Image Preview Modal for FuelTable */}
      <ImagePreviewModal
        imageUrl={fuelImageModalUrl}
        onClose={() => setFuelImageModalUrl(null)}
        alt="Boleta de combustible"
      />
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
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${editMode
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
  // Get usage stats from new predictive system
  const stats = overviewMetrics?.nextInspections?.usageStats;
  const weightedRate = stats?.weightedRate || 0;  // hrs/day
  const stdDev = stats?.stdDev || 0;
  const trend = stats?.trend || 0;
  const rate30d = stats?.rate30d || 0;

  // Overhaul modal state
  const [overhaulModal, setOverhaulModal] = useState<{ open: boolean; component: any | null }>({ open: false, component: null });
  const [overhaulForm, setOverhaulForm] = useState({ airframeHours: '', date: '', notes: '' });
  const [overhaulSubmitting, setOverhaulSubmitting] = useState(false);
  const [overhaulResult, setOverhaulResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const router = useRouter();

  // Calculate predicted inspection with confidence interval
  const getPrediction = (hoursRemaining: number) => {
    if (weightedRate <= 0) return null;

    const days = Math.round(hoursRemaining / weightedRate);
    const uncertainty = 1.96 * stdDev * Math.sqrt(days > 0 ? days : 1) / weightedRate;
    const minDays = Math.max(1, Math.round(days - uncertainty));
    const maxDays = Math.round(days + uncertainty);

    const today = new Date();
    const date = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const minDate = new Date(today.getTime() + minDays * 24 * 60 * 60 * 1000);
    const maxDate = new Date(today.getTime() + maxDays * 24 * 60 * 60 * 1000);

    return { days, minDays, maxDays, date, minDate, maxDate };
  };

  // Build inspection items for Oil Change and 100-Hour
  const inspectionItems = [
    {
      id: 'oil-change',
      name: 'Cambio de Aceite',
      interval: 50,
      remaining: overviewMetrics?.nextInspections?.oilChangeRemaining ?? 0,
      icon: '🛢️'
    },
    {
      id: '100-hour',
      name: 'Inspección 100 Horas',
      interval: 100,
      remaining: overviewMetrics?.nextInspections?.hundredHourRemaining ?? 0,
      icon: '🔧'
    }
  ];

  const formatDate = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatShortDate = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });

  // Format days remaining as human-readable: "X,Y años" / "X meses" / "X días"
  const formatTimeRemaining = (days: number): string => {
    if (days <= 0) return '0 días';
    if (days < 30) return `${days} días`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} ${months === 1 ? 'mes' : 'meses'}`;
    }
    const years = days / 365;
    return `${years.toFixed(1)} años`;
  };

  const getUrgencyClass = (days: number) => {
    if (days <= 7) return { row: 'bg-red-50 border-l-4 border-red-500', badge: 'bg-red-100 text-red-700', text: 'text-red-600' };
    if (days <= 15) return { row: 'bg-orange-50 border-l-4 border-orange-500', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-600' };
    if (days <= 30) return { row: 'bg-yellow-50 border-l-4 border-yellow-500', badge: 'bg-yellow-100 text-yellow-700', text: 'text-yellow-600' };
    return { row: 'hover:bg-blue-50', badge: 'bg-green-100 text-green-700', text: 'text-green-600' };
  };

  // Overhaul functions
  const openOverhaulModal = (component: any) => {
    setOverhaulModal({ open: true, component });
    setOverhaulForm({
      airframeHours: component.overhaul_airframe?.toString() || '',
      date: component.overhaul_date ? new Date(component.overhaul_date).toISOString().split('T')[0] : '',
      notes: component.overhaul_notes || '',
    });
    setOverhaulResult(null);
  };

  const handleOverhaulSubmit = async () => {
    if (!overhaulModal.component) return;
    const c = overhaulModal.component;

    if (!overhaulForm.airframeHours || !overhaulForm.date) {
      setOverhaulResult({ success: false, error: 'Horas de airframe y fecha son requeridas' });
      return;
    }

    setOverhaulSubmitting(true);
    setOverhaulResult(null);

    try {
      // If no dbId, we need to create the component first
      let componentDbId = c.dbId;

      if (!componentDbId) {
        // We'll handle this in the server action - create component on the fly
        setOverhaulResult({ success: false, error: 'Componente no encontrado en la base de datos. Ejecute el script de inicialización primero.' });
        setOverhaulSubmitting(false);
        return;
      }

      const result = await registerOverhaul({
        componentId: componentDbId,
        tipo: c.tipo,
        aircraftId: c.aircraftId,
        overhaulAirframeHours: parseFloat(overhaulForm.airframeHours),
        overhaulDate: overhaulForm.date,
        notes: overhaulForm.notes || undefined,
      });

      setOverhaulResult(result);
      if (result.success) {
        // Refresh data after 1.5 seconds
        setTimeout(() => {
          router.refresh();
          setOverhaulModal({ open: false, component: null });
        }, 1500);
      }
    } catch (err: any) {
      setOverhaulResult({ success: false, error: err.message || 'Error desconocido' });
    }
    setOverhaulSubmitting(false);
  };

  // Calculate preview for overhaul modal
  const overhaulPreview = useMemo(() => {
    if (!overhaulModal.component || !overhaulForm.airframeHours) return null;
    const currentAirframe = components.find(c => c.tipo === 'AIRFRAME' && c.aircraftId === overhaulModal.component?.aircraftId)?.horas_acumuladas || 0;
    const overhaulAt = parseFloat(overhaulForm.airframeHours);
    if (isNaN(overhaulAt) || overhaulAt <= 0) return null;
    const hoursSinceOverhaul = currentAirframe - overhaulAt;
    const tbo = Number(overhaulModal.component.limite_tbo);
    const remaining = tbo - hoursSinceOverhaul;
    const pct = (hoursSinceOverhaul / tbo) * 100;
    return { hoursSinceOverhaul: hoursSinceOverhaul.toFixed(1), remaining: remaining.toFixed(1), pct: pct.toFixed(1), currentAirframe };
  }, [overhaulForm.airframeHours, overhaulModal.component, components]);

  return (
    <div className="space-y-6">
      {/* Smart Predictions Header */}
      {stats && (
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-6 shadow-xl text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔮</span>
              <div>
                <h3 className="text-xl font-bold">Sistema Predictivo SMART</h3>
                <p className="text-indigo-200 text-sm">Tasa híbrida: ⅔ anual + ⅓ últimos 90 días</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{(weightedRate * 7).toFixed(1)}</div>
                <div className="text-xs text-indigo-200">TACH/semana</div>
                <div className="text-xs text-indigo-300/70">≈{(weightedRate * 7 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{(weightedRate * 30).toFixed(1)}</div>
                <div className="text-xs text-indigo-200">TACH/mes</div>
                <div className="text-xs text-indigo-300/70">≈{(weightedRate * 30 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold flex items-center gap-1 ${trend > 0 ? 'text-orange-300' : trend < 0 ? 'text-green-300' : ''}`}>
                  {trend > 0 ? '↗️' : trend < 0 ? '↘️' : '→'} {Math.abs(trend).toFixed(0)}%
                </div>
                <div className="text-xs text-indigo-200">tendencia</div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-indigo-200 text-xs">Tasa 30 días</div>
              <div className="font-mono font-bold">{(rate30d * 30).toFixed(1)} TACH/mes</div>
              <div className="text-indigo-300/70 text-xs">≈{(rate30d * 30 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-indigo-200 text-xs">Tasa 60 días</div>
              <div className="font-mono font-bold">{((stats.rate60d || 0) * 30).toFixed(1)} TACH/mes</div>
              <div className="text-indigo-300/70 text-xs">≈{((stats.rate60d || 0) * 30 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-indigo-200 text-xs">Tasa 90 días</div>
              <div className="font-mono font-bold">{((stats.rate90d || 0) * 30).toFixed(1)} TACH/mes</div>
              <div className="text-indigo-300/70 text-xs">≈{((stats.rate90d || 0) * 30 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
            </div>
            <div className="bg-white/15 rounded-lg p-3 border border-white/20">
              <div className="text-indigo-200 text-xs">📊 Tasa Anual</div>
              <div className="font-mono font-bold">{((stats.rateAnnual || 0) * 30).toFixed(1)} TACH/mes</div>
              <div className="text-indigo-300/70 text-xs">≈{((stats.rateAnnual || 0) * 30 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
            </div>
          </div>
        </div>
      )}

      {/* Next Inspections - Enhanced with Smart Predictions */}
      <div className="bg-white/95 backdrop-blur-lg border-2 border-amber-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-8 py-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Próximas Inspecciones
            </h3>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-bold">🔮 SMART</span>
          </div>
          <p className="text-amber-100 text-sm mt-1">Predicciones con intervalo de confianza del 95%</p>
        </div>

        <div className="p-6 space-y-4">
          {inspectionItems.map(item => {
            const pred = getPrediction(item.remaining);
            const urgency = pred ? getUrgencyClass(pred.days) : getUrgencyClass(999);

            return (
              <div key={item.id} className={`rounded-xl border-2 p-4 transition-all ${urgency.row}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.name}</h4>
                      <p className="text-xs text-slate-500">Intervalo: {item.interval} hrs</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold font-mono ${urgency.text}`}>{item.remaining.toFixed(1)} <span className="text-base">TACH</span></div>
                    <div className="text-sm text-slate-600 font-mono">(≈{(item.remaining * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS)</div>
                    <div className="text-xs text-slate-500">horas restantes</div>
                  </div>
                </div>

                {pred && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">⏱️ Tiempo Restante</div>
                      <div className={`font-bold text-lg ${urgency.text}`}>{formatTimeRemaining(pred.days)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">📅 Fecha Estimada</div>
                      <div className="font-bold text-slate-900">{formatDate(pred.date)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">📈 Rango (95%)</div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${urgency.badge}`}>
                          {formatTimeRemaining(pred.minDays)} - {formatTimeRemaining(pred.maxDays)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!pred && (
                  <div className="text-sm text-slate-500 italic mt-2">Sin datos suficientes para predicción</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Predicciones basadas en media ponderada: 30d (×3) + 60d (×2) + 90d (×1). Desviación estándar: {stdDev.toFixed(3)} hrs/día.
          </p>
        </div>
      </div>

      {/* Component Status Table */}
      <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-8 py-6">
          <h3 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Estado de Componentes (TBO)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Aeronave</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Componente</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Horas</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">TBO</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Restante</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Vida %</th>
                {weightedRate > 0 && <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Est. TBO</th>}
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Overhaul</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {components.map(c => {
                const restante = Number(c.limite_tbo) - Number(c.horas_acumuladas);
                const pct = (Number(c.horas_acumuladas) / Number(c.limite_tbo)) * 100;
                const colorClass = pct > 80 ? 'text-red-600 font-bold' : pct > 60 ? 'text-orange-500 font-bold' : 'text-green-600 font-bold';
                const tboPred = weightedRate > 0 ? getPrediction(restante) : null;
                const hasOverhaul = c.overhaul_airframe != null;

                return (
                  <tr key={c.id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600 font-mono">{c.aircraftId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {c.tipo}
                      {hasOverhaul && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title={`Overhaul @ AF ${c.overhaul_airframe}${c.overhaul_date ? ' - ' + new Date(c.overhaul_date).toLocaleDateString('es-CL') : ''}`}>
                          ✅ OH
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{Number(c.horas_acumuladas).toFixed(1)} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{Number(c.limite_tbo).toFixed(0)} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">{restante.toFixed(1)} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${colorClass}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                    {weightedRate > 0 && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {tboPred ? (
                          <span className="font-mono font-semibold">{formatTimeRemaining(tboPred.days)}</span>
                        ) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {c.tipo !== 'AIRFRAME' && (
                        <button
                          onClick={() => openOverhaulModal(c)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors border border-indigo-200"
                          title={hasOverhaul ? 'Editar overhaul' : 'Registrar overhaul'}
                        >
                          🔧 {hasOverhaul ? 'Editar' : 'Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overhaul Registration Modal */}
      {overhaulModal.open && overhaulModal.component && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOverhaulModal({ open: false, component: null })}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-5 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                🔧 Overhaul - {overhaulModal.component.tipo}
              </h3>
              <p className="text-indigo-200 text-sm mt-1">Aeronave: {overhaulModal.component.aircraftId}</p>
            </div>

            <div className="p-6 space-y-5">
              {/* Explanation */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">💡 ¿Cómo funciona?</p>
                <p>Se usa AIRFRAME como referencia estable (no se reinicia con overhauls de motor). Las horas desde el overhaul se calculan como:</p>
                <p className="font-mono mt-1 text-center font-bold">Horas = AIRFRAME actual − AIRFRAME al overhaul</p>
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Horas AIRFRAME al momento del overhaul *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={overhaulForm.airframeHours}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, airframeHours: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-mono text-lg"
                    placeholder="ej: 2745.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Fecha del overhaul *
                  </label>
                  <input
                    type="date"
                    value={overhaulForm.date}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={overhaulForm.notes}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                    rows={2}
                    placeholder="ej: Overhaul completo en taller XYZ"
                  />
                </div>
              </div>

              {/* Preview */}
              {overhaulPreview && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
                  <h4 className="font-bold text-green-800 mb-3 flex items-center gap-2">📊 Vista Previa</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-slate-500 text-xs">AIRFRAME actual</div>
                      <div className="font-mono font-bold text-lg">{overhaulPreview.currentAirframe.toFixed(1)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-slate-500 text-xs">Overhaul @</div>
                      <div className="font-mono font-bold text-lg">{parseFloat(overhaulForm.airframeHours).toFixed(1)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-slate-500 text-xs">Horas desde OH</div>
                      <div className="font-mono font-bold text-lg text-indigo-600">{overhaulPreview.hoursSinceOverhaul}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center">
                      <div className="text-slate-500 text-xs">Restante TBO</div>
                      <div className="font-mono font-bold text-lg text-green-600">{overhaulPreview.remaining}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <span className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-bold ${parseFloat(overhaulPreview.pct) > 80 ? 'bg-red-100 text-red-700' : parseFloat(overhaulPreview.pct) > 60 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      {overhaulPreview.pct}% vida usada
                    </span>
                  </div>
                </div>
              )}

              {/* Result message */}
              {overhaulResult && (
                <div className={`rounded-lg p-4 text-sm font-semibold ${overhaulResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {overhaulResult.success ? `✅ ${overhaulResult.message}` : `❌ ${overhaulResult.error}`}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setOverhaulModal({ open: false, component: null })}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOverhaulSubmit}
                  disabled={overhaulSubmitting || !overhaulForm.airframeHours || !overhaulForm.date}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-colors"
                >
                  {overhaulSubmitting ? '⏳ Guardando...' : '💾 Guardar Overhaul'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type BankMovement = { correlativo: number; fecha: string; descripcion: string; egreso: number | null; ingreso: number | null; saldo: number; tipo: string; cliente: string | null; attachmentUrl?: string | null };

function FinanzasTable({ movements, palette }: { movements: BankMovement[]; palette: any }) {
  const [filterTipo, setFilterTipo] = useState<string>('ALL');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [searchText, setSearchText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('asc');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [editingCell, setEditingCell] = useState<{ correlativo: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [expandedDescs, setExpandedDescs] = useState<Set<number>>(new Set());
  const [viewingAttachment, setViewingAttachment] = useState<{ url: string; correlativo: number } | null>(null);
  const pageSize = 50;

  const TIPO_OPTIONS = [
    'Pago piloto', 'Combustible', 'Mantenimiento', 'Repuestos', 'Hangar',
    'Seguro', 'Overhaul', 'Inversión', 'Impuesto', 'Banco', 'Operacional', 'Sin clasificar',
  ];

  const startEditing = (correlativo: number, field: string, currentValue: string) => {
    setEditingCell({ correlativo, field });
    setEditValue(currentValue || '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    setSaving(true);
    try {
      const res = await fetch('/api/update-movimiento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correlativo: editingCell.correlativo, field: editingCell.field, value: editValue }),
      });
      const data = await res.json();
      if (data.ok) {
        // Update local state to reflect the change immediately
        const key = `${editingCell.correlativo}_${editingCell.field}`;
        setLocalEdits(prev => ({ ...prev, [key]: editValue }));
        setEditingCell(null);
        setEditValue('');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error de red: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getDisplayValue = (m: BankMovement, field: 'tipo' | 'cliente' | 'descripcion') => {
    const key = `${m.correlativo}_${field}`;
    return key in localEdits ? localEdits[key] : (m[field] || '');
  };

  const handleCartolaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Solo se aceptan archivos Excel (.xlsx)');
      return;
    }

    if (!confirm(`¿Subir cartola "${file.name}" y agregar nuevos movimientos a Movimientos.xlsx?`)) {
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-cartola', { method: 'POST', body: formData });
      const data = await res.json();
      setUploadResult(data);
      if (data.ok && data.added > 0) {
        setTimeout(() => location.reload(), 3000);
      }
    } catch (err: any) {
      setUploadResult({ ok: false, error: err.message || 'Error de red' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAttachFile = async (correlativo: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo no puede superar los 10MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('correlativo', correlativo.toString());

      const res = await fetch('/api/upload-movimiento-attachment', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.ok) {
        // Find and update the movement in local state if pagination allows, but location.reload is safer
        setTimeout(() => location.reload(), 500);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error de red: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (correlativo: number) => {
    if (!confirm('¿Seguro que deseas eliminar este archivo adjunto?')) return;

    setUploading(true);
    try {
      const res = await fetch('/api/upload-movimiento-attachment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correlativo })
      });
      const data = await res.json();
      if (data.ok) {
        setTimeout(() => location.reload(), 500);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error de red: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Get unique types and years
  const tipos = useMemo(() => {
    const set = new Set<string>();
    movements.forEach(m => { if (m.tipo) set.add(m.tipo); });
    return Array.from(set).sort();
  }, [movements]);

  const years = useMemo(() => {
    const set = new Set<string>();
    movements.forEach(m => {
      if (m.fecha) {
        const y = m.fecha.slice(0, 4);
        if (y) set.add(y);
      }
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [movements]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...movements];
    if (filterTipo !== 'ALL') result = result.filter(m => {
      const key = `${m.correlativo}_tipo`;
      const displayTipo = key in localEdits ? localEdits[key] : m.tipo;
      return displayTipo === filterTipo;
    });
    if (filterYear) result = result.filter(m => m.fecha?.startsWith(filterYear));
    if (filterMonth) result = result.filter(m => {
      const month = m.fecha?.slice(5, 7);
      return month === filterMonth;
    });
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(m => {
        const descKey = `${m.correlativo}_descripcion`;
        const clienteKey = `${m.correlativo}_cliente`;
        const desc = descKey in localEdits ? localEdits[descKey] : (m.descripcion || '');
        const cliente = clienteKey in localEdits ? localEdits[clienteKey] : (m.cliente || '');
        return desc.toLowerCase().includes(q) || cliente.toLowerCase().includes(q);
      });
    }
    if (sortOrder === 'asc') result.reverse();
    return result;
  }, [movements, filterTipo, filterYear, filterMonth, searchText, sortOrder, localEdits]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Summary stats
  const stats = useMemo(() => {
    const totalIngresos = filtered.reduce((s, m) => s + (m.ingreso || 0), 0);
    const totalEgresos = filtered.reduce((s, m) => s + (m.egreso || 0), 0);
    const lastSaldo = movements.length > 0 ? movements[movements.length - 1].saldo : 0;

    // By tipo (use local edits)
    const byTipo: Record<string, { ingresos: number; egresos: number; count: number }> = {};
    filtered.forEach(m => {
      const tipoKey = `${m.correlativo}_tipo`;
      const t = (tipoKey in localEdits ? localEdits[tipoKey] : m.tipo) || 'Sin tipo';
      if (!byTipo[t]) byTipo[t] = { ingresos: 0, egresos: 0, count: 0 };
      byTipo[t].ingresos += (m.ingreso || 0);
      byTipo[t].egresos += (m.egreso || 0);
      byTipo[t].count++;
    });

    return { totalIngresos, totalEgresos, lastSaldo, byTipo };
  }, [filtered, movements, localEdits]);

  const tipoColors: Record<string, string> = {
    'Pago piloto': 'bg-emerald-100 text-emerald-800',
    'Combustible': 'bg-amber-100 text-amber-800',
    'Mantenimiento': 'bg-purple-100 text-purple-800',
    'Repuestos': 'bg-pink-100 text-pink-800',
    'Hangar': 'bg-cyan-100 text-cyan-800',
    'Seguro': 'bg-sky-100 text-sky-800',
    'Overhaul': 'bg-red-100 text-red-800',
    'Inversión': 'bg-blue-100 text-blue-800',
    'Impuesto': 'bg-rose-100 text-rose-800',
    'Banco': 'bg-slate-100 text-slate-800',
    'Operacional': 'bg-orange-100 text-orange-800',
    'Sin clasificar': 'bg-gray-100 text-gray-800',
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch { return dateStr; }
  };

  const hasActiveFilters = filterTipo !== 'ALL' || filterYear || filterMonth || searchText;

  return (
    <div className="space-y-6">
      {/* Upload Cartola Section */}
      <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Subir Cartola Bancaria</h4>
            <p className="text-xs text-slate-500 mt-1">Sube el archivo Excel de &quot;últimos movimientos&quot; del banco para agregar automáticamente los nuevos movimientos</p>
          </div>
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all ${uploading ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl'}`}>
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Procesando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                Subir Cartola (.xlsx)
              </>
            )}
            <input type="file" accept=".xlsx,.xls" onChange={handleCartolaUpload} className="hidden" disabled={uploading} />
          </label>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <div className={`mt-4 p-4 rounded-xl border-2 ${uploadResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-3">
              {uploadResult.ok ? (
                <svg className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ) : (
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              )}
              <div className="flex-1">
                <p className={`text-sm font-bold ${uploadResult.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                  {uploadResult.message || uploadResult.error}
                </p>
                {uploadResult.ok && uploadResult.added > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-emerald-700">
                      ✅ {uploadResult.added} nuevos movimientos agregados • {uploadResult.skipped} omitidos (duplicados)
                    </p>
                    <p className="text-xs text-emerald-700">
                      Último correlativo: #{uploadResult.lastCorrelativo} • Saldo final: ${formatCurrency(uploadResult.lastSaldo)}
                    </p>
                    {uploadResult.entries && uploadResult.entries.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-emerald-600 cursor-pointer font-medium hover:text-emerald-800">
                          Ver {uploadResult.entries.length} movimientos agregados
                        </summary>
                        <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-emerald-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-emerald-50 sticky top-0">
                              <tr>
                                <th className="px-2 py-1.5 text-left font-bold text-emerald-700">#</th>
                                <th className="px-2 py-1.5 text-left font-bold text-emerald-700">Fecha</th>
                                <th className="px-2 py-1.5 text-left font-bold text-emerald-700">Descripción</th>
                                <th className="px-2 py-1.5 text-right font-bold text-red-600">Egreso</th>
                                <th className="px-2 py-1.5 text-right font-bold text-emerald-600">Ingreso</th>
                                <th className="px-2 py-1.5 text-left font-bold text-emerald-700">Tipo</th>
                                <th className="px-2 py-1.5 text-left font-bold text-emerald-700">Código</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100">
                              {uploadResult.entries.map((e: any, i: number) => (
                                <tr key={i} className="hover:bg-emerald-50/50">
                                  <td className="px-2 py-1 text-slate-500 font-mono">{e.correlativo}</td>
                                  <td className="px-2 py-1 text-slate-700 whitespace-nowrap">{e.fecha}</td>
                                  <td className="px-2 py-1 text-slate-800 font-medium">{e.descripcion}</td>
                                  <td className="px-2 py-1 text-right font-mono">{e.egreso ? <span className="text-red-600">-${formatCurrency(e.egreso)}</span> : ''}</td>
                                  <td className="px-2 py-1 text-right font-mono">{e.ingreso ? <span className="text-emerald-600">+${formatCurrency(e.ingreso)}</span> : ''}</td>
                                  <td className="px-2 py-1"><span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tipoColors[e.tipo] || 'bg-gray-100 text-gray-800'}`}>{e.tipo}</span></td>
                                  <td className="px-2 py-1 font-bold text-slate-600">{e.cliente || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                    <p className="text-xs text-emerald-600 mt-2 italic">Recargando página en 3 segundos...</p>
                  </div>
                )}
              </div>
              <button onClick={() => setUploadResult(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saldo Actual</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">${formatCurrency(Math.round(stats.lastSaldo))}</p>
        </div>
        <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Total Ingresos</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">${formatCurrency(Math.round(stats.totalIngresos))}</p>
          <p className="text-xs text-slate-500 mt-1">{filtered.filter(m => m.ingreso).length} transacciones</p>
        </div>
        <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Total Egresos</p>
          <p className="text-xl sm:text-2xl font-black text-red-700 mt-1">${formatCurrency(Math.round(stats.totalEgresos))}</p>
          <p className="text-xs text-slate-500 mt-1">{filtered.filter(m => m.egreso).length} transacciones</p>
        </div>
        <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Movimientos</p>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{filtered.length}</p>
          <p className="text-xs text-slate-500 mt-1">de {movements.length} total</p>
        </div>
      </div>

      {/* Breakdown by Tipo */}
      <div className={`${palette.card} rounded-xl p-4 sm:p-5 ${palette.shadow}`}>
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Desglose por Tipo</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(stats.byTipo).sort((a, b) => (b[1].ingresos + b[1].egresos) - (a[1].ingresos + a[1].egresos)).map(([tipo, data]) => (
            <button
              key={tipo}
              onClick={() => setFilterTipo(filterTipo === tipo ? 'ALL' : tipo)}
              className={`text-left p-3 rounded-lg border transition-all ${filterTipo === tipo ? 'ring-2 ring-blue-500 border-blue-300' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${tipoColors[tipo] || 'bg-gray-100 text-gray-800'}`}>
                {tipo}
              </span>
              <div className="mt-1.5 text-xs text-slate-600">
                {data.count} mov.
                {data.ingresos > 0 && <span className="text-emerald-600 ml-1">+${formatCurrency(Math.round(data.ingresos))}</span>}
                {data.egresos > 0 && <span className="text-red-600 ml-1">-${formatCurrency(Math.round(data.egresos))}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters + Table */}
      <div className="bg-white/95 backdrop-blur-lg border-2 border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-blue-900 px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Movimientos Bancarios
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs font-medium transition-all"
              >
                {sortOrder === 'desc' ? '↓ Recientes' : '↑ Antiguos'}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterTipo('ALL'); setFilterYear(''); setFilterMonth(''); setSearchText(''); setCurrentPage(1); }}
                  className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 rounded-lg text-white text-xs font-medium transition-all"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 sm:gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-40 sm:w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={filterTipo}
            onChange={e => { setFilterTipo(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Todos los tipos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterYear}
            onChange={e => { setFilterYear(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los años</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={filterMonth}
            onChange={e => { setFilterMonth(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los meses</option>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => (
              <option key={m} value={m}>{['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][i]}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] sm:text-sm">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-200">
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-left text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">#</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-left text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Fecha</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-left text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Descripción</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-right text-[8px] sm:text-xs font-bold text-red-600 uppercase tracking-wider">Egreso</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-right text-[8px] sm:text-xs font-bold text-emerald-600 uppercase tracking-wider">Ingreso</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-right text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Saldo</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-center text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Tipo</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-center text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Código</th>
                <th className="px-1 sm:px-3 py-2 sm:py-3 text-center text-[8px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">Doc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((m, i) => (
                <tr key={`${m.correlativo}-${i}`} className="hover:bg-blue-50/50 transition-colors group">
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-xs text-slate-400 font-mono">{m.correlativo}</td>
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-xs font-medium text-slate-700 whitespace-nowrap">{formatDate(m.fecha)}</td>
                  {/* Descripción - editable on double click */}
                  <td className={`px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-sm text-slate-800 font-medium ${expandedDescs.has(m.correlativo) ? '' : 'max-w-[100px] sm:max-w-[200px]'}`}>
                    {editingCell?.correlativo === m.correlativo && editingCell?.field === 'descripcion' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                          className="w-full px-2 py-1 text-sm border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50"
                          autoFocus
                          disabled={saving}
                        />
                        <button onClick={saveEdit} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={cancelEditing} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`block cursor-pointer hover:text-blue-600 transition-all ${expandedDescs.has(m.correlativo) ? 'whitespace-normal' : 'truncate'}`}
                        onClick={() => setExpandedDescs(prev => {
                          const next = new Set(prev);
                          if (next.has(m.correlativo)) next.delete(m.correlativo);
                          else next.add(m.correlativo);
                          return next;
                        })}
                        onDoubleClick={() => startEditing(m.correlativo, 'descripcion', getDisplayValue(m, 'descripcion'))}
                        title={expandedDescs.has(m.correlativo) ? 'Clic para colapsar · Doble clic para editar' : 'Clic para expandir · Doble clic para editar'}
                      >
                        {getDisplayValue(m, 'descripcion')}
                      </span>
                    )}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-sm text-right font-mono whitespace-nowrap">
                    {m.egreso ? <span className="text-red-600 font-semibold">-${formatCurrency(Math.round(m.egreso))}</span> : ''}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-sm text-right font-mono whitespace-nowrap">
                    {m.ingreso ? <span className="text-emerald-600 font-semibold">+${formatCurrency(Math.round(m.ingreso))}</span> : ''}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-[9px] sm:text-sm text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                    ${formatCurrency(Math.round(m.saldo))}
                  </td>
                  {/* Tipo - editable on click with dropdown */}
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-center">
                    {editingCell?.correlativo === m.correlativo && editingCell?.field === 'tipo' ? (
                      <div className="flex items-center gap-1 justify-center">
                        <select
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                          className="px-2 py-1 text-xs border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50 font-bold"
                          autoFocus
                          disabled={saving}
                        >
                          <option value="">— Sin tipo —</option>
                          {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={saveEdit} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={cancelEditing} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => startEditing(m.correlativo, 'tipo', getDisplayValue(m, 'tipo'))}
                        className={`inline-block px-1 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-xs font-bold cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${tipoColors[getDisplayValue(m, 'tipo')] || 'bg-gray-100 text-gray-800'}`}
                        title="Clic para cambiar tipo"
                      >
                        {getDisplayValue(m, 'tipo') || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-center">
                    {editingCell?.correlativo === m.correlativo && editingCell?.field === 'cliente' ? (
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                          className="w-20 px-2 py-1 text-xs border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50 font-bold text-center uppercase"
                          autoFocus
                          disabled={saving}
                          placeholder="Código"
                        />
                        <button onClick={saveEdit} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={cancelEditing} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => startEditing(m.correlativo, 'cliente', getDisplayValue(m, 'cliente'))}
                        className="text-[9px] sm:text-xs font-bold text-slate-600 cursor-pointer hover:text-blue-600 hover:bg-blue-50 px-1 sm:px-2 py-1 rounded transition-all"
                        title="Clic para editar código"
                      >
                        {getDisplayValue(m, 'cliente') || <span className="text-slate-300">—</span>}
                      </span>
                    )}
                  </td>
                  {/* Attachment Column */}
                  <td className="px-1 sm:px-3 py-1.5 sm:py-2.5 text-center align-middle whitespace-nowrap">
                    {m.attachmentUrl ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewingAttachment({ url: m.attachmentUrl!, correlativo: m.correlativo })}
                          className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-900 rounded-lg transition-colors border border-blue-200 flex-shrink-0"
                          title="Ver documento adjunto"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(m.correlativo)}
                          disabled={uploading}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          title="Eliminar documento"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ) : (
                      <label className={`cursor-pointer inline-flex items-center justify-center p-1.5 border border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`} title="Subir documento (PDF o Imagen)">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(e) => handleAttachFile(m.correlativo, e)} />
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
            <span className="text-xs text-slate-500">
              Mostrando {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <span className="px-3 py-1.5 text-xs font-bold text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Attachment Viewer Modal */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10 relative">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-white/50 backdrop-blur-md sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-2.5 bg-blue-100/50 text-blue-600 rounded-lg sm:rounded-xl ring-1 ring-blue-100/50">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">Documento Adjunto</h3>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Movimiento #{viewingAttachment.correlativo}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewingAttachment.url}
                  download
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition-colors"
                  title="Descargar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Descargar
                </a>
                <button
                  onClick={() => setViewingAttachment(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  aria-label="Cerrar modal"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Viewer Content */}
            <div className="flex-1 bg-slate-50 relative overflow-hidden">
              <iframe
                src={viewingAttachment.url}
                className="w-full h-full border-0 absolute inset-0"
                title={`Documento ${viewingAttachment.correlativo}`}
                loading="lazy"
              />
            </div>

            {/* Mobile actions (bottom) */}
            <div className="sm:hidden p-3 border-t border-slate-100 bg-white grid grid-cols-2 gap-2 shrink-0">
              <a
                href={viewingAttachment.url}
                download
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium text-sm rounded-xl"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Descargar
              </a>
              <button
                onClick={() => setViewingAttachment(null)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceCharts({ flights, transactions, palette }: { flights: any[]; transactions: any[]; palette: any }) {
  const monthly = useMemo(() => {
    const map: Record<string, { hours: number; revenue: number }> = {};
    flights.forEach(f => {
      const k = new Date(f.fecha).toISOString().slice(0, 7);
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

function DepositsTable({ depositsDetailsByCode, csvPilotNames }: { depositsDetailsByCode?: Record<string, { id?: number; fecha: string; descripcion: string; monto: number; source?: 'CSV' | 'DB' }[]>; csvPilotNames?: Record<string, string> }) {
  const [sortBy, setSortBy] = useState<"date" | "pilot" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const router = useRouter();

  const allDeposits = useMemo(() => {
    const deposits: { id?: number; code: string; pilotName: string; fecha: string; descripcion: string; monto: number; source: string }[] = [];
    if (!depositsDetailsByCode) return deposits;

    Object.entries(depositsDetailsByCode).forEach(([code, records]) => {
      const pilotName = csvPilotNames?.[code] || code;
      records.forEach(r => {
        deposits.push({ id: r.id, code, pilotName, fecha: r.fecha, descripcion: r.descripcion, monto: r.monto, source: r.source || 'CSV' });
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

  const handleDelete = async (depositId: number, pilotName: string, monto: number) => {
    if (!confirm(`¿Eliminar este depósito?\n\nPiloto: ${pilotName}\nMonto: $${monto.toLocaleString('es-CL')}\n\nEsto también eliminará la transacción ABONO asociada y afectará el saldo del piloto.`)) return;
    setDeletingId(depositId);
    try {
      const { deleteDeposit } = await import('../../../actions/delete-deposit');
      const result = await deleteDeposit(depositId);
      if (result.ok) {
        alert('Depósito eliminado correctamente');
        router.refresh();
      } else {
        alert(result.error || 'Error al eliminar');
      }
    } catch (e) {
      alert('Error al eliminar el depósito');
    } finally {
      setDeletingId(null);
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
              <th className="px-6 py-4 text-center font-bold text-slate-700 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {allDeposits.map((d, idx) => (
              <tr key={d.id || idx} className="hover:bg-blue-50 transition">
                <td className="px-6 py-4 text-slate-700 font-medium">{d.fecha}</td>
                <td className="px-6 py-4 text-slate-900 font-semibold">
                  {d.pilotName}
                  <span className="ml-2 text-xs text-slate-500 font-normal">({d.code})</span>
                </td>
                <td className="px-6 py-4 text-slate-600">{d.descripcion}</td>
                <td className="px-6 py-4 text-right text-green-700 font-bold">
                  ${d.monto.toLocaleString('es-CL')}
                </td>
                <td className="px-6 py-4 text-center">
                  {d.source === 'DB' && d.id ? (
                    <button
                      onClick={() => handleDelete(d.id!, d.pilotName, d.monto)}
                      disabled={deletingId === d.id}
                      className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold disabled:opacity-50 transition-colors"
                    >
                      {deletingId === d.id ? '...' : 'Eliminar'}
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
