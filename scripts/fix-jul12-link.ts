import { prisma } from "../lib/prisma";

function localChileDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(d));
}

async function main() {
  const DRY = process.argv.includes("--dry");

  // 1) Normalize Flight #2988 date to noon UTC anchor (2026-07-12) so its
  //    local Chile date becomes 2026-07-12, matching the engine record.
  const flight = await prisma.flight.findUnique({ where: { id: 2988 } });
  if (!flight) throw new Error("Flight #2988 not found");
  console.log(`Flight #2988 current fecha=${flight.fecha.toISOString()} (Chile ${localChileDate(flight.fecha)})`);

  const noon = new Date("2026-07-12T12:00:00.000Z");
  console.log(`  -> new fecha=${noon.toISOString()} (Chile ${localChileDate(noon)})`);

  // 2) Link engine #2007 (2.00h, 2026-07-12) to Flight #2988.
  console.log(`Engine #2007 -> linkedFlightId 2988`);

  if (DRY) { console.log("\nDRY RUN — no changes written."); await prisma.$disconnect(); return; }

  await prisma.flight.update({ where: { id: 2988 }, data: { fecha: noon } });
  await prisma.engineMonitorFlight.update({ where: { id: 2007 }, data: { linkedFlightId: 2988 } });

  console.log("\n✅ Applied. Flight #2988 normalized to noon and engine #2007 linked.");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
