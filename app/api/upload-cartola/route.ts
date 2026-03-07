import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// Known pilot name patterns from bank transfer descriptions → [friendly name, pilot code]
const PILOT_NAME_MAP: [RegExp, string, string][] = [
  [/RODRIGO ANTONIO GAL/i, "Rodrigo Galvez", "RG"],
  [/PABLO IGNACIO SILVA/i, "Pablo Silva", "PS"],
  [/DANIEL FERNANDO OSO/i, "Daniel Osorio", "DO"],
  [/MATIAS FELIPE GRIFFEROS/i, "Matías Grifferos", "MG"],
  [/YALUZ YEMAYA CHACON/i, "Yaluz Chacón", ""],  // Stratus fuel
  [/DANIEL ANTONIO ROCO/i, "Daniel Roco Aravena", "DRCO"],
  [/CRISTIAN ERNESTO CORTES/i, "Cristian Cortés", "CC"],
  [/JOSE MATIAS ORTUZAR/i, "Matías Ortúzar", "MO"],
  [/LUCCA MOLFINO/i, "Lucca Molfino Maggi", "LM"],
  [/FELIPE ANDRES GIACOMAN/i, "Felipe Giacoman", "FG"],
  [/ORTIZ IMITOLA VICTOR/i, "Victor Ortiz", "VO"],
  [/VICTOR MANUEL ORTIZ/i, "Victor Ortiz", "VO"],
  [/SANTIAGO.*VARAS/i, "Santiago Varas", "SV"],
  [/MAURICIO.*HENRIQUEZ/i, "Mauricio Henríquez", "MH"],
  [/GUSTAVO.*GONZALEZ/i, "Gustavo González", "GG"],
  [/IGNACIO.*OPAZO/i, "Ignacio Opazo", "IO"],
  [/NICOLAS.*LARA/i, "Nicolás Lara", "NL"],
  [/MATIAS.*CARCAMO/i, "Matías Cárcamo", "MCA"],
  [/JUAN.*PIZARRO/i, "Juan Pizarro", "JP"],
  [/FRANCISCO.*PINO/i, "Francisco Pino", "FP"],
  [/DIEGO.*YAGNAM/i, "Diego Yagnam", "DY"],
  [/EDUARDO.*ALMENDRAS/i, "Eduardo Almendras", "EAL"],
  [/GABRIEL.*CLAVIJO/i, "Gabriel Clavijo", "GC"],
  [/IGNACIO.*CONTRERAS/i, "Ignacio Contreras", "ICI"],
  [/SERGIO.*ESPINOSA/i, "Sergio Espinosa", "SE"],
  [/MATIAS.*SUAZO/i, "Matías Suazo", "MS"],
  [/FERNANDO.*ESPINOZA/i, "Fernando Espinoza", "FE"],
];

// Known non-pilot transfers
const KNOWN_TRANSFERS: [RegExp, string, string | null][] = [
  [/FINTUAL AGF/i, "Fintual", null],
  [/AEROMUNDO/i, "Aeromundo", null],
  [/LUIS URZUA SANDOVAL/i, "Luis Urzúa", null],
  [/CLAUDIO MARCELO GUA/i, "Claudio Guajardo", null],
];

function parseCartolaDescription(rawDesc: string, isIngreso: boolean): { descripcion: string; cliente: string | null; tipo: string } {
  const desc = rawDesc.trim();

  // Traspaso Internet
  if (/Traspaso Internet/i.test(desc)) {
    if (/de Cta/i.test(desc)) {
      return { descripcion: "Traspaso desde Cta. Cte.", cliente: null, tipo: "Operacional" };
    }
    return { descripcion: "Traspaso Cta. Cte. (VISA)", cliente: null, tipo: "Operacional" };
  }

  // Clean bank reference number prefix (e.g. "0768106274 TRANSF...")
  const cleanDesc = desc.replace(/^\d{10}\s+/, "");

  // Check for known pilot names (for ingresos)
  if (isIngreso) {
    for (const [pattern, name, code] of PILOT_NAME_MAP) {
      if (pattern.test(cleanDesc)) {
        return { descripcion: name, cliente: code || null, tipo: code ? "Pago piloto" : "Combustible" };
      }
    }
  }

  // Known non-pilot transfers
  for (const [pattern, name, _] of KNOWN_TRANSFERS) {
    if (pattern.test(cleanDesc)) {
      // Determine direction and tipo
      if (/TRANSF A.*FINTUAL|TRANSF.*FINTUAL.*SA/i.test(cleanDesc) && !isIngreso) {
        return { descripcion: "Reserva Avión Fintual", cliente: null, tipo: "Inversión" };
      }
      if (/TRANSF.*FINTUAL/i.test(cleanDesc) && isIngreso) {
        return { descripcion: "Rescate Fintual", cliente: null, tipo: "Inversión" };
      }
      if (/AEROMUNDO/i.test(cleanDesc)) {
        return { descripcion: "Aeromundo", cliente: null, tipo: "Overhaul" };
      }
      if (/LUIS URZUA/i.test(cleanDesc)) {
        return { descripcion: "Luis Urzúa (Overhaul Hélice)", cliente: null, tipo: "Overhaul" };
      }
      if (/CLAUDIO.*GUA/i.test(cleanDesc)) {
        return { descripcion: "Claudio Guajardo (AIRC)", cliente: null, tipo: "Mantenimiento" };
      }
      return { descripcion: name, cliente: null, tipo: "Sin clasificar" };
    }
  }

  // For unknown transfers, clean up and keep description
  let friendly = cleanDesc
    .replace(/^TRANSF\s*(A|DE)\s*/i, "")
    .replace(/^TRANSF\.\s*/i, "")
    .replace(/\s+EN PESOS$/i, "")
    .trim();

  // Truncate very long names
  if (friendly.length > 60) friendly = friendly.substring(0, 60).trim();

  return { descripcion: friendly || desc, cliente: null, tipo: "Sin clasificar" };
}

