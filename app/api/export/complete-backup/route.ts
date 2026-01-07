import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateCompleteExcelBackup } from '@/lib/generate-complete-excel-backup';

/**
 * POST /api/export/complete-backup
 * Generate complete Excel backup with all historical data
 * 
 * Query params:
 * - action: 'email' | 'download' (default: 'download')
 * 
 * Auth: Admin only
 */
export async function POST(req: NextRequest) {
  try {
    // Verify admin session
    const session = await getServerSession(authOptions);
    if (!session || (session as any)?.role !== 'ADMIN') {
      return NextResponse.json(
        { ok: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const action = req.nextUrl.searchParams.get('action') || 'download';
    
    console.log(`[Complete Backup] Starting backup generation (action: ${action})...`);
    const startTime = Date.now();
    
    // Generate Excel buffer
    const buffer = await generateCompleteExcelBackup();
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`[Complete Backup] Generation completed in ${generationTime}s, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Filename with current date
    const now = new Date();
    const filename = `FlightLog-Backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`;
    
    if (action === 'email') {
      // Send via email
      const emailSent = await sendBackupEmail(buffer, filename);
      
      if (!emailSent) {
        return NextResponse.json(
          { ok: false, error: 'Error al enviar email' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        ok: true,
        message: `Backup enviado exitosamente a santvaras92@gmail.com`,
        filename,
        size: `${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        generationTime: `${generationTime}s`
      });
    } else {
      // Return file for download
      return new NextResponse(new Blob([buffer]), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString(),
        },
      });
    }
  } catch (error) {
    console.error('[Complete Backup] Error generating backup:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

/**
 * Send backup file via email using Resend
 */
async function sendBackupEmail(buffer: Buffer, filename: string): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.error('[Complete Backup] RESEND_API_KEY no configurada');
    return false;
  }
  
  const now = new Date();
  const formattedDate = now.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1F4E78; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        .highlight { background: #e8f4f8; padding: 15px; border-left: 4px solid #1F4E78; margin: 15px 0; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Flight Log CC-AQI - Backup Completo</h1>
        </div>
        <div class="content">
          <p>Hola Santiago,</p>
          
          <p>Se ha generado el backup completo mensual del sistema Flight Log CC-AQI.</p>
          
          <div class="highlight">
            <strong>📁 Archivo adjunto:</strong> ${filename}<br>
            <strong>📅 Fecha de generación:</strong> ${formattedDate}<br>
            <strong>💾 Tamaño:</strong> ${sizeInMB} MB
          </div>
          
          <p><strong>Contenido del backup:</strong></p>
          <ul>
            <li>✈️ <strong>Vuelos:</strong> Todos los vuelos registrados desde el primer vuelo hasta la fecha</li>
            <li>💰 <strong>Depósitos:</strong> Historial completo de depósitos (DB + CSV)</li>
            <li>⛽ <strong>Combustible:</strong> Todos los registros de combustible desde Sep 2020</li>
            <li>👥 <strong>Pilotos:</strong> Directorio completo con balances y estadísticas</li>
            <li>🛩️ <strong>Aeronaves:</strong> Estado actual y componentes de mantenimiento</li>
            <li>📝 <strong>Transacciones:</strong> Historial completo de movimientos financieros</li>
            <li>⏳ <strong>Pendientes:</strong> Submissions, depósitos y combustible por aprobar</li>
            <li>📋 <strong>Resumen:</strong> Métricas generales y estadísticas del sistema</li>
          </ul>
          
          <p>Este archivo Excel contiene <strong>absolutamente toda la información</strong> almacenada en el sistema hasta la fecha de generación.</p>
          
          <p><strong>Recomendaciones:</strong></p>
          <ul>
            <li>Guardar este archivo en un lugar seguro como respaldo</li>
            <li>El archivo está en formato .xlsx y puede abrirse con Excel, Google Sheets o LibreOffice</li>
            <li>Cada pestaña tiene filtros automáticos para facilitar la búsqueda de información</li>
          </ul>
          
          <div class="footer">
            <p>Este es un mensaje automático del sistema Flight Log CC-AQI.<br>
            Para generar backups manuales, utiliza el botón "💾 Generar Backup Completo" en el dashboard de administración.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
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
        subject: `📊 Flight Log - Backup Completo Mensual (${now.toLocaleDateString('es-CL', { year: 'numeric', month: 'long' })})`,
        html: emailHtml,
        attachments: [
          {
            filename: filename,
            content: buffer.toString('base64')
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Complete Backup] Resend API error:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('[Complete Backup] Email sent successfully:', result.id);
    return true;
  } catch (error) {
    console.error('[Complete Backup] Error sending email:', error);
    return false;
  }
}
