import { NextRequest, NextResponse } from 'next/server';
import { runProspectiveEvaluation } from '@/lib/fuel-model-prospective';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/cron/fuel-model-eval
 * Monthly cron: runs the prospective evaluation of the frozen fuel price
 * model V2 and emails the report.
 *
 * Suggested schedule: 5th of every month at 4 AM Chile (7 AM UTC): 0 7 5 * *
 * Auth: CRON_SECRET bearer header (same as monthly-backup).
 */
export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
      return NextResponse.json({ ok: false, error: 'Cron secret not configured' }, { status: 500 });
    }
    const providedSecret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Fuel Model Eval Cron] Running prospective evaluation…');
    const report = await runProspectiveEvaluation();

    const realizedTotal = report.byHorizon[3].realized + report.byHorizon[6].realized;
    const pending = report.forecasts.filter(f => f.actual === null);

    // Only email when there is something to report (at least one realized
    // forecast, or always send status so the pipeline is visibly alive).
    const emailed = await sendReportEmail(report, realizedTotal, pending.length);

    return NextResponse.json({
      ok: true,
      realizedForecasts: realizedTotal,
      pendingForecasts: pending.length,
      criterionStatus: report.criterionStatus,
      emailed,
    });
  } catch (error: any) {
    console.error('[Fuel Model Eval Cron] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

const fmt = (n: number | null, dec = 0) => n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: dec });
const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(0)}%`;

async function sendReportEmail(
  report: Awaited<ReturnType<typeof runProspectiveEvaluation>>,
  realizedTotal: number,
  pendingCount: number,
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const recipient = process.env.BACKUP_EMAIL || 'santvaras92@gmail.com';
  if (!RESEND_API_KEY) return false;

  const monthName = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });

  const horizonRows = ([3, 6] as const).map(h => {
    const s = report.byHorizon[h];
    return `
      <tr>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;"><strong>${h}m</strong></td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">${s.realized}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">$${fmt(s.mae)}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">$${fmt(s.bias)}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">${pct(s.skillVsPersist)}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">${pct(s.skillVsAvg3m)}</td>
        <td style="padding:8px;border:1px solid #e0e0e0;text-align:center;">${pct(s.coverage)}</td>
      </tr>`;
  }).join('');

  const realized = report.forecasts.filter(f => f.actual !== null).sort((a, b) => a.target.localeCompare(b.target) || a.horizon - b.horizon);
  const realizedRows = realized.map(f => `
      <tr>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:center;">${f.origin}</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:center;">${f.target}</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:center;">${f.horizon}m</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:right;">$${fmt(f.pred)}</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:right;">$${fmt(f.actual)}</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:right;color:${Math.abs(f.err!) <= f.band ? '#28a745' : '#d32f2f'};">${f.err! >= 0 ? '+' : ''}$${fmt(f.err)}</td>
        <td style="padding:6px;border:1px solid #e0e0e0;text-align:center;">${f.inBand ? '✅' : '❌'} (±$${fmt(f.band)})</td>
      </tr>`).join('');

  const emailHtml = `
    <!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;">
    <div style="max-width:680px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#1F4E78 0%,#2E6BA8 100%);color:white;padding:25px 20px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:22px;">⛽ Modelo de Combustible V2 — Evaluación Prospectiva</h1>
        <p style="margin:8px 0 0 0;opacity:.9;">Cohorte post-congelamiento (${report.freezeMonth}) · ${monthName}</p>
      </div>
      <div style="background:#fff;padding:25px 20px;border:1px solid #e0e0e0;border-top:none;">
        <div style="background:#e8f4f8;padding:15px;border-left:4px solid #1F4E78;border-radius:4px;margin-bottom:20px;">
          <strong>Estado del criterio operativo:</strong><br>${report.criterionStatus}<br>
          <span style="font-size:12px;color:#666;">Último mes AVGAS con datos: ${report.lastAvgasMonth} · Pronósticos realizados: ${realizedTotal} · Pendientes de verificar: ${pendingCount}</span>
        </div>
        <h3 style="color:#1F4E78;border-bottom:2px solid #e0e0e0;padding-bottom:8px;">Resumen por horizonte</h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #e0e0e0;">Horizonte</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">N</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">MAE</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">Sesgo</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">Skill vs persist</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">Skill vs avg3m</th>
            <th style="padding:8px;border:1px solid #e0e0e0;">Cobertura banda</th>
          </tr>
          ${horizonRows}
        </table>
        ${realized.length > 0 ? `
        <h3 style="color:#1F4E78;border-bottom:2px solid #e0e0e0;padding-bottom:8px;margin-top:25px;">Pronósticos verificados</h3>
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <tr style="background:#f5f5f5;">
            <th style="padding:6px;border:1px solid #e0e0e0;">Origen</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">Target</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">H</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">Pred $/L</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">Real $/L</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">Error</th>
            <th style="padding:6px;border:1px solid #e0e0e0;">En banda</th>
          </tr>
          ${realizedRows}
        </table>` : `
        <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;border-radius:4px;margin-top:20px;">
          Aún no hay pronósticos verificables (los primeros targets 3m de la cohorte prospectiva se realizan desde ene-2027 aprox., según datos de combustible cargados).
        </div>`}
        <p style="font-size:12px;color:#666;margin-top:20px;">
          Criterio formal (fijado 2026-09-10, antes de observar esta cohorte): tras 12 orígenes 3m realizados,
          el modelo debe tener skill ≥ +8% vs persistencia, skill positivo vs ambos naives, sin deterioro material
          de sesgo ni quiebre estructural. Si no cumple, revisar arquitectura (requiere pasar backtests completos).
        </p>
      </div>
      <div style="background:#f9f9f9;padding:15px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0;border-top:none;font-size:12px;color:#666;">
        Sistema Flight Log CC-AQI — informe automático mensual del modelo de combustible V2 (congelado).
      </div>
    </div></body></html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: [recipient],
        subject: `⛽ Modelo Combustible V2 — Evaluación prospectiva (${monthName})`,
        html: emailHtml,
      }),
    });
    if (!response.ok) {
      console.error('[Fuel Model Eval Cron] Resend error:', response.status, await response.text());
      return false;
    }
    console.log('[Fuel Model Eval Cron] Email sent');
    return true;
  } catch (e) {
    console.error('[Fuel Model Eval Cron] Email error:', e);
    return false;
  }
}
