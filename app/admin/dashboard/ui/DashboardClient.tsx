"use client";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler, DoughnutController, ArcElement } from "chart.js";
import { generateAccountStatementPDF } from "../../../../lib/generate-account-pdf";
import { formatFecha, parseLocalDate, toDateString, getDateYear } from "../../../../lib/date-utils";
import ImagePreviewModal from "../../../components/ImagePreviewModal";
import { registerOverhaul } from "../../../actions/register-overhaul";
import EngineAnalysis from "./EngineAnalysis";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, BarController, BarElement, Legend, Tooltip, Filler, DoughnutController, ArcElement);

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

type BankMovement = {
  correlativo: number;
  fecha: string;
  descripcion: string;
  egreso: number | null;
  ingreso: number | null;
  saldo: number;
  tipo: string;
  cliente: string | null;
  attachmentUrl?: string | null;
};

const getDisplayValue = (m: any, field: string) => {
  return m?.[field] || '';
};

export default function DashboardClient({ initialData, overviewMetrics, pagination, allowedPilotCodes, registeredPilotCodes, csvPilotNames }: { initialData: InitialData; overviewMetrics?: OverviewMetrics; pagination?: PaginationInfo; allowedPilotCodes?: string[]; registeredPilotCodes?: string[]; csvPilotNames?: Record<string, string> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [pilotSubTab, setPilotSubTab] = useState<"accounts" | "directory" | "deposits">("accounts");
  const [financeSubTab, setFinanceSubTab] = useState<"movements" | "costs">("movements");
  const [mxSubTab, setMxSubTab] = useState<"components" | "engine">("components");
  const [pendingEngineFlightIds, setPendingEngineFlightIds] = useState<number[] | null>(null);
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
        const y = getDateYear(f.fecha).toString();
        return y === yearFilter;
      })
      .filter(f => {
        const d = parseLocalDate(f.fecha).getTime();
        const after = startDate ? parseLocalDate(startDate).getTime() : -Infinity;
        const before = endDate ? parseLocalDate(endDate).getTime() : Infinity;
        return d >= after && d <= before;
      });
    const sorted = filtered.slice().sort((a, b) => {
      const da = parseLocalDate(a.fecha).getTime();
      const db = parseLocalDate(b.fecha).getTime();
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

  // Drag and drop handlers for Overview cards
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);

  const handleDragStart = (cardId: string) => {
    setDraggedCard(cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetCardId: string) => {
    if (!draggedCard || draggedCard === targetCardId) {
      setDraggedCard(null);
      setDragOverCard(null);
      return;
    }

    const newOrder = [...cardOrder];
    const draggedIndex = newOrder.indexOf(draggedCard);
    const targetIndex = newOrder.indexOf(targetCardId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCard(null);
      setDragOverCard(null);
      return;
    }

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedCard);

    setCardOrder(newOrder);
    localStorage.setItem('overview-card-order', JSON.stringify(newOrder));
    setDraggedCard(null);
    setDragOverCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverCard(null);
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

  // --- Mobile long-press drag-and-drop system ---
  const dragActivatedRef = useRef(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Find which card is under a touch point
  const findCardUnderTouch = (clientX: number, clientY: number): string | null => {
    const element = document.elementFromPoint(clientX, clientY);
    let el = element as HTMLElement | null;
    while (el && !el.getAttribute('data-card-id')) {
      el = el.parentElement;
    }
    return el?.getAttribute('data-card-id') || null;
  };

  const lockScroll = () => {
    document.body.style.overflow = 'hidden';
    if (gridRef.current) gridRef.current.style.touchAction = 'none';
  };
  const unlockScroll = () => {
    document.body.style.overflow = '';
    if (gridRef.current) gridRef.current.style.touchAction = '';
  };

  // Non-passive touchmove listener — the ONLY way to block scroll on iOS Safari
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const onTouchMove = (e: TouchEvent) => {
      if (!dragActivatedRef.current) {
        // If finger moves before long-press completes, cancel the timer
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        return; // Allow normal scroll
      }
      // Drag is active — block scroll
      e.preventDefault();
      // Track which card is under the finger for visual feedback
      const touch = e.touches[0];
      const cardId = findCardUnderTouch(touch.clientX, touch.clientY);
      if (cardId && cardId !== draggedCard) {
        setDragOverCard(cardId);
      } else {
        setDragOverCard(null);
      }
    };

    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => grid.removeEventListener('touchmove', onTouchMove);
  }, [draggedCard]);

  // Long press touch start
  const handleTouchStartLongPress = (e: React.TouchEvent, cardId: string) => {
    dragActivatedRef.current = false;
    longPressTimeoutRef.current = setTimeout(() => {
      dragActivatedRef.current = true;
      lockScroll();
      handleDragStart(cardId);
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }, 400);
  };

  // Long press touch end — find drop target and commit reorder
  const handleTouchEndLongPress = (e: React.TouchEvent, cardId: string) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    if (dragActivatedRef.current) {
      // Find which card the finger landed on
      const touch = e.changedTouches[0];
      const targetCardId = findCardUnderTouch(touch.clientX, touch.clientY);
      unlockScroll();
      if (targetCardId && targetCardId !== draggedCard) {
        handleDrop(targetCardId);
      } else {
        handleDragEnd();
      }
    }
    dragActivatedRef.current = false;
    setDragOverCard(null);
  };

  // Render individual metric card with drag-and-drop
  const renderCard = (cardId: string, content: JSX.Element) => {
    const isDragging = draggedCard === cardId;
    const isDropTarget = dragOverCard === cardId && draggedCard !== cardId;
    const isComplexCard = cardId === 'nextInspections' || cardId === 'activePilots';

    return (
      <div
        key={cardId}
        data-card-id={cardId}
        draggable
        onDragStart={() => { lockScroll(); handleDragStart(cardId); }}
        onDragOver={handleDragOver}
        onDrop={() => { unlockScroll(); handleDrop(cardId); }}
        onDragEnd={() => { unlockScroll(); handleDragEnd(); }}
        onTouchStart={(e) => handleTouchStartLongPress(e, cardId)}
        onTouchEnd={(e) => handleTouchEndLongPress(e, cardId)}
        className={`${isDragging ? 'opacity-50 scale-105 shadow-lg' : 'opacity-100'} ${isDropTarget ? 'ring-2 ring-blue-400 ring-offset-2 scale-[1.02]' : ''} ${isComplexCard ? 'col-span-2 lg:col-span-1' : ''} transition-all duration-150 cursor-move select-none`}
        style={{
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: isDragging ? 'none' : 'auto'
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
              ? overviewMetrics.fuelRateLph.toLocaleString('es-CL', { maximumFractionDigits: 2 })
              : '0,00'} <span className="text-sm sm:text-xl text-slate-600">L/H</span>
          </div>
          <div className="text-base sm:text-xl font-semibold text-amber-600">
            {typeof overviewMetrics?.fuelRateGph === 'number'
              ? overviewMetrics.fuelRateGph.toLocaleString('es-CL', { maximumFractionDigits: 2 })
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

      const formatDate = (d: Date | null) => d ? formatFecha(d, { day: 'numeric', month: 'short' }) : '-';
      const formatDateShort = (d: Date | null) => d ? formatFecha(d, { day: 'numeric', month: 'short' }).replace('.', '') : '-';

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
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] sm:text-xs font-bold rounded-full">🔮 SMART</span>
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
            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-100 text-purple-700 text-[9px] sm:text-xs font-bold rounded-full">{activePilotsData.length}</span>
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
            <span className={`text-[7px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded-md ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {isPositive ? '↗' : '↘'} {Math.abs(value).toFixed(0)}%
            </span>
          );
        };

        // Inline SVG icons (replace emojis for cross-device consistency)
        const clockIcon = (cls: string) => (
          <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        const gaugeIcon = (cls: string) => (
          <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        const planeIcon = (cls: string) => (
          <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        );

        return (
          <div className={`${palette.card} rounded-xl p-2.5 sm:p-5 ${palette.shadow} min-h-[160px] sm:min-h-[200px] lg:h-[280px] flex flex-col`}>
            {/* Header — mobile: compact single row / desktop: standard */}
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <div className="flex items-center gap-1.5 sm:gap-0">
                <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-violet-100 flex items-center justify-center">
                  <svg className="w-3 h-3 sm:w-5 sm:h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="sm:hidden">
                  <h3 className="text-slate-500 text-[8px] font-semibold uppercase tracking-wide leading-none">Annual Stats</h3>
                  <p className="text-[6px] text-slate-400 leading-none mt-px">Last 365 days</p>
                </div>
              </div>
              <span className="px-1 sm:px-2 py-px sm:py-0.5 bg-violet-50 text-violet-700 text-[7px] sm:text-[10px] font-bold rounded-full border border-violet-100">
                H/T: {stats.hobbsTachRatio.toFixed(2)}
              </span>
            </div>
            {/* Desktop-only title */}
            <h3 className="hidden sm:block text-slate-500 text-xs font-semibold uppercase tracking-wide mb-0.5">Annual Stats</h3>
            <p className="hidden sm:block text-[9px] text-slate-400 mb-1">Last 365 days</p>

            {/* MOBILE: Evenly distributed layout — no white gap */}
            <div className="flex sm:hidden flex-col flex-1 justify-center gap-2">
              <div className="grid grid-cols-2 gap-x-3">
                {/* HOBBS */}
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    {clockIcon('w-3 h-3 text-violet-500')}
                    <span className="text-[7px] font-bold text-slate-400 tracking-wider">HOBBS</span>
                    {renderTrend(stats.hobbsTrend)}
                  </div>
                  <div className="text-[18px] font-bold text-slate-900 leading-tight">
                    {stats.hobbsThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                  <div className="text-[8px] text-slate-400 font-medium mt-0.5">{stats.avgMonthlyHobbsThisYear.toFixed(1)}/mo</div>
                </div>
                {/* TACH */}
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    {gaugeIcon('w-3 h-3 text-violet-500')}
                    <span className="text-[7px] font-bold text-slate-400 tracking-wider">TACH</span>
                    {renderTrend(stats.tachTrend)}
                  </div>
                  <div className="text-[18px] font-bold text-slate-800 leading-tight">
                    {stats.tachThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                  <div className="text-[8px] text-slate-400 font-medium mt-0.5">{stats.avgMonthlyTachThisYear.toFixed(1)}/mo</div>
                </div>
              </div>
              {/* FLIGHTS */}
              <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-slate-200/60">
                <div className="flex items-center gap-1">
                  {planeIcon('w-3 h-3 text-violet-500')}
                  <span className="text-[11px] font-bold text-slate-900">{(stats.avgMonthlyFlightsThisYear * 12).toFixed(0)}</span>
                  <span className="text-[9px] text-slate-500">flights</span>
                  <span className="text-[8px] text-slate-400">{stats.avgMonthlyFlightsThisYear.toFixed(1)}/mo</span>
                </div>
                {renderTrend(stats.flightsTrend)}
              </div>
            </div>

            {/* DESKTOP: Vertical list layout — tighter to fit lg:h-[280px] without scroll */}
            <div className="hidden sm:flex flex-col gap-1.5 flex-1 justify-end">
              {/* HOBBS Row */}
              <div className="flex items-center justify-between border-b border-dashed border-slate-200/50 pb-1.5">
                <div>
                  <div className="flex items-center gap-1 mb-px">
                    {clockIcon('w-3.5 h-3.5 text-violet-500')}
                    <span className="text-[9px] font-bold text-slate-500 tracking-wider">HOBBS</span>
                  </div>
                  <div className="text-xl font-bold text-slate-900 leading-none">
                    {stats.hobbsThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-0.5">
                  {renderTrend(stats.hobbsTrend)}
                  <div className="text-[9px] text-slate-400 font-medium">{stats.avgMonthlyHobbsThisYear.toFixed(1)}/mo</div>
                </div>
              </div>
              {/* TACH Row */}
              <div className="flex items-center justify-between border-b border-dashed border-slate-200/50 pb-1.5">
                <div>
                  <div className="flex items-center gap-1 mb-px">
                    {gaugeIcon('w-3.5 h-3.5 text-violet-500')}
                    <span className="text-[9px] font-bold text-slate-500 tracking-wider">TACH</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 leading-none">
                    {stats.tachThisYear.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-0.5">
                  {renderTrend(stats.tachTrend)}
                  <div className="text-[9px] text-slate-400 font-medium">{stats.avgMonthlyTachThisYear.toFixed(1)}/mo</div>
                </div>
              </div>
              {/* FLIGHTS Row */}
              <div className="flex items-center justify-between pt-0.5">
                <div>
                  <div className="flex items-center gap-1 mb-px">
                    {planeIcon('w-3.5 h-3.5 text-violet-500')}
                    <span className="text-[9px] font-bold text-slate-500 tracking-wider">FLIGHTS</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 leading-none">
                    {(stats.avgMonthlyFlightsThisYear * 12).toFixed(0)}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-0.5">
                  {renderTrend(stats.flightsTrend)}
                  <div className="text-[9px] text-slate-400 font-medium">{stats.avgMonthlyFlightsThisYear.toFixed(1)}/mo</div>
                </div>
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
          <div ref={gridRef} id="overview-grid" className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
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
            onNavigateToEngine={(engineFlightIds) => {
              setPendingEngineFlightIds(engineFlightIds);
              setTab("maintenance");
              setMxSubTab("engine");
            }}
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
          <div className="mb-4 flex gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              onClick={() => setPilotSubTab("accounts")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${pilotSubTab === "accounts"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              <span className="hidden sm:inline">Pilot </span>Accounts
            </button>
            <button
              onClick={() => setPilotSubTab("directory")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${pilotSubTab === "directory"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              <span className="hidden sm:inline">Pilot </span>Directory
            </button>
            <button
              onClick={() => setPilotSubTab("deposits")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${pilotSubTab === "deposits"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
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
      {tab === "maintenance" && (
        <>
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-lg mb-4 max-w-sm">
            <button
              onClick={() => setMxSubTab("components")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${mxSubTab === "components"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              🔩 Components
            </button>
            <button
              onClick={() => setMxSubTab("engine")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${mxSubTab === "engine"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              🔧 Engine Monitor
            </button>
          </div>
          {mxSubTab === "components" && <MaintenanceTable components={initialData.components} aircraft={initialData.aircraft} aircraftYearlyStats={initialData.aircraftYearlyStats || []} overviewMetrics={overviewMetrics} />}
          {mxSubTab === "engine" && <EngineAnalysis initialFlightIds={pendingEngineFlightIds} onFlightOpened={() => setPendingEngineFlightIds(null)} />}
        </>
      )}
      {tab === "finance" && (
        <>
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-lg mb-4 max-w-md">
            <button
              onClick={() => setFinanceSubTab("movements")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${financeSubTab === "movements"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              <span className="hidden sm:inline">Bank </span>Movements
            </button>
            <button
              onClick={() => setFinanceSubTab("costs")}
              className={`flex-1 px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${financeSubTab === "costs"
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
            >
              Cost Analysis
            </button>
          </div>
          {financeSubTab === "movements" && <FinanzasTable movements={initialData.bankMovements || []} palette={palette} />}
          {financeSubTab === "costs" && <CostAnalysis flights={initialData.allFlights || initialData.flights} overviewMetrics={overviewMetrics} components={initialData.components} fuelLogs={initialData.fuelLogs || []} />}
        </>
      )}

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
      const day = toDateString(f.fecha);
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
                          {lastFlight ? formatFecha(lastFlight.fecha) : '-'}
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

// ── Fuel Forecast Multi-Variable Chart ──
// Shows all variables used in fuel price forecasting from Sep 2020 to present + projections
function FuelForecastChart({
  fuelPriceAnalysis,
  brentData,
  brentAvgasCorrelation,
  currentFX,
  formatCurrency,
}: {
  fuelPriceAnalysis: any;
  brentData: any;
  brentAvgasCorrelation: any;
  currentFX: number;
  formatCurrency: (n: number) => string;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    avgas: true,
    brent: true,
    usdclp: false,
    implied: true,
    avg3m: true,
    avg6m: false,
    avg12m: false,
    forecast: true,
  });
  const [fuelChartRange, setFuelChartRange] = useState<'all' | '5y' | '3y' | '2y' | '1y' | '6m' | '3m' | 'custom'>('all');
  const [customStart, setCustomStart] = useState(0);
  const [customEnd, setCustomEnd] = useState(100);

  // Default to 1Y on mobile, All on desktop
  useEffect(() => {
    if (window.innerWidth < 768) setFuelChartRange('1y');
  }, []);

  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    if (!chartRef.current || !fuelPriceAnalysis) return;
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Destroy previous chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const avgasMonthly = fuelPriceAnalysis.monthlyArr || [];
    const brentMonthly = brentData?.monthly || [];

    // Build unified timeline from Sep 2020 to present + 6 months forecast
    const startMonth = '2020-09';
    const now = new Date();
    const endForecast = new Date(now);
    endForecast.setMonth(endForecast.getMonth() + 6);
    const allMonths: string[] = [];
    const cur = new Date(2020, 8, 1); // Sep 2020
    while (cur <= endForecast) {
      allMonths.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // ── Filter allMonths by selected range ──
    let visibleMonths = allMonths;
    if (fuelChartRange !== 'all' && fuelChartRange !== 'custom') {
      const rangeMonths: Record<string, number> = { '5y': 60, '3y': 36, '2y': 24, '1y': 12, '6m': 6, '3m': 3 };
      const windowMonths = rangeMonths[fuelChartRange] || allMonths.length;
      // Find the nowMonth index, then go back windowMonths
      const nowIdx = allMonths.indexOf(nowMonth);
      const effectiveEnd = nowIdx >= 0 ? nowIdx : allMonths.length - 1;
      // Include 6 months of forecast beyond nowMonth
      const startIdx = Math.max(0, effectiveEnd - windowMonths + 1);
      visibleMonths = allMonths.slice(startIdx);
    } else if (fuelChartRange === 'custom') {
      const startIdx = Math.round((customStart / 100) * (allMonths.length - 1));
      const endIdx = Math.round((customEnd / 100) * (allMonths.length - 1));
      visibleMonths = allMonths.slice(startIdx, endIdx + 1);
    }

    // Index data by month
    const avgasMap: Record<string, number> = {};
    avgasMonthly.forEach((m: any) => { avgasMap[m.month] = m.ppl; });

    const brentMap: Record<string, { brentUSD: number; usdCLP: number }> = {};
    brentMonthly.forEach((b: any) => { brentMap[b.month] = { brentUSD: b.brentUSD, usdCLP: b.usdCLP }; });

    // Compute WLS implied AVGAS for each historical month
    const impliedMap: Record<string, number> = {};
    if (brentAvgasCorrelation && brentAvgasCorrelation.slope) {
      const { slope, intercept, bestLag } = brentAvgasCorrelation;
      for (const month of allMonths) {
        if (month > nowMonth) continue;
        // Find the brent month with lag offset
        const [y, m] = month.split('-').map(Number);
        const lagDate = new Date(y, m - 1 - bestLag, 1);
        const lagMonth = `${lagDate.getFullYear()}-${String(lagDate.getMonth() + 1).padStart(2, '0')}`;
        const brent = brentMap[lagMonth];
        const fxForMonth = brentMap[month]?.usdCLP || currentFX;
        if (brent) {
          const impliedUSD = slope * brent.brentUSD + intercept;
          impliedMap[month] = Math.round(Math.max(0, impliedUSD * fxForMonth));
        }
      }
    }

    // Compute rolling averages
    const computeMA = (window: number) => {
      const result: Record<string, number> = {};
      const sorted = [...avgasMonthly].sort((a: any, b: any) => a.month.localeCompare(b.month));
      for (let i = 0; i < sorted.length; i++) {
        if (i < window - 1) continue;
        const slice = sorted.slice(i - window + 1, i + 1);
        const totalLitros = slice.reduce((s: number, m: any) => s + m.litros, 0);
        const totalMonto = slice.reduce((s: number, m: any) => s + m.litros * m.ppl, 0);
        result[sorted[i].month] = totalLitros > 0 ? Math.round(totalMonto / totalLitros) : 0;
      }
      return result;
    };
    const ma3 = computeMA(3);
    const ma6 = computeMA(6);
    const ma12 = computeMA(12);

    // Forecast extension (dashed) — anchored to last real AVGAS price
    const forecastData: Record<string, number> = {};
    if (brentAvgasCorrelation) {
      // Find the last month with actual AVGAS data as anchor
      const sortedAvgas = [...avgasMonthly].sort((a: any, b: any) => a.month.localeCompare(b.month));
      const lastEntry = sortedAvgas.length > 0 ? sortedAvgas[sortedAvgas.length - 1] : null;
      const lastAvgasMonth = lastEntry?.month || nowMonth;
      const lastAvgasPrice = lastEntry?.ppl || 0;

      // Anchor forecast at the last real data point
      forecastData[lastAvgasMonth] = lastAvgasPrice;

      // 3m and 6m forecast targets from WLS model (from now, not from last data)
      const m3 = new Date(now); m3.setMonth(m3.getMonth() + 3);
      const m6 = new Date(now); m6.setMonth(m6.getMonth() + 6);
      const m3key = `${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}`;
      const m6key = `${m6.getFullYear()}-${String(m6.getMonth() + 1).padStart(2, '0')}`;
      if (brentAvgasCorrelation.forecast3m > 0) forecastData[m3key] = brentAvgasCorrelation.forecast3m;
      if (brentAvgasCorrelation.forecast6m > 0) forecastData[m6key] = brentAvgasCorrelation.forecast6m;

      // Interpolate from anchor (last real price) through 3m to 6m targets
      const anchor = lastAvgasPrice;
      const f3 = brentAvgasCorrelation.forecast3m || anchor;
      const f6 = brentAvgasCorrelation.forecast6m || f3;

      // Calculate month spans from last actual data to forecast targets
      const [ly, lm] = lastAvgasMonth.split('-').map(Number);
      const totalMonths = (m6.getFullYear() - ly) * 12 + (m6.getMonth() - (lm - 1));
      const midMonths = (m3.getFullYear() - ly) * 12 + (m3.getMonth() - (lm - 1));

      for (let i = 1; i <= totalMonths; i++) {
        const d = new Date(ly, lm - 1 + i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!forecastData[k]) {
          if (midMonths > 0 && i <= midMonths) {
            forecastData[k] = Math.round(anchor + (f3 - anchor) * (i / midMonths));
          } else if (totalMonths > midMonths) {
            forecastData[k] = Math.round(f3 + (f6 - f3) * ((i - midMonths) / (totalMonths - midMonths)));
          }
        }
      }
    }

    // Labels (short format)
    const labels = visibleMonths.map(m => {
      const [y, mo] = m.split('-');
      return `${mo}/${y.slice(2)}`;
    });

    // Build datasets
    const datasets: any[] = [];

    // 1. AVGAS actual price (primary Y)
    if (visibleSeries.avgas) {
      datasets.push({
        label: 'AVGAS $/L',
        data: visibleMonths.map(m => avgasMap[m] ?? null),
        borderColor: '#d97706',
        backgroundColor: '#d9770622',
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 2,
      });
    }

    // 2. WLS Implied AVGAS
    if (visibleSeries.implied) {
      datasets.push({
        label: 'WLS Implied $/L',
        data: visibleMonths.map(m => impliedMap[m] ?? null),
        borderColor: '#6366f1',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 2],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 3,
      });
    }

    // 3. 3-month moving average
    if (visibleSeries.avg3m) {
      datasets.push({
        label: 'MA 3m',
        data: visibleMonths.map(m => ma3[m] ?? null),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 4,
      });
    }

    // 4. 6-month moving average
    if (visibleSeries.avg6m) {
      datasets.push({
        label: 'MA 6m',
        data: visibleMonths.map(m => ma6[m] ?? null),
        borderColor: '#0ea5e9',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 5,
      });
    }

    // 5. 12-month moving average
    if (visibleSeries.avg12m) {
      datasets.push({
        label: 'MA 12m',
        data: visibleMonths.map(m => ma12[m] ?? null),
        borderColor: '#8b5cf6',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 6,
      });
    }

    // 6. Forecast (dashed amber)
    if (visibleSeries.forecast && Object.keys(forecastData).length > 0) {
      datasets.push({
        label: 'Forecast WLS',
        data: visibleMonths.map(m => forecastData[m] ?? null),
        borderColor: '#ef4444',
        backgroundColor: '#ef444418',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: visibleMonths.map(m => forecastData[m] != null ? 3 : 0),
        pointBackgroundColor: '#ef4444',
        tension: 0.3,
        fill: true,
        yAxisID: 'yAvgas',
        spanGaps: true,
        order: 1,
      });
    }

    // 7. Brent USD/bbl (secondary Y)
    if (visibleSeries.brent) {
      datasets.push({
        label: 'Brent US$/bbl',
        data: visibleMonths.map(m => brentMap[m]?.brentUSD ?? null),
        borderColor: '#1e293b',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'yBrent',
        spanGaps: true,
        order: 7,
      });
    }

    // 8. USD/CLP (secondary Y right)
    if (visibleSeries.usdclp) {
      datasets.push({
        label: 'USD/CLP',
        data: visibleMonths.map(m => brentMap[m]?.usdCLP ?? null),
        borderColor: '#94a3b8',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [2, 2],
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'yFX',
        spanGaps: true,
        order: 8,
      });
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f1f5f9',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            bodySpacing: 4,
            callbacks: {
              label: function(context: any) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (val == null) return '';
                if (label.includes('Brent')) return `${label}: US$${val.toFixed(1)}`;
                if (label.includes('USD/CLP')) return `${label}: $${Math.round(val).toLocaleString('es-CL')}`;
                return `${label}: $${Math.round(val).toLocaleString('es-CL')}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 9 },
              color: '#94a3b8',
              maxTicksLimit: 20,
              maxRotation: 45,
            },
          },
          yAvgas: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'AVGAS $/L (CLP)', font: { size: 9 }, color: '#d97706' },
            grid: { color: '#f8fafc' },
            ticks: {
              font: { size: 9 },
              color: '#d97706',
              callback: function(value: any) { return '$' + Math.round(value).toLocaleString('es-CL'); },
            },
          },
          yBrent: {
            type: 'linear',
            position: 'right',
            display: visibleSeries.brent,
            title: { display: true, text: 'Brent US$/bbl', font: { size: 9 }, color: '#1e293b' },
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 9 },
              color: '#1e293b',
              callback: function(value: any) { return 'US$' + Math.round(value); },
            },
          },
          yFX: {
            type: 'linear',
            position: 'right',
            display: visibleSeries.usdclp,
            title: { display: true, text: 'USD/CLP', font: { size: 9 }, color: '#94a3b8' },
            grid: { drawOnChartArea: false },
            ticks: {
              font: { size: 9 },
              color: '#94a3b8',
            },
          },
        },
      },
    });

    chartInstance.current = chart;
    return () => { chart.destroy(); chartInstance.current = null; };
  }, [fuelPriceAnalysis, brentData, brentAvgasCorrelation, currentFX, visibleSeries, fuelChartRange, customStart, customEnd]);

  // Series legend config
  const seriesConfig = [
    { key: 'avgas', label: 'AVGAS $/L', color: '#d97706', solid: true },
    { key: 'implied', label: 'WLS Implied', color: '#6366f1', dashed: true },
    { key: 'forecast', label: 'Forecast', color: '#ef4444', dashed: true },
    { key: 'avg3m', label: 'MA 3m', color: '#10b981', solid: true },
    { key: 'avg6m', label: 'MA 6m', color: '#0ea5e9', solid: true },
    { key: 'avg12m', label: 'MA 12m', color: '#8b5cf6', solid: true },
    { key: 'brent', label: 'Brent $/bbl', color: '#1e293b', solid: true },
    { key: 'usdclp', label: 'USD/CLP', color: '#94a3b8', dashed: true },
  ];

  // Helper to build the full month array (used by custom slider labels)
  const buildAllMonths = useCallback(() => {
    const now = new Date();
    const endForecast = new Date(now);
    endForecast.setMonth(endForecast.getMonth() + 6);
    const months: string[] = [];
    const cur = new Date(2020, 8, 1);
    while (cur <= endForecast) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  }, []);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Fuel Price — All Variables
        </p>
        {brentAvgasCorrelation && (
          <span className="text-[8px] text-indigo-500 font-mono">
            WLS R²={brentAvgasCorrelation.bestR2.toFixed(3)} · Lag {brentAvgasCorrelation.bestLag}m · N<sub>eff</sub>={brentAvgasCorrelation.effectiveN}
          </span>
        )}
      </div>
      {/* Interactive Legend */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {seriesConfig.map(s => (
          <button
            key={s.key}
            onClick={() => toggleSeries(s.key)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium transition-all border ${
              visibleSeries[s.key]
                ? 'shadow-sm'
                : 'opacity-40 hover:opacity-70 border-transparent'
            }`}
            style={{
              backgroundColor: visibleSeries[s.key] ? `${s.color}18` : '#f1f5f9',
              color: visibleSeries[s.key] ? s.color : '#94a3b8',
              borderColor: visibleSeries[s.key] ? `${s.color}40` : 'transparent',
            }}
          >
            <span
              className="inline-block w-3 h-0.5 rounded-full"
              style={{
                backgroundColor: s.color,
                opacity: visibleSeries[s.key] ? 1 : 0.3,
                borderBottom: s.dashed ? `1px dashed ${s.color}` : 'none',
              }}
            />
            {s.label}
          </button>
        ))}
      </div>
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[10px] font-semibold text-slate-400 mr-0.5">Period:</span>
        {([
          ['all', 'All'],
          ['5y', '5Y'],
          ['3y', '3Y'],
          ['2y', '2Y'],
          ['1y', '1Y'],
          ['6m', '6M'],
          ['3m', '3M'],
          ['custom', 'Custom'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFuelChartRange(key)}
            className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all
              ${fuelChartRange === key
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Custom Range Sliders */}
      {fuelChartRange === 'custom' && (
        <div className="mb-2 px-1">
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-slate-400 w-8 text-right">From</label>
            <input
              type="range"
              min={0}
              max={100}
              value={customStart}
              onChange={e => {
                const v = Number(e.target.value);
                setCustomStart(v > customEnd ? customEnd : v);
              }}
              className="flex-1 h-1.5 accent-blue-600"
            />
            <span className="text-[10px] text-slate-500 w-14 tabular-nums font-mono">
              {(() => {
                const allM = buildAllMonths();
                const idx = Math.round((customStart / 100) * (allM.length - 1));
                const [y, mo] = allM[idx].split('-');
                return `${mo}/${y.slice(2)}`;
              })()}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <label className="text-[10px] text-slate-400 w-8 text-right">To</label>
            <input
              type="range"
              min={0}
              max={100}
              value={customEnd}
              onChange={e => {
                const v = Number(e.target.value);
                setCustomEnd(v < customStart ? customStart : v);
              }}
              className="flex-1 h-1.5 accent-blue-600"
            />
            <span className="text-[10px] text-slate-500 w-14 tabular-nums font-mono">
              {(() => {
                const allM = buildAllMonths();
                const idx = Math.round((customEnd / 100) * (allM.length - 1));
                const [y, mo] = allM[idx].split('-');
                return `${mo}/${y.slice(2)}`;
              })()}
            </span>
          </div>
        </div>
      )}
      {/* Chart */}
      <div style={{ height: 280 }}>
        <canvas ref={chartRef} />
      </div>
    </div>
  );
}

function FlightsTable({ flights, allFlightsComplete, users, editMode = false, clientOptions, depositsByCode, depositsDetailsByCode, fuelByCode, fuelDetailsByCode, csvPilotNames, onNavigateToEngine }: {
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
  onNavigateToEngine?: (engineFlightIds: number[]) => void;
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          Flight Log Entries
          <span className="ml-2 text-sm font-normal text-blue-200">
            ({filteredFlights.length} of {flights.length})
          </span>
          {editMode && (
            <button
              onClick={applySave}
              disabled={saving}
              className="ml-auto px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-bold disabled:opacity-50"
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
              <div className="text-2xl font-bold text-slate-900 leading-none">
                {pilotBalanceSummary.totalFlights}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-emerald-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Total Hours</div>
              <div className="text-2xl font-bold text-emerald-700 leading-none">
                {pilotBalanceSummary.totalHours.toFixed(1)}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium mb-1">Total Spent</div>
              <div className="text-xl font-bold text-amber-700">
                ${formatCurrency(pilotBalanceSummary.totalSpent)}
              </div>
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
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap" title="Engine Monitor Analysis">🔧</th>
              <th className="px-2 py-2 text-center text-[10px] sm:text-xs font-bold text-red-600 uppercase tracking-wider whitespace-nowrap">🗑️</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredFlights.map(f => {
              const code = (f.cliente || '').toUpperCase();
              const u = users.find(u => u.id === (f as any).pilotoId) || users.find(u => (u.codigo || '').toUpperCase() === code);
              const pilotName = f.piloto_raw || u?.nombre || 'N/A';
              const fecha = parseLocalDate(f.fecha);
              const año = fecha.getFullYear();
              const mesNombres = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const mes = mesNombres[fecha.getMonth()];

              return (
                <tr key={f.id} className="hover:bg-blue-50 transition-colors">
                  {/* Fecha */}
                  <td className="px-2 py-2 whitespace-nowrap text-[10px] sm:text-xs text-slate-600 font-medium">
                    {editMode ? (
                      <input type="date" className="px-1 py-1 border rounded text-[10px] sm:text-xs w-full" value={toDateString(f.fecha)} onChange={e => handleChange(f.id, 'fecha', e.target.value)} />
                    ) : (
                      formatFecha(f.fecha)
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

                  {/* Engine Monitor Link */}
                  <td className="px-2 py-2 whitespace-nowrap text-center">
                    {f.engineFlightIds && f.engineFlightIds.length > 0 ? (
                      <button
                        onClick={() => onNavigateToEngine?.(f.engineFlightIds)}
                        className="px-2 py-1 text-[10px] sm:text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition-colors"
                        title={`Ver Engine Analysis${f.engineFlightIds.length > 1 ? ` (${f.engineFlightIds.length} tramos)` : ''}`}
                      >
                        🔧{f.engineFlightIds.length > 1 ? ` ${f.engineFlightIds.length}` : ''}
                      </button>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>

                  {/* Delete */}
                  <td className="px-2 py-2 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleDeleteFlight(
                        f.id,
                        pilotName,
                        formatFecha(f.fecha),
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Pilot Accounts</h3>
          <span className="ml-auto px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-xs font-medium">{data.length} pilots</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Pilot</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Flights</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Hours</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate/Hr</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Spent</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Fuel</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Deposits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-semibold text-slate-700 font-mono">{p.codigo || '-'}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-slate-800">{p.nombre}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">{p.flights}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">{p.hours.toFixed(1)}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">${Number(p.tarifa_hora).toLocaleString("es-CL")}</td>
                <td className={`px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-semibold font-mono ${Number(p.saldo_cuenta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${Number(p.saldo_cuenta).toLocaleString("es-CL")}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">${Number(-p.spent).toLocaleString("es-CL")}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">${Number(p.fuel || 0).toLocaleString("es-CL")}</td>
                <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">${Number(p.deposits).toLocaleString("es-CL")}</td>
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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Pilot:</label>
            <select
              value={filterPilot}
              onChange={e => { setFilterPilot(e.target.value); setCurrentPage(1); }}
              className="px-3 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-300 focus:border-slate-400 min-w-[180px]"
            >
              <option value="">All</option>
              {pilots.map(([code, name]) => (
                <option key={code} value={code}>{code} - {name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Source:</label>
            <select
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-1 focus:ring-slate-300 focus:border-slate-400"
            >
              <option value="ALL">All</option>
              <option value="CSV">Historic (CSV)</option>
              <option value="DB">App (DB)</option>
            </select>
          </div>
          <div className="ml-auto flex gap-2 text-xs">
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md font-medium border border-slate-200">
              {filteredLogs.length} records
            </span>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md font-medium border border-emerald-200">
              ${totalMonto.toLocaleString('es-CL')}
            </span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium border border-amber-200">
              {totalLitros.toFixed(1)} L
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Fuel Records (Historic + App)</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Pilot</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Liters</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">$/L</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Detail</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map((l) => (
                <tr key={l.id} className={`hover:bg-slate-50 transition-colors ${l.source === 'CSV' ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {formatFecha(l.fecha)}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-slate-800">
                    {l.pilotName}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-mono text-slate-600">
                    {l.pilotCode || '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">
                    {l.litros > 0 ? `${l.litros.toFixed(1)} L` : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-semibold text-emerald-600 font-mono">
                    ${l.monto.toLocaleString('es-CL')}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-mono text-slate-600">
                    {l.litros > 0 && l.monto > 0 ? `$${Math.round(l.monto / l.litros).toLocaleString('es-CL')}` : '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${l.source === 'CSV' ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                      {l.source === 'CSV' ? 'Historic' : 'App'}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-slate-600 max-w-[180px] truncate">
                    {l.detalle || '-'}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
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
                        className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
                    {l.source === 'DB' && typeof l.id === 'number' ? (
                      <form action={require('../../../actions/delete-fuel-log').deleteFuelLog} onSubmit={(e) => { if (!confirm(`Delete record ${l.id}?`)) { e.preventDefault(); } }}>
                        <input type="hidden" name="fuelLogId" value={l.id} />
                        <button type="submit" className="px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-[10px] sm:text-xs font-medium border border-red-200 transition-colors">
                          Delete
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
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length}
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-md border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-slate-500">
                {currentPage}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded-md border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                Next →
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
      createdAt: p.createdAt ? formatFecha(p.createdAt as any) : '-',
      fechaNacimiento: p.fechaNacimiento ? toDateString(new Date(p.fechaNacimiento as any)) : null,
      fechaNacimientoDisplay: p.fechaNacimiento ? formatFecha(p.fechaNacimiento as any) : '-',
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
      createdAt: p.createdAt ? formatFecha(p.createdAt as any) : '-',
      fechaNacimiento: p.fechaNacimiento ? toDateString(new Date(p.fechaNacimiento as any)) : null,
      fechaNacimientoDisplay: p.fechaNacimiento ? formatFecha(p.fechaNacimiento as any) : '-',
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Pilot Directory</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {message && (
              <span className={`text-xs px-2.5 py-1 rounded-md ${message.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {message}
              </span>
            )}
            {editMode && Object.keys(editedRows).length > 0 && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
            <a
              href="/pilots/new"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-medium transition-colors"
            >
              + New Pilot
            </a>
            <button
              onClick={() => {
                setEditMode(!editMode);
                if (editMode) setEditedRows({});
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editMode
                ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              {editMode && <th className="px-3 sm:px-4 py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>}
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">DOB</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">License #</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Doc Type</th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.filter(r => !deletedIds.has(r.id || 0)).map((r, idx) => {
              const canEdit = editMode && r.id !== null;
              return (
                <tr key={`${r.code}-${idx}`} className={`transition-colors ${canEdit ? 'bg-amber-50/30' : 'hover:bg-slate-50'}`}>
                  {editMode && (
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-center">
                      {r.id !== null ? (
                        <button
                          onClick={() => handleDelete(r.id!, r.name)}
                          disabled={deletingId === r.id}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-md text-[10px] sm:text-xs font-medium disabled:opacity-50 border border-red-200 transition-colors"
                          title="Delete pilot"
                        >
                          {deletingId === r.id ? '...' : 'Del'}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[10px]">CSV</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-semibold text-slate-700 font-mono">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-20 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm font-mono focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.code}
                        onChange={e => handleChange(r.id!, 'codigo', e.target.value)}
                      />
                    ) : r.code}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-slate-800">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.name}
                        onChange={e => handleChange(r.id!, 'nombre', e.target.value)}
                      />
                    ) : r.name}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="date"
                        className="w-32 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.fechaNacimiento || ''}
                        onChange={e => handleChange(r.id!, 'fechaNacimiento', e.target.value)}
                      />
                    ) : r.fechaNacimientoDisplay}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="email"
                        className="w-44 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.email !== '-' ? r.email : ''}
                        onChange={e => handleChange(r.id!, 'email', e.target.value)}
                        placeholder="Email"
                      />
                    ) : r.email}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="tel"
                        className="w-28 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.telefono}
                        onChange={e => handleChange(r.id!, 'telefono', e.target.value)}
                      />
                    ) : (r.telefono || '-')}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-24 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.numeroLicencia}
                        onChange={e => handleChange(r.id!, 'licencia', e.target.value)}
                      />
                    ) : (r.numeroLicencia || '-')}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <select
                        className="w-24 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
                        defaultValue={r.tipoDocumento}
                        onChange={e => handleChange(r.id!, 'tipoDocumento', e.target.value)}
                      >
                        <option value="">-</option>
                        <option value="RUT">RUT</option>
                        <option value="Pasaporte">Pasaporte</option>
                      </select>
                    ) : (r.tipoDocumento || '-')}
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                    {canEdit ? (
                      <input
                        type="text"
                        className="w-28 px-2 py-1 border border-slate-300 rounded-md text-xs sm:text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
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
  const weightedRate = stats?.weightedRate || 0;  // tach hrs/day
  const rateAnnual = stats?.rateAnnual || 0;  // tach hrs/day from rolling 365d
  const effectiveRate = rateAnnual > 0 ? rateAnnual : weightedRate;  // prefer annual for consistency
  const stdDev = stats?.stdDev || 0;
  const trend = stats?.trend || 0;
  const rate30d = stats?.rate30d || 0;

  // Overhaul modal state
  const [overhaulModal, setOverhaulModal] = useState<{ open: boolean; component: any | null }>({ open: false, component: null });
  const [overhaulForm, setOverhaulForm] = useState({ airframeHours: '', date: '', notes: '' });
  const [overhaulSubmitting, setOverhaulSubmitting] = useState(false);
  const [overhaulResult, setOverhaulResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const router = useRouter();

  // Calculate predicted inspection with confidence interval (uses annual rate for consistency)
  const getPrediction = (hoursRemaining: number) => {
    if (effectiveRate <= 0) return null;

    const days = Math.round(hoursRemaining / effectiveRate);
    const uncertainty = 1.96 * stdDev * Math.sqrt(days > 0 ? days : 1) / effectiveRate;
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

  const formatDate = (d: Date) => formatFecha(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const formatShortDate = (d: Date) => formatFecha(d, { day: 'numeric', month: 'short' });

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
      {/* Usage Rate Overview */}
      {stats && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Predictive System</h3>
                <p className="text-xs text-slate-500">Weighted rate: ⅔ annual + ⅓ last 90 days</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-800 font-mono">{(weightedRate * 7).toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">TACH/wk</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-800 font-mono">{(weightedRate * 30.44).toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">TACH/mo</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold font-mono ${trend > 0 ? 'text-amber-600' : trend < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'} {Math.abs(trend).toFixed(0)}%
                </div>
                <div className="text-[10px] text-slate-500">trend</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium">30-day rate</div>
              <div className="font-mono font-semibold text-sm text-slate-800">{(rate30d * 30.44).toFixed(1)} <span className="text-slate-400 text-xs">T/mo</span></div>
              <div className="text-[10px] text-slate-400">≈{(rate30d * 30.44 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} H/mo</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium">60-day rate</div>
              <div className="font-mono font-semibold text-sm text-slate-800">{((stats.rate60d || 0) * 30.44).toFixed(1)} <span className="text-slate-400 text-xs">T/mo</span></div>
              <div className="text-[10px] text-slate-400">≈{((stats.rate60d || 0) * 30.44 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} H/mo</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium">90-day rate</div>
              <div className="font-mono font-semibold text-sm text-slate-800">{((stats.rate90d || 0) * 30.44).toFixed(1)} <span className="text-slate-400 text-xs">T/mo</span></div>
              <div className="text-[10px] text-slate-400">≈{((stats.rate90d || 0) * 30.44 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} H/mo</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border-2 border-slate-200">
              <div className="text-[10px] text-slate-500 font-medium">Annual rate</div>
              <div className="font-mono font-semibold text-sm text-slate-800">{((stats.rateAnnual || 0) * 30.44).toFixed(1)} <span className="text-slate-400 text-xs">T/mo</span></div>
              <div className="text-[10px] text-slate-400">≈{((stats.rateAnnual || 0) * 30.44 * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} H/mo</div>
            </div>
          </div>
        </div>
      )}

      {/* Next Inspections */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Next Inspections</h3>
                <p className="text-xs text-slate-500">95% confidence interval predictions</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">SMART</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-3">
          {inspectionItems.map(item => {
            const pred = getPrediction(item.remaining);
            const urgency = pred ? getUrgencyClass(pred.days) : getUrgencyClass(999);

            return (
              <div key={item.id} className={`rounded-lg border p-3 sm:p-4 transition-all ${urgency.row}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">{item.name}</h4>
                      <p className="text-[10px] text-slate-500">Interval: {item.interval} hrs</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg sm:text-xl font-bold font-mono ${urgency.text}`}>{item.remaining.toFixed(1)} <span className="text-xs sm:text-sm font-medium">TACH</span></div>
                    <div className="text-xs text-slate-500 font-mono">≈{(item.remaining * (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25)).toFixed(1)} HOBBS</div>
                  </div>
                </div>

                {pred && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-2 pt-2 border-t border-slate-200/60">
                    <div className="bg-slate-50 rounded-md p-2 sm:p-3">
                      <div className="text-[10px] text-slate-500 mb-0.5">Time Left</div>
                      <div className={`font-semibold text-sm ${urgency.text}`}>{formatTimeRemaining(pred.days)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2 sm:p-3">
                      <div className="text-[10px] text-slate-500 mb-0.5">Est. Date</div>
                      <div className="font-semibold text-sm text-slate-800 truncate">{formatShortDate(pred.date)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2 sm:p-3">
                      <div className="text-[10px] text-slate-500 mb-0.5">Range (95%)</div>
                      <div className={`text-xs font-semibold ${urgency.text} truncate`}>
                        {formatTimeRemaining(pred.minDays)}–{formatTimeRemaining(pred.maxDays)}
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

        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] sm:text-xs text-slate-400">
            Weighted avg: 30d (×3) + 60d (×2) + 90d (×1) · σ = {stdDev.toFixed(3)} hrs/day
          </p>
        </div>
      </div>

      {/* Component Status Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Component Status (TBO)</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Aircraft</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Component</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Hours</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">TBO</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Life %</th>
                {effectiveRate > 0 && <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. TBO</th>}
                <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Overhaul</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {components.map(c => {
                const restante = Number(c.limite_tbo) - Number(c.horas_acumuladas);
                const pct = (Number(c.horas_acumuladas) / Number(c.limite_tbo)) * 100;
                const colorClass = pct > 80 ? 'text-red-600 font-bold' : pct > 60 ? 'text-orange-500 font-bold' : 'text-green-600 font-bold';
                const tboPred = effectiveRate > 0 ? getPrediction(restante) : null;
                const hasOverhaul = c.overhaul_airframe != null;

                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-semibold text-slate-700 font-mono">{c.aircraftId}</td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium text-slate-800">
                      {c.tipo}
                      {hasOverhaul && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Overhaul @ AF ${c.overhaul_airframe}${c.overhaul_date ? ' - ' + formatFecha(c.overhaul_date) : ''}`}>
                          OH
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">{Number(c.horas_acumuladas).toFixed(1)}</td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">{Number(c.limite_tbo).toFixed(0)}</td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600 font-mono">{restante.toFixed(1)}</td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold ${colorClass}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                    {effectiveRate > 0 && (
                      <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                        {tboPred ? (
                          <span className="font-mono font-medium">{formatTimeRemaining(tboPred.days)}</span>
                        ) : '-'}
                      </td>
                    )}
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap text-xs sm:text-sm">
                      {c.tipo !== 'AIRFRAME' && (
                        <button
                          onClick={() => openOverhaulModal(c)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] sm:text-xs font-medium transition-colors border border-slate-200"
                          title={hasOverhaul ? 'Edit overhaul' : 'Register overhaul'}
                        >
                          {hasOverhaul ? 'Edit' : 'Register'}
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
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Overhaul — {overhaulModal.component.tipo}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Aircraft: {overhaulModal.component.aircraftId}</p>
                </div>
                <button onClick={() => setOverhaulModal({ open: false, component: null })} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Explanation */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-0.5">How it works</p>
                <p>AIRFRAME is used as stable reference (not reset by engine overhauls). Hours since overhaul:</p>
                <p className="font-mono mt-1 text-center font-semibold text-slate-800">Hours = Current AF − AF at overhaul</p>
              </div>

              {/* Form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    AIRFRAME hours at overhaul *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={overhaulForm.airframeHours}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, airframeHours: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-slate-500 focus:ring-1 focus:ring-slate-200 transition-all font-mono text-sm"
                    placeholder="e.g. 2745.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Overhaul date *
                  </label>
                  <input
                    type="date"
                    value={overhaulForm.date}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-slate-500 focus:ring-1 focus:ring-slate-200 transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={overhaulForm.notes}
                    onChange={(e) => setOverhaulForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-slate-500 focus:ring-1 focus:ring-slate-200 transition-all text-sm"
                    rows={2}
                    placeholder="e.g. Full overhaul at shop XYZ"
                  />
                </div>
              </div>

              {/* Preview */}
              {overhaulPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Preview</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-md p-2 text-center border border-slate-100">
                      <div className="text-slate-500 text-[10px]">Current AF</div>
                      <div className="font-mono font-semibold text-sm">{overhaulPreview.currentAirframe.toFixed(1)}</div>
                    </div>
                    <div className="bg-white rounded-md p-2 text-center border border-slate-100">
                      <div className="text-slate-500 text-[10px]">Overhaul @</div>
                      <div className="font-mono font-semibold text-sm">{parseFloat(overhaulForm.airframeHours).toFixed(1)}</div>
                    </div>
                    <div className="bg-white rounded-md p-2 text-center border border-slate-100">
                      <div className="text-slate-500 text-[10px]">Since OH</div>
                      <div className="font-mono font-semibold text-sm text-slate-700">{overhaulPreview.hoursSinceOverhaul}</div>
                    </div>
                    <div className="bg-white rounded-md p-2 text-center border border-slate-100">
                      <div className="text-slate-500 text-[10px]">TBO Remaining</div>
                      <div className="font-mono font-semibold text-sm text-emerald-600">{overhaulPreview.remaining}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${parseFloat(overhaulPreview.pct) > 80 ? 'bg-red-50 text-red-700 border border-red-200' : parseFloat(overhaulPreview.pct) > 60 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {overhaulPreview.pct}% life used
                    </span>
                  </div>
                </div>
              )}

              {/* Result message */}
              {overhaulResult && (
                <div className={`rounded-lg p-3 text-xs font-medium ${overhaulResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {overhaulResult.success ? overhaulResult.message : overhaulResult.error}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => setOverhaulModal({ open: false, component: null })}
                  className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleOverhaulSubmit}
                  disabled={overhaulSubmitting || !overhaulForm.airframeHours || !overhaulForm.date}
                  className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {overhaulSubmitting ? 'Saving...' : 'Save Overhaul'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
      return formatFecha(dateStr, { day: '2-digit', month: 'short', year: '2-digit' });
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
          <div className={`mt-4 p-4 rounded-xl border-2 ${uploadResult.ok ? 'bg-green-500/10 border-green-300' : 'bg-red-500/10 border-red-300'}`}>
            <div className="flex items-start gap-3">
              {uploadResult.ok ? (
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1" /></svg>
              ) : (
                <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              )}
              <div className="flex-1">
                <p className={`text-sm font-bold ${uploadResult.ok ? 'text-green-800' : 'text-red-800'}`}>
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
                                <th className="px-2 py-1.5 text-right font-bold text-red-600 uppercase tracking-wider">Egreso</th>
                                <th className="px-2 py-1.5 text-right font-bold text-emerald-600 uppercase tracking-wider">Ingreso</th>
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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800">Bank Movements</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-xs font-medium transition-colors border border-slate-200"
              >
                {sortOrder === 'desc' ? '↓ Recent' : '↑ Oldest'}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterTipo('ALL'); setFilterYear(''); setFilterMonth(''); setSearchText(''); setCurrentPage(1); }}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md text-xs font-medium transition-colors border border-red-200"
                >
                  Clear filters
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
              <tr className="bg-slate-100 border-b-2 border-slate-300">
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
            <tbody className="divide-y divide-slate-200">
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
                        className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${tipoColors[getDisplayValue(m, 'tipo')] || 'bg-gray-100 text-gray-800'}`}
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
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1" /></svg>
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(m.correlativo)}
                          disabled={uploading}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          title="Eliminar documento"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1" />
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
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar
                </a>
                <button
                  onClick={() => setViewingAttachment(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  aria-label="Cerrar modal"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
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
      const k = toDateString(f.fecha).slice(0, 7);
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
    <div className={`${palette.card} rounded-xl shadow-sm border border-slate-200 overflow-hidden`}>
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Financial Performance</h3>
        </div>
      </div>
      <div className="p-6">
        <canvas ref={barRef} height={160} />
      </div>
    </div>
  );
}

// ==================== COST ANALYSIS COMPONENT ====================
function CostAnalysis({ flights, overviewMetrics, components, fuelLogs }: { flights: any[]; overviewMetrics?: OverviewMetrics; components?: any[]; fuelLogs?: any[] }) {
  // --- Persist parameters in localStorage ---
  const STORAGE_KEY = 'cost-analysis-params';
  const getStored = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const stored = getStored();

  // --- Editable Parameters (from Excel "Analisis de costos") ---
  const [usdRate, setUsdRate] = useState(stored?.usdRate ?? 975);
  const [ufRate, setUfRate] = useState(stored?.ufRate ?? 39700);
  const [avgasLiterCLP, setAvgasLiterCLP] = useState(stored?.avgasLiterCLP ?? 1750);
  const [aceiteLiterCLP, setAceiteLiterCLP] = useState(stored?.aceiteLiterCLP ?? 14280);
  const [toaCLP, setToaCLP] = useState(stored?.toaCLP ?? 205000);
  const [seguroUSD, setSeguroUSD] = useState(stored?.seguroUSD ?? 4710.02);
  const [cambioAceiteCLP, setCambioAceiteCLP] = useState(stored?.cambioAceiteCLP ?? 281090);
  const [revision100CLP, setRevision100CLP] = useState(stored?.revision100CLP ?? 3577930);
  // Overhaul cost model: real Aug 2022 invoices, all paid in CLP
  // Eagle Copters INV22-00211 (04-Ago-2022): CLP $47,926,129 (motor O-320-D2J + freight + import + IVA)
  // Labor (installation): CLP $8,000,000
  // Total: CLP $55,926,129 — single-currency, only Chilean IPC inflation applies
  const [overhaulMotorCLP, setOverhaulMotorCLP] = useState(stored?.overhaulMotorCLP ?? 47926129);
  const [overhaulLaborCLP, setOverhaulLaborCLP] = useState(stored?.overhaulLaborCLP ?? 8000000);
  const [clInflationPct, setClInflationPct] = useState(16.35); // Always starts at fallback, overwritten by live /api/ipc-chile fetch
  // Hours/year: defaults to LIVE rolling 365-day hobbs, but user can override
  const liveHorasAnuales = Math.round(overviewMetrics?.annualStats?.hobbsThisYear ?? 220);
  const [horasAnuales, setHorasAnuales] = useState(stored?.horasAnuales ?? liveHorasAnuales);
  const horasIsLive = horasAnuales === liveHorasAnuales;
  // overhaulCycleHrs is now computed live from ENGINE component (TBO - SMOH)
  const engineComp = components?.find((c: any) => c.tipo === 'ENGINE');
  const overhaulCycleHrs = engineComp ? Math.max(0, Number(engineComp.limite_tbo) - Number(engineComp.horas_acumuladas)) : 1379.1;
  // Fixed costs (annual CLP)
  const [seguroAnual, setSeguroAnual] = useState(stored?.seguroAnual ?? 4592270);
  const [hangarAnual, setHangarAnual] = useState(stored?.hangarAnual ?? 4963032);
  const [toaPatentesAnual, setToaPatentesAnual] = useState(stored?.toaPatentesAnual ?? 405000);
  const [contingenciasAnual, setContingenciasAnual] = useState(stored?.contingenciasAnual ?? 2000000);
  const [impuestoContadorAnual, setImpuestoContadorAnual] = useState(stored?.impuestoContadorAnual ?? 3211728);
  const [limpiezaAnual, setLimpiezaAnual] = useState(stored?.limpiezaAnual ?? 180000);
  // Overhaul funding (total collected for overhaul)
  const [recaudado, setRecaudado] = useState(stored?.recaudado ?? 15000000);
  // Revenue — user can enter in CLP or UF
  const [valorHora, setValorHora] = useState(stored?.valorHora ?? 168052);
  const [valorHoraUnit, setValorHoraUnit] = useState<'CLP' | 'UF'>(stored?.valorHoraUnit ?? 'CLP');
  // Always derive CLP value for all calculations
  const valorHoraCLP = valorHoraUnit === 'UF' ? Math.round(valorHora * ufRate) : valorHora;
  // Financial projections
  const [interestRate, setInterestRate] = useState(stored?.interestRate ?? 4);
  const [clForwardInflation, setClForwardInflation] = useState(stored?.clForwardInflation ?? 3.5);
  const [fuelTrendRate, setFuelTrendRate] = useState(stored?.fuelTrendRate ?? 10);
  // Live engine market price (from airpowerinc.com scraping)
  const [engineMarketPriceUSD, setEngineMarketPriceUSD] = useState(stored?.engineMarketPriceUSD ?? 47415);
  // Brent oil historical data (weekly + monthly from EIA + mindicador)
  const [brentData, setBrentData] = useState<{
    currentBrentUSD: number;
    weekly: { week: string; brentUSD: number; usdCLP: number }[];
    monthly: { month: string; brentUSD: number; usdCLP: number; weeks: number }[];
    totalWeeks: number;
    source: string;
  } | null>(null);
  // Live indicators state
  const [liveIndicators, setLiveIndicators] = useState<{ uf: boolean; usd: boolean; fuel: boolean; engine: boolean; ipc: boolean; brent: boolean }>({ uf: false, usd: false, fuel: false, engine: false, ipc: false, brent: false });

  // Save all params to localStorage whenever any changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        usdRate, ufRate, avgasLiterCLP, aceiteLiterCLP, toaCLP, seguroUSD,
        cambioAceiteCLP, revision100CLP, overhaulMotorCLP, overhaulLaborCLP,
        horasAnuales, seguroAnual, hangarAnual,
        toaPatentesAnual, contingenciasAnual, impuestoContadorAnual, limpiezaAnual,
        recaudado, valorHora, valorHoraUnit, interestRate, clForwardInflation, fuelTrendRate,
        engineMarketPriceUSD,
        // clInflationPct excluded — always fetched live from /api/ipc-chile
      }));
    } catch {}
  }, [usdRate, ufRate, avgasLiterCLP, aceiteLiterCLP, toaCLP, seguroUSD,
    cambioAceiteCLP, revision100CLP, overhaulMotorCLP, overhaulLaborCLP,
    horasAnuales, seguroAnual, hangarAnual,
    toaPatentesAnual, contingenciasAnual, impuestoContadorAnual, limpiezaAnual,
    recaudado, valorHora, valorHoraUnit, interestRate, clForwardInflation, fuelTrendRate,
    engineMarketPriceUSD]);

  // Computed overhaul cost: inflate total CLP cost from Aug 2022 by Chilean IPC
  const overhaulCLP = useMemo(() => {
    const totalOriginal = overhaulMotorCLP + overhaulLaborCLP;
    return Math.round(totalOriginal * (1 + clInflationPct / 100));
  }, [overhaulMotorCLP, overhaulLaborCLP, clInflationPct]);

  // Fuel price analysis from real records
  const fuelPriceAnalysis = useMemo(() => {
    if (!fuelLogs || fuelLogs.length === 0) return null;
    const withPrice = fuelLogs
      .map((r: any) => {
        const litros = Number(r.litros) || 0;
        const monto = Number(r.monto) || 0;
        const fecha = new Date(r.fecha);
        return { litros, monto, fecha, ppl: litros > 0 ? monto / litros : 0 };
      })
      .filter(r => r.litros > 0 && r.monto > 0 && r.ppl > 500 && r.ppl < 5000) // sane range
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    if (withPrice.length === 0) return null;

    // Monthly aggregation
    const monthly: Record<string, { litros: number; monto: number; count: number }> = {};
    withPrice.forEach(r => {
      const key = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { litros: 0, monto: 0, count: 0 };
      monthly[key].litros += r.litros;
      monthly[key].monto += r.monto;
      monthly[key].count++;
    });
    const monthlyArr = Object.entries(monthly)
      .map(([m, d]) => ({ month: m, ppl: Math.round(d.monto / d.litros), litros: d.litros, count: d.count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Weighted averages
    const now = new Date();
    const ago3 = new Date(now); ago3.setMonth(ago3.getMonth() - 3);
    const ago6 = new Date(now); ago6.setMonth(ago6.getMonth() - 6);
    const ago12 = new Date(now); ago12.setMonth(ago12.getMonth() - 12);
    const calc = (since: Date) => {
      const subset = withPrice.filter(r => r.fecha >= since);
      const tL = subset.reduce((s, r) => s + r.litros, 0);
      const tM = subset.reduce((s, r) => s + r.monto, 0);
      return tL > 0 ? Math.round(tM / tL) : 0;
    };
    const avg3m = calc(ago3);
    const avg6m = calc(ago6);
    const avg12m = calc(ago12);

    // Yearly aggregation for trend
    const yearly: Record<number, { litros: number; monto: number }> = {};
    withPrice.forEach(r => {
      const yr = r.fecha.getFullYear();
      if (!yearly[yr]) yearly[yr] = { litros: 0, monto: 0 };
      yearly[yr].litros += r.litros;
      yearly[yr].monto += r.monto;
    });
    const yearlyArr = Object.entries(yearly)
      .map(([y, d]) => ({ year: Number(y), ppl: Math.round(d.monto / d.litros) }))
      .sort((a, b) => a.year - b.year);

    // Compute CAGR from first full year to last full year
    const fullYears = yearlyArr.filter(y => y.year < now.getFullYear());
    let cagr = 0;
    if (fullYears.length >= 2) {
      const first = fullYears[0];
      const last = fullYears[fullYears.length - 1];
      const years = last.year - first.year;
      if (years > 0 && first.ppl > 0) {
        cagr = (Math.pow(last.ppl / first.ppl, 1 / years) - 1) * 100;
      }
    }

    return { monthlyArr, avg3m, avg6m, avg12m, yearlyArr, cagr, totalRecords: withPrice.length };
  }, [fuelLogs]);

  // ===== BRENT → AVGAS PREDICTIVE INTELLIGENCE ENGINE =====
  // Self-learning correlation model with dynamic lag discovery,
  // volatility adjustment, FX cross-correlation, and structural break detection.
  // Recalculates automatically whenever new fuel data or Brent data arrives.
  const brentAvgasCorrelation = useMemo(() => {
    if (!fuelPriceAnalysis || !brentData || !brentData.monthly || brentData.monthly.length < 6) return null;
    const avgasMonthly = fuelPriceAnalysis.monthlyArr; // {month, ppl (CLP/L), litros, count}
    const brentMonthly = brentData.monthly;            // {month, brentUSD, usdCLP, weeks}
    const brentWeekly = brentData.weekly || [];         // {week, brentUSD, usdCLP}
    const currentBrent = brentData.currentBrentUSD;
    const currentFX = usdRate; // Live USD/CLP from economic-indicators

    // Build lookup maps
    const brentByMonth: Record<string, { brentUSD: number; usdCLP: number }> = {};
    brentMonthly.forEach(b => { brentByMonth[b.month] = { brentUSD: b.brentUSD, usdCLP: b.usdCLP }; });

    // ── LAYER 1: Dynamic Lag Discovery (OLS for lags 0–6) ──
    // For each lag, pair AVGAS month with Brent from `lag` months earlier
    // Convert AVGAS CLP/L → USD/L using that month's FX rate
    type LagResult = {
      lag: number;
      slope: number;
      intercept: number;
      r2: number;
      pairs: number;
      residualStdDev: number;
      effectiveN: number;
      halfLife: number;
    };

    function shiftMonth(month: string, offset: number): string {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(y, m - 1 + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function runOLS(pairs: { x: number; y: number }[]): { slope: number; intercept: number; r2: number; residualStdDev: number } {
      const n = pairs.length;
      if (n < 3) return { slope: 0, intercept: 0, r2: 0, residualStdDev: 0 };
      const sumX = pairs.reduce((s, p) => s + p.x, 0);
      const sumY = pairs.reduce((s, p) => s + p.y, 0);
      const sumXY = pairs.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = pairs.reduce((s, p) => s + p.x * p.x, 0);
      const meanX = sumX / n;
      const meanY = sumY / n;
      const denom = sumX2 - n * meanX * meanX;
      if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: meanY, r2: 0, residualStdDev: 0 };
      const slope = (sumXY - n * meanX * meanY) / denom;
      const intercept = meanY - slope * meanX;
      // R²
      const ssRes = pairs.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
      const ssTot = pairs.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      const residualStdDev = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
      return { slope, intercept, r2: Math.max(0, r2), residualStdDev };
    }

    // ── WLS: Weighted Least Squares with exponential recency weighting ──
    // λ = 0.03 → half-life ≈ 23 months (ln(2)/0.03 ≈ 23.1)
    // Recent data dominates the regression, naturally adapting to inflation,
    // structural changes, and regime shifts without needing CPI deflation.
    const LAMBDA = 0.03;
    const nowDate = new Date();
    const nowMonthIdx = nowDate.getFullYear() * 12 + nowDate.getMonth(); // absolute month index

    function monthAge(month: string): number {
      const [y, m] = month.split('-').map(Number);
      return Math.max(0, nowMonthIdx - (y * 12 + (m - 1)));
    }

    function runWLS(pairs: { x: number; y: number; month: string }[]): {
      slope: number; intercept: number; r2: number; residualStdDev: number;
      effectiveN: number; halfLife: number;
    } {
      const n = pairs.length;
      if (n < 3) return { slope: 0, intercept: 0, r2: 0, residualStdDev: 0, effectiveN: 0, halfLife: 23 };

      // Compute weights: w_i = exp(-λ × age_in_months)
      const weights = pairs.map(p => Math.exp(-LAMBDA * monthAge(p.month)));
      const sumW = weights.reduce((s, w) => s + w, 0);
      // Effective sample size: (ΣW)² / Σ(W²) — Kish's formula
      const sumW2 = weights.reduce((s, w) => s + w * w, 0);
      const effectiveN = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;

      // Weighted means
      const wMeanX = pairs.reduce((s, p, i) => s + weights[i] * p.x, 0) / sumW;
      const wMeanY = pairs.reduce((s, p, i) => s + weights[i] * p.y, 0) / sumW;

      // Weighted covariance & variance
      let wCovXY = 0, wVarX = 0;
      for (let i = 0; i < n; i++) {
        const dx = pairs[i].x - wMeanX;
        const dy = pairs[i].y - wMeanY;
        wCovXY += weights[i] * dx * dy;
        wVarX += weights[i] * dx * dx;
      }

      if (Math.abs(wVarX) < 1e-10) return { slope: 0, intercept: wMeanY, r2: 0, residualStdDev: 0, effectiveN, halfLife: 23 };

      const slope = wCovXY / wVarX;
      const intercept = wMeanY - slope * wMeanX;

      // Weighted R²
      let wSSRes = 0, wSSTot = 0;
      for (let i = 0; i < n; i++) {
        const predicted = slope * pairs[i].x + intercept;
        wSSRes += weights[i] * Math.pow(pairs[i].y - predicted, 2);
        wSSTot += weights[i] * Math.pow(pairs[i].y - wMeanY, 2);
      }
      const r2 = wSSTot > 0 ? Math.max(0, 1 - wSSRes / wSSTot) : 0;
      const residualStdDev = effectiveN > 2 ? Math.sqrt(wSSRes / (effectiveN - 2)) : 0;

      return { slope, intercept, r2, residualStdDev, effectiveN, halfLife: Math.round(Math.LN2 / LAMBDA) };
    }

    const MAX_LAG = 6;
    const allLags: LagResult[] = [];

    for (let lag = 0; lag <= MAX_LAG; lag++) {
      const pairs: { x: number; y: number; month: string }[] = [];
      for (const avgas of avgasMonthly) {
        const brentMonth = shiftMonth(avgas.month, -lag);
        const brent = brentByMonth[brentMonth];
        if (!brent) continue;
        // Convert AVGAS CLP/L to USD/L using the Brent month's FX
        const avgasUSD = avgas.ppl / brent.usdCLP;
        pairs.push({ x: brent.brentUSD, y: avgasUSD, month: avgas.month });
      }
      const wls = runWLS(pairs);
      allLags.push({ lag, ...wls, pairs: pairs.length });
    }

    // Select lag with highest weighted R² (minimum 6 paired months, effective N ≥ 4)
    const validLags = allLags.filter(l => l.pairs >= 6 && l.effectiveN >= 4);
    if (validLags.length === 0) return null;
    const bestLag = validLags.reduce((best, l) => l.r2 > best.r2 ? l : best, validLags[0]);

    // ── LAYER 2: Volatility Adjustment ──
    // High Brent volatility → distributors add risk premium → AVGAS rises more than linear model predicts
    let volatilityAdj = 0;
    let brentVolatility8w = 0;
    if (brentWeekly.length >= 12) {
      const recent8w = brentWeekly.slice(-8);
      const mean8w = recent8w.reduce((s, w) => s + w.brentUSD, 0) / recent8w.length;
      brentVolatility8w = Math.sqrt(
        recent8w.reduce((s, w) => s + Math.pow(w.brentUSD - mean8w, 2), 0) / recent8w.length
      );
      // If volatility > 5 USD/bbl → add 2% per extra dollar of vol
      const volThreshold = 5;
      if (brentVolatility8w > volThreshold) {
        volatilityAdj = (brentVolatility8w - volThreshold) * 0.02;
      }
    }

    // ── LAYER 3: FX Cross-Correlation ──
    // Evaluate if CLP weakness amplifies Brent impact on local AVGAS price
    // Multiple regression: AVGAS_CLP = β₁×Brent + β₂×USDCLP + β₃×Brent×USDCLP + intercept
    let fxSensitivity = 0;
    let fxBeta = 0;
    let interactionBeta = 0;
    {
      // Build paired data for multiple regression (use best lag)
      const mPairs: { brent: number; fx: number; avgasCLP: number }[] = [];
      for (const avgas of avgasMonthly) {
        const brentMonth = shiftMonth(avgas.month, -bestLag.lag);
        const brent = brentByMonth[brentMonth];
        if (!brent) continue;
        mPairs.push({ brent: brent.brentUSD, fx: brent.usdCLP, avgasCLP: avgas.ppl });
      }
      if (mPairs.length >= 8) {
        // Normalize for numerical stability
        const meanB = mPairs.reduce((s, p) => s + p.brent, 0) / mPairs.length;
        const meanFX = mPairs.reduce((s, p) => s + p.fx, 0) / mPairs.length;
        const meanA = mPairs.reduce((s, p) => s + p.avgasCLP, 0) / mPairs.length;
        // Simple: compute correlation between FX changes and residuals from Brent-only model
        const residuals = mPairs.map(p => {
          const predicted = (bestLag.slope * p.brent + bestLag.intercept) * p.fx;
          return p.avgasCLP - predicted;
        });
        const fxDeviations = mPairs.map(p => p.fx - meanFX);
        const corrNum = residuals.reduce((s, r, i) => s + r * fxDeviations[i], 0);
        const corrDenR = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0));
        const corrDenFX = Math.sqrt(fxDeviations.reduce((s, d) => s + d * d, 0));
        if (corrDenR > 0 && corrDenFX > 0) {
          fxSensitivity = corrNum / (corrDenR * corrDenFX); // Pearson correlation
        }
        // Approximate β for FX: regression of residual on FX deviation
        const fxVar = fxDeviations.reduce((s, d) => s + d * d, 0);
        if (fxVar > 0) {
          fxBeta = corrNum / fxVar; // CLP/L per CLP/USD deviation
        }
      }
    }

    // ── LAYER 4: Structural Break Detection ──
    // If last 12 months have systematically different residuals from full-period model,
    // use only post-break data for forecasting ("recent regime")
    let structuralBreak: { detected: boolean; breakMonth: string; recentR2: number; fullR2: number } = {
      detected: false, breakMonth: '', recentR2: bestLag.r2, fullR2: bestLag.r2,
    };
    // With WLS, recent data already dominates the regression via exponential weights.
    // Structural break detection now serves as a diagnostic — if detected, we report it
    // but WLS coefficients are already adapted. Only override if recent-only WLS is
    // significantly better (>10% R² improvement), indicating a hard regime shift.
    let effectiveSlope = bestLag.slope;
    let effectiveIntercept = bestLag.intercept;
    let effectiveR2 = bestLag.r2;
    {
      const sortedAvgas = [...avgasMonthly].sort((a, b) => a.month.localeCompare(b.month));
      const cutoffMonth = `${nowDate.getFullYear() - 1}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
      const recentPairs: { x: number; y: number; month: string }[] = [];
      const earlyPairs: { x: number; y: number; month: string }[] = [];
      for (const avgas of sortedAvgas) {
        const brentMonth = shiftMonth(avgas.month, -bestLag.lag);
        const brent = brentByMonth[brentMonth];
        if (!brent) continue;
        const avgasUSD = avgas.ppl / brent.usdCLP;
        const pair = { x: brent.brentUSD, y: avgasUSD, month: avgas.month };
        if (avgas.month >= cutoffMonth) recentPairs.push(pair);
        else earlyPairs.push(pair);
      }
      if (recentPairs.length >= 6 && earlyPairs.length >= 6) {
        // Check weighted residual drift between periods
        const recentResiduals = recentPairs.map(p => p.y - (bestLag.slope * p.x + bestLag.intercept));
        const earlyResiduals = earlyPairs.map(p => p.y - (bestLag.slope * p.x + bestLag.intercept));
        const meanRecent = recentResiduals.reduce((s, r) => s + r, 0) / recentResiduals.length;
        const meanEarly = earlyResiduals.reduce((s, r) => s + r, 0) / earlyResiduals.length;
        const pooledStd = bestLag.residualStdDev || 0.01;
        // Hard structural break: recent bias > 2σ AND recent-only WLS improves R² by >10%
        if (Math.abs(meanRecent - meanEarly) > 2.0 * pooledStd && pooledStd > 0) {
          const recentWLS = runWLS(recentPairs);
          if (recentPairs.length >= 6 && recentWLS.r2 > bestLag.r2 + 0.10) {
            structuralBreak = {
              detected: true,
              breakMonth: cutoffMonth,
              recentR2: recentWLS.r2,
              fullR2: bestLag.r2,
            };
            effectiveSlope = recentWLS.slope;
            effectiveIntercept = recentWLS.intercept;
            effectiveR2 = recentWLS.r2;
          }
        }
      }
    }

    // ── FORECASTING ──
    // Extrapolate Brent forward using linear trend of last 6 months of weekly data
    let brentTrend = 0; // USD/bbl per month
    if (brentWeekly.length >= 12) {
      const last26w = brentWeekly.slice(-26); // ~6 months
      // Linear regression: Brent vs time (weeks as x)
      const tPairs = last26w.map((w, i) => ({ x: i, y: w.brentUSD }));
      const tOLS = runOLS(tPairs);
      brentTrend = tOLS.slope * 4.33; // Convert weekly slope to monthly
    }

    // Projected Brent at 3 and 6 months
    const brent3m = Math.max(30, currentBrent + brentTrend * 3);
    const brent6m = Math.max(30, currentBrent + brentTrend * 6);

    // Apply regression to get AVGAS USD/L, then convert to CLP
    const impliedNowUSD = effectiveSlope * currentBrent + effectiveIntercept;
    const implied3mUSD = effectiveSlope * brent3m + effectiveIntercept;
    const implied6mUSD = effectiveSlope * brent6m + effectiveIntercept;

    // Apply volatility adjustment (multiplicative)
    const volMultiplier = 1 + volatilityAdj;

    // Apply FX adjustment for current deviation from mean
    const historicalMeanFX = brentMonthly.length > 0
      ? brentMonthly.reduce((s, b) => s + b.usdCLP, 0) / brentMonthly.length
      : currentFX;
    const fxDeviation = currentFX - historicalMeanFX;
    const fxAdjCLP = fxBeta * fxDeviation; // Additional CLP/L from FX deviation

    // Final forecasts in CLP/L
    const impliedNowCLP = Math.round(Math.max(0, impliedNowUSD * volMultiplier * currentFX + fxAdjCLP));
    const forecast3m = Math.round(Math.max(0, implied3mUSD * volMultiplier * currentFX + fxAdjCLP));
    const forecast6m = Math.round(Math.max(0, implied6mUSD * volMultiplier * currentFX + fxAdjCLP));

    // Confidence score (0-100) based on weighted R², effective N, and data span
    const effectiveNScore = Math.min(bestLag.effectiveN / 20, 1); // 20 effective months = 100%
    const dataSpanScore = Math.min(bestLag.pairs / 40, 1); // 40 raw months = 100%
    const r2Score = effectiveR2;
    const confidence = Math.round((r2Score * 0.50 + effectiveNScore * 0.30 + dataSpanScore * 0.20) * 100);

    return {
      // Core regression (WLS)
      bestLag: bestLag.lag,
      bestR2: effectiveR2,
      slope: effectiveSlope,
      intercept: effectiveIntercept,
      pairedMonths: bestLag.pairs,
      allLags,
      // WLS metadata
      method: 'WLS' as const,
      lambda: LAMBDA,
      halfLife: bestLag.halfLife,
      effectiveN: Math.round(bestLag.effectiveN * 10) / 10,
      // Forecasts
      impliedNowCLP,
      forecast3m,
      forecast6m,
      brentTrend: Math.round(brentTrend * 100) / 100,
      brent3m: Math.round(brent3m * 10) / 10,
      brent6m: Math.round(brent6m * 10) / 10,
      // Volatility
      brentVolatility8w: Math.round(brentVolatility8w * 100) / 100,
      volatilityAdj: Math.round(volatilityAdj * 10000) / 100, // as %
      // FX
      fxSensitivity: Math.round(fxSensitivity * 1000) / 1000,
      fxBeta: Math.round(fxBeta * 100) / 100,
      fxDeviation: Math.round(fxDeviation),
      // Structural break
      structuralBreak,
      // Meta
      confidence,
      totalWeeks: brentWeekly.length,
      currentBrent,
      currentFX,
    };
  }, [fuelPriceAnalysis, brentData, usdRate]);

  // Fetch live UF/USD on mount + auto-populate AVGAS from fuel records
  useEffect(() => {
    fetch('/api/economic-indicators')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.uf?.valor) {
          setUfRate(Math.round(data.uf.valor));
          setLiveIndicators(prev => ({ ...prev, uf: true }));
        }
        if (data.dolar?.valor) {
          setUsdRate(Math.round(data.dolar.valor));
          setLiveIndicators(prev => ({ ...prev, usd: true }));
        }
      })
      .catch(() => {}); // Silent fail, keeps defaults
    // Also fetch Brent oil weekly historical data for AVGAS correlation
    fetch('/api/brent-history')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data || !data.weekly) return;
        setBrentData({
          currentBrentUSD: data.currentBrentUSD,
          weekly: data.weekly,
          monthly: data.monthly,
          totalWeeks: data.totalWeeks,
          source: data.source,
        });
        setLiveIndicators(prev => ({ ...prev, brent: true }));
      })
      .catch(() => {});
  }, []);

  // AVGAS pricing: MAX(avg3m, avg6m, avg12m, brentForecast3m) — highest signal wins
  const avgasSource = useMemo(() => {
    if (!fuelPriceAnalysis || fuelPriceAnalysis.avg3m <= 0) return null;

    const candidates: { price: number; source: string; label: string }[] = [
      { price: fuelPriceAnalysis.avg3m, source: 'avg3m', label: '3mo avg' },
      { price: fuelPriceAnalysis.avg6m, source: 'avg6m', label: '6mo avg' },
      { price: fuelPriceAnalysis.avg12m, source: 'avg12m', label: '12mo avg' },
    ];

    // Add Brent correlation forecast if available and meaningful
    if (brentAvgasCorrelation && brentAvgasCorrelation.forecast3m > 0 && brentAvgasCorrelation.bestR2 > 0.3) {
      candidates.push({
        price: Math.round(brentAvgasCorrelation.forecast3m),
        source: 'brentForecast3m',
        label: `Brent→3m (R²=${brentAvgasCorrelation.bestR2.toFixed(2)})`,
      });
    }

    // Filter out zero/invalid candidates
    const valid = candidates.filter(c => c.price > 0);
    if (valid.length === 0) return null;

    // MAX wins — most conservative (highest cost) signal
    const winner = valid.reduce((best, c) => c.price > best.price ? c : best, valid[0]);

    return {
      price: winner.price,
      source: winner.source,
      label: winner.label,
      breakdown: valid.map(c => ({ ...c, isWinner: c.source === winner.source })),
    };
  }, [fuelPriceAnalysis, brentAvgasCorrelation]);

  useEffect(() => {
    if (avgasSource) {
      setAvgasLiterCLP(avgasSource.price);
      // Derive trend rate from Brent forecast or CAGR, whichever is higher
      let bestRate = 5; // floor
      const cagrRate = fuelPriceAnalysis!.cagr > 0 ? fuelPriceAnalysis!.cagr : 5;
      bestRate = Math.max(bestRate, cagrRate);

      // If Brent forecast available, compute annualized rate from current→forecast6m
      if (brentAvgasCorrelation && brentAvgasCorrelation.forecast6m > 0 && avgasSource.price > 0) {
        const fwd6m = brentAvgasCorrelation.forecast6m;
        const fwdAnnualized = ((fwd6m / avgasSource.price) - 1) * 2 * 100; // 6m → annualized
        if (fwdAnnualized > bestRate) bestRate = fwdAnnualized;
      }

      setFuelTrendRate(Math.round(Math.min(bestRate, 50) * 10) / 10); // cap at 50%
      setLiveIndicators(prev => ({ ...prev, fuel: true }));
    }
  }, [avgasSource, brentAvgasCorrelation]);

  // Auto-populate IPC Chile cumulative inflation from mindicador.cl (Aug 2022 → present)
  useEffect(() => {
    fetch('/api/ipc-chile?baseYear=2022&baseMonth=8')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.cumulativePct > 0) {
          setClInflationPct(data.cumulativePct);
          setLiveIndicators(prev => ({ ...prev, ipc: true }));
        }
      })
      .catch(() => {}); // Silent fail, keeps default 16.35%
  }, []);

  // Auto-populate engine market price from airpowerinc.com (RENPL-RT8164 O-320-D2J)
  const [enginePriceSource, setEnginePriceSource] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/engine-price')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.price > 0) {
          setEngineMarketPriceUSD(data.price);
          setEnginePriceSource(data.source || (data.fallback ? 'hardcoded' : 'scraped'));
          // Show as live if we got a price (even from hardcoded fallback, since
          // the fallback price is manually verified and kept up-to-date)
          setLiveIndicators(prev => ({ ...prev, engine: true }));
        }
      })
      .catch(() => {}); // Silent fail, keeps defaults
  }, []);

  // Consumption rates — use real fuel rate from flight data when available
  const fuelLPH = overviewMetrics?.fuelRateLph || 26.5; // fallback: 7 GPH × 3.785
  const oilLPH = 0.0475;

  // --- Computed values ---
  const computed = useMemo(() => {
    // H/T Ratio: maintenance intervals are in tach hrs, costs expressed per hobbs hr
    const htRatio = overviewMetrics?.annualStats?.hobbsTachRatio || 1.25;
    const maintInterval = 100 * htRatio; // 100 tach hrs = ~125 hobbs hrs

    // Current inflated components (from Aug 2022 to today, Chilean IPC)
    const motorTodayCLP = Math.round(overhaulMotorCLP * (1 + clInflationPct / 100));
    const laborTodayCLP = Math.round(overhaulLaborCLP * (1 + clInflationPct / 100));

    // ===== MARKET REPLACEMENT COST (live from airpowerinc.com) =====
    const motorFobCLP = Math.round(engineMarketPriceUSD * usdRate);
    const originalMotorUSD = 30895.92;
    const originalUsdRate = 920;
    const originalFobCLP = Math.round(originalMotorUSD * originalUsdRate);
    const internacionRatio = overhaulMotorCLP / originalFobCLP;
    const motorInternacionCLP = Math.round(motorFobCLP * internacionRatio);
    const internacionCostCLP = motorInternacionCLP - motorFobCLP;
    const marketReplacementCLP = motorInternacionCLP + laborTodayCLP;
    const yearsSinceOverhaul = 3.67;
    const motorPriceInflationPct = engineMarketPriceUSD > 0
      ? ((engineMarketPriceUSD / originalMotorUSD) - 1) * 100
      : 0;
    const motorAnnualInflation = engineMarketPriceUSD > 0
      ? (Math.pow(engineMarketPriceUSD / originalMotorUSD, 1 / yearsSinceOverhaul) - 1) * 100
      : 0;

    // ===== EFFECTIVE OVERHAUL COST: max(IPC-adjusted, market replacement) =====
    const ipcOverhaulCLP = overhaulCLP; // historic cost + IPC Chile
    const effectiveOverhaulCLP = Math.max(ipcOverhaulCLP, marketReplacementCLP);
    const overhaulSource = marketReplacementCLP > ipcOverhaulCLP ? 'market' : 'ipc';

    // Years to overhaul: use annual tach rate for consistency
    // When user overrides horasAnuales, derive tachPerYear from the override
    const overhaulCycleHobbs = overhaulCycleHrs * htRatio; // for display only
    const liveTachPerYear = overviewMetrics?.annualStats?.tachThisYear || 195;
    const tachPerYear = horasIsLive ? liveTachPerYear : (horasAnuales / htRatio);
    const anosRemanentes = tachPerYear > 0 ? overhaulCycleHrs / tachPerYear : overhaulCycleHrs / 195;

    // ===== FINANCIAL PROJECTIONS (computed early — needed for overhaul reserve) =====
    const r = interestRate / 100;
    const clInf = clForwardInflation / 100;
    const yearsToOverhaul = Math.max(anosRemanentes, 0.01);

    const currentFunds = recaudado;
    const projectedFunds = currentFunds * Math.pow(1 + r, yearsToOverhaul);
    const interestEarned = projectedFunds - currentFunds;

    const inflatedOverhaulCost = effectiveOverhaulCLP * Math.pow(1 + clInf, yearsToOverhaul);
    const inflationIncrease = inflatedOverhaulCost - effectiveOverhaulCLP;

    const projectedGap = inflatedOverhaulCost - projectedFunds;
    // PMT formula: monthly savings invested at r%/yr compound interest
    // PMT = FV × r_m / ((1+r_m)^n - 1)  — annuity "sinking fund" payment
    const monthsToOverhaul = Math.max(yearsToOverhaul * 12, 1);
    const rMonthly = Math.pow(1 + r, 1/12) - 1; // effective monthly rate from annual
    const projectedMonthlyTarget = projectedGap > 0
      ? (rMonthly > 0
        ? projectedGap * rMonthly / (Math.pow(1 + rMonthly, monthsToOverhaul) - 1)
        : projectedGap / monthsToOverhaul)
      : 0;
    // FV of the annuity (verification: PMT payments + compound interest should equal projectedGap)
    const fvAnnuity = projectedMonthlyTarget > 0
      ? (rMonthly > 0
        ? projectedMonthlyTarget * (Math.pow(1 + rMonthly, monthsToOverhaul) - 1) / rMonthly
        : projectedMonthlyTarget * monthsToOverhaul)
      : 0;
    // Total available at TBO = existing funds grown + annuity from monthly savings
    const totalAtTBO = projectedFunds + fvAnnuity;

    // Variable costs per hour (hobbs)
    const combustibleHr = fuelLPH * avgasLiterCLP;
    const aceiteHr = oilLPH * aceiteLiterCLP;
    const mantto100hr = revision100CLP / maintInterval;
    const manttoOil = cambioAceiteCLP / maintInterval;
    // Overhaul reserve linked to PMT sinking fund:
    // PMT × 12 = annual savings needed → ÷ horasAnuales = reserve per flight hour
    // This is lower than linear (gap/hrs) because invested savings earn compound interest
    const overhaulProvisionAnual = projectedMonthlyTarget * 12;
    const manttoOverhaul = overhaulProvisionAnual / horasAnuales;
    const manttoHr = mantto100hr + manttoOil + manttoOverhaul;
    const totalVariableHr = combustibleHr + aceiteHr + manttoHr;
    const totalFijoAnual = seguroAnual + hangarAnual + toaPatentesAnual + contingenciasAnual + impuestoContadorAnual + limpiezaAnual;
    const totalFijoMes = totalFijoAnual / 12;
    const totalFijoHr = totalFijoAnual / horasAnuales;

    // Total
    const totalCostoHr = totalFijoHr + totalVariableHr;

    // Profitability
    const gananciaHr = valorHoraCLP - totalCostoHr;
    const margen = valorHoraCLP > 0 ? (gananciaHr / valorHoraCLP) * 100 : 0;

    // Overhaul funding
    const faltaOverhaul = effectiveOverhaulCLP - recaudado;

    // ===== FUEL COST PROJECTIONS =====
    const fuelTrend = fuelTrendRate / 100;
    // Projected AVGAS price at time of overhaul
    const projectedAvgasPrice = avgasLiterCLP * Math.pow(1 + fuelTrend, yearsToOverhaul);
    // Average price over the period (integral of exponential / period)
    const avgProjectedAvgasPrice = fuelTrend > 0
      ? avgasLiterCLP * (Math.pow(1 + fuelTrend, yearsToOverhaul) - 1) / (fuelTrend * yearsToOverhaul)
      : avgasLiterCLP;
    // Projected variable cost per hour (fuel portion adjusted)
    const projectedCombustibleHr = fuelLPH * avgProjectedAvgasPrice;
    const projectedTotalVariableHr = projectedCombustibleHr + aceiteHr + manttoHr;
    const projectedTotalCostoHr = totalFijoHr + projectedTotalVariableHr;
    const projectedGananciaHr = valorHoraCLP - projectedTotalCostoHr;
    const projectedMargen = valorHoraCLP > 0 ? (projectedGananciaHr / valorHoraCLP) * 100 : 0;
    // Total fuel cost increase over the period
    const annualFuelLitros = fuelLPH * horasAnuales;
    const currentAnnualFuelCost = annualFuelLitros * avgasLiterCLP;
    const projectedAnnualFuelCostAtOverhaul = annualFuelLitros * projectedAvgasPrice;

    // Breakdowns for charts
    const fixedBreakdown = [
      { name: 'Insurance', value: seguroAnual, color: '#3b82f6' },
      { name: 'Hangar', value: hangarAnual, color: '#8b5cf6' },
      { name: 'TOA + Patents', value: toaPatentesAnual, color: '#06b6d4' },
      { name: 'Contingencies', value: contingenciasAnual, color: '#f59e0b' },
      { name: 'Tax + Accountant', value: impuestoContadorAnual, color: '#ef4444' },
      { name: 'Cleaning', value: limpiezaAnual, color: '#10b981' },
    ];

    const variableBreakdown = [
      { name: 'Fuel', value: combustibleHr, color: '#f59e0b' },
      { name: 'Oil', value: aceiteHr, color: '#8b5cf6' },
      { name: '100hr Insp.', value: mantto100hr, color: '#3b82f6' },
      { name: 'Oil Change', value: manttoOil, color: '#06b6d4' },
      { name: 'Overhaul Reserve', value: manttoOverhaul, color: '#f97316' },
    ];

    const costPerHourBreakdown = [
      { name: 'Fixed', value: totalFijoHr, color: '#6366f1' },
      { name: 'Variable', value: totalVariableHr, color: '#10b981' },
    ];

    return {
      combustibleHr, aceiteHr, manttoHr, mantto100hr, manttoOil, manttoOverhaul,
      totalVariableHr, overhaulProvisionAnual, totalFijoAnual, totalFijoMes, totalFijoHr,
      totalCostoHr, gananciaHr, margen, faltaOverhaul, anosRemanentes,
      effectiveOverhaulCLP, overhaulSource, ipcOverhaulCLP,
      fixedBreakdown, variableBreakdown, costPerHourBreakdown,
      // Financial projections (CLP single-currency model)
      yearsToOverhaul, currentFunds, projectedFunds, interestEarned,
      inflatedOverhaulCost, inflationIncrease, projectedGap, projectedMonthlyTarget,
      fvAnnuity, monthsToOverhaul, totalAtTBO,
      motorTodayCLP, laborTodayCLP,
      // Market replacement (live engine price + internación)
      motorFobCLP, internacionRatio, motorInternacionCLP, internacionCostCLP, marketReplacementCLP,
      motorPriceInflationPct, motorAnnualInflation,
      // Fuel projections
      projectedAvgasPrice, avgProjectedAvgasPrice, projectedCombustibleHr,
      projectedTotalVariableHr, projectedTotalCostoHr, projectedGananciaHr, projectedMargen,
      currentAnnualFuelCost, projectedAnnualFuelCostAtOverhaul,
      // H/T ratio used
      htRatio, maintInterval, tachPerYear,
    };
  }, [usdRate, ufRate, avgasLiterCLP, aceiteLiterCLP, toaCLP, seguroUSD, cambioAceiteCLP, revision100CLP, overhaulCLP, overhaulCycleHrs, seguroAnual, hangarAnual, toaPatentesAnual, contingenciasAnual, impuestoContadorAnual, limpiezaAnual, recaudado, valorHoraCLP, interestRate, clForwardInflation, fuelTrendRate, overviewMetrics, overhaulMotorCLP, overhaulLaborCLP, clInflationPct, engineMarketPriceUSD, components, horasAnuales]);

  // Actual data from flights (yearly hours)
  const yearlyHours = useMemo(() => {
    const map: Record<number, number> = {};
    flights.forEach(f => {
      const year = new Date(f.fecha).getFullYear();
      map[year] = (map[year] || 0) + (Number(f.diff_hobbs) || 0);
    });
    return Object.entries(map)
      .map(([year, hours]) => ({ year: Number(year), hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => a.year - b.year);
  }, [flights]);

  // Chart refs
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);

  // Fixed costs donut chart
  useEffect(() => {
    if (!donutRef.current) return;
    const ctx = donutRef.current.getContext('2d');
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: 'doughnut' as any,
      data: {
        labels: computed.fixedBreakdown.map(b => b.name),
        datasets: [{
          data: computed.fixedBreakdown.map(b => b.value),
          backgroundColor: computed.fixedBreakdown.map(b => b.color),
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx: any) => ` ${ctx.label}: $${formatCurrency(ctx.raw)} CLP/yr`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [computed.fixedBreakdown]);

  // Cost per hour bar chart
  useEffect(() => {
    if (!barRef.current) return;
    const ctx = barRef.current.getContext('2d');
    if (!ctx) return;
    const items = [
      { label: 'Fixed/hr', value: computed.totalFijoHr, color: '#6366f1' },
      { label: 'Fuel/hr', value: computed.combustibleHr, color: '#f59e0b' },
      { label: 'Oil/hr', value: computed.aceiteHr, color: '#8b5cf6' },
      { label: 'Maint./hr', value: computed.manttoHr, color: '#3b82f6' },
      { label: 'TOTAL/hr', value: computed.totalCostoHr, color: '#0f172a' },
      { label: 'Revenue/hr', value: valorHoraCLP, color: '#10b981' },
    ];
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map(i => i.label),
        datasets: [{
          data: items.map(i => i.value),
          backgroundColor: items.map(i => i.color),
          borderRadius: 6,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: (ctx: any) => ` $${formatCurrency(ctx.raw)} CLP/hr` },
          },
        },
        scales: {
          x: { grid: { color: '#e2e8f0' }, ticks: { callback: (v: any) => '$' + formatCurrency(v) } },
          y: { grid: { display: false }, ticks: { font: { size: 12, weight: 'bold' } } },
        },
      },
    });
    return () => chart.destroy();
  }, [computed, valorHoraCLP]);

  // Helper for parameter inputs
  const ParamInput = ({ label, value, onChange, unit = 'CLP', small = false }: { label: string; value: number; onChange: (v: number) => void; unit?: string; small?: boolean }) => (
    <div className={`flex items-center justify-between gap-2 ${small ? 'py-1' : 'py-1.5'}`}>
      <span className="text-xs text-slate-600 truncate">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-400">{unit}</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="w-24 sm:w-28 text-right text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
        />
      </div>
    </div>
  );

  // Stat card helper
  const StatCard = ({ label, value, sub, color = 'slate', icon }: { label: string; value: string; sub?: string; color?: string; icon: string }) => {
    const colors: Record<string, string> = {
      slate: 'bg-slate-50 text-slate-700',
      green: 'bg-emerald-50 text-emerald-700',
      red: 'bg-red-50 text-red-700',
      blue: 'bg-blue-50 text-blue-700',
      amber: 'bg-amber-50 text-amber-700',
      indigo: 'bg-indigo-50 text-indigo-700',
    };
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-lg ${colors[color]?.split(' ')[0] || 'bg-slate-50'} flex items-center justify-center`}>
            <svg className={`w-4 h-4 ${colors[color]?.split(' ')[1] || 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        </div>
        <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono">{value}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    );
  };

  const [showParams, setShowParams] = useState(false);
  const [showCostModel, setShowCostModel] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Cost Analysis — C-172 CC-AQI</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                  <span>Operating cost model · {horasAnuales} hobbs hrs/yr{!horasIsLive && ' ✏️'}</span>
                  {(liveIndicators.uf || liveIndicators.usd || liveIndicators.fuel || liveIndicators.engine || liveIndicators.ipc || liveIndicators.brent) && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                      LIVE {[liveIndicators.uf && 'UF', liveIndicators.usd && 'USD', liveIndicators.fuel && 'AVGAS', liveIndicators.engine && 'ENGINE', liveIndicators.ipc && 'IPC', liveIndicators.brent && 'BRENT'].filter(Boolean).join('+')}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowParams(!showParams)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${showParams ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
            >
              {showParams ? 'Hide Parameters' : 'Edit Parameters'}
            </button>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Total Cost/hr"
              value={`$${formatCurrency(Math.round(computed.totalCostoHr))}`}
              sub="Fixed + Variable"
              color="slate"
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <StatCard
              label="Fixed/hr"
              value={`$${formatCurrency(Math.round(computed.totalFijoHr))}`}
              sub={`$${formatCurrency(Math.round(computed.totalFijoAnual))}/yr`}
              color="indigo"
              icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
            <StatCard
              label="Variable/hr"
              value={`$${formatCurrency(Math.round(computed.totalVariableHr))}`}
              sub={`Fuel $${formatCurrency(Math.round(computed.combustibleHr))}`}
              color="amber"
              icon="M13 10V3L4 14h7v7l9-11h-7z"
            />
            <StatCard
              label="Revenue/hr"
              value={`$${formatCurrency(valorHoraCLP)}`}
              sub={valorHoraUnit === 'UF' ? `${valorHora} UF` : undefined}
              color="green"
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <StatCard
              label="Margin/hr"
              value={`$${formatCurrency(Math.round(computed.gananciaHr))}`}
              sub={`${computed.margen.toFixed(1)}% margin`}
              color={computed.gananciaHr >= 0 ? 'green' : 'red'}
              icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
            <StatCard
              label="Overhaul Gap"
              value={`$${formatCurrency(Math.round(computed.faltaOverhaul))}`}
              sub={`${computed.anosRemanentes.toFixed(1)} yrs remaining`}
              color="red"
              icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </div>
        </div>
      </div>

      {/* Editable Parameters Panel (collapsible) */}
      {showParams && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-50">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Model Parameters</h4>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Economic rates */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Economic Rates</p>
                <div className="space-y-0.5 divide-y divide-slate-100">
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">USD → CLP{liveIndicators.usd && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">CLP</span>
                      <input type="number" value={usdRate} onChange={e => setUsdRate(Number(e.target.value) || 0)} className="w-24 sm:w-28 text-right text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">UF → CLP{liveIndicators.uf && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">CLP</span>
                      <input type="number" value={ufRate} onChange={e => setUfRate(Number(e.target.value) || 0)} className="w-24 sm:w-28 text-right text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">AVGAS / liter{liveIndicators.fuel && avgasSource && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE {avgasSource.label}</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">CLP</span>
                      <input type="number" value={avgasLiterCLP} onChange={e => setAvgasLiterCLP(Number(e.target.value) || 0)} className="w-24 sm:w-28 text-right text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none" />
                    </div>
                  </div>
                  {/* Fuel rate — read-only, from real flight data */}
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">Fuel rate{overviewMetrics?.fuelRateLph && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{fuelLPH.toFixed(1)} LPH</span>
                      <span className="text-[9px] text-slate-400">({(fuelLPH / 3.785).toFixed(1)} GPH)</span>
                    </div>
                  </div>
                  <ParamInput label="Oil / liter" value={aceiteLiterCLP} onChange={setAceiteLiterCLP} unit="CLP" />
                  {/* Revenue / hour — CLP ↔ UF toggle */}
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate">Revenue / hour</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (valorHoraUnit === 'CLP') {
                            // Switch to UF: convert current CLP to UF
                            setValorHora(Number((valorHora / ufRate).toFixed(2)));
                            setValorHoraUnit('UF');
                          } else {
                            // Switch to CLP: convert current UF to CLP
                            setValorHora(Math.round(valorHora * ufRate));
                            setValorHoraUnit('CLP');
                          }
                        }}
                        className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full transition-colors ${
                          valorHoraUnit === 'UF'
                            ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                        title="Click to toggle between CLP and UF"
                      >
                        UF
                      </button>
                      <span className="text-[10px] text-slate-400">{valorHoraUnit}</span>
                      <input
                        type="number"
                        step={valorHoraUnit === 'UF' ? '0.01' : '1'}
                        value={valorHora}
                        onChange={e => setValorHora(Number(e.target.value) || 0)}
                        className="w-24 sm:w-28 text-right text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
                      />
                    </div>
                  </div>
                  {/* Show converted value in the other unit */}
                  <div className="flex justify-end pr-1 -mt-1 mb-0.5">
                    <span className="text-[9px] text-slate-400 font-mono">
                      = {valorHoraUnit === 'UF'
                        ? `$${formatCurrency(valorHoraCLP)} CLP`
                        : `${(valorHora / ufRate).toFixed(2)} UF`
                      }
                    </span>
                  </div>
                </div>
              </div>
              {/* Maintenance */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Maintenance Costs</p>
                <div className="space-y-0.5 divide-y divide-slate-100">
                  <ParamInput label="Oil change" value={cambioAceiteCLP} onChange={setCambioAceiteCLP} unit="CLP" />
                  <ParamInput label="100hr inspection" value={revision100CLP} onChange={setRevision100CLP} unit="CLP" />
                  {/* Hrs to TBO — read-only, computed live from ENGINE component */}
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">Hrs to TBO (tach){engineComp && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{overhaulCycleHrs.toFixed(1)} hrs</span>
                      <span className="text-[9px] text-slate-400">(SMOH {engineComp ? Number(engineComp.horas_acumuladas).toFixed(1) : '?'})</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">
                      Hours / year
                      {horasIsLive
                        ? <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>
                        : <button onClick={() => setHorasAnuales(liveHorasAnuales)} className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 transition-colors" title={`Reset to live: ${liveHorasAnuales} hrs`}>↺ LIVE {liveHorasAnuales}</button>
                      }
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={horasAnuales}
                        onChange={e => setHorasAnuales(Number(e.target.value) || 0)}
                        className={`w-16 text-right text-[11px] font-mono font-bold px-2 py-0.5 rounded border-0 focus:ring-1 focus:ring-blue-400 ${horasIsLive ? 'text-blue-700 bg-blue-50' : 'text-amber-700 bg-amber-50'}`}
                      />
                      <span className="text-[9px] text-slate-400">hrs ({(overviewMetrics?.annualStats?.avgMonthlyHobbsThisYear ?? 0).toFixed(1)}/mo)</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Overhaul cost model */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Overhaul Cost (Ago 2022 + IPC Chile)</p>
                <div className="space-y-0.5 divide-y divide-slate-100">
                  <ParamInput label="Eagle Copters (motor)" value={overhaulMotorCLP} onChange={setOverhaulMotorCLP} unit="CLP" />
                  <ParamInput label="Labor (installation)" value={overhaulLaborCLP} onChange={setOverhaulLaborCLP} unit="CLP" />
                  <div className="flex items-center gap-1">
                    <ParamInput label="IPC Chile cumul." value={clInflationPct} onChange={setClInflationPct} unit="%" />
                    {liveIndicators.ipc && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-emerald-100 text-emerald-700 rounded-full whitespace-nowrap">LIVE</span>}
                  </div>
                  {/* Computed total — read-only */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[11px] text-slate-600">IPC model</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${computed.overhaulSource === 'ipc' ? 'text-amber-700 bg-amber-50 ring-1 ring-amber-300' : 'text-slate-500 bg-slate-50'}`}>${formatCurrency(overhaulCLP)}</span>
                      <span className="text-[9px] text-slate-400">CLP</span>
                    </div>
                  </div>
                  {/* Market motor price — read-only */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[11px] text-slate-600 flex items-center gap-1">Market{liveIndicators.engine && <span className="px-1 py-0.5 text-[8px] font-bold bg-emerald-100 text-emerald-700 rounded-full">LIVE</span>}</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${computed.overhaulSource === 'market' ? 'text-blue-700 bg-blue-50 ring-1 ring-blue-300' : 'text-slate-500 bg-slate-50'}`}>${formatCurrency(computed.marketReplacementCLP)}</span>
                      <span className="text-[9px] text-slate-400">CLP</span>
                    </div>
                  </div>
                  {/* Effective cost used — the max */}
                  <div className="flex items-center justify-between py-1.5 bg-slate-50 -mx-1 px-1 rounded">
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                      Used in calcs
                      <span className={`px-1 py-0.5 text-[8px] font-bold rounded-full ${computed.overhaulSource === 'market' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {computed.overhaulSource === 'market' ? 'MARKET' : 'IPC'}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded ring-1 ring-slate-300">${formatCurrency(computed.effectiveOverhaulCLP)}</span>
                      <span className="text-[9px] text-slate-400">CLP</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Fixed costs */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Annual Fixed Costs</p>
                <div className="space-y-0.5 divide-y divide-slate-100">
                  <ParamInput label="Insurance" value={seguroAnual} onChange={setSeguroAnual} />
                  <ParamInput label="Hangar" value={hangarAnual} onChange={setHangarAnual} />
                  <ParamInput label="TOA + Patents" value={toaPatentesAnual} onChange={setToaPatentesAnual} />
                  <ParamInput label="Contingencies" value={contingenciasAnual} onChange={setContingenciasAnual} />
                  <ParamInput label="Tax + Accountant" value={impuestoContadorAnual} onChange={setImpuestoContadorAnual} />
                  <ParamInput label="Cleaning" value={limpiezaAnual} onChange={setLimpiezaAnual} />
                </div>
              </div>
            </div>
            {/* Overhaul funding row */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Overhaul Funding</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ParamInput label="Recaudado (total)" value={recaudado} onChange={setRecaudado} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
                <ParamInput label="Interest on funds" value={interestRate} onChange={setInterestRate} unit="%/yr" />
                <ParamInput label="IPC Chile fwd" value={clForwardInflation} onChange={setClForwardInflation} unit="%/yr" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fixed costs donut */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700">Fixed Cost Breakdown</h4>
            <p className="text-[10px] text-slate-400">Annual: ${formatCurrency(Math.round(computed.totalFijoAnual))} CLP · Monthly: ${formatCurrency(Math.round(computed.totalFijoMes))} CLP</p>
          </div>
          <div className="p-4 flex justify-center">
            <div className="w-full max-w-[280px]">
              <canvas ref={donutRef} />
            </div>
          </div>
        </div>

        {/* Cost per hour horizontal bar */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700">Cost vs Revenue per Hour</h4>
            <p className="text-[10px] text-slate-400">All values in CLP per flight hour</p>
          </div>
          <div className="p-4">
            <canvas ref={barRef} height={180} />
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
          <h4 className="text-xs font-semibold text-slate-700">Detailed Cost Breakdown</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Per Hour</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Per Month</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Per Year</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">% Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Fixed section */}
              {computed.fixedBreakdown.map((item, i) => (
                <tr key={`f-${i}`} className="hover:bg-slate-50">
                  {i === 0 && <td rowSpan={computed.fixedBreakdown.length} className="px-4 py-2 text-xs font-semibold text-indigo-600 align-top border-r border-slate-100">Fixed</td>}
                  <td className="px-4 py-2 text-xs text-slate-700">{item.name}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value / horasAnuales))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value / 12))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-400">{((item.value / horasAnuales / computed.totalCostoHr) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-indigo-50/50 font-semibold">
                <td className="px-4 py-2 text-xs text-indigo-700 border-r border-slate-100"></td>
                <td className="px-4 py-2 text-xs text-indigo-700">Subtotal Fixed</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-indigo-700">${formatCurrency(Math.round(computed.totalFijoHr))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-indigo-700">${formatCurrency(Math.round(computed.totalFijoMes))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-indigo-700">${formatCurrency(Math.round(computed.totalFijoAnual))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-indigo-700">{((computed.totalFijoHr / computed.totalCostoHr) * 100).toFixed(1)}%</td>
              </tr>
              {/* Variable section */}
              {computed.variableBreakdown.map((item, i) => (
                <tr key={`v-${i}`} className="hover:bg-slate-50">
                  {i === 0 && <td rowSpan={computed.variableBreakdown.length} className="px-4 py-2 text-xs font-semibold text-emerald-600 align-top border-r border-slate-100">Variable</td>}
                  <td className="px-4 py-2 text-xs text-slate-700">{item.name}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value * horasAnuales / 12))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-600">${formatCurrency(Math.round(item.value * horasAnuales))}</td>
                  <td className="px-4 py-2 text-xs text-right font-mono text-slate-400">{((item.value / computed.totalCostoHr) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-emerald-50/50 font-semibold">
                <td className="px-4 py-2 text-xs text-emerald-700 border-r border-slate-100"></td>
                <td className="px-4 py-2 text-xs text-emerald-700">Subtotal Variable</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-emerald-700">${formatCurrency(Math.round(computed.totalVariableHr))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-emerald-700">${formatCurrency(Math.round(computed.totalVariableHr * horasAnuales / 12))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-emerald-700">${formatCurrency(Math.round(computed.totalVariableHr * horasAnuales))}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-emerald-700">{((computed.totalVariableHr / computed.totalCostoHr) * 100).toFixed(1)}%</td>
              </tr>
              {/* Grand total */}
              <tr className="bg-slate-800 text-white font-bold">
                <td className="px-4 py-3 text-xs" colSpan={2}>TOTAL COST</td>
                <td className="px-4 py-3 text-xs text-right font-mono">${formatCurrency(Math.round(computed.totalCostoHr))}</td>
                <td className="px-4 py-3 text-xs text-right font-mono">${formatCurrency(Math.round(computed.totalCostoHr * horasAnuales / 12))}</td>
                <td className="px-4 py-3 text-xs text-right font-mono">${formatCurrency(Math.round(computed.totalCostoHr * horasAnuales))}</td>
                <td className="px-4 py-3 text-xs text-right font-mono">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ENGINE OVERHAUL TIMELINE (Live Data) ===== */}
      {(() => {
        const engineComp = components?.find((c: any) => c.tipo === 'ENGINE');
        const smoh = engineComp ? Number(engineComp.horas_acumuladas) : 0;
        const tbo = engineComp ? Number(engineComp.limite_tbo) : 2000;
        const tachRemaining = Math.max(0, tbo - smoh);
        const htRatio = overviewMetrics?.annualStats?.hobbsTachRatio || 1.25;
        const hobbsRemaining = tachRemaining * htRatio; // for display only
        const stats = overviewMetrics?.nextInspections?.usageStats;
        const weightedRate = stats?.weightedRate || 0; // tach hrs/day (from diff_tach)
        const rate30d = stats?.rate30d || 0;
        const rate90d = stats?.rate90d || 0;
        const rateAnnual = stats?.rateAnnual || 0;
        const stdDev = stats?.stdDev || 0;
        const trend = stats?.trend || 0;

        // Time predictions: use rateAnnual when live, or derive from horasAnuales override
        const liveRate = rateAnnual > 0 ? rateAnnual : weightedRate;
        const overrideRate = horasAnuales / (overviewMetrics?.annualStats?.hobbsTachRatio || 1.25) / 365;
        const effectiveRate = horasIsLive ? liveRate : overrideRate;
        const usingOverride = !horasIsLive;
        const daysRemaining = effectiveRate > 0 ? Math.round(tachRemaining / effectiveRate) : 0;
        const uncertainty = effectiveRate > 0 ? 1.96 * stdDev * Math.sqrt(Math.max(1, daysRemaining)) / effectiveRate : 0;
        const minDays = Math.max(0, Math.round(daysRemaining - uncertainty));
        const maxDays = Math.round(daysRemaining + uncertainty);

        const today = new Date();
        const estDate = new Date(today.getTime() + daysRemaining * 86400000);
        const minDate = new Date(today.getTime() + minDays * 86400000);
        const maxDate = new Date(today.getTime() + maxDays * 86400000);

        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const fmtDateFull = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const fmtTime = (days: number) => {
          if (days <= 0) return '0d';
          if (days < 30) return `${days}d`;
          if (days < 365) return `${(days / 30).toFixed(1)}mo`;
          return `${(days / 365).toFixed(1)}yr`;
        };
        const enginePct = tbo > 0 ? (smoh / tbo) * 100 : 0;
        const tachPerMonth = effectiveRate * 30.44;  // annual rate tach/day
        const hobbsPerMonth = tachPerMonth * htRatio;
        const monthsRemaining = daysRemaining / 30.44;

        // Overhaul funding tied to timeline
        const monthlyFundingNeeded = monthsRemaining > 0 ? computed.faltaOverhaul / monthsRemaining : 0;

        return (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700">Engine Overhaul Timeline</h4>
                    <p className="text-[10px] text-slate-400">{usingOverride ? '✏️ User projection' : 'Live data'} · TBO {tbo} hrs · SMOH {smoh.toFixed(1)} hrs · H/T Ratio {htRatio.toFixed(3)}{usingOverride && <span className="ml-1 text-amber-600 font-semibold">@ {horasAnuales} hobbs/yr</span>}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${enginePct > 80 ? 'bg-red-100 text-red-700' : enginePct > 60 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {(100 - enginePct).toFixed(1)}% life remaining
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              {/* Engine life progress bar */}
              <div className="mb-5">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                  <span>SMOH: <span className="font-mono font-bold text-slate-700">{smoh.toFixed(1)}</span> tach hrs</span>
                  <span>TBO: <span className="font-mono font-bold text-slate-700">{tbo}</span> tach hrs</span>
                </div>
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all ${enginePct > 80 ? 'bg-gradient-to-r from-red-500 to-red-400' : enginePct > 60 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-green-500 to-green-400'}`}
                    style={{ width: `${Math.min(100, enginePct)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white drop-shadow-sm">{enginePct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Remaining: <span className="font-mono font-bold text-slate-600">{tachRemaining.toFixed(1)}</span> tach hrs</span>
                  <span>= <span className="font-mono font-bold text-blue-600">{hobbsRemaining.toFixed(1)}</span> hobbs hrs (×{htRatio.toFixed(3)})</span>
                </div>
              </div>

              {/* Prediction KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 font-mono">{tachRemaining.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500">Tach hrs left</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-lg font-bold text-blue-700 font-mono">{hobbsRemaining.toFixed(1)}</p>
                  <p className="text-[10px] text-slate-500">Hobbs hrs left</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-lg font-bold text-amber-700 font-mono">{fmtTime(daysRemaining)}</p>
                  <p className="text-[10px] text-slate-500">Time to overhaul</p>
                  <p className="text-[9px] text-slate-400">{fmtTime(minDays)} – {fmtTime(maxDays)} range</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-lg font-bold text-red-700 font-mono">{fmtDate(estDate)}</p>
                  <p className="text-[10px] text-slate-500">Estimated date</p>
                  <p className="text-[9px] text-slate-400">{fmtDate(minDate)} – {fmtDate(maxDate)}</p>
                </div>
              </div>

              {/* Flight rate details */}
              <div className="bg-slate-50 rounded-lg p-3 mb-5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Flight Rate Analysis</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <p className="text-[10px] text-slate-400">30-day rate</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{(rate30d * 30.44 * htRatio).toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hobbs/mo</span></p>
                    <p className="text-[9px] text-slate-400">{(rate30d * 30.44).toFixed(1)} tach/mo</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">90-day rate</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{(rate90d * 30.44 * htRatio).toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hobbs/mo</span></p>
                    <p className="text-[9px] text-slate-400">{(rate90d * 30.44).toFixed(1)} tach/mo</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Annual rate</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{(rateAnnual * 30.44 * htRatio).toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hobbs/mo</span></p>
                    <p className="text-[9px] text-slate-400">{(rateAnnual * 30.44).toFixed(1)} tach/mo</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Weighted avg</p>
                    <p className="text-sm font-bold text-blue-700 font-mono">{hobbsPerMonth.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">hobbs/mo</span></p>
                    <p className="text-[9px] text-slate-400">= {tachPerMonth.toFixed(1)} tach/mo</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Trend</p>
                    <p className={`text-sm font-bold font-mono ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                      {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* H/T Ratio explanation */}
              <div className="bg-indigo-50 rounded-lg p-3 mb-5">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-[11px] text-indigo-700">
                    <p className="font-semibold mb-1">Hobbs/Tach Ratio: {htRatio.toFixed(3)}</p>
                    <p className="text-indigo-600">For every 1 tach hour, you fly {htRatio.toFixed(3)} hobbs hours. This means {tachRemaining.toFixed(1)} remaining tach hrs = <span className="font-bold">{hobbsRemaining.toFixed(1)} actual hobbs hrs</span> of flying time. At the current weighted rate of {hobbsPerMonth.toFixed(1)} hobbs/mo, the engine reaches TBO around <span className="font-bold">{fmtDateFull(estDate)}</span>.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Overhaul Funding Tracker — Redesigned */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-700">Overhaul Funding Tracker</h4>
                <p className="text-[10px] text-slate-400">
                  {formatCurrency(overhaulCycleHrs)} tach hrs · {computed.yearsToOverhaul.toFixed(1)} yrs @ {Math.round(computed.tachPerYear)} tach/yr ({horasAnuales} hobbs/yr)
                  {!horasIsLive && <span className="ml-1 text-amber-600 font-semibold">✏️</span>}
                </p>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${computed.overhaulSource === 'market' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
              {computed.overhaulSource === 'market' ? '✦ MARKET' : '✦ IPC'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {/* ── Row 1: Current Status ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Total Cost</p>
              <p className="text-lg font-bold text-slate-900 font-mono">${formatCurrency(Math.round(computed.effectiveOverhaulCLP))}</p>
              <p className="text-[9px] text-slate-400">{computed.overhaulSource === 'market' ? 'FOB + internación + labor' : 'IPC Chile adjusted'}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-[9px] text-emerald-600 uppercase tracking-wider mb-1">Funded</p>
              <p className="text-lg font-bold text-emerald-700 font-mono">${formatCurrency(computed.currentFunds)}</p>
              <div className="mt-1.5 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (recaudado / computed.effectiveOverhaulCLP) * 100)}%` }} />
              </div>
              <p className="text-[9px] text-emerald-600 font-mono mt-0.5">{((recaudado / computed.effectiveOverhaulCLP) * 100).toFixed(1)}%</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 border border-red-100">
              <p className="text-[9px] text-red-500 uppercase tracking-wider mb-1">Gap</p>
              <p className="text-lg font-bold text-red-700 font-mono">${formatCurrency(Math.round(computed.faltaOverhaul))}</p>
              <p className="text-[9px] text-slate-400">{(computed.faltaOverhaul / computed.effectiveOverhaulCLP * 100).toFixed(0)}% remaining</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-[9px] text-amber-600 uppercase tracking-wider mb-1">Time to TBO</p>
              <p className="text-lg font-bold text-amber-700 font-mono">{computed.anosRemanentes.toFixed(1)} <span className="text-sm">yrs</span></p>
              <p className="text-[9px] text-slate-400">{Math.round(computed.anosRemanentes * 12)} mo · {Math.round(computed.tachPerYear)} tach/yr</p>
            </div>
          </div>

          {/* ── Row 2: At TBO (Projected) ── */}
          <div className="border border-slate-200 rounded-lg p-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              At TBO · {interestRate}% int · {clForwardInflation}% IPC/yr
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-base font-bold text-red-700 font-mono">${formatCurrency(Math.round(computed.inflatedOverhaulCost))}</p>
                <p className="text-[9px] text-slate-400">Cost w/ inflation</p>
                <p className="text-[8px] text-red-400 font-mono">+${formatCurrency(Math.round(computed.inflationIncrease))}</p>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-emerald-700 font-mono">${formatCurrency(Math.round(computed.projectedFunds))}</p>
                <p className="text-[9px] text-slate-400">Funds w/ interest</p>
                <p className="text-[8px] text-emerald-500 font-mono">+${formatCurrency(Math.round(computed.interestEarned))}</p>
              </div>
              <div className="text-center">
                <p className={`text-base font-bold font-mono ${computed.projectedGap > 0 ? 'text-red-700' : 'text-emerald-700'}`}>${formatCurrency(Math.abs(Math.round(computed.projectedGap)))}</p>
                <p className="text-[9px] text-slate-400">{computed.projectedGap > 0 ? 'Gap' : 'Surplus'}</p>
                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${computed.projectedFunds >= computed.inflatedOverhaulCost ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (computed.projectedFunds / computed.inflatedOverhaulCost) * 100)}%` }} />
                </div>
                <p className="text-[8px] text-slate-400 font-mono mt-0.5">{((computed.projectedFunds / computed.inflatedOverhaulCost) * 100).toFixed(1)}% funded</p>
              </div>
              <div className="text-center bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-2 border border-blue-200">
                <p className="text-lg font-extrabold text-blue-700 font-mono">${formatCurrency(Math.round(computed.projectedMonthlyTarget))}</p>
                <p className="text-[9px] text-blue-600 font-bold">💰 Monthly Target</p>
                <p className="text-[8px] text-blue-400 font-mono">{Math.round(computed.monthsToOverhaul)} payments</p>
              </div>
            </div>
          </div>

          {/* ── Row 3: Cost Model (collapsible) ── */}
          <button
            onClick={() => setShowCostModel(!showCostModel)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Cost Model Detail
            </span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${showCostModel ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showCostModel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-200">
              {/* IPC Model */}
              <div className={`rounded-lg p-3 border ${computed.overhaulSource === 'ipc' ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">📋 IPC Chile (+{clInflationPct}%)</p>
                  {computed.overhaulSource === 'ipc' && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-amber-200 text-amber-800 rounded-full">WINNER</span>}
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Motor (Eagle Copters)</span>
                    <span className="font-mono text-slate-700">${formatCurrency(computed.motorTodayCLP)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Labor</span>
                    <span className="font-mono text-slate-700">${formatCurrency(computed.laborTodayCLP)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-amber-200">
                    <span className="text-slate-700 font-semibold">Total</span>
                    <span className="font-mono font-bold text-amber-800">${formatCurrency(overhaulCLP)}</span>
                  </div>
                  <p className="text-[9px] text-slate-400">Base ago 2022: ${formatCurrency(overhaulMotorCLP + overhaulLaborCLP)}</p>
                </div>
              </div>

              {/* Market Model */}
              <div className={`rounded-lg p-3 border ${computed.overhaulSource === 'market' ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                    🌐 Market
                  </p>
                  <div className="flex items-center gap-1">
                    <a
                      href="https://www.airpowerinc.com/renpl-rt8164"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-1.5 py-0.5 text-[8px] font-medium bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors"
                      title="Verificar precio en Air Power Inc"
                    >
                      Verificar ↗
                    </a>
                    {computed.overhaulSource === 'market' && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-blue-200 text-blue-800 rounded-full">WINNER</span>}
                  </div>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Motor FOB</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-[10px]">USD</span>
                      <input
                        type="text"
                        value={formatCurrency(engineMarketPriceUSD)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          if (raw) setEngineMarketPriceUSD(parseInt(raw));
                        }}
                        className="w-[80px] text-right font-mono text-slate-700 bg-transparent border-b border-dashed border-slate-300 hover:border-blue-400 focus:border-blue-500 focus:outline-none text-[11px] px-0 py-0"
                        title="Click para editar precio FOB"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Internación (×{computed.internacionRatio.toFixed(2)})</span>
                    <span className="font-mono text-slate-700">${formatCurrency(computed.internacionCostCLP)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Labor (IPC)</span>
                    <span className="font-mono text-slate-700">${formatCurrency(computed.laborTodayCLP)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-blue-200">
                    <span className="text-slate-700 font-semibold">Total</span>
                    <span className="font-mono font-bold text-blue-800">${formatCurrency(computed.marketReplacementCLP)}</span>
                  </div>
                  <p className="text-[9px] text-red-500 font-semibold">+{computed.motorPriceInflationPct.toFixed(1)}% vs 2022 ({computed.motorAnnualInflation.toFixed(1)}%/yr)</p>
                </div>
              </div>

              {/* IPC vs Market bar */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between text-[9px] mb-1">
                  <span className="text-amber-600 font-mono">${formatCurrency(overhaulCLP)}</span>
                  <span className="text-slate-400">
                    {computed.marketReplacementCLP > overhaulCLP
                      ? `Market +${(((computed.marketReplacementCLP / overhaulCLP) - 1) * 100).toFixed(0)}% over IPC`
                      : `IPC +${(((overhaulCLP / computed.marketReplacementCLP) - 1) * 100).toFixed(0)}% over Market`
                    }
                  </span>
                  <span className="text-blue-600 font-mono">${formatCurrency(computed.marketReplacementCLP)}</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-amber-400" style={{ width: `${(overhaulCLP / (overhaulCLP + computed.marketReplacementCLP)) * 100}%` }} />
                  <div className="bg-blue-400" style={{ width: `${(computed.marketReplacementCLP / (overhaulCLP + computed.marketReplacementCLP)) * 100}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== FUEL PRICE TREND ANALYSIS ===== */}
      {fuelPriceAnalysis && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">AVGAS Price Trend Analysis</h4>
                  <p className="text-[10px] text-slate-400">From {fuelPriceAnalysis.totalRecords} fuel records · CAGR {fuelPriceAnalysis.cagr.toFixed(1)}%/yr</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                LIVE DATA
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {/* Weighted Averages */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { price: fuelPriceAnalysis.avg3m, label: '3-month avg $/L', source: 'avg3m' },
                { price: fuelPriceAnalysis.avg6m, label: '6-month avg $/L', source: 'avg6m' },
                { price: fuelPriceAnalysis.avg12m, label: '12-month avg $/L', source: 'avg12m' },
              ].map(item => {
                const isWinner = avgasSource?.source === item.source;
                return (
                  <div key={item.source} className={`text-center p-3 rounded-lg ${isWinner ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50'}`}>
                    <p className={`text-lg font-bold font-mono ${isWinner ? 'text-amber-700' : 'text-slate-700'}`}>${formatCurrency(item.price)}</p>
                    <p className="text-[10px] text-slate-500">{item.label}</p>
                    {isWinner && <p className="text-[9px] text-emerald-600 font-bold">← Used in model (MAX)</p>}
                  </div>
                );
              })}
            </div>

            {/* Brent spot indicator (if available) */}
            {brentData && (
              <div className="mb-5 flex items-center gap-3 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200">
                <span className="text-lg">🛢️</span>
                <div className="text-xs text-slate-700">
                  <span className="font-semibold">Brent Spot:</span>{' '}
                  <span className="font-mono font-bold text-orange-700">US${brentData.currentBrentUSD.toFixed(1)}/bbl</span>
                  <span className="text-[10px] text-slate-400 ml-2">({brentData.source} · {brentData.totalWeeks} weeks of data)</span>
                </div>
              </div>
            )}

            {/* ===== BRENT → AVGAS PREDICTIVE INTELLIGENCE ===== */}
            {brentAvgasCorrelation && (
              <div className="mb-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-indigo-200/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧠</span>
                    <div>
                      <h5 className="text-xs font-bold text-indigo-800">Brent → AVGAS Predictive Intelligence</h5>
                      <p className="text-[9px] text-indigo-500">WLS (λ={brentAvgasCorrelation.lambda}, t½={brentAvgasCorrelation.halfLife}m) · {brentAvgasCorrelation.totalWeeks} weeks · Lag {brentAvgasCorrelation.bestLag}m · R²={brentAvgasCorrelation.bestR2.toFixed(3)}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    brentAvgasCorrelation.confidence >= 70 ? 'bg-emerald-100 text-emerald-700' :
                    brentAvgasCorrelation.confidence >= 40 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {brentAvgasCorrelation.confidence}% CONF
                  </span>
                </div>
                <div className="p-4">
                  {/* Forecasts Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="text-center p-2.5 bg-white/60 rounded-lg">
                      <p className="text-sm font-bold font-mono text-indigo-700">${formatCurrency(Math.round(brentAvgasCorrelation.impliedNowCLP))}</p>
                      <p className="text-[9px] text-slate-500">Implied Now $/L</p>
                      <p className="text-[8px] text-slate-400">from Brent regression</p>
                    </div>
                    <div className={`text-center p-2.5 rounded-lg ${avgasSource?.source === 'brentForecast3m' ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-white/60'}`}>
                      <p className="text-sm font-bold font-mono text-purple-700">${formatCurrency(Math.round(brentAvgasCorrelation.forecast3m))}</p>
                      <p className="text-[9px] text-slate-500">Forecast 3m $/L</p>
                      {avgasSource?.source === 'brentForecast3m' && <p className="text-[8px] text-emerald-600 font-bold">← MAX winner</p>}
                    </div>
                    <div className="text-center p-2.5 bg-white/60 rounded-lg">
                      <p className="text-sm font-bold font-mono text-purple-700">${formatCurrency(Math.round(brentAvgasCorrelation.forecast6m))}</p>
                      <p className="text-[9px] text-slate-500">Forecast 6m $/L</p>
                    </div>
                    <div className="text-center p-2.5 bg-white/60 rounded-lg">
                      <p className="text-sm font-bold font-mono text-slate-700">US${brentAvgasCorrelation.brent3m.toFixed(1)}</p>
                      <p className="text-[9px] text-slate-500">Brent 3m forecast</p>
                      <p className="text-[8px] text-slate-400">trend: {brentAvgasCorrelation.brentTrend > 0 ? '↑' : '↓'}{Math.abs(brentAvgasCorrelation.brentTrend).toFixed(2)}/wk</p>
                    </div>
                  </div>

                  {/* Model Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[10px] mb-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Best Lag</span>
                      <span className="font-mono font-bold text-indigo-700">{brentAvgasCorrelation.bestLag} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">R² (fit)</span>
                      <span className="font-mono font-bold text-indigo-700">{brentAvgasCorrelation.bestR2.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Paired months</span>
                      <span className="font-mono font-bold text-slate-700">{brentAvgasCorrelation.pairedMonths}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Effective N</span>
                      <span className="font-mono font-bold text-indigo-600">{brentAvgasCorrelation.effectiveN}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Slope (β)</span>
                      <span className="font-mono font-bold text-slate-700">{brentAvgasCorrelation.slope.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Intercept (α)</span>
                      <span className="font-mono font-bold text-slate-700">{formatCurrency(Math.round(brentAvgasCorrelation.intercept))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current FX</span>
                      <span className="font-mono font-bold text-slate-700">${formatCurrency(Math.round(brentAvgasCorrelation.currentFX))}</span>
                    </div>
                  </div>

                  {/* Advanced Analytics Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Volatility */}
                    <div className="p-2.5 bg-white/50 rounded-lg border border-slate-200/50">
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">📊 Volatility</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">8w σ (Brent)</span>
                          <span className="font-mono font-bold">${brentAvgasCorrelation.brentVolatility8w.toFixed(2)}/bbl</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Vol. adjustment</span>
                          <span className={`font-mono font-bold ${brentAvgasCorrelation.volatilityAdj > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                            {brentAvgasCorrelation.volatilityAdj > 0 ? '+' : ''}{brentAvgasCorrelation.volatilityAdj.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* FX Sensitivity */}
                    <div className="p-2.5 bg-white/50 rounded-lg border border-slate-200/50">
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">💱 FX Sensitivity</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">FX β (residual)</span>
                          <span className="font-mono font-bold">{brentAvgasCorrelation.fxBeta.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">FX deviation</span>
                          <span className={`font-mono font-bold ${brentAvgasCorrelation.fxDeviation > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {brentAvgasCorrelation.fxDeviation > 0 ? '+' : ''}{formatCurrency(Math.round(brentAvgasCorrelation.fxDeviation))} CLP
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Structural Break */}
                    <div className="p-2.5 bg-white/50 rounded-lg border border-slate-200/50">
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">🔬 Regime / Break</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Hard break</span>
                          <span className={`font-mono font-bold ${brentAvgasCorrelation.structuralBreak?.detected ? 'text-orange-600' : 'text-emerald-600'}`}>
                            {brentAvgasCorrelation.structuralBreak?.detected ? '⚠️ YES' : '✓ Stable'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Regime</span>
                          <span className="font-mono font-bold text-slate-600">
                            {brentAvgasCorrelation.structuralBreak?.detected ? 'Recent-only' : 'WLS-adapted'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lag Discovery Table */}
                  <div className="mt-3">
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Lag Discovery (0–6 months)</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {brentAvgasCorrelation.allLags.map((lag: { lag: number; r2: number; pairs: number }) => (
                        <div key={lag.lag} className={`flex-1 min-w-[52px] text-center p-1.5 rounded-lg ${lag.lag === brentAvgasCorrelation.bestLag ? 'bg-indigo-100 ring-1 ring-indigo-300' : 'bg-white/50'}`}>
                          <p className="text-[10px] font-bold text-slate-700">{lag.lag}m</p>
                          <p className={`text-[10px] font-mono font-bold ${lag.lag === brentAvgasCorrelation.bestLag ? 'text-indigo-700' : 'text-slate-500'}`}>
                            {lag.r2.toFixed(3)}
                          </p>
                          <p className="text-[8px] text-slate-400">{lag.pairs} pts</p>
                          {/* Visual R² bar */}
                          <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${lag.lag === brentAvgasCorrelation.bestLag ? 'bg-indigo-500' : 'bg-slate-400'}`} style={{ width: `${Math.max(lag.r2 * 100, 2)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* MAX Source Selection Indicator */}
                  {avgasSource?.breakdown && (
                    <div className="mt-3 px-3 py-2 bg-white/60 rounded-lg border border-indigo-100">
                      <p className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">AVGAS = MAX(signals) — Highest price wins</p>
                      <div className="flex gap-2 flex-wrap">
                        {avgasSource.breakdown.map((b: { source: string; label: string; price: number; isWinner: boolean }) => (
                          <span key={b.source} className={`px-2 py-0.5 rounded text-[9px] font-mono ${
                            b.isWinner
                              ? 'bg-amber-100 text-amber-800 font-bold ring-1 ring-amber-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {b.label}: ${formatCurrency(b.price)}
                            {b.isWinner && ' ✓'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Fuel Forecast Multi-Variable Chart ── */}
            <FuelForecastChart
              fuelPriceAnalysis={fuelPriceAnalysis}
              brentData={brentData}
              brentAvgasCorrelation={brentAvgasCorrelation}
              currentFX={usdRate}
              formatCurrency={formatCurrency}
            />
          </div>
        </div>
      )}

      {/* Yearly Hours from actual flights */}
      {yearlyHours.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700">Actual Yearly Hours (from flight records)</h4>
          </div>
          <div className="p-4 overflow-x-auto">
            <div className="flex gap-2 min-w-0">
              {yearlyHours.map(yh => (
                <div key={yh.year} className="flex-1 min-w-[60px] text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs font-bold text-slate-800">{yh.year}</p>
                  <p className="text-sm font-bold text-blue-700 font-mono">{yh.hours.toFixed(1)}</p>
                  <p className="text-[9px] text-slate-400">hrs</p>
                  <p className="text-[9px] text-slate-400 font-mono">{(yh.hours / 12).toFixed(1)}/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepositsTable({ depositsDetailsByCode, csvPilotNames }: { depositsDetailsByCode?: Record<string, { id?: number; fecha: string; descripcion: string; monto: number; source?: 'CSV' | 'DB' }[]>; csvPilotNames?: Record<string, string> }) {
  const [sortBy, setSortBy] = useState<"date" | "pilot" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">All Deposits</h3>
              <p className="text-xs text-slate-500">{allDeposits.length} records · Total: ${totalAmount.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${editMode ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
            >
              {editMode ? 'Done' : 'Edit'}
            </button>
            <a
              href="/admin/deposits"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-medium transition-colors"
            >
              Fix Deposit
            </a>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th
                className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition"
                onClick={() => toggleSort("date")}
              >
                Date {sortBy === "date" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
              <th
                className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition"
                onClick={() => toggleSort("pilot")}
              >
                Pilot {sortBy === "pilot" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
              <th className="px-3 sm:px-4 py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Description
              </th>
              <th
                className="px-3 sm:px-4 py-3 text-right text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition"
                onClick={() => toggleSort("amount")}
              >
                Amount {sortBy === "amount" && (sortOrder === "desc" ? "↓" : "↑")}
              </th>
              {editMode && (
                <th className="px-3 sm:px-4 py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allDeposits.map((d, idx) => (
              <tr key={d.id || idx} className="hover:bg-slate-50 transition">
                <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-slate-600">{d.fecha}</td>
                <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-800">
                  {d.pilotName}
                  <span className="ml-1.5 text-[10px] text-slate-400 font-normal">({d.code})</span>
                </td>
                <td className="px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-slate-600">{d.descripcion}</td>
                <td className="px-3 sm:px-4 py-2.5 text-right text-xs sm:text-sm text-emerald-600 font-semibold font-mono">
                  ${d.monto.toLocaleString('es-CL')}
                </td>
                {editMode && (
                  <td className="px-3 sm:px-4 py-2.5 text-center">
                    {d.source === 'DB' && d.id ? (
                      <button
                        onClick={() => handleDelete(d.id!, d.pilotName, d.monto)}
                        disabled={deletingId === d.id}
                        className="px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-[10px] sm:text-xs font-medium disabled:opacity-50 border border-red-200 transition-colors"
                      >
                        {deletingId === d.id ? '...' : 'Delete'}
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
