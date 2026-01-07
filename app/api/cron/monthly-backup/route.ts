import { NextRequest, NextResponse } from 'next/server';
import { generateCompleteExcelBackup } from '@/lib/generate-complete-excel-backup';

/**
 * POST /api/cron/monthly-backup
 * Cron job endpoint to generate and email monthly complete backup
 * 
 * Schedule: 1st of every month at 3 AM Chile time (6 AM UTC)
 * Cron: 0 3 1 * *
 * 
 * Auth: CRON_SECRET header required
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (!expectedSecret) {
      console.error('[Monthly Backup Cron] CRON_SECRET not configured');
      return NextResponse.json(
        { ok: false, error: 'Cron secret not configured' },
        { status: 500 }
      );
    }
    
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    if (providedSecret !== expectedSecret) {
      console.error('[Monthly Backup Cron] Invalid cron secret');
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('[Monthly Backup Cron] ===== STARTING MONTHLY BACKUP =====');
    console.log(`[Monthly Backup Cron] Triggered at: ${new Date().toISOString()}`);
    
    const startTime = Date.now();
    
    // Generate Excel backup
    let buffer: Buffer;
    try {
      buffer = await generateCompleteExcelBackup();
    } catch (error) {
      console.error('[Monthly Backup Cron] Error generating Excel:', error);
      
      // Send error notification email
      await sendErrorNotification(error);
      
      return NextResponse.json(
        { ok: false, error: 'Error generating backup', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
    
    const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);
    
    console.log(`[Monthly Backup Cron] Backup generated successfully:`);
    console.log(`  - Generation time: ${generationTime}s`);
    console.log(`  - File size: ${sizeInMB} MB`);
    
    // Generate filename
    const now = new Date();
    const filename = `FlightLog-Backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`;
    
    // Send email with attachment
    let emailSent = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!emailSent && retryCount < maxRetries) {
      try {
        console.log(`[Monthly Backup Cron] Sending email (attempt ${retryCount + 1}/${maxRetries})...`);
        emailSent = await sendBackupEmail(buffer, filename, generationTime, sizeInMB);
        
        if (!emailSent && retryCount < maxRetries - 1) {
          const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`[Monthly Backup Cron] Email failed, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        retryCount++;
      } catch (error) {
        console.error(`[Monthly Backup Cron] Email attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          const delayMs = Math.pow(2, retryCount - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    if (!emailSent) {
      console.error('[Monthly Backup Cron] Failed to send email after all retries');
      await sendErrorNotification(new Error('Failed to send backup email after 3 attempts'));
      
      return NextResponse.json(
        { ok: false, error: 'Failed to send email after retries' },
        { status: 500 }
      );
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('[Monthly Backup Cron] ===== BACKUP COMPLETED SUCCESSFULLY =====');
    console.log(`  - Total execution time: ${totalTime}s`);
    console.log(`  - Email sent to: santvaras92@gmail.com`);
    console.log(`  - Filename: ${filename}`);
    
    return NextResponse.json({
      ok: true,
      message: 'Monthly backup generated and sent successfully',
      filename,
      size: `${sizeInMB} MB`,
      generationTime: `${generationTime}s`,
      totalTime: `${totalTime}s`,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('[Monthly Backup Cron] Unexpected error:', error);
    
    await sendErrorNotification(error);
    
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Send backup file via email using Resend
 */
