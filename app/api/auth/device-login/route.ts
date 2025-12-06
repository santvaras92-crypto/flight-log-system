import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encode } from "next-auth/jwt";
import crypto from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret";

// Valida el token del dispositivo (sin DB)
function validateDeviceToken(token: string): { valid: boolean; userId?: number; email?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    const { data, signature } = decoded;
    
    // Verificar firma
    const expectedSignature = crypto
      .createHmac("sha256", SECRET)
      .update(JSON.stringify(data))
      .digest("hex");
    
    if (signature !== expectedSignature) {
      return { valid: false };
    }
    
    // Verificar expiración
    if (Date.now() > data.expiresAt) {
      return { valid: false };
    }
    
    return { valid: true, userId: data.userId, email: data.email };
  } catch {
    return { valid: false };
  }
}

// POST: Auto-login usando device token
export async function POST(req: NextRequest) {
  try {
    const { deviceToken } = await req.json();
    
    if (!deviceToken) {
      return NextResponse.json({ success: false, error: "Token requerido" }, { status: 400 });
    }
    
    // Validar device token (sin DB)
    const tokenResult = validateDeviceToken(deviceToken);
    
    if (!tokenResult.valid || !tokenResult.userId) {
      return NextResponse.json({ success: false, error: "Token no válido o expirado" });
    }
    
    // Buscar usuario en la DB
    const user = await prisma.user.findUnique({
      where: { id: tokenResult.userId },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        codigo: true,
      }
    });
    
    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" });
    }
    
    // Crear JWT token para NextAuth
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ success: false, error: "Config error" }, { status: 500 });
    }
    
    const token = await encode({
      token: {
        sub: String(user.id),
        email: user.email,
        name: user.nombre,
        role: user.rol,
        userId: String(user.id),
      },
      secret,
      maxAge: 90 * 24 * 60 * 60, // 90 días
    });
    
    // Crear response con cookie de sesión
    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        name: user.nombre,
        role: user.rol,
      },
      redirectUrl: user.rol === "ADMIN" ? "/admin/dashboard" : "/pilot/dashboard"
    });
    
    // Setear cookie de NextAuth
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
    
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 90 * 24 * 60 * 60, // 90 días
    });
    
    return response;
  } catch (error) {
    console.error("Error in auto-login:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
