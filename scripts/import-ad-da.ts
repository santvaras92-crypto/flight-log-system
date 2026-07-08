/**
 * Import the AD/DA compliance records (Airworthiness Directives) from the three
 * DGAC Excel sheets under Mantenimiento/Cumplimientos AD:DA/ into the
 * ComplianceDirective table.
 *
 * Each file has several sheets; we parse the detail sheets whose header row is
 * "AD N°"/"DA N°" + "DESCRIPCIÓN" (tipo inferred from that header). The computed
 * "ESTATUS DA, AD Y DAN" summary sheet is skipped — we recompute status live.
 *
 * Idempotent: directives are keyed by (aircraftId, dominio, tipo, orden) so
 * re-running updates in place. ComplianceEvent history is never touched here.
 *
 *   Local dev DB:   npx tsx scripts/import-ad-da.ts
 *   Production DB:  railway run npx tsx scripts/import-ad-da.ts
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
  { file: "Mantenimiento/Cumplimientos AD:DA/AD - DA  I AERONAVE_AQI.xls", dominio: "AIRFRAME" },
  { file: "Mantenimiento/Cumplimientos AD:DA/AD - DA I MOTOR_AQI.xls", dominio: "ENGINE" },
  { file: "Mantenimiento/Cumplimientos AD:DA/AD - DA I HÉLICE_AQI.xls", dominio: "PROPELLER" },
];

// ── Cell normalizers (shared logic with import-plan-reemplazo) ──
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
  const s = String(v).trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  const direct = parseFloat(s.replace(/\./g, "").replace(",", "."));
  const plain = parseFloat(s.replace(",", "."));
  const n = !isNaN(plain) ? plain : direct;
  return isNaN(n) ? null : n;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    let year = parseInt(y, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const dt = new Date(Date.UTC(year, parseInt(mo, 10) - 1, parseInt(d, 10)));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

// A cell that only contains a *textual* date (source data-entry error in the
// "número" column of a few APPLIANCE rows, rendered as a JS Date like
// "Thu Apr 06 2017 …") should not be used as the directive number. Note we do
// NOT treat the "NN-NN-NN" dash form as a date: FAA AD numbers ("93-05-06",
// "2001-23-03") share that shape and are legitimate identifiers.
function looksLikeDate(s: string): boolean {
  return /^\w{3}\s\w{3}\s\d{1,2}\s\d{4}/.test(s);
}

// ── Periodicity parser ──
// "Cada 100 Horas 12 Meses" → { horas:100, meses:12, recurrente:true }
// "Cada 2000 Horas" → { horas:2000 }, "Al Evento" → { alEvento:true }
// "---" / empty → one-time (recurrente:false)
function parsePeriodicidad(raw: string | null, observacion: string | null) {
  const s = (raw || "").toLowerCase();
  if (s.includes("al evento") || s.includes("al event")) {
    return { recurrente: false, alEvento: true, meses: null as number | null, horas: null as number | null };
  }
  const hMatch = s.match(/(\d+)\s*hora/);
  const mMatch = s.match(/(\d+)\s*mes/);
  const horas = hMatch ? parseInt(hMatch[1], 10) : null;
  const meses = mMatch ? parseInt(mMatch[1], 10) : null;
  // Backup signal: observation "Pasa/Pasado a (AD) Repetitivo".
  const obsRepetitivo = /repetitiv/i.test(observacion || "");
  const recurrente = horas != null || meses != null || obsRepetitivo;
  return { recurrente, alEvento: false, meses, horas };
}

// ── Applicability parser ──
function parseAplicabilidad(raw: string | null, observacion: string | null): "APLICA" | "NO_APLICA" {
  const s = (raw || "").toLowerCase().trim();
  if (s === "aplica" || (s.includes("aplica") && !s.includes("no aplica") && s !== "n/a")) return "APLICA";
  if (s === "n/a" || s.includes("no aplica")) return "NO_APLICA";
  // Fall back to the observation wording when col is blank.
  if (/no aplica/i.test(observacion || "")) return "NO_APLICA";
  return raw ? "APLICA" : "NO_APLICA";
}

interface ParsedDir {
  dominio: "AIRFRAME" | "ENGINE" | "PROPELLER";
  tipo: "AD" | "DA";
  orden: number;
  numero: string;
  enmienda: string | null;
  descripcion: string;
  aplicabilidad: "APLICA" | "NO_APLICA";
  periodicidadRaw: string | null;
  recurrente: boolean;
  alEvento: boolean;
  intervaloMeses: number | null;
  intervaloHoras: number | null;
  efectividadFecha: Date | null;
  efectividadHoras: number | null;
  cumplimientoFecha: Date | null;
  cumplimientoHoras: number | null;
  observacion: string | null;
  responsable: string | null;
}

function parseFile(absFile: string, dominio: ParsedDir["dominio"]): ParsedDir[] {
  const wb = XLSX.readFile(absFile, { cellDates: true });
  const out: ParsedDir[] = [];
  let orden = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });

    // Locate the header row: col2 = "DESCRIPCIÓN" and col3 = "APLICABILIDAD"
    // (both AD and DA detail sheets share this). This robustly excludes the
    // "ESTATUS" summary sheet (col3 = "ÚLTIMO CUMPLIMIENTO") and matches the
    // AERONAVE DA header "DA / DAN N°" that a plain "DA N" check would miss.
    const headerIdx = rows.findIndex((r) => {
      if (!Array.isArray(r)) return false;
      const c2 = String(r[2] || "").toUpperCase();
      const c3 = String(r[3] || "").toUpperCase();
      return c2.startsWith("DESCRIP") && c3.includes("APLICAB");
    });
    if (headerIdx === -1) continue; // not a detail sheet

    const headerC0 = String(rows[headerIdx][0] || "").toUpperCase();
    const tipo: "AD" | "DA" = headerC0.includes("DA") ? "DA" : "AD";
    const startIdx = headerIdx + 2; // skip the FECHA/HORAS sub-header row

    for (let r = startIdx; r < rows.length; r++) {
      const row = rows[r] || [];
      const rawNumero = cleanStr(row[0]);
      const enmienda = cleanStr(row[1]);
      const descripcion = cleanStr(row[2]);
      if (!descripcion) continue; // blank/footer row
      // Skip repeated header bands inside the sheet (some sheets repeat the
      // "AD N° | ENMIENDA | DESCRIPCIÓN …" title row mid-table).
      const descU = descripcion.toUpperCase();
      if (descU.startsWith("DESCRIP")) continue;
      const numU = (rawNumero || "").toUpperCase();
      if (numU === "AD N°" || numU === "DA N°" || numU.includes("DAN N")) continue;

      // Numero: prefer col0, but if it's just a date use the amendment number.
      let numero = rawNumero;
      if (!numero || looksLikeDate(numero)) {
        numero = enmienda || rawNumero || `${tipo}-${dominio}-${orden}`;
      }

      const observacion = cleanStr(row[9]);
      const periodicidadRaw = cleanStr(row[4]);
      const per = parsePeriodicidad(periodicidadRaw, observacion);
      const aplicabilidad = parseAplicabilidad(cleanStr(row[3]), observacion);

      out.push({
        dominio,
        tipo,
        orden: orden++,
        numero: numero!,
        enmienda,
        descripcion,
        aplicabilidad,
        periodicidadRaw,
        recurrente: per.recurrente,
        alEvento: per.alEvento,
        intervaloMeses: per.meses,
        intervaloHoras: per.horas,
        efectividadFecha: toDate(row[5]),
        efectividadHoras: toNum(row[6]),
        cumplimientoFecha: toDate(row[7]),
        cumplimientoHoras: toNum(row[8]),
        observacion,
        responsable: cleanStr(row[10]),
      });
    }
  }
  return out;
}

async function main() {
  console.log(`\n📋 Import Cumplimientos AD/DA → ${MATRICULA}${DRY ? "  (DRY RUN)" : ""}\n`);

  const ac = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
  if (!ac) throw new Error(`Aircraft ${MATRICULA} not found in DB`);

  let total = 0;
  for (const { file, dominio } of FILES) {
    const abs = path.join(process.cwd(), file);
    if (!fs.existsSync(abs)) {
      console.log(`  ⚠️  Missing: ${file} — skipped`);
      continue;
    }
    const dirs = parseFile(abs, dominio);
    const nAD = dirs.filter((d) => d.tipo === "AD").length;
    const nDA = dirs.filter((d) => d.tipo === "DA").length;
    console.log(`  📄 ${dominio.padEnd(9)} ${dirs.length} directivas (${nAD} AD, ${nDA} DA)  (${path.basename(file)})`);

    for (const d of dirs) {
      const per = d.alEvento ? "Al Evento" : d.recurrente ? `${d.intervaloHoras ?? "-"}h/${d.intervaloMeses ?? "-"}m` : "one-time";
      console.log(
        `      [${String(d.orden).padStart(2)}] ${d.tipo} ${d.numero.padEnd(26)} ${d.aplicabilidad.padEnd(9)} ${per.padEnd(12)} ` +
          `últ.cumpl:${d.cumplimientoFecha ? d.cumplimientoFecha.toISOString().slice(0, 10) : "-"}@${d.cumplimientoHoras ?? "-"}h`
      );

      if (DRY) continue;

      // Idempotent upsert keyed by (aircraftId, dominio, tipo, orden).
      const existing = await prisma.complianceDirective.findFirst({
        where: { aircraftId: MATRICULA, dominio: d.dominio, tipo: d.tipo, orden: d.orden },
        select: { id: true },
      });
      const data = {
        aircraftId: MATRICULA,
        dominio: d.dominio,
        tipo: d.tipo,
        numero: d.numero,
        enmienda: d.enmienda,
        descripcion: d.descripcion,
        aplicabilidad: d.aplicabilidad,
        periodicidadRaw: d.periodicidadRaw,
        recurrente: d.recurrente,
        alEvento: d.alEvento,
        intervaloMeses: d.intervaloMeses,
        intervaloHoras: d.intervaloHoras,
        efectividadFecha: d.efectividadFecha,
        efectividadHoras: d.efectividadHoras,
        cumplimientoFecha: d.cumplimientoFecha,
        cumplimientoHoras: d.cumplimientoHoras,
        observacion: d.observacion,
        responsable: d.responsable,
        fuente: "DGAC_XLS",
        orden: d.orden,
      };
      if (existing) {
        await prisma.complianceDirective.update({ where: { id: existing.id }, data });
      } else {
        await prisma.complianceDirective.create({ data });
      }
      total++;
    }
  }

  console.log(`\n${DRY ? "🔎 Would import" : "✅ Imported/updated"} ${total} directive(s).\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌", e?.message || e);
  await prisma.$disconnect();
  process.exit(1);
});
