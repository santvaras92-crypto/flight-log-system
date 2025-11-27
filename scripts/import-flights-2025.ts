import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  
  // Excel serial date: days since 1900-01-01 (with bug: treats 1900 as leap year, so day 1 = 1900-01-01)
  // Formula: Date = (serial - 1) days after 1900-01-01
  if (typeof v === 'number' && v > 0) {
    const excelEpoch = new Date(Date.UTC(1900, 0, 1));
    // Excel treats 1900 as leap year (bug), so day 60 is off by 1
    const offset = v > 60 ? v - 2 : v - 1;
    const date = new Date(excelEpoch.getTime() + offset * 24 * 60 * 60 * 1000);
    return date;
  }
  
  // String date '2025-03-15' or '15-03-2025'
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "."));
  return isNaN(n) ? null : n;
}

async function run() {
  const wb = xlsx.readFile("Bitacora CC-AQI.xlsx");
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("libro")) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: "" });

  const header = rows[0] ? Object.keys(rows[0]) : [];
  function pickKey(keys: string[], patterns: string[]): string | undefined {
    const lower = keys.map(k => ({ k, l: k.toLowerCase() }));
    for (const p of patterns) {
      const idx = lower.findIndex(({ l }) => l.includes(p));
      if (idx !== -1) return lower[idx].k;
    }
    return undefined;
  }

  const fechaKey = pickKey(header, ["fecha", "day", "date"]);
  const pilotoKey = pickKey(header, ["piloto"]);  // código del piloto (SV, PS, etc.)
  const tachIniKey = pickKey(header, ["tac. 1", "tac 1", "tach 1", "tac.1"]);
  const tachFinKey = pickKey(header, ["tac. 2", "tac 2", "tach 2", "tac.2"]);
  
  // Hobbs: buscar columnas que contengan "hobbs" sin "dif"
  const hobbsIniKey = pickKey(header, ["hobbs", "hobbs i", "hobbs 1"]);
  const hobbsFinKey = pickKey(header, ["hobbs", "hobbs f", "hobbs 2"]);
  
  // Matrícula: debe estar en alguna columna, por ahora asumimos CC-AQI fijo
  const matriculaKey = "CC-AQI"; // Si está en otra columna, usar pickKey

  if (!fechaKey || !hobbsIniKey || !hobbsFinKey || !tachIniKey || !tachFinKey) {
    console.error("No se encontraron columnas requeridas en la hoja 'Libro'.");
    console.error({ fechaKey, hobbsIniKey, hobbsFinKey, tachIniKey, tachFinKey });
    process.exit(1);
  }

  console.log("Columnas detectadas:", { fechaKey, hobbsIniKey, hobbsFinKey, tachIniKey, tachFinKey, pilotoKey });

  let imported = 0;
  let skipped = 0;
  let debugCount = 0;
  const allYears: number[] = [];

  for (const row of rows) {
    debugCount++;
    const fecha = toDate(row[fechaKey]);
    if (fecha) allYears.push(fecha.getFullYear());
    
    // Debug: mostrar primeras 5 filas para entender el formato
    if (debugCount <= 5) {
      const year = fecha ? fecha.getFullYear() : 'invalid';
      console.log(`Fila ${debugCount}: año=${year}, fecha raw=${row[fechaKey]}, piloto=${row[pilotoKey]}`);
    }
    
    if (!fecha || fecha.getFullYear() < 2017) { skipped++; continue; }

    const matricula = "CC-AQI"; // Fijo por ahora
    const hobbs_inicio = toNum(row[hobbsIniKey]);
    const hobbs_fin = toNum(row[hobbsFinKey]);
    const tach_inicio = toNum(row[tachIniKey]);
    const tach_fin = toNum(row[tachFinKey]);

    if (!matricula || hobbs_inicio == null || hobbs_fin == null || tach_inicio == null || tach_fin == null) { skipped++; continue; }

    const codigo = pilotoKey ? String(row[pilotoKey]).trim() : "";
    if (!codigo) { skipped++; continue; }

    // Buscar piloto por código
    const piloto = await prisma.user.findFirst({ where: { codigo } });
    if (!piloto) { skipped++; continue; }

    // Verificar aeronave
    const aircraft = await prisma.aircraft.findUnique({ where: { matricula } });
    if (!aircraft) { skipped++; continue; }

    const diff_hobbs = Number(hobbs_fin) - Number(hobbs_inicio);
    const diff_tach = Number(tach_fin) - Number(tach_inicio);
    if (diff_hobbs < 0 || diff_tach < 0) { skipped++; continue; }

    const costo = diff_hobbs * Number(piloto.tarifa_hora || 0);

    // Crear vuelo + transacción y actualizar saldos/horas componentes en transacción
    await prisma.$transaction(async (tx: any) => {
      const flight = await tx.flight.create({
        data: {
          fecha,
          hobbs_inicio,
          hobbs_fin,
          tach_inicio,
          tach_fin,
          diff_hobbs,
          diff_tach,
          costo,
          pilotoId: piloto!.id,
          aircraftId: matricula,
        },
      });

      if (costo && costo > 0) {
        await tx.transaction.create({
          data: {
            monto: -costo,
            tipo: "CARGO_VUELO",
            userId: piloto!.id,
            flightId: flight.id,
          },
        });
        await tx.user.update({
          where: { id: piloto!.id },
          data: { saldo_cuenta: { decrement: costo } },
        });
      }

      // Actualizar horas acumuladas de componentes del avión por diff_tach
      const comps = await tx.component.findMany({ where: { aircraftId: matricula } });
      for (const c of comps) {
        await tx.component.update({ where: { id: c.id }, data: { horas_acumuladas: { increment: diff_tach } } });
      }

      // Actualizar contadores actuales de aeronave
      await tx.aircraft.update({
        where: { matricula },
        data: { hobbs_actual: hobbs_fin, tach_actual: tach_fin },
      });
    });

    imported++;
  }

  console.log(`Vuelos 2025 importados: ${imported}, omitidos: ${skipped}`);
  if (allYears.length > 0) {
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);
    console.log(`Rango de fechas en archivo: ${minYear} - ${maxYear}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
