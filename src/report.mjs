import { red, green, yellow, blue, cyan, gray, bold, dim } from "./ansi.mjs";
import { VERSION } from "./logo.mjs";

const ICON = { error: red("✘"), warning: yellow("⚠"), info: blue("ℹ") };
const LABEL = { error: "error", warning: "warning", info: "info" };

export function trustScore(counts) {
  let score = 100;
  score -= counts.error * 20;
  score -= counts.warning * 5;
  return Math.max(0, score);
}

export function gauge(score) {
  const filled = Math.round((score / 100) * 10);
  const bar = cyan("#".repeat(filled)) + gray("-".repeat(10 - filled));
  const color = score >= 80 ? green : score >= 50 ? yellow : red;
  return `[${bar}] ${color(`${score}/100`)}`;
}

export function renderReport(result, opts = {}) {
  const { findings, counts, blocking } = result;
  const quiet = !!opts.quiet;

  if (opts.json) {
    return JSON.stringify({
      vibeguard: VERSION,
      blocking,
      counts,
      findings: findings.map((f) => ({
        rule: f.rule,
        severity: f.severity,
        file: f.file,
        line: f.line,
        message: f.message,
      })),
    }, null, 2);
  }

  const out = [];
  let lastFile = null;

  for (const f of findings) {
    if (f.file !== lastFile) {
      out.push("");
      out.push(bold(cyan(f.file)));
      lastFile = f.file;
    }
    out.push(
      `  ${ICON[f.severity]} ${bold(LABEL[f.severity])} ${gray(`[${f.rule}]`)} ${f.message}`
    );
    if (f.line) out.push(`      ${gray(`at line ${f.line}`)}`);
    if (f.excerpt) out.push(`      ${dim(`| ${f.excerpt.replace(/^\s+/, "")}`)}`);
  }

  if (findings.length > 0) out.push("");

  if (quiet && findings.length === 0) return out.join("\n");
  if (quiet) {
    out.push(verdict(result));
    return out.join("\n");
  }

  out.push(summary(result));
  return out.join("\n");
}

function summary(result) {
  const { counts, blocking, fileCount, lineCount } = result;
  const total = counts.error + counts.warning + counts.info;
  const scope = `${fileCount} file${fileCount === 1 ? "" : "s"} · ${lineCount} line${lineCount === 1 ? "" : "s"} checked`;
  const pieces = [];
  if (counts.error) pieces.push(red(`${counts.error} error${counts.error === 1 ? "" : "s"}`));
  if (counts.warning) pieces.push(yellow(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`));
  if (counts.info) pieces.push(blue(`${counts.info} note${counts.info === 1 ? "" : "s"}`));

  if (blocking) {
    return [
      gray(scope),
      red(bold(`✘ BLOCKED — ${pieces.join(", ") || "findings"} (${gauge(trustScore(counts))})`)),
      gray("  Your AI is confident. vibeguard is not."),
      gray(`  fix what's red, then vibeguard lets you through — ${green("built by @thesajidalam")}`),
    ].join("\n");
  }
  if (total === 0) {
    return [
      gray(scope),
      green(bold(`✓ reality check passed — ${gauge(trustScore(counts))}`)),
      gray("  this diff survived the vibeguard gauntlet."),
    ].join("\n");
  }
  return [
    gray(scope),
    yellow(bold(`△ passed with warnings — ${pieces.join(", ")} (${gauge(trustScore(counts))})`)),
    gray("  clean enough to merge. dirty enough to look at before you do."),
  ].join("\n");
}

function verdict(result) {
  const { counts, blocking } = result;
  if (blocking) return red(bold(`✘ vibeguard blocked — ${counts.error} error(s), ${counts.warning} warning(s)`));
  if (counts.warning) return yellow(bold(`△ vibeguard — warnings only (${counts.warning})`));
  return green(bold("✓ vibeguard passed"));
}
