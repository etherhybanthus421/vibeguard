const CODE_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
  ".py", ".go", ".java", ".kt", ".kts", ".rb", ".php", ".c", ".h",
  ".cpp", ".hpp", ".cs", ".rs", ".swift", ".sh", ".bash", ".zsh",
  ".pl", ".lua", ".scala", ".ex", ".exs", ".dart",
]);

const JS_EXTS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);
const CATCHABLE_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".py", ".java", ".kt", ".kts", ".php", ".rb", ".swift", ".cs", ".scala",
]);
const SLEEP_EXTS = new Set([
  ".py", ".java", ".kt", ".kts",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
]);
const CONFIG_EXTS = new Set([".json", ".yml", ".yaml", ".toml", ".xml", ".ini", ".conf"]);
const TEXT_EXTS = new Set([".md", ".txt", ".html", ".css", ".scss"]);

export const MAX_LINE_LEN = 400;
export const BIG_NEW_FILE = 800;

function extOf(file) {
  const base = file.toLowerCase().replace(/\\/g, "/");
  const i = base.lastIndexOf(".");
  if (i === -1) return "";
  return base.slice(i);
}

export function isTestFile(file) {
  const base = file.replace(/\\/g, "/");
  const name = base.split("/").pop();
  return (
    /(^|\/)(__tests__|tests?|specs?)(\/|\.|$)/i.test(base) ||
    /\.(test|spec)\.[a-z0-9]+$/i.test(base) ||
    /(^|[._-])(test|spec)([._-]|$)/i.test(name)
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function trimToken(s) {
  return s.length <= 24 ? s : s.slice(0, 12) + "…" + s.slice(-8);
}

function isPlaceholderValue(v) {
  const low = v.toLowerCase();
  if (low.length < 20 || /\.{3,}$/.test(low)) return true;
  return [
    "example", "placeholder", "changeme", "your_", "your-", "yourkey",
    "xxx", "dummy", "fake", "test", "<", ">", "redacted", "insert",
  ].some((t) => low.includes(t));
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

export const SECRET = {
  id: "secret",
  applies: (file) => CODE_EXTS.has(extOf(file)) || CONFIG_EXTS.has(extOf(file)) || TEXT_EXTS.has(extOf(file)),
  run(file, lines) {
    const findings = [];
    for (const { line, text } of lines) {
      let flagged = false;
      for (const p of SECRET_PATTERNS) {
        const m = text.match(p.re);
        if (m && !isPlaceholderValue(m[0])) {
          findings.push({ line, message: `hardcoded ${p.name} "${trimToken(m[0])}"` });
          flagged = true;
          break;
        }
      }
      if (flagged) continue;
      for (const p of SECRET_ASSIGN_PATTERNS) {
        const m = text.match(p.re);
        if (m && !isPlaceholderValue(text)) {
          findings.push({ line, message: `${p.name} "${trimToken(m[0])}"` });
          break;
        }
      }
    }
    return findings;
  },
};

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

export const ENVHOLE = {
  id: "envhole",
  applies: (file) => CODE_EXTS.has(extOf(file)),
  run(file, lines, ctx) {
    const findings = [];
    for (const { line, text } of lines) {
      for (const reader of ENV_READERS) {
        reader.re.lastIndex = 0;
        let m;
        while ((m = reader.re.exec(text)) !== null) {
          const key = m[1];
          if (!key) continue;
          if (BUILTIN_ENV.has(key)) continue;
          if (ctx.envKeys && ctx.envKeys.has(key)) continue;
          if (reader.needsDefault && m[2] !== undefined) continue;
          const after = text.slice(reader.re.lastIndex);
          if (/\?\?|\|\|/.test(after)) continue;
          findings.push({ line, message: `reads "${key}" but it is never declared and has no fallback (missing from ${ctx.envFileLabel || "envfile"})` });
          break;
        }
        if (findings.length && findings[findings.length - 1].line === line) break;
      }
    }
    return findings;
  },
};

const CATCH_EMPTY_SINGLE = /\}\s*catch\s*(\([^)]*\))?\s*\{\s*\}/;
const CATCH_EMPTY_SINGLE2 = /^\s*catch\s*(\([^)]*\))?\s*\{\s*\}/;
const CATCH_OPEN = /^\s*\}\s*catch\s*(\([^)]*\))?\s*\{\s*$/;
const CATCH_OPEN2 = /^\s*catch\s*(\([^)]*\))?\s*\{\s*$/;
const EXCEPT_EMPTY_SINGLE = /^\s*except\b[^:]*:\s*pass\b/;
const EXCEPT_OPEN = /^\s*except\b[^:]*:\s*$/;

export const SWALLOW = {
  id: "swallow",
  applies: (file) => CATCHABLE_EXTS.has(extOf(file)),
  run(file, lines) {
    const findings = [];
    let pending = null;
    let pyPending = null;

    for (const { line, text } of lines) {
      if (CATCH_EMPTY_SINGLE.test(text) || CATCH_EMPTY_SINGLE2.test(text)) {
        findings.push({ line, message: "empty catch block — a failure just got silently erased" });
        continue;
      }
      if (EXCEPT_EMPTY_SINGLE.test(text)) {
        findings.push({ line, message: "except branch only passes — the failure is being eaten silently" });
        continue;
      }
      if (CATCH_OPEN.test(text) || CATCH_OPEN2.test(text)) {
        pending = { line, depth: 1, foundCode: false };
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
          if (!pending.foundCode) {
            findings.push({ line: pending.line, message: "empty catch block — a failure just got silently erased" });
          }
          pending = null;
        }
        continue;
      }
      if (EXCEPT_OPEN.test(text)) {
        pyPending = { line };
        continue;
      }
      if (pyPending) {
        const stripped = text.replace(/#.*$/g, "").trim();
        if (stripped !== "") {
          if (/^pass\b/.test(stripped)) {
            findings.push({ line: pyPending.line, message: "except branch only passes — the failure is being eaten silently" });
          }
          pyPending = null;
        }
      }
    }
    return findings;
  },
};

const DECL_RISKY = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[^;]*?\.(find|findLast|first|query|querySelector|getElementById|match|matchAll|pop|shift|next)\(|JSON\.parse\()/;

export const NULLACCESS = {
  id: "nullaccess",
  applies: (file) => JS_EXTS.has(extOf(file)),
  run(file, lines) {
    const findings = [];
    const risky = new Map();
    const checked = new Set();

    for (const { line, text } of lines) {
      const m = text.match(DECL_RISKY);
      if (m) {
        const name = m[1];
        const idx = text.indexOf(name + "=");
        const after = text.slice(idx + name.length + 1);
        if (/\?\?|\?\./.test(after)) continue;
        risky.set(name, { line, hint: m[2] ? "." + m[2] + "()" : "JSON.parse()" });

        const direct = text.match(
          /\.(find|findLast|first|query|querySelector|getElementById|match|matchAll|pop|shift|next)\([^)]*\)\.[A-Za-z_$]|JSON\.parse\([^)]*\)\.[A-Za-z_$]/
        );
        if (direct) {
          findings.push({
            line,
            message: `a nullable result is accessed directly with "." — add optional chaining (?.) or a null check`,
          });
        }
      }
      for (const name of risky.keys()) {
        const check = new RegExp(
          `!${escapeRe(name)}\\b|${escapeRe(name)}\\s*==\\s*null|${escapeRe(name)}\\s*===\\s*null|${escapeRe(name)}\\s*\\?\\?`
        );
        if (check.test(text)) checked.add(name);
      }
    }

    for (const [name, meta] of risky) {
      if (checked.has(name)) continue;
      for (const { line, text } of lines) {
        if (line === meta.line) continue;
        if (new RegExp(`\\b${escapeRe(name)}\\?\\?`).test(text)) continue;
        if (new RegExp(`\\b${escapeRe(name)}\\?\\.`).test(text)) continue;
        if (new RegExp(`\\b${escapeRe(name)}\\.`).test(text)) {
          findings.push({ line, message: `"${name}" can be null (from a ${meta.hint} call) but is accessed as "${name}.x" with no check` });
          break;
        }
      }
    }
    return findings;
  },
};

