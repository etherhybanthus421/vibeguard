// A deliberately tiny YAML subset parser. Enough for vibeguard config files:
// comments, `key: value`, one level of nested maps, and `- item` lists.
// No external deps. Same input -> same output, every time.

export function parseYaml(text) {
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = stripComment(raw);
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[\s-]+$/.test(trimmed)) continue;
    lines.push({ indent: line.length - line.trimStart().length, text: trimmed });
  }

  let i = 0;

  function parseScalar(s) {
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    if (s.length >= 2 && /^["'].*["']$/.test(s)) return s.slice(1, -1);
    return s;
  }

  function parseList(keyIndent) {
    const list = [];
    while (i < lines.length) {
      const item = lines[i];
      if (item.indent < keyIndent) break;
      if (!item.text.startsWith("- ")) break;
      list.push(parseScalar(item.text.slice(2).trim()));
      i++;
    }
    return list;
  }

  function parseBlock(minIndent) {
    const node = {};
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.indent <= minIndent) break;
      if (cur.text.startsWith("- ")) {
        i++;
        continue;
      }
      const m = cur.text.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
      if (!m) {
        i++;
        continue;
      }
      const key = m[1];
      const rest = m[2].trim();
      i++;
      const next = lines[i];
      if (rest === "") {
        if (next && next.indent > cur.indent && next.text.startsWith("- ")) {
          node[key] = parseList(cur.indent);
        } else if (next && next.indent > cur.indent) {
          node[key] = parseBlock(cur.indent);
        } else {
          node[key] = null;
        }
      } else {
        node[key] = parseScalar(rest);
      }
    }
    return node;
  }

  return parseBlock(-1);
}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}
