import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { VERSION, header, fatal, cyan, gray, green, red, yellow, bold } from "./logo.mjs";
import { setColor } from "./ansi.mjs";
import { loadConfig, DEFAULT_RULE_LEVELS, CONFIG_FILENAME } from "./config.mjs";
import { gitDiff, parseUnified, resolveDefaultBase, isGitRepo } from "./diff.mjs";
import { run as runEngine } from "./engine.mjs";
import { renderReport, trustScore, gauge } from "./report.mjs";
import { isExcluded } from "./config.mjs";

const HOOK_MARKER = "# vibeguard pre-commit hook";

function parseArgs(argv) {
  const args = [...argv];
  let command = null;
  const flags = {};
  const positionals = [];

  if (args.length && !args[0].startsWith("-")) {
    command = args.shift();
  } else if (!args.length) {
    command = "help";
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let value = true;
      if (key.includes("=")) {
        const eq = key.indexOf("=");
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (args[i + 1] && !args[i + 1].startsWith("-")) {
        value = args[++i];
      }
      flags[key] = value;
    } else {
      positionals.push(a);
    }
  }

  return { command, flags, positionals };
}

export function run(argv) {
  const { command, flags, positionals } = parseArgs(argv);

  if (flags["no-color"] || process.env.NO_COLOR) setColor(false);
  if (flags["version"] || command === "version") return version();
  if (flags["help"] || command === "help" || command == null) return help();
  if (command === "init") return init(flags);
  if (command === "install") return install(flags);
  if (command === "uninstall") return uninstall(flags);
  if (command === "doctor") return doctor(flags);
  if (command === "demo") return demo(flags);
  if (command === "check") return check(flags);
  if (command === "scan") return scan(flags, positionals);
  return fail(`unknown command "${command}" — try "vibeguard help"`);
}

function version() {
  process.stdout.write(`${header()}\n`);
  return 0;
}

function help() {
  process.stdout.write(`${header()}`);
  process.stdout.write(`
${bold("USAGE")}
  vibeguard <command> [options]

${bold("COMMANDS")}
  check        reality-check the current diff (git required)
               options: --staged            check staged changes
                        --all               check unstaged + staged changes
                        --base <ref>        diff against a ref (default: HEAD~1)
                        --json              machine-readable output
                        --quiet             print findings only (for hooks)
                        --config <file>     use a specific config file

  scan <path>  reality-check files/dirs directly, no git needed
               options: --config <file>  --json  --quiet

  init         write a ${CONFIG_FILENAME} template in the current directory
               options: --force            overwrite an existing config

  install      install the pre-commit hook that blocks bad AI code
  uninstall    remove the vibeguard hook
  doctor       check that everything is wired up
  demo         show vibeguard catching real AI-code mistakes (safe)
  version      print version
  help         this screen

${bold("EXIT CODES")}
  0  clean or warnings only     1  vibeguard blocked the diff     2  something broke

${bold("HOOK")}
  vibeguard install && vibeguard install --pre-push   # optional second gate

${gray("built by @thesajidalam — https://github.com/thesajidalam/vibeguard")}
`);
  return 0;
}

function load(flags) {
  const dir = process.cwd();
  const { config, source } = loadConfig(dir, flags.config);
  return { config, source };
}

function check(flags) {
  if (!isGitRepo()) {
    process.stderr.write(`${fatal("not a git repository")}\n`);
    process.stderr.write(`${gray('hint: use "vibeguard scan <dir>" to check files without git')}\n`);
    return 2;
  }

  const { config } = load(flags);
  let raw;

  try {
    if (flags.staged) {
      raw = gitDiff({ staged: true });
    } else if (flags.all) {
      const staged = gitDiff({ staged: true });
      const unstaged = gitDiff({});
      raw = staged + "\n" + unstaged;
    } else {
      const base = flags.base || resolveDefaultBase();
      if (base) raw = gitDiff({ base });
      else raw = gitDiff({ staged: true });
    }
  } catch {
    process.stderr.write(`${fatal("could not read the git diff")}\n`);
    return 2;
  }

  const files = parseUnified(raw);
  const result = runEngine(files, config, { envFile: path.resolve(config.envfile || ".env.example") });

  const text = renderReport(result, { json: flags.json, quiet: flags.quiet });
  if (text) process.stdout.write(text + "\n");

  if (flags.json) return result.blocking ? 1 : 0;
  if (flags.quiet && !result.blocking) return 0;
  return result.blocking ? 1 : 0;
}

