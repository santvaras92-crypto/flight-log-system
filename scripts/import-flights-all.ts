import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  
  // Excel serial date: days since 1900-01-01 (with Excel leap year bug)
  if (typeof v === 'number' && v > 0) {
    const excelEpoch = new Date(Date.UTC(1900, 0, 1));
    const offset = v > 60 ? v - 2 : v - 1;
    const date = new Date(excelEpoch.getTime() + offset * 24 * 60 * 60 * 1000);
    return date;
  }
  
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

function extractPilotCode(nombre: string): string | null {
  if (!nombre) return null;
  const cleaned = nombre.trim();
  
  // Mapeo directo de apellidos a códigos (basado en tabla de pilotos)
  const apellidoMap: Record<string, string> = {
    'garcia': 'JT', 'varas': 'SV', 'd\'angelo': 'EA', 'dangelo': 'EA',
    'castro': 'AC', 'torrealba': 'AT', 'fernandez': 'AF',
    'pietra': 'AP', 'jofré': 'BJ', 'jofre': 'BJ',
    'ramirez': 'BR', 'ramírez': 'BR', 'fonfach': 'CF',
    'moreno': 'CM', 'piraino': 'CP', 'romero': 'CR',
    'ross': 'CRO', 'valencia': 'CV', 'valenzuela': 'CVA',
    'calderon': 'DC', 'calderón': 'DC', 'lewin': 'DL',
    'barraza': 'DB', 'gutierrez': 'DG', 'gutiérrez': 'DG',
    'villalon': 'DV', 'villalón': 'DV', 'yanine': 'DY',
    'aguilera': 'EA', 'danke': 'ED', 'sanino': 'ES',
    'encina': 'FE', 'hernandez': 'FHE', 'hernández': 'FHE',
    'hidalgo': 'FH', 'lizana': 'FL', 'mimica': 'FM',
    'caceres': 'FC', 'cáceres': 'FC', 'puente': 'FP',
    'torres': 'GT', 'caragol': 'GC', 'garlaschi': 'GG',
    'latorre': 'GL', 'allende': 'IA', 'roure': 'IR',
    'opazo': 'IO', 'cifuentes': 'ICI', 'cortez': 'IC',
    'matheu': 'JM', 'robledo': 'JR', 'bermedo': 'JB',
    'arnello': 'JA', 'pizarro': 'JP', 'chian': 'JC',
    'donoso': 'JCD', 'bonilla': 'JPB', 'plaza': 'JPL',
    'llorente': 'JL', 'gonzalez': 'MG', 'gonzález': 'MG',
    'montero': 'MM', 'ortuzar': 'MO', 'ortúzar': 'MO',
    'osses': 'MOS', 'sougarret': 'MS', 'camposano': 'MC',
    'candia': 'MCA', 'herrada': 'MH', 'lucero': 'MLU',
    'lobos': 'ML', 'alcantara': 'MA', 'alcántara': 'MA',
    'villagra': 'MV', 'elias': 'NE', 'elías': 'NE',
    'espinoza': 'NES', 'leon': 'NL', 'león': 'NL',
    'vega': 'NV', 'agliati': 'PA', 'silva': 'PS',
    'valle': 'PV', 'fuentes': 'RF', 'alvarez': 'RA',
    'lira': 'RL', 'mejia': 'RM', 'mejía': 'RM',
    'galvez': 'RG', 'gálvez': 'RG', 'aranguiz': 'SA',
    'aránguiz': 'SA', 'casas': 'SC', 'martin': 'SM',
    'martín': 'SM', 'navarro': 'SN', 'asenjo': 'VAS',
    'amengual': 'VA', 'bascunan': 'VBA', 'bascuñan': 'VBA',
    'beoriza': 'VB', 'ortiz': 'VO'
  };
  
  const lower = cleaned.toLowerCase();
  
  // Buscar por apellido en el nombre completo
  for (const [apellido, codigo] of Object.entries(apellidoMap)) {
    if (lower.includes(apellido)) return codigo;
  }
  
  // Fallback: tomar iniciales (primera letra de cada palabra)
  const words = cleaned.split(/[\s.]+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }
  
  return null;
}

