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

  const assignments: Assignment[] = [];
  let e = 0; // pointer into sortedEngines

  for (const f of sortedFlights) {
    const target = f.diffHobbs ?? 0;
    if (target <= 0) {
      // Flight has no usable duration — don't consume any engine for it.
      continue;
    }
    if (e >= sortedEngines.length) break; // no engines left

    // Greedily accumulate consecutive engine legs until their summed
    // duration is within tolerance of this flight's hobbs delta.
    const group: EngineLeg[] = [];
    let sumH = 0;
    while (e < sortedEngines.length) {
      const legH = sortedEngines[e].durationSec / 3600;
      const nextSum = sumH + legH;

      // If we already have a close-enough group and adding this leg would
      // overshoot, stop — this leg belongs to the next flight.
      if (
        group.length > 0 &&
        Math.abs(sumH - target) <= DURATION_TOLERANCE_H &&
        nextSum - target > DURATION_TOLERANCE_H
      ) {
        break;
      }

      group.push(sortedEngines[e]);
      sumH = nextSum;
      e++;

      // Matched within tolerance — close this group.
      if (Math.abs(sumH - target) <= DURATION_TOLERANCE_H) break;
      // Overshot even with the just-added leg — accept as best effort and stop.
      if (sumH - target > DURATION_TOLERANCE_H) break;
    }

    const matchedWell = Math.abs(sumH - target) <= DURATION_TOLERANCE_H;
    const tramoNote = group.length > 1 ? ` (multi-tramo ×${group.length})` : "";
    for (const g of group) {
      assignments.push({
        engineId: g.id,
        proposedFlightId: f.id,
        reason: matchedWell
          ? `chronological #${assignments.length + 1} → Flight #${f.id}, Σ${sumH.toFixed(2)}h ≈ hobbs ${target.toFixed(2)}h${tramoNote}`
          : `best-effort → Flight #${f.id}, Σ${sumH.toFixed(2)}h vs hobbs ${target.toFixed(2)}h (Δ${Math.abs(sumH - target).toFixed(2)}h)${tramoNote}`,
      });
    }
  }

  // Any engine legs left over couldn't be matched to a flight that day.
  for (; e < sortedEngines.length; e++) {
    assignments.push({
      engineId: sortedEngines[e].id,
      proposedFlightId: null,
      reason: "no remaining Flight log on this day to match",
    });
  }

  return assignments;
}
