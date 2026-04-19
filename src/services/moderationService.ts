import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isAppropriate: boolean;
  reason?: string;
}

/**
 * Moderates content using Gemini AI.
 * @param text The text to moderate.
 * @param context The context of the moderation (e.g., "chat", "news").
 * @returns A promise that resolves to a ModerationResult.
 */
export async function moderateContent(text: string, context: string = "chat"): Promise<ModerationResult> {
  if (!text || text.trim().length === 0) {
    return { isAppropriate: true };
  }

  // If GEMINI_API_KEY is not set, skip moderation to avoid crashing the app
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Skipping moderation.");
    return { isAppropriate: true };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Modera el siguiente contenido para el contexto "${context}": "${text}"`,
      config: {
        systemInstruction: `Eres un moderador de contenido experto para "Vida Mixe TV", una plataforma cultural de la comunidad Ayuuk (Mixe) de Oaxaca. 
Tu tarea es filtrar mensajes que sean:
1. Ofensivos, discriminatorios o de odio (especialmente contra comunidades indígenas).
2. Sexualmente explícitos o profanos.
3. Spam repetitivo.
4. Violentos o que inciten al odio.

Responde ÚNICAMENTE en formato JSON con la siguiente estructura:
{
  "isAppropriate": boolean,
  "reason": string (incluye una breve explicación en español solo si isAppropriate es false)
}`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAppropriate: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["isAppropriate"]
        }
      }
    });

    const resultString = response.text;
    if (!resultString) {
      throw new Error("Empty response from AI");
    }

    const result = JSON.parse(resultString) as ModerationResult;
    return result;
  } catch (error) {
    console.error("Moderation error:", error);
    // Fail safe: allow the message if moderation service is down
    return { isAppropriate: true };
  }
}
