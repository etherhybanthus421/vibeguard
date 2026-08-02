import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnified } from "../src/diff.mjs";

const SAMPLE = [
  "diff --git a/src/users.ts b/src/users.ts",
  "index 1111111..2222222 100644",
  "--- a/src/users.ts",
  "+++ b/src/users.ts",
  "@@ -10,3 +10,5 @@ export function old() {",
  "   const a = 1;",
  "+  const b = 2;",
  "+  // risky",
  "   return a;",
  "+}",
  "@@ -20,2 +22,3 @@",
  "+export function fresh() {",
  "+  return 1;",
  "+}",
].join("\n");

test("extracts added lines with correct numbers", () => {
  const files = parseUnified(SAMPLE);
  assert.equal(files.length, 1);
  assert.equal(files[0].file, "src/users.ts");
  assert.deepEqual(files[0].added, [
    { line: 11, text: "  const b = 2;" },
    { line: 12, text: "  // risky" },
    { line: 14, text: "}" },
    { line: 22, text: "export function fresh() {" },
    { line: 23, text: "  return 1;" },
    { line: 24, text: "}" },
  ]);
});

test("parses new files", () => {
  const text = [
    "diff --git a/src/new.ts b/src/new.ts",
    "new file mode 100644",
    "index 0000000..3333333",
    "--- /dev/null",
    "+++ b/src/new.ts",
    "@@ -0,0 +1,2 @@",
    "+line one",
    "+line two",
  ].join("\n");
  const files = parseUnified(text);
  assert.equal(files.length, 1);
  assert.ok(files[0].newFile);
  assert.equal(files[0].added.length, 2);
});

test("drops deleted and binary files", () => {
  const text = [
    "diff --git a/a/old.ts b/a/old.ts",
    "deleted file mode 100644",
    "index 111..222",
    "--- a/a/old.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "-gone",
    "diff --git a/pic.png b/pic.png",
    "Binary files a/pic.png and b/pic.png differ",
  ].join("\n");
  assert.equal(parseUnified(text).length, 0);
});

test("handles empty diff", () => {
  assert.deepEqual(parseUnified(""), []);
});
