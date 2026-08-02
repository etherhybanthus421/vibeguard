import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin", "vibeguard.mjs");

function run(args, opts = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: opts.cwd || root,
    env: { ...process.env, NO_COLOR: "1", ...(opts.env || {}) },
  });
}

test("cli: -v prints the version banner", () => {
  const r = run(["-v"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /vibeguard/i);
});

test("cli: -h prints usage and credits the author", () => {
  const r = run(["-h"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /vibeguard <command>/);
  assert.match(r.stdout, /thesajidalam/);
});

test("cli: no args prints help (exit 0)", () => {
  const r = run([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /COMMANDS/);
});

test("cli: unknown command exits 2 with a hint", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});

test("cli: scan of a missing path exits 2", () => {
  const r = run(["scan", "does-not-exist-anywhere"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not found/);
});

test("cli: demo runs end-to-end and catches the fixture bugs", () => {
  const r = run(["demo"]);
  assert.equal(r.status, 1, `demo should be blocked by its own fixture: ${r.stderr}`);
  assert.match(r.stdout, /BLOCKED/);
  assert.match(r.stdout, /hardcoded OpenAI-style API key/);
  assert.match(r.stdout, /empty catch block/);
});

test("cli: scan of the demo fixture flags at least the secret", () => {
  const fixture = path.join(root, "demo", "fixtures", "users.ts");
  const r = run(["scan", fixture]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /hardcoded OpenAI-style API key/);
});

test("cli: check outside a git repo exits 2 (not a git repository)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vibeguard-nogit-"));
  try {
    const r = run(["check"], { cwd: tmp });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not a git repository/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
