import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extrae el valor numérico de un contador (Hobbs o Tach) usando GPT-4o Vision
 */
export async function extractMeterValue(
  imageUrl: string,
  meterType: "HOBBS" | "TACH"
): Promise<{ value: number; confidence: number }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
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
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("No se recibió respuesta del OCR");
    }

    // Parsear la respuesta JSON
    const result = JSON.parse(content.trim());

    // Validaciones
    if (typeof result.value !== "number" || isNaN(result.value)) {
      throw new Error("Valor extraído inválido");
    }

    if (result.value < 0 || result.value > 99999) {
      throw new Error("Valor fuera de rango esperado");
    }

    return {
      value: result.value,
      confidence: result.confidence || 0,
    };
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
