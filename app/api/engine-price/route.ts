import { NextResponse } from "next/server";

// Scrape current RENPL-RT8164 Lycoming Rebuilt O-320-D2J price from Air Power Inc
// Cached for 24 hours to avoid excessive requests
let cached: { price: number; core: number; total: number; fetchedAt: string; source: string } | null = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

const FALLBACK_PRICES = {
  price: 47415.0,
  core: 29500.0,
  total: 76915.0,
  fetchedAt: null as string | null,
  fallback: true,
};

export async function GET() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const res = await fetch(
      "https://www.airpowerinc.com/renpl-rt8164",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract "Your Price: $XX,XXX.XX"
    // The page shows: Your Price: $47,415.00
    const priceMatch = html.match(/Your Price:\s*\$([0-9,]+\.\d{2})/);
    const coreMatch = html.match(/Refundable Core Charge:\s*\$([0-9,]+\.\d{2})/);
    const totalMatch = html.match(/Your Price Plus Core:\s*\$([0-9,]+\.\d{2})/);

    const parsePrice = (m: RegExpMatchArray | null) =>
      m ? parseFloat(m[1].replace(/,/g, "")) : 0;

    const price = parsePrice(priceMatch);
    const core = parsePrice(coreMatch);
    const total = parsePrice(totalMatch);

    if (price > 0) {
      cached = {
        price,
        core,
        total,
        fetchedAt: new Date().toISOString(),
        source: 'airpowerinc.com (scraped)',
      };
      cachedAt = now;
      return NextResponse.json({ ...cached, fromCache: false });
    }

    // Fallback: return last known price if scraping fails to parse
    return NextResponse.json({
      ...FALLBACK_PRICES,
      fromCache: false,
      source: 'hardcoded (scrape failed)',
    });
  } catch (err: any) {
    // Return fallback on error
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true, error: err.message });
    }
    return NextResponse.json({
      ...FALLBACK_PRICES,
      fromCache: false,
      source: 'hardcoded (error)',
      error: err.message,
    });
  }
}
