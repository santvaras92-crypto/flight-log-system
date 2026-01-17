import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

async function main() {
  console.log('📊 Analizando ratio Hobbs/Tach por rangos de 0.1h en Tach...\n');

  const flights = await prisma.flight.findMany({
    where: {
      aircraftId: 'CC-AQI',
      aprobado: true,
      diff_hobbs: { not: null, gt: 0 }, // Excluir diff_hobbs = 0 (Hobbs inoperativo)
      diff_tach: { not: null, gt: 0 },
    },
    select: {
      id: true,
      fecha: true,
      diff_hobbs: true,
      diff_tach: true,
      hobbs_inicio: true,
      hobbs_fin: true,
    },
    orderBy: { fecha: 'desc' }
  });

  console.log(`Total vuelos analizados: ${flights.length}\n`);

  // Crear buckets de 0.1h desde 0.0 hasta 5.0+
  const buckets: Map<number, { count: number; totalHobbs: number; totalTach: number; ratios: number[] }> = new Map();
  
  for (let i = 0; i <= 50; i++) {
    buckets.set(i / 10, { count: 0, totalHobbs: 0, totalTach: 0, ratios: [] });
  }

  let validFlights = 0;
  let skippedFlights = 0;

  for (const f of flights) {
    const hobbs = toNumber(f.diff_hobbs);
    const tach = toNumber(f.diff_tach);
    const hobbsInicio = toNumber(f.hobbs_inicio);
    const hobbsFin = toNumber(f.hobbs_fin);

    // Excluir vuelos donde Hobbs no avanzó (hobbs_inicio === hobbs_fin)
    if (hobbsInicio !== null && hobbsFin !== null && hobbsInicio === hobbsFin) {
      skippedFlights++;
      continue;
    }

    if (hobbs === null || tach === null || tach <= 0 || hobbs <= 0) {
      skippedFlights++;
      continue;
    }

    validFlights++;
    const ratio = hobbs / tach;

    // Determinar el bucket (redondear hacia abajo a 0.1)
    const bucketKey = Math.floor(tach * 10) / 10;
    
    // Si está fuera de rango, agregar a bucket 5.0+
    const finalKey = bucketKey > 5.0 ? 5.0 : bucketKey;

    const bucket = buckets.get(finalKey);
    if (bucket) {
      bucket.count++;
      bucket.totalHobbs += hobbs;
      bucket.totalTach += tach;
      bucket.ratios.push(ratio);
    }
  }

  console.log(`Vuelos válidos: ${validFlights}`);
  console.log(`Vuelos omitidos: ${skippedFlights}\n`);

  // Mostrar resultados
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('Rango Tach  │  N   │ Ratio Prom │ Ratio Med │  Min  │  Max  │  P25  │  P75');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  const results: Array<{ 
    range: string; 
    count: number; 
    avgRatio: number; 
    medianRatio: number; 
    minRatio: number; 
    maxRatio: number; 
    p25: number;
    p75: number;
  }> = [];

  for (const [key, data] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    if (data.count === 0) continue;

    const avgRatio = data.totalHobbs / data.totalTach;
    
    // Calcular estadísticas
    const sortedRatios = data.ratios.sort((a, b) => a - b);
    const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
    const minRatio = Math.min(...data.ratios);
    const maxRatio = Math.max(...data.ratios);
    
    const p25Index = Math.floor(sortedRatios.length * 0.25);
    const p75Index = Math.floor(sortedRatios.length * 0.75);
    const p25 = sortedRatios[p25Index] || minRatio;
    const p75 = sortedRatios[p75Index] || maxRatio;

    const rangeStr = key === 5.0 ? '5.0+    ' : `${key.toFixed(1)}-${(key + 0.1).toFixed(1)}`;
    
    console.log(
      `${rangeStr}  │ ${data.count.toString().padStart(4)} │   ${avgRatio.toFixed(3)}    │  ${medianRatio.toFixed(3)}  │ ${minRatio.toFixed(2)} │ ${maxRatio.toFixed(2)} │ ${p25.toFixed(2)} │ ${p75.toFixed(2)}`
    );

    results.push({
      range: rangeStr.trim(),
      count: data.count,
      avgRatio,
      medianRatio,
      minRatio,
      maxRatio,
      p25,
      p75
    });
  }

  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Calcular ratio global para comparación
  let globalHobbs = 0;
  let globalTach = 0;
  for (const [, data] of buckets) {
    globalHobbs += data.totalHobbs;
    globalTach += data.totalTach;
  }
  const globalRatio = globalTach > 0 ? globalHobbs / globalTach : 0;

  console.log(`📈 Ratio Global (todos los vuelos): ${globalRatio.toFixed(3)}\n`);

  // Estadísticas adicionales
  console.log('📊 Análisis por rangos:\n');
  
  const shortFlights = results.filter(r => parseFloat(r.range) < 1.0);
  const mediumFlights = results.filter(r => parseFloat(r.range) >= 1.0 && parseFloat(r.range) < 2.0);
  const longFlights = results.filter(r => parseFloat(r.range) >= 2.0);
  
  if (shortFlights.length > 0) {
    const avgShort = shortFlights.reduce((sum, r) => sum + r.avgRatio * r.count, 0) / 
                     shortFlights.reduce((sum, r) => sum + r.count, 0);
    const countShort = shortFlights.reduce((sum, r) => sum + r.count, 0);
    console.log(`   • Vuelos cortos (<1.0h Tach): ${countShort} vuelos, ratio promedio ${avgShort.toFixed(3)}`);
  }
  
  if (mediumFlights.length > 0) {
    const avgMedium = mediumFlights.reduce((sum, r) => sum + r.avgRatio * r.count, 0) / 
                      mediumFlights.reduce((sum, r) => sum + r.count, 0);
    const countMedium = mediumFlights.reduce((sum, r) => sum + r.count, 0);
    console.log(`   • Vuelos medios (1.0-2.0h Tach): ${countMedium} vuelos, ratio promedio ${avgMedium.toFixed(3)}`);
  }
  
  if (longFlights.length > 0) {
    const avgLong = longFlights.reduce((sum, r) => sum + r.avgRatio * r.count, 0) / 
                    longFlights.reduce((sum, r) => sum + r.count, 0);
    const countLong = longFlights.reduce((sum, r) => sum + r.count, 0);
    console.log(`   • Vuelos largos (≥2.0h Tach): ${countLong} vuelos, ratio promedio ${avgLong.toFixed(3)}`);
  }

  // Mostrar buckets con más y menos vuelos
  const mostCommon = results.reduce((max, r) => r.count > max.count ? r : max, results[0]);
  const leastCommon = results.filter(r => r.count > 0).reduce((min, r) => r.count < min.count ? r : min, results[0]);
  
  console.log(`\n   • Rango más común: ${mostCommon.range} con ${mostCommon.count} vuelos (ratio ${mostCommon.avgRatio.toFixed(3)})`);
  console.log(`   • Rango menos común: ${leastCommon.range} con ${leastCommon.count} vuelos (ratio ${leastCommon.avgRatio.toFixed(3)})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
