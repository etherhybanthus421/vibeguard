export function toRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      let j = glob.indexOf("}", i);
      if (j === -1) {
        re += "\\{";
      } else {
        const inner = glob.slice(i + 1, j).split(",").map((p) => p.trim()).join("|");
        re += `(?:${inner})`;
        i = j;
      }
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  re += "$";
  return new RegExp(re);
}

export function matches(path, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const normalized = path.replace(/\\/g, "/");
  for (const p of patterns) {
    if (toRegExp(p).test(normalized)) return true;
  }
  return false;
}
