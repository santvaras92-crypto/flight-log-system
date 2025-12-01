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
    <p><a href="${process.env.NEXTAUTH_URL || 'https://flight-log-system-production.up.railway.app'}/admin/submissions">Ver Submissions Pendientes</a></p>
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
    
    const pilotoCodigo = formData.get("pilotoCodigo") as string;
    const pilotoNombre = formData.get("pilotoNombre") as string;
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
    if (!pilotoCodigo || !pilotoNombre) {
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

    // Función para parsear números con coma decimal (formato europeo)
    const parseExcelNumber = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      const str = String(val).replace(',', '.').trim();
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    // Obtener los contadores del último vuelo desde el Excel
    const excelState = await prisma.sheetState.findUnique({
      where: { key: 'flight_entries' }
    });

    let lastHobbs = 0;
    let lastTach = 0;

    if (excelState?.matrix && Array.isArray(excelState.matrix) && excelState.matrix.length > 1) {
      const lastFlight = (excelState.matrix as any[])[1]; // Fila 1: Primera fila de datos (fila 0 es header)
      
      console.log('🔍 DEBUG - Última fila del Excel:', lastFlight);
      console.log('🔍 DEBUG - lastFlight[5] (HOBBS F):', lastFlight[5]);
      console.log('🔍 DEBUG - lastFlight[2] (TACH F):', lastFlight[2]);
      
      // Columnas: ["Fecha","TACH I","TACH F","Δ TACH","HOBBS I","HOBBS F","Δ HOBBS",...]
      lastHobbs = parseExcelNumber(lastFlight[5]); // HOBBS F (columna 5)
      lastTach = parseExcelNumber(lastFlight[2]);  // TACH F (columna 2)
      
      console.log('✅ Contadores parseados - Hobbs:', lastHobbs, 'Tach:', lastTach);
    } else {
      // Si Excel vacío, usar valores del Aircraft
      const aircraft = await prisma.aircraft.findUnique({
        where: { matricula }
      });
      lastHobbs = aircraft?.hobbs_actual ? Number(aircraft.hobbs_actual) : 0;
      lastTach = aircraft?.tach_actual ? Number(aircraft.tach_actual) : 0;
    }

    console.log('📊 Validando contadores:');
    console.log('  - Hobbs ingresado:', hobbsNum, '| Último Hobbs:', lastHobbs);
    console.log('  - Tach ingresado:', tachNum, '| Último Tach:', lastTach);

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

    // Validar que el piloto existe en el Excel Pilot Directory
    const pilotDirExcel = await prisma.sheetState.findUnique({
      where: { key: 'pilot_directory' }
    });

    let pilotoEmail = `${pilotoCodigo}@piloto.local`;
    
    if (pilotDirExcel?.matrix && Array.isArray(pilotDirExcel.matrix)) {
      const pilotRows = (pilotDirExcel.matrix as any[][]).slice(1);
      const pilotRow = pilotRows.find(row => {
        const codigo = row[0] ? String(row[0]).trim() : null;
        const nombre = row[1] ? String(row[1]).trim() : null;
        return codigo === pilotoCodigo || nombre === pilotoNombre;
      });
      
      if (pilotRow && pilotRow[2]) {
        pilotoEmail = String(pilotRow[2]).trim();
      }
    }

    // Buscar o crear piloto en DB (necesario para submissions)
    let piloto = await prisma.user.findFirst({
      where: { 
        OR: [
          { codigo: pilotoCodigo },
          { nombre: pilotoNombre }
        ]
      }
    });

    if (!piloto) {
      // Crear piloto básico en DB si no existe (solo para submissions)
      piloto = await prisma.user.create({
        data: {
          nombre: pilotoNombre,
          codigo: pilotoCodigo,
          email: pilotoEmail,
          rol: "PILOTO",
          tarifa_hora: 0,
          password: "" // No se usa para login
        }
      });
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
        const hobbsFileName = `hobbs-${pilotoCodigo}-${timestamp}.${hobbsExt}`;
        const hobbsPath = join(uploadDir, hobbsFileName);
        await writeFile(hobbsPath, Buffer.from(await hobbsImage.arrayBuffer()));
        hobbsImageUrl = `/uploads/${hobbsFileName}`;
      }

      if (tachImage) {
        const tachExt = tachImage.name.split(".").pop();
        const tachFileName = `tach-${pilotoCodigo}-${timestamp}.${tachExt}`;
        const tachPath = join(uploadDir, tachFileName);
        await writeFile(tachPath, Buffer.from(await tachImage.arrayBuffer()));
        tachImageUrl = `/uploads/${tachFileName}`;
      }
    }

    // Crear la submission en estado ESPERANDO_APROBACION
    const submission = await prisma.flightSubmission.create({
      data: {
        pilotoId: piloto.id,
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

    console.log('📝 Submission creada:', {
      id: submission.id,
      piloto: pilotoNombre,
      estado: submission.estado
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
