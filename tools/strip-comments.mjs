import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const espree = require("espree");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["src", "tools"];
const SKIP = new Set(["node_modules", "dist", "dist-phone", ".git", "video"]);
const EXT = /\.(js|mjs|cjs)$/;

const rel = (p) => relative(ROOT, p).split(sep).join("/");

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

function comments(code) {
  const found = [];
  espree.parse(code, {
    ecmaVersion: "latest",
    sourceType: "module",
    comment: true,
    loc: false,
    range: true,
    onComment: found,
  });
  return found;
}

function strip(code) {
  const list = comments(code);
  if (!list.length) return { code, cut: 0 };

  let out = code;
  for (let i = list.length - 1; i >= 0; i--) {
    const [from, to] = list[i].range;

    let head = from;
    while (head > 0 && (out[head - 1] === " " || out[head - 1] === "\t"))
      head--;
    const alone = head === 0 || out[head - 1] === "\n";

    let tail = to;
    if (alone) {
      while (tail < out.length && (out[tail] === " " || out[tail] === "\t")) {
        tail++;
      }
      if (out[tail] === "\r") tail++;
      if (out[tail] === "\n") tail++;
      out = out.slice(0, head) + out.slice(tail);
    } else {
      out = out.slice(0, head) + out.slice(tail);
    }
  }
  return { code: out, cut: list.length };
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r), []));
const check = process.argv.includes("--check");
let total = 0;
const dirty = [];

for (const file of files) {
  const code = readFileSync(file, "utf8");
  let result;
  try {
    result = strip(code);
  } catch (err) {
    console.log(`SKIP ${rel(file)} — ${err.message}`);
    continue;
  }
  if (!result.cut) continue;
  total += result.cut;
  dirty.push(`${rel(file)}  ${result.cut}`);
  if (!check) writeFileSync(file, result.code);
}

if (!dirty.length) {
  console.log(`clean — no comments in ${files.length} file(s)`);
} else {
  dirty.forEach((d) => console.log(d));
  console.log(
    `\n${total} comment(s) in ${dirty.length} file(s)` +
      (check ? " — run without --check to strip" : " — stripped"),
  );
}
process.exit(check && dirty.length ? 1 : 0);
