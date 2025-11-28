import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

async function main() {
  const nameQuery = process.argv.slice(2).join(" ") || "Matias";
  const days = Number(process.env.DAYS || 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffTime = cutoff.getTime();

  // Allowed codes from CSV used by dashboard
  let allowedCodes: Set<string> = new Set();
  try {
    const csvPath = path.resolve(process.cwd(), "Base de dato pilotos.csv");
    const raw = fs.readFileSync(csvPath, "utf-8");
    raw.split(/\r?\n/).forEach(line => {
      const [codigo, piloto] = line.split(";");
      if (codigo && piloto) allowedCodes.add(String(codigo).trim().toUpperCase());
    });
  } catch (e) {
    // If not found, proceed without filtering
  }

  const users = await prisma.user.findMany({
    where: { nombre: { contains: nameQuery, mode: "insensitive" } },
    select: { id: true, nombre: true, rol: true, codigo: true }
  });
  if (users.length === 0) {
    console.log(`❌ No users found containing: ${nameQuery}`);
    return;
  }

  console.log(`Found ${users.length} matching users:`);
  for (const u of users) {
    const hasAllowed = allowedCodes.size ? (u.codigo && allowedCodes.has(String(u.codigo).toUpperCase())) : true;
    const flights = await prisma.flight.findMany({
      where: { pilotoId: u.id, fecha: { gte: cutoff } },
      orderBy: { fecha: "desc" },
      take: 5,
      select: { id: true, fecha: true, diff_hobbs: true }
    });
    const latest = flights[0];
    const active = !!latest;
    console.log(`• ${u.nombre} | id=${u.id} | rol=${u.rol} | codigo=${u.codigo} | inAllowed=${hasAllowed} | active=${active}`);
    if (!hasAllowed) console.log(`  ⛔ Not in allowed CSV codes.`);
    if (!active) {
      // Check if they have flights at all
      const anyFlights = await prisma.flight.count({ where: { pilotoId: u.id } });
      console.log(`  ℹ️ Flights in DB: ${anyFlights}`);
    } else {
      console.log(`  ✈️ Latest within ${days} days: ${latest.fecha.toISOString().slice(0,10)} | diff_hobbs=${latest.diff_hobbs}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
