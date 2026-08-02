import fs from "node:fs";
import path from "node:path";
import { RULES } from "./rules.mjs";
import { isExcluded, isIncluded } from "./config.mjs";

export function collectEnvKeys(envFile) {
  if (!envFile) return new Set();
  if (!fs.existsSync(envFile)) return new Set();
  const keys = new Set();
  const text = fs.readFileSync(envFile, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*export\s+(?:const\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]|^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) keys.add(m[1] || m[2]);
  }
  return keys;
}

export function run(changedFiles, config, opts = {}) {
  const envFile = opts.envFile || config.envfile || null;
  const envKeys = opts.envKeys || collectEnvKeys(envFile);

  const findings = [];
  let lineCount = 0;
  let checkedFileCount = 0;

  const readFile = opts.readFile || ((f) => {
    try {
      return fs.readFileSync(path.resolve(f), "utf8");
    } catch {
      return null;
    }
  });

  for (const entry of changedFiles) {
    const file = entry.file;
    if (isExcluded(file, config)) continue;
    if (!isIncluded(file, config)) continue;

    const lines = entry.added;
    lineCount += lines.length;
    checkedFileCount++;

    for (const [id, rule] of Object.entries(RULES)) {
      const level = config.rules[id];
      if (!level || level === "off") continue;
      if (!rule.applies(file)) continue;

      let found;
      try {
        found = rule.run(file, lines, {
          envKeys,
          envFileLabel: envFile ? path.basename(envFile) : "envfile",
          readFile,
          isNewFile: !!entry.newFile,
        });
      } catch {
        continue;
      }

      for (const f of found || []) {
        findings.push({
          rule: id,
          severity: level,
          file,
          line: f.line || 0,
          message: f.message,
          excerpt: (f.excerpt || lines.find((l) => l.line === (f.line || 0))?.text || "").slice(0, 100),
        });
      }
    }
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.rule < b.rule ? -1 : 1;
  });

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return {
    findings,
    counts,
    blocking: counts.error > 0,
    fileCount: checkedFileCount,
    lineCount,
  };
}
