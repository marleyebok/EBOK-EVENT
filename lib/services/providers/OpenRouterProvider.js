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
 * OPENROUTER_MODEL (un ou plusieurs identifiants séparés par des virgules).
 *
 * Quand toute la liste échoue, on interroge le catalogue OpenRouter pour
 * prendre le relais avec d'autres modèles gratuits. C'est ce qui rend l'import
 * robuste dans la durée : le catalogue gratuit tourne sans prévenir, un modèle
 * codé en dur finit toujours par disparaître ou saturer, et une liste figée
 * condamne alors la fonctionnalité jusqu'au prochain déploiement.
 */

import { EVENT_EXTRACTION_PROMPT } from "../prompts/eventExtractionPrompt.js";
import { AIProviderError, parseJsonResponse } from "./shared.js";

const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free"
];
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_URL = "https://openrouter.ai/api/v1/models";

/* Nombre de modèles de secours tirés du catalogue. Assez large pour absorber
   ceux qui refusent tout de suite — modèle réservé à certaines applications,
   fournisseur saturé —, mais borné : chaque tentative coûte un aller-retour, et
   passé un certain point l'attente devient plus pénible que l'échec. */
const MAX_SECOURS = 6;

/* Le catalogue ne bouge pas d'une requête à l'autre : on le garde le temps de
   vie de la fonction serverless plutôt que de le retélécharger à chaque essai. */
let catalogueCache = null;

function estGratuit(m) {
  const p = m?.pricing || {};
  return Number(p.prompt) === 0 && Number(p.completion) === 0;
}

function litImages(m) {
  const modes = m?.architecture?.input_modalities;
  return Array.isArray(modes) && modes.includes("image");
}

/**
 * Modèles gratuits du catalogue, les plus dotés en contexte d'abord.
 * Renvoie une liste vide si le catalogue est injoignable : c'est un secours,
 * il ne doit jamais transformer une panne de modèle en panne de service.
 */
async function modelesDeSecours(apiKey, besoinImage, dejaEssayes) {
  if (!catalogueCache) {
    try {
      const r = await fetch(MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) return [];
      const data = await r.json();
      catalogueCache = Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
    }
  }

  return catalogueCache
    .filter(m => typeof m?.id === "string" && estGratuit(m) && !dejaEssayes.has(m.id))
    .filter(m => !besoinImage || litImages(m))
    .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
    .slice(0, MAX_SECOURS)
    .map(m => m.id);
}

/* Codes pour lesquels tenter le modèle suivant a une chance d'aboutir : le
   modèle est saturé, indisponible ou a disparu du catalogue. Inutile en
   revanche de rejouer une clé invalide ou un contenu refusé. */
const RETRYABLE = new Set([
  "OPENROUTER_QUOTA",
  "OPENROUTER_UNAVAILABLE",
  "OPENROUTER_MODEL_REJECTED",
  // Un modèle qui bavarde au lieu de répondre en JSON, qui ne répond rien ou
  // qui se fait couper n'a rien cassé : c'est ce modèle-là qui ne convient pas
  // à la consigne. Le suivant mérite sa chance.
  "OPENROUTER_INVALID_JSON",
  "OPENROUTER_EMPTY_RESPONSE",
  "OPENROUTER_INCOMPLETE_RESPONSE"
]);

/**
 * Clé d'API, débarrassée de ce qu'un copier-coller y laisse.
 *
 * Une clé recopiée depuis l'interface OpenRouter arrive régulièrement entourée
 * de guillemets ou suivie d'un retour à la ligne ; l'en-tête `Authorization`
 * part alors malformé et OpenRouter répond 401. Le symptôme est indiscernable
 * d'une vraie mauvaise clé, d'où ce nettoyage.
 */
function cleNettoyee() {
  return (process.env.OPENROUTER_API_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/* Les clés OpenRouter commencent toutes par `sk-or-`. Le dire évite de chercher
   du côté du compte quand c'est la mauvaise valeur qui a été collée. */
function formeInattendue(cle) {
  return !/^sk-or-/.test(cle);
}

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
        "HTTP-Referer": "https://event.ebok.fr",
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
    // Un 401/403 ne vient pas toujours de la clé : OpenRouter répond la même
    // chose quand un modèle est réservé à certaines applications (« is only
    // available on agentic harnesses »). Le motif nomme alors le modèle — le
    // compte n'y est pour rien, et le suivant a toutes ses chances.
    if ((response.status === 401 || response.status === 403) && detail.includes(model)) {
      throw new AIProviderError("OPENROUTER_MODEL_REJECTED", `Modèle ${model} inaccessible${suffix}`, 500);
    }
    // Sinon, c'est bien la clé : changer de modèle n'y changerait rien. Les deux
    // cas ne se règlent pas au même endroit, on ne les confond donc pas.
    if (response.status === 401) {
      const forme = formeInattendue(apiKey)
        ? " La valeur lue ne commence pas par « sk-or- » : ce n'est probablement pas une clé OpenRouter."
        : " Vérifie que OPENROUTER_API_KEY est bien posée sur l'environnement de production dans Vercel, que la clé n'a pas été révoquée sur openrouter.ai, et redéploie après toute modification.";
      throw new AIProviderError("OPENROUTER_CONFIGURATION", `Clé OpenRouter refusée (401)${suffix}.${forme}`, 500);
    }
    if (response.status === 403) {
      throw new AIProviderError(
        "OPENROUTER_CONFIGURATION",
        `Accès refusé par OpenRouter (403)${suffix}. La clé est reconnue mais l'appel est bloqué : regarde les réglages de confidentialité du compte (les modèles gratuits demandent d'autoriser l'usage des données) et les restrictions posées sur la clé.`,
        500
      );
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
    const apiKey = cleNettoyee();
    if (!apiKey) {
      throw new AIProviderError(
        "OPENROUTER_CONFIGURATION",
        "OPENROUTER_API_KEY manquante : ajoute-la dans Vercel (Settings > Environment Variables), puis redéploie.",
        500
      );
    }

    const besoinImage = parts.some(p => p?.inline_data?.data);
    const essayes = new Set();
    let lastError;

    const tenter = async (liste) => {
      for (const model of liste) {
        if (essayes.has(model)) continue;
        essayes.add(model);
        try {
          return await callModel(apiKey, model, prompt, parts);
        } catch (err) {
          if (!RETRYABLE.has(err?.code)) throw err;
          lastError = err;
        }
      }
      return null;
    };

    const premier = await tenter(configuredModels());
    if (premier) return premier;

    // Liste épuisée : on va chercher ce que le catalogue propose aujourd'hui.
    const secours = await tenter(await modelesDeSecours(apiKey, besoinImage, essayes));
    if (secours) return secours;

    // Tout a échoué : on remonte le dernier motif, seul élément permettant de
    // distinguer un quota de compte épuisé d'une saturation en amont.
    const quota = lastError?.code === "OPENROUTER_QUOTA";
    const conseil = quota
      ? " Les modèles gratuits sont saturés : réessaie dans quelques minutes, ou crédite le compte OpenRouter pour accéder aux modèles payants."
      : " Vérifie la liste OPENROUTER_MODEL, ou laisse-la vide pour laisser le catalogue décider.";
    throw new AIProviderError(
      lastError?.code || "OPENROUTER_UNAVAILABLE",
      `Aucun modèle disponible (${essayes.size} essayé${essayes.size > 1 ? "s" : ""}). `
        + `Dernier motif : ${lastError?.message || "inconnu"}.${conseil}`,
      lastError?.status || 502
    );
  }
}
