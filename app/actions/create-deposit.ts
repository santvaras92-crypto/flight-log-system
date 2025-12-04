'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload, PlainUpload } from './_utils/save-upload';

// Función para enviar correo de notificación
async function sendDepositNotificationEmail(deposit: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo");
    return;
  }

  const emailContent = `
    <h2>Nuevo Depósito Registrado - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${deposit.fecha.toLocaleDateString('es-CL')}</p>
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
    // Obtener info del piloto para el email
    const piloto = await prisma.user.findUnique({
      where: { id: input.pilotoId },
      select: { nombre: true, codigo: true }
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

    // Enviar notificación por email
    await sendDepositNotificationEmail(
      { fecha, monto: input.monto, detalle: input.detalle },
      piloto
    );

    // La Transaction ABONO se crea cuando el admin aprueba el depósito
    // Ver: app/actions/validate-deposit.ts
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createDeposit] prisma error', e);
    return { ok: false, error: e?.message || 'Error BD creando depósito' };
  }
}
