import { prisma } from "../lib/prisma";

async function main() {
  console.log("🔧 Backfilling Flight.pilotoId based on client code ↔ user.codigo...");
  const users = await prisma.user.findMany({ select: { id: true, codigo: true } });
  const codeToUserId = new Map<string, number>();
  for (const u of users) {
    const code = (u.codigo || '').toUpperCase().trim();
    if (code) codeToUserId.set(code, u.id);
  }

  let totalUpdated = 0;
  // Process in batches by code to keep updates targeted
  for (const [code, userId] of codeToUserId.entries()) {
    const updated = await prisma.flight.updateMany({
      where: {
        cliente: code,
        OR: [
          { pilotoId: { not: userId } },
          { pilotoId: { equals: null as any } as any },
        ]
      },
      data: { pilotoId: userId }
    });
    if (updated.count > 0) {
      console.log(`  • ${code} -> userId=${userId} | updated ${updated.count}`);
      totalUpdated += updated.count;
    }
  }

  console.log(`✅ Completed. Flights updated: ${totalUpdated}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
