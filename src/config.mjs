import fs from "node:fs";
import path from "node:path";
import { parseYaml } from "./yaml.mjs";
import { matches } from "./glob.mjs";

export const DEFAULT_RULE_LEVELS = {
  secret: "error",
  envhole: "error",
  swallow: "error",
  nullaccess: "error",
  sleepfix: "warning",
  debugprint: "warning",
  dummy: "warning",
  minified: "warning",
  deadimport: "warning",
  bignew: "info",
};

export const SEVERITIES = ["error", "warning", "info", "off"];

export const BUILTIN_EXCLUDES = [
  ".git/**",
  "node_modules/**",
  "vendor/**",
  "dist/**",
  "build/**",
  "out/**",
  "coverage/**",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.svg",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.otf",
  "*.eot",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz",
  ".env",
  "*.csv",
  "*.lockb",
];

export const DEFAULT_CONFIG = {
  envfile: ".env.example",
  rules: { ...DEFAULT_RULE_LEVELS },
  exclude: [],
  paths: [],
};

export const CONFIG_FILENAME = ".vibeguard.yaml";

export function loadConfig(dir, explicitPath) {
  const cfg = deepCopy(DEFAULT_CONFIG);

  const candidates = explicitPath
    ? [explicitPath]
    : [path.join(dir || ".", CONFIG_FILENAME), path.join(dir || ".", CONFIG_FILENAME + ".yml")];

  let found = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      found = c;
      break;
    }
  }

  if (found) {
    const parsed = parseYaml(fs.readFileSync(found, "utf8"));
    applyParsed(cfg, parsed);
  }

  return { config: cfg, source: found };
}

function applyParsed(cfg, parsed) {
  if (parsed == null) return;
  if (typeof parsed.envfile === "string" && parsed.envfile.trim()) {
    cfg.envfile = parsed.envfile.trim();
  }
  if (parsed.rules && typeof parsed.rules === "object") {
    for (const [id, level] of Object.entries(parsed.rules)) {
      const normalized = normalizeSeverity(level);
      if (normalized) cfg.rules[id] = normalized;
    }
  }
  if (Array.isArray(parsed.exclude)) {
    cfg.exclude = parsed.exclude.filter((x) => typeof x === "string");
  }
  if (Array.isArray(parsed.paths)) {
    cfg.paths = parsed.paths.filter((x) => typeof x === "string");
  }
}

export function normalizeSeverity(v) {
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === "warn") return "warning";
  if (s === "error" || s === "warning" || s === "info" || s === "off") return s;
  return null;
}

export function isExcluded(file, config) {
  const rel = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return matches(rel, [...BUILTIN_EXCLUDES, ...(config.exclude || [])]);
}

export function isIncluded(file, config) {
  const rel = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!config.paths || config.paths.length === 0) return true;
  return matches(rel, config.paths);
}

export function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}
