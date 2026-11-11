/**
 * sipa-license.ts — consulta pública "Verificación de Licencia" de SIPA (DGAC Chile).
 *
 * Flujo (no requiere credenciales):
 *   1. GET  /home/verificarLicencia/es          → cookie de sesión + _token (CSRF)
 *   2. POST /usuarioLicencia/busqueda/es        → HTML con filas (cada una con verLicencia(id))
 *   3. PDF  /usuarioLicencia/showPdf/{id}/es    → mismo PDF del botón "Imprimir" (GET público)
 *
 * Solo corre en el servidor (el navegador no puede por CORS).
 */
import https from 'https';
import tls from 'tls';
import { normalizeText } from './pilot-matching';

const SIPA = 'https://sipa.dgac.gob.cl';
const TIMEOUT_MS = 15000;

/**
 * SIPA NO envía el certificado intermedio en su handshake TLS (solo el propio, firmado por
 * "GlobalSign RSA OV SSL CA 2018"). Los navegadores lo descargan solos (AIA), Node no:
 * da "unable to verify the first certificate". Se agrega ese intermedio público a las CA raíz
 * de Node: la verificación TLS sigue ACTIVA (no se usa rejectUnauthorized:false).
 * Fuente: http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt (vence 21-11-2028).
 */
const GLOBALSIGN_RSA_OV_SSL_CA_2018 = `-----BEGIN CERTIFICATE-----
MIIETjCCAzagAwIBAgINAe5fIh38YjvUMzqFVzANBgkqhkiG9w0BAQsFADBMMSAw
HgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xvYmFs
U2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0xODExMjEwMDAwMDBaFw0yODEx
MjEwMDAwMDBaMFAxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52
LXNhMSYwJAYDVQQDEx1HbG9iYWxTaWduIFJTQSBPViBTU0wgQ0EgMjAxODCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKdaydUMGCEAI9WXD+uu3Vxoa2uP
UGATeoHLl+6OimGUSyZ59gSnKvuk2la77qCk8HuKf1UfR5NhDW5xUTolJAgvjOH3
idaSz6+zpz8w7bXfIa7+9UQX/dhj2S/TgVprX9NHsKzyqzskeU8fxy7quRU6fBhM
abO1IFkJXinDY+YuRluqlJBJDrnw9UqhCS98NE3QvADFBlV5Bs6i0BDxSEPouVq1
lVW9MdIbPYa+oewNEtssmSStR8JvA+Z6cLVwzM0nLKWMjsIYPJLJLnNvBhBWk0Cq
o8VS++XFBdZpaFwGue5RieGKDkFNm5KQConpFmvv73W+eka440eKHRwup08CAwEA
AaOCASkwggElMA4GA1UdDwEB/wQEAwIBhjASBgNVHRMBAf8ECDAGAQH/AgEAMB0G
A1UdDgQWBBT473/yzXhnqN5vjySNiPGHAwKz6zAfBgNVHSMEGDAWgBSP8Et/qC5F
JK5NUPpjmove4t0bvDA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHA6
Ly9vY3NwMi5nbG9iYWxzaWduLmNvbS9yb290cjMwNgYDVR0fBC8wLTAroCmgJ4Yl
aHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDBHBgNVHSAEQDA+
MDwGBFUdIAAwNDAyBggrBgEFBQcCARYmaHR0cHM6Ly93d3cuZ2xvYmFsc2lnbi5j
b20vcmVwb3NpdG9yeS8wDQYJKoZIhvcNAQELBQADggEBAJmQyC1fQorUC2bbmANz
EdSIhlIoU4r7rd/9c446ZwTbw1MUcBQJfMPg+NccmBqixD7b6QDjynCy8SIwIVbb
0615XoFYC20UgDX1b10d65pHBf9ZjQCxQNqQmJYaumxtf4z1s4DfjGRzNpZ5eWl0
6r/4ngGPoJVpjemEuunl1Ig423g7mNA2eymw0lIYkN5SQwCuaifIFJ6GlazhgDEw
fpolu4usBCOmmQDo8dIm7A9+O4orkjgTHY+GzYZSR+Y0fFukAj6KYXwidlNalFMz
hriSqHKvoflShx8xpfywgVcvzfTO3PYkz6fiNJBonf6q8amaEsybwMbDqKWwIX7e
SPY=
-----END CERTIFICATE-----
`;

