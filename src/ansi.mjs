let enabled = process.stdout && process.stdout.isTTY && !process.env.NO_COLOR;

export function setColor(on) {
  enabled = on;
}

const wrap = (code, close) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[${close}m` : s);

export const red = wrap(31, 0);
export const green = wrap(32, 0);
export const yellow = wrap(33, 0);
export const blue = wrap(34, 0);
export const magenta = wrap(35, 0);
export const cyan = wrap(36, 0);
export const gray = wrap(90, 0);
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const underline = wrap(4, 24);
