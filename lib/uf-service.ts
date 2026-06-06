// UF Service - Fetches daily UF value from mindicador.cl API
// UF (Unidad de Fomento) is a Chilean inflation-indexed unit of account

interface MindicadorResponse {
  version: string;
  autor: string;
  codigo: string;
  nombre: string;
  unidad_medida: string;
  serie: Array<{
    fecha: string;
    valor: number;
  }>;
}

interface UFData {
  valor: number;
  fecha: string;
  fetchedAt: number;
}

// Cache UF value for 1 hour (in milliseconds)
const CACHE_DURATION = 60 * 60 * 1000;

let cachedUF: UFData | null = null;

/**
 * Fetch current UF value from mindicador.cl
 * Uses caching to avoid excessive API calls
 */
export async function getUFValue(): Promise<{ valor: number; fecha: string }> {
  // Return cached value if still valid
  if (cachedUF && Date.now() - cachedUF.fetchedAt < CACHE_DURATION) {
    return { valor: cachedUF.valor, fecha: cachedUF.fecha };
  }

  try {
    const response = await fetch('https://mindicador.cl/api/uf', {
      next: { revalidate: 3600 }, // Next.js cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch UF: ${response.status}`);
    }

    const data: MindicadorResponse = await response.json();

    if (!data.serie || data.serie.length === 0) {
      throw new Error('No UF data available');
    }

    // Get the most recent value (first in the series)
    const latestUF = data.serie[0];

    // Update cache
    cachedUF = {
      valor: latestUF.valor,
      fecha: latestUF.fecha,
      fetchedAt: Date.now(),
    };

    return { valor: latestUF.valor, fecha: latestUF.fecha };
  } catch (error) {
    console.error('Error fetching UF:', error);

    // Return cached value even if expired, as fallback
    if (cachedUF) {
      console.warn('Using expired UF cache as fallback');
      return { valor: cachedUF.valor, fecha: cachedUF.fecha };
    }

    // Last resort fallback - approximate UF value (should rarely happen)
    console.warn('Using fallback UF value');
    return { valor: 38500, fecha: new Date().toISOString() };
  }
}

// Cache UF values per specific calendar date (key "DD-MM-YYYY").
// A past date's UF never changes, so this cache is safe to keep for the
// lifetime of the server process.
const dateCache = new Map<string, { valor: number; fecha: string }>();

/**
 * Fetch the UF value for a SPECIFIC calendar date from mindicador.cl.
 *
 * Why: a flight must be charged with the UF of the day it was FLOWN, not the
 * day it happens to be approved. Using the latest UF (getUFValue) caused two
 * flights from different days to be billed with the same UF.
 *
 * @param date - The flight date (Date or ISO / YYYY-MM-DD string).
 * @returns The UF value for that date. If the date has no published value
 *          (weekend, holiday, or a future date), falls back to the latest UF.
 */
export async function getUFValueForDate(
  date: Date | string,
): Promise<{ valor: number; fecha: string }> {
  // Extract the calendar date. Flights are anchored at noon, and the app
  // formats dates from their UTC parts (see lib/date-utils.ts), so we do the
  // same here to stay consistent regardless of server timezone.
  const d = new Date(date);
  if (isNaN(d.getTime())) return getUFValue();

  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const key = `${dd}-${mm}-${yyyy}`;

  const cached = dateCache.get(key);
  if (cached) return cached;

  try {
    const response = await fetch(`https://mindicador.cl/api/uf/${key}`, {
      next: { revalidate: 86400 }, // 1 day — past UF values are immutable
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch UF for ${key}: ${response.status}`);
    }

    const data: MindicadorResponse = await response.json();

    // No value published for that exact date → use the latest available UF.
    if (!data.serie || data.serie.length === 0) {
      return getUFValue();
    }

    const uf = { valor: data.serie[0].valor, fecha: data.serie[0].fecha };
    dateCache.set(key, uf);
    return uf;
  } catch (error) {
    console.error(`Error fetching UF for ${key}:`, error);
    // Fall back to the latest UF so approval never blocks.
    return getUFValue();
  }
}

/**
 * Calculate flight cost based on UF
 * @param ufMultiplier - Number of UF per hour (default 4.5)
 * @param ufValue - Current UF value in CLP
 * @returns Rate per hour in CLP
 */
export function calculateUFRate(ufMultiplier: number = 4.5, ufValue: number): number {
  return Math.round(ufMultiplier * ufValue);
}

/**
 * Format UF value for display (Chilean format)
 */
export function formatUF(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format CLP amount for display
 */
export function formatCLP(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
