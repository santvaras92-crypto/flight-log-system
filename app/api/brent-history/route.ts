import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ──────────────────────────────────────────────────────────────
// Brent Crude Oil WEEKLY historical data + USD/CLP from online sources
// • EIA weekly: Brent spot prices since Sep 2020 (~288 weeks)
// • EIA daily:  month-to-date (MTD) average for the CURRENT month, because the
//               weekly series lags ~1 week and the latest month is often missing
// • Mindicador.cl: daily USD/CLP for each year 2020–present
// • Consolidates into weekly {week, brentUSD, usdCLP} array
// • Also aggregates to monthly for AVGAS correlation
// • Layered cache: in-memory (24h) + persistent DB (survives redeploys)
// • Uses EIA_API_KEY env if set, else falls back to the shared DEMO_KEY
// ──────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

// EIA API key. The shared DEMO_KEY is rate-limited to ~30 req/hour PER IP and is
// shared across everyone who uses it (on Railway that means a shared egress IP),
// so it frequently returns HTTP 429. Register a free key at
// https://www.eia.gov/opendata/register.php and set EIA_API_KEY to avoid this.
const EIA_KEY = process.env.EIA_API_KEY || "DEMO_KEY";

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
  partial?: boolean; // true = current-month estimate (MTD/spot), not a closed avg
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

// ── In-memory cache (fast, per-instance; wiped on every restart/redeploy) ──
let cached: Omit<BrentHistoryResponse, "fromCache"> | null = null;
let cachedAt = 0;                       // epoch ms when `cached` was fetched
let lastAttemptAt = 0;                   // epoch ms of the last upstream refetch
let lastAttemptOk = true;                // did the last upstream attempt succeed?
const CACHE_MS = 24 * 60 * 60 * 1000;    // data considered fresh for 24h
const FAIL_BACKOFF_MS = 30 * 60 * 1000;  // after a failed refetch, wait 30min before retrying
// AppCache row key for the persistent copy. Bumped to v2 to invalidate the old
// cached payload that had whole years (2022, 2025) of Brent missing — see the
// FX-decoupling fix in buildBrentHistory(). The old v1 row is simply ignored.
const PERSIST_KEY = "brent-history-v2";

// ── Persistent cache (DB, survives redeploys) — best-effort, never throws ──
// The in-memory cache above is lost on every Railway restart, so right after a
// redeploy the very first request must refetch — exactly when a DEMO_KEY 429 is
// most damaging. Persisting the last-good payload keeps the chart populated.
async function loadPersistentCache(): Promise<
  { data: Omit<BrentHistoryResponse, "fromCache">; fetchedAt: number } | null
> {
  try {
    const row = await prisma.appCache.findUnique({ where: { key: PERSIST_KEY } });
    if (!row) return null;
    const data = JSON.parse(row.value) as Omit<BrentHistoryResponse, "fromCache">;
    const fetchedAt = data?.fetchedAt
      ? new Date(data.fetchedAt).getTime()
      : row.updatedAt.getTime();
    return { data, fetchedAt };
  } catch {
    return null; // table missing (first deploy) or bad JSON → ignore gracefully
  }
}

async function savePersistentCache(
  data: Omit<BrentHistoryResponse, "fromCache">
): Promise<void> {
  try {
    const value = JSON.stringify(data);
    await prisma.appCache.upsert({
      where: { key: PERSIST_KEY },
      create: { key: PERSIST_KEY, value },
      update: { value },
    });
  } catch {
    // best-effort — persistent cache is optional, ignore write failures
  }
}

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
    `&api_key=${EIA_KEY}`;

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

