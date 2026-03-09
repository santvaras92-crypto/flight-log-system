import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────
// Brent Crude Oil  ↔  AVGAS fuel-price correlation endpoint
// • Hard-coded monthly averages (Sep 2020 → Mar 2026) computed
//   from EIA daily spot data + Banco Central USD/CLP series
// • Live Brent: EIA API v2 (official spot) → EIA HTML → hard-coded fallback
// • 24-hour in-memory cache, same pattern as /api/engine-price
// ──────────────────────────────────────────────────────────────

// Monthly Brent USD/bbl averages (source: EIA RBRTE daily → monthly mean)
// Monthly USD → CLP averages (source: Banco Central de Chile / mindicador.cl)
// Each row: { month: "YYYY-MM", brentUSD, usdCLP }
const MONTHLY_DATA: { month: string; brentUSD: number; usdCLP: number }[] = [
  // 2020
  { month: "2020-09", brentUSD: 40.9,  usdCLP: 776 },
  { month: "2020-10", brentUSD: 40.2,  usdCLP: 790 },
  { month: "2020-11", brentUSD: 43.2,  usdCLP: 769 },
  { month: "2020-12", brentUSD: 49.9,  usdCLP: 729 },
  // 2021
  { month: "2021-01", brentUSD: 54.8,  usdCLP: 727 },
  { month: "2021-02", brentUSD: 62.3,  usdCLP: 726 },
  { month: "2021-03", brentUSD: 65.2,  usdCLP: 724 },
  { month: "2021-04", brentUSD: 64.3,  usdCLP: 710 },
  { month: "2021-05", brentUSD: 68.5,  usdCLP: 711 },
  { month: "2021-06", brentUSD: 73.5,  usdCLP: 726 },
  { month: "2021-07", brentUSD: 74.9,  usdCLP: 755 },
  { month: "2021-08", brentUSD: 70.3,  usdCLP: 774 },
  { month: "2021-09", brentUSD: 74.9,  usdCLP: 787 },
  { month: "2021-10", brentUSD: 83.5,  usdCLP: 812 },
  { month: "2021-11", brentUSD: 80.8,  usdCLP: 831 },
  { month: "2021-12", brentUSD: 74.2,  usdCLP: 855 },
  // 2022
  { month: "2022-01", brentUSD: 86.5,  usdCLP: 823 },
  { month: "2022-02", brentUSD: 97.1,  usdCLP: 808 },
  { month: "2022-03", brentUSD: 117.3, usdCLP: 802 },
  { month: "2022-04", brentUSD: 104.6, usdCLP: 842 },
  { month: "2022-05", brentUSD: 113.2, usdCLP: 862 },
  { month: "2022-06", brentUSD: 122.7, usdCLP: 893 },
  { month: "2022-07", brentUSD: 110.0, usdCLP: 938 },
  { month: "2022-08", brentUSD: 99.6,  usdCLP: 903 },
  { month: "2022-09", brentUSD: 89.8,  usdCLP: 938 },
  { month: "2022-10", brentUSD: 93.6,  usdCLP: 958 },
  { month: "2022-11", brentUSD: 90.5,  usdCLP: 925 },
  { month: "2022-12", brentUSD: 80.9,  usdCLP: 872 },
  // 2023
  { month: "2023-01", brentUSD: 83.0,  usdCLP: 828 },
  { month: "2023-02", brentUSD: 83.7,  usdCLP: 806 },
  { month: "2023-03", brentUSD: 78.5,  usdCLP: 805 },
  { month: "2023-04", brentUSD: 84.7,  usdCLP: 801 },
  { month: "2023-05", brentUSD: 75.6,  usdCLP: 805 },
  { month: "2023-06", brentUSD: 74.7,  usdCLP: 800 },
  { month: "2023-07", brentUSD: 80.1,  usdCLP: 827 },
  { month: "2023-08", brentUSD: 86.2,  usdCLP: 866 },
  { month: "2023-09", brentUSD: 93.3,  usdCLP: 886 },
  { month: "2023-10", brentUSD: 90.1,  usdCLP: 918 },
  { month: "2023-11", brentUSD: 81.4,  usdCLP: 891 },
  { month: "2023-12", brentUSD: 77.5,  usdCLP: 878 },
  // 2024
  { month: "2024-01", brentUSD: 80.2,  usdCLP: 929 },
  { month: "2024-02", brentUSD: 83.6,  usdCLP: 964 },
  { month: "2024-03", brentUSD: 85.4,  usdCLP: 971 },
  { month: "2024-04", brentUSD: 89.8,  usdCLP: 960 },
  { month: "2024-05", brentUSD: 81.3,  usdCLP: 920 },
  { month: "2024-06", brentUSD: 82.6,  usdCLP: 942 },
  { month: "2024-07", brentUSD: 85.0,  usdCLP: 942 },
  { month: "2024-08", brentUSD: 80.4,  usdCLP: 940 },
  { month: "2024-09", brentUSD: 73.9,  usdCLP: 922 },
  { month: "2024-10", brentUSD: 74.7,  usdCLP: 942 },
  { month: "2024-11", brentUSD: 73.8,  usdCLP: 972 },
  { month: "2024-12", brentUSD: 73.8,  usdCLP: 985 },
  // 2025
  { month: "2025-01", brentUSD: 79.4,  usdCLP: 998 },
  { month: "2025-02", brentUSD: 75.4,  usdCLP: 946 },
  { month: "2025-03", brentUSD: 72.5,  usdCLP: 935 },
  { month: "2025-04", brentUSD: 66.6,  usdCLP: 943 },
  { month: "2025-05", brentUSD: 64.6,  usdCLP: 937 },
  { month: "2025-06", brentUSD: 71.2,  usdCLP: 930 },
  { month: "2025-07", brentUSD: 71.0,  usdCLP: 935 },
  { month: "2025-08", brentUSD: 67.5,  usdCLP: 940 },
  { month: "2025-09", brentUSD: 67.8,  usdCLP: 935 },
  { month: "2025-10", brentUSD: 63.5,  usdCLP: 942 },
  { month: "2025-11", brentUSD: 63.6,  usdCLP: 970 },
  { month: "2025-12", brentUSD: 62.4,  usdCLP: 985 },
  // 2026
  { month: "2026-01", brentUSD: 65.8,  usdCLP: 979 },
  { month: "2026-02", brentUSD: 71.0,  usdCLP: 966 },
  { month: "2026-03", brentUSD: 77.2,  usdCLP: 955 },
];

