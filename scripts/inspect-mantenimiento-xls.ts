/**
 * READ-ONLY inspector for the Mantenimiento .xls files.
 * Dumps every sheet, its header row and a few sample rows so we can design the
 * Prisma schema for the Plan de Reemplazo + AD/DA data.
 *
 * Run: npx tsx scripts/inspect-mantenimiento-xls.ts
 * Does NOT modify anything.
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(process.cwd(), "Mantenimiento");

function findXls(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findXls(full));
    } else if (/\.xlsx?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function preview(cell: unknown): string {
  if (cell == null) return "";
  const s = String(cell).replace(/\s+/g, " ").trim();
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

const files = findXls(ROOT).sort();
console.log(`Found ${files.length} Excel file(s) under Mantenimiento/\n`);

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const size = fs.statSync(file).size;
  console.log("═".repeat(90));
  console.log(`📄 ${rel}  (${size.toLocaleString()} bytes)`);
  console.log("═".repeat(90));

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(file, { cellDates: true });
  } catch (err: any) {
    console.log(`  ⚠️  Could not parse: ${err?.message || err}\n`);
    continue;
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    const ref = ws["!ref"] || "(empty)";
    console.log(`\n  ── Sheet "${sheetName}"  range=${ref}  rows=${rows.length}`);

    // Print the first ~18 rows so we can spot the header row (these sheets often
    // have a title/logo band before the real column headers).
    const maxRows = Math.min(rows.length, 18);
    for (let r = 0; r < maxRows; r++) {
      const row = rows[r] || [];
      const cells = row.map((c) => preview(c));
      // Trim trailing empty cells for readability
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (cells.length === 0) continue;
      console.log(`    [${String(r).padStart(2)}] ${cells.map((c, i) => `${i}:${c}`).join(" | ")}`);
    }
    if (rows.length > maxRows) {
      console.log(`    … (${rows.length - maxRows} more rows)`);
    }
  }
  console.log("");
}
