import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", true);
app.use(express.json({ limit: "20mb" }));

// ---------------------------------------------------------------------------
// Sécurité globale : headers & helpers partagés
// ---------------------------------------------------------------------------

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "0");
  next();
});

/** Échappe une chaîne pour insertion dans du HTML (anti-XSS). */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Hôtes privés / locaux / CGNAT interdits (anti-SSRF). */
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h.includes(":") && (h.startsWith("::1") || h.startsWith("fe8") || h.startsWith("fc") || h.startsWith("fd"))) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const octets = h.split(".").map(Number);
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;
    const [a, b] = octets;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // documentation
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && octets[2] === 100) return true; // documentation
    if (a === 203 && b === 0 && octets[2] === 113) return true; // documentation
    if (a >= 224) return true; // multicast + reserved
  }
  return false;
}

/** Vérifie qu'une URL est publique et sûre (https obligatoire sauf allowHttp). */
function isSafePublicUrl(rawUrl: string, allowHttp = false): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") {
    // ok
  } else if (allowHttp && parsed.protocol === "http:") {
    // ok
  } else {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (isBlockedHostname(parsed.hostname)) return false;
  return true;
}

/** Vérifie qu'une base URL provider est autorisée (local Ollama ou public https). */
function isAllowedProviderBaseUrl(baseUrl: string, provider: string): boolean {
  const clean = (baseUrl || "").trim();
  if (!clean) return true; // laisser le défaut s'appliquer
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return false;
  }
  if (provider === "ollama" && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
    const h = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  }
  return isSafePublicUrl(clean);
}

/** En-têtes personnalisés autorisés (anti header-injection). */
const ALLOWED_CUSTOM_HEADERS = new Set([
  "content-type", "authorization", "accept", "accept-language", "user-agent",
  "x-goog-api-key", "x-api-key", "anthropic-version",
  "anthropic-dangerous-direct-browser-access", "openai-beta",
  "openai-organization", "x-title", "x-fern-sdk-name", "x-fern-sdk-version",
  "x-fern-sdk-language", "x-fern-sdk-method", "x-fern-sdk-method-name",
]);

function sanitizeCustomHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (!ALLOWED_CUSTOM_HEADERS.has(k)) continue;
    if (typeof value !== "string" || value.length > 500) continue;
    if (value.includes("\r") || value.includes("\n")) continue;
    result[key] = value;
  }
  return result;
}

/** fetch avec timeout + signal externe (abort client). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Rate limiting in-memory simple (anti-abuse). */
const RATE_LIMIT_ENTRIES: Record<string, { count: number; resetAt: number }> = {};
let lastRatePrune = Date.now();

function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastRatePrune > 60_000) {
    for (const key of Object.keys(RATE_LIMIT_ENTRIES)) {
      if (RATE_LIMIT_ENTRIES[key].resetAt <= now) delete RATE_LIMIT_ENTRIES[key];
    }
    lastRatePrune = now;
  }
  const entry = RATE_LIMIT_ENTRIES[ip] || { count: 0, resetAt: now + windowMs };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  RATE_LIMIT_ENTRIES[ip] = entry;
  return entry.count <= limit;
}

function getClientIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimited(res: express.Response, ip: string, limit: number): void {
  res.status(429).json({
    error: `Trop de requêtes. Limite de ${limit} requêtes par fenêtre. Réessayez dans quelques instants.`,
    rateLimited: true,
    ip,
  });
}

// ---------------------------------------------------------------------------
// Fallback intelligent quand la clé API par défaut est restreinte (403/429)
// ---------------------------------------------------------------------------

