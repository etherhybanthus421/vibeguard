/* vibeguard web demo — a faithful client-side port of the CLI's 10 rules.
   Everything runs in your browser. Nothing is uploaded. No telemetry.
   built by @thesajidalam */

const $ = (id) => document.getElementById(id);
const codeEl = $("code");
const outputEl = $("output");
const gutterEl = $("gutter");
const statusEl = $("status");
const titleEl = $("termTitle");
const rulesGrid = $("rulesGrid");

const ESC = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripComments(text) {
  const strings = [];
  const masked = text.replace(
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
    (m) => {
      strings.push(m);
      return `\u0000${strings.length - 1}\u0001`;
    }
  );
  const clean = masked
    .replace(/\/\/.*$/g, "")
    .replace(/#.*$/g, "")
    .replace(/<!--.*?-->/gs, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return clean.replace(/\u0000(\d+)\u0001/g, (_, i) => strings[+i]);
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
const SECRET_ASSIGN_PATTERNS = [
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
  { name: "setTimeout-based wait", re: /await\s+new\s+Promise\s*\(\s*\(?r\)?\s*=>\s*setTimeout\s*\([^)]*r\s*,/ },
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

const RULES = [
  {
    id: "secret", sev: "error",
    title: "Hardcoded secrets",
    desc: "OpenAI keys, GitHub PATs, AWS keys, JWTs, private keys — flagged the second they land in a diff.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        let flagged = false;
        for (const p of SECRET_PATTERNS) {
          const m = text.match(p.re);
          if (m && !isPlaceholderValue(m[0])) {
            push(i + 1, this.id, `hardcoded ${p.name} "${trimToken(m[0])}"`, this.sev);
            flagged = true;
            break;
          }
        }
        if (flagged) continue;
        for (const p of SECRET_ASSIGN_PATTERNS) {
          const m = text.match(p.re);
          if (m && !isPlaceholderValue(text)) {
            push(i + 1, this.id, `${p.name} "${trimToken(m[0])}"`, this.sev);
            break;
          }
        }
      }
    },
  },
  {
    id: "envhole", sev: "error",
    title: "Invented env vars",
    desc: "Reads process.env / os.getenv with no default and no fallback — the classic LLM hallucination.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        const code = stripComments(lines[i]);
        for (const reader of ENV_READERS) {
          reader.re.lastIndex = 0;
          let m;
          while ((m = reader.re.exec(code)) !== null) {
            const key = m[1];
            if (!key || BUILTIN_ENV.has(key)) continue;
            if (reader.needsDefault && m[2] !== undefined) continue;
            const after = code.slice(reader.re.lastIndex);
            if (/\?\?|\|\|/.test(after)) continue;
            push(i + 1, this.id, `reads "${key}" but it is never declared and has no fallback — add it to your .env.example`, this.sev);
            break;
          }
          if (findingsLen(push._list, i + 1, this.id)) break;
        }
      }
    },
  },
  {
    id: "swallow", sev: "error",
    title: "Empty catch blocks",
    desc: "catch {} / except: pass silently erases failures. The most common 'looks fixed' pattern in AI output.",
    run(lines, push) {
      let pending = null;
      let pyPending = null;
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (CATCH_EMPTY_SINGLE.test(text) || CATCH_EMPTY_SINGLE2.test(text)) {
          push(i + 1, this.id, "empty catch block — a failure just got silently erased", this.sev);
          continue;
        }
        if (EXCEPT_EMPTY_SINGLE.test(text)) {
          push(i + 1, this.id, "except branch only passes — the failure is being eaten silently", this.sev);
          continue;
        }
        if (CATCH_OPEN.test(text) || CATCH_OPEN2.test(text)) {
          pending = { line: i + 1, depth: 1, foundCode: false };
          continue;
        }
        if (pending) {
          const stripped = text.replace(/\/\/.*$/g, "").trim();
          for (const ch of stripped) {
            if (ch === "{") pending.depth++;
            else if (ch === "}") pending.depth--;
          }
          if (stripped.length > 0 && !/^[\{\}]+$/.test(stripped)) pending.foundCode = true;
          if (pending.depth <= 0) {
            if (!pending.foundCode) push(pending.line, this.id, "empty catch block — a failure just got silently erased", this.sev);
            pending = null;
          }
          continue;
        }
        if (EXCEPT_OPEN.test(text)) { pyPending = { line: i + 1 }; continue; }
        if (pyPending) {
          const stripped = text.replace(/#.*$/g, "").trim();
          if (stripped !== "") {
            if (/^pass\b/.test(stripped)) push(pyPending.line, this.id, "except branch only passes — the failure is being eaten silently", this.sev);
            pyPending = null;
          }
        }
      }
    },
  },
  {
    id: "nullaccess", sev: "error",
    title: "Null derefs",
    desc: "Results of .find() / .querySelector() / JSON.parse() accessed with '.' but never checked for null.",
    run(lines, push) {
      const risky = new Map();
      const checked = new Set();
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        const m = text.match(DECL_RISKY);
        if (m) {
          const name = m[1];
          const idx = text.indexOf(name + "=");
          const after = text.slice(idx + name.length + 1);
          if (/\?\?|\?\./.test(after)) continue;
          risky.set(name, { line: i + 1, hint: m[2] ? "." + m[2] + "()" : "JSON.parse()" });
          if (/\.(find|findLast|first|query|querySelector|getElementById|match|matchAll|pop|shift|next)\([^)]*\)\.[A-Za-z_$]|JSON\.parse\([^)]*\)\.[A-Za-z_$]/.test(text)) {
            push(i + 1, this.id, 'a nullable result is accessed directly with "." — add optional chaining (?.) or a null check', this.sev);
          }
        }
        for (const name of risky.keys()) {
          if (new RegExp(`!${escRe(name)}\\b|${escRe(name)}\\s*==\\s*null|${escRe(name)}\\s*===\\s*null|${escRe(name)}\\s*\\?\\?`).test(text)) checked.add(name);
        }
      }
      for (const [name, meta] of risky) {
        if (checked.has(name)) continue;
        for (let i = 0; i < lines.length; i++) {
          if (i + 1 === meta.line) continue;
          const text = lines[i];
          if (new RegExp(`\\b${escRe(name)}\\?\\?`).test(text)) continue;
          if (new RegExp(`\\b${escRe(name)}\\?\\.`).test(text)) continue;
          if (new RegExp(`\\b${escRe(name)}\\.`).test(text)) {
            push(i + 1, this.id, `"${name}" can be null (from a ${meta.hint} call) but is accessed as "${name}.x" with no check`, this.sev);
            break;
          }
        }
      }
    },
  },
  {
    id: "sleepfix", sev: "error",
    title: "Sleep() 'fixes'",
    desc: "time.sleep / Thread.sleep / setTimeout waits in production code — usually papering over a race, not fixing it.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        for (const p of SLEEP_PATTERNS) {
          if (p.re.test(lines[i])) {
            push(i + 1, this.id, `${p.name} in non-test code — usually an AI "fix" that hides a race instead of solving it`, this.sev);
            break;
          }
        }
      }
    },
  },
  {
    id: "debugprint", sev: "warning",
    title: "Debug leftovers",
    desc: "console.log, print(), debugger — evidence that the code was run once, looked at, and never cleaned up.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        for (const p of DEBUG_PATTERNS) {
          if (p.re.test(lines[i])) {
            push(i + 1, this.id, `${p.name} left in non-test code`, this.sev);
            break;
          }
        }
      }
    },
  },
  {
    id: "dummy", sev: "warning",
    title: "Placeholder text",
    desc: "lorem ipsum, changeme, your-api-key, TODO/FIXME/HACK — the code was templated, not written.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        for (const p of DUMMY_PATTERNS) {
          if (p.re.test(stripComments(lines[i]))) {
            const extra = /TODO|FIXME|HACK/.test(p.name) ? " — sure this was meant to ship?" : " left in the diff";
            push(i + 1, this.id, p.name + extra, this.sev);
            break;
          }
        }
      }
    },
  },
  {
    id: "minified", sev: "warning",
    title: "Minified / blob lines",
    desc: "400+ character lines are unreadable and unreviewable. If it came from an AI, split it — and read it.",
    run(lines, push) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.length <= MAX_LINE_LEN) continue;
        if (/^(#|\/\/|\/\*|\*)/.test(trimmed)) continue;
        push(i + 1, this.id, `line is ${trimmed.length} characters — minified or pasted blob, painful to review`, this.sev);
      }
    },
  },
  {
    id: "deadimport", sev: "warning",
    title: "Dead imports",
    desc: "Imported names never used anywhere in the file. Harmless to the build, telling about the author.",
    run(lines, push) {
      const source = lines.join("\n");
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (!/(^|\s)import\s|\brequire\(/.test(text)) continue;
        for (const name of extractImportNames(text)) {
          if (!name) continue;
          const lineHits = (text.match(new RegExp(`\\b${escRe(name)}\\b`, "g")) || []).length;
          const totalHits = (source.match(new RegExp(`\\b${escRe(name)}\\b`, "g")) || []).length;
          if (totalHits <= lineHits) push(i + 1, this.id, `"${name}" is imported but never used`, this.sev);
        }
      }
    },
  },
  {
    id: "bignew", sev: "warning",
    title: "One-shot files",
    desc: "800+ lines pasted in a single stroke. AI loves a whole-file rewrite; review it like you own it.",
    run(lines, push) {
      if (lines.length > BIG_NEW_FILE) {
        push(1, this.id, `${lines.length} lines added in one shot — AI loves to one-shot a whole file. Review it like you own it.`, this.sev);
      }
    },
  },
];