// ── EIA Daily Brent Fetcher (recent window) ──
// Provides a month-to-date average for the current month, which the weekly
// series can't yet (it lags ~1 week). Best-effort: returns [] on any failure so
// the weekly aggregation — the authoritative base — keeps working regardless.
async function fetchEIADailyBrent(): Promise<{ period: string; value: number }[]> {
  const start = new Date();
  start.setDate(start.getDate() - 75); // ~2.5 months back comfortably covers the current month
  const startStr = start.toISOString().slice(0, 10);
  const url =
    "https://api.eia.gov/v2/petroleum/pri/spt/data/" +
    "?frequency=daily&data[0]=value" +
    "&facets[series][]=RBRTE" +
    `&start=${startStr}` +
    "&sort[0][column]=period&sort[0][direction]=desc" +
    "&offset=0&length=120" +
    `&api_key=${EIA_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.response?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((row: any) => ({ period: String(row.period), value: parseFloat(row.value) }))
      .filter((r: { period: string; value: number }) => r.value > 10);
  } catch {
    return [];
  }
}

// ── Mindicador.cl USD/CLP Daily Fetcher ──
// Fetches daily dólar observado for a given year. Returns map: "YYYY-MM-DD" → CLP value.
// Retries a few times: a transient failure here used to return an empty year-map,
// which (combined with the FX filter below) erased that ENTIRE year of Brent from
// the chart — showing up as a long straight line across the missing months.
async function fetchMindicadorYear(year: number): Promise<Map<string, number>> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const map = new Map<string, number>();
    try {
      const res = await fetch(`https://mindicador.cl/api/dolar/${year}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`mindicador ${year} HTTP ${res.status}`);
      const json = await res.json();
      const serie = json?.serie;
      if (!Array.isArray(serie) || serie.length === 0) throw new Error(`mindicador ${year} empty`);
      for (const entry of serie) {
        const val = parseFloat(entry.valor);
        if (!val || val < 100) continue;
        // fecha is ISO string like "2024-01-02T03:00:00.000Z"
        const d = new Date(entry.fecha);
        const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
        map.set(key, val);
      }
      return map; // success
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * attempt)); // 0.4s, 0.8s backoff
        continue;
      }
    }
  }
  return new Map<string, number>(); // give up after retries
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
      `https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=5&api_key=${EIA_KEY}`;
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

