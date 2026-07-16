import { prisma } from "../lib/prisma";

function localChileDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(d));
}

async function main() {
  const start = new Date("2026-07-11T00:00:00Z");
  const end = new Date("2026-07-14T00:00:00Z");

  const flights = await prisma.flight.findMany({
    where: { fecha: { gte: start, lte: end } },
    select: { id: true, fecha: true, piloto_raw: true, hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true },
    orderBy: { fecha: "asc" },
  });

  console.log("=== FLIGHT LOG entries 11-13 Jul 2026 ===");
  for (const f of flights) {
    console.log(`  Flight #${f.id} | fecha=${f.fecha.toISOString()} (Chile ${localChileDate(f.fecha)}) | piloto=${f.piloto_raw} | hobbs ${f.hobbs_inicio}->${f.hobbs_fin} diff=${f.diff_hobbs}`);
  }

  const engines = await prisma.engineMonitorFlight.findMany({
    where: { flightDate: { gte: start, lte: end } },
    select: { id: true, flightNumber: true, flightDate: true, durationSec: true, sourceFile: true, linkedFlightId: true, isGroundRun: true },
    orderBy: { flightDate: "asc" },
  });

  console.log("\n=== ENGINE MONITOR flights 11-13 Jul 2026 ===");
  for (const e of engines) {
    console.log(`  Engine #${e.id} | flt#${e.flightNumber} | date=${e.flightDate.toISOString()} (Chile ${localChileDate(e.flightDate)}) | dur=${(e.durationSec/3600).toFixed(2)}h | file=${e.sourceFile} | linkedFlightId=${e.linkedFlightId} | groundRun=${e.isGroundRun}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