function findingsLen(list, line, rule) {
  return list.some((f) => f.line === line && f.rule === rule);
}

function analyze() {
  const source = codeEl.value;
  const lines = source.split(/\r?\n/);
  const findings = [];

  const push = (line, rule, message, sev) => findings.push({ line, rule, message, sev });
  for (const r of RULES) {
    r._list = findings;
    r.run(lines, push);
  }
  findings.sort((a, b) => a.line - b.line || RULES.findIndex((r) => r.id === a.rule) - RULES.findIndex((r) => r.id === b.rule));

  renderGutter(lines, findings);
  const errs = findings.filter((f) => f.sev === "error").length;
  const warns = findings.filter((f) => f.sev === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - errs * 15 - warns * 5));
  const fillColor = score > 66 ? "var(--green)" : score > 33 ? "var(--yellow)" : "var(--red)";

  let html = "";
  if (!source.trim()) {
    html = `<div class="empty">// paste code above — findings appear here</div>`;
  } else if (findings.length === 0) {
    html = `<div class="out-line"><span class="ok-marker">✓</span><span class="out-text">clean — vibeguard found nothing suspicious in ${lines.length} lines.</span></div>`;
  } else {
    html += `<div class="out-file">vibeguard check — src/demo.ts</div>`;
    titleEl.textContent = "vibeguard check — src/demo.ts";
    for (const f of findings) {
      const mark = f.sev === "error" ? '<span class="err-marker">✘</span>' : '<span class="warn-marker">⚠</span>';
      html += `<div class="out-line"><span class="ln">${f.line}</span><span class="out-marker">${mark}</span><span class="out-rule">[${f.rule}]</span><span class="out-text">${ESC(f.message)}</span></div>`;
      html += `<span class="out-snippet">${ESC(lines[f.line - 1] || "").slice(0, 90) || " "}</span>`;
    }
  }

  const verdict = errs > 0
    ? `<div class="verdict blocked">✘ BLOCKED — ${errs} error${errs === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"}. Your AI is confident. vibeguard is not.</div>`
    : warns > 0
      ? `<div class="verdict warned">△ passed with warnings — ${warns} warning${warns === 1 ? "" : "s"}. Clean enough to merge. Dirty enough to look at first.</div>`
      : `<div class="verdict clean">✓ clean — nothing to block. Ship it.</div>`;

  html += `<div class="out-summary">
    <div><b class="${errs ? "err" : ""}">${errs} error${errs === 1 ? "" : "s"}</b> · <b class="${warns ? "warn" : ""}">${warns} warning${warns === 1 ? "" : "s"}</b></div>
    <div class="gauge-row"><div class="gauge"><div class="gauge-fill" style="width:${score}%;background:${fillColor}"></div></div><span class="gauge-score">${score}/100</span></div>
    ${verdict}
  </div>`;

  outputEl.innerHTML = html;
  statusEl.firstChild.textContent = errs > 0 ? "blocked — fix before you commit" : "scan complete";
}

