import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  let year = parseInt(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 100) year += year < 50 ? 2000 : 1900;
  return new Date(year, month, day);
}

function parseNumberCLP(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[$,]/g, '').replace(/\./g, '').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDecimal(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(',', '.').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractPilotCode(nombre: string): string | null {
  if (!nombre) return null;
  const cleaned = nombre.trim().toLowerCase();
  const apellidoMap: Record<string, string> = {
    'garcia': 'JT', 'varas': 'SV', "d'angelo": 'EA', 'dangelo': 'EA',
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
    'diez': 'ID', 'dias': 'JD', 'díaz': 'JD',
    'correa': 'JC', 'matheu': 'JM', 'vergara': 'JVE',
    'vera': 'JV', 'soto': 'KS', 'hola': 'LH',
    'iturrieta': 'LI', 'reyes': 'LR', 'vuskovic': 'LV',
    'bravo': 'MB', 'cid': 'MC', 'donoso': 'MD',
    'gonzalez': 'MG', 'gonzález': 'MG', 'maccioni': 'MM',
    'poblete': 'MP', 'rubio': 'MR', 'schulz': 'MS',
    'cisternas': 'NC', 'inostroza': 'NI', 'nahuelpan': 'NN',
    'balmaceda': 'OB', 'prado': 'OP', 'oporto': 'OPO',
    'araya': 'PA', 'martinez': 'PM', 'martínez': 'PM',
    'perez': 'PP', 'pérez': 'PP', 'pacheco': 'PPA',
    'benavides': 'RB', 'cañas': 'RC', 'canas': 'RC',
    'mejia': 'RM', 'mejía': 'RM', 'alvarez': 'RA',
    'álvarez': 'RA', 'rivera': 'RR', 'rodriguez': 'RRO',
    'rodríguez': 'RRO', 'tellez': 'RT', 'téllez': 'RT',
    'ugarte': 'RU', 'valdivia': 'RV', 'diaz': 'SD',
    'díaz': 'SD', 'garrido': 'SG', 'guzman': 'SU',
    'guzmán': 'SU', 'villar': 'TV', 'gonzales': 'VG',
    'vial': 'VV', 'tapia': 'WT', 'canales': 'YC'
  };
  for (const [apellido, codigo] of Object.entries(apellidoMap)) {
    if (cleaned.includes(apellido)) return codigo;
  }
  return null;
}

async function findFlightIdByDatePilotDiff(date: Date, pilotoId: number, diffH: number) {
  const start = new Date(date);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate()+1);
  const flights = await prisma.flight.findMany({
    where: { pilotoId, fecha: { gte: start, lt: end } },
    select: { id: true, diff_hobbs: true, costo: true }
  });
  if (flights.length === 1) return flights[0];
  // choose closest diff_hobbs
  let best = null as null | { id: number; diff_hobbs: any; costo: any };
  let bestDelta = Infinity;
  for (const f of flights) {
    const delta = Math.abs(Number(f.diff_hobbs) - diffH);
    if (delta < bestDelta) { bestDelta = delta; best = f as any; }
  }
  return best;
}

async function main() {
  const fix = process.argv.includes('--fix');
  console.log(`\n🔎 Audit Rate & Instructor/SP (fix=${fix})\n`);
  const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0];
  console.log(`Header: ${header.split(';').slice(0,14).join(';')}...`);

  const pilotos = await prisma.user.findMany({ where: { rol: 'PILOTO' }, select: { id: true, codigo: true, nombre: true } });
  const byCode = new Map<string | null | undefined, { id: number; codigo: string | null; nombre: string }>(pilotos.map(p => [p.codigo, p] as any));

  let checked = 0, ok = 0, rateMismatch = 0, instrMismatch = 0, fixed = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (!fields.length) continue;
    const fecha = parseDate(fields[0]);
    const diff_h = parseDecimal(fields[7]) ?? 0;
    const pilotoStr = fields[8] || '';
    const tarifaCSV = parseNumberCLP(fields[11]) ?? 0;
    const instructorCSV = (fields[12] || '').trim();

    if (!fecha) continue; // skip rows without valid date

    // resolve pilot code similar to import
    let codigo = extractPilotCode(pilotoStr);
    if (!codigo) {
      const m = pilotoStr.match(/([A-ZÁÉÍÓÚÑ])[\.]\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/);
      if (m) {
        const initial = m[1].toUpperCase();
        const apellido = m[2].normalize('NFD').replace(/[^A-Za-z]/g, '').substring(0,2).toUpperCase();
        codigo = `${initial}${apellido}`;
      }
    }
    if (!codigo) continue; // skip unknown non-person tags

    const piloto = byCode.get(codigo);
    if (!piloto) continue; // pilot not found in DB

    const flight = await findFlightIdByDatePilotDiff(fecha, piloto.id, diff_h);
    if (!flight) continue;

    checked++;

    const expectedCosto = Math.round((tarifaCSV || 0) * (diff_h || 0));
    const costoDB = Number(flight.costo) || 0;
    const rateOk = Math.abs(expectedCosto - costoDB) <= 1; // allow 1 CLP rounding

    const fRow = await prisma.flight.findUnique({ where: { id: (flight as any).id }, select: { instructor: true } });
    const instructorDB = (fRow?.instructor || '').trim();
    const instrOk = (instructorDB || '') === (instructorCSV || '');

    if (!rateOk) rateMismatch++;
    if (!instrOk) instrMismatch++;

    if (fix && (!rateOk || !instrOk)) {
      await prisma.flight.update({
        where: { id: (flight as any).id },
        data: {
          ...( !rateOk ? { costo: expectedCosto } : {} ),
          ...( !instrOk ? { instructor: instructorCSV || null } : {} ),
        }
      });
      fixed++;
    }
  }

  console.log(`\n📋 Checked: ${checked}`);
  console.log(`✅ OK: ${ok}`);
  console.log(`⚠️  Rate mismatches: ${rateMismatch}`);
  console.log(`⚠️  Instructor mismatches: ${instrMismatch}`);
  if (fix) console.log(`🛠️  Fixed: ${fixed}`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
