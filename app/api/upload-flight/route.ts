import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { submitFlightImages } from "@/app/actions/submit-flight-images";
import { processOCR } from "@/app/actions/process-ocr";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const pilotoId = Number(formData.get("pilotoId"));
    const matricula = formData.get("matricula") as string;
    const hobbsImage = formData.get("hobbsImage") as File | null;
    const tachImage = formData.get("tachImage") as File | null;
    const hobbsManual = formData.get("hobbsManual") as string | null;
    const tachManual = formData.get("tachManual") as string | null;
    const fechaVuelo = formData.get("fechaVuelo") as string | null;

    // Validaciones básicas
    if (!pilotoId || !matricula) {
      return NextResponse.json(
        { error: "pilotoId y matricula son requeridos" },
        { status: 400 }
      );
    }

    // Validar que tenga imágenes O valores manuales
    const hasImages = hobbsImage && tachImage;
    const hasManualValues = hobbsManual && tachManual;

    if (!hasImages && !hasManualValues) {
      return NextResponse.json(
        { error: "Se requieren las imágenes o los valores manuales" },
        { status: 400 }
      );
    }

    // Si tiene valores manuales, registrar directamente sin OCR
    if (hasManualValues) {
      const hobbsNum = parseFloat(hobbsManual);
      const tachNum = parseFloat(tachManual);

      if (isNaN(hobbsNum) || isNaN(tachNum)) {
        return NextResponse.json(
          { error: "Los valores manuales deben ser números válidos" },
          { status: 400 }
        );
      }

      // Obtener los máximos actuales de la tabla Flight
      const [maxHobbsFlight, maxTachFlight] = await Promise.all([
        prisma.flight.findFirst({
          where: { aircraftId: matricula, hobbs_fin: { not: null } },
          orderBy: { hobbs_fin: "desc" },
          select: { hobbs_fin: true },
        }),
        prisma.flight.findFirst({
          where: { aircraftId: matricula, tach_fin: { not: null } },
          orderBy: { tach_fin: "desc" },
          select: { tach_fin: true },
        }),
      ]);

      const lastHobbs = maxHobbsFlight?.hobbs_fin ? Number(maxHobbsFlight.hobbs_fin) : 0;
      const lastTach = maxTachFlight?.tach_fin ? Number(maxTachFlight.tach_fin) : 0;

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

      // Obtener el piloto para calcular el costo
      const piloto = await prisma.user.findUnique({
        where: { id: pilotoId },
        select: { tarifa_hora: true },
      });

      if (!piloto) {
        return NextResponse.json(
          { error: "Piloto no encontrado" },
          { status: 400 }
        );
      }

      const diffHobbs = hobbsNum - lastHobbs;
      const costo = diffHobbs * Number(piloto.tarifa_hora);

      // Crear el vuelo directamente
      const flight = await prisma.flight.create({
        data: {
          fecha: fechaVuelo ? new Date(fechaVuelo) : new Date(),
          hobbs_inicio: new Decimal(lastHobbs),
          hobbs_fin: new Decimal(hobbsNum),
          tach_inicio: new Decimal(lastTach),
          tach_fin: new Decimal(tachNum),
          diff_hobbs: new Decimal(diffHobbs),
          diff_tach: new Decimal(tachNum - lastTach),
          costo: new Decimal(costo),
          tarifa: piloto.tarifa_hora,
          pilotoId: pilotoId,
          aircraftId: matricula,
        },
      });

      // Actualizar contadores del avión
      await prisma.aircraft.update({
        where: { matricula },
        data: {
          hobbs_actual: new Decimal(hobbsNum),
          tach_actual: new Decimal(tachNum),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Vuelo registrado exitosamente (entrada manual)",
        flightId: flight.id,
        flight: {
          diff_hobbs: diffHobbs,
          diff_tach: tachNum - lastTach,
          costo,
        },
      });
    }

    // Proceso con OCR (si tiene imágenes)
    // Validar tipo de archivo
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(hobbsImage!.type) || !validTypes.includes(tachImage!.type)) {
      return NextResponse.json(
        { error: "Solo se permiten imágenes (JPEG, PNG, WEBP)" },
        { status: 400 }
      );
    }

    // Validar tamaño de archivo (máx 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (hobbsImage!.size > maxSize || tachImage!.size > maxSize) {
      return NextResponse.json(
        { error: "Las imágenes no deben superar 10MB" },
        { status: 400 }
      );
    }

    // Crear directorio de uploads si no existe
    const uploadDir = join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Guardar imágenes
    const timestamp = Date.now();
    const hobbsExt = hobbsImage!.name.split(".").pop();
    const tachExt = tachImage!.name.split(".").pop();
    
    const hobbsFileName = `hobbs-${pilotoId}-${timestamp}.${hobbsExt}`;
    const tachFileName = `tach-${pilotoId}-${timestamp}.${tachExt}`;
    
    const hobbsPath = join(uploadDir, hobbsFileName);
    const tachPath = join(uploadDir, tachFileName);

    const hobbsBytes = await hobbsImage!.arrayBuffer();
    const tachBytes = await tachImage!.arrayBuffer();
    
    await writeFile(hobbsPath, Buffer.from(hobbsBytes));
    await writeFile(tachPath, Buffer.from(tachBytes));

    // URLs públicas de las imágenes (para display)
    const baseUrl = process.env.NEXTAUTH_URL || `https://${request.headers.get("host")}`;
    const hobbsUrl = `${baseUrl}/uploads/${hobbsFileName}`;
    const tachUrl = `${baseUrl}/uploads/${tachFileName}`;

    // Crear la submission en la base de datos con paths locales para OCR
    const result = await submitFlightImages(
      pilotoId,
      matricula,
      hobbsUrl,
      tachUrl,
      hobbsPath, // path local para OCR
      tachPath,  // path local para OCR
      fechaVuelo ? new Date(fechaVuelo) : undefined
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Procesar OCR en segundo plano
    processOCR(result.submissionId!).catch((error) => {
      console.error("Error procesando OCR en background:", error);
    });

    return NextResponse.json({
      success: true,
      submissionId: result.submissionId,
      message: "Imágenes recibidas. El OCR está siendo procesado...",
      images: {
        hobbs: hobbsUrl,
        tach: tachUrl,
      },
    });
  } catch (error) {
    console.error("Error en upload:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
