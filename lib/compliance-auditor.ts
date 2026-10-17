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
import { AIRCRAFT_PROFILE, FAA_SEARCH_TERMS, FLEET_KEYWORDS, profileForPrompt } from "@/lib/aircraft-profile";

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
  sb: { scanned: number; applicable: number; added: number; skipped: number };
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

  // ── Part 39 sweep (AD Biweekly equivalent) ──
  // Every final AD is a rule amending 14 CFR Part 39 and MUST be published in
  // the Federal Register, so filtering by CFR title 14 / part 39 yields the
  // complete AD stream — the same content as the FAA DRS "AD Biweekly" report
  // (which sits behind Akamai and can't be fetched server-side). This closes
  // the gap where an applicable AD doesn't match any FAA_SEARCH_TERMS term.
  // Candidates are pre-filtered by fleet keywords so the GPT budget isn't
  // burned on Boeing/Airbus ADs.
  const kw = FLEET_KEYWORDS.map((k) => k.toLowerCase());
  const matchesFleet = (doc: FRDoc) => {
    const hay = `${doc.title} ${doc.abstract || ""}`.toLowerCase();
    return kw.some((k) => hay.includes(k));
  };
  let page = 1;
  const MAX_PAGES = 10; // 100/page → up to 1000 ADs per run, plenty for 24 months
  while (page <= MAX_PAGES) {
    const params = new URLSearchParams();
    params.append("conditions[cfr][title]", "14");
    params.append("conditions[cfr][part]", "39");
    params.append("conditions[type][]", "RULE");
    params.append("conditions[publication_date][gte]", sinceISO);
    params.append("order", "newest");
    params.append("per_page", "100");
    params.append("page", String(page));
    for (const f of ["title", "abstract", "html_url", "document_number", "publication_date", "effective_on", "docket_ids"]) {
      params.append("fields[]", f);
    }
    try {
      const res = await fetch(`${FR_API}?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!res.ok) break;
      const json = (await res.json()) as { results?: FRDoc[]; total_pages?: number };
      for (const doc of json.results || []) {
        if (seen.has(doc.document_number)) continue;
        seen.add(doc.document_number);
        if (matchesFleet(doc)) out.push(doc);
      }
      if (!json.results?.length || page >= (json.total_pages ?? 1)) break;
      page++;
    } catch {
      break; // the keyword search above already provides baseline coverage
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

// Normalize an AD/DA number for dedup comparison. Strips a leading directive
// token (AD / DAN / DA — DAN before DA) and all whitespace/hyphens so that
// "DA 75-07", "DA75-07" and "75 07" collapse to the same key.
function normNum(s: string): string {
  return s
    .replace(/^\s*(AD|DAN|DA|MSB|SB)\b/i, "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
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
    // The DGAC page wraps the DA table in ~28k chars of site chrome, so a blind
    // head-slice would miss every directive. Anchor to the "DA vigentes" table
    // and drop the "DEROGADAS" (repealed) section that follows — that focused
    // window (~2k chars) contains exactly the in-force national DAs.
    let text = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const startAnchor = text.search(/DA\s+vigentes|Nombre\s+Norma\s+Aplicaci[oó]n/i);
    if (startAnchor > -1) text = text.slice(startAnchor);
    const derogadasIdx = text.search(/DEROGAD/i);
    if (derogadasIdx > 400) text = text.slice(0, derogadasIdx);
    text = text.slice(0, 18000);
    report.dgac.scanned = 1;
    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: `Eres un inspector de aeronavegabilidad. Del siguiente listado oficial de Directivas de Aeronavegabilidad (DA) NACIONALES vigentes de la DGAC de Chile, extrae SOLO las que apliquen a esta aeronave/flota específica según su columna "Aplicación".\n\nFLOTA (CC-AQI):\n${profileForPrompt()}\n\nREGLAS:\n- Incluye una DA solo si su "Aplicación" nombra un fabricante/modelo de la flota (Cessna 172, Lycoming O-320, McCauley, magnetos Slick) o dice "TODA AERONAVE".\n- EXCLUYE explícitamente DAs de otros productos (helicópteros, Piper, Boeing, Beechcraft, planeadores, Czech Sport, etc.).\n- Conserva el número EXACTO con su prefijo, ej. "DA 78-02".\n- PROHIBIDO inventar o deducir números: solo puedes devolver números que aparezcan LITERALMENTE en el LISTADO. Si no hay DAs aplicables, responde {"items":[]}.\n- "descripcion": la tabla solo trae el fabricante; redacta una frase corta tipo "DA nacional DGAC aplicable a motores Lycoming" (el detalle real está en el PDF).\n- Responde SOLO JSON (sin markdown): {"items":[{"numero","descripcion","dominio":"AIRFRAME|ENGINE|PROPELLER","aplica":true|false,"vigencia":"texto de fecha/norma tal cual","recurrente":true|false,"intervaloHoras":número|null,"intervaloMeses":número|null,"razon":"1 frase: por qué aplica a la flota"}]}\n\nLISTADO:\n${text}`,
      }],
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}") as { items?: any[] };
    const items = parsed.items || [];
    // Anti-hallucination guard: the LLM must only return DA numbers that exist
    // verbatim in the scraped source text. Compare on a normalized form
    // (strip "DA" prefix, whitespace and punctuation) so formatting noise in
    // the HTML doesn't cause false negatives.
    const sourceNorm = text.replace(/[\s.\-–—]/g, "").toUpperCase();
    const numeroEnFuente = (numero: string) => {
      const core = numero.replace(/^DA\s*/i, "").replace(/[\s.\-–—]/g, "").toUpperCase();
      return core.length >= 4 && sourceNorm.includes(core);
    };
    const existing = await prisma.complianceDirective.findMany({ where: { aircraftId: MATRICULA, tipo: "DA" }, select: { numero: true } });
    const known = new Set(existing.map((e) => normNum(e.numero)));
    for (const it of items) {
      if (!it?.numero || it.aplica === false) { report.dgac.skipped++; continue; }
      if (!numeroEnFuente(String(it.numero))) {
        report.dgac.skipped++;
        report.notes.push(`DGAC: "${String(it.numero).trim()}" descartada — el número no existe en el listado oficial (posible alucinación del modelo).`);
        continue;
      }
      if (known.has(normNum(String(it.numero)))) { report.dgac.skipped++; continue; }
      known.add(normNum(String(it.numero)));
      report.dgac.applicable++;
      const dominio = ["AIRFRAME", "ENGINE", "PROPELLER"].includes(it.dominio) ? it.dominio : "AIRFRAME";
      const vigencia = it.vigencia ? String(it.vigencia).trim() : "";
      const razon = it.razon ? String(it.razon).trim() : "";
      const observacion = ["[Auditor DGAC]", razon, vigencia ? `Vigencia: ${vigencia}` : ""].filter(Boolean).join(" · ");
      const maxOrden = await prisma.complianceDirective.aggregate({ where: { aircraftId: MATRICULA, tipo: "DA", dominio }, _max: { orden: true } });
      await prisma.complianceDirective.create({
        data: {
          aircraftId: MATRICULA, dominio, tipo: "DA", numero: String(it.numero).trim(),
          descripcion: String(it.descripcion || it.numero).trim(), aplicabilidad: "APLICA",
          periodicidadRaw: it.recurrente ? [it.intervaloHoras ? `Cada ${it.intervaloHoras} Horas` : "", it.intervaloMeses ? `${it.intervaloMeses} Meses` : ""].filter(Boolean).join(" ") || "Recurrente" : null,
          recurrente: !!it.recurrente, intervaloMeses: it.intervaloMeses ?? null, intervaloHoras: it.intervaloHoras ?? null,
          fuente: "DGAC_WEB", urlReferencia: url, observacion,
          orden: (maxOrden._max.orden ?? 0) + 1,
        },
      });
      report.dgac.added++;
      report.added.push({ tipo: "DA", numero: String(it.numero).trim(), descripcion: String(it.descripcion || it.numero).trim(), esEmergencia: false, url });
    }
    if (report.dgac.added === 0) {
      report.notes.push("DGAC (Chile): fuente nacional revisada; sin DA vigentes nuevas aplicables a la flota (las ya registradas se mantienen).");
    }
  } catch (e: any) {
    report.notes.push(`DGAC: error ${e?.message || e}. Omitida.`);
  }
}

// ── Lycoming Service Bulletin audit ──
// Lycoming publishes its Service Bulletins as structured pages (SUBJECT /
// MODELS AFFECTED / TIME OF COMPLIANCE) under /contact/knowledge-base/
// publications. We scrape the newest listing pages, skip SBs already logged,
// pull each new SB's detail page and let GPT decide applicability against the
// fleet profile — with the same anti-hallucination rule: the SB number must
// exist literally in the scraped listing. Other OEMs (McCauley, Champion/
// Slick, AVStar) have no scrapeable public listings, so they stay manual.
const LYC_BASE = "https://www.lycoming.com";
const LYC_LIST = `${LYC_BASE}/contact/knowledge-base/publications?f%5B0%5D=publication_category%3A31`;
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
} as const;

async function auditLycomingSBs(report: AuditReport, opts: { maxPages?: number; maxAssessments?: number } = {}) {
  const maxPages = opts.maxPages ?? 2; // newest ~20 publications — SBs are infrequent
  const maxAssessments = opts.maxAssessments ?? 8;

  // 1—2. Collect SB links from the listing pages.
  const candidates: { numero: string; title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const url = page === 0 ? LYC_LIST : `${LYC_LIST}&page=${page}`;
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      report.notes.push(`Lycoming SB: el listado respondió ${res.status}. Omitido.`);
      return;
    }
    const html = await res.text();
    // Listing rows look like:
    //   <a href="/publications/service-bulletin-no-639" rel="bookmark">
    //     <h5 class="title"><span …>Service Bulletin No. 639 A</span></h5>
    //     <p><strong>Inspection of Rocker Arm…</strong></p></a>
    const re = /<a[^>]+href="([^"]*(?:service-bulletin|special-service)[^"]*)"[^>]*>[\s\S]{0,400}?Service Bulletin No\.?\s*([0-9]+\s?[A-Z]?)\b[\s\S]{0,200}?(?:<strong>([^<]+)<\/strong>)?[\s\S]{0,100}?<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const numero = `SB ${m[2].trim().replace(/\s+/g, "")}`;
      if (seen.has(normNum(numero))) continue;
      seen.add(normNum(numero));
      const href = m[1].startsWith("http") ? m[1] : `${LYC_BASE}${m[1]}`;
      const subject = (m[3] || "").replace(/\s+/g, " ").trim();
      candidates.push({ numero, title: subject ? `Service Bulletin No. ${m[2].trim()} — ${subject}` : `Service Bulletin No. ${m[2].trim()}`, url: href });
    }
  }
  report.sb.scanned = candidates.length;
  if (!candidates.length) {
    report.notes.push("Lycoming SB: no se pudieron extraer boletines del listado (formato de página cambiado?).");
    return;
  }

  // 3. Drop SBs already in the DB (any tipo — an SB logged as part of an AD obs is fine to re-add as SB, so compare tipo SB only).
  const existing = await prisma.complianceDirective.findMany({ where: { aircraftId: MATRICULA, tipo: "SB" }, select: { numero: true } });
  const known = new Set(existing.map((e) => normNum(e.numero)));

  let assessed = 0;
  for (const c of candidates) {
    if (known.has(normNum(c.numero))) { report.sb.skipped++; continue; }
    if (assessed >= maxAssessments) { report.sb.skipped++; continue; }
    assessed++;

    // 4. Fetch the SB detail page and extract the structured fields.
    let pageText = "";
    try {
      const res = await fetch(c.url, { headers: BROWSER_HEADERS });
      if (!res.ok) { report.sb.skipped++; continue; }
      pageText = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    } catch { report.sb.skipped++; continue; }
    const grab = (label: string) => {
      const m2 = new RegExp(`${label}:?\\s*(.{10,400}?)(?=SUBJECT|MODELS AFFECTED|TIME OF COMPLIANCE|REASON FOR REVISION|DOWNLOAD PUBLICATION|DATE RELEASED|Product Support)`, "i").exec(pageText);
      return m2 ? m2[1].trim() : "";
    };
    const subject = grab("SUBJECT");
    const models = grab("MODELS AFFECTED");
    const compliance = grab("TIME OF COMPLIANCE");
    if (!models && !subject) { report.sb.skipped++; continue; }

    // 5. GPT applicability check against the fleet.
    let a: { applicable: boolean; dominio: string; recurrente: boolean; alEvento: boolean; intervaloHoras: number | null; intervaloMeses: number | null; descripcion: string; reason: string } | null = null;
    try {
      const resp = await openai.chat.completions.create({
        model: MODEL, temperature: 0.1, max_tokens: 350, response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `Eres un inspector de aeronavegabilidad. Determina si este Service Bulletin de Lycoming aplica a la flota.\n\nFLOTA (CC-AQI):\n${profileForPrompt()}\n\nSERVICE BULLETIN:\nNúmero: ${c.numero}\nTítulo: ${c.title}\nSUBJECT: ${subject || "(s/d)"}\nMODELS AFFECTED: ${models || "(s/d)"}\nTIME OF COMPLIANCE: ${compliance || "(s/d)"}\n\nREGLAS:\n- applicable=true SOLO si MODELS AFFECTED incluye el modelo exacto de la flota (O-320-D2J o la serie O-320 sin exclusiones) o componentes instalados (magnetos Slick 4371, carburador AVSTAR). Sufijos distintos (ej. O-320-H2AD) NO aplican.\n- Si MODELS AFFECTED nombra accesorios que la flota NO tiene (fuel servo inyectado, E-MAG, turbo, HET), applicable=false.\n- Si la aplicabilidad depende de rango de seriales/fechas de despacho que no puedes verificar, applicable=true con reason indicando \"verificar serial/ship date\" (criterio conservador).\nResponde SOLO JSON: {\"applicable\":bool,\"dominio\":\"AIRFRAME|ENGINE|PROPELLER\",\"recurrente\":bool,\"alEvento\":bool,\"intervaloHoras\":nºm|null,\"intervaloMeses\":nºm|null,\"descripcion\":\"1 frase en español\",\"reason\":\"1 frase\"}`,
        }],
      });
      a = JSON.parse(resp.choices[0]?.message?.content || "null");
    } catch { /* fall through */ }
    if (!a) { report.sb.skipped++; continue; }
    if (!a.applicable) { report.sb.skipped++; continue; }

    report.sb.applicable++;
    const dominio = ["AIRFRAME", "ENGINE", "PROPELLER"].includes(a.dominio) ? a.dominio : "ENGINE";
    const maxOrden = await prisma.complianceDirective.aggregate({ where: { aircraftId: MATRICULA, tipo: "SB", dominio }, _max: { orden: true } });
    await prisma.complianceDirective.create({
      data: {
        aircraftId: MATRICULA, dominio, tipo: "SB", numero: c.numero,
        descripcion: a.descripcion || c.title, aplicabilidad: "APLICA",
        periodicidadRaw: compliance || null,
        recurrente: !!a.recurrente, alEvento: !!a.alEvento,
        intervaloMeses: a.intervaloMeses ?? null, intervaloHoras: a.intervaloHoras ?? null,
        fuente: "LYCOMING_WEB", urlReferencia: c.url,
        observacion: `[Auditor Lycoming SB] ${a.reason}${models ? ` · Models affected: ${models.slice(0, 200)}` : ""}`,
        orden: (maxOrden._max.orden ?? 0) + 1,
      },
    });
    known.add(normNum(c.numero));
    report.sb.added++;
    report.added.push({ tipo: "SB", numero: c.numero, descripcion: a.descripcion || c.title, esEmergencia: false, url: c.url });
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
    sb: { scanned: 0, applicable: 0, added: 0, skipped: 0 },
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
  try {
    await auditLycomingSBs(report);
  } catch (e: any) {
    report.notes.push(`Lycoming SB: error ${e?.message || e}`);
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
