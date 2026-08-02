import { test } from "node:test";
import assert from "node:assert/strict";
import { run, collectEnvKeys } from "../src/engine.mjs";
import { DEFAULT_CONFIG } from "../src/config.mjs";

const SAMPLE_DIFF = [
  {
    file: "src/users.ts",
    newFile: true,
    added: [
      { line: 1, text: 'import { db } from "./db";' },
      { line: 2, text: "const user = db.users.find(u => u.id === id);" },
      { line: 3, text: "const apiKey = \"sk-live-9f2c1a5b8e4d7a0c3f6e9b1d2a4c7e8f\";" },
      { line: 4, text: "await fetch(user.email);" },
      { line: 5, text: "} catch (e) {}" },
    ],
  },
];

function freshConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

test("blocks a vibe-coded diff", () => {
  const result = run(SAMPLE_DIFF, freshConfig(), { envKeys: new Set() });
  assert.ok(result.blocking);
  assert.ok(result.counts.error >= 3);
  assert.ok(result.findings.some((f) => f.rule === "secret"));
  assert.ok(result.findings.some((f) => f.rule === "nullaccess"));
  assert.ok(result.findings.some((f) => f.rule === "swallow"));
});

test("respects rule severity off", () => {
  const config = freshConfig();
  config.rules.secret = "off";
  config.rules.nullaccess = "off";
  config.rules.swallow = "off";
  const result = run(SAMPLE_DIFF, config, { envKeys: new Set() });
  assert.ok(!result.blocking);
  assert.equal(result.findings.length, 0);
});

test("honors excludes", () => {
  const config = freshConfig();
  config.exclude = ["src/**"];
  const result = run(SAMPLE_DIFF, config, { envKeys: new Set() });
  assert.equal(result.findings.length, 0);
  assert.equal(result.fileCount, 0);
});

test("sorts findings by file then line", () => {
  const result = run(SAMPLE_DIFF, freshConfig(), { envKeys: new Set() });
  const lines = result.findings.map((f) => f.line);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
});

test("collectEnvKeys reads KEY= lines", () => {
  const keys = collectEnvKeys("missing-file-that-does-not-exist");
  assert.equal(keys.size, 0);
});

test("clean diff passes", () => {
  const result = run([
    {
      file: "src/ok.ts",
      newFile: false,
      added: [
        { line: 1, text: "export function add(a, b) {" },
        { line: 2, text: "  if (a == null || b == null) return 0;" },
        { line: 3, text: "  return a + b;" },
        { line: 4, text: "}" },
      ],
    },
  ], freshConfig(), { envKeys: new Set() });
  assert.ok(!result.blocking);
  assert.equal(result.counts.error, 0);
});
