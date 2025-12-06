import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_PATH = "/admin";
const PILOT_PATH = "/pilot";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  // Debug: log token info
  console.log('Middleware - Path:', pathname, 'Token role:', token?.role);
  
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
    // Solo pilotos pueden acceder a /pilot/* (acepta PILOTO o PILOT)
    const isPilot = token.role === "PILOTO" || token.role === "PILOT";
    if (!isPilot) {
      console.log('Middleware - Access denied. Token role:', token.role);
      return NextResponse.json({ error: "Acceso restringido a pilotos" }, { status: 403 });
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/pilot/:path*"],
};
