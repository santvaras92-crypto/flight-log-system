'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth-guard';
import { anchorNoonUTC } from '@/lib/date-utils';

type Input = {
  pilotoId: number;
  fecha: string;       // ISO
  hobbs_fin: number;   // REQUIRED
  tach_fin: number;    // REQUIRED
  copiloto?: string;   // optional
  detalle?: string;    // optional
  aerodromoSalida?: string;  // default SCCV
  aerodromoDestino?: string; // default SCCV
  // Stuck-hobbs mode: the physical HOBBS meter is jammed and no longer
  // advances. The pilot still logs real flight time, entered directly as
  // hobbsTiempoVuelo. hobbs_fin is forced to stay at the stuck reading.
  hobbsStuck?: boolean;
  hobbsTiempoVuelo?: number; // real flight time in hours (required when hobbsStuck)
};

// Helper to format date as DD-MM-AA
function formatDateDDMMAA(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(-2);
  return `${d}-${m}-${y}`;
}

// Función para enviar correo de notificación al admin
async function sendAdminNotificationEmail(submission: any, piloto: any, lastCounters: { hobbs: number | null; tach: number | null }, lastComponents: { airframe: number | null; engine: number | null; propeller: number | null }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo admin");
    return;
  }

  const diffHobbs = lastCounters.hobbs !== null ? (submission.hobbsFinal - lastCounters.hobbs).toFixed(1) : '-';
  const diffTach = lastCounters.tach !== null ? (submission.tachFinal - lastCounters.tach).toFixed(1) : '-';
  
  const emailContent = `
    <h2>Nuevo Reporte de Vuelo - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${formatDateDDMMAA(submission.fechaVuelo)}</p>
    <p><strong>Piloto:</strong> ${piloto.nombre} (${piloto.codigo || 'Sin código'})</p>
    <p><strong>Email:</strong> ${piloto.email || 'No especificado'}</p>
    <hr/>
    <h3>Contadores:</h3>
    <p><strong>Hobbs Final:</strong> ${submission.hobbsFinal} (${diffHobbs} hrs)</p>
    <p><strong>Tach Final:</strong> ${submission.tachFinal} (${diffTach} hrs)</p>
    <hr/>
    <h3>Información Adicional:</h3>
    <p><strong>Ruta:</strong> ${submission.aerodromoSalida} → ${submission.aerodromoDestino}</p>
    <p><strong>Copiloto:</strong> ${submission.copiloto || 'No especificado'}</p>
    <p><strong>Observaciones:</strong> ${submission.detalle || 'Sin observaciones'}</p>
    <hr/>
    <p>Para aprobar este vuelo, accede al panel de administración:</p>
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
        subject: `Nuevo Vuelo - ${piloto.nombre} - ${formatDateDDMMAA(submission.fechaVuelo)}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo admin:', await response.text());
    } else {
      console.log('Correo de notificación admin enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo admin:', error);
  }
}

