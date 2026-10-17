// Deletes the hallucinated DGAC directives DA 78-03 / DA 78-04 that the
// compliance auditor's LLM invented (they do not exist in the official DGAC
// listing — the 78 series only has DA 78-01 Continental and DA 78-02 Lycoming).
// Usage: npx tsx scripts/delete-hallucinated-das.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FAKE_NUMBERS = ['78-03', '78-04'];

async function main() {
  const rows = await prisma.complianceDirective.findMany({
    where: {
      tipo: 'DA',
      OR: FAKE_NUMBERS.map((n) => ({ numero: { contains: n } })),
    },
  });

  if (rows.length === 0) {
    console.log('✅ No se encontraron DA 78-03 / DA 78-04. Nada que borrar.');
    return;
  }

  for (const r of rows) {
    console.log(`🗑  Borrando ${r.tipo} ${r.numero} — ${r.descripcion} (id: ${r.id}, fuente: ${r.fuente})`);
  }

  const res = await prisma.complianceDirective.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  console.log(`\n✅ ${res.count} directivas alucinadas eliminadas.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
