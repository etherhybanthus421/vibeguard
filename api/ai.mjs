/* vibeguard AI Studio relay — stateless proxy to OpenAI-compatible AI providers.
   Your API key travels from your browser to the provider and is never logged
   or stored here. Only whitelisted provider endpoints are reachable.
   Actions:
     - chat   auto-picks a working model (presets + live list) and retries on model errors
     - models lists available models for a provider using your key
   built by @thesajidalam */

const PROVIDERS = {
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta" },
  groq: { base: "https://api.groq.com/openai/v1" },
  openrouter: { base: "https://openrouter.ai/api/v1" },
  cerebras: { base: "https://api.cerebras.ai/v1" },
  mistral: { base: "https://api.mistral.ai/v1" },
  github: { base: "https://models.github.ai/inference" },
  nvidia: { base: "https://integrate.api.nvidia.com/v1" },
  custom: { base: null },
};

const PRESETS = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-8b-8192", "gemma2-9b-it"],
  openrouter: ["google/gemini-2.5-flash:free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free", "deepseek/deepseek-chat"],
  cerebras: ["llama-3.3-70b", "llama-3.1-8b", "gpt-oss-120b"],
  mistral: ["mistral-small-latest", "open-mistral-nemo", "codestral-latest"],
  github: ["openai/gpt-4o", "openai/gpt-4o-mini", "gpt-4.1-mini", "meta/llama-3.3-70b-instruct"],
  nvidia: ["meta/llama-3.1-70b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
  custom: [],
};

const FRIENDLY = {
  400: "The provider rejected the request. The key may be invalid, or the model does not exist.",
  401: "Invalid API key for this provider. Copy it again from your dashboard.",
  403: "Access denied. Your key may not be allowed to use this model.",
  404: "Model not found. vibeguard tried other models for you.",
  422: "The provider could not understand the request.",
  429: "Rate limit reached. Free tiers are capped - wait a moment and retry.",
  500: "The provider hit an internal error. Try again shortly.",
  502: "Bad gateway from the provider. Try again shortly.",
  503: "The provider is overloaded. Try again shortly.",
};

const BODY_LIMIT = 2 * 1024 * 1024;

export const maxDuration = 60;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (c) => {
      if (done) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        done = true;
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return dflt;
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.end(JSON.stringify(obj));
}

function fail(res, code, message) {
  sendJson(res, code, { ok: false, error: { code, message } });
}

function fetchWithTimeout(url, init, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || 20000);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
}

function providerHeaders(provider, key) {
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + key };
  if (provider === "openrouter") {
    h["HTTP-Referer"] = "https://vibeguard.vercel.app";
    h["X-Title"] = "vibeguard AI Studio";
  }
  if (provider === "github") {
    h["Accept"] = "application/vnd.github+json";
    h["X-GitHub-Api-Version"] = "2022-11-28";
  }
  return h;
}

function isAuthError(status, detail) {
  if (status === 401 || status === 403) return true;
  const d = String(detail || "").toLowerCase();
  return /api[ ._-]?key|access[ ._-]?denied|unauthor|permission|invalid[^,]*credential|invalid[^,]*token|incorrect[^,]*key|not[^,]*valid[^,]*key|invalid_api_key/.test(d);
}

function isEmbeddingLike(id) {
  return /embed|rerank|whisper|tts|stt|speech|voice|guard|classif|understand|translate|moderation/i.test(id);
}

function pickDefault(models) {
  if (!models.length) return "";
  let best = models[0];
  let bestScore = -Infinity;
  for (const m of models) {
    let s = 0;
    if (/:free/.test(m)) s += 4;
    if (/gemini|gpt-|llama|qwen|deepseek|claude|codestral/i.test(m)) s += 3;
    if (/flash|mini|small|instruct|nemo|coder/i.test(m)) s += 2;
    if (/^~/.test(m)) s -= 6;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/* ---------------- OpenAI-compatible helpers ---------------- */

async function openAiModels(base, key, headers) {
  const r = await fetchWithTimeout(base.replace(/\/+$/, "") + "/models", {
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", ...headers },
  }, 15000);
  if (!r.ok) throw new Error("models status " + r.status);
  const j = await r.json();
  return (j.data || []).map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);
}

async function openAiChat(base, key, model, messages, opts, headers) {
  let r;
  try {
    r = await fetchWithTimeout(base.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...headers },
      body: JSON.stringify({ model, messages, temperature: opts.temperature, max_tokens: opts.max_tokens, stream: false }),
    }, 55000);
  } catch (e) {
    return { ok: false, status: "network", detail: e && e.name === "AbortError" ? "timeout" : (e.message || "") };
  }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { j = null; }
  if (!r.ok) return { ok: false, status: r.status, detail: text.slice(0, 300) };
  const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) return { ok: false, status: "empty", detail: text.slice(0, 300) };
  return { ok: true, content, model: (j.model && String(j.model)) || model };
}

/* ---------------- Gemini native (works with AIza... AND OAuth tokens) ---------------- */

function geminiPayload(messages, opts) {
  const sys = [];
  const contents = [];
  for (const m of messages) {
    const text = m && typeof m.content === "string" ? m.content : "";
    if (!text) continue;
    if (m.role === "system") sys.push(text);
    else contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text }] });
  }
  const body = { generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.max_tokens } };
  if (sys.length) body.systemInstruction = { parts: [{ text: sys.join("\n") }] };
  if (contents.length) body.contents = contents;
  return body;
}

