import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { submitFlightImages } from "@/app/actions/submit-flight-images";
import { processOCR } from "@/app/actions/process-ocr";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const pilotoId = Number(formData.get("pilotoId"));
    const matricula = formData.get("matricula") as string;
    const hobbsImage = formData.get("hobbsImage") as File;
    const tachImage = formData.get("tachImage") as File;

    // Validaciones
    if (!pilotoId || !matricula) {
      return NextResponse.json(
        { error: "pilotoId y matricula son requeridos" },
        { status: 400 }
      );
    }

    if (!hobbsImage || !tachImage) {
      return NextResponse.json(
        { error: "Se requieren ambas imágenes (hobbsImage y tachImage)" },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validTypes.includes(hobbsImage.type) || !validTypes.includes(tachImage.type)) {
      return NextResponse.json(
        { error: "Solo se permiten imágenes (JPEG, PNG, WEBP)" },
        { status: 400 }
      );
    }

    // Validar tamaño de archivo (máx 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (hobbsImage.size > maxSize || tachImage.size > maxSize) {
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
    const hobbsExt = hobbsImage.name.split(".").pop();
    const tachExt = tachImage.name.split(".").pop();
    
    const hobbsFileName = `hobbs-${pilotoId}-${timestamp}.${hobbsExt}`;
    const tachFileName = `tach-${pilotoId}-${timestamp}.${tachExt}`;
    
    const hobbsPath = join(uploadDir, hobbsFileName);
    const tachPath = join(uploadDir, tachFileName);

    const hobbsBytes = await hobbsImage.arrayBuffer();
    const tachBytes = await tachImage.arrayBuffer();
    
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
      tachPath   // path local para OCR
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Procesar OCR en segundo plano
    // En producción, esto debería ser manejado por un sistema de colas (BullMQ, Inngest, etc.)
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
