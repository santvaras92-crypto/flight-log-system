"use client";

/**
 * Central icon system for the Flight Log app.
 *
 * Design language: "aviation shadcn, in color" — monochrome line icons
 * (lucide-react, 2px stroke, currentColor), color applied only with purpose
 * (indigo for brand/active, emerald/amber/red for airworthiness status). This
 * replaces the scattered emojis with a single, consistent, tree-shaken set.
 *
 * Usage:
 *   <Icon name="engine" />                     // 16px, inherits text color
 *   <Icon name="warning" className="w-5 h-5 text-amber-500" />
 *
 * Add a new concept by mapping a semantic name → a lucide icon in REGISTRY.
 * Always prefer a semantic name (e.g. "compliance") over the raw lucide name
 * so the meaning stays centralized and swappable.
 */
import {
  Plane, Cog, Fan, Bolt, CalendarClock, ScrollText, Wrench,
  Gauge, Sparkles, Droplet, Clock, Timer, Settings, Fuel,
  DollarSign, Banknote, Users, UserRound, Thermometer, Flame,
  BarChart3, TrendingUp, TrendingDown, Minus, ArrowRight, Calendar, MapPin,
  GraduationCap, StickyNote, FileText, Save, ClipboardList, Pencil, Trash2,
  Upload, FolderOpen, RefreshCw, Brain, FlaskConical, Globe,
  Lock, LogOut, Lightbulb, Plus, Check, CheckCircle2, X, TriangleAlert,
  Siren, Search, AlertCircle, Info, ChevronDown, ChevronRight, ExternalLink,
  Sun, Moon, Monitor,
  type LucideIcon,
} from "lucide-react";

/** Semantic name → lucide icon. Keep meanings centralized here. */
const REGISTRY = {
  // ── Domains / maintenance ──
  airframe: Plane,
  engine: Cog,
  propeller: Fan,
  components: Bolt,
  plan: CalendarClock,
  compliance: ScrollText,
  wrench: Wrench,
  gear: Settings,

  // ── Overview / KPIs ──
  gauge: Gauge,
  smart: Sparkles,
  oil: Droplet,
  clock: Clock,
  timer: Timer,
  fuel: Fuel,
  money: DollarSign,
  cash: Banknote,
  people: Users,
  pilot: UserRound,
  temperature: Thermometer,
  fire: Flame,
  chart: BarChart3,
  calendar: Calendar,
  location: MapPin,
  graduation: GraduationCap,

  // ── Trends ──
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  trendFlat: Minus,
  arrowRight: ArrowRight,

  // ── Documents / actions ──
  notes: StickyNote,
  document: FileText,
  clipboard: ClipboardList,
  save: Save,
  edit: Pencil,
  trash: Trash2,
  upload: Upload,
  folder: FolderOpen,
  refresh: RefreshCw,
  search: Search,
  plus: Plus,
  externalLink: ExternalLink,

  // ── Analysis / finance ──
  brain: Brain,
  lab: FlaskConical,
  globe: Globe,
  lightbulb: Lightbulb,

  // ── Status ──
  check: Check,
  checkCircle: CheckCircle2,
  close: X,
  warning: TriangleAlert,
  emergency: Siren,
  alert: AlertCircle,
  info: Info,

  // ── Auth / chrome ──
  lock: Lock,
  logout: LogOut,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,

  // ── Theme ──
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  /** Tailwind classes for size/color. Defaults to 16px, inherits text color. */
  className?: string;
  /** Stroke width. Defaults to 2 to match the app's line-icon language. */
  strokeWidth?: number;
  /** Accessible label; when omitted the icon is decorative (aria-hidden). */
  title?: string;
}

/**
 * Renders a consistent line icon by semantic name.
 * Decorative by default (aria-hidden) unless a `title` is provided.
 */
export function Icon({ name, className = "w-4 h-4", strokeWidth = 2, title }: IconProps) {
  const Cmp = REGISTRY[name];
  return (
    <Cmp
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
    />
  );
}

export default Icon;