let cachedAgent: https.Agent | null = null;
function sipaAgent(): https.Agent {
  if (!cachedAgent) {
    cachedAgent = new https.Agent({
      ca: [...tls.rootCertificates, GLOBALSIGN_RSA_OV_SSL_CA_2018],
      keepAlive: false,
    });
  }
  return cachedAgent;
}

export const SIPA_VERIFY_PAGE = `${SIPA}/`;
export const sipaPdfUrl = (id: string) => `${SIPA}/usuarioLicencia/showPdf/${encodeURIComponent(id)}/es`;

export type SipaSection = 'nacional' | 'provisional' | 'convalidacion';

export type SipaRow = {
  id: string;
  nombre: string; // SIPA lo entrega abreviado: "A. ROSSI"
  numero: string;
  tipo: string; // "PILOTO DE TRANSPORTE DE LINEA AEREA"
  seccion: SipaSection;
};

export type LicenseResolution =
  | { kind: 'found'; row: SipaRow }
  | { kind: 'choose'; rows: SipaRow[]; note: string }
  | { kind: 'none'; note: string };

/* ───────────── Normalización de datos del piloto ───────────── */

/** RUT → "12345678-9" (sin puntos, con guión). Pasaporte → mayúsculas sin espacios. */
export function normalizeDocument(documento?: string | null, tipo?: string | null): string {
  const raw = (documento || '').trim();
  if (!raw) return '';
  const t = (tipo || '').toLowerCase();
  const compact = raw.replace(/[\s.\-]/g, '').toUpperCase();
  const looksRut = /^\d{6,8}[0-9K]$/.test(compact);
  if (t === 'pasaporte' && !looksRut) return raw.replace(/\s+/g, '').toUpperCase();
  if (t === 'rut' || looksRut) {
    if (!/^\d{6,8}[0-9K]$/.test(compact)) return '';
    return `${compact.slice(0, -1)}-${compact.slice(-1)}`;
  }
  return raw.replace(/\s+/g, '').toUpperCase();
}

/* ───────────── HTTP ───────────── */

type SipaResponse = { status: number; ok: boolean; body: string; cookies: string };

function requestOnce(
  url: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}
): Promise<SipaResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (compatible; CC-AQI-FlightLog)', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(opts.body));
    const req = https.request(url, { method: opts.method || 'GET', headers, agent: sipaAgent() }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const status = res.statusCode || 0;
        const setCookie = res.headers['set-cookie'] || [];
        resolve({
          status,
          ok: status >= 200 && status < 300,
          body: Buffer.concat(chunks).toString('utf-8'),
          cookies: setCookie.map(c => c.split(';')[0].trim()).filter(Boolean).join('; '),
        });
      });
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error('SIPA no respondió a tiempo'), { name: 'AbortError' })));
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** Con un reintento ante fallos de red puntuales (conexión reseteada, timeout). */
async function sipaRequest(
  url: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}
): Promise<SipaResponse> {
  try {
    return await requestOnce(url, opts);
  } catch (e) {
    return await requestOnce(url, opts);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const cleanCell = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Extrae las filas de las tres pestañas (Nacionales, Provisionales, Convalidaciones). */
export function parseSipaResults(html: string): SipaRow[] {
  const markers: { key: string; seccion: SipaSection }[] = [
    { key: 'id="licenciasNacionales"', seccion: 'nacional' },
    { key: 'id="licenciasProvisionales"', seccion: 'provisional' },
    { key: 'id="licenciasConvalidaciones"', seccion: 'convalidacion' },
  ];
  const found = markers
    .map(m => ({ ...m, pos: html.indexOf(m.key) }))
    .filter(m => m.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  const rows: SipaRow[] = [];
  found.forEach((m, i) => {
    const end = i + 1 < found.length ? found[i + 1].pos : html.length;
    for (const chunk of html.slice(m.pos, end).split('</tr>')) {
      const idMatch = chunk.match(/verLicencia\((\d+)\)/);
      if (!idMatch) continue;
      const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => cleanCell(c[1]));
      if (cells.length < 3) continue;
      rows.push({ id: idMatch[1], nombre: cells[0], numero: cells[1], tipo: cells[2], seccion: m.seccion });
    }
  });
  return rows;
}

/** Ejecuta la búsqueda pública. Los campos vacíos no filtran (probado contra SIPA). */
export async function searchSipa(params: {
  username?: string;
  apellidoPaterno?: string;
  numeroLicencia?: string;
}): Promise<SipaRow[]> {
  const form = await sipaRequest(`${SIPA}/home/verificarLicencia/es`);
  if (!form.ok) throw new Error(`SIPA respondió ${form.status} al abrir el formulario`);
  const token = form.body.match(/name="_token"\s+value="([^"]+)"/)?.[1];
  if (!token) throw new Error('SIPA: no se encontró el token del formulario');

  const body = new URLSearchParams({
    page: '1',
    username: params.username || '',
    apellidoPaterno: params.apellidoPaterno || '',
    apellidoMaterno: '',
    numeroLicencia: params.numeroLicencia || '',
    _token: token,
  }).toString();

  const res = await sipaRequest(`${SIPA}/usuarioLicencia/busqueda/es`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: form.cookies,
    },
    body,
  });
  if (!res.ok) throw new Error(`SIPA respondió ${res.status} en la búsqueda`);
  return parseSipaResults(res.body);
}

