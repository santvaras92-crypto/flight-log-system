# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ REGLA CRÍTICA #1 — BASE DE DATOS COMPARTIDA CON PRODUCCIÓN

La `DATABASE_URL` de `.env`/`.env.local` apunta al **PostgreSQL de producción en Railway**. No hay DB local separada. **Cualquier cambio que afecte la base de datos debe ser ALERTADO y MEGA CONFIRMADO:**

1. Antes de ejecutar algo que escriba en la DB (INSERT/UPDATE/DELETE, `prisma db push`, `prisma migrate`, seeds): alertar "⚠️ ESTO MODIFICA LA BASE DE DATOS DE PRODUCCIÓN", mostrar qué tablas/filas afecta y cuántas (conteo previo), y pedir confirmación explícita.
2. Operaciones destructivas (DELETE/DROP/TRUNCATE/`--accept-data-loss`/columnas que se borran): **doble confirmación** — el usuario debe escribir algo explícito como "SI, BORRAR".
3. Scripts de modificación: **dry-run por defecto**, ejecutar solo con flag `--execute`.
4. **NUNCA** correr `prisma migrate` ni `prisma db push` en silencio o como paso automático de otra tarea.
5. Lecturas (SELECT, `prisma studio`) exentas, pero declararlo igual.
6. Antes de cambios grandes, ofrecer backup (`lib/generate-complete-excel-backup.ts`, scripts de export).

## What this is

Flight log, billing, and maintenance system for a single aircraft, **CC-AQI** (Cessna 172N, Lycoming O-320-D2J, Chile). Pilots submit flights (Hobbs/Tach readings; the original GPT-4o Vision OCR flow was **dropped** — see Decisions); admins approve them, which charges the pilot's account. It also handles fuel logs, deposits, bank statement (cartola) reconciliation, engine-monitor (JPI) data, cost/overhaul projections, and AD/SB airworthiness compliance auditing. UI text, domain fields, and status values are in Spanish (`fecha`, `piloto`, `saldo_cuenta`, `PENDIENTE`, `COMPLETADO`…). Code comments mix Spanish and English.

Stack: Next.js 14 App Router (server actions plus route handlers), TypeScript, Prisma 5 on **PostgreSQL**, NextAuth v4 (credentials, JWT), Tailwind, Chart.js/Leaflet, OpenAI SDK, Resend (email), Cloudflare R2 (S3 SDK). Deployed on Railway via Nixpacks.

> README.md is outdated: it describes SQLite and an early OCR-only scope. The real datasource is PostgreSQL (`prisma/schema.prisma`).

## Commands

```bash
npm run dev            # next dev on :3000
npm run build          # verify-source-files.js + next build (prebuild also runs prisma generate)
npm run lint           # next lint
npx tsc --noEmit       # type-check (scripts/ is excluded from tsconfig)
npm run db:generate    # prisma generate
npm run db:push        # prisma db push (no migrations workflow is used in practice)
npm run db:studio
npx tsx scripts/<name>.ts   # one-off maintenance/diagnostic scripts
```

There is no test suite. To check a change, type-check and build, run a script against the DB, or exercise the app.

**Database caution:** `.env` holds a `DATABASE_URL` pointing at the Railway production Postgres (`*.proxy.rlwy.net`). `npx tsx scripts/...`, `prisma db push`, and `prisma studio` therefore hit **production data** unless you override `DATABASE_URL`. `.env.local` (used by `next dev`) may point elsewhere. Confirm before running anything that writes. `npm start` itself runs `prisma db push --accept-data-loss` on boot, so schema changes are applied on deploy.

## Architecture

**Routing and auth**
- `middleware.ts` guards `/admin/*` (ADMIN role), `/pilot/*` (PILOTO/PILOT, or ADMIN for "view as pilot"), `/register`, and `/api/*`. `/api/auth/*`, `/api/health`, and `/api/cron/*` are public. `ADMIN_API_PREFIXES` lists admin-only APIs, so add new admin endpoints there.
- **Server actions are not covered by middleware.** Every mutating action in `app/actions/` must call `requireAdmin()` or `requireSession()` from `lib/auth-guard.ts`.
- `lib/auth.ts`: credentials login. Users with `rol = 'INACTIVO'` are rejected at login, and live JWTs are periodically revalidated against the DB. Deactivated pilots stay visible in admin history/accounts; only login is revoked.
- Cron endpoints (`app/api/cron/monthly-backup`, `app/api/cron/audit-compliance`) authenticate with `Authorization: Bearer $CRON_SECRET` (see `RAILWAY_CRON_SETUP.md`).

**Flight lifecycle** (`FlightSubmission` → `Flight` → `Transaction`)
1. Pilot submits via `/register` (`create-flight-submission.ts` / `submit-flight-images.ts`). OCR (`lib/ocr-service.ts`, `process-ocr.ts`) extracts Hobbs/Tach, and low confidence goes to manual review.
2. Admin approves in `/admin/validacion` (`approve-flight.ts`). Inside one `prisma.$transaction` it computes `costo = diff_hobbs × (tarifa + instructor_rate)`, sets `Flight.aprobado`, creates a negative `CARGO_VUELO` Transaction, decrements `User.saldo_cuenta`, and marks the submission `COMPLETADO`.
3. **Hobbs** drives billing and **Tach** drives maintenance. Aircraft counters and `Component` hours (engine/airframe/prop, TBO) are derived from flights, so edits or deletes of flights must resync aircraft counters (`/api/flights/update|delete`).
- Pilot balances also move through `Deposit` and `FuelLog` (fuel credits), which have their own validate/delete actions. Monetary math uses `Prisma.Decimal`.

