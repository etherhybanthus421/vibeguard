import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml } from "../src/yaml.mjs";

test("parses comments, scalars, nested maps and lists", () => {
  const yaml = `
# a comment
envfile: .env.example

rules:
  secret: error
  swallow: warn
  count: 3

exclude:
  - node_modules/**
  - "*.lock"
  - dist/**
`;
  const out = parseYaml(yaml);
  assert.equal(out.envfile, ".env.example");
  assert.equal(out.rules.secret, "error");
  assert.equal(out.rules.swallow, "warn");
  assert.equal(out.rules.count, 3);
  assert.deepEqual(out.exclude, ["node_modules/**", "*.lock", "dist/**"]);
});

test("parses booleans and null", () => {
  const out = parseYaml("debug: false\nnothing: null\n");
  assert.equal(out.debug, false);
  assert.equal(out.nothing, null);
});

test("ignores comment-only lines and inline comments", () => {
  const out = parseYaml("# header\nenvfile: .env.example # trailing comment\n");
  assert.equal(out.envfile, ".env.example");
});

test("handles quoted strings", () => {
  const out = parseYaml('quote: "hello world"\nsingle: \'abc 123\'\n');
  assert.equal(out.quote, "hello world");
  assert.equal(out.single, "abc 123");
});
