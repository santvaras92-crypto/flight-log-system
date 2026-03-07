import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

export async function GET() {
  try {
    const cwd = process.cwd();
    const xlsxPath = path.join(cwd, 'Cuenta banco', 'Movimientos.xlsx');
    
    const info: any = {
      cwd,
      xlsxPath,
      fileExists: fs.existsSync(xlsxPath),
    };

    // Check what's in the Cuenta banco folder
    const folderPath = path.join(cwd, 'Cuenta banco');
    info.folderExists = fs.existsSync(folderPath);
    if (info.folderExists) {
      info.folderContents = fs.readdirSync(folderPath);
    }

    if (!info.fileExists) {
      return NextResponse.json(info);
    }

    const workbook = XLSX.readFile(xlsxPath);
    info.sheetNames = workbook.SheetNames;
    
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    info.sheetRef = sheet['!ref'];
    
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    info.totalRows = rows.length;
    
    // Show first 3 rows to see actual structure
    info.headerRow = rows[0];
    info.row1 = rows[1];
    info.row2 = rows[2];
    
    // Show last row
    if (rows.length > 1) {
      info.lastRow = rows[rows.length - 1];
    }

    // Check what row[0] and row[1] contain in row 1
    if (rows[1]) {
      info.row1_index0 = { value: rows[1][0], type: typeof rows[1][0] };
      info.row1_index1 = { value: rows[1][1], type: typeof rows[1][1] };
      info.row1_index2 = { value: rows[1][2], type: typeof rows[1][2] };
      info.row1_length = rows[1].length;
    }

    return NextResponse.json(info);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack });
  }
}
