// ─────────────────────────────────────────────────────────────────────────────
// PROSPECTIVE EVALUATION of the FROZEN fuel price model V2 (Brent-spot /
// FX-OU θ=0.10 / lag fixed 1m, WLS λ=0.03). Faithful replica of
// `scripts/backtest-fuel-model.ts --prospective` but returning structured
// results instead of console output, so it can run from a cron endpoint.
//
// V2 frozen 2026-09-10. Origins strictly AFTER 2026-09. The architecture is
// FROZEN — do not change constants here without passing the full backtests.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from './prisma';
import fs from 'fs';
import path from 'path';

const FREEZE_MONTH = '2026-09';
const LAMBDA = 0.03;
const MIN_TRAIN = 30;
const HORIZONS = [3, 6] as const;
const THETA_FX = 0.10;
const FIXED_LAG = 1;
const V2_BAND: Record<number, number> = { 3: 0.172, 6: 0.260 };

type MonthKey = string;
const shiftMonth = (m: MonthKey, delta: number): MonthKey => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthDiff = (a: MonthKey, b: MonthKey): number => {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
};

async function loadAvgasMonthly(): Promise<Map<MonthKey, number>> {
  const acc = new Map<MonthKey, { l: number; m: number }>();
  const add = (k: MonthKey, l: number, m: number) => {
    const a = acc.get(k) ?? { l: 0, m: 0 }; a.l += l; a.m += m; acc.set(k, a);
  };
  const csvPath = path.join(process.cwd(), 'Combustible', 'Planilla control combustible.csv');
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
    for (const line of csv.split('\n').slice(1)) {
      const [f, , ls, ms] = line.split(';');
      const mm = f?.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
      if (!mm) continue;
      const litros = Number((ls || '').replace(/\./g, '').replace(',', '.'));
      const monto = Number((ms || '').replace(/\$/g, '').replace(/\./g, '').replace(',', '.'));
      if (!litros || !monto || litros <= 0 || monto <= 0) continue;
      const ppl = monto / litros; if (ppl < 500 || ppl > 5000) continue;
      add(`20${mm[3]}-${mm[2].padStart(2, '0')}`, litros, monto);
    }
  }
  const logs = await prisma.fuelLog.findMany({ where: { fecha: { gte: new Date('2025-11-29') } } });
  for (const l of logs) {
    const litros = Number(l.litros), monto = Number(l.monto);
    if (litros <= 0 || monto <= 0) continue;
    const ppl = monto / litros; if (ppl < 500 || ppl > 5000) continue;
    add(l.fecha.toISOString().slice(0, 7), litros, monto);
  }
  const out = new Map<MonthKey, number>();
  for (const [k, v] of [...acc.entries()].sort()) out.set(k, v.m / v.l);
  return out;
}

async function loadBrentMonthly(): Promise<Map<MonthKey, { brent: number; fx: number }>> {
  const row = await prisma.appCache.findUnique({ where: { key: 'brent-history-v2' } });
  if (!row) throw new Error('AppCache brent-history-v2 not found');
  const data = JSON.parse(row.value);
  const out = new Map<MonthKey, { brent: number; fx: number }>();
  for (const m of data.monthly as { month: string; brentUSD: number; usdCLP: number; partial?: boolean }[]) {
    if (m.partial) continue;
    out.set(m.month, { brent: m.brentUSD, fx: m.usdCLP });
  }
  return out;
}

function runWLS(pairs: { x: number; y: number; month: MonthKey }[], origin: MonthKey) {
  const n = pairs.length;
  if (n < 6) return null;
  const w = pairs.map(p => Math.exp(-LAMBDA * Math.max(0, monthDiff(origin, p.month))));
  const sw = w.reduce((s, v) => s + v, 0);
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  const effN = (sw * sw) / sw2;
  if (effN < 4) return null;
  const mx = pairs.reduce((s, p, i) => s + w[i] * p.x, 0) / sw;
  const my = pairs.reduce((s, p, i) => s + w[i] * p.y, 0) / sw;
  let cov = 0, vx = 0;
  for (let i = 0; i < n; i++) { cov += w[i] * (pairs[i].x - mx) * (pairs[i].y - my); vx += w[i] * (pairs[i].x - mx) ** 2; }
  if (Math.abs(vx) < 1e-10) return null;
  const slope = cov / vx, intercept = my - slope * mx;
  return { slope, intercept };
}

export interface ProspectiveForecast {
  origin: MonthKey;
  target: MonthKey;
  horizon: number;
  pred: number;
  actual: number | null; // null = not yet realized
  err: number | null;
  band: number;
  inBand: boolean | null;
}

export interface ProspectiveReport {
  freezeMonth: string;
  lastAvgasMonth: string;
  forecasts: ProspectiveForecast[];
  byHorizon: Record<number, {
    realized: number;
    mae: number | null;
    bias: number | null;
    coverage: number | null;      // fraction in band
    naivePersistMae: number | null;
    naiveAvg3mMae: number | null;
    skillVsPersist: number | null; // 1 - MAE/naiveMAE
    skillVsAvg3m: number | null;
  }>;
  criterionStatus: string;
}

