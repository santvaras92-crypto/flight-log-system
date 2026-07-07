/**
 * relink-engines-fast.ts
 * ======================
 * Versión optimizada: carga TODO en memoria de una sola vez y resuelve el linker
 * sin queries por-engine. ~1-3 seg total.
 *
 * Uso:
 *   npx tsx scripts/relink-engines-fast.ts --dry-run
 *   npx tsx scripts/relink-engines-fast.ts
 */

import { prisma } from "../lib/prisma";
import {
  computeDayAssignments,
  localChileDate,
  type EngineLeg,
  type FlightLog,
} from "../lib/engine-flight-matcher";

const MIN_DURATION_SEC = 300;
const DRY_RUN = process.argv.includes("--dry-run");

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric", month: "2-digit", day: "2-digit",
});
const localDateStr = (d: Date) => fmt.format(d);

async function main() {
  console.log(`\n🔧 Modo: ${DRY_RUN ? "DRY-RUN (no escribe)" : "APLICAR"}\n`);

  console.log("⏳ Cargando engines y flights...");
  const [allEngines, allFlights] = await Promise.all([
    prisma.engineMonitorFlight.findMany({
      select: {
        id: true, flightNumber: true, flightDate: true,
        durationSec: true, linkedFlightId: true, isGroundRun: true,
      },
      orderBy: { flightDate: "asc" },
    }),
    prisma.flight.findMany({
      select: { id: true, fecha: true, diff_hobbs: true, hobbs_inicio: true },
    }),
  ]);
  console.log(`   ${allEngines.length} engines, ${allFlights.length} flights\n`);

  // Indexar flights por fecha local Chile
  const flightsByDate = new Map<string, typeof allFlights>();
  for (const f of allFlights) {
    const k = localDateStr(f.fecha);
    if (!flightsByDate.has(k)) flightsByDate.set(k, []);
    flightsByDate.get(k)!.push(f);
  }

  // Helper: busca Flights candidatos en día local Chile con fallback ±1 día
  // (soporta vuelos en husos horarios extranjeros).
  function getCandidates(dateKey: string): typeof allFlights {
    const same = flightsByDate.get(dateKey) ?? [];
    if (same.length > 0) return same;
    const [yy, mm, dd] = dateKey.split("-").map(Number);
    const prev = new Date(Date.UTC(yy, mm - 1, dd - 1));
    const next = new Date(Date.UTC(yy, mm - 1, dd + 1));
    const prevKey = localDateStr(prev);
    const nextKey = localDateStr(next);
    return [...(flightsByDate.get(prevKey) ?? []), ...(flightsByDate.get(nextKey) ?? [])];
  }

  // Indexar engines por fecha local Chile (sólo válidos para link)
  const enginesByDate = new Map<string, typeof allEngines>();
  for (const e of allEngines) {
    if (e.isGroundRun || e.durationSec < MIN_DURATION_SEC) continue;
    const k = localDateStr(e.flightDate);
    if (!enginesByDate.has(k)) enginesByDate.set(k, []);
    enginesByDate.get(k)!.push(e);
  }
  // Asegurar orden cronológico
  for (const list of enginesByDate.values()) {
    list.sort((a, b) => a.flightDate.getTime() - b.flightDate.getTime());
  }

  // Resolver: mapa engineId → linkedFlightId sugerido.
  // Usamos el matcher compartido (computeDayAssignments) como ÚNICA fuente de
  // verdad: asigna cronológicamente (hora de despegue del motor ↔ orden del
  // hobbs) y agrupa multi-tramo cuando el JPI se cortó a mitad de vuelo.
  const suggested = new Map<number, number | null>();

  for (const [dateKey, dayEngines] of enginesByDate) {
    const dayFlights = getCandidates(dateKey);
    if (dayFlights.length === 0) {
      for (const e of dayEngines) suggested.set(e.id, null);
      continue;
    }

    const engineLegs: EngineLeg[] = dayEngines.map((e) => ({
      id: e.id,
      flightDate: e.flightDate,
      durationSec: e.durationSec,
    }));
    const flightLogs: FlightLog[] = dayFlights
      .filter((c) => localChileDate(c.fecha) === dateKey)
      .map((c) => ({
        id: c.id,
        hobbsInicio: c.hobbs_inicio != null ? Number(c.hobbs_inicio) : null,
        diffHobbs: c.diff_hobbs != null ? Number(c.diff_hobbs) : null,
      }));

    // Fallback: si no hay flights en el día local exacto (vuelo en huso
    // extranjero), usamos todos los candidatos de la ventana ±1 día.
    const effectiveLogs: FlightLog[] = flightLogs.length > 0
      ? flightLogs
      : dayFlights.map((c) => ({
          id: c.id,
          hobbsInicio: c.hobbs_inicio != null ? Number(c.hobbs_inicio) : null,
          diffHobbs: c.diff_hobbs != null ? Number(c.diff_hobbs) : null,
        }));

    const assignments = computeDayAssignments(engineLegs, effectiveLogs);
    for (const a of assignments) suggested.set(a.engineId, a.proposedFlightId);
  }

  // Engines descartados (ground runs / muy cortos): suggested = lo que ya tienen (no tocar)
  // Pero si están linkeados y son ground run, el flag isGroundRun ya los excluye en la UI;
  // mantenemos su linkedFlightId actual para no alterar nada fuera de scope.
  for (const e of allEngines) {
    if (!suggested.has(e.id)) suggested.set(e.id, e.linkedFlightId);
  }

  // Diff vs estado actual
  let unchanged = 0, changed = 0, set = 0, cleared = 0;
  const changes: Array<{ id: number; flightNumber: number; date: string; from: number | null; to: number | null }> = [];

  for (const e of allEngines) {
    const to = suggested.get(e.id) ?? null;
    if (to === e.linkedFlightId) { unchanged++; continue; }
    changes.push({
      id: e.id, flightNumber: e.flightNumber,
      date: localDateStr(e.flightDate),
      from: e.linkedFlightId, to,
    });
    if (e.linkedFlightId && !to) cleared++;
    else if (!e.linkedFlightId && to) set++;
    else changed++;
  }

  console.log("────────── RESUMEN ──────────");
  console.log(`Sin cambios:         ${unchanged}`);
  console.log(`Re-linked (cambio):  ${changed}`);
  console.log(`Linked nuevos:       ${set}`);
  console.log(`Unlinked (cleared):  ${cleared}`);
  console.log(`Total cambios:       ${changes.length}`);
  console.log("─────────────────────────────\n");

  if (changes.length > 0) {
    console.log("Detalle (primeros 80):");
    for (const c of changes.slice(0, 80)) {
      const f = c.from === null ? "∅" : `#${c.from}`;
      const t = c.to === null ? "∅" : `#${c.to}`;
      console.log(`  engine #${c.flightNumber} (${c.date})  ${f}  →  ${t}`);
    }
    if (changes.length > 80) console.log(`  ... y ${changes.length - 80} más`);
  }

  if (!DRY_RUN && changes.length > 0) {
    console.log("\n⏳ Aplicando cambios...");
    let done = 0;
    // Batch en transacciones de 50
    for (let i = 0; i < changes.length; i += 50) {
      const batch = changes.slice(i, i + 50);
      await prisma.$transaction(
        batch.map(c =>
          prisma.engineMonitorFlight.update({
            where: { id: c.id },
            data: { linkedFlightId: c.to },
          }),
        ),
      );
      done += batch.length;
      process.stdout.write(`\r   ${done}/${changes.length}`);
    }
    console.log("\n✅ Aplicado.\n");
  } else if (DRY_RUN) {
    console.log("\n💡 Ejecutá sin --dry-run para aplicar.\n");
  } else {
    console.log("\n✨ Nada que cambiar.\n");
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