function parseCartolaDate(dateStr: string): Date {
  // Format: DD-MM-YYYY
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
    }

    // Read uploaded xlsx
    const buffer = Buffer.from(await file.arrayBuffer());
    const cartolaWb = XLSX.read(buffer, { type: "buffer" });
    const cartolaWs = cartolaWb.Sheets[cartolaWb.SheetNames[0]];
    const cartolaData = XLSX.utils.sheet_to_json<any>(cartolaWs, { header: 1, defval: "" });

    // Find header row (has "Fecha", "Detalle", etc.)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, cartolaData.length); i++) {
      const row = cartolaData[i];
      if (row && row.some((cell: any) => String(cell).toLowerCase().includes("fecha"))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      return NextResponse.json({ ok: false, error: "No se encontró encabezado con 'Fecha' en el archivo" }, { status: 400 });
    }

    // Parse cartola entries (they come newest first, we'll reverse)
    const cartolaEntries: { fecha: Date; descripcion: string; egreso: number | null; ingreso: number | null; saldo: number; rawDesc: string }[] = [];
    for (let i = headerRowIdx + 1; i < cartolaData.length; i++) {
      const row = cartolaData[i];
      if (!row || !row[0]) continue;

      const fechaStr = String(row[0]).trim();
      if (!fechaStr || !/^\d{2}-\d{2}-\d{4}$/.test(fechaStr)) continue;

      const fecha = parseCartolaDate(fechaStr);
      const rawDesc = String(row[1] || "").trim();
      const cargo = row[2] === "" || row[2] === null || row[2] === undefined ? null : Number(row[2]);
      const abono = row[3] === "" || row[3] === null || row[3] === undefined ? null : Number(row[3]);
      const saldo = Number(row[4]) || 0;

      cartolaEntries.push({
        fecha,
        descripcion: rawDesc,
        egreso: cargo && cargo > 0 ? cargo : null,
        ingreso: abono && abono > 0 ? abono : null,
        saldo,
        rawDesc,
      });
    }

    if (cartolaEntries.length === 0) {
      return NextResponse.json({ ok: false, error: "No se encontraron movimientos válidos en el archivo" }, { status: 400 });
    }

    // Reverse to chronological order (oldest first)
    cartolaEntries.reverse();

    // Read existing Movimientos.xlsx
    const movPath = path.join(process.cwd(), "Cuenta banco", "Movimientos.xlsx");
    if (!fs.existsSync(movPath)) {
      return NextResponse.json({ ok: false, error: "Movimientos.xlsx no encontrado" }, { status: 500 });
    }

    const existingBuffer = fs.readFileSync(movPath);
    const movWb = XLSX.read(existingBuffer, { type: "buffer", cellDates: true });
    const movWs = movWb.Sheets[movWb.SheetNames[0]];
    const movData = XLSX.utils.sheet_to_json<any>(movWs, { header: 1, defval: null, range: "B1" });

    // Find last row data
    let lastCorrelativo = 0;
    let lastSaldo = 0;

    // movData[0] is header, movData[1..] are data rows
    for (let i = movData.length - 1; i >= 1; i--) {
      const row = movData[i];
      if (row && row[0] != null) {
        lastCorrelativo = Number(row[0]) || 0;
        lastSaldo = Number(row[5]) || 0;
        break;
      }
    }

    // Build a set of existing entries for deduplication
    // Key: date_ISO + amount + direction
    const existingKeys = new Set<string>();
    for (let i = 1; i < movData.length; i++) {
      const row = movData[i];
      if (!row || row[0] == null) continue;
      let fecha: Date;
      if (row[1] instanceof Date) {
        fecha = row[1];
      } else if (typeof row[1] === "number") {
        // Excel serial date
        fecha = new Date((row[1] - 25569) * 86400 * 1000);
      } else {
        fecha = new Date(String(row[1]));
      }
      const dateKey = fecha.toISOString().slice(0, 10);
      const egreso = Number(row[3]) || 0;
      const ingreso = Number(row[4]) || 0;
      // Use date + amount as dedup key
      if (egreso > 0) existingKeys.add(`${dateKey}_E_${egreso}`);
      if (ingreso > 0) existingKeys.add(`${dateKey}_I_${ingreso}`);
    }

    // Filter cartola entries to only new ones
    const newEntries: typeof cartolaEntries = [];
    const skipped: string[] = [];

    for (const entry of cartolaEntries) {
      const dateKey = entry.fecha.toISOString().slice(0, 10);
      const key = entry.egreso
        ? `${dateKey}_E_${entry.egreso}`
        : `${dateKey}_I_${entry.ingreso}`;

      if (existingKeys.has(key)) {
        skipped.push(`${dateKey} ${entry.rawDesc} (${entry.egreso ? `-$${entry.egreso}` : `+$${entry.ingreso}`})`);
        continue;
      }

      newEntries.push(entry);
      // Add to set so we don't double-add within the same upload
      existingKeys.add(key);
    }

    if (newEntries.length === 0) {
      return NextResponse.json({
        ok: true,
        added: 0,
        skipped: skipped.length,
        message: "No hay movimientos nuevos para agregar. Todos ya existen en Movimientos.xlsx.",
        skippedDetails: skipped.slice(0, 10),
      });
    }

    // Append new entries to the worksheet
    // We need to use openpyxl-style approach with xlsx library
    // Re-read with full fidelity
    const ref = movWs["!ref"] || "B1:I1";
    const range = XLSX.utils.decode_range(ref);
    let nextRow = range.e.r + 1; // 0-indexed

    let currentCorrelativo = lastCorrelativo;

    const addedEntries: { correlativo: number; fecha: string; descripcion: string; egreso: number | null; ingreso: number | null; saldo: number; tipo: string; cliente: string | null }[] = [];

    for (const entry of newEntries) {
      currentCorrelativo++;
      const isIngreso = entry.ingreso != null && entry.ingreso > 0;
      const { descripcion, cliente, tipo } = parseCartolaDescription(entry.rawDesc, isIngreso);

      // Use the bank's official saldo from the cartola
      const saldo = entry.saldo;

      // Write cells (B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8 in 0-indexed from column B)
      const r = nextRow;
      movWs[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "n", v: currentCorrelativo }; // B - correlativo
      movWs[XLSX.utils.encode_cell({ r, c: 2 })] = { t: "d", v: entry.fecha }; // C - fecha
      movWs[XLSX.utils.encode_cell({ r, c: 3 })] = { t: "s", v: descripcion }; // D - descripción
      movWs[XLSX.utils.encode_cell({ r, c: 4 })] = entry.egreso ? { t: "n", v: entry.egreso } : { t: "z" }; // E - egreso
      movWs[XLSX.utils.encode_cell({ r, c: 5 })] = entry.ingreso ? { t: "n", v: entry.ingreso } : { t: "z" }; // F - ingreso
      movWs[XLSX.utils.encode_cell({ r, c: 6 })] = { t: "n", v: saldo }; // G - saldo
      movWs[XLSX.utils.encode_cell({ r, c: 7 })] = { t: "s", v: tipo }; // H - tipo
      movWs[XLSX.utils.encode_cell({ r, c: 8 })] = cliente ? { t: "s", v: cliente } : { t: "z" }; // I - cliente

      addedEntries.push({
        correlativo: currentCorrelativo,
        fecha: entry.fecha.toISOString().slice(0, 10),
        descripcion,
        egreso: entry.egreso,
        ingreso: entry.ingreso,
        saldo: Math.round(saldo),
        tipo,
        cliente,
      });

      nextRow++;
    }

    // Update range
    range.e.r = nextRow - 1;
    movWs["!ref"] = XLSX.utils.encode_range(range);

    // Write back
    const outBuffer = XLSX.write(movWb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(movPath, outBuffer);

    // Verify saldo matches cartola's most recent entry (first in original order = last after reversal)
    const lastAddedSaldo = addedEntries.length > 0 ? addedEntries[addedEntries.length - 1].saldo : lastSaldo;

    return NextResponse.json({
      ok: true,
      added: newEntries.length,
      skipped: skipped.length,
      lastCorrelativo: currentCorrelativo,
      lastSaldo: Math.round(lastAddedSaldo),
      message: `Se agregaron ${newEntries.length} movimientos nuevos.${skipped.length > 0 ? ` ${skipped.length} ya existían.` : ""}`,
      entries: addedEntries,
      skippedDetails: skipped.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Upload cartola error:", error);
    return NextResponse.json({ ok: false, error: error.message || "Error procesando archivo" }, { status: 500 });
  }
}
