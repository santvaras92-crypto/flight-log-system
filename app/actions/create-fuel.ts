// rebuild trigger 1765397735
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
async function sendFuelNotificationEmail(fuel: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo");
    return;
  }

  const precioLitro = fuel.litros > 0 ? (fuel.monto / fuel.litros) : 0;

  const emailContent = `
    <h2>Nuevo Registro de Combustible - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${formatDateDDMMAA(fuel.fecha)}</p>
    <p><strong>Piloto:</strong> ${piloto.nombre} (${piloto.codigo || 'Sin código'})</p>
    <hr/>
    <h3>Detalles:</h3>
    <p><strong>Litros:</strong> ${fuel.litros}</p>
    <p><strong>Monto:</strong> $${fuel.monto.toLocaleString('es-CL')}</p>
    <p><strong>Precio/Litro:</strong> $${precioLitro.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
    <p><strong>Detalle:</strong> ${fuel.detalle || 'Sin observaciones'}</p>
    <hr/>
    <p>Para aprobar este registro, accede al panel de administración:</p>
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
        subject: `Combustible - ${piloto.nombre} - $${fuel.monto.toLocaleString('es-CL')}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo fuel:', await response.text());
    } else {
      console.log('Correo de notificación fuel enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo fuel:', error);
  }
}

// Función para enviar correo de confirmación al piloto
async function sendPilotFuelConfirmationEmail(fuel: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY || !piloto.email) {
    console.log("RESEND_API_KEY no configurada o piloto sin email, omitiendo correo piloto");
    return;
  }

  const precioLitro = fuel.litros > 0 ? (fuel.monto / fuel.litros) : 0;

  const emailContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <h2 style="color: #1e40af; margin-bottom: 8px;">⛽ Combustible Registrado - CC-AQI</h2>
      <p style="color: #64748b; margin-top: 0;">Tu registro de combustible ha sido enviado para validación.</p>
      
      <table style="border-collapse: collapse; width: 100%; max-width: 400px; font-size: 14px; margin: 16px 0;">
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; width: 50%;">Fecha</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${formatDateDDMMAA(fuel.fecha)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">Litros</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${fuel.litros} L</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">Monto</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">$${fuel.monto.toLocaleString('es-CL')}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">Precio/Litro</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; color: #059669; font-weight: 600;">$${precioLitro.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} /L</td>
        </tr>
        ${fuel.detalle ? `
        <tr style="background-color: #f8fafc;">
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">Detalle</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${fuel.detalle}</td>
        </tr>
        ` : ''}
      </table>
      
      <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin: 16px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ⏳ <strong>Pendiente de validación</strong> - Recibirás un correo cuando el administrador apruebe tu registro.
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
        subject: `⛽ Combustible Registrado - ${formatDateDDMMAA(fuel.fecha)}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo piloto fuel:', await response.text());
    } else {
      console.log('Correo de confirmación fuel piloto enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo piloto fuel:', error);
  }
}

type Input = {
  pilotoId: number;
  fecha: string;
  litros: number;
  monto: number;
  detalle?: string;
  file: PlainUpload | null; // ahora obligatorio
};

export async function createFuel(input: Input): Promise<{ ok: boolean; id?: number; error?: string }> {
  // Validaciones básicas
  if (!input.pilotoId || isNaN(input.pilotoId)) {
    return { ok: false, error: 'ID de piloto inválido' };
  }
  if (!input.fecha || input.fecha.trim() === '') {
    return { ok: false, error: 'Fecha es requerida' };
  }
  if (!input.litros || isNaN(input.litros) || input.litros <= 0) {
    return { ok: false, error: 'Litros debe ser mayor a 0' };
  }
  if (!input.monto || isNaN(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'Monto debe ser mayor a 0' };
  }
  if (!input.file || !input.file.base64) {
    return { ok: false, error: 'Foto boleta obligatoria' };
  }

  // Parse fecha local a mediodía para evitar desfase
  let fecha: Date;
  try {
    const [year, month, day] = input.fecha.split('-').map(Number);
    fecha = new Date(year, month - 1, day, 12, 0, 0);
    if (isNaN(fecha.getTime())) throw new Error('Fecha inválida');
  } catch (e) {
    return { ok: false, error: 'Formato de fecha inválido' };
  }

  try {
    const imageUrl = await saveUpload(input.file, 'fuel');
    
    // Obtener info del piloto para el email (incluye email)
    const piloto = await prisma.user.findUnique({
      where: { id: input.pilotoId },
      select: { nombre: true, codigo: true, email: true }
    });
    
    const row = await prisma.fuelLog.create({
      data: {
        userId: input.pilotoId,
        fecha,
        litros: input.litros,
        monto: input.monto,
        imageUrl,
        detalle: input.detalle,
        estado: 'PENDIENTE', // Requiere validación admin
      },
      select: { id: true },
    });

    // Enviar notificaciones por email (admin y piloto en paralelo)
    const fuelData = { fecha, litros: input.litros, monto: input.monto, detalle: input.detalle };
    await Promise.all([
      sendFuelNotificationEmail(fuelData, piloto),
      sendPilotFuelConfirmationEmail(fuelData, piloto)
    ]);

    // La Transaction FUEL se crea cuando el admin aprueba el registro
    // Ver: app/actions/validate-fuel.ts
    
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createFuel] prisma/saveUpload error', e);
    return { ok: false, error: e?.message || 'Error BD creando registro combustible' };
  }
}
