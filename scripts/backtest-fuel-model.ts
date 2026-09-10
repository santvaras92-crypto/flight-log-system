// ─────────────────────────────────────────────────────────────────────────────
// WALK-FORWARD BACKTEST of the AVGAS price forecast pipeline.
//
// Replicates the production model (lag discovery + WLS + OU projections) month
// by month using ONLY information available at each forecast origin (no
// look-ahead in ANY derived variable: means, lag, coefficients, fxBeta, bands).
//
// Controls agreed:
//  (1) Lag alignment: model is AVGAS_t = f(Brent_{t-lag}) → forecast for t+h
//      uses Brent_{t+h-lag} (projected if future, OBSERVED if <= origin).
//  (2) Variants: Brent {spot, OU θ=.05/.10/.20} × FX {spot, OU θ=.10}
//      × lag {dynamic 0-6, fixed 0, fixed 1, fixed 2}.
//  (3) Two naive benchmarks: persistence (P_t) and Avg3m_t.
//  Metrics: MAE, RMSE, bias, skill vs both naives, band coverage, lag frequency.
//
// Usage: npx tsx scripts/backtest-fuel-model.ts               (full walk-forward, model selection — V2 frozen)
//        npx tsx scripts/backtest-fuel-model.ts --prospective  (V2 prospective cohort: origins AFTER 2026-09 only,
//                                                               frozen architecture Brent-spot/FX-OU.10/lag-1m)
// ───────────────────────────────────────────────────────────────────────────────
import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

const PROSPECTIVE = process.argv.includes('--prospective');
const FREEZE_MONTH = '2026-09'; // V2 frozen 2026-09-10 — prospective origins are AFTER this

// ── Config (mirrors production) ──
const LAMBDA = 0.03;              // WLS exponential decay (t½ ≈ 23 months)
const MIN_TRAIN = 30;             // minimum training months before first forecast
const HORIZONS = [3, 6];
// In prospective mode only the FROZEN V2 architecture runs: Brent spot (θ=0),
// FX OU θ=0.10, lag fixed 1m. Full grid only for the (closed) selection phase.
const THETAS_BRENT = PROSPECTIVE ? [0] : [0, 0.05, 0.10, 0.20];
const THETAS_FX = PROSPECTIVE ? [0.10] : [0, 0.10];
const LAG_MODES: (number | 'dyn')[] = PROSPECTIVE ? [1] : ['dyn', 0, 1, 2];
const BAND_K = 1.96, BAND_CAP = 0.25;
// V2 frozen empirical bands (Q90 |rel err| from selection backtest)
const V2_BAND: Record<number, number> = { 3: 0.172, 6: 0.260 };

type MonthKey = string; // "YYYY-MM"
const shiftMonth = (m: MonthKey, delta: number): MonthKey => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthDiff = (a: MonthKey, b: MonthKey): number => {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
};

// ── Load AVGAS monthly series (CSV history + DB FuelLog) ──
async function loadAvgasMonthly(): Promise<Map<MonthKey, number>> {
  const acc = new Map<MonthKey, { l: number; m: number }>();
  const add = (k: MonthKey, l: number, m: number) => {
    const a = acc.get(k) ?? { l: 0, m: 0 }; a.l += l; a.m += m; acc.set(k, a);
  };
  // CSV (through 2025-11-28)
  const csv = fs.readFileSync(path.join(__dirname, '..', 'Combustible', 'Planilla control combustible.csv'), 'utf-8').replace(/^\uFEFF/, '');
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
  // DB (from 2025-11-29)
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

// ── Load Brent + FX monthly (AppCache persistent copy of /api/brent-history) ──
async function loadBrentMonthly(): Promise<Map<MonthKey, { brent: number; fx: number }>> {
  const row = await prisma.appCache.findUnique({ where: { key: 'brent-history-v2' } });
  if (!row) throw new Error('AppCache brent-history-v2 not found — open the dashboard once to populate it');
  const data = JSON.parse(row.value);
  const out = new Map<MonthKey, { brent: number; fx: number }>();
  for (const m of data.monthly as { month: string; brentUSD: number; usdCLP: number; partial?: boolean }[]) {
    if (m.partial) continue; // only closed months
    out.set(m.month, { brent: m.brentUSD, fx: m.usdCLP });
  }
  return out;
}

// ── WLS (exponential weights, age relative to ORIGIN month) ──
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
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) { ssr += w[i] * (pairs[i].y - slope * pairs[i].x - intercept) ** 2; sst += w[i] * (pairs[i].y - my) ** 2; }
  const r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;
  const residStd = effN > 2 ? Math.sqrt(ssr / (effN - 2)) : 0;
  return { slope, intercept, r2, residStd, pairs: n };
}

