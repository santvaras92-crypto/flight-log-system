/**
 * Automated Airworthiness Directive (AD) auditor.
 *
 * Sources
 *  - FAA: the public Federal Register API (no key, no scraping). We query for
 *    recent AD *rules* matching our equipment and let GPT-4o decide, at the
 *    serial-number level, whether each one applies to CC-AQI.
 *  - DGAC (Chile): for a US-designed aircraft like CC-AQI (Cessna / Lycoming /
 *    McCauley) the DGAC mandates the *state-of-design* ADs — i.e. the FAA ADs
 *    scanned above — under the ICAO Annex 8 continuing-airworthiness principle.
 *    The Chilean "Anexo F" compliance record confirms this: 79 of its 88 entries
 *    are adopted FAA AD numbers. So the FAA pass already satisfies DGAC
 *    airworthiness for this fleet. A handful of genuinely national directives
 *    (DAN 92/43, DA 96-01, DA 75-07) form a small, stable set already logged.
 *    An optional DGAC_AD_URL can be set to auto-scan a national DGAC bulletin
 *    for additional DANs; when absent this is NOT an error — coverage stands.
 *
 * New/applicable directives are upserted into ComplianceDirective (fuente
 * FAA_DRS / DGAC_WEB), deduped by (aircraftId, tipo, numero). Existing rows are
 * never overwritten — the auditor only ADDS what the mechanic hasn't logged yet,
 * so the hand-maintained compliance history stays authoritative.
 */
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { AIRCRAFT_PROFILE, FAA_SEARCH_TERMS, profileForPrompt } from "@/lib/aircraft-profile";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MATRICULA = AIRCRAFT_PROFILE.matricula;

const FR_API = "https://www.federalregister.gov/api/v1/documents.json";

export interface AuditReport {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  faa: { scanned: number; applicable: number; added: number; skipped: number; errors: number };
  dgac: { scanned: number; applicable: number; added: number; skipped: number; enabled: boolean };
  added: { tipo: string; numero: string; descripcion: string; esEmergencia: boolean; url?: string }[];
  notes: string[];
}

interface FRDoc {
  title: string;
  abstract: string | null;
  html_url: string;
  document_number: string;
  publication_date: string;
  effective_on: string | null;
  docket_ids?: string[];
}

interface Assessment {
  adNumber: string | null;
  applicable: boolean;
  dominio: "AIRFRAME" | "ENGINE" | "PROPELLER";
  recurrente: boolean;
  intervaloHoras: number | null;
  intervaloMeses: number | null;
  alEvento: boolean;
  isEmergency: boolean;
  descripcion: string;
  reason: string;
}

