import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────
// Brent Crude Oil WEEKLY historical data + USD/CLP from online sources
// • EIA API: weekly Brent spot prices since Sep 2020 (~288 weeks)
// • Mindicador.cl: daily USD/CLP for each year 2020–present
// • Consolidates into weekly {week, brentUSD, usdCLP} array
// • Also aggregates to monthly for AVGAS correlation
// • 24-hour in-memory cache (weekly data changes once/week)
// ──────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

// ── Types ──
interface WeeklyRow {
  week: string;      // "YYYY-MM-DD" (Friday of each week)
  brentUSD: number;  // USD per barrel
  usdCLP: number;    // CLP per USD (closest business day)
}
interface MonthlyRow {
  month: string;     // "YYYY-MM"
  brentUSD: number;  // Average of weekly values in that month
  usdCLP: number;    // Average of weekly values in that month
  weeks: number;     // Number of weekly data points
}
interface BrentHistoryResponse {
  currentBrentUSD: number;
  weekly: WeeklyRow[];
  monthly: MonthlyRow[];
  totalWeeks: number;
  source: string;
  fetchedAt: string;
  fromCache: boolean;
}

// ── In-memory cache ──
let cached: Omit<BrentHistoryResponse, "fromCache"> | null = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── EIA Weekly Brent Fetcher ──
// Uses DEMO_KEY (rate-limited but free). Fetches ALL weekly data since Sep 2020.
// EIA API returns max 5000 rows per request — ~288 weeks fits easily.
async function fetchEIAWeeklyBrent(): Promise<{ period: string; value: number }[]> {
  const url =
    "https://api.eia.gov/v2/petroleum/pri/spt/data/" +
    "?frequency=weekly&data[0]=value" +
    "&facets[series][]=RBRTE" +
    "&start=2020-09-01" +
    "&sort[0][column]=period&sort[0][direction]=asc" +
    "&offset=0&length=5000" +
    "&api_key=DEMO_KEY";

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`EIA API ${res.status}`);
  const json = await res.json();
  const data = json?.response?.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error("EIA: no data");

  return data
    .map((row: any) => ({
      period: String(row.period),
      value: parseFloat(row.value),
    }))
    .filter((r: { period: string; value: number }) => r.value > 10 && r.period >= "2020-09-01");
}

