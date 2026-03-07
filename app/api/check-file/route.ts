import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

export async function GET() {
  const cwd = process.cwd();
  const filePath = path.join(cwd, 'Cuenta banco', 'Movimientos.xlsx');
  
  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found", filePath });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    
    // Test the exact same parsing logic as page.tsx
    const movements: any[] = [];
    let skipped = 0;
    let errors: string[] = [];
    
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      const rowInfo = {
        index: i,
        raw: row,
        length: row ? row.length : 0,
        val0: row ? row[0] : 'N/A',
        val0Type: row ? typeof row[0] : 'N/A',
        val1: row ? row[1] : 'N/A',
        val1Type: row ? typeof row[1] : 'N/A',
        checkFail: !row || !row[0],
      };
      
      if (!row || !row[0]) { 
        skipped++; 
        errors.push(`Row ${i} skipped: row=${!!row}, row[0]=${row ? row[0] : 'null'}`);
        movements.push({ skipped: true, ...rowInfo });
        continue; 
      }
      
      const correlativo = Number(row[0]) || i;
      let fecha = '';
      const rawFecha = row[1];
      if (rawFecha instanceof Date) {
        fecha = rawFecha.toISOString().slice(0, 10);
      } else if (typeof rawFecha === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + rawFecha * 86400000);
        fecha = d.toISOString().slice(0, 10);
      } else if (typeof rawFecha === 'string') {
        fecha = rawFecha;
      }
      
      movements.push({
        parsed: true,
        correlativo,
        fecha,
        descripcion: String(row[2] || '').trim(),
        egreso: row[3] ? Number(row[3]) : null,
        ingreso: row[4] ? Number(row[4]) : null,
        saldo: Number(row[5]) || 0,
        tipo: String(row[6] || '').trim(),
        cliente: row[7] ? String(row[7]).trim() : null,
        ...rowInfo,
      });
    }

    return NextResponse.json({
      sheetName,
      ref,
      totalRows: rows.length,
      headerRow: rows[0],
      skipped,
      errors,
      firstRows: movements,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack });
  }
}
