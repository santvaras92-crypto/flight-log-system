import { prisma } from "../lib/prisma";

async function main() {
  const codigo = process.argv[2] || "MO"; // Matías Ortúzar code
  const pilotoIdArg = process.argv[3] || "63"; // Known user id
  const pilotoId = Number(pilotoIdArg);
  if (!pilotoId || !codigo) {
    console.error("Usage: tsx scripts/backfill-pilotoid-by-code.ts <codigo> <pilotoId>");
    process.exit(1);
  }
  const cutoffDays = Number(process.env.DAYS || 3650); // default 10 years
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);

  console.log(`🔧 Backfilling flights for codigo=${codigo} => pilotoId=${pilotoId}`);

  // Find flights that should link to this pilot: where clienteCodigo matches or pilot name contains surname, and pilotoId is null
  const batch = await prisma.flight.findMany({
    where: {
      pilotoId: { equals: null },
      fecha: { gte: cutoff },
      OR: [
        { clienteCodigo: { equals: codigo } },
        { pilotoNombre: { contains: "Ortúzar", mode: "insensitive" } },
        { pilotoNombre: { contains: "Ortuzar", mode: "insensitive" } },
      ],
    },
    select: { id: true, fecha: true, clienteCodigo: true, pilotoNombre: true }
  });

  if (batch.length === 0) {
    console.log("✅ No flights found needing backfill.");
    return;
  }
  console.log(`Found ${batch.length} flights to update.`);

  let updated = 0;
  for (const f of batch) {
    await prisma.flight.update({ where: { id: f.id }, data: { pilotoId } });
    updated++;
  }
  console.log(`✅ Updated ${updated} flights. Linking complete.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