// ── Mindicador.cl USD/CLP Daily Fetcher ──
// Fetches daily dólar observado for a given year. Returns map: "YYYY-MM-DD" → CLP value.
async function fetchMindicadorYear(year: number): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(`https://mindicador.cl/api/dolar/${year}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return map;
    const json = await res.json();
    const serie = json?.serie;
    if (!Array.isArray(serie)) return map;
    for (const entry of serie) {
      const val = parseFloat(entry.valor);
      if (!val || val < 100) continue;
      // fecha is ISO string like "2024-01-02T03:00:00.000Z"
      const d = new Date(entry.fecha);
      const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
      map.set(key, val);
    }
  } catch {
    // Silent fail for individual years
  }
  return map;
}

// Find the closest USD/CLP value to a given date from the daily map
function findClosestUSDCLP(
  dateStr: string,
  dailyMap: Map<string, number>
): number {
  // Try exact date first
  const exact = dailyMap.get(dateStr);
  if (exact) return exact;

  // Search ±7 days
  const d = new Date(dateStr);
  for (let offset = 1; offset <= 7; offset++) {
    for (const dir of [-1, 1]) {
      const test = new Date(d.getTime() + dir * offset * 86400000);
      const key = test.toISOString().slice(0, 10);
      const val = dailyMap.get(key);
      if (val) return val;
    }
  }

  // Fallback: find any value in the same month
  const monthPrefix = dateStr.slice(0, 7);
  for (const [key, val] of dailyMap) {
    if (key.startsWith(monthPrefix)) return val;
  }

  return 0; // Will be filtered out
}

// ── Aggregate weekly → monthly ──
function aggregateToMonthly(weekly: WeeklyRow[]): MonthlyRow[] {
  const monthMap: Record<string, { brentSum: number; clpSum: number; count: number }> = {};
  for (const w of weekly) {
    const month = w.week.slice(0, 7); // "YYYY-MM"
    if (!monthMap[month]) monthMap[month] = { brentSum: 0, clpSum: 0, count: 0 };
    monthMap[month].brentSum += w.brentUSD;
    monthMap[month].clpSum += w.usdCLP;
    monthMap[month].count++;
  }
  return Object.entries(monthMap)
    .map(([month, d]) => ({
      month,
      brentUSD: Math.round((d.brentSum / d.count) * 100) / 100,
      usdCLP: Math.round(d.clpSum / d.count),
      weeks: d.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── Multi-source live Brent price fetcher (for currentBrentUSD) ──
async function fetchLiveBrentSpot(): Promise<number | null> {
  // Source 1: EIA daily (most recent)
  try {
    const url =
      "https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=5&api_key=DEMO_KEY";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      const data = json?.response?.data;
      if (Array.isArray(data)) {
        for (const row of data) {
          const val = parseFloat(row?.value);
          if (val > 10) return Math.round(val * 100) / 100;
        }
      }
    }
  } catch {}

  // Source 2: Yahoo Finance
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.ok) {
      const json = await res.json();
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 10) return Math.round(price * 100) / 100;
    }
  } catch {}

  // Source 3: Google Finance
  try {
    const res = await fetch("https://www.google.com/finance/quote/BZ=F:NYMEX", {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/data-last-price="([\d.]+)"/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 10) return Math.round(price * 100) / 100;
      }
    }
  } catch {}

  return null;
}

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    // Determine which years to fetch USD/CLP for
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = 2020; y <= currentYear; y++) years.push(y);

    // Fetch EIA weekly Brent + all years of USD/CLP in parallel
    const [eiaData, ...yearMaps] = await Promise.all([
      fetchEIAWeeklyBrent(),
      ...years.map((y) => fetchMindicadorYear(y)),
    ]);

    // Merge all year maps into one big daily USD/CLP map
    const dailyUSDCLP = new Map<string, number>();
    yearMaps.forEach((m) => m.forEach((v, k) => dailyUSDCLP.set(k, v)));

    // Build weekly array by pairing each EIA week with closest USD/CLP
    const weekly: WeeklyRow[] = [];
    for (const row of eiaData) {
      const usdCLP = findClosestUSDCLP(row.period, dailyUSDCLP);
      if (usdCLP <= 0) continue; // Skip if no FX data available
      weekly.push({
        week: row.period,
        brentUSD: Math.round(row.value * 100) / 100,
        usdCLP: Math.round(usdCLP),
      });
    }

    // Sort chronologically
    weekly.sort((a, b) => a.week.localeCompare(b.week));

    // Aggregate to monthly
    const monthly = aggregateToMonthly(weekly);

    // Get live spot price
    const liveSpot = await fetchLiveBrentSpot();
    const currentBrentUSD =
      liveSpot ?? (weekly.length > 0 ? weekly[weekly.length - 1].brentUSD : 70);

    const sourceInfo = `EIA weekly (${weekly.length} weeks) + mindicador.cl (${years.length} years)`;

    cached = {
      currentBrentUSD,
      weekly,
      monthly,
      totalWeeks: weekly.length,
      source: sourceInfo,
      fetchedAt: new Date().toISOString(),
    };
    cachedAt = now;

    return NextResponse.json({ ...cached, fromCache: false });
  } catch (error: any) {
    console.error("[brent-history] Error:", error?.message || error);
    // If we have stale cache, return it
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true, stale: true });
    }
    return NextResponse.json(
      { error: "Failed to fetch Brent history", detail: error?.message },
      { status: 500 }
    );
  }
}
