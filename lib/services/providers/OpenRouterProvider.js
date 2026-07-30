/**
 * Adaptateur OpenRouter (https://openrouter.ai).
 *
 * OpenRouter interroge les modèles depuis ses propres serveurs : contrairement
 * à un appel direct à l'API Gemini, il n'est pas soumis au blocage de l'offre
 * gratuite de Google pour les comptes UE / Royaume-Uni / Suisse.
 *
 * Les modèles sont essayés dans l'ordre jusqu'à ce que l'un réponde. Un modèle
 * gratuit renvoie souvent 429 non pas parce que le quota du compte est épuisé,
 * mais parce que le fournisseur en amont est momentanément saturé : réessayer
 * sur un autre modèle est alors la seule issue. La liste est surchargeable via
 * OPENROUTER_MODEL (un ou plusieurs identifiants séparés par des virgules), au
 * cas où un modèle serait retiré du catalogue — celui-ci tourne régulièrement,
 * voir https://openrouter.ai/models?max_price=0.
 */

import { EVENT_EXTRACTION_PROMPT } from "../prompts/eventExtractionPrompt.js";
import { AIProviderError, parseJsonResponse } from "./shared.js";

const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free"
];
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/* Codes pour lesquels tenter le modèle suivant a une chance d'aboutir : le
   modèle est saturé, indisponible ou a disparu du catalogue. Inutile en
   revanche de rejouer une clé invalide ou un contenu refusé. */
const RETRYABLE = new Set([
  "OPENROUTER_QUOTA",
  "OPENROUTER_UNAVAILABLE",
  "OPENROUTER_MODEL_REJECTED"
]);

function configuredModels() {
  const list = (process.env.OPENROUTER_MODEL || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

/* Le corps d'une erreur OpenRouter porte le motif exact (quota du compte épuisé
   ou bien saturation en amont). Sans lui, un 429 est indiagnosticable. */
function errorDetail(body) {
  const message = body?.error?.message || body?.error?.metadata?.raw || "";
  return typeof message === "string" ? message.slice(0, 200).trim() : "";
}

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

async function callModel(apiKey, model, prompt, parts) {
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

  let data;
  try {
    data = await response.json();
  } catch {
    if (response.ok) {
      throw new AIProviderError("OPENROUTER_INVALID_RESPONSE", "OpenRouter a renvoyé une réponse illisible.", 502);
    }
    data = null;
  }

  if (!response.ok) {
    const detail = errorDetail(data);
    const suffix = detail ? ` (${detail})` : "";

    if (response.status === 429) {
      throw new AIProviderError("OPENROUTER_QUOTA", `Limite atteinte sur ${model}${suffix}`, 429);
    }
    // 401/403 = clé rejetée : changer de modèle n'y changerait rien.
    if (response.status === 401 || response.status === 403) {
      throw new AIProviderError("OPENROUTER_CONFIGURATION", `Clé OpenRouter refusée${suffix}`, 500);
    }
    // 400 = requête refusée pour ce modèle précis (retiré du catalogue, ou
    // n'accepte pas d'image) : un autre modèle peut passer.
    if (response.status === 400 || response.status === 404) {
      throw new AIProviderError("OPENROUTER_MODEL_REJECTED", `Modèle ${model} refusé${suffix}`, 500);
    }
    throw new AIProviderError("OPENROUTER_UNAVAILABLE", `OpenRouter a répondu ${response.status} sur ${model}${suffix}`, 502);
  }

  return parseJsonResponse(extractText(data), "OPENROUTER_INVALID_JSON");
}

export class OpenRouterProvider {
  async extractEvent({ parts = [], prompt = EVENT_EXTRACTION_PROMPT } = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new AIProviderError("OPENROUTER_CONFIGURATION", "OPENROUTER_API_KEY manquante.", 500);
    }

    const models = configuredModels();
    let lastError;

    for (const model of models) {
      try {
        return await callModel(apiKey, model, prompt, parts);
      } catch (err) {
        if (!RETRYABLE.has(err?.code)) throw err;
        lastError = err;
      }
    }

    // Tous les modèles ont échoué : on remonte le dernier motif, seul élément
    // permettant de distinguer un quota de compte épuisé d'une saturation.
    throw new AIProviderError(
      lastError?.code || "OPENROUTER_UNAVAILABLE",
      `Aucun modèle disponible (${models.length} essayé${models.length > 1 ? "s" : ""}). Dernier motif : ${lastError?.message || "inconnu"}`,
      lastError?.status || 502
    );
  }
}
