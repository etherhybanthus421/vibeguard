/* vibeguard web demo — a faithful client-side port of the CLI rules.
   Everything runs in your browser. Nothing is uploaded. built by @thesajidalam */

const $ = (id) => document.getElementById(id);
const codeEl = $("code");
const outputEl = $("output");
const demoBtn = $("demoBtn");

const ESC = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function stripComments(text) {
  const out = [];
  const re = /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'|`(\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const token = m[0];
    if (token.startsWith("//") || token.startsWith("/*")) {
      out.push(text.slice(last, m.index));
      last = m.index + token.length;
    } else {
      last = m.index + token.length;
    }
  }
  out.push(text.slice(last));
  return out.join("");
}

const JS_EXTS = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;
const PY_RE = /\.py$/;

function findFindings(file, lines) {
  const findings = [];
  const push = (line, rule, message, sev) => findings.push({ line, rule, message, sev });
  const isPy = PY_RE.test(file);
  const isJs = JS_EXTS.test(file);

  if (!isJs && !isPy && !/\.(go|rs|java|rb|php|kt|swift)$/.test(file)) return [];

  lines.forEach((text, i) => {
    const line = i + 1;
    const code = stripComments(text);

    /* secret */
    if (/sk-[A-Za-z0-9_-]{20,}/.test(code)) push(line, "secret", "hardcoded OpenAI-style API key", "error");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(code)) push(line, "secret", "hardcoded private key material", "error");
    if (
      /(?:api[_-]?key|api[_-]?secret|password|passwd|token|secret)\s*[:=]\s*["'][^"'\s]{8,}["']/i.test(code) &&
      !/example|your[-_ ]|changeme|placeholder|demo/i.test(code)
    )
      push(line, "secret", "hardcoded credential", "error");

    /* envhole */
    const env = code.match(/process\.env\.([A-Z_][A-Z0-9_]*)/) || (isPy ? code.match(/\bos\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/) : null);
    if (env) push(line, "envhole", `reads "${env[1]}" with no declared default — add it to your .env.example`, "error");

    /* swallow */
    if (/catch\s*\([^)]*\)\s*\{[^}]*\}/.test(code) && /catch\s*\([^)]*\)\s*\{\s*\}/.test(code))
      push(line, "swallow", "empty catch block — a failure just got silently erased", "error");

    /* sleepfix */
    if (/\btime\.sleep\s*\(/.test(code) || /\bThread\.sleep\s*\(/.test(code) || /\bawait\s+(?:asyncio\.)?sleep\s*\(/.test(code))
      push(line, "sleepfix", 'sleep() "fix" in non-test code — usually hides a race', "error");

    /* dummy */
    if (/lorem\s+ipsum/i.test(code)) push(line, "dummy", "lorem ipsum placeholder left in code", "warning");
    if (/\bchangeme\b/i.test(code)) push(line, "dummy", "changeme placeholder left in code", "warning");
    if (/\byour[-_ ]?(?:api[-_ ]?key|key|secret|token)\b/i.test(code)) push(line, "dummy", "your-key placeholder left in code", "warning");
    if (/\bTODO\b/.test(code) || /\bFIXME\b/.test(code) || /\bHACK\b/.test(code))
      push(line, "dummy", "TODO — sure this was meant to ship?", "warning");

    /* debugprint */
    if (/\bconsole\.(log|debug|info|trace)\s*\(/.test(code) || /\bdebugger\b/.test(code))
      push(line, "debugprint", "console.log/debugger left in non-test code", "warning");

    /* deadimport */
    const imp = text.match(/import\s*\{([^}]*)\}\s*from/);
    if (imp) {
      const names = imp[1].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()).filter(Boolean);
      for (const n of names) {
        const count = (text.match(new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g")) || []).length;
        if (count <= 1) push(line, "deadimport", `"${n}" is imported but never used`, "warning");
      }
    }

    /* minified */
    if (text.length > 500) push(line, "minified", "suspiciously long line — minified or bundled?", "warning");
  });

  /* nullaccess */
  if (isJs) {
    const risky = new Map();
    const checked = new Set();
    lines.forEach((text, i) => {
      const m = text.match(/(?:const|let|var)\s+(\w+)\s*=\s*[^;]*?\.(?:find|match|querySelector|getElementById|query)\(/) || text.match(/(?:const|let|var)\s+(\w+)\s*=\s*JSON\.parse\s*\(/);
      if (m) {
        const name = m[1];
        const after = text.slice(text.indexOf(name + "=") + name.length + 1);
        if (!/\?\?|\?\./.test(after)) risky.set(name, text);
      }
    });
    lines.forEach((text, i) => {
      for (const name of risky.keys()) {
        if (new RegExp(`!${name}\\b|${name}\\s*==\\s*null|${name}\\s*===\\s*null|${name}\\s*\\?\\?`).test(text)) checked.add(name);
      }
    });
    lines.forEach((text, i) => {
      const line = i + 1;
      for (const name of risky.keys()) {
        if (checked.has(name)) continue;
        if (new RegExp(`\\b${name}\\?\\.`).test(text)) continue;
        if (new RegExp(`\\b${name}\\.`).test(text)) {
          push(line, "nullaccess", `"${name}" can be null (from .find()/JSON.parse) but is accessed as "${name}.x"`, "error");
          break;
        }
      }
    });
  }

  return findings;
}

function analyze() {
  const source = codeEl.value;
  const lines = source.split(/\r?\n/);
  let findings = findFindings("demo.ts", lines);
  findings.sort((a, b) => a.line - b.line);

  const errs = findings.filter((f) => f.sev === "error").length;
  const warns = findings.filter((f) => f.sev === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - errs * 15 - warns * 5));

  let html = "";
  if (!source.trim()) {
    html = `<div class="empty">// paste code above — findings appear here</div>`;
  } else if (findings.length === 0) {
    html = `<div class="out-line"><span class="ok-marker">✓</span><span class="out-text">clean — vibeguard found nothing suspicious in ${lines.length} lines.</span></div>`;
  } else {
    let file = null;
    for (const f of findings) {
      if (f.line !== file) {
        file = f.line;
        html += `<div class="out-file">src/demo.ts</div>`;
      }
      const mark = f.sev === "error" ? '<span class="err-marker">✘</span>' : '<span class="warn-marker">⚠</span>';
      html += `<div class="out-line"><span class="out-marker">${mark}</span><span class="out-rule">[${f.rule}]</span><span class="out-text">${ESC(f.message)}</span></div>`;
      html += `<div class="out-line" style="padding-left:28px"><span class="out-snippet">${ESC(lines[f.line - 1] || "").slice(0, 90)}</span></div>`;
    }
  }

  const verdict = errs > 0
    ? `<div class="verdict blocked">✘ BLOCKED — ${errs} error(s), ${warns} warning(s). Your AI is confident. vibeguard is not.</div>`
    : warns > 0
      ? `<div class="verdict warned">△ passed with warnings — ${warns} warning(s). clean enough to merge. dirty enough to look at before you do.</div>`
      : `<div class="verdict clean">✓ clean — nothing to block. ship it.</div>`;

  const fillColor = score > 66 ? "var(--green)" : score > 33 ? "var(--yellow)" : "var(--red)";

  html += `<div class="out-summary">
    <div><b class="${errs ? "err" : ""}">${errs} error${errs === 1 ? "" : "s"}</b> · <b class="${warns ? "warn" : ""}">${warns} warning${warns === 1 ? "" : "s"}</b></div>
    <div class="gauge-row"><div class="gauge"><div class="gauge-fill" style="width:${score}%;background:${fillColor}"></div></div><span class="gauge-score">${score}/100</span></div>
    ${verdict}
  </div>`;

  outputEl.innerHTML = html;
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
  "  return { ...user, apiKey };",
  "}",
  "",
  'console.log("debug: loaded user", user);',
  "",
];

let t = null;
codeEl.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(analyze, 200);
});
demoBtn.addEventListener("click", () => {
  codeEl.value = DEMO.join("\n");
  analyze();
});

document.querySelectorAll(".copy-btn").forEach((b) => {
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = "copied";
      b.classList.add("copied");
      setTimeout(() => { b.textContent = "copy"; b.classList.remove("copied"); }, 1500);
    } catch {
      b.textContent = "press ctrl+c";
      setTimeout(() => { b.textContent = "copy"; }, 1500);
    }
  });
});

analyze();
