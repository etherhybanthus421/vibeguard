import { cyan, gray, bold, green, red, yellow } from "./ansi.mjs";

export const VERSION = "1.0.0";

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