function renderGutter(lines, findings) {
  const marks = new Map();
  for (const f of findings) {
    const cur = marks.get(f.line) || 0;
    if (f.sev === "error") marks.set(f.line, 2);
    else if (cur < 2) marks.set(f.line, 1);
  }
  let html = "";
  for (let i = 0; i < lines.length; i++) {
    const mark = marks.get(i + 1);
    const cls = mark === 2 ? "has-err" : mark === 1 ? "has-warn" : "";
    const glyph = mark === 2 ? "✘" : mark === 1 ? "⚠" : "";
    html += `<div class="${cls}">${i + 1}<span class="mark">${glyph}</span></div>`;
  }
  gutterEl.innerHTML = html;
}

function syncGutterScroll() {
  gutterEl.scrollTop = codeEl.scrollTop;
}

function highlightCursorLine() {
  const start = codeEl.selectionStart;
  const line = sourceUpTo(start);
  gutterEl.querySelectorAll("div").forEach((d, i) => d.classList.toggle("cur", i === line));
}
function sourceUpTo(pos) {
  let n = 0;
  for (let i = 0; i < pos; i++) if (codeEl.value[i] === "\n") n++;
  return n;
}

function renderRulesGrid() {
  rulesGrid.innerHTML = RULES.map((r) => `
    <div class="rule-card ${r.sev}">
      <div class="rule-head">
        <h3>${r.id}</h3>
        <span class="tag">${r.sev === "error" ? "blocks commit" : "warning"}</span>
      </div>
      <p>${ESC(r.desc)}</p>
    </div>`).join("");
  rulesGrid.querySelectorAll(".rule-card").forEach((c) => c.classList.add("reveal"));
}

