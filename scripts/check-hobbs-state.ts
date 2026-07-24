import { prisma } from "../lib/prisma";

async function main() {
  const flights = await prisma.flight.findMany({
    where: { aircraftId: "CC-AQI" },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    take: 8,
    select: { id: true, fecha: true, hobbs_inicio: true, hobbs_fin: true, diff_hobbs: true, tach_inicio: true, tach_fin: true, diff_tach: true, cliente: true, detalle: true },
  });
  console.log("=== Last 8 flights ===");
  for (const f of flights) {
    console.log(`#${f.id} ${f.fecha.toISOString().slice(0,10)} | hobbs ${f.hobbs_inicio}->${f.hobbs_fin} (Δ${Number(f.diff_hobbs).toFixed(1)}) | tach ${f.tach_inicio}->${f.tach_fin} (Δ${Number(f.diff_tach).toFixed(2)}) | ${f.cliente} | ${f.detalle ?? ''}`);
  }
  const ac = await prisma.aircraft.findUnique({ where: { matricula: "CC-AQI" }, select: { hobbs_actual: true, tach_actual: true } });
  console.log("\nAircraft counters:", ac);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