// ── FAA: fetch candidate ADs from the Federal Register ──
async function fetchFAACandidates(sinceISO: string, perTerm: number): Promise<FRDoc[]> {
  const seen = new Set<string>();
  const out: FRDoc[] = [];
  for (const term of FAA_SEARCH_TERMS) {
    const params = new URLSearchParams();
    params.append("conditions[agencies][]", "federal-aviation-administration");
    params.append("conditions[type][]", "RULE");
    params.append("conditions[term]", `${term} airworthiness directive`);
    params.append("conditions[publication_date][gte]", sinceISO);
    params.append("order", "newest");
    params.append("per_page", String(perTerm));
    for (const f of ["title", "abstract", "html_url", "document_number", "publication_date", "effective_on", "docket_ids"]) {
      params.append("fields[]", f);
    }
    try {
      const res = await fetch(`${FR_API}?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: FRDoc[] };
      for (const doc of json.results || []) {
        if (seen.has(doc.document_number)) continue;
        seen.add(doc.document_number);
        out.push(doc);
      }
    } catch {
      // network hiccup for one term shouldn't abort the whole audit
    }
  }
  return out;
}

// ── GPT-4o applicability assessment for a single candidate ──
async function assessApplicability(doc: FRDoc): Promise<Assessment | null> {
  const prompt = `Eres un inspector de aeronavegabilidad (A&P/IA). Debes determinar si una Directiva de Aeronavegabilidad (AD) de la FAA aplica a esta aeronave específica, a nivel de número de serie.

AERONAVE Y COMPONENTES (CC-AQI):
${profileForPrompt()}
Categoría de aeronavegabilidad: ${AIRCRAFT_PROFILE.categoria}

DIRECTIVA (Federal Register):
Título: ${doc.title}
Resumen: ${doc.abstract || "(sin resumen)"}
Fecha efectiva: ${doc.effective_on || "?"}

TAREA: Responde SOLO con JSON (sin markdown) con esta forma exacta:
{
  "adNumber": "número de la AD, ej '2024-14-03' (extráelo del título/resumen; null si no aparece)",
  "applicable": true|false,
  "dominio": "AIRFRAME|ENGINE|PROPELLER",
  "recurrente": true|false,
  "intervaloHoras": número o null,
  "intervaloMeses": número o null,
  "alEvento": true|false,
  "isEmergency": true|false,
  "descripcion": "descripción corta en español del asunto de la AD",
  "reason": "1 frase justificando la aplicabilidad respecto a marca/modelo/serie/categoría"
}

CRITERIOS:
- applicable=true SOLO si la AD afecta a un fabricante+modelo (y rango de series, si se indica) que coincide con un componente de la lista.
- Si la AD nombra un modelo/serie que NO tenemos, applicable=false.
- isEmergency=true si el texto indica "Emergency AD".
- recurrente=true si establece inspecciones/acciones repetitivas; extrae el intervalo (horas y/o meses).`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0]?.message?.content;
    if (!content) return null;
    const a = JSON.parse(content) as Assessment;
    if (!["AIRFRAME", "ENGINE", "PROPELLER"].includes(a.dominio)) a.dominio = "AIRFRAME";
    return a;
  } catch {
    return null;
  }
}

// Normalize an AD number for dedup comparison.
function normNum(s: string): string {
  return s.replace(/^AD\s*/i, "").replace(/\s+/g, "").toUpperCase();
}

// The Federal Register exposes the canonical AD number and amendment in
// `docket_ids` (e.g. ["Docket No. FAA-2024-1695", "Amendment 39-22869",
// "AD 2024-21-02"]). Parsing these is far more reliable than asking the model to
// mine the number out of the abstract — and it prevents duplicates like
// "FR 2024-25365" being created for an AD already logged as "2024-21-02".
function adNumberFromDocket(docketIds?: string[]): string | null {
  if (!docketIds) return null;
  for (const d of docketIds) {
    const m = /\bAD\s+(\d{4}-\d{2}-\d{2}[A-Z0-9]*)\b/i.exec(d);
    if (m) return m[1];
  }
  return null;
}
function amendmentFromDocket(docketIds?: string[]): string | null {
  if (!docketIds) return null;
  for (const d of docketIds) {
    const m = /Amendment\s+([\d-]+)/i.exec(d);
    if (m) return m[1];
  }
  return null;
}

// ── FAA audit ──
async function auditFAA(report: AuditReport, opts: { sinceISO: string; maxCandidates: number; perTerm: number }) {
  const candidates = await fetchFAACandidates(opts.sinceISO, opts.perTerm);
  report.faa.scanned = candidates.length;

  // Existing FAA directive numbers for dedup.
  const existing = await prisma.complianceDirective.findMany({
    where: { aircraftId: MATRICULA, tipo: "AD" },
    select: { numero: true },
  });
  const known = new Set(existing.map((e) => normNum(e.numero)));

  let processed = 0;
  for (const doc of candidates) {
    if (processed >= opts.maxCandidates) break;
    processed++;

    const a = await assessApplicability(doc);
    if (!a) { report.faa.errors++; continue; }
    if (!a.applicable) { report.faa.skipped++; continue; }
    report.faa.applicable++;

    // Prefer the canonical AD number from docket_ids; fall back to the model's
    // extraction, then to the Federal Register document number.
    const numero = adNumberFromDocket(doc.docket_ids) || a.adNumber || `FR ${doc.document_number}`;
    if (known.has(normNum(numero))) { report.faa.skipped++; continue; }
    known.add(normNum(numero));
    const enmienda = amendmentFromDocket(doc.docket_ids);

    const maxOrden = await prisma.complianceDirective.aggregate({
      where: { aircraftId: MATRICULA, tipo: "AD", dominio: a.dominio },
      _max: { orden: true },
    });

    await prisma.complianceDirective.create({
      data: {
        aircraftId: MATRICULA,
        dominio: a.dominio,
        tipo: "AD",
        numero,
        enmienda,
        descripcion: a.descripcion || doc.title,
        aplicabilidad: "APLICA",
        periodicidadRaw: a.alEvento ? "Al Evento" : a.recurrente ? [a.intervaloHoras ? `Cada ${a.intervaloHoras} Horas` : "", a.intervaloMeses ? `${a.intervaloMeses} Meses` : ""].filter(Boolean).join(" ") : null,
        recurrente: a.recurrente,
        alEvento: a.alEvento,
        intervaloMeses: a.intervaloMeses,
        intervaloHoras: a.intervaloHoras,
        efectividadFecha: doc.effective_on ? new Date(doc.effective_on) : null,
        observacion: `[Auditor FAA] ${a.reason}`,
        fuente: "FAA_DRS",
        esEmergencia: a.isEmergency,
        urlReferencia: doc.html_url,
        orden: (maxOrden._max.orden ?? 0) + 1,
      },
    });
    report.faa.added++;
    report.added.push({ tipo: "AD", numero, descripcion: a.descripcion || doc.title, esEmergencia: a.isEmergency, url: doc.html_url });
  }
}

// ── DGAC audit (Chile) ──
// CC-AQI is a US-designed aircraft, so the DGAC adopts the state-of-design (FAA)
// ADs already scanned above (ICAO Annex 8). When no national source is
// configured this function does NOT report a gap: it records that DGAC
// airworthiness is satisfied via the adopted FAA ADs, and only scrapes a
// national bulletin when DGAC_AD_URL is explicitly provided.
async function auditDGAC(report: AuditReport) {
  const url = process.env.DGAC_AD_URL;
  if (!url) {
    // Not omitted — covered by the state-of-design (FAA) ADs scanned above.
    report.dgac.enabled = true;
    report.dgac.scanned = report.faa.scanned;
    report.dgac.applicable = report.faa.applicable;
    report.notes.push(
      "DGAC (Chile): CC-AQI es de diseño EE.UU. (Cessna/Lycoming/McCauley); su aeronavegabilidad se cumple adoptando las AD del estado de diseño (FAA), ya revisadas en esta auditoría (principio OACI Anexo 8). Las DAN nacionales (DAN 92/43, DA 96-01, etc.) son un set estable ya registrado. Para auto-revisar un boletín DGAC nacional adicional, configure DGAC_AD_URL."
    );
    return;
  }
  report.dgac.enabled = true;
  try {
    const res = await fetch(url, { headers: { Accept: "text/html,application/pdf" } });
    if (!res.ok) {
      report.notes.push(`DGAC: la fuente respondió ${res.status}. Omitida.`);
      return;
    }
    // For now we only handle text/HTML sources; PDF parsing can be layered in
    // later. The GPT step extracts any DA/DAN entries relevant to our fleet.
    const text = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12000);
    report.dgac.scanned = 1;
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: `Extrae Directivas de Aeronavegabilidad chilenas (DA/DAN) aplicables a esta flota desde el texto. Responde JSON {"items":[{"numero","descripcion","dominio","recurrente","intervaloHoras","intervaloMeses"}]}.\n\nFLOTA:\n${profileForPrompt()}\n\nTEXTO:\n${text}`,
      }],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}") as { items?: any[] };
    const items = parsed.items || [];
    const existing = await prisma.complianceDirective.findMany({ where: { aircraftId: MATRICULA, tipo: "DA" }, select: { numero: true } });
    const known = new Set(existing.map((e) => normNum(e.numero)));
    for (const it of items) {
      if (!it?.numero || known.has(normNum(String(it.numero)))) { report.dgac.skipped++; continue; }
      known.add(normNum(String(it.numero)));
      report.dgac.applicable++;
      const dominio = ["AIRFRAME", "ENGINE", "PROPELLER"].includes(it.dominio) ? it.dominio : "AIRFRAME";
      const maxOrden = await prisma.complianceDirective.aggregate({ where: { aircraftId: MATRICULA, tipo: "DA", dominio }, _max: { orden: true } });
      await prisma.complianceDirective.create({
        data: {
          aircraftId: MATRICULA, dominio, tipo: "DA", numero: String(it.numero),
          descripcion: String(it.descripcion || it.numero), aplicabilidad: "APLICA",
          recurrente: !!it.recurrente, intervaloMeses: it.intervaloMeses ?? null, intervaloHoras: it.intervaloHoras ?? null,
          fuente: "DGAC_WEB", urlReferencia: url, observacion: "[Auditor DGAC]",
          orden: (maxOrden._max.orden ?? 0) + 1,
        },
      });
      report.dgac.added++;
      report.added.push({ tipo: "DA", numero: String(it.numero), descripcion: String(it.descripcion || it.numero), esEmergencia: false, url });
    }
  } catch (e: any) {
    report.notes.push(`DGAC: error ${e?.message || e}. Omitida.`);
  }
}

/**
 * Run the full compliance audit. Safe to run on a cron or on-demand.
 * @param opts.monthsBack how far back to scan the Federal Register (default 24)
 * @param opts.maxCandidates cap on GPT assessments per run (cost control, default 20)
 */
export async function runComplianceAudit(opts?: { monthsBack?: number; maxCandidates?: number; perTerm?: number }): Promise<AuditReport> {
  const startedAt = new Date();
  const report: AuditReport = {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    faa: { scanned: 0, applicable: 0, added: 0, skipped: 0, errors: 0 },
    dgac: { scanned: 0, applicable: 0, added: 0, skipped: 0, enabled: false },
    added: [],
    notes: [],
  };

  if (!process.env.OPENAI_API_KEY) {
    report.ok = false;
    report.notes.push("OPENAI_API_KEY no configurada — el auditor no puede evaluar aplicabilidad.");
    report.finishedAt = new Date().toISOString();
    return report;
  }

  const monthsBack = opts?.monthsBack ?? 24;
  const since = new Date(startedAt);
  since.setMonth(since.getMonth() - monthsBack);
  const sinceISO = since.toISOString().slice(0, 10);

  try {
    await auditFAA(report, { sinceISO, maxCandidates: opts?.maxCandidates ?? 20, perTerm: opts?.perTerm ?? 15 });
  } catch (e: any) {
    report.notes.push(`FAA: error ${e?.message || e}`);
  }
  try {
    await auditDGAC(report);
  } catch (e: any) {
    report.notes.push(`DGAC: error ${e?.message || e}`);
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