function generateFallbackReply(userInput: string): string {
  const lower = (userInput || "").toLowerCase().trim();

  if (lower.includes("bonjour") || lower.includes("salut") || lower.includes("hello") || lower.includes("coucou") || lower.includes("hi")) {
    return "Bonjour ! Je suis Ghost AI, votre compagnon avatar 3D. La clé API Gemini partagée est actuellement restreinte. Pour profiter d'une intelligence illimitée, ajoutez votre propre clé API (Gemini, OpenAI, OpenRouter) dans le panneau de Réglages (Ctrl+Shift+K). Que puis-je faire pour vous ?";
  }

  if (lower.includes("qui es-tu") || lower.includes("qui est tu") || lower.includes("presentation") || lower.includes("présentation")) {
    return "Je suis Ghost AI, un avatar holographique 3D avec synthèse vocale et synchronisation labiale. Vous pouvez importer votre propre modèle .VRM, personnaliser ma voix et me poser toutes vos questions !";
  }

  if (lower.includes("merci") || lower.includes("super") || lower.includes("bravo") || lower.includes("cool") || lower.includes("top")) {
    return "Avec grand plaisir ! N'hésitez pas à explorer les options de personnalisation dans le menu Réglages (Ctrl+Shift+K).";
  }

  if (lower.includes("clé") || lower.includes("api") || lower.includes("erreur") || lower.includes("403") || lower.includes("429") || lower.includes("réglage") || lower.includes("config")) {
    return "Pour configurer votre propre clé API : ouvrez le panneau Réglages via le raccourci Ctrl+Shift+K, choisissez votre fournisseur (Gemini, OpenAI, OpenRouter...) et collez votre clé. L'avatar répondra alors en temps réel avec le modèle choisi !";
  }

  return `J'ai bien reçu votre message : "${userInput}". Note : La clé API serveur par défaut rencontre une restriction (403/429). Pour me connecter à l'intelligence artificielle complète de Gemini ou OpenAI, vous pouvez ajouter votre propre clé API dans les Réglages (Ctrl+Shift+K).`;
}

// Initialisation du client Gemini
function getGeminiClient(customApiKey?: string) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// ---------------------------------------------------------------------------
// Proxy Web durci : allowlist d'hôtes publics, échappement strict, timeouts.
// ---------------------------------------------------------------------------

const PROXY_ALLOWED_HOSTS = [
  "google.com", "www.google.com", "fr.m.wikipedia.org", "en.m.wikipedia.org",
  "www.wikipedia.org", "wikipedia.org", "duckduckgo.com", "web.archive.org",
  "archive.org", "github.com", "www.youtube.com", "youtube.com", "www.bing.com",
  "bing.com", "search.brave.com",
];

const MAX_PROXY_BYTES = 5 * 1024 * 1024; // 5 Mo max

function isProxyHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return PROXY_ALLOWED_HOSTS.some((host) => h === host || h.endsWith("." + host));
}