function scan(flags, targets) {
  const { config } = load(flags);
  if (!targets.length) {
    process.stderr.write(`${fatal("scan needs at least one file or directory")}\n`);
    return 2;
  }

  const entries = [];
  const seen = new Set();
  for (const t of targets) {
    const p = path.resolve(t);
    if (!fs.existsSync(p)) {
      process.stderr.write(`${fatal(`path not found: ${t}`)}\n`);
      return 2;
    }
    if (fs.statSync(p).isDirectory()) {
      walk(p, (f) => {
        if (isExcluded(path.relative(process.cwd(), f), config)) return;
        const key = f;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(f);
      });
    } else {
      const key = p;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(p);
      }
    }
  }

  const changedFiles = [];
  const fileContents = new Map();
  for (const f of entries) {
    let content;
    try {
      content = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    fileContents.set(f, content);
    changedFiles.push({
      file: f,
      newFile: false,
      added: content.split(/\r?\n/).map((text, i) => ({ line: i + 1, text })),
    });
  }

  const result = runEngine(changedFiles, config, {
    readFile: (f) => fileContents.get(path.resolve(f)) ?? null,
    envFile: path.resolve(config.envfile || ".env.example"),
  });

  const text = renderReport(result, { json: flags.json, quiet: flags.quiet });
  if (text) process.stdout.write(text + "\n");
  return result.blocking ? 1 : 0;
}

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if ([".git", "node_modules", "vendor", "dist", "build", "out", "coverage"].includes(e.name)) continue;
      walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}

function init(flags) {
  const target = path.join(process.cwd(), CONFIG_FILENAME);
  if (fs.existsSync(target) && !flags.force) {
    process.stderr.write(`${fatal(`${CONFIG_FILENAME} already exists (use --force to overwrite)`)}\n`);
    return 1;
  }
  const here = fileURLToPath(new URL("./", import.meta.url));
  const example = path.join(here, "..", ".vibeguard.example.yaml");
  if (fs.existsSync(example)) fs.copyFileSync(example, target);
  else fs.writeFileSync(target, configTemplate(), "utf8");
  process.stdout.write(`${green("✓")} wrote ${cyan(CONFIG_FILENAME)}\n`);
  process.stdout.write(`${gray('tune the rules, then run "vibeguard check"')}\n`);
  return 0;
}

function gitDir() {
  const out = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
  return path.resolve(out);
}

function install(flags) {
  if (!isGitRepo()) {
    process.stderr.write(`${fatal("not a git repository")}\n`);
    return 2;
  }
  const here = fileURLToPath(new URL("./", import.meta.url));
  const binPath = path.join(here, "..", "bin", "vibeguard.mjs");
  const hook = path.join(gitDir(), "hooks", "pre-commit");

  if (fs.existsSync(hook) && fs.readFileSync(hook, "utf8").includes(HOOK_MARKER)) {
    process.stdout.write(`${yellow("·")} vibeguard hook already installed\n`);
    return 0;
  }

  if (fs.existsSync(hook)) {
    fs.renameSync(hook, hook + ".vibeguard.bak");
    process.stdout.write(`${gray(`backed up existing hook -> ${path.basename(hook)}.vibeguard.bak`)}\n`);
  }

  const quoted = `"${binPath.replace(/\\/g, "/")}"`;
  const body = [
    "#!/bin/sh",
    HOOK_MARKER,
    "# installed by `vibeguard install` - https://github.com/thesajidalam/vibeguard",
    "set -e",
    "",
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "vibeguard: node not found on PATH - skipping" >&2',
    "  exit 0",
    "fi",
    "",
    `node ${quoted} check --staged --quiet`,
    "",
  ].join("\n");

  fs.writeFileSync(hook, body, { mode: 0o755 });
  process.stdout.write(`${green("✓")} vibeguard pre-commit hook installed at ${cyan(hook)}\n`);
  process.stdout.write(`${gray("bad AI code now gets blocked before it reaches a commit.")}\n`);
  return 0;
}

function uninstall(flags) {
  if (!isGitRepo()) {
    process.stderr.write(`${fatal("not a git repository")}\n`);
    return 2;
  }
  const hook = path.join(gitDir(), "hooks", "pre-commit");
  if (fs.existsSync(hook) && fs.readFileSync(hook, "utf8").includes(HOOK_MARKER)) {
    fs.unlinkSync(hook);
    process.stdout.write(`${green("✓")} vibeguard hook removed\n`);
  } else {
    process.stdout.write(`${yellow("·")} no vibeguard hook found\n`);
  }
  return 0;
}

