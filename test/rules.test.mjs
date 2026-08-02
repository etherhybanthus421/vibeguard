import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECRET, ENVHOLE, SWALLOW, NULLACCESS, SLEEPFIX, DEBUGPRINT,
  DUMMY, MINIFIED, DEADIMPORT, BIGNEW, isTestFile,
} from "../src/rules.mjs";

const L = (texts) => texts.map((text, i) => ({ line: i + 1, text }));

test("secret: catches real-looking keys and ignores placeholders", () => {
  const out = SECRET.run("a.ts", L([
    'const key = "sk-live-9f2c1a5b8e4d7a0c3f6e9b1d2a4c7e8f";',
    'const ok = "sk-test-abcdefghijklmnopqrstuvwxyz";',
    'const password = "sup3r-s3cret-password!";',
    'const example = "sk-example-please-change-me";',
  ]));
  assert.equal(out.length, 2);
  assert.ok(out.some((f) => f.message.includes("OpenAI")));
  assert.ok(out.some((f) => f.message.includes("password")));
});

test("secret: catches private keys", () => {
  const out = SECRET.run("k.ts", L(['-----BEGIN RSA PRIVATE KEY-----']));
  assert.equal(out.length, 1);
});

test("envhole: flags undeclared reads, skips fallback and declared", () => {
  const ctx = { envKeys: new Set(["DB_URL"]), envFileLabel: ".env.example" };
  const out = ENVHOLE.run("a.ts", L([
    "const a = process.env.AUTH_TOKEN;",
    "const b = process.env.NODE_ENV;",
    "const c = process.env.DB_URL;",
    "const d = process.env.API_KEY || \"fallback\";",
    "const e = process.env.SECRET ?? \"none\";",
  ]), ctx);
  assert.equal(out.length, 1);
  assert.ok(out[0].message.includes("AUTH_TOKEN"));
});

test("envhole: understands os.getenv with default", () => {
  const out = ENVHOLE.run("a.py", L([
    'import os',
    'a = os.getenv("MISSING")',
    'b = os.getenv("ALSO_MISSING", "safe")',
  ]), { envKeys: new Set(), envFileLabel: ".env" });
  assert.equal(out.length, 1);
  assert.ok(out[0].message.includes("MISSING"));
  assert.ok(!out[0].message.includes("ALSO_MISSING"));
});

test("swallow: catches empty single-line and multiline catch", () => {
  const out = SWALLOW.run("a.ts", L([
    "try {",
    "  doThing();",
    "} catch (e) {}",
    "try {",
    "  doThing();",
    "} catch (err) {",
    "  // ignore",
    "}",
  ]));
  assert.equal(out.length, 2);
});

test("swallow: ignores a catch that actually handles", () => {
  const out = SWALLOW.run("a.ts", L([
    "try {",
    "  doThing();",
    "} catch (e) {",
    "  console.error(e);",
    "}",
  ]));
  assert.equal(out.length, 0);
});

test("swallow: catches python except pass", () => {
  const out = SWALLOW.run("a.py", L([
    "try:",
    "    do_thing()",
    "except Exception:",
    "    pass",
  ]));
  assert.equal(out.length, 1);
});

test("nullaccess: flags unguarded access after find", () => {
  const out = NULLACCESS.run("a.ts", L([
    "const user = db.users.find(u => u.id === id);",
    "await fetch(user.email);",
  ]));
  assert.equal(out.length, 1);
  assert.ok(out[0].message.includes("user"));
});

test("nullaccess: allows optional chaining and guards", () => {
  const outA = NULLACCESS.run("a.ts", L([
    "const user = db.users.find(u => u.id === id);",
    "await fetch(user?.email);",
  ]));
  assert.equal(outA.length, 0);

  const outB = NULLACCESS.run("b.ts", L([
    "const user = db.users.find(u => u.id === id);",
    "if (!user) return null;",
    "await fetch(user.email);",
  ]));
  assert.equal(outB.length, 0);
});

test("nullaccess: flags same-line access after find", () => {
  const out = NULLACCESS.run("a.ts", L([
    "const email = users.find(u => u.id === id).email;",
  ]));
  assert.equal(out.length, 1);
});

test("nullaccess: does not flag when fallback is used", () => {
  const out = NULLACCESS.run("a.ts", L([
    "const user = db.users.find(u => u.id === id) ?? {};",
    "await fetch(user.email);",
  ]));
  assert.equal(out.length, 0);
});

test("sleepfix: flags time.sleep in non-test code", () => {
  assert.equal(SLEEPFIX.run("a.py", L(["time.sleep(2)"])).length, 1);
  assert.ok(SLEEPFIX.applies("a.py"));
  assert.ok(!SLEEPFIX.applies("a_test.py"));
  assert.equal(SLEEPFIX.run("a.java", L(["Thread.sleep(500)"])).length, 1);
});

test("debugprint: flags console.log outside tests", () => {
  assert.equal(DEBUGPRINT.run("a.ts", L(['console.log("hi")'])).length, 1);
  assert.ok(DEBUGPRINT.applies("a.ts"));
  assert.ok(!DEBUGPRINT.applies("a.test.ts"));
});

test("dummy: flags placeholders but not comments", () => {
  const out = DUMMY.run("a.ts", L([
    "const key = 'your-api-key';",
    "// TODO: handle this",
    "const cfg = 'changeme';",
  ]));
  assert.equal(out.length, 2);
});

test("minified: flags enormous lines", () => {
  const big = "let x = '" + "a".repeat(500) + "';";
  assert.equal(MINIFIED.run("a.js", L([big])).length, 1);
  assert.equal(MINIFIED.run("a.js", L(["const small = 1;"])).length, 0);
});

test("deadimport: flags unused, allows used", () => {
  const src = [
    'import { helper } from "./helper";',
    'import { usedThing } from "./used";',
    "",
    "usedThing();",
    "",
  ].join("\n");
  const ctx = { readFile: () => src };
  const out = DEADIMPORT.run("a.ts", L([
    'import { helper } from "./helper";',
    'import { usedThing } from "./used";',
  ]), ctx);
  assert.equal(out.length, 1);
  assert.ok(out[0].message.includes("helper"));
});

test("deadimport: python", () => {
  const ctx = { readFile: () => "import json\nimport os\n\nos.path.join('a', 'b')\n" };
  const out = DEADIMPORT.run("a.py", L([
    "import json",
    "import os",
  ]), ctx);
  assert.equal(out.length, 1);
  assert.ok(out[0].message.includes("json"));
});

test("bignew: flags 800+ line new files", () => {
  const lines = Array.from({ length: 900 }, (_, i) => ({ line: i + 1, text: "x" }));
  assert.equal(BIGNEW.run("big.ts", lines, { isNewFile: true }).length, 1);
  assert.equal(BIGNEW.run("big.ts", lines, { isNewFile: false }).length, 0);
});

test("isTestFile detection", () => {
  assert.ok(isTestFile("src/foo.test.ts"));
  assert.ok(isTestFile("test/foo.ts"));
  assert.ok(isTestFile("src/__tests__/foo.ts"));
  assert.ok(!isTestFile("src/foo.ts"));
});
