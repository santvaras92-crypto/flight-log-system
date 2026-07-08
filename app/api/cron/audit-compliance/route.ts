import { NextRequest, NextResponse } from "next/server";
import { runComplianceAudit } from "@/lib/compliance-auditor";

/**
 * POST /api/cron/audit-compliance
 * Scheduled AD/DA compliance audit (FAA Federal Register + optional DGAC).
 *
 * Suggested schedule: weekly, e.g. Monday 4 AM Chile (0 4 * * 1).
 * Auth: Bearer CRON_SECRET (same pattern as the monthly backup cron).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow up to 5 min for the GPT assessments

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  console.log("[Compliance Audit Cron] ===== INICIO =====", new Date().toISOString());
  try {
    const report = await runComplianceAudit();
    console.log(
      `[Compliance Audit Cron] FAA scanned=${report.faa.scanned} added=${report.faa.added} | DGAC added=${report.dgac.added} | notes=${report.notes.join("; ")}`
    );
    return NextResponse.json({ ok: report.ok, report });
  } catch (error: any) {
    console.error("[Compliance Audit Cron] Error:", error);
    return NextResponse.json({ ok: false, error: error?.message || "Error desconocido" }, { status: 500 });
  }
}
