import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const wb = xlsx.readFile("Bitacora CC-AQI.xlsx");
  // Buscar hoja que contenga "Pilotos"
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("pilotos")) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: "" });

  // Asumimos columnas: "codigo" y "piloto" (case-insensitive)
  let imported = 0;
  for (const row of rows) {
    const keys = Object.keys(row);
    const codigoKey = keys.find(k => k.toLowerCase().includes("codigo"));
    const pilotoKey = keys.find(k => k.toLowerCase().includes("piloto"));
    if (!codigoKey || !pilotoKey) continue;
    const codigo = String(row[codigoKey]).trim();
    const nombre = String(row[pilotoKey]).trim();
    if (!codigo || !nombre) continue;

    // Crear o actualizar usuario con rol PILOTO
    const existing = await prisma.user.findFirst({ where: { codigo } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { nombre } });
    } else {
      await prisma.user.create({ data: {
        nombre,
        codigo,
        email: `${codigo}@piloto.local`,
        rol: "PILOTO",
        saldo_cuenta: 0,
        tarifa_hora: 0,
        password: "", // sin acceso
      }});
    }
    imported++;
  }
  console.log(`Importados/actualizados: ${imported}`);
}

run().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