const DEMO = [
  'import { db } from "./db";',
  'import { helper } from "./helper";',
  "",
  "export async function getUser(id: string) {",
  "  const user = db.users.find((u) => u.id === id);",
  '  const apiKey = "sk-live-9f2c1a5b8e4d7a0c3f6e9b1d2a4c7e8f";',
  "  const token = process.env.AUTH_TOKEN;",
  "  try {",
  '    await fetch(`https://api.example.com/user/${user.email}`);',
  "  } catch (e) {}",
  '  const webhook = "https://example.com/your-secret-endpoint";',
  "  await new Promise((r) => setTimeout(r, 5000));",
  "  return { ...user, apiKey };",
  "}",
  "",
  'console.log("debug: loaded user", user);',
  "",
];

let t = null;
codeEl.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(analyze, 220);
});
codeEl.addEventListener("scroll", syncGutterScroll);
codeEl.addEventListener("click", highlightCursorLine);
codeEl.addEventListener("keyup", highlightCursorLine);
codeEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); analyze(); }
});

$("loadDemo").addEventListener("click", () => {
  codeEl.value = DEMO.join("\n");
  codeEl.focus();
  analyze();
});
$("clearBtn").addEventListener("click", () => {
  codeEl.value = "";
  titleEl.textContent = "vibeguard check — src/demo.ts";
  analyze();
  codeEl.focus();
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  const text = btn.dataset.copy;
  const done = () => {
    btn.textContent = "copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("copied"); }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
});
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch { btn.textContent = "ctrl+c"; }
  document.body.removeChild(ta);
}

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }
  }, { threshold: 0.1 });
  document.querySelectorAll("section.section > h2, section.section > p.section-sub, .why-card, .step, .faq, .rule-card").forEach((el) => {
    el.classList.add("reveal");
    io.observe(el);
  });
  document.querySelector(".hero").classList.add("reveal", "in");
}

window.addEventListener("scroll", () => {
  $("nav").classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

renderRulesGrid();
initReveal();
analyze();