function extractInitials(name: string): string[] {
  // "S. Varas" → ["SV", "S"]
  // "JT. Garcia" → ["JTG", "JT"]
  const parts = name.trim().split(/\s+/);
  const results: string[] = [];
  
  // Opción 1: todas las iniciales
  let allInitials = '';
  for (const part of parts) {
    const cleaned = part.replace(/\./g, '');
    if (cleaned.length > 0) {
      allInitials += cleaned[0].toUpperCase();
    }
  }
  if (allInitials) results.push(allInitials);
  
  // Opción 2: solo el primer término sin punto
  const firstTerm = parts[0].replace(/\./g, '').toUpperCase();
  if (firstTerm && !results.includes(firstTerm)) results.push(firstTerm);
  
  return results;
}

async function run() {
  const wb = xlsx.readFile("Bitacora CC-AQI.xlsx");
  const ws = wb.Sheets['Libro'];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });
  
  console.log(`Total filas: ${rows.length}`);
  
    // Precargar todos los pilotos en memoria para evitar queries repetidos
    const allPilotos = await prisma.user.findMany();
    const pilotosByCode = new Map(allPilotos.map((p: any) => [p.codigo, p]));
    console.log(`Pilotos cargados: ${allPilotos.length}`);
  
    // Verificar aeronave
    const MATRICULA = "CC-AQI";
    const aircraft = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
    if (!aircraft) {
      console.error(`Aeronave ${MATRICULA} no encontrada`);
      return;
    }
  
  // Columnas por índice (basado en inspección del Excel)
  const COL_FECHA = 1;
  const COL_HOBBS_I = 7;
  const COL_HOBBS_F = 8;
  const COL_TACH_I = 4;  // Tac. 1
  const COL_TACH_F = 5;  // Tac. 2
  const COL_PILOTO = 10;
  const COL_TARIFA = 14; // Tarifa (USD/CLP as per sheet)

  let imported = 0;
  let skipped = 0;
  const allYears: number[] = [];
  
  // Cache de últimos valores conocidos para inferir faltantes
  let lastHobbsI: number | null = null;
  let lastHobbsF: number | null = null;
  let lastTachI: number | null = null;
  let lastTachF: number | null = null;

  // Comenzar desde fila 2 (índice 1) ya que fila 0 es header
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    
    const fecha = toDate(row[COL_FECHA]);
    if (!fecha || isNaN(fecha.getTime())) { skipped++; continue; }
    
    const year = fecha.getFullYear();
    allYears.push(year);
    // Comentado para importar TODOS los vuelos históricos
    // if (year !== 2025) { skipped++; continue; }

    // Debug primeras 15 filas para entender estructura
    if (imported + skipped < 10) {
      const codigo = extractPilotCode(row[COL_PILOTO] || '');
      console.log(`\nFila ${i}: fecha=${fecha.toISOString().slice(0,10)}, tach_i_raw=${row[COL_TACH_I]}, tach_f_raw=${row[COL_TACH_F]}, piloto=${row[COL_PILOTO]} → ${codigo}`);
    }

    // Leer valores originales
    let tach_inicio = toNum(row[COL_TACH_I]);
    let tach_fin = toNum(row[COL_TACH_F]);
    
    // Si Tach I está vacío, usar último Tach F conocido
    if (tach_inicio == null && lastTachF != null) {
      tach_inicio = lastTachF;
    }
    
    // Si Tach F está vacío, buscar próximo valor válido
    if (tach_fin == null) {
      for (let j = i + 1; j < Math.min(i + 100, rows.length); j++) {
        const nextTI = toNum(rows[j][COL_TACH_I]);
        const nextTF = toNum(rows[j][COL_TACH_F]);
        if (nextTI != null) { tach_fin = nextTI; break; }
        if (nextTF != null) { tach_fin = nextTF; break; }
      }
    }

    // Actualizar cache con valores válidos encontrados
    if (toNum(row[COL_TACH_I]) != null) lastTachI = toNum(row[COL_TACH_I])!;
    if (toNum(row[COL_TACH_F]) != null) lastTachF = toNum(row[COL_TACH_F])!;

  // Copiar Tach a Hobbs (ya que columnas Hobbs están vacías en el Excel)
  const hobbs_inicio = tach_inicio;
  const hobbs_fin = tach_fin;

    if (hobbs_inicio == null || hobbs_fin == null || tach_inicio == null || tach_fin == null) {
      if (imported + skipped < 10) {
        console.log(`  Fila ${i} skip: hobbs_i=${hobbs_inicio}, hobbs_f=${hobbs_fin}, tach_i=${tach_inicio}, tach_f=${tach_fin}`);
      }
      skipped++;
      continue;
    }

    const pilotoNombre = row[COL_PILOTO] ? String(row[COL_PILOTO]).trim() : "";
    if (!pilotoNombre) { skipped++; continue; }

    // Extraer código del piloto usando mapeo de apellidos
    const codigoPiloto = extractPilotCode(pilotoNombre);
    if (!codigoPiloto) {
      skipped++;
      continue;
    }

    // Buscar piloto en caché
    const piloto = pilotosByCode.get(codigoPiloto);
    
    if (!piloto) {
      skipped++;
      continue;
    }

    // Verificar aeronave
    const aircraft = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
    if (!aircraft) { skipped++; continue; }

    const diff_hobbs = hobbs_fin - hobbs_inicio;
    const diff_tach = tach_fin - tach_inicio;
    if (diff_hobbs < 0 || diff_tach < 0) {
      if (imported + skipped < 10) {
        console.log(`  Skip (diff negativo): diff_hobbs=${diff_hobbs}, diff_tach=${diff_tach}`);
      }
      skipped++;
      continue;
    }

    // Calcular costo desde Tarifa por fila si existe (fallback 0)
    const tarifa = toNum(row[COL_TARIFA]) || 0;
    const costo = diff_hobbs * Number(piloto.tarifa_hora || 0);
    
    if (imported + skipped < 10) {
      console.log(`  ✓ Importando: hobbs ${hobbs_inicio}→${hobbs_fin} (${diff_hobbs}), tach ${tach_inicio}→${tach_fin} (${diff_tach}), costo=${costo}`);
    }

    try {
      // Crear vuelo + transacción y actualizar saldos/horas componentes
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
            pilotoId: piloto.id,
            aircraftId: MATRICULA,
          },
        });

        // Crear transacción para el cargo del vuelo
        await tx.transaction.create({
          data: {
            userId: piloto.id,
            tipo: 'CARGO_VUELO',
            monto: costo,
          },
        });

        // Actualizar horas acumuladas de componentes
        const componentes = await tx.component.findMany({ where: { aircraftId: MATRICULA } });
        for (const c of componentes) {
          await tx.component.update({
            where: { id: c.id },
            data: { horas_acumuladas: { increment: diff_tach } }
          });
        }

        // Actualizar contadores actuales de aeronave
        await tx.aircraft.update({
          where: { matricula: MATRICULA },
          data: { hobbs_actual: hobbs_fin, tach_actual: tach_fin },
        });
      });

      imported++;
      if (imported % 500 === 0) console.log(`Importados: ${imported}...`);
    } catch (error) {
            if (imported + skipped < 10) {
              console.log(`  ✗ Error en fila ${i}:`, error instanceof Error ? error.message : error);
            }
      skipped++;
    }
  }

  console.log(`\nVuelos importados: ${imported}, omitidos: ${skipped}`);
  if (allYears.length > 0) {
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);
    console.log(`Rango de fechas en archivo: ${minYear} - ${maxYear}`);
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
