import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { KNOB_ROOTS, planEdits } from "../src/dev/knobs.js";

const CONFIG = resolve(import.meta.dirname, "../src/config.js");

const isSpace = (c) => c === " " || c === "\n" || c === "\t" || c === "\r";

function skipSpace(src, i) {
  while (i < src.length && isSpace(src[i])) i++;
  return i;
}

function skipQuoted(src, i) {
  const quote = src[i++];
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function readValue(src, i, path, out) {
  i = skipSpace(src, i);

  if (src[i] === "{") {
    i++;
    for (;;) {
      i = skipSpace(src, i);
      if (i >= src.length || src[i] === "}") return i + 1;
      let key;
      if (src[i] === '"' || src[i] === "'") {
        const end = skipQuoted(src, i);
        key = src.slice(i + 1, end - 1);
        i = end;
      } else {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
        key = src.slice(i, j);
        i = j;
      }
      i = skipSpace(src, i);
      if (src[i] !== ":") return i;
      i = readValue(src, i + 1, path ? `${path}.${key}` : key, out);
      i = skipSpace(src, i);
      if (src[i] === ",") i++;
    }
  }

  if (src[i] === "[") {
    i++;
    let index = 0;
    for (;;) {
      i = skipSpace(src, i);
      if (i >= src.length || src[i] === "]") return i + 1;
      i = readValue(src, i, `${path}.${index}`, out);
      index++;
      i = skipSpace(src, i);
      if (src[i] === ",") i++;
    }
  }

  const from = i;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      i = skipQuoted(src, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && (c === "," || c === ";" || c === "\n")) break;
    i++;
  }
  let to = i;
  while (to > from && isSpace(src[to - 1])) to--;
  out.set(path, { from, to, text: src.slice(from, to) });
  return i;
}

function scan(src, roots) {
  const spans = new Map();
  roots.forEach((root) => {
    const at = src.search(new RegExp(`export const ${root}\\s*=`));
    if (at < 0) return;
    const eq = src.indexOf("=", at);
    readValue(src, eq + 1, root, spans);
  });
  return spans;
}

function literal(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function applyBalance(state, options) {
  const path = (options && options.file) || CONFIG;
  const src = readFileSync(path, "utf8");
  const spans = scan(src, [...KNOB_ROOTS, "WORLD_RATE"]);

  const read = (key) => {
    const span = spans.get(key);
    if (!span) return undefined;
    if (span.text === "true") return true;
    if (span.text === "false") return false;
    const n = Number(span.text);
    return Number.isFinite(n) ? n : undefined;
  };

  const edits = planEdits(state, read).filter(
    (edit) => edit.value !== edit.base && spans.has(edit.path),
  );

  if (!edits.length) return { count: 0, changed: [] };

  let out = src;
  edits
    .map((edit) => ({ ...edit, span: spans.get(edit.path) }))
    .sort((a, b) => b.span.from - a.span.from)
    .forEach((edit) => {
      out =
        out.slice(0, edit.span.from) +
        literal(edit.value) +
        out.slice(edit.span.to);
    });

  if (!(options && options.dry)) writeFileSync(path, out, "utf8");

  return {
    count: edits.length,
    changed: edits.map((edit) => ({
      path: edit.path,
      from: edit.base,
      to: edit.value,
    })),
  };
}

function readStdin() {
  return new Promise((done) => {
    let text = "";
    if (process.stdin.isTTY) return done("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => done(text));
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry");
  const dry = process.argv.includes("--dry");
  const raw = args[0] || (await readStdin());
  if (!raw.trim()) {
    console.log(
      'usage: node tools/apply-balance.mjs \'{"knobs":{"damage":1.2}}\' [--dry]',
    );
    return;
  }
  const done = applyBalance(JSON.parse(raw), { dry });
  done.changed.forEach((edit) =>
    console.log(`${edit.path}: ${edit.from} -> ${edit.to}`),
  );
  console.log(
    done.count
      ? `${dry ? "would write" : "wrote"} ${done.count} value(s) in src/config.js`
      : "nothing to change",
  );
}

if (process.argv[1] && process.argv[1].endsWith("apply-balance.mjs")) main();
