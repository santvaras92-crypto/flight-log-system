import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

/**
 * PATCH /api/update-movimiento
 * Updates a single cell in Movimientos.xlsx by correlativo number.
 * Body: { correlativo: number, field: 'tipo' | 'cliente' | 'descripcion', value: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { correlativo, field, value } = body;

    if (!correlativo || !field) {
      return NextResponse.json({ ok: false, error: "correlativo y field son requeridos" }, { status: 400 });
    }

    const allowedFields = ["tipo", "cliente", "descripcion"];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ ok: false, error: `Campo '${field}' no permitido. Solo: ${allowedFields.join(", ")}` }, { status: 400 });
    }

    const xlsxPath = path.join(process.cwd(), "Cuenta banco", "Movimientos.xlsx");
    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json({ ok: false, error: "Movimientos.xlsx no encontrado" }, { status: 404 });
    }

    const buffer = fs.readFileSync(xlsxPath);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json({ ok: false, error: "Hoja no encontrada" }, { status: 500 });
    }

    const range = XLSX.utils.decode_range(ws["!ref"] || "B1:I1");

    // Column mapping (B=1 correlativo, C=2 fecha, D=3 descripcion, E=4 egreso, F=5 ingreso, G=6 saldo, H=7 tipo, I=8 cliente)
    const fieldToCol: Record<string, number> = {
      descripcion: 3, // column D
      tipo: 7,        // column H
      cliente: 8,     // column I
    };

    const targetCol = fieldToCol[field];
    if (targetCol === undefined) {
      return NextResponse.json({ ok: false, error: `Campo '${field}' no mapeado` }, { status: 500 });
    }

    // Find the row with matching correlativo (column B = col index 1)
    let foundRow = -1;
    for (let r = range.s.r + 1; r <= range.e.r; r++) { // skip header row
      const cellAddr = XLSX.utils.encode_cell({ r, c: 1 }); // column B
      const cell = ws[cellAddr];
      const cellVal = cell ? (typeof cell.v === "number" ? cell.v : parseInt(String(cell.v), 10)) : null;
      if (cellVal === correlativo) {
        foundRow = r;
        break;
      }
    }

    if (foundRow === -1) {
      return NextResponse.json({ ok: false, error: `Correlativo #${correlativo} no encontrado` }, { status: 404 });
    }

    // Update the cell
    const targetAddr = XLSX.utils.encode_cell({ r: foundRow, c: targetCol });
    const newValue = (value ?? "").toString().trim();

    if (newValue === "") {
      // Remove cell if empty
      delete ws[targetAddr];
    } else {
      ws[targetAddr] = { t: "s", v: newValue };
    }

    // Write back
    const newBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    fs.writeFileSync(xlsxPath, newBuffer);

    return NextResponse.json({
      ok: true,
      correlativo,
      field,
      value: newValue,
      message: `Correlativo #${correlativo}: ${field} actualizado a "${newValue}"`,
    });
  } catch (err: any) {
    console.error("Error updating movimiento:", err);
    return NextResponse.json({ ok: false, error: err.message || "Error interno" }, { status: 500 });
  }
}
