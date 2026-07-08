/**
 * Import the "Plan de Reemplazo" (life-limited parts / replacement plan) from the
 * three DGAC Excel sheets under Mantenimiento/Plan de Reemplazo/ into the
 * ReplacementPart table.
 *
 * Idempotent: parts are keyed by (aircraftId, dominio, orden) so re-running
 * updates in place instead of duplicating. Change history (ReplacementEvent) is
 * never touched here.
 *
 *   Local dev DB:   npx tsx scripts/import-plan-reemplazo.ts
 *   Production DB:  railway run npx tsx scripts/import-plan-reemplazo.ts
 *
 * Add --dry to preview without writing.
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const MATRICULA = "CC-AQI";

const FILES: { file: string; dominio: "AIRFRAME" | "ENGINE" | "PROPELLER" }[] = [
  { file: "Mantenimiento/Plan de Reemplazo/Plan Reemplazo I AERONAVE_AQI.xls", dominio: "AIRFRAME" },
  { file: "Mantenimiento/Plan de Reemplazo/Plan Reemplazo I MOTOR_AQI.xls", dominio: "ENGINE" },
  { file: "Mantenimiento/Plan de Reemplazo/Plan Reemplazo I HÉLICE_AQI.xls", dominio: "PROPELLER" },
];

// ── Cell normalizers ──
const PLACEHOLDERS = new Set(["", "---", "----", "--", "-", "n/a", "s/n", "s/m"]);

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  return s;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  // Chilean decimals sometimes use a comma: "2745,45" → 2745.45
  s = s.replace(/\./g, "").replace(",", ".");
  // But if it already looked like "2745.45" the line above breaks it; handle both
  const direct = parseFloat(String(v).replace(",", "."));
  const alt = parseFloat(s);
  const n = !isNaN(direct) ? direct : alt;
  return isNaN(n) ? null : n;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  // "DD-MM-YYYY" or "DD-MM-YY"
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let year = parseInt(y, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const dt = new Date(Date.UTC(year, parseInt(mo, 10) - 1, parseInt(d, 10)));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

interface ParsedPart {
  dominio: "AIRFRAME" | "ENGINE" | "PROPELLER";
  orden: number;
  descripcion: string;
  marca: string | null;
  partNumber: string | null;
  serial: string | null;
  tboMeses: number | null;
  tboHoras: number | null;
  vidaMeses: number | null;
  vidaHoras: number | null;
  installDate: Date | null;
  installHoras: number | null;
  proximaFecha: Date | null;
  proximaHoras: number | null;
}

function parseFile(absFile: string, dominio: ParsedPart["dominio"]): ParsedPart[] {
  const wb = XLSX.readFile(absFile, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });

  // Find the header row containing "DESCRIPCIÓN DEL COMPONENTE"
  let headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && String(r[0] || "").toUpperCase().includes("DESCRIPCIÓN DEL COMPONENTE")
  );
  if (headerIdx === -1) throw new Error(`No header row in ${absFile}`);
  // Data starts 2 rows after the header (header + sub-header labels)
  const startIdx = headerIdx + 2;

  const parts: ParsedPart[] = [];
  let orden = 0;
  for (let r = startIdx; r < rows.length; r++) {
    const row = rows[r] || [];
    const desc = cleanStr(row[0]);
    if (!desc) continue;
    if (desc.toLowerCase().startsWith("nota")) break; // footer note ends the table

    parts.push({
      dominio,
      orden: orden++,
      descripcion: desc,
      marca: cleanStr(row[1]),
      partNumber: cleanStr(row[2]),
      serial: cleanStr(row[3]),
      tboMeses: toInt(row[4]),
      tboHoras: toNum(row[5]),
      vidaMeses: toInt(row[7]),
      vidaHoras: toNum(row[8]),
      installDate: toDate(row[10]),
      installHoras: toNum(row[11]),
      proximaFecha: toDate(row[16]),
      proximaHoras: toNum(row[17]),
    });
  }
  return parts;
}

async function main() {
  console.log(`\n🔧 Import Plan de Reemplazo → ${MATRICULA}${DRY ? "  (DRY RUN)" : ""}\n`);

  // Ensure the aircraft exists
  const ac = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
  if (!ac) throw new Error(`Aircraft ${MATRICULA} not found in DB`);

  let total = 0;
  for (const { file, dominio } of FILES) {
    const abs = path.join(process.cwd(), file);
    if (!fs.existsSync(abs)) {
      console.log(`  ⚠️  Missing: ${file} — skipped`);
      continue;
    }
    const parts = parseFile(abs, dominio);
    console.log(`  📄 ${dominio.padEnd(9)} ${parts.length} parts  (${path.basename(file)})`);

    for (const p of parts) {
      const limH = p.vidaHoras ?? p.tboHoras;
      const limM = p.vidaMeses ?? p.tboMeses;
      console.log(
        `      [${String(p.orden).padStart(2)}] ${p.descripcion.padEnd(28)} ` +
          `PN:${(p.partNumber || "-").padEnd(16)} SN:${(p.serial || "-").padEnd(12)} ` +
          `lim:${limH ?? "-"}h/${limM ?? "-"}m inst:${p.installHoras ?? "-"}h @ ${p.installDate ? p.installDate.toISOString().slice(0, 10) : "-"}`
      );

      if (DRY) continue;

      // Idempotent upsert keyed by (aircraftId, dominio, orden)
      const existing = await prisma.replacementPart.findFirst({
        where: { aircraftId: MATRICULA, dominio: p.dominio, orden: p.orden },
        select: { id: true },
      });
      const data = {
        aircraftId: MATRICULA,
        dominio: p.dominio,
        descripcion: p.descripcion,
        marca: p.marca,
        partNumber: p.partNumber,
        serial: p.serial,
        tboMeses: p.tboMeses,
        tboHoras: p.tboHoras,
        vidaMeses: p.vidaMeses,
        vidaHoras: p.vidaHoras,
        installDate: p.installDate,
        installHoras: p.installHoras,
        proximaFecha: p.proximaFecha,
        proximaHoras: p.proximaHoras,
        orden: p.orden,
      };
      if (existing) {
        await prisma.replacementPart.update({ where: { id: existing.id }, data });
      } else {
        await prisma.replacementPart.create({ data });
      }
      total++;
    }
  }

  console.log(`\n${DRY ? "🔎 Would import" : "✅ Imported/updated"} ${total} part(s).\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌", e?.message || e);
  await prisma.$disconnect();
  process.exit(1);
});
