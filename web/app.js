/* vibeguard AI Studio — static scanner + AI-powered bug finder, security audit,
   fixer, deployment review, report generator and the Site Sentinel web scanner.
   Works with free AI API keys (Gemini, Groq, OpenRouter, Cerebras, Mistral,
   GitHub Models, NVIDIA, or any OpenAI-compatible endpoint).
   built by @thesajidalam */

const $ = (id) => document.getElementById(id);
const codeEl = $("code");
const outputEl = $("resContent");
const gutterEl = $("gutter");
const statusEl = $("resStatus");
const titleEl = $("resTitle");
const verdictEl = $("verdict");

const ESC = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let toastTimer = null;
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------------- static rules (faithful port of the CLI) ---------------- */

function stripComments(text) {
  const strings = [];
  const masked = text.replace(
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
    (m) => {
      strings.push(m);
      return "\u0000" + (strings.length - 1) + "\u0001";
    }
  );
  const clean = masked
    .replace(/\/\/.*$/g, "")
    .replace(/#.*$/g, "")
    .replace(/<!--.*?-->/gs, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return clean.replace(/\u0000(\d+)\u0001/g, (_, i) => strings[+i]);
}

const CODE_EXTS = /\.(js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|go|java|kt|kts|rb|php|c|h|cpp|hpp|cs|rs|swift|sh|bash|zsh|pl|lua|scala|ex|exs|dart)$/i;
const JS_EXTS = /\.(js|mjs|cjs|jsx|ts|tsx)$/i;
const CATCHABLE_EXTS = /\.(js|mjs|cjs|jsx|ts|tsx|py|java|kt|kts|php|rb|swift|cs|scala)$/i;
const SLEEP_EXTS = /\.(py|java|kt|kts|js|mjs|cjs|jsx|ts|tsx)$/i;
const CONFIG_EXTS = /\.(json|yml|yaml|toml|xml|ini|conf)$/i;
const LANG = {
  js: "js", mjs: "js", cjs: "js", jsx: "jsx", ts: "ts", tsx: "tsx", py: "py", go: "go",
  java: "java", kt: "kt", rb: "rb", php: "php", c: "c", cpp: "cpp", rs: "rs",
  swift: "swift", sh: "sh", bash: "bash", yaml: "yaml", yml: "yaml", json: "json",
};

function isTestFile(name) {
  const base = name.replace(/\\/g, "/");
  const file = base.split("/").pop();
  return /(^|\/)(__tests__|tests?|specs?)(\/|\.|$)/i.test(base) || /\.(test|spec)\.[a-z0-9]+$/i.test(base) || /(^|[._-])(test|spec)([._-]|$)/i.test(file);
}

const trimToken = (s) => (s.length <= 24 ? s : s.slice(0, 12) + "…" + s.slice(-8));
function isPlaceholderValue(v) {
  const low = v.toLowerCase();
  if (low.length < 20 || /\.{3,}$/.test(low)) return true;
  return ["example", "placeholder", "changeme", "your_", "your-", "yourkey", "xxx", "dummy", "fake", "test", "<", ">", "redacted", "insert"].some((t) => low.includes(t));
}
const SECRET_PATTERNS = [
  { name: "OpenAI-style API key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub personal access token", re: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Stripe secret key", re: /\bsk_live_[0-9A-Za-z]{20,}\b/ },
  { name: "private key material", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "JWT-shaped token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
];
const SECRET_ASSIGN = [
  { name: "hardcoded API key", re: /\b(?:api[_-]?key|apikey|client[_-]?secret|access[_-]?token|secret[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { name: "hardcoded password", re: /\bpassword\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { name: "hardcoded bearer token", re: /["']Bearer [A-Za-z0-9_.-]{20,}["']/ },
];
const BUILTIN_ENV = new Set([
  "NODE_ENV", "NODE_PATH", "NODE_OPTIONS", "PATH", "HOME", "USER", "USERNAME",
  "LANG", "LC_ALL", "TZ", "PORT", "HOST", "HOSTNAME", "PWD", "SHELL", "TERM",
  "SHLVL", "CI", "GITHUB_ACTIONS", "DEBUG", "LOG_LEVEL", "npm_lifecycle_event",
  "npm_package_name", "npm_package_version", "npm_config_registry", "TMPDIR",
  "TEMP", "TMP", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "OS", "PAGER", "EDITOR",
  "NO_COLOR", "FORCE_COLOR", "TERM_PROGRAM", "WSLENV", "WT_SESSION",
]);
const ENV_READERS = [
  { re: /\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g, needsDefault: false },
  { re: /\bprocess\.env\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\]/g, needsDefault: false },
  { re: /\bDeno\.env\.get\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*(,\s*["'][^"']*["'])?\s*\)/g, needsDefault: true },
  { re: /\bos\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*(,\s*["'][^"']*["'])?\s*\)/g, needsDefault: true },
  { re: /\bos\.environ\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\]/g, needsDefault: false },
  { re: /\bos\.environ\.get\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*\)/g, needsDefault: false },
  { re: /(?<!\.)\bgetenv\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*/g, needsDefault: false },
];
const CATCH_EMPTY_SINGLE = /\}\s*catch\s*(\([^)]*\))?\s*\{\s*\}/;
const CATCH_EMPTY_SINGLE2 = /^\s*catch\s*(\([^)]*\))?\s*\{\s*\}/;
const CATCH_OPEN = /^\s*\}\s*catch\s*(\([^)]*\))?\s*\{\s*$/;
const CATCH_OPEN2 = /^\s*catch\s*(\([^)]*\))?\s*\{\s*$/;
const EXCEPT_EMPTY_SINGLE = /^\s*except\b[^:]*:\s*pass\b/;
const EXCEPT_OPEN = /^\s*except\b[^:]*:\s*$/;
const DECL_RISKY = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^;]*?\.(find|findLast|first|query|querySelector|getElementById|match|matchAll|pop|shift|next)\(|JSON\.parse\()/;
const SLEEP_PATTERNS = [
  { name: "time.sleep", re: /\btime\.sleep\s*\(/ },
  { name: "Thread.sleep", re: /\bThread\.sleep\s*\(/ },
  { name: "asyncio.sleep", re: /\bawait\s+asyncio\.sleep\s*\(/ },
  { name: "setTimeout wait", re: /await\s+new\s+Promise\s*\(\s*\(?r\)?\s*=>\s*setTimeout\s*\([^)]*r\s*,/ },
  { name: "long sleep()", re: /\bsleep\s*\(\s*\d{3,}\s*\)/ },
];
const DEBUG_PATTERNS = [
  { name: "console.log", re: /\bconsole\.(log|debug|info|trace)\s*\(/ },
  { name: "debugger", re: /\bdebugger\b/ },
  { name: "print()", re: /\bprint\s*\(/ },
  { name: "puts", re: /\bputs\s+/ },
];
const DUMMY_PATTERNS = [
  { name: "lorem ipsum", re: /lorem\s+ipsum/i },
  { name: "changeme", re: /\bchangeme\b/i },
  { name: "your-api-key placeholder", re: /\byour[-_ ]?api[-_ ]?key\b/i },
  { name: "your-key placeholder", re: /\byour[-_ ]?(?:key|secret|token)\b/i },
  { name: "placeholder", re: /\bplaceholder\b/i },
  { name: "insert-your placeholder", re: /\binsert\s+your\b/i },
  { name: "TODO", re: /\bTODO\b/ },
  { name: "FIXME", re: /\bFIXME\b/ },
  { name: "HACK", re: /\bHACK\b/ },
];
const MAX_LINE_LEN = 400;
const BIG_NEW_FILE = 800;

function extractImportNames(text) {
  const names = [];
  const add = (parts) => {
    for (let part of parts) {
      part = part.trim().replace(/^\(|\)$/g, "");
      if (!part) continue;
      const as = part.match(/^(.+?)\s+as\s+(\w+)$/);
      names.push(as ? as[2] : part);
    }
  };
  let m = text.match(/^import\s+\{([^}]+)\}\s+from\s+/);
  if (m) { add(m[1].split(",")); return names; }
  m = text.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+/);
  if (m) { names.push(m[1]); return names; }
  m = text.match(/^import\s+(\w+)\s+from\s+/);
  if (m) { names.push(m[1]); return names; }
  m = text.match(/^const\s+\{([^}]+)\}\s*=\s*require\(/);
  if (m) { add(m[1].split(",")); return names; }
  m = text.match(/^const\s+(\w+)\s*=\s*require\(/);
  if (m) { names.push(m[1]); return names; }
  return names;
}

function scanFile(name, lines, findings, opts) {
  const push = (line, rule, message, sev) => findings.push({ file: name, line, rule, message, sev });
  const isPy = /\.py$/.test(name);
  const isJs = JS_EXTS.test(name);

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const line = i + 1;
    const code = stripComments(text);

    if (CODE_EXTS.test(name) || CONFIG_EXTS.test(name)) {
      let flagged = false;
      for (const p of SECRET_PATTERNS) {
        const m = text.match(p.re);
        if (m && !isPlaceholderValue(m[0])) {
          push(line, "secret", `hardcoded ${p.name} "${trimToken(m[0])}"`, "error");
          flagged = true;
          break;
        }
      }
      if (!flagged) {
        for (const p of SECRET_ASSIGN) {
          const m = text.match(p.re);
          if (m && !isPlaceholderValue(text)) {
            push(line, "secret", `${p.name} "${trimToken(m[0])}"`, "error");
            break;
          }
        }
      }
    }

    if (CODE_EXTS.test(name)) {
      for (const reader of ENV_READERS) {
        reader.re.lastIndex = 0;
        let m;
        while ((m = reader.re.exec(code)) !== null) {
          const key = m[1];
          if (!key || BUILTIN_ENV.has(key)) continue;
          if (reader.needsDefault && m[2] !== undefined) continue;
          const after = code.slice(reader.re.lastIndex);
          if (/\?\?|\|\|/.test(after)) continue;
          push(line, "envhole", `reads "${key}" but it is never declared and has no fallback — add it to your .env.example`, "error");
          break;
        }
        if (findings.length && findings[findings.length - 1].line === line && findings[findings.length - 1].file === name) break;
      }
    }

    if (CATCHABLE_EXTS.test(name)) {
      if (CATCH_EMPTY_SINGLE.test(text) || CATCH_EMPTY_SINGLE2.test(text)) {
        push(line, "swallow", "empty catch block — a failure just got silently erased", "error");
      } else if (EXCEPT_EMPTY_SINGLE.test(text)) {
        push(line, "swallow", "except branch only passes — the failure is being eaten silently", "error");
      }
    }

    if (SLEEP_EXTS.test(name) && !isTestFile(name)) {
      for (const p of SLEEP_PATTERNS) {
        if (p.re.test(text)) {
          push(line, "sleepfix", `${p.name} in non-test code — usually an AI "fix" that hides a race instead of solving it`, "error");
          break;
        }
      }
    }

    if (CODE_EXTS.test(name) && !isTestFile(name)) {
      for (const p of DEBUG_PATTERNS) {
        if (p.re.test(text)) {
          push(line, "debugprint", `${p.name} left in non-test code`, "warning");
          break;
        }
      }
    }

    if (CODE_EXTS.test(name) || CONFIG_EXTS.test(name)) {
      for (const p of DUMMY_PATTERNS) {
        if (p.re.test(code)) {
          const extra = /TODO|FIXME|HACK/.test(p.name) ? " — sure this was meant to ship?" : " left in the diff";
          push(line, "dummy", p.name + extra, "warning");
          break;
        }
      }
      const trimmed = text.trim();
      if (trimmed.length > MAX_LINE_LEN && !/^(#|\/\/|\/\*|\*)/.test(trimmed)) {
        push(line, "minified", `line is ${trimmed.length} characters — minified or pasted blob, painful to review`, "warning");
      }
    }
  }

  if (isJs) {
    const risky = new Map();
    const checked = new Set();
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const m = text.match(DECL_RISKY);
      if (m) {
        const nm = m[1];
        const idx = text.indexOf(nm + "=");
        const after = text.slice(idx + nm.length + 1);
        if (/\?\?|\?\./.test(after)) continue;
        risky.set(nm, { line: i + 1, hint: m[2] ? "." + m[2] + "()" : "JSON.parse()" });
        if (/\.(find|findLast|first|query|querySelector|getElementById|match|matchAll|pop|shift|next)\([^)]*\)\.[A-Za-z_$]|JSON\.parse\([^)]*\)\.[A-Za-z_$]/.test(text)) {
          push(i + 1, "nullaccess", 'a nullable result is accessed directly with "." — add optional chaining (?.) or a null check', "error");
        }
      }
      for (const nm of risky.keys()) {
        if (new RegExp(`!${escRe(nm)}\\b|${escRe(nm)}\\s*==\\s*null|${escRe(nm)}\\s*===\\s*null|${escRe(nm)}\\s*\\?\\?`).test(text)) checked.add(nm);
      }
    }
    for (const [nm, meta] of risky) {
      if (checked.has(nm)) continue;
      for (let i = 0; i < lines.length; i++) {
        if (i + 1 === meta.line) continue;
        const text = lines[i];
        if (new RegExp(`\\b${escRe(nm)}\\?\\?`).test(text)) continue;
        if (new RegExp(`\\b${escRe(nm)}\\?\\.`).test(text)) continue;
        if (new RegExp(`\\b${escRe(nm)}\\.`).test(text)) {
          push(i + 1, "nullaccess", `"${nm}" can be null (from a ${meta.hint} call) but is accessed as "${nm}.x" with no check`, "error");
          break;
        }
      }
    }
  }

  if (JS_EXTS.test(name) || isPy) {
    const source = lines.join("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!/(^|\s)import\s|\brequire\(/.test(text)) continue;
      for (const nm of extractImportNames(text)) {
        if (!nm) continue;
        const lineHits = (text.match(new RegExp(`\\b${escRe(nm)}\\b`, "g")) || []).length;
        const totalHits = (source.match(new RegExp(`\\b${escRe(nm)}\\b`, "g")) || []).length;
        if (totalHits <= lineHits) push(i + 1, "deadimport", `"${nm}" is imported but never used`, "warning");
      }
    }
  }

  if (opts && opts.newFile && lines.length > BIG_NEW_FILE) {
    push(1, "bignew", `${lines.length} lines added in one shot — AI loves to one-shot a whole file. Review it like you own it.`, "warning");
  }
}

function scanFiles(files, opts) {
  const findings = [];
  for (const f of files) {
    const lines = f.text.split(/\r?\n/);
    scanFile(f.name, lines, findings, opts);
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return findings;
}

/* ---------------- markdown renderer (safe, dependency-free) ---------------- */

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function mdRender(src) {
  const raw = String(src || "").replace(/\r\n/g, "\n");
  const lines = ESC(raw).split("\n");
  let html = "";
  const stack = [];
  const closeLists = (depth) => { while (stack.length > depth) html += "</" + stack.pop() + ">"; };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (/^```/.test(line)) {
      closeLists(0);
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      html += '<pre><code' + (lang ? ' class="lang-' + lang.replace(/[^a-z0-9]/gi, "") + '"' : "") + ">" + buf.join("\n") + "</code></pre>";
      continue;
    }

    if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      closeLists(0);
      const parseRow = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      html += "<table><thead><tr>" + head.map((h) => "<th>" + inline(h) + "</th>").join("") + "</tr></thead><tbody>";
      for (const r of rows) html += "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>";
      html += "</tbody></table>";
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists(0);
      const lvl = h[1].length;
      html += "<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">";
      i++;
      continue;
    }

    if (/^---+$/.test(line) || /^\*{3,}$/.test(line)) { closeLists(0); html += "<hr>"; i++; continue; }

    if (/^>\s?/.test(line)) {
      closeLists(0);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      html += "<blockquote>" + inline(buf.join("<br>")) + "</blockquote>";
      continue;
    }

    const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const ol = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const m = ul || ol;
      const tag = ul ? "ul" : "ol";
      const depth = Math.floor(m[1].length / 2);
      while (stack.length < depth + 1) { stack.push(tag); html += "<" + tag + ">"; }
      while (stack.length > depth + 1) { html += "</" + stack.pop() + ">"; }
      if (stack[stack.length - 1] !== tag) { html += "</" + stack.pop() + ">"; stack.push(tag); html += "<" + tag + ">"; }
      html += "<li>" + inline(m[2]) + "</li>";
      i++;
      while (i < lines.length && lines[i].trim() === "" && i + 1 < lines.length && /^(\s*)[-*+]|^(\s*)\d+[.)]/.test(lines[i + 1])) i++;
      continue;
    }

    closeLists(0);
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^(\s*)[-*+]\s/.test(lines[i]) &&
      !/^(\s*)\d+[.)]\s/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length) html += "<p>" + buf.map((b) => inline(b)).join("<br>") + "</p>";
  }
  closeLists(0);
  return '<div class="md">' + html + "</div>";
}

function riskBadges(html) {
  return html.replace(/(<h[1-6][^>]*>)([^<]*?)(<\/h[1-6]>)/gi, (m, open, txt, close) => {
    let mm = txt.match(/Risk\s*Score\s*:?\s*(\d+)\s*\/\s*100/i) || txt.match(/Risk\s*:?\s*(\d+)\s*\/\s*100/i);
    if (mm) {
      const v = +mm[1];
      const cls = v >= 70 ? "high" : v >= 40 ? "med" : "low";
      return open + txt.replace(mm[0], '<span class="risk-badge risk-' + cls + '">' + mm[0] + "</span>") + close;
    }
    mm = txt.match(/Risk\s*Level\s*:?\s*(Critical|High|Medium|Low)/i);
    if (mm) {
      const cls = /critical|high/i.test(mm[1]) ? "high" : /medium/i.test(mm[1]) ? "med" : "low";
      return open + txt.replace(mm[0], '<span class="risk-badge risk-' + cls + '">' + mm[0] + "</span>") + close;
    }
    return m;
  });
}

/* ---------------- providers & settings ---------------- */

const PROVIDERS = [
  { id: "gemini", name: "Google Gemini", color: "#4285F4", free: "Free tier · no card", base: "https://generativelanguage.googleapis.com/v1beta/openai", keyLink: "https://aistudio.google.com/apikey", keyLabel: "Get a free Gemini key", models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-flash-preview"], note: "The most accessible frontier model with a genuinely free tier and huge context. Recommended default." },
  { id: "groq", name: "Groq", color: "#F55036", free: "Free tier · no card", base: "https://api.groq.com/openai/v1", keyLink: "https://console.groq.com/keys", keyLabel: "Get a free Groq key", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "qwen3-coder-30b"], note: "Blazing-fast LPU inference. Great for quick scans and near-instant reports." },
  { id: "openrouter", name: "OpenRouter", color: "#6461FF", free: "Free models · no card", base: "https://openrouter.ai/api/v1", keyLink: "https://openrouter.ai/keys", keyLabel: "Get a free OpenRouter key", models: ["google/gemini-2.5-flash:free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free", "deepseek/deepseek-chat-v3-0324:free"], note: "One key, 20+ free models. Perfect fallback when another provider rate-limits you." },
  { id: "cerebras", name: "Cerebras", color: "#06B6D4", free: "~1M tokens/day · no card", base: "https://api.cerebras.ai/v1", keyLink: "https://cloud.cerebras.ai", keyLabel: "Get a free Cerebras key", models: ["llama-3.3-70b", "llama-3.1-8b", "gpt-oss-120b", "qwen3-coder-235b-a3b"], note: "Very high throughput and long context. Generous daily free volume." },
  { id: "mistral", name: "Mistral", color: "#F7A600", free: "Free experiment tier", base: "https://api.mistral.ai/v1", keyLink: "https://console.mistral.ai/api-keys/", keyLabel: "Get a free Mistral key", models: ["codestral-latest", "open-mistral-nemo", "mistral-small-latest"], note: "Strong dedicated coding models like Codestral." },
  { id: "github", name: "GitHub Models", color: "#8B949E", free: "Free for prototyping", base: "https://models.github.ai/inference", keyLink: "https://github.com/settings/tokens", keyLabel: "Create a GitHub PAT (models:read)", models: ["openai/gpt-4o", "openai/gpt-4.1", "meta/llama-3.3-70b-instruct", "deepseek/deepseek-chat"], note: "Works with any GitHub account. The key is a fine-grained PAT with the models:read scope." },
  { id: "nvidia", name: "NVIDIA NIM", color: "#76B900", free: "Free credits", base: "https://integrate.api.nvidia.com/v1", keyLink: "https://build.nvidia.com", keyLabel: "Get free credits on NVIDIA", models: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"], note: "Free credits to try a wide catalog of open models." },
  { id: "custom", name: "Custom (OpenAI-compatible)", color: "#22d3ee", free: "Bring your own", base: "", keyLink: "", keyLabel: "", models: [""], note: "Any OpenAI-compatible endpoint — add your base URL and model id." },
];

const STORE_KEYS = "vbg_keys";
const STORE_SETTINGS = "vbg_settings";
const STORE_CUSTOM = "vbg_custom";
const STORE_MODELS = "vbg_models";
const STORE_CHOICE = "vbg_choice";

function loadKeys() { try { return JSON.parse(localStorage.getItem(STORE_KEYS)) || {}; } catch (e) { return {}; } }
function saveKeys(k) { localStorage.setItem(STORE_KEYS, JSON.stringify(k)); }
function getKey(pid) { return loadKeys()[pid] || ""; }
function setKey(pid, v) { const k = loadKeys(); if (v) k[pid] = v; else delete k[pid]; saveKeys(k); }
function loadModelCache() { try { return JSON.parse(localStorage.getItem(STORE_MODELS)) || {}; } catch (e) { return {}; } }
function loadModelChoice() { try { return JSON.parse(localStorage.getItem(STORE_CHOICE)) || {}; } catch (e) { return {}; } }
let modelCache = loadModelCache();
let modelChoice = loadModelChoice();
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_SETTINGS)) || {};
    const custom = JSON.parse(localStorage.getItem(STORE_CUSTOM)) || {};
    return { provider: s.provider || "gemini", model: s.model || "", temp: s.temp == null ? 0.2 : s.temp, customBase: custom.base || "", customModel: custom.model || "" };
  } catch (e) { return { provider: "gemini", model: "", temp: 0.2, customBase: "", customModel: "" }; }
}
function saveSettings(s) {
  localStorage.setItem(STORE_SETTINGS, JSON.stringify({ provider: s.provider, model: s.model, temp: s.temp }));
  localStorage.setItem(STORE_CUSTOM, JSON.stringify({ base: s.customBase, model: s.customModel }));
  localStorage.setItem(STORE_MODELS, JSON.stringify(modelCache));
  localStorage.setItem(STORE_CHOICE, JSON.stringify(modelChoice));
}

let settings = loadSettings();

function providerOf(id) { return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]; }

function renderProviderSelect() {
  const sel = $("providerSel");
  sel.innerHTML = PROVIDERS.map((p) => `<option value="${p.id}">${ESC(p.name)} — ${ESC(p.free)}</option>`).join("");
  sel.value = settings.provider;
}
function renderModelSelect() {
  const sel = $("modelSel");
  const p = providerOf(settings.provider);
  const cached = (modelCache[p.id] && modelCache[p.id].length) ? modelCache[p.id] : (p.models && p.models.length ? p.models : []);
  sel.innerHTML = ['<option value="">Auto (best available)</option>']
    .concat(cached.map((m) => '<option value="' + ESC(m) + '">' + ESC(m) + "</option>"))
    .join("");
  const chosen = p.id === "custom" ? "" : (modelChoice[p.id] || settings.model || "");
  sel.value = cached.includes(chosen) ? chosen : "";
  settings.model = p.id === "custom" ? settings.model : sel.value;
  $("customRow").hidden = p.id !== "custom";
  if (p.id === "custom") {
    $("customBase").value = settings.customBase;
    $("customModel").value = settings.customModel;
  }
}
function syncProviderUI() {
  const p = providerOf(settings.provider);
  const key = getKey(p.id);
  $("apiKey").value = key;
  const link = $("keyLink");
  if (p.keyLink) { link.href = p.keyLink; link.textContent = p.keyLabel + " →"; link.style.display = ""; }
  else link.style.display = "none";
  renderModelSelect();
  updateProviderState();
}
function updateProviderState() {
  const p = providerOf(settings.provider);
  const has = !!getKey(p.id);
  const m = p.id === "custom" ? (settings.customModel || "custom model") : (modelChoice[p.id] || settings.model || "auto model");
  $("providerState").textContent = has ? p.name + " connected · " + m : "no key set — static scan only";
  $("keyStatus").textContent = has
    ? "Key stored only in this browser. Sent straight to " + p.name + " via the relay — never logged or stored on vibeguard."
    : "Keys are stored only in your browser and sent straight to the provider. Never shared, never logged.";
}

async function refreshModels(silent) {
  const p = providerOf(settings.provider);
  const key = getKey(p.id);
  const btn = $("btnModels");
  if (!key) { if (!silent) toast("Paste a key first.", "err"); return null; }
  if (btn) { btn.disabled = true; btn.textContent = "loading…"; }
  try {
    const body = { action: "models", provider: p.id, key };
    if (p.id === "custom") {
      if (!settings.customBase) throw new Error("Set the custom base URL first.");
      body.base = settings.customBase.replace(/\/+$/, "");
    }
    const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data || !data.ok) throw new Error((data && data.error && data.error.message) || "Could not load models (status " + res.status + ").");
    if (data.models && data.models.length) modelCache[p.id] = data.models;
    const def = data.default || (modelCache[p.id] && modelCache[p.id][0]) || "";
    if (def && p.id !== "custom" && !modelChoice[p.id]) modelChoice[p.id] = def;
    saveSettings(settings);
    renderModelSelect();
    updateProviderState();
    if (!silent) toast("Loaded " + (data.models ? data.models.length : 0) + " model" + ((data.models || []).length === 1 ? "" : "s") + " for " + p.name + (def ? " · default: " + def : ""), "ok");
    return data.models || [];
  } catch (e) {
    if (!silent) toast(e.message, "err");
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Refresh models"; }
  }
}

/* ---------------- AI relay ---------------- */

async function callAI(messages, opts) {
  const p = providerOf(settings.provider);
  const key = getKey(p.id);
  if (!key) throw new Error("Paste a free API key first — click the provider panel above.");
  const body = {
    provider: p.id,
    key,
    messages,
    temperature: settings.temp,
    max_tokens: (opts && opts.max_tokens) || 8192,
    models: (modelCache[p.id] || []).slice(0, 12),
  };
  if (p.id === "custom") {
    if (!settings.customBase) throw new Error("Set the custom base URL in the provider panel.");
    body.base = settings.customBase.replace(/\/+$/, "");
    body.model = settings.customModel || "";
  } else {
    body.model = settings.model || modelChoice[p.id] || "";
  }
  let res;
  try {
    res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error("Could not reach the vibeguard relay. Check your connection.");
  }
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!data || !data.ok) {
    const msg = (data && data.error && data.error.message) || "The AI request failed (status " + res.status + ").";
    throw new Error(msg);
  }
  if (data.model && p.id !== "custom") {
    if (!modelChoice[p.id] && settings.model === "") modelChoice[p.id] = data.model;
    saveSettings(settings);
    renderModelSelect();
  }
  return data;
}

/* ---------------- modes & prompts ---------------- */

const MODES = {
  static: { label: "Static scan", ai: false, hint: "static — no key needed" },
  bugs: { label: "Bug finder", ai: true, hint: "AI review — key needed" },
  security: { label: "Security audit", ai: true, hint: "AI review — key needed" },
  fix: { label: "Fix & explain", ai: true, hint: "AI review — key needed" },
  deploy: { label: "API & deployment", ai: true, hint: "AI review — key needed" },
  report: { label: "Full audit report", ai: true, hint: "AI review — key needed" },
  site: { label: "Site Sentinel", ai: true, hint: "web scan — key needed" },
};

const SYSTEM = {
  bugs:
    "You are vibeguard, a brutally honest senior code reviewer. Analyze the code for logic bugs, race conditions, null/undefined dereferences, off-by-one errors, wrong API usage, swallowed errors and correctness gaps. Respond in Markdown with: a one-line Risk Score (format exactly 'Risk Score: N/100'), a table of findings (columns: Severity | Line | Issue | Fix), then concrete fixed code blocks where it matters. Cite line numbers. Be specific and actionable, never vague.",
  security:
    "You are vibeguard, a security auditor. Find hardcoded secrets, injection (SQL, command, XSS, LDAP), SSRF, insecure auth/sessions, path traversal, weak cryptography, unsafe deserialization, exposed debug endpoints and dependency risks. Respond in Markdown with: Risk Score line (format exactly 'Risk Score: N/100'), a findings table (columns: Severity | Location | Vulnerability | Exploit risk | Fix), then remediation code. Cite line numbers.",
  fix:
    "You are vibeguard, a fixer. First explain in plain language what is wrong with the code, then rewrite the full file with fixes applied, then list what changed. Respond in Markdown with sections: 'What is wrong' (bullets), 'Fixed code' (complete fenced code block), 'What changed' (bullets). Preserve the original behavior and style as much as possible.",
  deploy:
    "You are vibeguard, a deployment and API reliability reviewer. Flag env-var handling holes, hardcoded config, missing retries/backoff, swallowed errors, missing health checks, CORS misconfiguration, auth leaks, missing rate limiting, secret logging, and unsafe production defaults. Respond in Markdown with: Risk Score line (format exactly 'Risk Score: N/100'), a table of deployment risks (columns: Severity | Area | Risk | Fix), an action checklist, and a short hardening section.",
  report:
    "You are vibeguard, producing a comprehensive executive audit report. Output a single Markdown document with: Executive Summary, Risk Score (format exactly 'Risk Score: N/100'), Findings Summary table (Severity | Count), Detailed findings (each with location, line, description, severity and fix), Security vulnerabilities, Deployment & API warnings, Best-practice recommendations, and a Prioritized action plan. Be specific and cite line numbers throughout.",
  site:
    "You are vibeguard Site Sentinel, a ruthless website security auditor. A live webpage was fetched and its HTML structure, scripts, links, forms, inputs and visible text are shown below. Hunt for real web vulnerabilities: exposed secrets or internal hosts, forms with no CSRF token or insecure submission, plaintext/weak login fields, unvalidated inputs, links to risky or internal URLs, third-party/injected scripts, outdated or suspicious libraries, missing security headers, redirect and SSRF smells, open redirects, information disclosure, admin/debug/staging exposure and anything else an attacker could exploit. Respond in Markdown with: a one-line Risk Score (format exactly 'Risk Score: N/100'), a findings table (columns: Severity | Location | Vulnerability | Exploit risk | Fix), a concrete recommendations list, and a short hardening checklist. Quote the actual URLs, attribute names and strings you found on the page. Be specific and actionable, never vague.",
};

function buildUserMessage(files, truncated) {
  let out = "Code under review:\n\n";
  for (const f of files) {
    out += "## File: " + f.name + "\n```\n" + f.text + "\n```\n\n";
  }
  if (truncated) out += "\n(Note: the input was large; this is the part that fit in the model window.)\n";
  out += "\nReview the code above. Cite line numbers, keep it actionable.";
  return out;
}

function buildSiteMessage(g) {
  let out = "Website under audit:\n\n";
  out += "- Final URL: " + g.url + "\n";
  out += "- HTTP status: " + g.status + "\n";
  out += "- Content type: " + (g.contentType || "unknown") + "\n";
  out += "- Page size: " + (g.bytes || 0) + " bytes\n";
  if (g.title) out += "- Title: " + g.title + "\n";
  if (g.desc) out += "- Meta description: " + g.desc + "\n";
  if (g.metas && g.metas.length) out += "\n## Meta tags\n" + g.metas.map((m) => "- `" + m + "`").join("\n") + "\n";
  if (g.styles && g.styles.length) out += "\n## Stylesheets loaded\n" + g.styles.map((s) => "- " + s).join("\n") + "\n";
  if (g.scripts && g.scripts.length) out += "\n## Scripts loaded\n" + g.scripts.map((s) => "- " + s).join("\n") + "\n";
  if (g.forms && g.forms.length) out += "\n## Forms (" + g.forms.length + ")\n" + g.forms.map((f) => "- `" + f + "`").join("\n") + "\n";
  if (g.inputs && g.inputs.length) out += "\n## Input elements\n" + g.inputs.map((i) => "- `" + i + "`").join("\n") + "\n";
  if (g.iframes && g.iframes.length) out += "\n## Iframes\n" + g.iframes.map((i) => "- " + i).join("\n") + "\n";
  if (g.links && g.links.length) out += "\n## Links found\n" + g.links.map((l) => "- " + l).join("\n") + "\n";
  if (g.text) out += "\n## Visible page text\n\n" + g.text + "\n";
  out += "\nAudit the page above for web vulnerabilities. Quote the actual URLs, attribute names and strings you found. Keep it actionable.";
  return out;
}

/* ---------------- source files state ---------------- */

let loadedFiles = null;
let lastFileName = "input.ts";
let lastRepoBranch = "";

function currentFiles() {
  if (loadedFiles && loadedFiles.length) return loadedFiles;
  return [{ name: lastFileName, text: codeEl.value }];
}
function hasMultiple() { return !!loadedFiles && loadedFiles.length > 1; }

function setEditorFiles(files) {
  loadedFiles = files;
  if (files && files.length) {
    codeEl.value = files[0].text;
    lastFileName = files[0].name;
  }
  renderGutter(codeEl.value.split(/\r?\n/), []);
  $("fileLabel").textContent = files && files.length > 1 ? files.length + " files loaded" : "";
}

const SAMPLES = {
  demo: {
    label: "TypeScript API handler",
    file: "src/demo.ts",
    code:
      'import { db } from "./db";\n' +
      'import { helper } from "./helper";\n' +
      "\n" +
      "export async function getUser(id: string) {\n" +
      "  const user = db.users.find((u) => u.id === id);\n" +
      '  const apiKey = "sk-live-9f2c1a5b8e4d7a0c3f6e9b1d2a4c7e8f";\n' +
      "  const token = process.env.AUTH_TOKEN;\n" +
      "  try {\n" +
      '    await fetch(`https://api.example.com/user/${user.email}`);\n' +
      "  } catch (e) {}\n" +
      '  const webhook = "https://example.com/your-secret-endpoint";\n' +
      "  await new Promise((r) => setTimeout(r, 5000));\n" +
      "  return { ...user, apiKey };\n" +
      "}\n" +
      "\n" +
      'console.log("debug: loaded user", user);\n',
  },
  flask: {
    label: "Python Flask app",
    file: "app.py",
    code:
      "import os\n" +
      "from flask import Flask, request\n" +
      "\n" +
      "app = Flask(__name__)\n" +
      "\n" +
      'ADMIN_PASSWORD = "hunter2-rotate-me"\n' +
      "\n" +
      '@app.route("/exec")\n' +
      "def exec_cmd():\n" +
      '    host = request.args.get("host", "localhost")\n' +
      '    output = os.popen("ping -c 1 " + host).read()\n' +
      "    return output\n" +
      "\n" +
      '@app.route("/login")\n' +
      "def login():\n" +
      '    user = db.users.find_one(request.form["username"])\n' +
      "    if user[\"password\"] == ADMIN_PASSWORD:\n" +
      '        return "welcome"\n' +
      "    try:\n" +
      "        pass\n" +
      "    except Exception:\n" +
      "        pass\n",
  },
  node: {
    label: "Node.js server",
    file: "server.js",
    code:
      'import http from "http";\n' +
      'import fs from "fs";\n' +
      'import { sign } from "jsonwebtoken";\n' +
      "\n" +
      'const JWT_SECRET = "jwt-secret-change-me";\n' +
      "\n" +
      "http.createServer((req, res) => {\n" +
      '  const page = fs.readFileSync(req.url).toString();\n' +
      '  const token = sign({ role: "admin" }, JWT_SECRET);\n' +
      '  res.end(`<script>var tok="${token}";</script>` + page);\n' +
      '}).listen(process.env.PORT ?? 3000);\n' +
      "\n" +
      '// TODO: add rate limiting and auth middleware\n',
  },
  shell: {
    label: "Deploy shell script",
    file: "deploy.sh",
    code:
      "#!/bin/sh\n" +
      "set -e\n" +
      '\nDEPLOY_KEY="sk-live-deploy-8d4f2a1c"\n' +
      'eval "$(curl -s https://example.com/script)"\n' +
      'ssh deploy@server "git pull && npm run build" || exit 1\n' +
      'echo "deployed ok"\n' +
      "echo \"api key: $DEPLOY_KEY\"\n" +
      "# FIXME: add rollback on failed build\n",
  },
  go: {
    label: "Go CLI tool",
    file: "main.go",
    code:
      "package main\n" +
      "\n" +
      'import (\n\t"fmt"\n\t"net/http"\n\t"os"\n)\n' +
      "\n" +
      "func main() {\n" +
      '\tresp, err := http.Get(os.Getenv("REPO_ENDPOINT"))\n' +
      "\t_ = err\n" +
      '\tfmt.Println("status:", resp.StatusCode)\n' +
      "\t// FIXME: retry with backoff, then log properly\n" +
      "}\n",
  },
  config: {
    label: "Config with secrets",
    file: "settings.json",
    code:
      '{\n' +
      '  "database": {\n' +
      '    "host": "db.prod.internal",\n' +
      '    "password": "prod-db-pass-2024"\n' +
      "  },\n" +
      '  "api": {\n' +
      '    "key": "your-api-key",\n' +
      '    "webhook": "https://example.com/your-secret-endpoint"\n' +
      "  },\n" +
      '  "debug": true\n' +
      "}\n",
  },
};

function renderSampleSelect() {
  const sel = $("sampleSel");
  sel.innerHTML = Object.keys(SAMPLES)
    .map((k) => `<option value="${k}">${ESC(SAMPLES[k].label)}</option>`)
    .join("");
  sel.value = "demo";
}

/* ---------------- rendering: static findings ---------------- */

function renderFindings(findings) {
  const errs = findings.filter((f) => f.sev === "error").length;
  const warns = findings.filter((f) => f.sev === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - errs * 15 - warns * 5));
  const fillColor = score > 66 ? "var(--green)" : score > 33 ? "var(--yellow)" : "var(--red)";
  let html = "";
  let lastFile = null;
  for (const f of findings) {
    if (f.file !== lastFile) {
      lastFile = f.file;
      html += `<div class="out-file">${ESC(f.file)}</div>`;
    }
    const mark = f.sev === "error" ? '<span class="err-marker">✘</span>' : '<span class="warn-marker">⚠</span>';
    html += `<div class="out-line"><span class="ln">${f.line}</span><span class="out-marker">${mark}</span><span class="out-rule">[${f.rule}]</span><span class="out-text">${ESC(f.message)}</span></div>`;
    html += `<span class="out-snippet">${ESC(f.snippet || "") || " "}</span>`;
  }
  const verdict =
    errs > 0
      ? `<div class="verdict blocked">✘ BLOCKED — ${errs} error${errs === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}. Fix what is red.</div>`
      : warns > 0
        ? `<div class="verdict warned">△ passed with warnings — ${warns} warning${warns === 1 ? "" : "s"}. Clean enough to merge, dirty enough to read first.</div>`
        : `<div class="verdict clean">✓ clean — nothing suspicious found.</div>`;
  html += `<div class="out-summary"><b class="${errs ? "err" : ""}">${errs} error${errs === 1 ? "" : "s"}</b> · <b class="${warns ? "warn" : ""}">${warns} warning${warns === 1 ? "" : "s"}</b><div class="gauge-row"><div class="gauge"><div class="gauge-fill" style="width:${score}%;background:${fillColor}"></div></div><span class="gauge-score">${score}/100</span></div>${verdict}</div>`;
  return html;
}

function findingsToMarkdown(files, findings) {
  let md = "# vibeguard static scan report\n\n";
  md += "- Generated: " + new Date().toISOString() + "\n- Files scanned: " + files.length + "\n- Findings: " + findings.length + "\n\n";
  if (!findings.length) { md += "No issues found.\n"; return md; }
  md += "| Severity | File | Line | Rule | Issue |\n|---|---|---|---|---|\n";
  for (const f of findings) md += `| ${f.sev} | ${f.file} | ${f.line} | ${f.rule} | ${f.message} |\n`;
  return md;
}

/* ---------------- gutter ---------------- */

function renderGutter(lines, findings) {
  const marks = new Map();
  for (const f of findings) {
    const cur = marks.get(f.line) || 0;
    marks.set(f.line, f.sev === "error" ? 2 : cur < 2 ? 1 : cur);
  }
  let html = "";
  for (let i = 0; i < lines.length; i++) {
    const mark = marks.get(i + 1);
    const cls = mark === 2 ? "has-err" : mark === 1 ? "has-warn" : "";
    const glyph = mark === 2 ? "✘" : mark === 1 ? "⚠" : "";
    html += `<div class="${cls}">${i + 1}<span class="mark">${glyph}</span></div>`;
  }
  gutterEl.innerHTML = html;
  syncGutter();
}
function syncGutter() { gutterEl.scrollTop = codeEl.scrollTop; }
function cursorLine() {
  const pos = codeEl.selectionStart;
  let n = 0;
  for (let i = 0; i < pos; i++) if (codeEl.value[i] === "\n") n++;
  gutterEl.querySelectorAll("div").forEach((d, i) => d.classList.toggle("cur", i === n));
}

/* ---------------- run ---------------- */

let activeMode = "static";
let lastReport = null;

function setMode(mode) {
  activeMode = mode;
  document.querySelectorAll(".mode-tab").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("runHint").textContent = MODES[mode].hint;
  titleEl.textContent = MODES[mode].label;
  verdictEl.innerHTML = "";
  const siteTerm = $("siteTerminal");
  if (siteTerm) siteTerm.hidden = mode !== "site";
}

function setStatus(text, cls) {
  statusEl.textContent = text || "";
  statusEl.className = "res-status" + (cls ? " " + cls : "");
}

async function run() {
  const mode = MODES[activeMode];
  if (!mode.ai) return runStatic();
  if (activeMode === "site") return scanSite();
  return runAI();
}

function runStatic() {
  const target = currentFiles();
  const findings = scanFiles(target, { newFile: !hasMultiple() });
  const marks = target.length === 1 ? findings.filter((f) => f.file === target[0].name) : [];
  renderGutter(codeEl.value.split(/\r?\n/), marks);
  titleEl.textContent = MODES.static.label + (target.length > 1 ? " · " + target.length + " files" : "");
  if (!target[0].text.trim()) {
    outputEl.innerHTML = '<div class="empty">// add some code first.</div>';
    verdictEl.innerHTML = "";
    setStatus("waiting for input");
    lastReport = null;
    return;
  }
  const html = renderFindings(findings);
  outputEl.innerHTML = html;
  setStatus(target.length + " file" + (target.length === 1 ? "" : "s") + " scanned · " + findings.length + " finding" + (findings.length === 1 ? "" : "s"), findings.some((f) => f.sev === "error") ? "" : "");
  lastReport = { type: "static", mode: "static", files: target.length, findings: findings.length, markdown: findingsToMarkdown(target, findings) };
}

async function runAI() {
  const target = currentFiles();
  const text = codeEl.value.trim();
  if (!text && !target.length) { toast("Add some code first.", "err"); return; }
  let files = target;
  let truncated = false;
  let total = files.reduce((n, f) => n + f.text.length, 0);
  if (total > 50000) {
    const capped = [];
    let n = 0;
    for (const f of files) {
      if (n >= 50000) break;
      const take = f.text.slice(0, 50000 - n);
      capped.push({ name: f.name, text: take });
      n += take.length + f.name.length + 6;
    }
    files = capped;
    truncated = true;
  }
  const p = providerOf(settings.provider);
  titleEl.textContent = MODES[activeMode].label + " · " + p.name;
  setStatus(settings.model ? "running " + settings.model + " …" : "resolving best model…", "loading");
  outputEl.innerHTML = '<div class="empty">// AI is reading ' + files.length + " file" + (files.length === 1 ? "" : "s") + " and scanning for issues…</div>";
  verdictEl.innerHTML = "";
  const messages = [
    { role: "system", content: SYSTEM[activeMode] },
    { role: "user", content: buildUserMessage(files, truncated) },
  ];
  try {
    const data = await callAI(messages);
    const html = riskBadges(mdRender(data.content));
    outputEl.innerHTML = html;
    setStatus("via " + data.model, "");
    verdictEl.innerHTML = `<div class="verdict clean">AI review complete — generated by ${ESC(p.name)}</div>`;
    lastReport = {
      type: "ai", mode: activeMode, provider: p.name, model: data.model,
      markdown: data.content, files: files.map((f) => f.name),
      ts: new Date().toISOString(), temperature: settings.temp,
    };
  } catch (e) {
    setStatus("failed");
    verdictEl.innerHTML = `<div class="verdict blocked">Scan failed</div>`;
    outputEl.innerHTML = `<div class="empty">// ${ESC(e.message)}</div>`;
    lastReport = null;
    toast(e.message, "err");
  }
}

/* ---------------- Site Sentinel: live web scan ---------------- */

async function scanSite() {
  const url = $("siteUrl").value.trim();
  if (!url) { toast("Enter a website URL to scan.", "err"); $("siteUrl").focus(); return; }
  const p = providerOf(settings.provider);
  if (!getKey(p.id)) { toast("Paste a free API key first — click the provider panel above.", "err"); return; }
  const statusEl = $("siteStatus");
  titleEl.textContent = MODES.site.label + " · " + p.name;
  setStatus("resolving " + url + " …", "loading");
  statusEl.textContent = "resolving host…";
  statusEl.className = "gh-status";
  outputEl.innerHTML = '<div class="empty">// Site Sentinel is resolving the page…</div>';
  verdictEl.innerHTML = "";
  try {
    const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fetch", url }) });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data || !data.ok) throw new Error((data && data.error && data.error.message) || "Could not fetch the site (status " + res.status + ").");
    statusEl.textContent = data.status + " · " + (data.bytes || 0) + " bytes · " + (data.contentType || "html");
    statusEl.className = "gh-status ok";
    setStatus("page grabbed · AI auditing " + (data.title ? ESC(data.title).slice(0, 48) : data.url) + "…", "loading");
    outputEl.innerHTML = '<div class="empty">// analyzing ' + ESC(data.url) + " — " + ESC((data.title || "no <title>").slice(0, 60)) + "…</div>";
    const ai = await callAI([
      { role: "system", content: SYSTEM.site },
      { role: "user", content: buildSiteMessage(data) },
    ]);
    outputEl.innerHTML = riskBadges(mdRender(ai.content));
    setStatus("via " + ai.model, "");
    verdictEl.innerHTML = `<div class="verdict clean">Site Sentinel review complete — generated by ${ESC(p.name)}</div>`;
    lastReport = {
      type: "ai", mode: "site", provider: p.name, model: ai.model,
      markdown: ai.content, url: data.url, title: data.title || "",
      ts: new Date().toISOString(), temperature: settings.temp,
    };
  } catch (e) {
    statusEl.textContent = "";
    setStatus("failed");
    verdictEl.innerHTML = `<div class="verdict blocked">Scan failed</div>`;
    outputEl.innerHTML = `<div class="empty">// ${ESC(e.message)}</div>`;
    lastReport = null;
    toast(e.message, "err");
  }
}

/* ---------------- sample / upload / github ---------------- */

function loadSample(key) {
  const s = SAMPLES[key] || SAMPLES.demo;
  setEditorFiles([{ name: s.file, text: s.code }]);
  if (activeMode !== "static") setMode("static");
  runStatic();
  scrollToStudio();
}

function handleFiles(fileList) {
  const files = [];
  let pending = Array.from(fileList).length;
  Array.from(fileList).forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      files.push({ name: file.name, text: String(reader.result || "") });
      if (--pending === 0) {
        if (!files.length) return;
        setEditorFiles(files);
        if (activeMode !== "static") setMode("static");
        runStatic();
        toast(files.length + " file" + (files.length === 1 ? "" : "s") + " loaded", "ok");
      }
    };
    reader.readAsText(file);
  });
}