async function sendBackupEmail(
  buffer: Buffer,
  filename: string,
  generationTime: string,
  sizeInMB: string
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const recipient = process.env.BACKUP_EMAIL || 'santvaras92@gmail.com';
  
  if (!RESEND_API_KEY) {
    console.error('[Monthly Backup Cron] RESEND_API_KEY not configured');
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
  
  const monthName = now.toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1F4E78 0%, #2E6BA8 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; border-top: none; }
        .footer { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none; font-size: 12px; color: #666; }
        .highlight { background: #e8f4f8; padding: 20px; border-left: 4px solid #1F4E78; margin: 20px 0; border-radius: 4px; }
        .highlight strong { color: #1F4E78; }
        .stats { display: flex; gap: 15px; margin: 20px 0; }
        .stat-box { flex: 1; background: #f5f5f5; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-box .value { font-size: 20px; font-weight: bold; color: #1F4E78; margin-bottom: 5px; }
        .stat-box .label { font-size: 12px; color: #666; text-transform: uppercase; }
        ul { padding-left: 20px; margin: 15px 0; }
        li { margin: 10px 0; line-height: 1.8; }
        .icon { margin-right: 8px; }
        .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .success { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✈️ Flight Log CC-AQI</h1>
          <p>Backup Automático Mensual</p>
        </div>
        
        <div class="content">
          <p>Hola Santiago,</p>
          
          <div class="success">
            ✅ Se ha generado exitosamente el <strong>backup completo mensual</strong> del sistema Flight Log CC-AQI.
          </div>
          
          <div class="highlight">
            <strong>📁 Archivo adjunto:</strong> ${filename}<br>
            <strong>📅 Generado:</strong> ${formattedDate}<br>
            <strong>💾 Tamaño:</strong> ${sizeInMB} MB<br>
            <strong>⚡ Tiempo de generación:</strong> ${generationTime}s
          </div>
          
          <h3 style="color: #1F4E78; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">📋 Contenido del Backup</h3>
          
          <p>Este archivo Excel contiene <strong>toda la información histórica</strong> del sistema:</p>
          
          <ul>
            <li><span class="icon">✈️</span> <strong>Vuelos:</strong> Todos los vuelos desde el primer registro hasta hoy</li>
            <li><span class="icon">💰</span> <strong>Depósitos:</strong> Historial completo (Base de datos + CSV)</li>
            <li><span class="icon">⛽</span> <strong>Combustible:</strong> Registros desde Septiembre 2020</li>
            <li><span class="icon">👥</span> <strong>Pilotos:</strong> Directorio con balances y estadísticas lifetime</li>
            <li><span class="icon">🛩️</span> <strong>Aeronaves:</strong> Estado actual y componentes de mantenimiento</li>
            <li><span class="icon">📝</span> <strong>Transacciones:</strong> Movimientos financieros completos</li>
            <li><span class="icon">⏳</span> <strong>Pendientes:</strong> Submissions y aprobaciones en espera</li>
            <li><span class="icon">📊</span> <strong>Resumen:</strong> Métricas generales y KPIs del sistema</li>
          </ul>
          
          <h3 style="color: #1F4E78; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-top: 30px;">💡 Recomendaciones</h3>
          
          <ul>
            <li>Guarda este archivo en un lugar seguro (Google Drive, Dropbox, etc.)</li>
            <li>Este es tu respaldo mensual automático - consérvalo por seguridad</li>
            <li>El archivo puede abrirse con Microsoft Excel, Google Sheets o LibreOffice</li>
            <li>Cada pestaña incluye filtros automáticos para búsqueda rápida</li>
            <li>Los totales y estadísticas se calculan automáticamente con fórmulas</li>
          </ul>
          
          <div class="alert">
            ⚠️ <strong>Importante:</strong> Este backup se genera automáticamente el 1ro de cada mes. Para backups manuales adicionales, usa el botón "💾 Generar Backup Completo" en el dashboard de administración.
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Sistema Flight Log CC-AQI</strong><br>
          Mensaje automático generado por cron job mensual<br>
          Próximo backup: 1ro de ${new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</p>
          
          <p style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
            Si tienes algún problema con el archivo o necesitas generar un backup adicional,<br>
            accede al dashboard de administración en: <a href="https://flight-log-system-production.up.railway.app/admin/dashboard">flight-log-system-production.up.railway.app/admin/dashboard</a>
          </p>
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
        to: [recipient],
        subject: `📊 Flight Log - Backup Automático Mensual (${monthName})`,
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
      console.error('[Monthly Backup Cron] Resend API error:', response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log('[Monthly Backup Cron] Email sent successfully:', result.id);
    return true;
  } catch (error) {
    console.error('[Monthly Backup Cron] Error sending email:', error);
    return false;
  }
}

/**
 * Send error notification email
 */
async function sendErrorNotification(error: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.error('[Monthly Backup Cron] Cannot send error notification - RESEND_API_KEY not configured');
    return;
  }
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 8px;">
        <h2 style="color: #856404; margin-top: 0;">⚠️ Error en Backup Automático Mensual</h2>
        <p>Se produjo un error al generar el backup automático mensual del Flight Log CC-AQI.</p>
        <div style="background: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <strong>Error:</strong><br>
          <code style="color: #d32f2f;">${errorMessage}</code>
        </div>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        ${errorStack ? `<details style="margin-top: 20px;"><summary>Stack Trace</summary><pre style="background: #f5f5f5; padding: 10px; overflow-x: auto; font-size: 11px;">${errorStack}</pre></details>` : ''}
        <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px;">
          Por favor revisa los logs de Railway para más detalles:<br>
          <a href="https://railway.app">https://railway.app</a>
        </p>
      </div>
    </body>
    </html>
  `;
  
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: ['santvaras92@gmail.com'],
        subject: '⚠️ Error en Backup Automático Mensual - Flight Log',
        html: emailHtml
      }),
    });
    
    console.log('[Monthly Backup Cron] Error notification sent');
  } catch (e) {
    console.error('[Monthly Backup Cron] Failed to send error notification:', e);
  }
}
