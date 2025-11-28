import { prisma } from "../lib/prisma";

async function main() {
  const nameQuery = process.argv.slice(2).join(" ") || "Matias Ortuzar";
  const days = Number(process.env.DAYS || 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const user = await prisma.user.findFirst({
    where: { nombre: { contains: nameQuery, mode: "insensitive" } },
    select: { id: true, nombre: true, rol: true, codigo: true }
  });
  if (!user) {
    console.log(`❌ No user found matching: ${nameQuery}`);
    return;
  }
  console.log(`👤 User: ${user.nombre} | id=${user.id} | rol=${user.rol} | codigo=${user.codigo}`);

  // Load allowed codes from CSV via dashboard loader logic is server-side; replicate minimal here
  // For quick check, list whether codigo exists and is non-empty
  const hasCode = !!(user.codigo && String(user.codigo).trim());
  console.log(`• Has code: ${hasCode ? user.codigo : "(missing)"}`);

  const lastFlights = await prisma.flight.findMany({
    where: { pilotoId: user.id },
    orderBy: { fecha: "desc" },
    take: 5,
    select: { id: true, fecha: true, diff_hobbs: true, costo: true }
  });

  if (lastFlights.length === 0) {
    console.log("❌ No flights linked to this pilotoId.");
  } else {
    const latest = lastFlights[0];
    console.log(`✈️ Latest flight: ${latest.fecha.toISOString().slice(0,10)} | diff_hobbs=${latest.diff_hobbs} | costo=${latest.costo}`);
    const isActive = new Date(latest.fecha).getTime() >= cutoff.getTime();
    console.log(`• Active within ${days} days: ${isActive}`);
    console.log("Recent flights:");
    for (const f of lastFlights) {
      console.log(`  - ${f.fecha.toISOString().slice(0,10)} | ${f.diff_hobbs}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
