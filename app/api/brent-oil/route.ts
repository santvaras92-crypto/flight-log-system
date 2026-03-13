import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────
// Brent Crude Oil SPOT price only (lightweight, 6h cache)
// For full weekly/monthly historical data → /api/brent-history
// ──────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

let cachedSpot: { price: number; source: string; fetchedAt: string } | null = null;
let cachedSpotAt = 0;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchLiveBrent(): Promise<{ price: number; source: string } | null> {
  // Source 1: EIA daily
  try {
    const url =
      "https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=5&api_key=DEMO_KEY";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      const data = json?.response?.data;
      if (Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          const val = parseFloat(row?.value);
          if (val > 10) return { price: Math.round(val * 100) / 100, source: `eia.gov (${row.period})` };
        }
      }
    }
  } catch {}

  // Source 2: Yahoo Finance
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 10) return { price: Math.round(price * 100) / 100, source: "Yahoo Finance (BZ=F)" };
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
        if (price > 10) return { price: Math.round(price * 100) / 100, source: "Google Finance" };
      }
    }
  } catch {}

  return null;
}

export async function GET() {
  const now = Date.now();
  if (cachedSpot && now - cachedSpotAt < CACHE_MS) {
    return NextResponse.json({ ...cachedSpot, fromCache: true });
  }

  const result = await fetchLiveBrent();
  const price = result?.price ?? 70;
  const source = result?.source ?? "fallback";

  cachedSpot = { price, source, fetchedAt: new Date().toISOString() };
  cachedSpotAt = now;

  return NextResponse.json({ ...cachedSpot, fromCache: false });
}
