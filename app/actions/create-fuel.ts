'use server';

import { prisma } from '@/lib/prisma';
import { saveUpload, PlainUpload } from './_utils/save-upload';

// Función para enviar correo de notificación
async function sendFuelNotificationEmail(fuel: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo");
    return;
  }

  const emailContent = `
    <h2>Nuevo Registro de Combustible - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${fuel.fecha.toLocaleDateString('es-CL')}</p>
    <p><strong>Piloto:</strong> ${piloto.nombre} (${piloto.codigo || 'Sin código'})</p>
    <hr/>
    <h3>Detalles:</h3>
    <p><strong>Litros:</strong> ${fuel.litros}</p>
    <p><strong>Monto:</strong> $${fuel.monto.toLocaleString('es-CL')}</p>
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
    
    // Obtener info del piloto para el email
    const piloto = await prisma.user.findUnique({
      where: { id: input.pilotoId },
      select: { nombre: true, codigo: true }
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

    // Enviar notificación por email
    await sendFuelNotificationEmail(
      { fecha, litros: input.litros, monto: input.monto, detalle: input.detalle },
      piloto
    );

    // La Transaction FUEL se crea cuando el admin aprueba el registro
    // Ver: app/actions/validate-fuel.ts
    
    return { ok: true, id: row.id };
  } catch (e: any) {
    console.error('[createFuel] prisma/saveUpload error', e);
    return { ok: false, error: e?.message || 'Error BD creando registro combustible' };
  }
}