app.get("/api/proxy", async (req, res) => {
  if (!rateLimit(getClientIp(req), 120, 60_000)) {
    return rateLimited(res, getClientIp(req), 120);
  }

  try {
    const rawUrl = (req.query.url as string) || "";
    if (!rawUrl) {
      return res.status(400).send("Paramètre URL manquant.");
    }

    let targetUrl = rawUrl.trim();

    // Si ce n'est pas une URL complète, on la traite comme un terme de recherche.
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      if (!targetUrl.includes(".")) {
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
      } else {
        targetUrl = "https://" + targetUrl;
      }
    }

    // Validation stricte : hôte dans l'allowlist + https public uniquement.
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return res.status(400).send("URL invalide.");
    }
    if (!isProxyHostAllowed(parsed.hostname)) {
      return res.status(403).send(
        `<div style="font-family:sans-serif;padding:2rem;color:#fbbf24;background:#0f172a;height:100vh;"><h2>Domaine non autorisé</h2><p>Le proxy intégré n'autorise que les domaines publics de confiance (Google, Wikipedia, DuckDuckGo, Archive.org, GitHub, YouTube, Bing). Accès refusé à : ${escapeHtml(parsed.hostname)}.</p></div>`
      );
    }
    if (!isSafePublicUrl(targetUrl, true)) {
      return res.status(403).send("URL refusée (protocole ou hôte non autorisé).");
    }

    const response = await fetchWithTimeout(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    }, 12000);

    if (!response.ok) {
      return res.status(response.status).send(
        `<div style="font-family:sans-serif;padding:2rem;color:#f87171;background:#0f172a;height:100vh;"><h2>Erreur de chargement (${response.status})</h2><p>Impossible de récupérer la page distante : ${escapeHtml(parsed.href)}</p></div>`
      );
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_PROXY_BYTES) {
      return res.status(413).send("Réponse trop volumineuse pour le proxy intégré.");
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await response.text();
      if (html.length > MAX_PROXY_BYTES) {
        return res.status(413).send("Réponse trop volumineuse pour le proxy intégré.");
      }

      // Neutralise les bloqueurs de frame (balises meta) et les framebusters.
      html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, "");
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
      html = html.replace(/top\.location\s*=/gi, "/*top.location=*/");
      html = html.replace(/parent\.location\s*=/gi, "/*parent.location=*/");
      html = html.replace(/window\.top\b/gi, "window.self");

      // Injecte une balise <base> pour les liens relatifs.
      try {
        const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        const baseTag = `<base href="${escapeHtml(baseUrl)}" target="_self">`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${baseTag}`);
        } else if (html.includes("<HEAD>")) {
          html = html.replace("<HEAD>", `<HEAD>${baseTag}`);
        } else {
          html = baseTag + html;
        }
      } catch {
        // Ignore les erreurs de parsing d'URL
      }

      // NOTE : la page proxée reste servie par notre origine dans une iframe
      // sandboxée SANS allow-same-origin (voir WebFrameWindow) : les scripts
      // s'exécutent dans une origine unique et isolée, sans accès à localStorage.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Cache-Control", "no-store");
      return res.send(html);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PROXY_BYTES) {
      return res.status(413).send("Réponse trop volumineuse pour le proxy intégré.");
    }
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "Délai d'attente dépassé" : "Erreur de connexion";
    return res.status(502).send(
      `<div style="font-family:sans-serif;padding:2rem;color:#f87171;background:#0f172a;height:100vh;"><h2>Erreur du Proxy Web</h2><p>${escapeHtml(reason)}</p></div>`
    );
  }
});

// ---------------------------------------------------------------------------
// Validation de clé API (fournisseurs OpenAI-compatibles, Gemini, Ollama)
// ---------------------------------------------------------------------------

app.post("/api/validate-key", async (req, res) => {
  const ip = getClientIp(req);
  if (!rateLimit(ip, 60, 60_000)) return rateLimited(res, ip, 60);

  try {
    const { provider = "gemini", apiKey = "", baseUrl = "", customHeaders = {} } = req.body;

    if (provider === "offline") {
      return res.json({ valid: true, provider: "offline", statusCode: 200, message: "Mode Présence Locale (Pas de clé requise)" });
    }

    if (provider === "gemini" || provider === "auto") {
      const targetKey = String(apiKey).trim() || process.env.GEMINI_API_KEY || "";
      if (!targetKey) {
        return res.json({ valid: false, provider: "gemini", statusCode: 400, message: "Aucune clé API Gemini fournie ni configurée sur le serveur." });
      }

      try {
        // La clé est passée en header (x-goog-api-key), jamais dans l'URL.
        const geminiRes = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": targetKey } },
          10000
        );
        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const modelsList = data.models ? data.models.map((m: any) => m.name.replace("models/", "")) : ["gemini-2.5-flash", "gemini-1.5-pro"];
          return res.json({ valid: true, provider: "gemini", statusCode: 200, message: "Clé Gemini Valide & Autorisée (200 OK)", modelsAvailable: modelsList.slice(0, 6) });
        }

        const errJson = await geminiRes.json().catch(() => ({}));
        return res.json({
          valid: false,
          provider: "gemini",
          statusCode: geminiRes.status,
          message:
            geminiRes.status === 403 || geminiRes.status === 400
              ? "Clé Gemini Invalide ou Restreinte (403/400)"
              : geminiRes.status === 429
              ? "Quota Gemini Dépassé (429)"
              : `Erreur Gemini (${geminiRes.status})`,
          details: errJson?.error?.message || geminiRes.statusText,
        });
      } catch (gemErr: any) {
        const reason = gemErr?.name === "AbortError" ? "Délai d'attente dépassé" : gemErr?.message;
        return res.json({ valid: false, provider: "gemini", statusCode: 500, message: "Impossible de contacter l'API Gemini", details: reason });
      }
    }

    if (provider === "openai") {
      const targetKey = String(apiKey).trim();
      if (!targetKey) {
        return res.json({ valid: false, provider: "openai", statusCode: 400, message: "Clé API OpenAI manquante." });
      }

      const rawBaseUrl = String(baseUrl || "").trim();
      if (!isAllowedProviderBaseUrl(rawBaseUrl, provider)) {
        return res.json({ valid: false, provider: "openai", statusCode: 400, message: "Endpoint non autorisé (https public requis)." });
      }
      const targetUrl = rawBaseUrl ? `${rawBaseUrl.replace(/\/+$/, "")}/models` : "https://api.openai.com/v1/models";

      try {
        const openAiRes = await fetchWithTimeout(targetUrl, {
          method: "GET",
          headers: { Authorization: `Bearer ${targetKey}` },
        }, 10000);

        if (openAiRes.ok) {
          const data = await openAiRes.json().catch(() => ({}));
          const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
          return res.json({ valid: true, provider: "openai", statusCode: 200, message: "Clé OpenAI Valide & Autorisée (200 OK)", modelsAvailable: models.slice(0, 6) });
        }

        const errJson = await openAiRes.json().catch(() => ({}));
        return res.json({
          valid: false,
          provider: "openai",
          statusCode: openAiRes.status,
          message:
            openAiRes.status === 401
              ? "Clé OpenAI Invalide / Non Autorisée (401)"
              : openAiRes.status === 429
              ? "Quota OpenAI Dépassé / Inconnu (429)"
              : `Erreur OpenAI (${openAiRes.status})`,
          details: errJson?.error?.message || openAiRes.statusText,
        });
      } catch (oErr: any) {
        const reason = oErr?.name === "AbortError" ? "Délai d'attente dépassé" : oErr?.message;
        return res.json({ valid: false, provider: "openai", statusCode: 500, message: "Erreur de connexion à OpenAI", details: reason });
      }
    }

    if (provider === "ollama") {
      const rawBaseUrl = String(baseUrl || "").trim();
      if (!isAllowedProviderBaseUrl(rawBaseUrl, provider)) {
        return res.json({ valid: false, provider: "ollama", statusCode: 400, message: "Endpoint Ollama non autorisé." });
      }
      const targetUrl = `${(rawBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "")}/models`;
      try {
        const oRes = await fetchWithTimeout(targetUrl, {}, 8000);
        if (oRes.ok) {
          return res.json({ valid: true, provider: "ollama", statusCode: 200, message: "Serveur Ollama actif & joignable" });
        }
        return res.json({ valid: false, provider: "ollama", statusCode: oRes.status, message: `Serveur Ollama a répondu avec code ${oRes.status}` });
      } catch (e: any) {
        const reason = e?.name === "AbortError" ? "Délai d'attente dépassé" : e?.message;
        return res.json({ valid: false, provider: "ollama", statusCode: 503, message: "Serveur Ollama local non joignable (127.0.0.1:11434)", details: reason });
      }
    }

    // Fournisseurs OpenAI-compatibles (Groq, OpenRouter, Mistral, etc.)
    const targetKey = apiKey ? String(apiKey).trim() : "";
    let cleanBaseUrl = baseUrl ? String(baseUrl).trim().replace(/\/+$/, "") : "";

    const DEFAULT_PROVIDER_URLS: Record<string, string> = {
      groq: "https://api.groq.com/openai/v1",
      openrouter: "https://openrouter.ai/api/v1",
      mistral: "https://api.mistral.ai/v1",
      cerebras: "https://api.cerebras.ai/v1",
      together: "https://api.together.xyz/v1",
      sambanova: "https://api.sambanova.ai/v1",
      "github-models": "https://models.inference.ai.azure.com",
      cohere: "https://api.cohere.ai/v1",
      "google-aistudio": "https://generativelanguage.googleapis.com/v1beta/openai",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      openai: "https://api.openai.com/v1",
    };

    if (!cleanBaseUrl && DEFAULT_PROVIDER_URLS[provider]) {
      cleanBaseUrl = DEFAULT_PROVIDER_URLS[provider];
    }
    if (!cleanBaseUrl) {
      cleanBaseUrl = "https://api.openai.com/v1";
    }

    if (!isAllowedProviderBaseUrl(cleanBaseUrl, provider)) {
      return res.json({ valid: false, provider, statusCode: 400, message: "Endpoint non autorisé (https public requis)." });
    }

    const targetUrl = `${cleanBaseUrl}/models`;
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...sanitizeCustomHeaders(customHeaders),
    };
    if (targetKey) {
      requestHeaders["Authorization"] = `Bearer ${targetKey}`;
    }

    try {
      const apiRes = await fetchWithTimeout(targetUrl, { method: "GET", headers: requestHeaders }, 10000);

      if (apiRes.ok) {
        const data = await apiRes.json().catch(() => ({}));
        const models = Array.isArray(data.data)
          ? data.data.map((m: any) => m.id)
          : Array.isArray(data.models)
          ? data.models.map((m: any) => m.name || m.id)
          : [];
        return res.json({ valid: true, provider, statusCode: 200, message: `Clé API ${provider.toUpperCase()} valide & autorisée (200 OK)`, modelsAvailable: models.slice(0, 6) });
      }

      const errJson = await apiRes.json().catch(() => ({}));
      const errMsg = String(errJson?.error?.message || errJson?.message || apiRes.statusText || "").slice(0, 300);
      return res.json({
        valid: false,
        provider,
        statusCode: apiRes.status,
        message:
          apiRes.status === 401
            ? `Clé API ${provider.toUpperCase()} invalide / non autorisée (401)`
            : apiRes.status === 403
            ? `Accès refusé pour ${provider.toUpperCase()} (403)`
            : apiRes.status === 429
            ? `Quota dépassé pour ${provider.toUpperCase()} (429)`
            : `Erreur API ${provider.toUpperCase()} (${apiRes.status})`,
        details: errMsg,
      });
    } catch (e: any) {
      const reason = e?.name === "AbortError" ? "Délai d'attente dépassé" : e?.message;
      return res.json({ valid: false, provider, statusCode: 500, message: `Impossible de contacter l'API ${provider}`, details: reason });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erreur serveur validation" });
  }
});

