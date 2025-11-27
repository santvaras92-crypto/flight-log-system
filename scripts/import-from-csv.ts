import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const MATRICULA = 'CC-AQI';

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
  
  // Formato: "DD-MM-YY" (ej: "02-12-17")
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // Los meses en JS van de 0-11
  let year = parseInt(parts[2]);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  // Convertir año de 2 dígitos a 4 dígitos
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }
  
  return new Date(year, month, day);
}

function parseNumber(str: string): number | null {
  if (!str) return null;
  // Reemplazar comas por puntos y eliminar símbolos de moneda
  const cleaned = str.replace(/[$,]/g, '').replace(/\./g, '').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDecimal(str: string): number | null {
  if (!str) return null;
  // Reemplazar comas por puntos
  const cleaned = str.replace(',', '.').trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractPilotCode(nombre: string): string | null {
  if (!nombre) return null;
  const cleaned = nombre.trim().toLowerCase();
  
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
    if (cleaned.includes(apellido)) {
      return codigo;
    }
  }
  
  return null;
}

async function main() {
  console.log('🚀 Iniciando importación desde CSV...\n');
  
  const csvPath = path.join(process.cwd(), 'Base de dato AQI.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  console.log(`Total líneas: ${lines.length}`);
  
  // Cargar pilotos
  const pilotos = await prisma.user.findMany({ where: { rol: 'PILOTO' } });
  const pilotosByCode = new Map(pilotos.map(p => [p.codigo, p]));
  console.log(`Pilotos cargados: ${pilotos.length}\n`);
  
  // Verificar aircraft
  const aircraft = await prisma.aircraft.findUnique({ where: { matricula: MATRICULA } });
  if (!aircraft) {
    console.log('❌ Aeronave no encontrada');
    return;
  }
  
  // Limpiar vuelos existentes
  console.log('🗑️  Limpiando vuelos existentes...');
  await prisma.transaction.deleteMany({});
  await prisma.flight.deleteMany({});
  console.log('✅ Vuelos eliminados\n');
  
  let imported = 0;
  let skipped = 0;
  
  // Saltar header
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    
    const fechaStr = fields[0];
    const tach_i = parseDecimal(fields[2]);
    const tach_f = parseDecimal(fields[3]);
    const diff_tach = parseDecimal(fields[4]);
    const hobbs_i = parseDecimal(fields[5]);
    const hobbs_f = parseDecimal(fields[6]);
    const diff_hobbs = parseDecimal(fields[7]);
    const pilotoStr = fields[8];
    const tarifaStr = fields[11];
    const yearStr = fields[18];
    const monthStr = fields[19];
    
    // Usar año y mes de las columnas finales si están disponibles
    let fecha = parseDate(fechaStr);
    if (!fecha && yearStr && monthStr) {
      const monthMap: Record<string, number> = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
      };
      const year = parseInt(yearStr);
      const month = monthMap[monthStr.trim()];
      if (!isNaN(year) && month !== undefined) {
        fecha = new Date(year, month, 1);
      }
    }
    
    if (!fecha) {
      skipped++;
      continue;
    }
    
    if (imported < 3) {
      console.log(`Línea ${i}: fechaStr="${fechaStr}", year="${yearStr}", month="${monthStr}", fecha=${fecha.toISOString()}`);
    }
    
    const codigoPiloto = extractPilotCode(pilotoStr);
    if (!codigoPiloto) {
      skipped++;
      continue;
    }
    
    const piloto = pilotosByCode.get(codigoPiloto);
    if (!piloto) {
      skipped++;
      continue;
    }
    
    // Usar valores de diferencia si los inicios/fines están vacíos
    let hobbs_inicio = hobbs_i;
    let hobbs_fin = hobbs_f;
    let tach_inicio = tach_i;
    let tach_fin = tach_f;
    
    // Si no hay valores directos, intentar calcular desde diferencias
    if ((hobbs_inicio == null || hobbs_fin == null) && diff_hobbs != null) {
      if (hobbs_inicio == null && tach_inicio != null) {
        hobbs_inicio = tach_inicio;
      }
      if (hobbs_inicio != null) {
        hobbs_fin = hobbs_inicio + diff_hobbs;
      }
    }
    
    if ((tach_inicio == null || tach_fin == null) && diff_tach != null) {
      if (tach_inicio == null && hobbs_inicio != null) {
        tach_inicio = hobbs_inicio;
      }
      if (tach_inicio != null) {
        tach_fin = tach_inicio + diff_tach;
      }
    }
    
    if (hobbs_inicio == null || hobbs_fin == null || tach_inicio == null || tach_fin == null) {
      skipped++;
      continue;
    }
    
    const diff_h = hobbs_fin - hobbs_inicio;
    const diff_t = tach_fin - tach_inicio;
    
    if (diff_h <= 0 || diff_t <= 0) {
      skipped++;
      continue;
    }
    
    const tarifa = parseNumber(tarifaStr) || 0;
    const costo = diff_h * tarifa;
    
    try {
      await prisma.$transaction(async (tx: any) => {
        const flight = await tx.flight.create({
          data: {
            fecha,
            hobbs_inicio,
            hobbs_fin,
            tach_inicio,
            tach_fin,
            diff_hobbs: diff_h,
            diff_tach: diff_t,
            costo,
            pilotoId: piloto.id,
            aircraftId: MATRICULA,
          },
        });
        
        await tx.transaction.create({
          data: {
            userId: piloto.id,
            tipo: 'CARGO_VUELO',
            monto: costo,
          },
        });
        
        const componentes = await tx.component.findMany({ where: { aircraftId: MATRICULA } });
        for (const c of componentes) {
          await tx.component.update({
            where: { id: c.id },
            data: { horas_acumuladas: { increment: diff_t } }
          });
        }
      });
      
      imported++;
      if (imported % 100 === 0) {
        console.log(`Importados: ${imported}...`);
      }
    } catch (error) {
      skipped++;
    }
  }
  
  console.log(`\n✅ Importación completa`);
  console.log(`   Vuelos importados: ${imported}`);
  console.log(`   Omitidos: ${skipped}`);
  
  const years = await prisma.$queryRaw`
    SELECT strftime('%Y', datetime(fecha/1000, 'unixepoch')) as año, COUNT(*) as cantidad 
    FROM Flight 
    GROUP BY año 
    ORDER BY año
  `;
  console.log('\n📊 Vuelos por año:');
  console.table(years);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
