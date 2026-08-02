import { execFileSync } from "node:child_process";

export function gitDiff({ staged = false, base = null } = {}) {
  const args = ["diff", "--unified=0"];
  if (staged) args.push("--cached");
  else if (base) args.push(base);
  args.push("--");
  const out = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return out;
}

export function resolveDefaultBase() {
  try {
    execFileSync("git", ["rev-parse", "HEAD~1"], { stdio: ["ignore", "pipe", "pipe"] });
    return "HEAD~1";
  } catch {
    return null;
  }
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnified(text) {
  const files = [];
  let current = null;
  let inHunk = false;
  let newLine = 0;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw;

    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/\S+ b\/(\S+)/);
      current = {
        file: m ? m[1] : "?",
        added: [],
        newFile: false,
        deleted: false,
        binary: false,
      };
      inHunk = false;
      files.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith("new file mode")) {
      current.newFile = true;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.deleted = true;
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
      continue;
    }
    if (line.startsWith("rename ")) {
      current.deleted = true;
      continue;
    }

    const hunk = line.match(HUNK_RE);
    if (hunk) {
      inHunk = true;
      newLine = parseInt(hunk[3], 10);
      continue;
    }

    if (inHunk) {
      if (line.startsWith("+")) {
        const body = line.slice(1);
        if (body.startsWith("+++")) {
          inHunk = false;
          continue;
        }
        current.added.push({ line: newLine, text: body });
        newLine++;
      } else if (line.startsWith("-")) {
        // removed line, does not advance the target line counter
      } else if (line.startsWith("\\ No newline")) {
        // marker, no line shift
      } else {
        newLine++;
      }
    }
  }

  return files.filter((f) => !f.deleted && !f.binary && f.added.length > 0);
}

export function isGitRepo() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}