// ---------------------------------------------------------------------------
// Synthèse vocale (OpenAI, ElevenLabs, Google Translate TTS)
// ---------------------------------------------------------------------------

app.post("/api/tts", async (req, res) => {
  const ip = getClientIp(req);
  if (!rateLimit(ip, 120, 60_000)) return rateLimited(res, ip, 120);

  try {
    const { text, engine, voice, apiKey, rate } = req.body;
    if (!text) return res.status(400).json({ error: "Text parameter is required." });

    // 1. OpenAI Audio TTS
    if (engine === "openai-tts") {
      const key = apiKey || process.env.OPENAI_API_KEY;
      if (!key) {
        return res.status(400).json({ error: "Clé API OpenAI manquante. Renseignez votre clé OpenAI dans les Réglages." });
      }
      const response = await fetchWithTimeout("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "tts-1", input: String(text).slice(0, 4000), voice: voice || "nova", speed: rate || 1.0 }),
      }, 20000);

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Erreur OpenAI TTS: ${errText.slice(0, 300)}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      return res.send(Buffer.from(arrayBuffer));
    }

    // 2. ElevenLabs AI Neural TTS
    if (engine === "elevenlabs") {
      const key = apiKey || process.env.ELEVENLABS_API_KEY;
      const voiceId = voice || "21m00Tcm4TlvDq8ikWAM";
      if (!key) {
        return res.status(400).json({ error: "Clé API ElevenLabs manquante. Veuillez renseigner votre clé dans les Réglages." });
      }

      const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(text).slice(0, 4000), model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      }, 20000);

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Erreur ElevenLabs TTS: ${errText.slice(0, 300)}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      return res.send(Buffer.from(arrayBuffer));
    }

    // 3. Google Translate TTS (gtts) - 100% gratuit
    if (engine === "gtts" || engine === "edge-tts") {
      const lang = voice && String(voice).length === 2 ? voice : "fr";
      const gttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(String(text).slice(0, 500))}&tl=${lang}&client=tw-ob`;

      const response = await fetchWithTimeout(gttsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }, 15000);

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(arrayBuffer));
      }
    }

    return res.status(400).json({ error: "Moteur TTS non configuré côté serveur (Utiliser Web Speech API)." });
  } catch (err: any) {
    console.error("Server TTS error:", err?.message || err);
    return res.status(500).json({ error: "Erreur interne du serveur TTS." });
  }
});

// ---------------------------------------------------------------------------
// Stream Chat API (SSE) - Gemini + fournisseurs OpenAI-compatibles
// ---------------------------------------------------------------------------

app.post("/api/chat/stream", async (req, res) => {
  const ip = getClientIp(req);
  if (!rateLimit(ip, 240, 60_000)) {
    return res.status(429).json({ error: "Trop de requêtes. Réessayez dans quelques instants." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const streamAbort = new AbortController();
  let clientClosed = false;
  req.on("close", () => {
    clientClosed = true;
    streamAbort.abort();
  });

  const sendEvent = (data: object) => {
    if (res.writableEnded || clientClosed) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client déconnecté
    }
  };

  try {
    const {
      messages = [],
      provider = "gemini",
      apiKey = "",
      baseUrl = "",
      model = "",
      systemPrompt = "You are Ghost Avatar AI, a mysterious, wise, and friendly digital presence.",
      customHeaders = {},
    } = req.body;

    // 1. Provider Gemini (clé intégrée ou personnalisée)
    if (provider === "gemini") {
      const ai = getGeminiClient(apiKey);
      if (!ai) {
        sendEvent({ error: "Aucune clé API Gemini détectée. Veuillez renseigner votre clé API dans les Réglages (Ctrl+Shift+K)." });
        res.end();
        return;
      }

      const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
      const formattedContents = (Array.isArray(messages) ? messages : []).map((m: any) => {
        const parts: any[] = [];
        if (m.imageUrl) {
          const dataPart = m.imageUrl.includes(",") ? m.imageUrl.split(",")[1] : m.imageUrl;
          const mimeType = m.imageUrl.includes(";") ? m.imageUrl.split(";")[0].replace("data:", "") : "image/jpeg";
          if (typeof dataPart === "string" && dataPart.length < MAX_IMAGE_BYTES) {
            parts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data: dataPart } });
          }
        }
        if (m.content) {
          parts.push({ text: String(m.content) });
        }
        return { role: m.role === "assistant" ? "model" : "user", parts };
      });

      let modelName = model || "gemini-2.5-flash";
      if (modelName.includes("3.6") || modelName === "gemini-3.6-flash") {
        modelName = "gemini-2.5-flash";
      }

      const candidateModels = [modelName];
      if (!candidateModels.includes("gemini-2.5-flash")) candidateModels.push("gemini-2.5-flash");
      if (!candidateModels.includes("gemini-2.0-flash")) candidateModels.push("gemini-2.0-flash");
      if (!candidateModels.includes("gemini-1.5-flash")) candidateModels.push("gemini-1.5-flash");

      let success = false;
      let lastError: any = null;

      for (const currentModel of candidateModels) {
        if (clientClosed) break;
        try {
          const stream = await ai.models.generateContentStream({
            model: currentModel,
            contents: formattedContents,
            config: { systemInstruction: String(systemPrompt).slice(0, 20000) },
          });

          let fullText = "";
          for await (const chunk of stream) {
            if (clientClosed) break;
            const text = chunk.text || "";
            if (text) {
              fullText += text;
              sendEvent({ token: text });
            }
          }

          sendEvent({ done: true, fullText });
          res.end();
          success = true;
          break;
        } catch (geminiErr: any) {
          lastError = geminiErr;
          const errStr = JSON.stringify(geminiErr || {}).replace(/key=[^&\s"]+/g, "key=[REDACTED]");
          console.warn(`Gemini model ${currentModel} failed:`, errStr.slice(0, 500));
          if (errStr.includes("403") || errStr.includes("PERMISSION_DENIED") || errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("API_KEY_INVALID")) {
            break;
          }
        }
      }

      if (!success) {
        console.warn("Gemini API call failed, using smart avatar fallback response.");
        const lastUserMsg = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1]?.content : "";
        const fallbackText = generateFallbackReply(lastUserMsg);

        const words = fallbackText.split(" ");
        let fullText = "";
        for (const word of words) {
          if (clientClosed) break;
          const token = word + " ";
          fullText += token;
          sendEvent({ token });
          await new Promise((resolve) => setTimeout(resolve, 35));
        }

        sendEvent({ done: true, fullText });
        res.end();
        return;
      }
      return;
    }

    // 2. Fournisseurs OpenAI-compatibles (openai, qwen, ollama, custom, etc.)
    let targetBaseUrl = baseUrl ? String(baseUrl).trim() : "";
    let targetApiKey = apiKey;
    let targetModel = model;

    if (provider === "openai") {
      targetBaseUrl = targetBaseUrl || "https://api.openai.com/v1";
      targetModel = targetModel || "gpt-4o-mini";
    } else if (provider === "qwen") {
      targetBaseUrl = targetBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      targetModel = targetModel || "qwen-max";
    } else if (provider === "ollama") {
      targetBaseUrl = targetBaseUrl || "http://localhost:11434/v1";
      targetModel = targetModel || "qwen2.5:7b";
    }

    if (!targetBaseUrl) {
      targetBaseUrl = "https://api.openai.com/v1";
    }

    if (!isAllowedProviderBaseUrl(targetBaseUrl, provider)) {
      sendEvent({ error: "Endpoint LLM non autorisé (https public requis)." });
      res.end();
      return;
    }

    const cleanBaseUrl = targetBaseUrl.replace(/\/+$/, "");
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const requestMessages = [
      { role: "system", content: String(systemPrompt).slice(0, 20000) },
      ...(Array.isArray(messages) ? messages : []).map((m: any) => {
        if (m.imageUrl) {
          return {
            role: m.role,
            content: [
              { type: "text", text: String(m.content || "") },
              { type: "image_url", image_url: { url: String(m.imageUrl).slice(0, 6_000_000) } },
            ],
          };
        }
        return { role: m.role, content: String(m.content || "") };
      }),
    ];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...sanitizeCustomHeaders(customHeaders),
    };
    if (targetApiKey) {
      headers["Authorization"] = `Bearer ${targetApiKey}`;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: targetModel || "gpt-4o-mini", messages: requestMessages, stream: true }),
      }, 60000, streamAbort.signal);
    } catch (fetchErr: any) {
      const isLocalHost = provider === "ollama" || cleanBaseUrl.includes("127.0.0.1") || cleanBaseUrl.includes("localhost");
      const reason = fetchErr?.name === "AbortError" ? "Requête annulée (client déconnecté ou délai dépassé)" : fetchErr?.message || "Connexion refusée";

      if (isLocalHost) {
        console.log(`[Stream API] Local host endpoint (${cleanBaseUrl}) unavailable. Returning fallback event.`);
        sendEvent({ error: "Le serveur local Ollama (127.0.0.1:11434) n'est pas accessible. Bascule automatique vers le mode hors-ligne." });
      } else {
        console.warn(`[Stream API] Connection to ${cleanBaseUrl} failed:`, reason);
        sendEvent({ error: `Impossible de contacter le fournisseur LLM (${cleanBaseUrl}): ${reason}` });
      }
      res.end();
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `API Request failed (${response.status}): ${response.statusText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errorMsg = String(parsed.error.message).slice(0, 500);
      } catch {
        // corps non JSON
      }
      sendEvent({ error: errorMsg });
      res.end();
      return;
    }

    if (!response.body) {
      sendEvent({ error: "Response body is null" });
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (clientClosed) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") {
          sendEvent({ done: true });
          res.end();
          return;
        }

        if (trimmed.startsWith("data: ")) {
          try {
            const jsonStr = trimmed.slice(6);
            const parsed = JSON.parse(jsonStr);
            const token = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
            if (token) {
              sendEvent({ token });
            }
          } catch {
            // Chunks SSE partiels
          }
        }
      }
    }

    sendEvent({ done: true });
    res.end();
  } catch (err: any) {
    console.error("Error in /api/chat/stream:", err?.message || err);
    if (!res.writableEnded) {
      sendEvent({ error: "Erreur interne du serveur." });
      res.end();
    }
  }
});

// 404 JSON pour les routes /api inconnues (évite le catch-all SPA)
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint API introuvable." });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: "index.html" }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Ghost Avatar AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