// Función para enviar correo de confirmación al piloto con vista previa de bitácora
async function sendPilotConfirmationEmail(
  submission: any, 
  piloto: any, 
  lastCounters: { hobbs: number | null; tach: number | null },
  lastComponents: { airframe: number | null; engine: number | null; propeller: number | null }
) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY || !piloto.email) {
    console.log("RESEND_API_KEY no configurada o piloto sin email, omitiendo correo piloto");
    return;
  }

  // Calculate deltas
  const diffHobbs = lastCounters.hobbs !== null ? (submission.hobbsFinal - lastCounters.hobbs).toFixed(1) : '-';
  const diffTach = lastCounters.tach !== null ? (submission.tachFinal - lastCounters.tach).toFixed(1) : '-';
  
  // Calculate new component hours
  const newAirframe = lastComponents.airframe !== null && diffHobbs !== '-' 
    ? (lastComponents.airframe + parseFloat(diffHobbs)).toFixed(1) 
    : '-';
  const newEngine = lastComponents.engine !== null && diffHobbs !== '-' 
    ? (lastComponents.engine + parseFloat(diffHobbs)).toFixed(1) 
    : '-';
  const newPropeller = lastComponents.propeller !== null && diffHobbs !== '-' 
    ? (lastComponents.propeller + parseFloat(diffHobbs)).toFixed(1) 
    : '-';

  // Vertical logbook preview table (fits email width better)
  const logbookPreview = `
    <table style="border-collapse: collapse; width: 100%; max-width: 400px; font-size: 14px; margin: 16px 0;">
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; width: 50%;">DATE</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${formatDateDDMMAA(submission.fechaVuelo)}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">HOBBS</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${lastCounters.hobbs?.toFixed(1) || '-'} → ${submission.hobbsFinal.toFixed(1)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">BLOCK TIME</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${diffHobbs} hrs</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">TAC</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${lastCounters.tach?.toFixed(1) || '-'} → ${submission.tachFinal.toFixed(1)}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">TACH TIME</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${diffTach} hrs</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">AIRFRAME</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${newAirframe} hrs</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">ENGINE</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${newEngine} hrs</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">PROPELLER</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${newPropeller} hrs</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">PILOT</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${piloto.nombre}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">INSTRUCTOR</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${submission.copiloto || '-'}</td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600;">ROUTE</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${submission.aerodromoSalida} → ${submission.aerodromoDestino}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: 600; background-color: #f8fafc;">REMARKS</td>
        <td style="border: 1px solid #e2e8f0; padding: 8px 12px;">${submission.detalle || '-'}</td>
      </tr>
    </table>
  `;

  const emailContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <h2 style="color: #1e40af; margin-bottom: 8px;">✈️ Vuelo Registrado - CC-AQI</h2>
      <p style="color: #64748b; margin-top: 0;">Tu registro de vuelo ha sido enviado para validación.</p>
      
      <h3 style="color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Vista Previa Bitácora</h3>
      ${logbookPreview}
      
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
        subject: `✈️ Vuelo Registrado - ${formatDateDDMMAA(submission.fechaVuelo)}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo piloto:', await response.text());
    } else {
      console.log('Correo de confirmación piloto enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo piloto:', error);
  }
}

export async function createFlightSubmission(input: Input) {
  // Identity enforcement: pilots can only submit flights as THEMSELVES.
  // The pilotoId from the client is only trusted for ADMIN sessions.
  const session = await requireSession();
  const isAdmin = session.role === 'ADMIN';
  if (!isAdmin) {
    // The register flow may resolve the pilot via CSV code to a different
    // user row than the session's, so accept a match by id OR by codigo.
    const target = await prisma.user.findUnique({
      where: { id: input.pilotoId },
      select: { codigo: true },
    });
    const sameId = session.userId && input.pilotoId === session.userId;
    const sameCode =
      session.codigo && target?.codigo &&
      target.codigo.toUpperCase() === session.codigo.toUpperCase();
    if (!sameId && !sameCode) {
      throw new Error('Solo puedes registrar vuelos a tu propio nombre.');
    }
  }

  if (
    !input.pilotoId ||
    !input.fecha ||
    typeof input.hobbs_fin !== 'number' ||
    typeof input.tach_fin !== 'number' ||
    Number.isNaN(input.hobbs_fin) ||
    Number.isNaN(input.tach_fin)
  ) {
    throw new Error('HOBBS F y TACH F son obligatorios.');
  }

  // Parse fecha and anchor to noon UTC so the calendar day never shifts across
  // timezones (a midnight-UTC date rolls back a day in Chile and breaks the
  // engine↔flight matcher, which groups by local Chile date).
  const fechaVuelo = anchorNoonUTC(input.fecha);

  // Get pilot info including email
  const piloto = await prisma.user.findUnique({
    where: { id: input.pilotoId },
    select: { nombre: true, codigo: true, email: true }
  });

  // Get last flight to calculate baselines (by highest hobbs_fin, not fecha).
  // Tie-break by fecha+id: with a stuck hobbs meter many flights share the
  // same hobbs_fin, so we need the chronologically latest one.
  const lastFlight = await prisma.flight.findFirst({
    where: { aircraftId: 'CC-AQI', hobbs_fin: { not: null } },
    orderBy: [{ hobbs_fin: 'desc' }, { fecha: 'desc' }, { id: 'desc' }],
    select: { 
      hobbs_fin: true, 
      tach_fin: true,
      airframe_hours: true,
      engine_hours: true,
      propeller_hours: true,
    },
  });

  // If no previous flight exists, get counters from aircraft
  const aircraft = await prisma.aircraft.findUnique({
    where: { matricula: 'CC-AQI' },
    select: { hobbs_actual: true, tach_actual: true }
  });

  const lastCounters = {
    hobbs: lastFlight?.hobbs_fin ? Number(lastFlight.hobbs_fin) : (aircraft?.hobbs_actual ? Number(aircraft.hobbs_actual) : 0),
    tach: lastFlight?.tach_fin ? Number(lastFlight.tach_fin) : (aircraft?.tach_actual ? Number(aircraft.tach_actual) : 0),
  };

  const lastComponents = {
    airframe: lastFlight?.airframe_hours ? Number(lastFlight.airframe_hours) : null,
    engine: lastFlight?.engine_hours ? Number(lastFlight.engine_hours) : null,
    propeller: lastFlight?.propeller_hours ? Number(lastFlight.propeller_hours) : null,
  };

  // Calcular diferencias y nuevas horas de componentes
  const hobbs_inicio = lastCounters.hobbs;
  const tach_inicio = lastCounters.tach;

  // Stuck-hobbs mode: the meter doesn't advance, so hobbs_fin stays at the
  // stuck reading and the real flight time comes directly from the pilot.
  const isStuck = input.hobbsStuck === true;
  if (isStuck && (typeof input.hobbsTiempoVuelo !== 'number' || isNaN(input.hobbsTiempoVuelo) || input.hobbsTiempoVuelo <= 0)) {
    throw new Error('Con HOBBS pegado debes ingresar el tiempo de vuelo (horas).');
  }
  const effectiveHobbsFin = isStuck ? hobbs_inicio : input.hobbs_fin;
  const diffHobbs = isStuck ? Number(input.hobbsTiempoVuelo) : input.hobbs_fin - hobbs_inicio;
  const diffTach = input.tach_fin - tach_inicio;

  const newAirframe = lastComponents.airframe !== null ? Number((lastComponents.airframe + diffTach).toFixed(1)) : null;
  const newEngine = lastComponents.engine !== null ? Number((lastComponents.engine + diffTach).toFixed(1)) : null;
  const newPropeller = lastComponents.propeller !== null ? Number((lastComponents.propeller + diffTach).toFixed(1)) : null;

  // Crear Flight y FlightSubmission en transacción
  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear el Flight inmediatamente con todos los datos excepto tarifa e instructor_rate
    const flight = await tx.flight.create({
      data: {
        fecha: fechaVuelo,
        hobbs_inicio: hobbs_inicio,
        hobbs_fin: effectiveHobbsFin,
        tach_inicio: tach_inicio,
        tach_fin: input.tach_fin,
        diff_hobbs: diffHobbs,
        diff_tach: diffTach,
        costo: 0, // Se calculará al aprobar
        tarifa: null, // Se asignará al aprobar
        instructor_rate: null, // Se asignará al aprobar
        airframe_hours: newAirframe,
        engine_hours: newEngine,
        propeller_hours: newPropeller,
        pilotoId: input.pilotoId,
        aircraftId: 'CC-AQI',
        cliente: piloto?.codigo || null,
        copiloto: input.copiloto,
        detalle: input.detalle,
        aerodromoSalida: input.aerodromoSalida || 'SCCV',
        aerodromoDestino: input.aerodromoDestino || 'SCCV',
        aprobado: false,
      },
    });

    // 2. Crear FlightSubmission vinculado al Flight
    const submission = await tx.flightSubmission.create({
      data: {
        pilotoId: input.pilotoId,
        aircraftId: 'CC-AQI',
        estado: 'PENDIENTE',
        fechaVuelo,
        copiloto: input.copiloto,
        detalle: input.detalle,
        hobbsFinal: effectiveHobbsFin,
        tachFinal: input.tach_fin,
        aerodromoSalida: input.aerodromoSalida || 'SCCV',
        aerodromoDestino: input.aerodromoDestino || 'SCCV',
      },
      select: { id: true },
    });

    // 3. Actualizar Flight para vincular con FlightSubmission
    await tx.flight.update({
      where: { id: flight.id },
      data: { submissionId: submission.id },
    });

    // 4. Actualizar contadores del avión
    await tx.aircraft.update({
      where: { matricula: 'CC-AQI' },
      data: {
        hobbs_actual: effectiveHobbsFin,
        tach_actual: input.tach_fin,
      },
    });

    // 5. Actualizar horas de componentes
    if (newAirframe !== null) {
      await tx.component.updateMany({
        where: { aircraftId: 'CC-AQI', tipo: 'AIRFRAME' },
        data: { horas_acumuladas: newAirframe },
      });
    }
    if (newEngine !== null) {
      await tx.component.updateMany({
        where: { aircraftId: 'CC-AQI', tipo: 'ENGINE' },
        data: { horas_acumuladas: newEngine },
      });
    }
    if (newPropeller !== null) {
      await tx.component.updateMany({
        where: { aircraftId: 'CC-AQI', tipo: 'PROPELLER' },
        data: { horas_acumuladas: newPropeller },
      });
    }

    return { submission, flight };
  });

  const submission = result.submission;

  // Send emails
  const submissionData = {
    fechaVuelo,
    hobbsFinal: effectiveHobbsFin,
    tachFinal: input.tach_fin,
    copiloto: input.copiloto,
    detalle: input.detalle,
    aerodromoSalida: input.aerodromoSalida || 'SCCV',
    aerodromoDestino: input.aerodromoDestino || 'SCCV',
  };

  // In stuck-hobbs mode the meter doesn't advance; adjust the baseline so the
  // email helpers (which compute diff = hobbsFinal - lastCounters.hobbs) show
  // the real flight time instead of 0.0.
  const emailCounters = isStuck
    ? { ...lastCounters, hobbs: Number((effectiveHobbsFin - diffHobbs).toFixed(1)) }
    : lastCounters;

  // Send both emails in parallel
  await Promise.all([
    sendAdminNotificationEmail(submissionData, piloto, emailCounters, lastComponents),
    sendPilotConfirmationEmail(submissionData, piloto, emailCounters, lastComponents)
  ]);

  // Return complete flight data for PDF generation
  return {
    ok: true,
    data: {
      submissionId: submission.id,
      flightId: result.flight.id,
      piloto: {
        nombre: piloto?.nombre || 'Unknown',
        codigo: piloto?.codigo || 'N/A',
      },
      fecha: input.fecha,
      hobbs_inicio: hobbs_inicio,
      hobbs_fin: effectiveHobbsFin,
      diff_hobbs: diffHobbs,
      tach_inicio: tach_inicio,
      tach_fin: input.tach_fin,
      diff_tach: diffTach,
      airframe: newAirframe || 0,
      engine: newEngine || 0,
      propeller: newPropeller || 0,
      airframe_inicio: lastComponents.airframe,
      engine_inicio: lastComponents.engine,
      propeller_inicio: lastComponents.propeller,
      copiloto: input.copiloto || '',
      detalle: input.detalle || '',
      aerodromoSalida: input.aerodromoSalida || 'SCCV',
      aerodromoDestino: input.aerodromoDestino || 'SCCV',
    }
  };
}