async function geminiRequest(url, key, init) {
  let r = await fetchWithTimeout(url, { ...init, headers: { ...init.headers, "x-goog-api-key": key } }, 55000);
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    r = await fetchWithTimeout(url, { ...init, headers: { ...init.headers, Authorization: "Bearer " + key } }, 55000);
  }
  return r;
}

async function geminiModels(key) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models";
  let r = await fetchWithTimeout(url, { headers: { "x-goog-api-key": key } }, 15000);
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    r = await fetchWithTimeout(url, { headers: { Authorization: "Bearer " + key } }, 15000);
  }
  if (!r.ok) throw new Error("gemini models status " + r.status);
  const j = await r.json();
  return (j.models || []).map((m) => String(m.name || "").replace(/^models\//, "")).filter(Boolean);
}

async function geminiChat(key, model, messages, opts) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
  let r;
  try {
    r = await geminiRequest(url, key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiPayload(messages, opts)) });
  } catch (e) {
    return { ok: false, status: "network", detail: e && e.name === "AbortError" ? "timeout" : (e.message || "") };
  }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { j = null; }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || "";
    return { ok: false, status: r.status, detail: msg || text.slice(0, 300) };
  }
  const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const content = (parts || []).map((p) => p.text || "").join("");
  if (!content.trim()) return { ok: false, status: "empty", detail: text.slice(0, 300) };
  return { ok: true, content, model };
}

/* ---------------- actions ---------------- */

async function actionModels(body) {
  const provider = String(body.provider || "");
  const key = String(body.key || "");
  if (!provider) return { error: [400, "Missing provider."] };
  if (!key) return { error: [400, "Missing API key."] };

  let live = true;
  let models = [];
  try {
    if (provider === "gemini") {
      models = await geminiModels(key);
    } else if (provider === "custom") {
      const base = typeof body.base === "string" && /^https:\/\//.test(body.base) ? body.base : "";
      if (!base) return { error: [400, "A valid https base URL is required to list custom models."] };
      models = await openAiModels(base, key, {});
    } else {
      const base = PROVIDERS[provider] ? PROVIDERS[provider].base : null;
      if (!base) return { error: [400, "Unsupported provider."] };
      models = await openAiModels(base, key, providerHeaders(provider, key));
    }
  } catch (e) {
    live = false;
    models = [];
  }

  if (!models.length) {
    live = false;
    models = (PRESETS[provider] || []).slice();
  }
  const usable = models.filter((m) => !isEmbeddingLike(m));
  const list = (usable.length ? usable : models).slice(0, 80);
  return {
    ok: true,
    models: list,
    default: pickDefault(list),
    live,
    fallback: !live,
  };
}

async function actionChat(body) {
  const provider = String(body.provider || "");
  const key = String(body.key || "");
  const messages = body.messages;
  const temperature = clampNum(body.temperature, 0, 2, 0.2);
  const max_tokens = clampNum(body.max_tokens, 1, 16384, 8192);

  if (!provider) return { error: [400, "Missing provider."] };
  if (!key) return { error: [400, "Missing API key."] };
  if (!Array.isArray(messages) || messages.length === 0) return { error: [400, "Missing messages."] };

  const clean = messages.map((m) => ({ role: m && m.role === "assistant" ? "assistant" : m && m.role === "system" ? "system" : "user", content: String(m.content || "") })).filter((m) => m.content.trim());
  if (!clean.length) return { error: [400, "Missing messages."] };

  const base = provider === "custom"
    ? (typeof body.base === "string" && /^https:\/\//.test(body.base) ? body.base : null)
    : (PROVIDERS[provider] ? PROVIDERS[provider].base : null);
  if (!base) return { error: [400, provider === "custom" ? "A valid https base URL is required for custom providers." : "Unsupported provider."] };

  const candidates = [];
  const push = (m) => { m = String(m || "").trim(); if (m && !candidates.includes(m)) candidates.push(m); };
  if (body.model) push(body.model);
  if (Array.isArray(body.models)) for (const m of body.models) push(m);
  for (const m of PRESETS[provider] || []) push(m);
  if (!candidates.length) return { error: [400, "No model available for this provider."] };

  const headers = providerHeaders(provider, key);
  let lastErr = null;
  const attempted = [];
  const tried = candidates.slice(0, 6);
  for (const model of tried) {
    attempted.push(model);
    let out;
    if (provider === "gemini") out = await geminiChat(key, model, clean, { temperature, max_tokens });
    else out = await openAiChat(base, key, model, clean, { temperature, max_tokens }, headers);
    if (out.ok) {
      return { ok: true, content: out.content, model: out.model || model, attempted };
    }
    lastErr = { status: out.status, detail: out.detail || "" };
    if (isAuthError(out.status, out.detail)) break;
  }

  const st = lastErr ? lastErr.status : "error";
  const message = FRIENDLY[st] || "Could not complete the request. vibeguard tried " + attempted.length + " model(s).";
  const detail = lastErr && lastErr.detail ? String(lastErr.detail).slice(0, 220) : "";
  return { error: [502, message, detail] };
}

/* ---------------- handler ---------------- */

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    fail(res, 405, "Use POST.");
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    fail(res, 400, "Invalid request body: " + e.message);
    return;
  }

  const action = body.action === "models" ? "models" : "chat";
  const result = action === "models" ? await actionModels(body) : await actionChat(body);

  if (result.error) {
    const [code, message, detail] = result.error;
    sendJson(res, code, { ok: false, error: { code, message, ...(detail ? { detail } : {}) } });
    return;
  }
  sendJson(res, 200, result);
}