const SLEEP_PATTERNS = [
  { name: "time.sleep", re: /\btime\.sleep\s*\(/ },
  { name: "Thread.sleep", re: /\bThread\.sleep\s*\(/ },
  { name: "asyncio.sleep", re: /\bawait\s+asyncio\.sleep\s*\(/ },
  { name: "setTimeout-based wait", re: /await\s+new\s+Promise\s*\(\s*\(?r\)?\s*=>\s*setTimeout\s*\([^)]*r\s*,/ },
  { name: "long sleep()", re: /\bsleep\s*\(\s*\d{3,}\s*\)/ },
];

export const SLEEPFIX = {
  id: "sleepfix",
  applies: (file) => SLEEP_EXTS.has(extOf(file)) && !isTestFile(file),
  run(file, lines) {
    const findings = [];
    for (const { line, text } of lines) {
      for (const p of SLEEP_PATTERNS) {
        if (p.re.test(text)) {
          findings.push({ line, message: `${p.name} in non-test code — usually an AI "fix" that hides a race instead of solving it` });
          break;
        }
      }
    }
    return findings;
  },
};

const DEBUG_PATTERNS = [
  { name: "console.log", re: /\bconsole\.(log|debug|info|trace)\s*\(/ },
  { name: "debugger", re: /\bdebugger\b/ },
  { name: "print()", re: /\bprint\s*\(/ },
  { name: "puts", re: /\bputs\s+/ },
];

export const DEBUGPRINT = {
  id: "debugprint",
  applies: (file) => CODE_EXTS.has(extOf(file)) && !isTestFile(file),
  run(file, lines) {
    const findings = [];
    for (const { line, text } of lines) {
      for (const p of DEBUG_PATTERNS) {
        if (p.re.test(text)) {
          findings.push({ line, message: `${p.name} left in non-test code` });
          break;
        }
      }
    }
    return findings;
  },
};

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

export const DUMMY = {
  id: "dummy",
  applies: (file) => CODE_EXTS.has(extOf(file)) || CONFIG_EXTS.has(extOf(file)),
  run(file, lines) {
    const findings = [];
    for (const { line, text } of lines) {
      for (const p of DUMMY_PATTERNS) {
        if (p.re.test(stripComments(text))) {
          const extra = /TODO|FIXME|HACK/.test(p.name) ? " — sure this was meant to ship?" : " left in the diff";
          findings.push({ line, message: p.name + extra });
          break;
        }
      }
    }
    return findings;
  },
};

export const MINIFIED = {
  id: "minified",
  applies: (file) => CODE_EXTS.has(extOf(file)) || CONFIG_EXTS.has(extOf(file)),
  run(file, lines) {
    const findings = [];
    for (const { line, text } of lines) {
      const trimmed = text.trim();
      if (trimmed.length <= MAX_LINE_LEN) continue;
      if (/^(#|\/\/|\/\*|\*)/.test(trimmed)) continue;
      findings.push({ line, message: `line is ${trimmed.length} characters — minified or pasted blob, painful to review` });
    }
    return findings;
  },
};

function extractImportNames(text, isPy) {
  const names = [];
  if (isPy) {
    let m = text.match(/^\s*from\s+[\w.]+\s+import\s+(.+)$/);
    if (m && !/\*/.test(m[1])) {
      for (const part of m[1].split(",")) {
        const p = part.trim().replace(/^\(|\)$/g, "");
        if (!p) continue;
        const as = p.match(/^(.+?)\s+as\s+(\w+)$/);
        names.push(as ? as[2] : p);
      }
      return names;
    }
    m = text.match(/^\s*import\s+(\w+)/);
    if (m) names.push(m[1]);
    return names;
  }
  let m = text.match(/^import\s+\{([^}]+)\}\s+from\s+/);
  if (m) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p) continue;
      const as = p.match(/^(.+?)\s+as\s+(\w+)$/);
      names.push(as ? as[2] : p);
    }
    return names;
  }
  m = text.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+/);
  if (m) names.push(m[1]);
  else {
    m = text.match(/^import\s+(\w+)\s+from\s+/);
    if (m) names.push(m[1]);
  }
  m = text.match(/^const\s+\{([^}]+)\}\s*=\s*require\(/);
  if (m) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p) continue;
      const as = p.match(/^(.+?)\s+as\s+(\w+)$/);
      names.push(as ? as[2] : p);
    }
  } else {
    m = text.match(/^const\s+(\w+)\s*=\s*require\(/);
    if (m) names.push(m[1]);
  }
  return names;
}

export const DEADIMPORT = {
  id: "deadimport",
  applies: (file) => {
    const ext = extOf(file);
    return JS_EXTS.has(ext) || ext === ".py";
  },
  run(file, lines, ctx) {
    const isPy = extOf(file) === ".py";
    const full = ctx && ctx.readFile ? ctx.readFile(file) : null;
    const source = full != null ? full : lines.map((l) => l.text).join("\n");
    const findings = [];

    for (const { line, text } of lines) {
      if (!/(^|\s)import\s|\brequire\(/.test(text)) continue;
      const names = extractImportNames(text, isPy);
      for (const name of names) {
        if (!name) continue;
        const lineHits = (text.match(new RegExp(`\\b${escapeRe(name)}\\b`, "g")) || []).length;
        const totalHits = (source.match(new RegExp(`\\b${escapeRe(name)}\\b`, "g")) || []).length;
        if (totalHits <= lineHits) {
          findings.push({ line, message: `"${name}" is imported but never used` });
        }
      }
    }
    return findings;
  },
};

export const BIGNEW = {
  id: "bignew",
  applies: (file) => CODE_EXTS.has(extOf(file)) || CONFIG_EXTS.has(extOf(file)),
  run(file, lines, ctx) {
    const findings = [];
    if (ctx && ctx.isNewFile && lines.length > BIG_NEW_FILE) {
      findings.push({ line: 1, message: `${lines.length} lines added in one shot — AI loves to one-shot a whole file. Review it like you own it.` });
    }
    return findings;
  },
};

export const RULES = {
  secret: SECRET,
  envhole: ENVHOLE,
  swallow: SWALLOW,
  nullaccess: NULLACCESS,
  sleepfix: SLEEPFIX,
  debugprint: DEBUGPRINT,
  dummy: DUMMY,
  minified: MINIFIED,
  deadimport: DEADIMPORT,
  bignew: BIGNEW,
};
