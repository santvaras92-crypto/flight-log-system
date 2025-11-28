import { prisma } from "../lib/prisma";

async function main() {
  const idArg = process.argv[2];
  const pilotoId = idArg ? Number(idArg) : NaN;
  if (!pilotoId) {
    console.error("Usage: tsx scripts/list-flights-for-pilot.ts <pilotoId>");
    process.exit(1);
  }
  const flights = await prisma.flight.findMany({
    where: { pilotoId },
    orderBy: { fecha: "desc" },
    take: 10,
    select: { id: true, fecha: true, diff_hobbs: true, instructor: true }
  });
  if (flights.length === 0) {
    console.log("No flights found for pilotoId=" + pilotoId);
  } else {
    flights.forEach(f => {
      console.log(`${f.id} | ${f.fecha.toISOString().slice(0,10)} | ${f.diff_hobbs} | instr=${f.instructor ?? ''}`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
