import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const cwd = process.cwd();
  const folderPath = path.join(cwd, 'Cuenta banco');
  const filePath = path.join(folderPath, 'Movimientos.xlsx');
  
  return NextResponse.json({
    cwd,
    folderExists: fs.existsSync(folderPath),
    fileExists: fs.existsSync(filePath),
    folderContents: fs.existsSync(folderPath) ? fs.readdirSync(folderPath) : [],
    fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
  });
}
