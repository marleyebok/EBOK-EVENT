/**
 * Adaptateur Google AI Studio / Gemini.
 *
 * Toute communication Gemini reste confinée ici.
 */

import { EVENT_EXTRACTION_PROMPT } from "../prompts/eventExtractionPrompt.js";
import { AIProviderError, parseJsonResponse } from "./shared.js";

function extractText(data) {
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (data?.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(finishReason)) {
    throw new AIProviderError("GEMINI_REFUSAL", "Le modèle a refusé le contenu fourni.", 422);
  }
  if (finishReason === "MAX_TOKENS") {
    throw new AIProviderError("GEMINI_INCOMPLETE_RESPONSE", "La réponse du modèle a été tronquée.", 422);
  }

  const text = candidate?.content?.parts
    ?.map(part => typeof part?.text === "string" ? part.text : "")
    .join("")
    .trim();

  if (!text) {
    throw new AIProviderError("GEMINI_EMPTY_RESPONSE", "Le modèle n'a renvoyé aucune donnée exploitable.", 422);
  }
  return text;
}

export class GeminiProvider {
  async extractEvent({ parts = [], prompt = EVENT_EXTRACTION_PROMPT } = {}) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new AIProviderError("GEMINI_CONFIGURATION", "GEMINI_API_KEY manquante.", 500);
    }

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 4096
            }
          })
        }
      );
    } catch {
      throw new AIProviderError("GEMINI_UNAVAILABLE", "Le service Gemini est indisponible.", 502);
    }

    if (response.status === 429) {
      throw new AIProviderError("GEMINI_QUOTA", "La limite Gemini est atteinte. Réessaie dans quelques instants.", 429);
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new AIProviderError("GEMINI_CONFIGURATION", "La configuration Gemini est invalide.", 500);
    }
    if (!response.ok) {
      throw new AIProviderError("GEMINI_UNAVAILABLE", `Gemini a répondu avec le statut ${response.status}.`, 502);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new AIProviderError("GEMINI_INVALID_RESPONSE", "Gemini a renvoyé une réponse illisible.", 502);
    }

    return parseJsonResponse(extractText(data), "GEMINI_INVALID_JSON");
  }
}
