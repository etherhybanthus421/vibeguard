import { cyan, gray, bold, green, red, yellow } from "./ansi.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
);
export const VERSION = pkg?.version ?? "0.0.0";

export const TAGLINE = "Your AI is confident. vibeguard is suspicious.";

export function logo() {
  return [
    "  ██╗   ██╗██╗██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗ ",
    "  ██║   ██║██║██╔══██╗██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗",
    "  ██║   ██║██║██████╔╝█████╗  ██║  ███╗██║   ██║███████║██████╔╝██║  ██║",
    "  ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║   ██║██║   ██║██╔══██║██╔══██║██║  ██║",
    "   ╚████╔╝ ██║██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝",
    "    ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ",
  ]
    .map((l) => cyan(l))
    .join("\n");
}

export function header() {
  return [logo(), "", gray(`vibeguard v${VERSION} — ${TAGLINE}`), gray(`built by @thesajidalam`), ""].join("\n");
}

export function hello() {
  return header();
}

export function fatal(msg) {
  return `${red(bold("✘ vibeguard"))} ${red(msg)}`;
}

export { bold, cyan, gray, green, red, yellow };
