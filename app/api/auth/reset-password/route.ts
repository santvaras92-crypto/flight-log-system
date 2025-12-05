import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token y contraseña son requeridos" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    // Find user by reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date() // Token must not be expired
        }
      },
      select: { id: true, nombre: true, email: true }
    });

    if (!user) {
      return NextResponse.json({ 
        error: "El link ha expirado o no es válido. Solicita uno nuevo." 
      }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    return NextResponse.json({ 
      message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." 
    });

  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// GET to verify token is valid
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, error: "Token requerido" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date()
        }
      },
      select: { id: true, nombre: true }
    });

    if (!user) {
      return NextResponse.json({ valid: false, error: "Token inválido o expirado" });
    }

    return NextResponse.json({ valid: true, userName: user.nombre });

  } catch (error) {
    console.error("Verify token error:", error);
    return NextResponse.json({ valid: false, error: "Error interno" }, { status: 500 });
  }
}
