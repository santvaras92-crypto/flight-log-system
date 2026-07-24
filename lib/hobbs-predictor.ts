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

// ---------------------------------------------------------------------------
// Sample loading
// ---------------------------------------------------------------------------

interface RatioSample {
  tach: number;   // diff_tach
  ratio: number;  // diff_hobbs / diff_tach
  fecha: Date;
}

// Sanity bounds: real Hobbs/Tach ratios for this aircraft live well inside
// this window; anything outside is a data-entry error or a broken meter.
const RATIO_HARD_MIN = 0.9;
const RATIO_HARD_MAX = 2.5;

async function loadRatioSamples(aircraftId: string): Promise<RatioSample[]> {
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
      fecha: true,
    },
    orderBy: { fecha: 'asc' },
  });

  const samples: RatioSample[] = [];
  for (const f of flights) {
    const hobbs = toNumber(f.diff_hobbs);
    const tach = toNumber(f.diff_tach);
    const hobbsInicio = toNumber(f.hobbs_inicio);
    const hobbsFin = toNumber(f.hobbs_fin);

    if (hobbs === null || tach === null || tach <= 0 || hobbs <= 0) continue;

    // Excluir vuelos con Hobbs inoperativo/pegado: si el avance físico del
    // medidor no coincide con diff_hobbs, el ratio no refleja el medidor real.
    if (
      hobbsInicio !== null && hobbsFin !== null &&
      Math.abs((hobbsFin - hobbsInicio) - hobbs) > 0.05
    ) {
      continue;
    }

    const ratio = hobbs / tach;
    if (ratio < RATIO_HARD_MIN || ratio > RATIO_HARD_MAX) continue;

    samples.push({ tach, ratio, fecha: f.fecha });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Weighted statistics helpers
// ---------------------------------------------------------------------------

function weightedQuantile(pairs: { value: number; weight: number }[], q: number): number {
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return NaN;
  let cum = 0;
  for (const p of sorted) {
    cum += p.weight;
    if (cum / total >= q) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

// ---------------------------------------------------------------------------
// Kernel-weighted local estimator
//
// Instead of coarse 0.1 buckets with a global fallback, we estimate the
// expected ratio exactly at the requested tach delta using ALL historical
// flights, weighted by:
//   1. Proximity in tach delta (Gaussian kernel, adaptive bandwidth that
//      widens until enough effective samples are captured).
//   2. Recency (exponential decay, 2-year half-life) so the estimate keeps
//      adapting to the aircraft/meter as new flights are logged.
// The central estimate is the weighted MEDIAN (robust to outliers), and the
// accept range is the weighted P5–P95 of nearby historical ratios.
// ---------------------------------------------------------------------------

const RECENCY_HALF_LIFE_DAYS = 730;
const TARGET_EFFECTIVE_N = 15;
const BANDWIDTHS = [0.05, 0.1, 0.15, 0.25, 0.4, 0.6, 1.0, 2.0];

interface LocalEstimate {
  expectedRatio: number;
  minRatio: number;
  maxRatio: number;
  effectiveN: number;
  rawN: number;
  bandwidth: number;
}

function estimateLocalRatio(samples: RatioSample[], tachDelta: number): LocalEstimate | null {
  if (samples.length === 0) return null;

  const now = Date.now();

  for (const bw of BANDWIDTHS) {
    const pairs: { value: number; weight: number }[] = [];
    let effectiveN = 0;
    let rawN = 0;

    for (const s of samples) {
      const z = (s.tach - tachDelta) / bw;
      const kernel = Math.exp(-0.5 * z * z);
      if (kernel < 0.01) continue;

      const ageDays = Math.max(0, (now - s.fecha.getTime()) / 86400000);
      const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

      const w = kernel * (0.25 + 0.75 * recency); // old flights never drop to 0
      pairs.push({ value: s.ratio, weight: w });
      effectiveN += kernel;
      rawN++;
    }

    const isLastBandwidth = bw === BANDWIDTHS[BANDWIDTHS.length - 1];
    if (effectiveN >= TARGET_EFFECTIVE_N || (isLastBandwidth && pairs.length > 0)) {
      const median = weightedQuantile(pairs, 0.5);
      const p5 = weightedQuantile(pairs, 0.05);
      const p95 = weightedQuantile(pairs, 0.95);
      return {
        expectedRatio: median,
        // Margen pequeño alrededor de la dispersión observada
        minRatio: Math.max(RATIO_HARD_MIN, p5 - 0.05),
        maxRatio: Math.min(RATIO_HARD_MAX, p95 + 0.05),
        effectiveN,
        rawN,
        bandwidth: bw,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API (kept compatible with previous version)
// ---------------------------------------------------------------------------

/**
 * Calcula los ratios Hobbs/Tach por bucket basándose en datos históricos.
 * (Se mantiene para reportes/diagnóstico; la predicción usa el estimador local.)
 */
export async function calculateHobbsTachRatios(
  aircraftId: string = 'CC-AQI'
): Promise<{
  ratiosByBucket: Record<string, number>;
  globalRatio: number;
  bucketStats: Record<string, { count: number; avgRatio: number; median: number }>;
}> {
  const samples = await loadRatioSamples(aircraftId);

  const buckets: Map<string, { totalHobbs: number; totalTach: number; count: number; ratios: number[] }> = new Map();
  for (const s of samples) {
    const bucket = getTachBucket(s.tach);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { totalHobbs: 0, totalTach: 0, count: 0, ratios: [] });
    }
    const data = buckets.get(bucket)!;
    data.totalHobbs += s.ratio * s.tach;
    data.totalTach += s.tach;
    data.count++;
    data.ratios.push(s.ratio);
  }

  const globalTotalHobbs = Array.from(buckets.values()).reduce((sum, b) => sum + b.totalHobbs, 0);
  const globalTotalTach = Array.from(buckets.values()).reduce((sum, b) => sum + b.totalTach, 0);
  const globalRatio = globalTotalTach > 0 ? globalTotalHobbs / globalTotalTach : 1.245;

  const ratiosByBucket: Record<string, number> = {};
  const bucketStats: Record<string, { count: number; avgRatio: number; median: number }> = {};

  for (const [bucket, data] of buckets) {
    if (data.count >= 3 && data.totalTach > 0) {
      const avgRatio = data.totalHobbs / data.totalTach;
      const sortedRatios = data.ratios.sort((a, b) => a - b);
      const median = sortedRatios[Math.floor(sortedRatios.length / 2)];
      ratiosByBucket[bucket] = avgRatio;
      bucketStats[bucket] = { count: data.count, avgRatio, median };
    }
  }

  return { ratiosByBucket, globalRatio, bucketStats };
}

/**
 * Obtiene el ratio esperado para un delta de Tach específico.
 * Estimador local ponderado por cercanía en tach y recencia: se vuelve más
 * preciso automáticamente a medida que se registran más vuelos.
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
  const samples = await loadRatioSamples(aircraftId);
  const bucket = getTachBucket(tachDelta);
  const est = estimateLocalRatio(samples, tachDelta);

  if (!est) {
    // Sin datos: fallback conservador
    return {
      expectedRatio: 1.245,
      bucket,
      confidence: 'LOW',
      sampleSize: 0,
      minRatio: 1.0,
      maxRatio: 2.0,
    };
  }

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (est.effectiveN >= 20 && est.bandwidth <= 0.15) confidence = 'HIGH';
  else if (est.effectiveN >= 10) confidence = 'MEDIUM';
  else confidence = 'LOW';

  return {
    expectedRatio: Number(est.expectedRatio.toFixed(3)),
    bucket,
    confidence,
    sampleSize: est.rawN,
    minRatio: Number(est.minRatio.toFixed(3)),
    maxRatio: Number(est.maxRatio.toFixed(3)),
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
