import { runProspectiveEvaluation } from "../lib/fuel-model-prospective";
(async () => {
  const r = await runProspectiveEvaluation();
  console.log("Freeze:", r.freezeMonth, "| Last AVGAS month:", r.lastAvgasMonth);
  console.log("Criterion:", r.criterionStatus);
  for (const h of [3, 6]) {
    const s = r.byHorizon[h];
    console.log(`H${h}: realized=${s.realized} MAE=${s.mae?.toFixed(0) ?? "-"} skillP=${s.skillVsPersist !== null ? (s.skillVsPersist * 100).toFixed(0) + "%" : "-"} cov=${s.coverage !== null ? (s.coverage * 100).toFixed(0) + "%" : "-"}`);
  }
  for (const f of r.forecasts) console.log(` ${f.origin} -> ${f.target} (${f.horizon}m) pred=$${f.pred.toFixed(0)} actual=${f.actual !== null ? "$" + f.actual.toFixed(0) : "pending"} ${f.inBand === null ? "" : f.inBand ? "IN" : "OUT"}`);
  process.exit(0);
})();