// ── Build the full Brent history payload from all upstream sources ──
async function buildBrentHistory(): Promise<Omit<BrentHistoryResponse, "fromCache">> {
  // Determine which years to fetch USD/CLP for
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2020; y <= currentYear; y++) years.push(y);

  // Fetch EIA weekly Brent + EIA daily (recent) + all years of USD/CLP in parallel
  const [eiaWeekly, eiaDaily, ...yearMaps] = await Promise.all([
    fetchEIAWeeklyBrent(),
    fetchEIADailyBrent(),
    ...years.map((y) => fetchMindicadorYear(y)),
  ]);

  // Merge all year maps into one big daily USD/CLP map
  const dailyUSDCLP = new Map<string, number>();
  yearMaps.forEach((m) => m.forEach((v, k) => dailyUSDCLP.set(k, v)));

  // Build weekly array pairing each EIA week with the closest USD/CLP.
  // IMPORTANT: Brent (USD/bbl) is the authoritative series and must NEVER be
  // dropped just because the CLP FX for that week is momentarily unavailable.
  // Previously a transient mindicador.cl failure for a year (empty FX map) made
  // findClosestUSDCLP return 0 for every week of that year, and `continue`
  // deleted the whole year of Brent — the chart then drew a straight line across
  // the gap (spanGaps). We now keep every Brent row and fill missing FX by
  // carrying the nearest known value forward, then backward.
  const weekly: WeeklyRow[] = eiaWeekly
    .slice()
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((row) => ({
      week: row.period,
      brentUSD: Math.round(row.value * 100) / 100,
      usdCLP: Math.round(findClosestUSDCLP(row.period, dailyUSDCLP)), // 0 if missing
    }));

  // Forward-fill missing FX (0) with the last known value…
  let lastFx = 0;
  for (const w of weekly) {
    if (w.usdCLP > 0) lastFx = w.usdCLP;
    else if (lastFx > 0) w.usdCLP = lastFx;
  }
  // …then backward-fill any leading weeks that had no prior FX yet.
  let nextFx = 0;
  for (let i = weekly.length - 1; i >= 0; i--) {
    if (weekly[i].usdCLP > 0) nextFx = weekly[i].usdCLP;
    else if (nextFx > 0) weekly[i].usdCLP = nextFx;
  }
  // Drop only weeks that STILL have no FX (i.e. FX totally unavailable for the
  // entire history — extremely unlikely). This keeps usdCLP averages sane.
  const weeklyFiltered = weekly.filter((w) => w.usdCLP > 0);
  weekly.length = 0;
  weekly.push(...weeklyFiltered);

  // Aggregate to monthly (closed months = average of that month's weeks)
  const monthly = aggregateToMonthly(weekly);
  const monthlyMap = new Map<string, MonthlyRow>(monthly.map((m) => [m.month, m]));

  // ── Current-month fill (fixes the "missing latest month" from EIA weekly lag) ──
  // EIA weekly data lags ~1 week, so the current month is often missing or thin.
  // Use EIA *daily* data to compute a month-to-date (MTD) average, which
  // converges to the final monthly average as the month progresses. This is far
  // more accurate than a single spot price (a spot can be ±US$15/bbl off the
  // monthly average). Only the CURRENT month is overridden — past months keep
  // their authoritative weekly average.
  const nowD = new Date();
  const curMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;

  const curMonthDaily = eiaDaily.filter((d) => d.period.slice(0, 7) === curMonth);
  const fxForCur =
    findClosestUSDCLP(`${curMonth}-15`, dailyUSDCLP) ||
    (weekly.length > 0 ? weekly[weekly.length - 1].usdCLP : 0);

  if (curMonthDaily.length > 0 && fxForCur > 0) {
    const avg = curMonthDaily.reduce((s, d) => s + d.value, 0) / curMonthDaily.length;
    monthlyMap.set(curMonth, {
      month: curMonth,
      brentUSD: Math.round(avg * 100) / 100,
      usdCLP: Math.round(fxForCur),
      weeks: monthlyMap.get(curMonth)?.weeks ?? 0,
      partial: true, // MTD estimate — not a closed monthly average
    });
  }

  // Live spot price (also the headline currentBrentUSD)
  const liveSpot = await fetchLiveBrentSpot();

  // Last-resort: if the current month is STILL missing (no weekly, no daily),
  // seed it with the live spot so the chart never drops the latest month.
  if (!monthlyMap.has(curMonth) && liveSpot && fxForCur > 0) {
    monthlyMap.set(curMonth, {
      month: curMonth,
      brentUSD: Math.round(liveSpot * 100) / 100,
      usdCLP: Math.round(fxForCur),
      weeks: 0,
      partial: true,
    });
  }

  // The current month is never "closed" — always flag it provisional so the
  // chart can render it distinctly (dashed segment + hollow point).
  const curRow = monthlyMap.get(curMonth);
  if (curRow) curRow.partial = true;

  const finalMonthly = Array.from(monthlyMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  const currentBrentUSD =
    liveSpot ?? (weekly.length > 0 ? weekly[weekly.length - 1].brentUSD : 70);

  const sourceInfo =
    `EIA weekly (${weekly.length}w) + daily MTD + mindicador.cl (${years.length}y)` +
    (EIA_KEY === "DEMO_KEY" ? " [DEMO_KEY]" : "");

  return {
    currentBrentUSD,
    weekly,
    monthly: finalMonthly,
    totalWeeks: weekly.length,
    source: sourceInfo,
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const now = Date.now();

  // 1. Fresh in-memory cache → serve immediately
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  // 2. Cold start (memory empty, e.g. right after a redeploy): hydrate from the
  //    persistent DB cache so we have a last-good copy before touching upstream.
  if (!cached) {
    const persisted = await loadPersistentCache();
    if (persisted) {
      cached = persisted.data;
      cachedAt = persisted.fetchedAt;
      if (now - cachedAt < CACHE_MS) {
        return NextResponse.json({ ...cached, fromCache: true });
      }
    }
  }

  // 3. Backoff: if the last upstream refetch failed recently, don't hammer the
  //    API (that only burns more quota → more 429s). Serve stale cache instead.
  if (cached && !lastAttemptOk && now - lastAttemptAt < FAIL_BACKOFF_MS) {
    return NextResponse.json({ ...cached, fromCache: true, stale: true });
  }

  // 4. Refetch from upstream
  lastAttemptAt = now;
  try {
    const fresh = await buildBrentHistory();
    cached = fresh;
    cachedAt = now;
    lastAttemptOk = true;
    await savePersistentCache(fresh); // best-effort persist for future cold starts
    return NextResponse.json({ ...fresh, fromCache: false });
  } catch (error: any) {
    lastAttemptOk = false;
    console.error("[brent-history] Error:", error?.message || error);
    // Serve stale cache (in-memory or DB-hydrated) if we have any
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true, stale: true });
    }
    return NextResponse.json(
      { error: "Failed to fetch Brent history", detail: error?.message },
      { status: 500 }
    );
  }
}
