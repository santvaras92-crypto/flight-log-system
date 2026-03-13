import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 86400; // 24 hours — IPC updates monthly

// Calculate cumulative IPC inflation from a base month to present
// Default: Aug 2022 (Eagle Copters overhaul invoice date)
// Source: mindicador.cl — official Chilean IPC data

let cached: {
  cumulativePct: number;
  fromDate: string;
  toDate: string;
  months: number;
  annualizedPct: number;
  fetchedAt: string;
} | null = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: Request) {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  // Base date: overhaul invoice is Aug 2022, so we accumulate from Sep 2022 onward
  const { searchParams } = new URL(request.url);
  const baseYear = parseInt(searchParams.get("baseYear") || "2022");
  const baseMonth = parseInt(searchParams.get("baseMonth") || "8"); // Aug 2022

  try {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = baseYear; y <= currentYear; y++) {
      years.push(y);
    }

    // Fetch all years in parallel from mindicador.cl
    const responses = await Promise.all(
      years.map((y) =>
        fetch(`https://mindicador.cl/api/ipc/${y}`, {
          cache: 'no-store',
        }).then((res) => (res.ok ? res.json() : null))
      )
    );

    // Collect all monthly IPC variations sorted chronologically
    const allMonths: { fecha: string; valor: number }[] = [];
    for (const data of responses) {
      if (!data?.serie) continue;
      for (const entry of data.serie) {
        allMonths.push({ fecha: entry.fecha, valor: entry.valor });
      }
    }

    // Sort chronologically (mindicador returns newest first)
    allMonths.sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );

    // Filter: only months AFTER baseYear-baseMonth
    // e.g., base Aug 2022 → start accumulating from Sep 2022
    const baseDate = new Date(baseYear, baseMonth - 1, 1); // Month is 0-indexed in JS
    const relevantMonths = allMonths.filter(
      (m) => new Date(m.fecha) > baseDate
    );

    if (relevantMonths.length === 0) {
      return NextResponse.json({
        cumulativePct: 0,
        fromDate: `${baseYear}-${String(baseMonth).padStart(2, "0")}`,
        toDate: "N/A",
        months: 0,
        annualizedPct: 0,
        fetchedAt: new Date().toISOString(),
        error: "No IPC data found after base date",
      });
    }

    // Calculate cumulative inflation: multiply (1 + pct/100) for each month
    let cumulative = 1;
    for (const m of relevantMonths) {
      cumulative *= 1 + m.valor / 100;
    }

    const cumulativePct =
      Math.round((cumulative - 1) * 100 * 100) / 100; // 2 decimal places
    const months = relevantMonths.length;
    const annualizedPct =
      Math.round(
        (Math.pow(cumulative, 12 / months) - 1) * 100 * 100
      ) / 100;

    const lastMonth = relevantMonths[relevantMonths.length - 1];
    const lastDate = new Date(lastMonth.fecha);
    const toDate = `${lastDate.getFullYear()}-${String(
      lastDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const result = {
      cumulativePct,
      fromDate: `${baseYear}-${String(baseMonth).padStart(2, "0")}`,
      toDate,
      months,
      annualizedPct,
      fetchedAt: new Date().toISOString(),
    };

    cached = result;
    cachedAt = now;

    return NextResponse.json({ ...result, fromCache: false });
  } catch (err: any) {
    console.error("Error fetching IPC Chile:", err);
    // Return fallback
    if (cached) {
      return NextResponse.json({
        ...cached,
        fromCache: true,
        error: err.message,
      });
    }
    return NextResponse.json(
      {
        cumulativePct: 16.35, // Last known hardcoded value
        fromDate: `${baseYear}-${String(baseMonth).padStart(2, "0")}`,
        toDate: "2025-12",
        months: 40,
        annualizedPct: 4.6,
        fetchedAt: null,
        fallback: true,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
