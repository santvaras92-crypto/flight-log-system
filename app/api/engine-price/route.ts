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
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
        },
        cache: 'no-store', // bypass Next.js fetch cache — we handle our own 24h cache
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Strategy 1: Extract from HTML span elements (multi-line safe with [\s\S])
    const priceMatch = html.match(/id="user-price-\d+"[^>]*>[\s\S]*?\$([0-9,]+\.\d{2})/);
    const coreMatch = html.match(/id="core-charge-\d+"[^>]*>[\s\S]*?\$([0-9,]+\.\d{2})/);
    const totalMatch = html.match(/id="price-value-\d+"[^>]*>[\s\S]*?\$([0-9,]+\.\d{2})/);

    // Strategy 2: Try legacy format (label + value on same line)
    const priceMatchLegacy = priceMatch || html.match(/Your Price:\s*\$([0-9,]+\.\d{2})/);
    const coreMatchLegacy = coreMatch || html.match(/Refundable Core Charge:\s*\$([0-9,]+\.\d{2})/);
    const totalMatchLegacy = totalMatch || html.match(/Your Price Plus Core:\s*\$([0-9,]+\.\d{2})/);

    const parsePrice = (m: RegExpMatchArray | null) =>
      m ? parseFloat(m[1].replace(/,/g, "")) : 0;

    let price = parsePrice(priceMatchLegacy);
    let core = parsePrice(coreMatchLegacy);
    let total = parsePrice(totalMatchLegacy);

    // Strategy 3: Extract from JSON-LD structured data as fallback
    if (price === 0) {
      const jsonLdMatch = html.match(/"price"\s*:\s*"([0-9.]+)"/);
      if (jsonLdMatch) {
        const jsonLdTotal = parseFloat(jsonLdMatch[1]);
        if (jsonLdTotal > 0) {
          // JSON-LD contains total (price + core). Estimate split based on known ratio.
          total = jsonLdTotal;
          // Known ratio: core ≈ 38.3% of total ($29,500 / $76,915)
          core = Math.round(jsonLdTotal * 0.383);
          price = Math.round(jsonLdTotal - core);
        }
      }
    }

    // Strategy 4: Extract from meta itemprop="price"
    if (price === 0) {
      const metaMatch = html.match(/itemprop="price"\s+content="([0-9.]+)"/);
      if (metaMatch) {
        const metaTotal = parseFloat(metaMatch[1]);
        if (metaTotal > 0) {
          total = metaTotal;
          core = Math.round(metaTotal * 0.383);
          price = Math.round(metaTotal - core);
        }
      }
    }

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
