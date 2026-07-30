/**
 * Adaptateur OpenRouter (https://openrouter.ai).
 *
 * OpenRouter interroge les modèles depuis ses propres serveurs : contrairement
 * à un appel direct à l'API Gemini, il n'est pas soumis au blocage de l'offre
 * gratuite de Google pour les comptes UE / Royaume-Uni / Suisse.
 *
 * Le modèle utilisé est configurable via OPENROUTER_MODEL au cas où le modèle
 * gratuit par défaut serait retiré du catalogue (la liste tourne régulièrement,
 * voir https://openrouter.ai/models?max_price=0).
 */

import { EVENT_EXTRACTION_PROMPT } from "../prompts/eventExtractionPrompt.js";
import { AIProviderError, parseJsonResponse } from "./shared.js";

const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* Convertit les "parts" façon Gemini (texte + images inline) en messages OpenAI. */
function buildMessages(prompt, parts) {
  const imageParts = parts
    .filter(p => p?.inline_data?.data)
    .map(p => ({
      type: "image_url",
      image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` }
    }));

  if (imageParts.length === 0) {
    return [{ role: "user", content: prompt }];
  }
  return [{ role: "user", content: [{ type: "text", text: prompt }, ...imageParts] }];
}

function extractText(data) {
  const choice = data?.choices?.[0];
  const finishReason = choice?.finish_reason;

  if (finishReason === "content_filter") {
    throw new AIProviderError("OPENROUTER_REFUSAL", "Le modèle a refusé le contenu fourni.", 422);
  }
  if (finishReason === "length") {
    throw new AIProviderError("OPENROUTER_INCOMPLETE_RESPONSE", "La réponse du modèle a été tronquée.", 422);
  }

  const content = choice?.message?.content;
  const text = Array.isArray(content)
    ? content.map(part => typeof part?.text === "string" ? part.text : "").join("").trim()
    : (typeof content === "string" ? content.trim() : "");

  if (!text) {
    throw new AIProviderError("OPENROUTER_EMPTY_RESPONSE", "Le modèle n'a renvoyé aucune donnée exploitable.", 422);
  }
  return text;
}

export class OpenRouterProvider {
  async extractEvent({ parts = [], prompt = EVENT_EXTRACTION_PROMPT } = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new AIProviderError("OPENROUTER_CONFIGURATION", "OPENROUTER_API_KEY manquante.", 500);
    }
    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ebok-event.vercel.app",
          "X-Title": "EBOK Event"
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(prompt, parts),
          temperature: 0.1,
          max_tokens: 4096
        })
      });
    } catch {
      throw new AIProviderError("OPENROUTER_UNAVAILABLE", "Le service OpenRouter est indisponible.", 502);
    }

    if (response.status === 429) {
      throw new AIProviderError("OPENROUTER_QUOTA", "La limite OpenRouter est atteinte. Réessaie dans quelques instants.", 429);
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new AIProviderError("OPENROUTER_CONFIGURATION", "La configuration OpenRouter est invalide (clé ou modèle).", 500);
    }
    if (!response.ok) {
      throw new AIProviderError("OPENROUTER_UNAVAILABLE", `OpenRouter a répondu avec le statut ${response.status}.`, 502);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new AIProviderError("OPENROUTER_INVALID_RESPONSE", "OpenRouter a renvoyé une réponse illisible.", 502);
    }

    return parseJsonResponse(extractText(data), "OPENROUTER_INVALID_JSON");
  }
}
