#!/usr/bin/env node
import { run } from "../src/cli.mjs";

process.stdout.on("error", (err) => {
  if (err && err.code === "EPIPE") process.exit(0);
  throw err;
});
process.stderr.on("error", (err) => {
  if (err && err.code === "EPIPE") process.exit(0);
  throw err;
});

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`vibeguard crashed: ${err && err.message ? err.message : err}\n`);
  process.stderr.write("this is a bug — please report it at https://github.com/thesajidalam/vibeguard/issues\n");
  process.exitCode = 2;
}
