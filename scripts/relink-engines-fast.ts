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

  // Resolver: mapa engineId → linkedFlightId sugerido
  const suggested = new Map<number, number | null>();

  for (const [dateKey, dayEngines] of enginesByDate) {
    const dayFlights = getCandidates(dateKey);
    if (dayFlights.length === 0) {
      for (const e of dayEngines) suggested.set(e.id, null);
      continue;
    }

    // Sumas de horas por flight (engines del día asignados, evitando self)
    // Para mantener semántica original: existingEngineHours = otros engines ya linkeados a ese flight (excluyendo el actual)
    const linkedHoursByFlight = new Map<number, number>();
    for (const e of allEngines) {
      if (e.linkedFlightId == null) continue;
      linkedHoursByFlight.set(
        e.linkedFlightId,
        (linkedHoursByFlight.get(e.linkedFlightId) ?? 0) + e.durationSec / 3600,
      );
    }

    for (const e of dayEngines) {
      const engineHours = e.durationSec / 3600;
      type Scored = { c: typeof dayFlights[0]; diff: number; isExact: boolean };
      const scored: Scored[] = [];
      for (const c of dayFlights) {
        const fh = Number(c.diff_hobbs) || 0;
        if (fh <= 0) continue;
        // existing = otros engines linkeados a c, excluyendo el actual
        const selfContribution = e.linkedFlightId === c.id ? engineHours : 0;
        const existingH = (linkedHoursByFlight.get(c.id) ?? 0) - selfContribution;
        const diff = Math.abs(fh - (existingH + engineHours));
        scored.push({ c, diff, isExact: diff <= 0.5 });
      }
      if (scored.length === 0) { suggested.set(e.id, null); continue; }

      const exact = scored.filter(s => s.isExact);

      if (exact.length === 1) { suggested.set(e.id, exact[0].c.id); continue; }

      if (exact.length > 1) {
        const idx = dayEngines.findIndex(x => x.id === e.id);
        const sortedCands = exact
          .map(m => m.c)
          .sort((a, b) => (Number(a.hobbs_inicio) || 0) - (Number(b.hobbs_inicio) || 0));
        if (idx >= 0 && idx < sortedCands.length) {
          suggested.set(e.id, sortedCands[idx].id);
        } else {
          suggested.set(e.id, exact.sort((a, b) => a.diff - b.diff)[0].c.id);
        }
        continue;
      }

      // partial: flight sin engines previos, engine cubre 20%-100%
      const partial = scored
        .filter(s => {
          const fh = Number(s.c.diff_hobbs) || 0;
          const existing = (linkedHoursByFlight.get(s.c.id) ?? 0)
            - (e.linkedFlightId === s.c.id ? engineHours : 0);
          return existing === 0 && engineHours < fh && engineHours > fh * 0.2;
        })
        .sort((a, b) => a.diff - b.diff)[0];
      suggested.set(e.id, partial && partial.diff <= 2.0 ? partial.c.id : null);
    }
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
