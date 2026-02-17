import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import crypto from "crypto";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, nombre: true, email: true, rol: true }
    });

    // Always return success message to prevent email enumeration
    if (!user) {
      return NextResponse.json({ 
        message: "Si el email existe en nuestro sistema, recibirás un link para restablecer tu contraseña." 
      });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    // Build reset URL
    const baseUrl = process.env.NEXTAUTH_URL || 'https://flight-log-system-production.up.railway.app';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email
    try {
      if (!resend) {
        throw new Error("Missing RESEND_API_KEY");
      }

      await resend.emails.send({
        from: "CC-AQI Flight Log <onboarding@resend.dev>",
        to: user.email!,
        subject: "Restablecer Contraseña - CC-AQI",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #003D82; margin: 0;">CC-AQI Flight Log</h1>
            </div>
            
            <h2 style="color: #333;">Hola ${user.nombre},</h2>
            
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
            
            <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #003D82; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Este link expira en <strong>1 hora</strong>.
            </p>
            
            <p style="color: #666; font-size: 14px;">
              Si no solicitaste este cambio, puedes ignorar este email. Tu contraseña no será modificada.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Aero Club de Quintero - Sistema de Registro de Vuelos
            </p>
          </body>
          </html>
        `
      });
    } catch (emailError) {
      console.error("Error sending reset email:", emailError);
      return NextResponse.json({ error: "Error al enviar el email. Intenta de nuevo." }, { status: 500 });
    }

    return NextResponse.json({ 
      message: "Si el email existe en nuestro sistema, recibirás un link para restablecer tu contraseña." 
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