export async function runProspectiveEvaluation(): Promise<ProspectiveReport> {
  const avgas = await loadAvgasMonthly();
  const brent = await loadBrentMonthly();
  const avgasMonths = [...avgas.keys()].sort();
  const lastAvgasMonth = avgasMonths[avgasMonths.length - 1] ?? 'n/a';

  const origins = avgasMonths.filter((m, i) => i >= MIN_TRAIN && m > FREEZE_MONTH);
  const forecasts: ProspectiveForecast[] = [];
  const naiveErr: Record<number, { persist: number[]; avg3m: number[] }> = { 3: { persist: [], avg3m: [] }, 6: { persist: [], avg3m: [] } };

  for (const origin of origins) {
    const trainAvgas = avgasMonths.filter(m => m <= origin).map(m => ({ month: m, ppl: avgas.get(m)! }));
    const brentAvail = [...brent.entries()].filter(([m]) => m <= origin).sort((a, b) => a[0].localeCompare(b[0]));
    if (brentAvail.length < 12) continue;
    const brentMap = new Map(brentAvail);
    const spotBrent = brentAvail[brentAvail.length - 1][1].brent;
    const spotFX = brentAvail[brentAvail.length - 1][1].fx;
    const mean12FX = brentAvail.slice(-12).reduce((s, [, v]) => s + v.fx, 0) / Math.min(12, brentAvail.length);
    const histMeanFX = brentAvail.reduce((s, [, v]) => s + v.fx, 0) / brentAvail.length;

    // WLS fit at fixed lag 1 (frozen V2)
    const pairs: { x: number; y: number; month: MonthKey }[] = [];
    for (const a of trainAvgas) {
      const bm = brentMap.get(shiftMonth(a.month, -FIXED_LAG));
      if (!bm) continue;
      pairs.push({ x: bm.brent, y: a.ppl / bm.fx, month: a.month });
    }
    const fit = runWLS(pairs, origin);
    if (!fit) continue;

    // fxBeta (train-only)
    let fxBeta = 0;
    {
      const res: number[] = [], dev: number[] = [];
      for (const a of trainAvgas) {
        const bm = brentMap.get(shiftMonth(a.month, -FIXED_LAG));
        if (!bm) continue;
        const pred = (fit.slope * bm.brent + fit.intercept) * bm.fx;
        res.push(a.ppl - pred); dev.push(bm.fx - histMeanFX);
      }
      const vd = dev.reduce((s, d) => s + d * d, 0);
      fxBeta = vd > 0 ? res.reduce((s, r, i) => s + r * dev[i], 0) / vd : 0;
    }

    const ou = (x0: number, mean: number, theta: number, h: number) => {
      let x = x0; for (let i = 0; i < h; i++) x += theta * (mean - x); return x;
    };

    for (const h of HORIZONS) {
      const target = shiftMonth(origin, h);
      // Brent: spot (θ=0) unless the needed month (target - lag) is observed
      const obsMonth = shiftMonth(origin, h - FIXED_LAG);
      const obsBrent = h - FIXED_LAG <= 0 ? brentMap.get(obsMonth)?.brent : undefined;
      const bProj = obsBrent ?? spotBrent;
      const fxProj = ou(spotFX, mean12FX, THETA_FX, h);
      const pred = Math.max(0, (fit.slope * bProj + fit.intercept) * fxProj + fxBeta * (fxProj - histMeanFX));
      const band = V2_BAND[h] * pred;
      const actual = avgas.get(target) ?? null;
      const err = actual !== null ? actual - pred : null;
      forecasts.push({
        origin, target, horizon: h, pred, actual, err, band,
        inBand: err !== null ? Math.abs(err) <= band : null,
      });
      if (actual !== null) {
        const persist = avgas.get(origin)!;
        const a3 = trainAvgas.slice(-3).reduce((s, a) => s + a.ppl, 0) / Math.min(3, trainAvgas.length);
        naiveErr[h].persist.push(actual - persist);
        naiveErr[h].avg3m.push(actual - a3);
      }
    }
  }

  const mae = (es: number[]) => es.length ? es.reduce((s, e) => s + Math.abs(e), 0) / es.length : null;
  const byHorizon: ProspectiveReport['byHorizon'] = {};
  for (const h of HORIZONS) {
    const realized = forecasts.filter(f => f.horizon === h && f.err !== null);
    const es = realized.map(f => f.err!) ;
    const m = mae(es);
    const nP = mae(naiveErr[h].persist);
    const nA = mae(naiveErr[h].avg3m);
    byHorizon[h] = {
      realized: realized.length,
      mae: m,
      bias: es.length ? es.reduce((s, e) => s + e, 0) / es.length : null,
      coverage: realized.length ? realized.filter(f => f.inBand).length / realized.length : null,
      naivePersistMae: nP,
      naiveAvg3mMae: nA,
      skillVsPersist: m !== null && nP ? 1 - m / nP : null,
      skillVsAvg3m: m !== null && nA ? 1 - m / nA : null,
    };
  }

  const n3 = byHorizon[3].realized;
  const criterionStatus = n3 >= 12
    ? `Cohorte 3m completa (${n3}/12) — evaluar formalmente: skill ≥ +8% vs persistencia y positivo vs ambos naives.`
    : `Cohorte acumulando: ${n3}/12 orígenes 3m realizados — leer con cautela.`;

  return { freezeMonth: FREEZE_MONTH, lastAvgasMonth, forecasts, byHorizon, criterionStatus };
}
