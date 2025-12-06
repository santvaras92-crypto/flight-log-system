import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import crypto from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret";

// Genera un token firmado para el dispositivo (sin DB)
function generateDeviceToken(userId: number, email: string): string {
  const payload = {
    userId,
    email,
    createdAt: Date.now(),
    expiresAt: Date.now() + (90 * 24 * 60 * 60 * 1000), // 90 días
  };
  
  const data = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("hex");
  
  const token = Buffer.from(JSON.stringify({ data: payload, signature })).toString("base64");
  return token;
}

// Valida el token del dispositivo
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

// POST: Generar token después de login exitoso
// Acepta userId (desde sesión ya autenticada) o email/password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, password } = body;
    
    let user;
    
    // Opción 1: userId directo (ya autenticado via NextAuth)
    if (userId) {
      user = await prisma.user.findUnique({ 
        where: { id: Number(userId) },
        select: { id: true, email: true, nombre: true, rol: true }
      });
      if (!user) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
    } 
    // Opción 2: Verificar credenciales
    else if (email && password) {
      const fullUser = await prisma.user.findUnique({ where: { email } });
      if (!fullUser || !fullUser.password) {
        return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
      }
      
      const valid = await bcrypt.compare(password, fullUser.password);
      if (!valid) {
        return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
      }
      user = fullUser;
    } else {
      return NextResponse.json({ error: "userId o email/password requeridos" }, { status: 400 });
    }
    
    // Generar token de dispositivo
    if (!user.email) {
      return NextResponse.json({ error: "Usuario sin email" }, { status: 400 });
    }
    const deviceToken = generateDeviceToken(user.id, user.email);
    
    return NextResponse.json({ 
      success: true, 
      token: deviceToken, // Cambiado a 'token' para coincidir con el cliente
      user: {
        id: user.id,
        email: user.email,
        name: user.nombre,
        role: user.rol,
      }
    });
  } catch (error) {
    console.error("Error generating device token:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET: Validar token existente
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    
    if (!token) {
      return NextResponse.json({ valid: false, error: "Token requerido" }, { status: 400 });
    }
    
    const result = validateDeviceToken(token);
    
    if (!result.valid) {
      return NextResponse.json({ valid: false });
    }
    
    // Verificar que el usuario aún existe
    const user = await prisma.user.findUnique({ 
      where: { id: result.userId },
      select: { id: true, email: true, nombre: true, rol: true }
    });
    
    if (!user) {
      return NextResponse.json({ valid: false, error: "Usuario no encontrado" });
    }
    
    return NextResponse.json({ 
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.nombre,
        role: user.rol,
      }
    });
  } catch (error) {
    console.error("Error validating device token:", error);
    return NextResponse.json({ valid: false, error: "Error interno" }, { status: 500 });
  }
}

// DELETE: No necesario sin DB, pero mantenemos por compatibilidad
export async function DELETE() {
  return NextResponse.json({ success: true });
}
