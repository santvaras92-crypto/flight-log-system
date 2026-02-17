// railway-rebuild 1771354074
'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload, PlainUpload } from './_utils/save-upload';

// Helper to format date as DD-MM-AA
function formatDateDDMMAA(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(-2);
  return `${d}-${m}-${y}`;
}

// Función para enviar correo de notificación al admin
async function sendDepositNotificationEmail(deposit: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo");
    return;
  }

  const emailContent = `
    <h2>Nuevo Depósito Registrado - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${formatDateDDMMAA(deposit.fecha)}</p>
    <p><strong>Piloto:</strong> ${piloto.nombre} (${piloto.codigo || 'Sin código'})</p>
    <hr/>
    <h3>Detalles:</h3>
    <p><strong>Monto:</strong> $${deposit.monto.toLocaleString('es-CL')}</p>
    <p><strong>Detalle:</strong> ${deposit.detalle || 'Sin observaciones'}</p>
    <hr/>
    <p>Para aprobar este depósito, accede al panel de administración:</p>
    <p><a href="${process.env.NEXTAUTH_URL || 'https://flight-log-system-production.up.railway.app'}/admin/validacion">Ver Validaciones Pendientes</a></p>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: ['santvaras92@gmail.com'],
        subject: `Depósito - ${piloto.nombre} - $${deposit.monto.toLocaleString('es-CL')}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo depósito:', await response.text());
    } else {
      console.log('Correo de notificación depósito enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo depósito:', error);
  }
}

// Función para enviar correo de confirmación al piloto
async function sendPilotDepositConfirmationEmail(deposit: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY || !piloto.email) {
    console.log("RESEND_API_KEY no configurada o piloto sin email, omitiendo correo piloto");
    return;
  }

  const emailContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <h2 style="color: #1e40af; margin-bottom: 8px;">💰 Depósito Registrado - CC-AQI</h2>
      <p style="color: #64748b; margin-top: 0;">Tu depósito ha sido enviado para validación.</p>
      
      <table style="border-collapse: collapse; width: 100%; max-width: 400px; font-size: 14px; margin: 16px 0;">
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; width: 50%;">Fecha</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${formatDateDDMMAA(deposit.fecha)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">Monto</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; color: #059669; font-weight: 600;">$${deposit.monto.toLocaleString('es-CL')}</td>
        </tr>
        ${deposit.detalle ? `
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">Detalle</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${deposit.detalle}</td>
        </tr>
        ` : ''}
      </table>
      
      <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin: 16px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ⏳ <strong>Pendiente de validación</strong> - Recibirás un correo cuando el administrador apruebe tu depósito.
        </p>
      </div>
      
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
        Este correo fue enviado automáticamente por el sistema CC-AQI Flight Log.
      </p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: [piloto.email],
        subject: `💰 Depósito Registrado - ${formatDateDDMMAA(deposit.fecha)}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo piloto depósito:', await response.text());
    } else {
      console.log('Correo de confirmación depósito piloto enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo piloto depósito:', error);
  }
}

type Input = {
  pilotoId: number;
  fecha: string;
  monto: number;
  detalle?: string;
  file: PlainUpload | null; // ahora obligatorio en validación
};

export async function createDeposit(input: Input): Promise<{ ok: boolean; id?: number; error?: string }> {
  console.log('[createDeposit] start', {
    pilotoId: input.pilotoId,
    fecha: input.fecha,
    monto: input.monto,
    detalleLen: input.detalle?.length,
  });
  // Basic validation
  if (!input.pilotoId || isNaN(input.pilotoId)) {
    return { ok: false, error: 'ID de piloto inválido' };
  }
  if (!input.fecha || input.fecha.trim() === '') {
    return { ok: false, error: 'Fecha es requerida' };
  }
  if (!input.monto || isNaN(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'Monto debe ser mayor a 0' };
  }

  let fecha: Date;
  try {
    const [year, month, day] = input.fecha.split('-').map(Number);
    fecha = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');
  } catch (e: any) {
    return { ok: false, error: 'Formato de fecha inválido' };
  }

  // Validar presencia de imagen (file obligatorio)
  if (!input.file || !input.file.base64) {
    return { ok: false, error: 'Comprobante (imagen) es obligatorio' };
  }

  const imageUrl = await saveUpload(input.file, 'deposit');

  try {
    // Obtener info del piloto para el email (incluye email)
    const piloto = await prisma.user.findUnique({
      where: { id: input.pilotoId },
      select: { nombre: true, codigo: true, email: true }
    });

    const row = await prisma.deposit.create({
      data: {
        userId: input.pilotoId,
        fecha,
        monto: input.monto,
        imageUrl,
        detalle: input.detalle,
        estado: 'PENDIENTE', // Requiere validación admin
      },
      select: { id: true },
    });
    console.log('[createDeposit] success id', row.id);

    // Enviar notificaciones por email (admin y piloto en paralelo)
    const depositData = { fecha, monto: input.monto, detalle: input.detalle };
    await Promise.all([
      sendDepositNotificationEmail(depositData, piloto),
      sendPilotDepositConfirmationEmail(depositData, piloto)
    ]);

    // La Transaction ABONO se crea cuando el admin aprueba el depósito
    // Ver: app/actions/validate-deposit.ts
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createDeposit] prisma error', e);
    return { ok: false, error: e?.message || 'Error BD creando depósito' };
  }
}
