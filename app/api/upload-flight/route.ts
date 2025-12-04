import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// Función para enviar correo de notificación
async function sendNotificationEmail(submission: any, piloto: any) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY no configurada, omitiendo envío de correo");
    return;
  }

  const emailContent = `
    <h2>Nuevo Reporte de Vuelo - CC-AQI</h2>
    <p><strong>Fecha:</strong> ${submission.fechaVuelo ? new Date(submission.fechaVuelo).toLocaleDateString('es-CL') : 'No especificada'}</p>
    <p><strong>Piloto:</strong> ${piloto.nombre} (${piloto.codigo || 'Sin código'})</p>
    <p><strong>Email:</strong> ${piloto.email}</p>
    <hr/>
    <h3>Contadores:</h3>
    <p><strong>Hobbs Final:</strong> ${submission.hobbsFinal}</p>
    <p><strong>Tach Final:</strong> ${submission.tachFinal}</p>
    <hr/>
    <h3>Información Adicional:</h3>
    <p><strong>Cliente:</strong> ${submission.cliente || 'No especificado'}</p>
    <p><strong>Copiloto:</strong> ${submission.copiloto || 'No especificado'}</p>
    <p><strong>Detalle:</strong> ${submission.detalle || 'Sin observaciones'}</p>
    <hr/>
    <p>Para aprobar este vuelo y agregar la tarifa de instructor/SP, accede al panel de administración:</p>
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
        subject: `Nuevo Vuelo - ${piloto.nombre} - ${new Date(submission.fechaVuelo || new Date()).toLocaleDateString('es-CL')}`,
        html: emailContent,
      }),
    });

    if (!response.ok) {
      console.error('Error enviando correo:', await response.text());
    } else {
      console.log('Correo de notificación enviado exitosamente');
    }
  } catch (error) {
    console.error('Error enviando correo:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const pilotoId = Number(formData.get("pilotoId"));
    const matricula = formData.get("matricula") as string || "CC-AQI";
    const hobbsManual = formData.get("hobbsManual") as string;
    const tachManual = formData.get("tachManual") as string;
    const fechaVuelo = formData.get("fechaVuelo") as string | null;
    const cliente = formData.get("cliente") as string | null;
    const copiloto = formData.get("copiloto") as string | null;
    const detalle = formData.get("detalle") as string | null;
    const hobbsImage = formData.get("hobbsImage") as File | null;
    const tachImage = formData.get("tachImage") as File | null;

    // Validaciones básicas
    if (!pilotoId) {
      return NextResponse.json(
        { error: "Piloto es requerido" },
        { status: 400 }
      );
    }

    if (!hobbsManual || !tachManual) {
      return NextResponse.json(
        { error: "Hobbs y Tach son requeridos" },
        { status: 400 }
      );
    }

    const hobbsNum = parseFloat(hobbsManual);
    const tachNum = parseFloat(tachManual);

    if (isNaN(hobbsNum) || isNaN(tachNum)) {
      return NextResponse.json(
        { error: "Los valores deben ser números válidos" },
        { status: 400 }
      );
    }

    // Obtener los contadores del último vuelo por fecha
    const lastFlight = await prisma.flight.findFirst({
      where: { aircraftId: matricula },
      orderBy: { fecha: "desc" },
      select: { hobbs_fin: true, tach_fin: true },
    });

    const lastHobbs = lastFlight?.hobbs_fin ? Number(lastFlight.hobbs_fin) : 0;
    const lastTach = lastFlight?.tach_fin ? Number(lastFlight.tach_fin) : 0;

    if (hobbsNum <= lastHobbs) {
      return NextResponse.json(
        { error: `El Hobbs (${hobbsNum}) debe ser mayor a ${lastHobbs}` },
        { status: 400 }
      );
    }

    if (tachNum <= lastTach) {
      return NextResponse.json(
        { error: `El Tach (${tachNum}) debe ser mayor a ${lastTach}` },
        { status: 400 }
      );
    }

    // Obtener el piloto
    const piloto = await prisma.user.findUnique({
      where: { id: pilotoId },
      select: { id: true, nombre: true, email: true, codigo: true, tarifa_hora: true },
    });

    if (!piloto) {
      return NextResponse.json(
        { error: "Piloto no encontrado" },
        { status: 400 }
      );
    }

    // Guardar imágenes si se proporcionaron
    let hobbsImageUrl = null;
    let tachImageUrl = null;

    if (hobbsImage || tachImage) {
      const uploadDir = join(process.cwd(), "public", "uploads");
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const timestamp = Date.now();
      
      if (hobbsImage) {
        const hobbsExt = hobbsImage.name.split(".").pop();
        const hobbsFileName = `hobbs-${pilotoId}-${timestamp}.${hobbsExt}`;
        const hobbsPath = join(uploadDir, hobbsFileName);
        await writeFile(hobbsPath, Buffer.from(await hobbsImage.arrayBuffer()));
        hobbsImageUrl = `/uploads/${hobbsFileName}`;
      }

      if (tachImage) {
        const tachExt = tachImage.name.split(".").pop();
        const tachFileName = `tach-${pilotoId}-${timestamp}.${tachExt}`;
        const tachPath = join(uploadDir, tachFileName);
        await writeFile(tachPath, Buffer.from(await tachImage.arrayBuffer()));
        tachImageUrl = `/uploads/${tachFileName}`;
      }
    }

    // Crear la submission en estado ESPERANDO_APROBACION
    const submission = await prisma.flightSubmission.create({
      data: {
        pilotoId,
        aircraftId: matricula,
        estado: "ESPERANDO_APROBACION",
        fechaVuelo: fechaVuelo ? new Date(fechaVuelo) : new Date(),
        hobbsFinal: new Decimal(hobbsNum),
        tachFinal: new Decimal(tachNum),
        cliente: cliente || null,
        copiloto: copiloto || null,
        detalle: detalle || null,
        ImageLog: {
          create: [
            ...(hobbsImageUrl ? [{ tipo: "HOBBS", imageUrl: hobbsImageUrl, valorExtraido: new Decimal(hobbsNum), confianza: new Decimal(100) }] : []),
            ...(tachImageUrl ? [{ tipo: "TACH", imageUrl: tachImageUrl, valorExtraido: new Decimal(tachNum), confianza: new Decimal(100) }] : []),
          ],
        },
      },
    });

    // Enviar correo de notificación
    await sendNotificationEmail(submission, piloto);

    // Marcar como notificado
    await prisma.flightSubmission.update({
      where: { id: submission.id },
      data: { notificado: true }
    });

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      message: "Reporte de vuelo enviado. Se te notificará cuando sea aprobado.",
    });
  } catch (error) {
    console.error("Error en upload:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
