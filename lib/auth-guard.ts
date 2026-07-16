import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * auth-guard.ts — server-side authorization helpers for server actions.
 *
 * Server actions are NOT covered by the /api middleware (they POST to page
 * URLs), so every mutating action must call one of these guards explicitly.
 *
 * Session shape (see lib/auth.ts callbacks): role, userId and codigo are
 * attached to the session root.
 */

export type GuardedSession = {
  role: string;
  userId: number;
  codigo: string | null;
  email: string | null;
};

/** Returns the session or throws if the caller isn't logged in. */
export async function requireSession(): Promise<GuardedSession> {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error('No autorizado: se requiere sesión');
  }
  const s = session as any;
  return {
    role: s.role ?? '',
    userId: Number(s.userId ?? 0),
    codigo: s.codigo ?? null,
    email: s.user?.email ?? null,
  };
}

/** Returns the session or throws unless the caller is an ADMIN. */
export async function requireAdmin(): Promise<GuardedSession> {
  const s = await requireSession();
  if (s.role !== 'ADMIN') {
    throw new Error('No autorizado: se requiere rol de administrador');
  }
  return s;
}
