import { NextResponse } from "next/server";

// Fetch consensus forecast values for the econometric model
// Sources:
//   - Brent: EIA Short-Term Energy Outlook (STEO) — official US govt forecast
//   - USD/CLP: Current spot from mindicador.cl (neutral consensus for floating rate)
//   - US CPI: Fed median projection (hardcoded, updated ~quarterly)

// Cache for 24 hours
let cached: ConsensusData | null = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000;

interface ConsensusData {
  brentForecastUSD: number;
  brentSource: string;
  brentDetail: { year: string; value: number }[];
  usdclpForecast: number;
  usdclpSource: string;
  usInflation: number;
  inflationSource: string;
  fetchedAt: string;
}

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  const results: ConsensusData = {
    brentForecastUSD: 68, // fallback
    brentSource: "fallback",
    brentDetail: [],
    usdclpForecast: 900, // fallback
    usdclpSource: "fallback",
    usInflation: 2.5,
    inflationSource: "Fed median (manual)",
    fetchedAt: new Date().toISOString(),
  };

  // === 1. Brent Forecast from EIA STEO ===
  try {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const eiaUrl = new URL("https://api.eia.gov/v2/steo/data/");
    eiaUrl.searchParams.set("api_key", "DEMO_KEY");
    eiaUrl.searchParams.set("frequency", "annual");
    eiaUrl.searchParams.set("data[0]", "value");
    eiaUrl.searchParams.set("facets[seriesId][]", "BREPUUS");
    eiaUrl.searchParams.set("sort[0][column]", "period");
    eiaUrl.searchParams.set("sort[0][direction]", "desc");
    eiaUrl.searchParams.set("length", "5");

    const eiaRes = await fetch(eiaUrl.toString(), { cache: "no-store" });
    if (eiaRes.ok) {
      const eiaJson = await eiaRes.json();
      const data = eiaJson?.response?.data;
      if (Array.isArray(data) && data.length > 0) {
        // Build yearly detail
        results.brentDetail = data
          .filter((d: any) => Number(d.period) >= currentYear)
          .map((d: any) => ({ year: d.period, value: Math.round(Number(d.value) * 10) / 10 }))
          .sort((a: any, b: any) => Number(a.year) - Number(b.year));

        // Use next year's forecast as the primary consensus (long-term planning)
        const nextYearData = data.find((d: any) => d.period === String(nextYear));
        const currentYearData = data.find((d: any) => d.period === String(currentYear));
        // Prefer next year's forecast for forward-looking model
        const bestForecast = nextYearData || currentYearData || data[0];
        if (bestForecast) {
          results.brentForecastUSD = Math.round(Number(bestForecast.value) * 10) / 10;
          results.brentSource = `EIA STEO ${bestForecast.period}`;
        }
      }
    }
  } catch (e) {
    console.error("[consensus] EIA STEO error:", e);
  }

  // === 2. USD/CLP from mindicador.cl (current spot as neutral consensus) ===
  try {
    const res = await fetch("https://mindicador.cl/api/dolar", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      const latest = json?.serie?.[0]?.valor;
      if (latest && latest > 0) {
        // Round to nearest 10 for a "consensus" feel (e.g., 922 → 920)
        results.usdclpForecast = Math.round(latest / 10) * 10;
        results.usdclpSource = "mindicador.cl spot (neutral)";
      }
    }
  } catch (e) {
    console.error("[consensus] mindicador error:", e);
  }

  // === 3. US CPI — Fed median projection ===
  // Updated manually from Fed Summary of Economic Projections (SEP)
  // Last update: March 2026 — Fed projects 2.4% core PCE → ~2.5% CPI
  results.usInflation = 2.5;
  results.inflationSource = "Fed SEP median (Mar 2026)";

  // Cache result
  cached = results;
  cachedAt = now;

  return NextResponse.json({ ...results, fromCache: false });
}
