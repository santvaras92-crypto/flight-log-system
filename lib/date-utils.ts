/**
 * Timezone-safe date utilities.
 *
 * Problem: Dates stored as DateTime in PostgreSQL arrive on the client as ISO
 * strings (e.g. "2026-03-15T15:00:00.000Z"). Using `new Date(iso).toLocaleDateString()`
 * interprets them with the device's timezone, so changing the phone's timezone
 * shifts displayed dates by ±1 day.
 *
 * Solution: Extract the date portion (YYYY-MM-DD) from the ISO string and
 * construct a local Date with `new Date(y, m-1, d)` — which is timezone-agnostic.
 */

/**
 * Parse a date string (ISO or YYYY-MM-DD) into a timezone-safe local Date.
 * Always returns the calendar date that was originally stored, regardless of
 * the device's current timezone.
 */
export function parseLocalDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    // Already a Date object — extract the UTC date parts to avoid TZ shift
    return new Date(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate());
  }
  // Extract YYYY-MM-DD from the beginning of the string
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  // Fallback: try parsing as-is (shouldn't happen in practice)
  return new Date(dateStr);
}

/**
 * Format a date string in Chilean locale, timezone-safe.
 *
 * @param dateStr ISO string, YYYY-MM-DD, or Date object
 * @param options Intl.DateTimeFormatOptions (defaults to dd/mm/yyyy)
 * @returns Formatted date string in es-CL locale
 *
 * @example
 *   formatFecha("2026-03-15T15:00:00.000Z")
 *   // => "15-03-2026"  (regardless of device timezone)
 *
 *   formatFecha("2026-03-15T15:00:00.000Z", { day: 'numeric', month: 'short', year: 'numeric' })
 *   // => "15 mar 2026"
 */
export function formatFecha(
  dateStr: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!dateStr) return '-';
  try {
    const d = parseLocalDate(dateStr instanceof Date ? dateStr : String(dateStr));
    return d.toLocaleDateString('es-CL', options || { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '-';
  }
}

/**
 * Get today's date as YYYY-MM-DD string using local time (not UTC).
 * Use this instead of `new Date().toISOString().split('T')[0]` which
 * returns the UTC date and can be off by 1 day near midnight.
 */
export function todayLocalString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract YYYY-MM-DD from any date string/object, timezone-safe.
 * Useful for grouping, filtering, or passing to <input type="date">.
 */
export function toDateString(dateStr: string | Date): string {
  if (typeof dateStr === 'string') {
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (dateStr instanceof Date) {
    const y = dateStr.getUTCFullYear();
    const m = String(dateStr.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateStr.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(dateStr).slice(0, 10);
}

/**
 * Get the year from a date string/object, timezone-safe.
 */
export function getDateYear(dateStr: string | Date): number {
  return parseLocalDate(dateStr).getFullYear();
}

/**
 * Get the month (0-11) from a date string/object, timezone-safe.
 */
export function getDateMonth(dateStr: string | Date): number {
  return parseLocalDate(dateStr).getMonth();
}
