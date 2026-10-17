// One-off smoke test for the compliance auditor (FAA + DGAC + Lycoming SB).
// Usage: npx tsx scripts/test-audit.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runComplianceAudit } = await import("../lib/compliance-auditor");
  const r = await runComplianceAudit({ monthsBack: 24, maxCandidates: 5 });
  console.log("FAA:", JSON.stringify(r.faa));
  console.log("DGAC:", JSON.stringify(r.dgac));
  console.log("SB:", JSON.stringify(r.sb));
  for (const a of r.added) console.log("ADDED:", a.tipo, a.numero, "—", a.descripcion.slice(0, 90));
  for (const n of r.notes) console.log("NOTE:", n.slice(0, 180));
}
main().catch((e) => { console.error(e); process.exit(1); });
