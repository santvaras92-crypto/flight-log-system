/**
 * Seed BankMovement table from Movimientos.xlsx
 * Run: npx tsx scripts/seed-bank-movements.ts
 */
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const xlsxPath = path.join(process.cwd(), "Cuenta banco", "Movimientos.xlsx");
  if (!fs.existsSync(xlsxPath)) {
    console.error("Movimientos.xlsx not found at", xlsxPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Row 0 = header, rows 1+ = data
  // Columns (0-indexed): 0=correlativo(B), 1=fecha(C), 2=descripcion(D), 3=egreso(E), 4=ingreso(F), 5=saldo(G), 6=tipo(H), 7=cliente(I)
  const movements: {
    correlativo: number;
    fecha: Date;
    descripcion: string;
    egreso: number | null;
    ingreso: number | null;
    saldo: number;
    tipo: string;
    cliente: string | null;
  }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] == null) continue;

    const correlativo = Number(row[0]);
    if (!correlativo || isNaN(correlativo)) continue;

    // Parse fecha
    let fecha: Date;
    const rawFecha = row[1];
    if (rawFecha instanceof Date) {
      fecha = rawFecha;
    } else if (typeof rawFecha === "number") {
      // Excel serial date
      const excelEpoch = new Date(1899, 11, 30);
      fecha = new Date(excelEpoch.getTime() + rawFecha * 86400000);
    } else if (typeof rawFecha === "string") {
      fecha = new Date(rawFecha);
    } else {
      console.warn(`Row ${i}: Invalid fecha, skipping`);
      continue;
    }

    if (isNaN(fecha.getTime())) {
      console.warn(`Row ${i}: Invalid date value '${rawFecha}', skipping`);
      continue;
    }

    const descripcion = String(row[2] || "").trim();
    const egreso = row[3] ? Number(row[3]) : null;
    const ingreso = row[4] ? Number(row[4]) : null;
    const saldo = Number(row[5]) || 0;
    const tipo = String(row[6] || "Sin clasificar").trim();
    const cliente = row[7] ? String(row[7]).trim() : null;

    movements.push({ correlativo, fecha, descripcion, egreso, ingreso, saldo, tipo, cliente });
  }

  console.log(`Parsed ${movements.length} movements from xlsx`);

  // Check existing count
  const existingCount = await prisma.bankMovement.count();
  console.log(`Existing BankMovement rows in DB: ${existingCount}`);

  if (existingCount > 0) {
    const answer = process.argv.includes("--force") ? "y" : "n";
    if (answer !== "y") {
      console.log("DB already has data. Use --force to delete and re-seed.");
      console.log("Or run: npx tsx scripts/seed-bank-movements.ts --force");
      process.exit(0);
    }
    console.log("Deleting existing BankMovement rows...");
    await prisma.bankMovement.deleteMany({});
  }

  // Batch insert in chunks of 100
  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < movements.length; i += BATCH_SIZE) {
    const batch = movements.slice(i, i + BATCH_SIZE);
    await prisma.bankMovement.createMany({
      data: batch.map((m) => ({
        correlativo: m.correlativo,
        fecha: m.fecha,
        descripcion: m.descripcion,
        egreso: m.egreso,
        ingreso: m.ingreso,
        saldo: m.saldo,
        tipo: m.tipo,
        cliente: m.cliente,
      })),
      skipDuplicates: true,
    });
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${movements.length}`);
  }

  console.log(`\nDone! Inserted ${inserted} BankMovement rows.`);

  // Verify
  const finalCount = await prisma.bankMovement.count();
  const lastRow = await prisma.bankMovement.findFirst({ orderBy: { correlativo: "desc" } });
  console.log(`Total in DB: ${finalCount}`);
  if (lastRow) {
    console.log(`Last entry: #${lastRow.correlativo} | ${lastRow.fecha.toISOString().slice(0, 10)} | ${lastRow.descripcion} | Saldo: ${lastRow.saldo}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
