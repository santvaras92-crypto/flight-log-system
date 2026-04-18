/**
 * relink-engines-local-date.ts
 * ============================
 * Re-corre el auto-linker con la lógica nueva (fecha LOCAL Chile, sin ventana ±1 día)
 * sobre TODOS los EngineMonitorFlight existentes y corrige los linkedFlightId malos.
 *
 * Uso:
 *   npx tsx scripts/relink-engines-local-date.ts --dry-run   # muestra cambios sin aplicar
 *   npx tsx scripts/relink-engines-local-date.ts             # aplica cambios
 */

import { prisma } from "../lib/prisma";

const MIN_DURATION_SEC = 300;
const DRY_RUN = process.argv.includes("--dry-run");

function localDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Lógica idéntica a autoLinkEngineToFlight() del route, pero retornando el id sugerido (no escribe). */
async function computeLinkedFlightId(
  engineFlightId: number,
  flightDate: Date,
  durationSec: number,
  isGroundRun: boolean,
): Promise<number | null> {
  if (isGroundRun) return null;
  if (durationSec < MIN_DURATION_SEC) return null;

  const engineHours = durationSec / 3600;
  const localStr = localDateStr(flightDate);

  const dayStart = new Date(`${localStr}T00:00:00-04:00`);
  const dayEnd = new Date(`${localStr}T23:59:59-03:00`);

  const candidates = await prisma.flight.findMany({
    where: { fecha: { gte: dayStart, lte: dayEnd } },
    select: {
      id: true, fecha: true, diff_hobbs: true, hobbs_inicio: true,
      EngineMonitorFlights: {
        where: { id: { not: engineFlightId } }, // excluir self para no doble-contar
        select: { id: true, durationSec: true },
      },
    },
  });
  if (candidates.length === 0) return null;

  const sameDay = candidates.filter(c => localDateStr(c.fecha) === localStr);
  if (sameDay.length === 0) return null;

  type Scored = { candidate: typeof sameDay[0]; diff: number; isExact: boolean };
  const scored: Scored[] = [];
  for (const c of sameDay) {
    const fh = Number(c.diff_hobbs) || 0;
    if (fh <= 0) continue;
    const existingH = c.EngineMonitorFlights.reduce((s, e) => s + e.durationSec / 3600, 0);
    const diff = Math.abs(fh - (existingH + engineHours));
    scored.push({ candidate: c, diff, isExact: diff <= 0.5 });
  }
  if (scored.length === 0) return null;

  const exact = scored.filter(s => s.isExact);

  if (exact.length === 1) return exact[0].candidate.id;

  if (exact.length > 1) {
    const dayUtcStart = new Date(`${localStr}T00:00:00-04:00`);
    const dayUtcEnd = new Date(`${localStr}T23:59:59-03:00`);
    const sameDayEngines = await prisma.engineMonitorFlight.findMany({
      where: {
        flightDate: { gte: dayUtcStart, lte: dayUtcEnd },
        isGroundRun: { not: true },
        durationSec: { gte: MIN_DURATION_SEC },
      },
      select: { id: true, flightDate: true },
      orderBy: { flightDate: "asc" },
    });
    const idx = sameDayEngines.findIndex(e => e.id === engineFlightId);
    const sortedCands = exact
      .map(m => m.candidate)
      .sort((a, b) => (Number(a.hobbs_inicio) || 0) - (Number(b.hobbs_inicio) || 0));
    if (idx >= 0 && idx < sortedCands.length) return sortedCands[idx].id;
    return exact.sort((a, b) => a.diff - b.diff)[0].candidate.id;
  }

  // partial
  const partial = scored
    .filter(s => {
      const fh = Number(s.candidate.diff_hobbs) || 0;
      return s.candidate.EngineMonitorFlights.length === 0
        && engineHours < fh && engineHours > fh * 0.2;
    })
    .sort((a, b) => a.diff - b.diff)[0];
  if (partial && partial.diff <= 2.0) return partial.candidate.id;

  return null;
}

async function main() {
  console.log(`\n🔧 Modo: ${DRY_RUN ? "DRY-RUN (no escribe)" : "APLICAR cambios"}\n`);

  const engines = await prisma.engineMonitorFlight.findMany({
    select: {
      id: true, flightNumber: true, flightDate: true,
      durationSec: true, linkedFlightId: true, isGroundRun: true,
    },
    orderBy: { flightDate: "asc" },
  });

  console.log(`📊 Engines a evaluar: ${engines.length}\n`);

  let changed = 0, cleared = 0, set = 0, unchanged = 0, skipped = 0;
  const changes: Array<{ id: number; flightNumber: number; date: string; from: number | null; to: number | null }> = [];

  for (const e of engines) {
    const suggested = await computeLinkedFlightId(
      e.id, e.flightDate, e.durationSec, !!e.isGroundRun,
    );

    if (suggested === e.linkedFlightId) {
      unchanged++;
      continue;
    }

    changes.push({
      id: e.id,
      flightNumber: e.flightNumber,
      date: localDateStr(e.flightDate),
      from: e.linkedFlightId,
      to: suggested,
    });

    if (e.linkedFlightId && !suggested) cleared++;
    else if (!e.linkedFlightId && suggested) set++;
    else changed++;

    if (!DRY_RUN) {
      await prisma.engineMonitorFlight.update({
        where: { id: e.id },
        data: { linkedFlightId: suggested },
      });
    }
  }

  console.log("\n────────── RESUMEN ──────────");
  console.log(`Sin cambios:         ${unchanged}`);
  console.log(`Re-linked (cambio):  ${changed}`);
  console.log(`Linked nuevos:       ${set}`);
  console.log(`Unlinked (cleared):  ${cleared}`);
  console.log(`Total cambios:       ${changes.length}`);
  console.log("─────────────────────────────\n");

  if (changes.length > 0) {
    console.log("Detalle de cambios (primeros 100):");
    for (const c of changes.slice(0, 100)) {
      const arrow = c.from === null ? "∅" : `#${c.from}`;
      const to = c.to === null ? "∅" : `#${c.to}`;
      console.log(`  engine #${c.flightNumber} (${c.date})  ${arrow}  →  ${to}`);
    }
    if (changes.length > 100) console.log(`  ... y ${changes.length - 100} más`);
  }

  if (DRY_RUN) console.log("\n💡 Ejecutá sin --dry-run para aplicar.\n");
  else console.log("\n✅ Cambios aplicados.\n");

  void skipped;
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