**Admin dashboard**: `app/admin/dashboard/ui/DashboardClient.tsx` is a single ~9k-line client component (tabs for overview, finances, cost model, fuel forecast, maintenance/inspections, engine analysis, compliance). Most UI work lands here; search within it rather than reading it whole.

**Engine and GPS data**: `lib/jpi-decoder.ts` decodes JPI engine-monitor files into `EngineMonitorFlight`/`EngineMonitorReading`. `lib/engine-flight-matcher.ts` links them to `Flight` rows (manual relink/rematch via `/api/admin/*`). `lib/kml-parser.ts` and `lib/gps-calibration.ts` handle tracks.

**Compliance auditor** (`lib/compliance-auditor.ts`, `lib/aircraft-profile.ts`): scans the FAA Federal Register for ADs, Lycoming Service Bulletins, and optionally DGAC, then uses GPT-4o to decide serial-level applicability against `AIRCRAFT_PROFILE` and the document-backed `KNOWN_FACTS`. Results are upserted into `ComplianceDirective`/`ComplianceEvent`. An anti-hallucination guard means the LLM may only return directive/SB numbers that exist in the fetched source. Keep that invariant when changing prompts. Only add to `KNOWN_FACTS` from verified documents.

**Other lib modules**: `uf-service.ts` (Chilean UF index), `hobbs-predictor.ts`, `generate-*-pdf.ts` / `generate-complete-excel-backup.ts` (exports and the monthly emailed backup), `r2-storage.ts` (R2 used only when all `R2_*` env vars exist; uploads are also saved locally). `AppCache` is a key→JSON table used to cache external data (Brent, CPI, engine price, etc.) and user overrides.

## Datos canónicos de la aeronave — NO INVENTAR

Fuente de verdad: `lib/aircraft-profile.ts` (`AIRCRAFT_PROFILE`, `KNOWN_FACTS`, `FLEET_KEYWORDS`, `factsForPrompt()`).

| Componente | Dato |
|---|---|
| Avión | Cessna 172N, S/N 17273461, matrícula CC-AQI |
| Motor | Lycoming O-320-D2J, S/N **RL-7662-39E**, factory rebuilt, **ship date 14-jul-2022** (lycoming.com/rl-7662-39e), P/N RENPL-RT8164, Eagle Copters factura 6941 (28-sep-2022) |
| Hélice | McCauley 1C160/DTM7557, S/N 81737 (paso fijo) |
| Magnetos | Slick 4371, S/N 22020846 / 22030883 (lote 2022) |
| Carburador | AVSTAR AV10-5217, S/N AV53977461 |
| Combustible | **Alimentación por gravedad** — no hay bomba, servo de inyección, turbo ni E-MAG |

Sin reemplazos de piezas internas del motor desde el rebuild 2022. Hechos nuevos documentados → agregarlos a `KNOWN_FACTS` con su evidencia, no hardcodearlos en otros lados.

Estado de directivas ya resuelto (no reabrir sin nueva evidencia): AD 2026-04-11 → NO_APLICA (ship date posterior al corte); SB 659 → APLICA (serial del motor aparece literal en el PDF); SB 640, 667A, 671A → NO_APLICA.

## Decisiones de diseño — NO REVERTIR

1. **NO usamos OCR.** El plan original (README) era OCR con GPT-4o Vision sobre fotos de Hobbs/Tach — se descartó. No reintroducir tesseract, Vision ni pipelines de OCR. Para PDFs: solo texto nativo con `pdf-parse` v2 (`new PDFParse({data}).getText()`, NO la API v1); PDFs escaneados → proceso manual. `lib/ocr-service.ts` y `app/actions/process-ocr.ts` son legacy.
2. **Modelo de precio de combustible V2 (Brent + FX-OU) está CONGELADO.** Cualquier cambio requiere pasar los backtests (`scripts/backtest-fuel-model*.ts`).
3. **Anti-alucinación del auditor**: todo número de directiva/SB devuelto por el LLM debe existir literalmente en la fuente scrapeada (comparación normalizada `normNum`). Ya hubo DAs inventadas (78-03/78-04) que hubo que borrar. SBs Lycoming: descargar el PDF adjunto y hacer match determinístico de seriales (`fleetSerials()`) antes de consultar GPT — las tablas de seriales viven en los PDFs, no en el HTML.
4. **Postura conservadora**: ante duda de aplicabilidad, `APLICA` hasta probar lo contrario con evidencia documental.
5. **Remanentes dinámicos**: TBO, plan de reemplazo y directivas recurrentes se calculan en vivo contra los contadores de dominio y calendario; nunca persistir ni confiar en remanentes de planillas.

## Conventions and gotchas

- Path alias `@/*` → repo root. `next.config.js` disables the webpack cache and pins the alias explicitly to work around stale Railway builds. Don't remove that.
- `scripts/verify-source-files.js` fails the build if a file in its `CRITICAL_FILES` list is missing. Update the list when renaming or removing one of those files.
- Role strings: `ADMIN`, `PILOTO` (legacy `PILOT` also accepted), `INACTIVO`.
- The root-level spreadsheets/CSVs (`Bitacora CC-AQI.xlsx`, `Cuenta banco/`, `Combustible/`, etc.) are source data used by import scripts, not app code.