function parseGhUrl(url) {
  const m = String(url).trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function fetchRepo(url, runAfter) {
  const gh = parseGhUrl(url);
  if (!gh) { $("ghStatus").textContent = "Enter a valid public GitHub repo URL, like github.com/owner/repo"; $("ghStatus").className = "gh-status err"; return; }
  $("ghStatus").textContent = "Resolving repo…";
  $("ghStatus").className = "gh-status";
  const MAX_BLOB = 2_000_000;
  const MAX_FILE_CHARS = 120000;
  const MAX_TOTAL_CHARS = 700000;
  try {
    const metaRes = await fetch("https://api.github.com/repos/" + gh.owner + "/" + gh.repo);
    if (!metaRes.ok) throw new Error("Repo not found or not public (HTTP " + metaRes.status + ").");
    const meta = await metaRes.json();
    const branch = meta.default_branch || "main";
    lastRepoBranch = branch;
    const treeRes = await fetch("https://api.github.com/repos/" + gh.owner + "/" + gh.repo + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1");
    if (!treeRes.ok) throw new Error("Could not list repo files (HTTP " + treeRes.status + ").");
    const tree = await treeRes.json();
    const codeFiles = (tree.tree || [])
      .filter((t) => t.type === "blob" && CODE_EXTS.test(t.path) && !isTestFile(t.path) && (!t.size || t.size <= MAX_BLOB))
      .map((t) => t.path)
      .slice(0, 30);
    if (!codeFiles.length) throw new Error("No code files found in that repo.");
    $("ghStatus").textContent = "Fetching " + codeFiles.length + " files…";
    const files = [];
    let totalChars = 0;
    let skipped = 0;
    let truncated = 0;
    const prefix = "https://raw.githubusercontent.com/" + gh.owner + "/" + gh.repo + "/" + encodeURIComponent(branch) + "/";
    for (let i = 0; i < codeFiles.length; i++) {
      const p = codeFiles[i];
      try {
        const r = await fetch(prefix + p.split("/").map(encodeURIComponent).join("/"));
        if (r.ok) {
          const cl = r.headers.get("content-length");
          if (cl && +cl > MAX_BLOB) { skipped++; continue; }
          const t = await r.text();
          if (t.length > MAX_FILE_CHARS) truncated++;
          files.push({ name: p, text: t.slice(0, MAX_FILE_CHARS) });
          totalChars += Math.min(t.length, MAX_FILE_CHARS);
          if (totalChars >= MAX_TOTAL_CHARS) break;
        }
      } catch (e) { /* skip unreadable file */ }
    }
    if (!files.length) throw new Error("Could not read any files from the repo.");
    setEditorFiles(files);
    const extra = [];
    if (skipped) extra.push(skipped + " skipped (too large)");
    if (truncated) extra.push(truncated + " truncated to fit");
    $("ghStatus").textContent = gh.owner + "/" + gh.repo + " · " + files.length + " file" + (files.length === 1 ? "" : "s") + (extra.length ? " · " + extra.join(", ") : "");
    $("ghStatus").className = "gh-status ok";
    if (activeMode !== "static") setMode("static");
    runStatic();
    if (runAfter) runAfter();
    toast("Repo loaded: " + gh.owner + "/" + gh.repo, "ok");
  } catch (e) {
    $("ghStatus").textContent = e.message;
    $("ghStatus").className = "gh-status err";
    toast(e.message, "err");
  }
}

function scrollToStudio() {
  $("studio").scrollIntoView({ behavior: "smooth" });
}

/* ---------------- downloads ---------------- */

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

function currentReportText() {
  if (lastReport && lastReport.markdown) return lastReport.markdown;
  if (activeMode === "static") return findingsToMarkdown(currentFiles(), scanFiles(currentFiles(), { newFile: !hasMultiple() }));
  return "";
}

function downloadHtml(reportMd) {
  const title = "vibeguard report — " + (lastReport && lastReport.type === "ai" ? lastReport.mode : "static scan") + " · " + new Date().toISOString().slice(0, 10);
  const html =
    "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + ESC(title) + "</title>" +
    "<style>body{font-family:Inter,system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1a2233;background:#fff}h1,h2,h3{border-bottom:1px solid #e3e8f0;padding-bottom:6px}pre{background:#0d1520;color:#dbe6f4;padding:14px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8dee9;padding:7px 10px;text-align:left;font-size:.94em}th{background:#f1f5fb}blockquote{border-left:3px solid #22d3ee;margin:0;padding-left:14px;color:#55607a}.risk-high{color:#c0392b;font-weight:700}.risk-med{color:#b8860b;font-weight:700}.risk-low{color:#1e8449;font-weight:700}hr{border:none;border-top:1px solid #e3e8f0}</style></head><body>" +
    riskBadges(mdRender(reportMd)) +
    "</body></html>";
  download("vibeguard-report.html", html, "text/html;charset=utf-8");
}

function downloadJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    type: lastReport ? lastReport.type : "static",
    mode: activeMode,
    provider: lastReport ? lastReport.provider : null,
    model: lastReport ? lastReport.model : null,
    files: lastReport ? lastReport.files : currentFiles().map((f) => f.name),
    report: currentReportText(),
  };
  download("vibeguard-report.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

/* ---------------- dynamic sections ---------------- */

const FEATURES = [
  { t: "Instant static scanner", d: "Ten deterministic rules catch the classic false-clean bugs — empty catches, null derefs, leaked keys, invented env vars. Zero setup, zero AI, runs entirely in your browser." },
  { t: "AI bug finder", d: "A connected free model deep-reads your code for logic errors, race conditions, error-handling gaps and wrong API usage — with line-level fixes." },
  { t: "Security audit", d: "OWASP-style review: injection, XSS, SSRF, hardcoded secrets, auth flaws, path traversal, unsafe deserialization and dependency risks." },
  { t: "Fix & explain", d: "AI rewrites the problematic code and explains exactly what changed and why. Every scan doubles as a code review lesson." },
  { t: "API & deployment review", d: "Catches env-var holes, missing retries and backoff, swallowed errors, CORS and auth misconfigs, secret logging and unsafe production defaults." },
  { t: "Full audit report", d: "One executive-ready report with risk score, severity table, detailed findings, code fixes and a prioritized action plan." },
  { t: "Works with any free AI", d: "Gemini, Groq, OpenRouter, Cerebras, Mistral, GitHub Models or NVIDIA — paste a free key and scan. No credit card required for most." },
  { t: "Scan code every way", d: "Paste a snippet, upload multiple files, or pull a whole public GitHub repository and batch-scan every file." },
  { t: "Private by design", d: "No account, no login, no telemetry. Keys live in your browser; code goes only to the AI provider you chose." },
];
const ICONS = [
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4v16h16v-7"/><path d="M17 4h3v3M13.5 10.5L21 3"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v5c0 5-3 9-7 10-4-1-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l6-6-6-6M12 19h8"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
];

const STEPS = [
  { t: "Connect a free AI model", d: "Pick a provider (Gemini, Groq, OpenRouter, Cerebras, Mistral, GitHub Models, NVIDIA), click Get key, and paste it in. Every one has a genuinely free tier." },
  { t: "Add your code", d: "Paste a snippet, upload files, or drop a public GitHub repo URL. The static scanner works instantly on anything — no key needed." },
  { t: "Scan and fix", d: "Run any of six modes. Static rules catch the obvious fast; AI audits for deep bugs, vulnerabilities and deployment risks, with fixes." },
  { t: "Get the report", d: "Download the full report as Markdown, styled HTML, or JSON. Share it with your team, attach it to a ticket, or file it with your release." },
];

const FAQ = [
  { q: "Which AI models can I use?", a: "Any of the free tiers: Google Gemini, Groq, OpenRouter, Cerebras, Mistral, GitHub Models, NVIDIA NIM — or any OpenAI-compatible endpoint via the Custom option. Click a provider card below for the exact link to create a free key." },
  { q: "Is my API key safe?", a: "Yes. Keys are stored only in your browser's local storage and are sent directly to the AI provider through a stateless relay. The relay never logs or stores your key, and it only forwards to a whitelist of provider endpoints." },
  { q: "Is this really free?", a: "The tool is free forever — no account, no login, no payment. The AI models run on each provider's free tier using the key you paste. The static scanner needs no key at all." },
  { q: "Does it upload my code anywhere?", a: "The static scan is 100% local — nothing leaves your browser. AI modes send your code only to the AI provider you explicitly chose, using your own key." },
  { q: "Can I use it without any AI key?", a: "Yes. The Static scan mode and the GitHub/upload/paste tooling all work with zero configuration. Add a free key only when you want AI analysis, fixes and reports." },
  { q: "Do I need GitHub?", a: "No. Pasting code or uploading files works without any account. Fetching a public GitHub repo is a convenience that also needs no login." },
];

function renderSections() {
  $("featuresGrid").innerHTML = FEATURES.map((f, i) => `<div class="why-card"><h3><span class="feat-ico">${ICONS[i]}</span>${ESC(f.t)}</h3><p>${ESC(f.d)}</p></div>`).join("");
  $("steps").innerHTML = STEPS.map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><div class="step-name">${ESC(s.t)}</div><div class="step-text">${ESC(s.d)}</div></div>`).join("");
  $("providerGrid").innerHTML = PROVIDERS.filter((p) => p.id !== "custom").map((p) =>
    `<div class="pcard">
      <div class="pcard-head"><div class="pbadge" style="background:${p.color};color:#fff">${ESC(p.name.slice(0, 1))}</div><div><h3>${ESC(p.name)}</h3><span class="pfree">${ESC(p.free)}</span></div></div>
      <p class="pnote">${ESC(p.note)}</p>
      <div class="pmodels">${p.models.slice(0, 4).map((m) => `<span>${ESC(m)}</span>`).join("")}</div>
      <a class="pcta" href="${p.keyLink}" target="_blank" rel="noopener">${ESC(p.keyLabel)} →</a>
    </div>`).join("");
  $("faqList").innerHTML = FAQ.map((f) => `<details class="faq"><summary>${ESC(f.q)}</summary><p>${ESC(f.a)}</p></details>`).join("");
}

const SAMPLE_REPORT = [
  "# Security Analysis Results",
  "",
  "**Target:** src/api/auth.ts · **Mode:** Security audit · **Model:** gemini-2.5-flash",
  "",
  "## Risk Score: 78/100",
  "",
  "Three issues need attention before this ships. The critical one is a hardcoded credential that will be picked up by automated scanning tools within hours of being pushed.",
  "",
  "## Findings",
  "",
  "| Severity | Location | Vulnerability | Fix |",
  "|---|---|---|---|",
  "| Critical | src/api/auth.ts:12 | Hardcoded API key in source | Move to an env var, load via config, add to .env.example |",
  "| High | src/api/auth.ts:41 | Null deref — `user.find()` result used without a check | Use optional chaining (`user?.email`) or a null guard |",
  "| High | src/api/auth.ts:28 | Empty `catch {}` swallows the failure | Log the error and rethrow or handle it explicitly |",
  "| Medium | src/api/auth.ts:9 | `process.env.AUTH_TOKEN` read with no fallback and no entry in `.env.example` | Declare the variable and validate it at startup |",
  "| Low | src/api/auth.ts:33 | `console.log` left in production path | Remove or route through a logger |",
  "",
  "## Recommended fixes",
  "",
  "```ts",
  "const token = process.env.AUTH_TOKEN;",
  "if (!token) throw new Error(\"AUTH_TOKEN is not set\");",
  "",
  "const user = db.users.find((u) => u.id === id);",
  "if (!user) return res.status(404).json({ error: \"not found\" });",
  "```",
  "",
  "## Priority order",
  "",
  "1. Remove the hardcoded key and rotate it now.",
  "2. Guard the nullable lookup before it crashes in production.",
  "3. Never swallow errors in a catch block.",
  "",
].join("\n");

function renderSample() {
  $("sampleContent").innerHTML = riskBadges(mdRender(SAMPLE_REPORT));
}

/* ---------------- events ---------------- */

function bindEvents() {
  $("providerToggle").addEventListener("click", () => {
    const open = $("providerPanel").classList.toggle("open");
    $("providerBody").hidden = !open;
    $("providerToggle").setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("providerSel").addEventListener("change", (e) => {
    settings.provider = e.target.value;
    settings.model = "";
    saveSettings(settings);
    syncProviderUI();
    if (getKey(settings.provider)) refreshModels(true);
  });
  $("modelSel").addEventListener("change", (e) => {
    settings.model = e.target.value;
    saveSettings(settings);
  });
  $("btnModels").addEventListener("click", () => refreshModels(false));
  $("apiKey").addEventListener("input", (e) => {
    setKey(settings.provider, e.target.value.trim());
    updateProviderState();
  });
  $("btnKeyToggle").addEventListener("click", () => {
    const inp = $("apiKey");
    const isPw = inp.type === "password";
    inp.type = isPw ? "text" : "password";
    $("btnKeyToggle").textContent = isPw ? "hide" : "show";
  });
  $("temp").addEventListener("input", (e) => {
    settings.temp = parseFloat(e.target.value);
    $("tempVal").textContent = settings.temp.toFixed(1);
    saveSettings(settings);
  });
  $("customBase").addEventListener("input", (e) => { settings.customBase = e.target.value.trim(); saveSettings(settings); });
  $("customModel").addEventListener("input", (e) => { settings.customModel = e.target.value.trim(); saveSettings(settings); });

  $("btnTestKey").addEventListener("click", async () => {
    const p = providerOf(settings.provider);
    if (!getKey(p.id)) { toast("Paste a key first.", "err"); return; }
    $("btnTestKey").disabled = true;
    setStatus("testing connection…", "loading");
    try {
      const data = await callAI([{ role: "user", content: "Reply with exactly: PONG" }], { max_tokens: 300 });
      if (p.id !== "custom" && data.model) { modelChoice[p.id] = data.model; saveSettings(settings); renderModelSelect(); }
      toast("Connected to " + p.name + " — " + (data.model || "auto model"), "ok");
      setStatus("connected via " + (data.model || "auto model"));
      updateProviderState();
    } catch (e) {
      toast(e.message, "err");
      setStatus("connection failed");
    } finally {
      $("btnTestKey").disabled = false;
    }
  });

  document.querySelectorAll(".mode-tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("btnRun").addEventListener("click", run);

  $("btnSample").addEventListener("click", () => loadSample($("sampleSel").value));
  $("btnExpand").addEventListener("click", () => {
    const box = document.querySelector(".editor");
    const expanded = box.classList.toggle("expanded");
    $("btnExpand").textContent = expanded ? "Collapse editor" : "Expand editor";
    box.querySelector("textarea").focus();
  });
  $("btnClear").addEventListener("click", () => {
    codeEl.value = "";
    loadedFiles = null;
    renderGutter([], []);
    outputEl.innerHTML = '<div class="empty">// cleared.</div>';
    verdictEl.innerHTML = "";
    setStatus("");
    lastReport = null;
    $("fileLabel").textContent = "";
    $("ghStatus").textContent = "";
    codeEl.focus();
  });
  $("btnUpload").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", (e) => { if (e.target.files && e.target.files.length) handleFiles(e.target.files); e.target.value = ""; });
  $("btnFetchGh").addEventListener("click", () => { const u = $("ghUrl").value.trim(); if (u) fetchRepo(u); });
  $("ghUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("btnFetchGh").click(); } });
  $("btnScanSite").addEventListener("click", () => scanSite());
  $("siteUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("btnScanSite").click(); } });

  codeEl.addEventListener("input", () => {
    if (loadedFiles) loadedFiles = null;
    const lines = codeEl.value.split(/\r?\n/);
    renderGutter(lines, []);
  });
  codeEl.addEventListener("scroll", syncGutter);
  codeEl.addEventListener("click", cursorLine);
  codeEl.addEventListener("keyup", cursorLine);
  codeEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
  });

  $("btnCopy").addEventListener("click", async () => {
    const text = currentReportText();
    if (!text) { toast("Nothing to copy yet.", "err"); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast("Report copied to clipboard.", "ok");
    } catch (e) {
      toast("Could not access the clipboard.", "err");
    }
  });
  $("btnDlMd").addEventListener("click", () => {
    const text = currentReportText();
    if (!text) { toast("Nothing to download yet.", "err"); return; }
    download("vibeguard-report.md", text, "text/markdown;charset=utf-8");
  });
  $("btnDlHtml").addEventListener("click", () => {
    const text = currentReportText();
    if (!text) { toast("Nothing to download yet.", "err"); return; }
    downloadHtml(text);
  });
  $("btnDlJson").addEventListener("click", downloadJson);

  $("heroScan").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = $("heroRepo").value.trim();
    if (!u) { scrollToStudio(); codeEl.focus(); return; }
    $("ghUrl").value = u;
    scrollToStudio();
    if (activeMode !== "static") setMode("static");
    fetchRepo(u);
  });
  document.querySelectorAll("[data-chip]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const chip = a.dataset.chip;
      if (chip === "sample") loadSample($("sampleSel").value);
      else if (chip === "upload") { scrollToStudio(); $("fileInput").click(); }
      else scrollToStudio();
    });
  });

  window.addEventListener("scroll", () => $("nav").classList.toggle("scrolled", window.scrollY > 12), { passive: true });
}

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll("section.section > h2, section.section > p.section-sub, .why-card, .step, .pcard, .faq, .sample-report").forEach((el) => {
    el.classList.add("reveal");
    io.observe(el);
  });
  document.querySelector(".hero").classList.add("reveal", "in");
}

renderProviderSelect();
renderSampleSelect();
renderSections();
renderSample();
bindEvents();
setMode("static");
$("temp").value = settings.temp;
$("tempVal").textContent = settings.temp.toFixed(1);
syncProviderUI();
renderGutter([], []);
initReveal();
setEditorFiles([{ name: SAMPLES.demo.file, text: SAMPLES.demo.code }]);
runStatic();