(async () => {
  const avgas = await loadAvgasMonthly();
  const brent = await loadBrentMonthly();
  const avgasMonths = [...avgas.keys()].sort();
  console.log(`AVGAS: ${avgasMonths.length} months (${avgasMonths[0]} → ${avgasMonths[avgasMonths.length - 1]})`);
  console.log(`Brent/FX: ${brent.size} months\n`);

  type Err = { e: number; inBand: boolean };
  const results = new Map<string, Record<number, Err[]>>(); // variant → horizon → errors
  // Detailed log for the WINNER variant (B0/F0.1/lag:1) band diagnostics
  const winnerLog: { origin: MonthKey; target: MonthKey; h: number; pred: number; actual: number; err: number; bandRaw: number; bandCapped: number; capActive: boolean; inBand: boolean; inBandNoCap: boolean }[] = [];
  const naiveErr: Record<string, Record<number, number[]>> = { persist: { 3: [], 6: [] }, avg3m: { 3: [], 6: [] } };
  const lagFreq = new Map<number, number>();
  const key = (thB: number, thF: number, lagMode: number | 'dyn') => `B${thB}/F${thF}/lag:${lagMode}`;

  // Forecast origins: need MIN_TRAIN months of history and actual at t+h.
  // Prospective mode: only origins strictly AFTER the V2 freeze month.
  const origins = avgasMonths.filter((m, i) => i >= MIN_TRAIN && (!PROSPECTIVE || m > FREEZE_MONTH));
  if (PROSPECTIVE) console.log(`══ PROSPECTIVE MODE — V2 frozen cohort (origins > ${FREEZE_MONTH}) ══`);
  if (PROSPECTIVE && origins.length === 0) {
    console.log('No prospective origins available yet. Come back when post-freeze fuel months exist.');
    await prisma.$disconnect(); return;
  }
  let nOrigins: Record<number, number> = { 3: 0, 6: 0 };

  for (const origin of origins) {
    // ── info set: strictly ≤ origin ──
    const trainAvgas = avgasMonths.filter(m => m <= origin).map(m => ({ month: m, ppl: avgas.get(m)! }));
    const brentAvail = [...brent.entries()].filter(([m]) => m <= origin).sort((a, b) => a[0].localeCompare(b[0]));
    if (brentAvail.length < 12) continue;
    const brentMap = new Map(brentAvail);
    const spotBrent = brentAvail[brentAvail.length - 1][1].brent;
    const spotFX = brentAvail[brentAvail.length - 1][1].fx;
    const mean12Brent = brentAvail.slice(-12).reduce((s, [, v]) => s + v.brent, 0) / Math.min(12, brentAvail.length);
    const mean12FX = brentAvail.slice(-12).reduce((s, [, v]) => s + v.fx, 0) / Math.min(12, brentAvail.length);
    const histMeanFX = brentAvail.reduce((s, [, v]) => s + v.fx, 0) / brentAvail.length;

    // ── per-lag WLS fits (train-only) ──
    const fits: Record<number, ReturnType<typeof runWLS> & { lag: number } | null> = {};
    for (let lag = 0; lag <= 6; lag++) {
      const pairs: { x: number; y: number; month: MonthKey }[] = [];
      for (const a of trainAvgas) {
        const bm = brentMap.get(shiftMonth(a.month, -lag));
        if (!bm) continue;
        pairs.push({ x: bm.brent, y: a.ppl / bm.fx, month: a.month });
      }
      const f = runWLS(pairs, origin);
      fits[lag] = f ? { ...f, lag } : null;
    }
    const valid = Object.values(fits).filter((f): f is NonNullable<typeof f> => !!f);
    if (valid.length === 0) continue;
    const dynFit = valid.reduce((b, f) => f.r2 > b.r2 ? f : b, valid[0]);
    lagFreq.set(dynFit.lag, (lagFreq.get(dynFit.lag) ?? 0) + 1);

    // fxBeta (train-only): residuals of dyn fit vs FX deviation
    const fxBetaOf = (fit: NonNullable<typeof dynFit>) => {
      const res: number[] = [], dev: number[] = [];
      for (const a of trainAvgas) {
        const bm = brentMap.get(shiftMonth(a.month, -fit.lag));
        if (!bm) continue;
        const pred = (fit.slope * bm.brent + fit.intercept) * bm.fx;
        res.push(a.ppl - pred); dev.push(bm.fx - histMeanFX);
      }
      const vd = dev.reduce((s, d) => s + d * d, 0);
      return vd > 0 ? res.reduce((s, r, i) => s + r * dev[i], 0) / vd : 0;
    };

    const ou = (x0: number, mean: number, theta: number, h: number) => {
      let x = x0; for (let i = 0; i < h; i++) x += theta * (mean - x); return x;
    };

    for (const h of HORIZONS) {
      const target = shiftMonth(origin, h);
      const actual = avgas.get(target);
      if (!actual) continue;
      nOrigins[h]++;

      // naive benchmarks
      const persist = avgas.get(origin)!;
      const a3 = trainAvgas.slice(-3).reduce((s, a) => s + a.ppl, 0) / Math.min(3, trainAvgas.length);
      naiveErr.persist[h].push(actual - persist);
      naiveErr.avg3m[h].push(actual - a3);

      for (const lagMode of LAG_MODES) {
        const fit = lagMode === 'dyn' ? dynFit : fits[lagMode];
        if (!fit) continue;
        const fxBeta = fxBetaOf(fit);
        const lagH = Math.max(0, h - fit.lag); // months to project Brent (lag alignment)
        // If h - lag ≤ 0 the needed Brent month is OBSERVED (≤ origin)
        const obsMonth = shiftMonth(origin, h - fit.lag);
        const obsBrent = h - fit.lag <= 0 ? brentMap.get(obsMonth)?.brent : undefined;

        for (const thB of THETAS_BRENT) {
          const bProj = obsBrent ?? ou(spotBrent, mean12Brent, thB, lagH);
          for (const thF of THETAS_FX) {
            const fxProj = thF === 0 ? spotFX : ou(spotFX, mean12FX, thF, h);
            const pred = Math.max(0, (fit.slope * bProj + fit.intercept) * fxProj + fxBeta * (fxProj - histMeanFX));
            const bandRaw = PROSPECTIVE ? V2_BAND[h] * pred : BAND_K * fit.residStd * fxProj * Math.sqrt(1 + h / 3);
            const band = PROSPECTIVE ? bandRaw : Math.min(bandRaw, BAND_CAP * pred);
            const k = key(thB, thF, lagMode);
            if (!results.has(k)) results.set(k, { 3: [], 6: [] });
            results.get(k)![h].push({ e: actual - pred, inBand: Math.abs(actual - pred) <= band });
            if (thB === 0 && thF === 0.10 && lagMode === 1) {
              winnerLog.push({ origin, target, h, pred, actual, err: actual - pred, bandRaw, bandCapped: band, capActive: bandRaw > BAND_CAP * pred, inBand: Math.abs(actual - pred) <= band, inBandNoCap: Math.abs(actual - pred) <= bandRaw });
            }
          }
        }
      }
    }
  }

  // ── Report ──
  const mae = (es: number[]) => es.reduce((s, e) => s + Math.abs(e), 0) / es.length;
  const rmse = (es: number[]) => Math.sqrt(es.reduce((s, e) => s + e * e, 0) / es.length);
  const bias = (es: number[]) => es.reduce((s, e) => s + e, 0) / es.length;
  const fmt = (v: number) => v.toFixed(0).padStart(6);

  console.log(`Forecast origins: N3=${nOrigins[3]} · N6=${nOrigins[6]}\n`);
  if (PROSPECTIVE) {
    console.log('Operative criterion (set 2026-09-10, BEFORE observing this cohort):');
    console.log('  after 12 realized 3m origins → skill ≥ +8% vs persistence, positive vs BOTH');
    console.log('  naives, no material bias deterioration, no structural breakdown.');
    console.log(`  Status: ${nOrigins[3]}/12 realized 3m origins${nOrigins[3] < 12 ? ' — cohort still accumulating, read with caution' : ' — cohort complete, evaluate formally'}\n`);
  }
  for (const h of HORIZONS) {
    const nP = mae(naiveErr.persist[h]), nA = mae(naiveErr.avg3m[h]);
    console.log(`── Horizon ${h}m ── naive-persist MAE $${nP.toFixed(0)} (bias ${bias(naiveErr.persist[h]).toFixed(0)}) · naive-avg3m MAE $${nA.toFixed(0)} (bias ${bias(naiveErr.avg3m[h]).toFixed(0)})`);
    console.log('variant                     MAE   RMSE   bias  skill/persist  skill/avg3m  coverage');
    const rows = [...results.entries()]
      .map(([k, byH]) => ({ k, es: byH[h].map(x => x.e), cov: byH[h].filter(x => x.inBand).length / byH[h].length }))
      .filter(r => r.es.length > 0)
      .sort((a, b) => mae(a.es) - mae(b.es));
    for (const r of rows) {
      const m = mae(r.es);
      console.log(`${r.k.padEnd(24)} ${fmt(m)} ${fmt(rmse(r.es))} ${fmt(bias(r.es))}   ${((1 - m / nP) * 100).toFixed(0).padStart(6)}%      ${((1 - m / nA) * 100).toFixed(0).padStart(6)}%     ${(r.cov * 100).toFixed(0)}%`);
    }
    console.log('');
  }
  const totalLag = [...lagFreq.values()].reduce((s, v) => s + v, 0);
  console.log('Dynamic lag selection frequency:');
  for (const [lag, n] of [...lagFreq.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  lag ${lag}m: ${((n / totalLag) * 100).toFixed(0)}% (${n}/${totalLag})`);

  // ── Band diagnostics for winner variant B0/F0.1/lag:1 ──
  console.log('\n══ Band diagnostics — winner variant Brent-spot / FX-OU.10 / lag-1m ══');
  for (const h of HORIZONS) {
    const logs = winnerLog.filter(l => l.h === h);
    const cov = logs.filter(l => l.inBand).length / logs.length;
    const covNoCap = logs.filter(l => l.inBandNoCap).length / logs.length;
    const capN = logs.filter(l => l.capActive).length;
    console.log(`\nHorizon ${h}m: coverage ${(cov * 100).toFixed(0)}% · WITHOUT cap ${(covNoCap * 100).toFixed(0)}% · cap active in ${capN}/${logs.length} forecasts`);
    const misses = logs.filter(l => !l.inBand);
    console.log(`Misses (${misses.length}):`);
    console.log('origin  → target   pred   actual    err  band(cap)  band(raw)  capActive  dir');
    for (const m of misses) {
      console.log(`${m.origin} → ${m.target}  ${m.pred.toFixed(0).padStart(5)}  ${m.actual.toFixed(0).padStart(5)}  ${m.err.toFixed(0).padStart(5)}  ${m.bandCapped.toFixed(0).padStart(8)}  ${m.bandRaw.toFixed(0).padStart(8)}  ${String(m.capActive).padStart(5)}  ${m.err > 0 ? 'UP' : 'DOWN'}`);
    }
    // Empirical band candidate: Q90 of |relative error| (scales with price level)
    const relAbs = logs.map(l => Math.abs(l.err) / l.pred).sort((a, b) => a - b);
    const q = (p: number) => relAbs[Math.min(relAbs.length - 1, Math.ceil(p * relAbs.length) - 1)];
    const covAt = (band: number) => logs.filter(l => Math.abs(l.err) / l.pred <= band).length / logs.length;
    console.log(`Empirical |rel error|: Q50 ${(q(0.5) * 100).toFixed(1)}% · Q80 ${(q(0.8) * 100).toFixed(1)}% · Q90 ${(q(0.9) * 100).toFixed(1)}% · max ${(relAbs[relAbs.length - 1] * 100).toFixed(1)}%`);
    console.log(`Coverage if band = Q90 rel: ${(covAt(q(0.9)) * 100).toFixed(0)}% · at $2100/L → ±$${(q(0.9) * 2100).toFixed(0)}/L`);
    // Diagnostic: Q90 excluding the Apr-2026 distributor repricing shock
    // (targets 2026-04 .. 2026-09 realized the discrete jump). NOT used for
    // calibration — production keeps full-sample Q90. This only decomposes how
    // much of the band width is ordinary error vs discrete repricing risk.
    const SHOCK_TARGETS = new Set(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    const noShock = logs.filter(l => !SHOCK_TARGETS.has(l.target));
    const relNS = noShock.map(l => Math.abs(l.err) / l.pred).sort((a, b) => a - b);
    const qNS = (p: number) => relNS[Math.min(relNS.length - 1, Math.ceil(p * relNS.length) - 1)];
    console.log(`Excl. Apr-2026 shock (${noShock.length}/${logs.length} kept): Q50 ${(qNS(0.5) * 100).toFixed(1)}% · Q90 ${(qNS(0.9) * 100).toFixed(1)}% · max ${(relNS[relNS.length - 1] * 100).toFixed(1)}%`);
  }

  await prisma.$disconnect();
})();
