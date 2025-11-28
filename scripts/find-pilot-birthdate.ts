import xlsx from "xlsx";
import path from "path";

async function run() {
  const filePath = path.join(process.cwd(), "Bitacora CC-AQI.xlsx");
  const wb = xlsx.readFile(filePath);
  
  // Buscar hoja que contenga "Pilotos"
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("pilotos"));
  
  if (!sheetName) {
    console.log("No se encontró hoja de Pilotos");
    return;
  }
  
  console.log(`Leyendo hoja: ${sheetName}`);
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: "" });
  
  if (rows.length === 0) {
    console.log("Hoja vacía");
    return;
  }

  // Imprimir headers
  console.log("Columnas encontradas:", Object.keys(rows[0]));

  // Buscar Franco Acosta
  const targetName = "Franco Acosta";
  const pilot = rows.find(r => {
    const values = Object.values(r).map(v => String(v).toLowerCase());
    return values.some(v => v.includes(targetName.toLowerCase()));
  });

  if (pilot) {
    console.log(`\nDatos encontrados para ${targetName}:`);
    console.log(pilot);
  } else {
    console.log(`\nNo se encontró a ${targetName} en el Excel.`);
  }
}

run();
