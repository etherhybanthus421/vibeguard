/* vibeguard AI Studio relay — stateless proxy to OpenAI-compatible AI providers.
   Your API key travels from your browser to the provider and is never logged
   or stored here. Only whitelisted provider endpoints are reachable.
   built by @thesajidalam */

const PROVIDERS = {
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai" },
  groq: { base: "https://api.groq.com/openai/v1" },
  openrouter: { base: "https://openrouter.ai/api/v1" },
  cerebras: { base: "https://api.cerebras.ai/v1" },
  mistral: { base: "https://api.mistral.ai/v1" },
  github: { base: "https://models.github.ai/inference" },
  nvidia: { base: "https://integrate.api.nvidia.com/v1" },
  custom: { base: null },
};

const FRIENDLY = {
  400: "The provider rejected the request. Check the model name and prompt size.",
  401: "Invalid API key for this provider. Copy it again from your dashboard.",
  403: "Access denied. Your key may not be allowed to use this model.",
  404: "Model not found. Pick a different model for this provider.",
  422: "The provider could not understand the request. Check the model name.",
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

  const provider = String(body.provider || "");
  const model = String(body.model || "").trim();
  const key = String(body.key || "");
  const messages = body.messages;
  const temperature = clampNum(body.temperature, 0, 2, 0.2);
  const max_tokens = clampNum(body.max_tokens, 1, 16384, 4096);

  if (!provider) return fail(res, 400, "Missing provider.");
  if (!model) return fail(res, 400, "Missing model.");
  if (!key) return fail(res, 400, "Missing API key.");
  if (!Array.isArray(messages) || messages.length === 0) {
    return fail(res, 400, "Missing messages.");
  }

  let base = PROVIDERS[provider] ? PROVIDERS[provider].base : null;
  if (provider === "custom") {
    if (typeof body.base === "string" && /^https:\/\//.test(body.base)) {
      base = body.base;
    } else {
      return fail(res, 400, "A valid https base URL is required for custom providers.");
    }
  }
  if (!base) return fail(res, 400, "Unsupported provider.");

  const payload = {
    model,
    messages,
    temperature,
    max_tokens,
    stream: false,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + key,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://vibeguard.vercel.app";
    headers["X-Title"] = "vibeguard AI Studio";
  }
  if (provider === "github") {
    headers["Accept"] = "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55000);
  try {
    const upstream = await fetch(base.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      let detail = "";
      try {
        const t = await upstream.text();
        detail = (t || "").slice(0, 220);
      } catch (e) {
        detail = "";
      }
      const message = FRIENDLY[upstream.status] || "Provider returned status " + upstream.status + ".";
      return sendJson(res, 502, { ok: false, error: { code: upstream.status, message, detail } });
    }

    const data = await upstream.json();
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;
    if (typeof content !== "string" || content.length === 0) {
      return sendJson(res, 502, { ok: false, error: { code: "empty", message: "The provider returned an empty response." } });
    }
    return sendJson(res, 200, {
      ok: true,
      content,
      model: data.model || model,
      usage: data.usage || null,
    });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e && e.name === "AbortError";
    const message = timedOut
      ? "The provider took too long. Shorten the input or try again."
      : "Could not reach the provider. Check your network and base URL.";
    return sendJson(res, 502, { ok: false, error: { code: timedOut ? "timeout" : "network", message } });
  }
}
