import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Calculate cumulative US CPI inflation from a base month to present.
// Default: Sep 2022 (after Eagle Copters cotización Nº1475-2021).
// Source: BLS public API v2 — series CUUR0000SA0
//   (CPI-U, All Urban Consumers, U.S. City Average, All Items, Not Seasonally Adjusted)
// Used to inflate COMEX (flete + seguro + aduana) which are denominated in USD.

let cached: {
  cumulativePct: number;
  fromDate: string;
  toDate: string;
  months: number;
  annualizedPct: number;
  fetchedAt: string;
} | null = null;
let cachedAt = 0;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours (BLS updates monthly)

const FALLBACK_CUMULATIVE_PCT = 11.0; // approx Sep 2022 → mid 2026

export async function GET(request: Request) {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  const { searchParams } = new URL(request.url);
  const baseYear = parseInt(searchParams.get("baseYear") || "2022");
  const baseMonth = parseInt(searchParams.get("baseMonth") || "9"); // Sep 2022

  try {
    const currentYear = new Date().getFullYear();

    // BLS v2 public API — no key needed for 25 req/day (we cache 6h ≈ 4 req/day)
    const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesid: ["CUUR0000SA0"],
        startyear: String(baseYear),
        endyear: String(currentYear),
      }),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`BLS API ${res.status}`);
    const data = await res.json();
    const series = data?.Results?.series?.[0]?.data as
      | { year: string; period: string; value: string }[]
      | undefined;
    if (!series || series.length === 0) throw new Error("No series data");

    // Filter monthly entries (period = "M01".."M12"), discard annual averages "M13"
    const monthly = series
      .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period))
      .map((d) => ({
        year: parseInt(d.year),
        month: parseInt(d.period.slice(1)),
        value: parseFloat(d.value),
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month);

    // Base CPI = CPI of (baseYear, baseMonth)
    const baseEntry = monthly.find(
      (m) => m.year === baseYear && m.month === baseMonth
    );
    if (!baseEntry) throw new Error("Base month not found in BLS series");

    const lastEntry = monthly[monthly.length - 1];
    const cumulativePct =
      Math.round(((lastEntry.value / baseEntry.value) - 1) * 100 * 100) / 100;

    // Months between base and last
    const months =
      (lastEntry.year - baseEntry.year) * 12 + (lastEntry.month - baseEntry.month);
    const annualizedPct =
      months > 0
        ? Math.round(
            (Math.pow(lastEntry.value / baseEntry.value, 12 / months) - 1) *
              100 *
              100
          ) / 100
        : 0;

    const fromDate = `${baseYear}-${String(baseMonth).padStart(2, "0")}`;
    const toDate = `${lastEntry.year}-${String(lastEntry.month).padStart(2, "0")}`;

    const result = {
      cumulativePct,
      fromDate,
      toDate,
      months,
      annualizedPct,
      fetchedAt: new Date().toISOString(),
    };

    cached = result;
    cachedAt = now;

    return NextResponse.json({ ...result, fromCache: false });
  } catch (err: any) {
    console.error("Error fetching CPI USA:", err);
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true, error: err.message });
    }
    return NextResponse.json({
      cumulativePct: FALLBACK_CUMULATIVE_PCT,
      fromDate: `${baseYear}-${String(baseMonth).padStart(2, "0")}`,
      toDate: "fallback",
      months: 0,
      annualizedPct: 2.8,
      fetchedAt: new Date().toISOString(),
      error: err.message,
      fallback: true,
    });
  }
}
