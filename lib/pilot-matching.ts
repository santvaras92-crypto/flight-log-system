/**
 * pilot-matching.ts — detección de pilotos ya inscritos similares a una solicitud.
 * Funciones puras (sin acceso a BD) para poder usarlas en el servidor y probarlas fácil.
 */

export type PilotLite = {
  id: number;
  nombre: string;
  codigo: string | null;
  email: string | null;
  documento: string | null;
  telefono: string | null;
  licencia: string | null;
};

export type RegistrationLike = {
  nombre: string;
  apellido?: string | null;
  email?: string | null;
  documento?: string | null;
  telefono?: string | null;
  licencia?: string | null;
};

export type MatchReason = 'documento' | 'email' | 'licencia' | 'telefono' | 'nombre';

export type PilotMatch = {
  pilot: PilotLite;
  reasons: MatchReason[];
  score: number;
};

const WEIGHTS: Record<MatchReason, number> = {
  documento: 100,
  email: 90,
  licencia: 60,
  telefono: 50,
  nombre: 40,
};

/** Minúsculas, sin acentos, sin espacios sobrantes. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** RUT / pasaporte comparables: solo alfanuméricos, sin ceros a la izquierda. */
function normalizeDoc(doc?: string | null): string {
  return (doc || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '');
}

/** Últimos 8 dígitos del teléfono (ignora prefijo de país). */
function normalizePhone(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/** Palabras iguales, o casi iguales (1 letra de diferencia) si son largas. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1;
}

function namesSimilar(regName: string, pilotName: string): boolean {
  const r = tokens(regName);
  const p = tokens(pilotName);
  if (r.length === 0 || p.length === 0) return false;
  const shared = r.filter(rt => p.some(pt => tokensMatch(rt, pt))).length;
  // Con nombre + apellido deben coincidir al menos 2 palabras
  return shared >= Math.min(2, r.length, p.length);
}

/** Devuelve los pilotos existentes parecidos a la solicitud, del más al menos probable. */
export function findSimilarPilots(
  registration: RegistrationLike,
  pilots: PilotLite[],
  limit = 5
): PilotMatch[] {
  const regName = `${registration.nombre || ''} ${registration.apellido || ''}`.trim();
  const regDoc = normalizeDoc(registration.documento);
  const regEmail = (registration.email || '').trim().toLowerCase();
  const regLic = (registration.licencia || '').trim();
  const regPhone = normalizePhone(registration.telefono);

  const matches: PilotMatch[] = [];
  for (const pilot of pilots) {
    const reasons: MatchReason[] = [];
    if (regDoc && normalizeDoc(pilot.documento) === regDoc) reasons.push('documento');
    if (regEmail && (pilot.email || '').trim().toLowerCase() === regEmail) reasons.push('email');
    if (regLic && (pilot.licencia || '').trim() === regLic) reasons.push('licencia');
    if (regPhone && normalizePhone(pilot.telefono) === regPhone) reasons.push('telefono');
    if (namesSimilar(regName, pilot.nombre)) reasons.push('nombre');

    if (reasons.length > 0) {
      matches.push({
        pilot,
        reasons,
        score: reasons.reduce((sum, r) => sum + WEIGHTS[r], 0),
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