/* ───────────── Cruce de nombres ───────────── */

function nameTokens(s: string): string[] {
  return normalizeText(s).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * SIPA muestra "A. ROSSI" (inicial + apellido paterno). Coincide si todas las palabras
 * del apellido aparecen en el nombre del piloto y la inicial es la de alguno de sus nombres.
 */
export function rowMatchesName(row: SipaRow, pilotName: string): boolean {
  const m = row.nombre.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ])\.?\s+(.+)$/);
  if (!m) return false;
  const initial = normalizeText(m[1]);
  const surname = nameTokens(m[2]);
  const pilot = nameTokens(pilotName);
  if (!surname.length || !pilot.length) return false;
  const surnameOk = surname.every(t => pilot.includes(t));
  const initialOk = pilot.some(t => t.startsWith(initial));
  return surnameOk && initialOk;
}

/* ───────────── Resolución principal ───────────── */

export async function resolveLicense(input: {
  licencia?: string;
  documento?: string;
  tipoDocumento?: string;
  nombre?: string;
}): Promise<LicenseResolution> {
  const lic = (input.licencia || '').trim().toUpperCase();
  const doc = normalizeDocument(input.documento, input.tipoDocumento);

  // 1) Por RUT/pasaporte: identifica a la persona sin ambigüedad. Se filtra por número.
  if (doc) {
    const rows = await searchSipa({ username: doc });
    if (rows.length) {
      const byNumber = lic ? rows.filter(r => r.numero.toUpperCase() === lic) : [];
      if (byNumber.length === 1) return { kind: 'found', row: byNumber[0] };
      if (byNumber.length > 1) {
        return { kind: 'choose', rows: byNumber, note: 'Este documento tiene varias licencias con ese número.' };
      }
      return {
        kind: 'choose',
        rows,
        note: lic
          ? `El N° ${lic} guardado no coincide con ninguna licencia de este documento (${doc}). Estas son las que SIPA le asocia:`
          : `No hay N° de licencia guardado. Estas son las licencias que SIPA asocia a ${doc}:`,
      };
    }
  }

  // 2) Por número de licencia: SIPA devuelve a TODAS las personas con ese número → cruzar por nombre.
  if (!lic) return { kind: 'none', note: 'El piloto no tiene número de licencia ni documento válido.' };
  const rows = await searchSipa({ numeroLicencia: lic });
  if (!rows.length) return { kind: 'none', note: `SIPA no encontró licencias con el número ${lic}.` };

  const candidates = input.nombre ? rows.filter(r => rowMatchesName(r, input.nombre!)) : [];
  if (candidates.length === 1) return { kind: 'found', row: candidates[0] };
  if (candidates.length > 1) {
    return {
      kind: 'choose',
      rows: candidates,
      note: 'Hay más de una licencia con ese número y un nombre parecido. Agregar el RUT del piloto evita esta duda.',
    };
  }
  return {
    kind: 'choose',
    rows,
    note: `Ninguna licencia con el número ${lic} coincide por nombre${input.nombre ? ` con "${input.nombre}"` : ''}. Revisa manualmente:`,
  };
}
