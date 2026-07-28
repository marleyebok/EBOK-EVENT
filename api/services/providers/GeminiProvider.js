/**
 * Adaptateur Google AI Studio / Gemini.
 *
 * Toute communication Gemini reste confinée ici.
 */

import { EVENT_EXTRACTION_PROMPT } from "../prompts/eventExtractionPrompt.js";

export class GeminiProvider {
  async extractEvent({ parts = [] } = {}) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: EVENT_EXTRACTION_PROMPT }, ...parts] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 4096
          }
        })
      }
    );

    if (!response.ok) throw new Error(`gemini_${response.status}`);

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");

    if (!text) throw new Error("Réponse IA vide");

    return JSON.parse(text.trim());
  }
}
