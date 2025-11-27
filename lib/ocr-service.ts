import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extrae el valor numérico de un contador (Hobbs o Tach) usando GPT-4o Vision
 */
async function callOpenAIWithContent(
  meterType: "HOBBS" | "TACH",
  imageContent:
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }
    | { type: "input_image"; image_url: string }
) {
  const messages = [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: `Eres un experto en aviación. Analiza esta imagen de un contador ${meterType} de aeronave.

INSTRUCCIONES CRÍTICAS:
1. Extrae ÚNICAMENTE el valor numérico que se muestra en el contador
2. El contador puede tener formato decimal (ejemplo: 1234.5 o 1234.56)
3. Ignora cualquier otra información en la imagen
4. Si el valor no es claro, indica tu nivel de confianza (0-100)

RESPONDE SOLO EN ESTE FORMATO JSON (sin markdown, sin \`\`\`):
{
  "value": 1234.5,
  "confidence": 95,
  "reasoning": "Breve explicación de lo que viste"
}`,
        },
        imageContent as any,
      ],
    },
  ];

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages,
    max_tokens: 300,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No se recibió respuesta del OCR");
  const result = JSON.parse(content.trim());
  if (typeof result.value !== "number" || isNaN(result.value)) {
    throw new Error("Valor extraído inválido");
  }
  if (result.value < 0 || result.value > 99999) {
    throw new Error("Valor fuera de rango esperado");
  }
  return { value: result.value as number, confidence: result.confidence || 0 };
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la imagen (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

export async function extractMeterValue(
  imageUrlOrPath: string,
  meterType: "HOBBS" | "TACH"
): Promise<{ value: number; confidence: number }> {
  try {
    // Si es un path local (empieza con /), leer el archivo directamente
    if (imageUrlOrPath.startsWith("/")) {
      const fs = await import("fs/promises");
      const buffer = await fs.readFile(imageUrlOrPath);
      const ext = imageUrlOrPath.split(".").pop()?.toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      return await callOpenAIWithContent(meterType, {
        type: "image_url",
        image_url: { url: dataUrl, detail: "high" },
      });
    }

    // Si es URL, intentar primero directamente
    try {
      return await callOpenAIWithContent(meterType, {
        type: "image_url",
        image_url: { url: imageUrlOrPath, detail: "high" },
      });
    } catch (err: any) {
      const code = err?.code || err?.error?.code || "";
      const msg = err?.message || "";
      const shouldRetryWithDataUrl =
        code === "invalid_image_url" ||
        code === "invalid_request_error" ||
        /download|image url|invalid_image/i.test(msg);

      if (!shouldRetryWithDataUrl) throw err;

      // Fallback: Descargar y reenviar como data URL
      const dataUrl = await fetchAsDataUrl(imageUrlOrPath);
      return await callOpenAIWithContent(meterType, {
        type: "image_url",
        image_url: { url: dataUrl, detail: "high" },
      });
    }
  } catch (error) {
    console.error(`Error en OCR para ${meterType}:`, error);
    throw new Error(
      `Error al procesar imagen de ${meterType}: ${
        error instanceof Error ? error.message : "Error desconocido"
      }`
    );
  }
}

/**
 * Procesa múltiples imágenes en paralelo
 */
export async function extractBothMeters(
  hobbsImageUrl: string,
  tachImageUrl: string
): Promise<{
  hobbs: { value: number; confidence: number };
  tach: { value: number; confidence: number };
}> {
  const [hobbsResult, tachResult] = await Promise.all([
    extractMeterValue(hobbsImageUrl, "HOBBS"),
    extractMeterValue(tachImageUrl, "TACH"),
  ]);

  return {
    hobbs: hobbsResult,
    tach: tachResult,
  };
}
