import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PATH = "/admin";
const PILOT_PATH = "/pilot";

// ── API protection ────────────────────────────────────────────────────────────────
// Public API prefixes: no session required.
//  - /api/auth/*  → login, password reset, device login (self-authenticating)
//  - /api/health  → Railway healthcheck
//  - /api/cron/*  → protected by their own CRON_SECRET bearer token
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/health", "/api/cron/"];

// Admin-only API prefixes: require role ADMIN (all others just need a session).
const ADMIN_API_PREFIXES = [
  "/api/admin/",
  "/api/flights/", // update + delete of the flight ledger
  "/api/upload-cartola",
  "/api/delete-last-cartola",
  "/api/update-movimiento",
  "/api/upload-movimiento-attachment",
  "/api/pilots/delete",
  "/api/pilots/update",
  "/api/export/",
  "/api/debug-r2",
  "/api/gps-calibration",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // ── APIs ──
  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (ADMIN_API_PREFIXES.some((p) => pathname.startsWith(p)) && token.role !== "ADMIN") {
      return NextResponse.json({ error: "Requiere rol de administrador" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Proteger rutas bajo /admin
  if (pathname.startsWith(ADMIN_PATH)) {
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Verificar rol si está presente
    if (token.role !== "ADMIN") {
      return NextResponse.json({ error: "Acceso restringido" }, { status: 403 });
    }
  }
  
  // Proteger rutas bajo /pilot
  if (pathname.startsWith(PILOT_PATH)) {
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Pilotos pueden acceder a /pilot/*; ADMIN también (para "View as pilot").
    const isPilot = token.role === "PILOTO" || token.role === "PILOT";
    const isAdmin = token.role === "ADMIN";
    if (!isPilot && !isAdmin) {
      return NextResponse.json({ error: "Acceso restringido a pilotos" }, { status: 403 });
    }
  }
  
  // Proteger /register (registro de vuelos): requiere sesión de cualquier rol.
  if (pathname.startsWith("/register")) {
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/pilot/:path*", "/api/:path*", "/register/:path*", "/register"],
};