// ── In-memory cache ──
let cached: {
  currentBrentUSD: number;
  monthly: typeof MONTHLY_DATA;
  fetchedAt: string;
  source: string;
} | null = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Multi-source live Brent price fetcher ──
// Priority: EIA API v2 (official spot) → EIA HTML → hard-coded
async function scrapeLiveBrent(): Promise<{ price: number; source: string } | null> {
  // ── Source 1: EIA API v2 JSON (official spot, 1-3 day delay) ──
  try {
    const url =
      "https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=1&api_key=DEMO_KEY";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      const val = json?.response?.data?.[0]?.value;
      if (val) {
        const price = parseFloat(val);
        if (price > 10) {
          return { price: Math.round(price * 100) / 100, source: "eia.gov API v2 (spot)" };
        }
      }
    }
  } catch { /* fall through to next source */ }

  // ── Source 2: EIA HTML scrape (legacy fallback) ──
  try {
    const res = await fetch(
      "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.ok) {
      const html = await res.text();
      const brentIdx = html.indexOf("Brent - Europe");
      if (brentIdx !== -1) {
        const chunk = html.substring(brentIdx, brentIdx + 1500);
        const prices: number[] = [];
        const regex = /<td[^>]*>\s*(\d{2,3}\.\d{2})\s*<\/td>/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(chunk)) !== null) {
          prices.push(parseFloat(m[1]));
        }
        if (prices.length > 0) {
          return { price: prices[prices.length - 1], source: "eia.gov (HTML scrape)" };
        }
      }
    }
  } catch { /* all sources exhausted */ }

  return null;
}

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  // Attempt live fetch from multiple sources (Yahoo → EIA API → EIA HTML)
  const liveResult = await scrapeLiveBrent();

  // Fallback to most recent hard-coded value
  const lastHC = MONTHLY_DATA[MONTHLY_DATA.length - 1];
  const currentBrentUSD = liveResult ? liveResult.price : lastHC.brentUSD;

  cached = {
    currentBrentUSD,
    monthly: MONTHLY_DATA,
    fetchedAt: new Date().toISOString(),
    source: liveResult ? liveResult.source : "hard-coded (fallback)",
  };
  cachedAt = now;

  return NextResponse.json({ ...cached, fromCache: false });
}
