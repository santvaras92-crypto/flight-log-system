import { prisma } from "../lib/prisma";

async function main() {
  const daysArg = process.argv[2];
  const days = daysArg ? Number(daysArg) : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const flights = await prisma.flight.findMany({
    where: { fecha: { gte: cutoff } },
    orderBy: { fecha: "desc" },
    select: { id: true, fecha: true, cliente: true }
  });

  const users = await prisma.user.findMany({
    select: { id: true, nombre: true, codigo: true },
  });
  const codeToName = new Map<string, string>();
  users.forEach(u => {
    const code = (u.codigo || '').toUpperCase();
    if (code) codeToName.set(code, u.nombre);
  });

  const counts = new Map<string, number>();
  for (const f of flights) {
    const code = (f.cliente || '').toUpperCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  const rows = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([code, cnt]) => {
    const name = codeToName.get(code) || '(sin nombre en pilots)';
    return { code, name, flights: cnt };
  });

  console.log(`📅 Window: last ${days} days`);
  console.table(rows);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
