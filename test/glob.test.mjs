import { test } from "node:test";
import assert from "node:assert/strict";
import { toRegExp, matches } from "../src/glob.mjs";

test("matches star", () => {
  assert.ok(toRegExp("*.lock").test("app.lock"));
  assert.ok(!toRegExp("*.lock").test("src/app.js"));
});

test("matches double star across directories", () => {
  const re = toRegExp("node_modules/**");
  assert.ok(re.test("node_modules/pkg/index.js"));
  assert.ok(re.test("node_modules/pkg"));
  assert.ok(!re.test("src/node_modules/x.js"));
});

test("matches path wildcards", () => {
  const re = toRegExp("src/**");
  assert.ok(re.test("src/a/b/c.ts"));
  assert.ok(!re.test("lib/a.ts"));
});

test("matches brace groups", () => {
  const re = toRegExp("*.{js,ts,py}");
  assert.ok(re.test("a.js"));
  assert.ok(re.test("b.ts"));
  assert.ok(re.test("c.py"));
  assert.ok(!re.test("d.go"));
});

test("normalizes backslashes to forward slashes", () => {
  assert.ok(matches("src\\app\\index.ts", ["src/**"]));
});

test("matches question mark", () => {
  assert.ok(toRegExp("a?.js").test("ab.js"));
  assert.ok(!toRegExp("a?.js").test("abc.js"));
});