function doctor(flags) {
  const lines = [];
  lines.push(header());
  lines.push("");

  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  lines.push(`  node            ${nodeMajor >= 18 ? green(`✓ ${process.versions.node}`) : red(`✘ ${process.versions.node} (need 18+)`)}`);
  lines.push(`  vibeguard       ${green(`✓ v${VERSION}`)}`);

  if (isGitRepo()) {
    lines.push(`  git repo        ${green("✓ " + path.basename(gitDir()))}`);
    const hook = path.join(gitDir(), "hooks", "pre-commit");
    if (fs.existsSync(hook) && fs.readFileSync(hook, "utf8").includes(HOOK_MARKER)) {
      lines.push(`  pre-commit hook ${green("✓ installed")}`);
    } else {
      lines.push(`  pre-commit hook ${yellow("· not installed (vibeguard install)")}`);
    }
  } else {
    lines.push(`  git repo        ${yellow("· not a git repo (scan still works)")}`);
  }

  const { config, source } = load(flags);
  const off = Object.entries(config.rules).filter(([, l]) => l === "off").map(([id]) => id);
  lines.push(`  config          ${source ? green(`✓ ${path.basename(source)}`) : gray("· defaults")}`);
  lines.push(`  active rules    ${green(`${Object.values(config.rules).filter((l) => l !== "off").length} of ${Object.keys(config.rules).length}`)}${off.length ? gray(` (off: ${off.join(", ")})`) : ""}`);
  lines.push(`  env file        ${fs.existsSync(path.resolve(config.envfile || ".env.example")) ? green("✓ " + config.envfile) : yellow("· " + (config.envfile || ".env.example") + " not found")}`);

  lines.push("");
  lines.push(gray(`next: vibeguard install · vibeguard check · vibeguard demo — built by @thesajidalam`));
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

function demo(flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeguard-demo-"));
  const src = path.join(dir, "src");
  fs.mkdirSync(src, { recursive: true });

  fs.writeFileSync(
    path.join(dir, ".env.example"),
    ["# demo env example", "DATABASE_URL=postgres://demo:demo@localhost/db", "JWT_SECRET=please-generate-a-real-one", ""].join("\n"),
    "utf8"
  );

  const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "fixtures", "users.ts");
  const bad = fs.readFileSync(fixture, "utf8").split(/\r?\n/);
  fs.writeFileSync(path.join(src, "users.ts"), bad.join("\n"), "utf8");

  const { config } = loadConfig(dir);
  config.envfile = ".env.example";
  const file = path.join(src, "users.ts");
  const content = fs.readFileSync(file, "utf8");
  const changedFiles = [{
    file,
    newFile: true,
    added: content.split(/\r?\n/).map((text, i) => ({ line: i + 1, text })),
  }];

  const result = runEngine(changedFiles, config, {
    readFile: () => content,
    envFile: path.join(dir, ".env.example"),
  });

  process.stdout.write(`${header()}\n`);
  process.stdout.write(`${bold(cyan('DEMO — a typical "vibe-coded" function vs vibeguard'))}\n`);
  process.stdout.write(`${gray("this is exactly what your pre-commit hook will run on every change.")}\n\n`);
  process.stdout.write(renderReport(result, {}) + "\n");
  process.stdout.write(`\n${gray(`score: ${gauge(trustScore(result.counts))}`)}\n`);
  process.stdout.write(`${green(bold("\nfix the red, ship with confidence. built by @thesajidalam"))}\n`);

  fs.rmSync(dir, { recursive: true, force: true });
  return 0;
}

function fail(msg) {
  process.stderr.write(`${fatal(msg)}\n`);
  return 2;
}

function configTemplate() {
  return [
    "# vibeguard configuration — built by @thesajidalam",
    "# every value below is the default, so this file is optional.",
    "",
    "envfile: .env.example",
    "",
    "rules:",
    ...Object.entries(DEFAULT_RULE_LEVELS).map(([id, level]) => `  ${id}: ${level}`),
    "",
    "exclude:",
    "  - node_modules/**",
    "  - vendor/**",
    "  - dist/**",
    "  - *.lock",
    "  - package-lock.json",
    "  - .env",
    "",
  ].join("\n");
}
