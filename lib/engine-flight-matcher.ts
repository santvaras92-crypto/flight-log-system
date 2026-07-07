/**
 * engine-flight-matcher.ts
 * ========================
 * Deterministic, order-preserving matcher between EngineMonitorFlight records
 * (real JPI engine logs, with true takeoff timestamps) and Flight logs (pilot
 * entries, with monotonic hobbs meter readings).
 *
 * Why this exists:
 *   The legacy auto-linker matched each engine record independently by
 *   date + duration only. When two flights happen the same day with similar
 *   durations (e.g. two pilots, similar leg lengths) it could CROSS them —
 *   assigning pilot A's engine track to pilot B's flight log.
 *
 * Core insight — both sides are monotonic in time:
 *   - Engine records have real takeoff timestamps (flightDate). Sorting them
 *     ascending gives the true chronological order of the day's flights.
 *   - The hobbs meter only ever increases. Sorting Flight logs by hobbs_inicio
 *     ascending gives the SAME chronological order.
 *   Therefore the i-th engine of the day corresponds to the i-th flight of the
 *   day. We assign in order and the crossing bug becomes impossible.
 *
 * Multi-tramo (1 Flight = N engine legs) is handled by greedily grouping
 * consecutive engine records whose summed duration ≈ the flight's diff_hobbs.
 */

export const MIN_DURATION_SEC = 300; // 5 min — shorter records are starts/taxis
export const DURATION_TOLERANCE_H = 0.5; // hobbs vs engine-hours match window

export interface EngineLeg {
  id: number;
  flightDate: Date | string;
  durationSec: number;
}

export interface FlightLog {
  id: number;
  hobbsInicio: number | null;
  diffHobbs: number | null;
}

export interface Assignment {
  engineId: number;
  /** Proposed Flight.id this engine should link to, or null if it can't be matched. */
  proposedFlightId: number | null;
  /** Human-readable reason for the assignment (for dry-run auditing). */
  reason: string;
}

/** Format any date as a local Chile calendar date string "YYYY-MM-DD". */
export function localChileDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}

/**
 * Compute the correct engine→flight assignments for a single calendar day.
 *
 * @param engines  All flyable engine legs of the day (will be sorted chronologically here).
 * @param flights  All Flight logs of the day (will be sorted by hobbs_inicio here).
 * @returns        One Assignment per engine leg.
 */
export function computeDayAssignments(
  engines: EngineLeg[],
  flights: FlightLog[],
): Assignment[] {
  // Sort engines chronologically by real takeoff timestamp.
  const sortedEngines = [...engines].sort(
    (a, b) => new Date(a.flightDate).getTime() - new Date(b.flightDate).getTime(),
  );

  // Sort flights chronologically by hobbs meter (monotonic increasing).
  // Flights without a hobbs reading sink to the end (least reliable order).
  const sortedFlights = [...flights].sort((a, b) => {
    const ha = a.hobbsInicio ?? Number.POSITIVE_INFINITY;
    const hb = b.hobbsInicio ?? Number.POSITIVE_INFINITY;
    return ha - hb;
  });

  // ── Optimal assignment via dynamic programming ────────────────────────
  // Both sides are chronologically ordered (engine legs by takeoff time, flight
  // logs by monotonic hobbs). So each flight owns a CONTIGUOUS block of legs and
  // the blocks are in order. We partition all legs into `m` ordered blocks
  // (one per usable flight) to MINIMIZE the total mismatch between each block's
  // summed engine-hours and that flight's hobbs delta.
  //
  // A greedy pass can't do this: it closes a group as soon as it's "within
  // tolerance", so it (a) lets an early flight swallow legs a later pilot needs,
  // or (b) orphans a trailing short leg that actually belongs to the last
  // flight as a second tramo (e.g. a JPI recording interrupted mid-flight —
  // pulled circuit breaker). DP over the sequence is exact and cheap (a day has
  // only a handful of legs/flights), and it naturally groups split legs.
  const usableFlights = sortedFlights.filter((f) => (f.diffHobbs ?? 0) > 0);
  const n = sortedEngines.length;
  const m = usableFlights.length;

  // No flight logs to match against — every leg is left unassigned.
  if (m === 0) {
    return sortedEngines.map((e) => ({
      engineId: e.id,
      proposedFlightId: null,
      reason: "no Flight log on this day to match",
    }));
  }

  const legHours = sortedEngines.map((e) => e.durationSec / 3600);
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + legHours[i]);
  const rangeHours = (a: number, b: number) => prefix[b] - prefix[a]; // legs [a, b)
  const target = usableFlights.map((f) => f.diffHobbs ?? 0);

  // dp[i][j] = min total mismatch assigning the first i legs to the first j
  // flights (each flight a contiguous block; all i legs covered).
  // cut[i][j] = the k where flight j-1's block starts (legs [k, i)).
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const cut: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  dp[0][0] = 0;
  for (let j = 1; j <= m; j++) {
    for (let i = 0; i <= n; i++) {
      for (let k = 0; k <= i; k++) {
        const prev = dp[k][j - 1];
        if (prev === INF) continue;
        const cost = Math.abs(rangeHours(k, i) - target[j - 1]);
        if (prev + cost < dp[i][j]) {
          dp[i][j] = prev + cost;
          cut[i][j] = k;
        }
      }
    }
  }

  // Backtrack: recover each flight's contiguous block of leg indices.
  const blockOfFlight: number[][] = Array.from({ length: m }, () => []);
  let i = n;
  for (let j = m; j >= 1; j--) {
    const k = cut[i][j];
    for (let idx = k; idx < i; idx++) blockOfFlight[j - 1].push(idx);
    i = k;
  }

  const assignments: Assignment[] = [];
  for (let j = 0; j < m; j++) {
    const legIdxs = blockOfFlight[j];
    if (legIdxs.length === 0) continue; // flight got no leg (more flights than legs)
    const sumH = legIdxs.reduce((s, idx) => s + legHours[idx], 0);
    const matchedWell = Math.abs(sumH - target[j]) <= DURATION_TOLERANCE_H;
    const tramoNote = legIdxs.length > 1 ? ` (multi-tramo ×${legIdxs.length})` : "";
    for (const idx of legIdxs) {
      assignments.push({
        engineId: sortedEngines[idx].id,
        proposedFlightId: usableFlights[j].id,
        reason: matchedWell
          ? `chronological → Flight #${usableFlights[j].id}, Σ${sumH.toFixed(2)}h ≈ hobbs ${target[j].toFixed(2)}h${tramoNote}`
          : `best-effort → Flight #${usableFlights[j].id}, Σ${sumH.toFixed(2)}h vs hobbs ${target[j].toFixed(2)}h (Δ${Math.abs(sumH - target[j]).toFixed(2)}h)${tramoNote}`,
      });
    }
  }

  return assignments;
}
