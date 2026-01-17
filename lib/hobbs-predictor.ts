import { prisma } from './prisma';

function toNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function getTachBucket(tachDelta: number): string {
  if (tachDelta >= 5.0) return '5.0+';
  const bucket = Math.floor(tachDelta * 10) / 10;
  return `${bucket.toFixed(1)}-${(bucket + 0.1).toFixed(1)}`;
}

/**
 * Calcula los ratios Hobbs/Tach por bucket basándose en datos históricos
 * Excluye vuelos con Hobbs inoperativo (diff_hobbs = 0 o hobbs_inicio = hobbs_fin)
 */
export async function calculateHobbsTachRatios(
  aircraftId: string = 'CC-AQI'
): Promise<{
  ratiosByBucket: Record<string, number>;
  globalRatio: number;
  bucketStats: Record<string, { count: number; avgRatio: number; median: number }>;
}> {
  const flights = await prisma.flight.findMany({
    where: {
      aircraftId,
      aprobado: true,
      diff_hobbs: { not: null, gt: 0 },
      diff_tach: { not: null, gt: 0 },
    },
    select: {
      diff_hobbs: true,
      diff_tach: true,
      hobbs_inicio: true,
      hobbs_fin: true,
    },
  });

  // Crear buckets
  const buckets: Map<string, { totalHobbs: number; totalTach: number; count: number; ratios: number[] }> = new Map();

  for (const f of flights) {
    const hobbs = toNumber(f.diff_hobbs);
    const tach = toNumber(f.diff_tach);
    const hobbsInicio = toNumber(f.hobbs_inicio);
    const hobbsFin = toNumber(f.hobbs_fin);

    // Excluir vuelos donde Hobbs no avanzó
    if (hobbsInicio !== null && hobbsFin !== null && hobbsInicio === hobbsFin) {
      continue;
    }

    if (hobbs === null || tach === null || tach <= 0 || hobbs <= 0) continue;

    const bucket = getTachBucket(tach);
    
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { totalHobbs: 0, totalTach: 0, count: 0, ratios: [] });
    }

    const data = buckets.get(bucket)!;
    data.totalHobbs += hobbs;
    data.totalTach += tach;
    data.count++;
    data.ratios.push(hobbs / tach);
  }

  // Calcular ratio global como fallback
  const globalTotalHobbs = Array.from(buckets.values()).reduce((sum, b) => sum + b.totalHobbs, 0);
  const globalTotalTach = Array.from(buckets.values()).reduce((sum, b) => sum + b.totalTach, 0);
  const globalRatio = globalTotalTach > 0 ? globalTotalHobbs / globalTotalTach : 1.245;

  // Construir mapa de ratios
  const ratiosByBucket: Record<string, number> = {};
  const bucketStats: Record<string, { count: number; avgRatio: number; median: number }> = {};

  for (const [bucket, data] of buckets) {
    if (data.count >= 3 && data.totalTach > 0) {
      const avgRatio = data.totalHobbs / data.totalTach;
      const sortedRatios = data.ratios.sort((a, b) => a - b);
      const median = sortedRatios[Math.floor(sortedRatios.length / 2)];
      
      ratiosByBucket[bucket] = avgRatio;
      bucketStats[bucket] = {
        count: data.count,
        avgRatio,
        median,
      };
    }
  }

  return {
    ratiosByBucket,
    globalRatio,
    bucketStats,
  };
}

/**
 * Obtiene el ratio esperado para un delta de Tach específico
 * Usa ratios históricos por bucket
 */
export async function getExpectedRatio(
  tachDelta: number,
  aircraftId: string = 'CC-AQI'
): Promise<{
  expectedRatio: number;
  bucket: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sampleSize: number;
  minRatio: number;
  maxRatio: number;
}> {
  const { ratiosByBucket, globalRatio, bucketStats } = await calculateHobbsTachRatios(aircraftId);

  const bucket = getTachBucket(tachDelta);
  const expectedRatio = ratiosByBucket[bucket] || globalRatio;
  const sampleSize = bucketStats[bucket]?.count || 0;

  // Determinar confianza basada en cantidad de vuelos en el bucket
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (sampleSize >= 20) confidence = 'HIGH';
  else if (sampleSize >= 10) confidence = 'MEDIUM';
  else confidence = 'LOW';

  // Rangos aceptables basados en datos históricos
  // Para vuelos cortos (<1.0h): rango más amplio
  // Para vuelos largos (>=2.0h): rango más estrecho
  let minRatio: number;
  let maxRatio: number;

  if (tachDelta < 1.0) {
    // Vuelos cortos: ratio entre 1.00 y 2.00 (muy variable)
    minRatio = 1.00;
    maxRatio = 2.00;
  } else if (tachDelta < 2.0) {
    // Vuelos medios: ratio entre 1.00 y 1.70
    minRatio = 1.00;
    maxRatio = 1.70;
  } else {
    // Vuelos largos: ratio entre 1.00 y 1.40
    minRatio = 1.00;
    maxRatio = 1.40;
  }

  return {
    expectedRatio: Number(expectedRatio.toFixed(3)),
    bucket,
    confidence,
    sampleSize,
    minRatio,
    maxRatio,
  };
}

/**
 * Predice el Hobbs final basándose en el delta de Tach
 * Usado cuando el Hobbs está inoperativo
 */
export async function predictHobbsFromTach(
  tachDelta: number,
  aircraftId: string = 'CC-AQI'
): Promise<{
  predictedHobbsDelta: number;
  ratio: number;
  bucket: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sampleSize: number;
}> {
  const { expectedRatio, bucket, confidence, sampleSize } = await getExpectedRatio(tachDelta, aircraftId);

  return {
    predictedHobbsDelta: Number((tachDelta * expectedRatio).toFixed(1)),
    ratio: expectedRatio,
    bucket,
    confidence,
    sampleSize,
  };
}
