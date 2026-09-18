import { execFileSync } from "node:child_process";
import {
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
slim-to-budget — re-encode the shipped assets down to a bundle budget.

  node tools/slim-to-budget.mjs --from <pristine-assets-dir> [--profile <name>]

  Every asset inlines as base64, so a raw byte costs 4/3 of a byte in the
  deliverable. Run with --dry to see the plan without touching src/assets.

  Resizing is the dangerous half. Most sheets are sliced with absolute pixel
  coordinates that live in a module next to the art, so a plain rescale moves
  every cell out from under its own slice and the effect renders as confetti.
  PINNED below lists each of those and the module that owns its numbers;
  those files are only ever re-encoded at their original size. To make one
  smaller, repack it with tools/shrink-sheet.mjs, which rebuilds the grid cell
  by cell and prints the new geometry, then paste that geometry into the
  module named here.

  The rest is safe because the slice is derived from the image itself:
  spells.js reads its pitch as img.width / cols, bolts.js as img.width /
  cells. Those only need the width to stay an exact multiple.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const dry = args.includes("--dry");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "src/assets");
const FROM = resolve(flag("from", DEST));
if (!existsSync(FROM)) {
  process.stderr.write(`no such directory: ${FROM}\n`);
  process.exit(1);
}

const PINNED = [
  [/^fx.claw-rake\.webp$/, "art/rake.js"],
  [/^fx.torrent-sheet\.webp$/, "art/streams.js"],
  [/^fx.fire-lance\.webp$/, "art/streams.js"],
  [/^fx.fire-sheet\.webp$/, "art/fire.js"],
  [/^fx.gem-charge\.webp$/, "art/gemcharge.js"],
  [/^fx.gem-pop\.webp$/, "art/gempop.js"],
  [/^fx.ready-/, "art/readyfx.js"],
  [/^cards.ult-/, "art/ultborder.js"],
];

const DERIVED = [
  [/^fx.[a-z]+-sheet\.webp$/, 5],
  [/^fx.water-lance\.webp$/, 8],
];

const KEEP = [
  /^fx.claw-rake\.webp$/,
  /^fx.torrent-sheet\.webp$/,
  /^fx.fire-lance\.webp$/,
];

const PROFILES = {
  light: { derived: [0.94, 76], flat: [1, 82], pinnedQ: 80, clipCrf: 26 },
  medium: { derived: [0.88, 72], flat: [0.9, 76], pinnedQ: 72, clipCrf: 28 },
  hard: { derived: [0.82, 68], flat: [0.86, 74], pinnedQ: 66, clipCrf: 30 },
};
const profile = PROFILES[flag("profile", "medium")];
if (!profile) {
  process.stderr.write(`unknown profile: ${flag("profile")}\n`);
  process.exit(1);
}

const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?'\"-+/%()[]{}*&#@x×–—…";

function probe(file) {
  const [w, h, pix] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,pix_fmt",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim()
    .split(",");
  return { w: Number(w), h: Number(h), alpha: pix.includes("a") };
}

function encode(src, dst, w, h, quality, alpha) {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-vf",
    `scale=${w}:${h}:flags=lanczos`,
    "-c:v",
    "libwebp",
    "-quality",
    String(quality),
    "-preset",
    "picture",
    "-compression_level",
    "6",
    "-pix_fmt",
    alpha ? "yuva420p" : "yuv420p",
    dst,
  ]);
}

function clip(src, dst, crf) {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-vf",
    "addroi=0:ih/2:iw:ih/2:qoffset=1/5",
    "-c:v",
    "libx264",
    "-preset",
    "veryslow",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    dst,
  ]);
}

const PYTHON = (() => {
  for (const exe of [
    flag("python", null),
    "python",
    "python3",
    join(
      process.env.USERPROFILE ?? "",
      ".pyenv/pyenv-win/versions/3.10.0/python.exe",
    ),
  ]) {
    if (!exe) continue;
    try {
      execFileSync(exe, ["-c", "import fontTools"], { stdio: "ignore" });
      return exe;
    } catch {
      continue;
    }
  }
  return null;
})();

function font(src, dst) {
  if (!PYTHON) {
    copyFileSync(src, dst);
    return;
  }
  execFileSync(PYTHON, [
    "-m",
    "fontTools.subset",
    src,
    `--text=${GLYPHS}`,
    "--layout-features=kern,liga",
    "--flavor=woff2",
    "--with-zopfli",
    `--output-file=${dst}`,
  ]);
}

function plan(rel, m) {
  const key = rel.split(sep).join("/");
  const name = key.split("/").pop();
  if (/\.mp4$/.test(name))
    return { kind: "clip", note: "crf " + profile.clipCrf };
  if (/\.mp3$/.test(name)) return null;
  if (/\.woff2$/.test(name)) return { kind: "font", note: "subset" };
  if (!/\.webp$/.test(name)) return null;
  if (KEEP.some((re) => re.test(key))) return null;

  const pin = PINNED.find(([re]) => re.test(key));
  if (pin) {
    return {
      kind: "webp",
      w: m.w,
      h: m.h,
      q: profile.pinnedQ,
      note: `pinned by ${pin[1]}`,
    };
  }

  const derived = DERIVED.find(([re]) => re.test(key));
  if (derived) {
    const [scale, q] = profile.derived;
    const cols = derived[1];
    const pitch = Math.max(2, Math.round((m.w / cols) * scale));
    const w = pitch * cols;
    const rows = Math.max(1, Math.round(m.h / (m.w / cols)));
    const h = Math.max(rows * pitch, Math.round((m.h * w) / m.w / 2) * 2);
    return { kind: "webp", w, h, q, note: `derived, pitch ${pitch}` };
  }

  const [scale, q] = profile.flat;
  return {
    kind: "webp",
    w: Math.max(2, Math.round((m.w * scale) / 2) * 2),
    h: Math.max(2, Math.round((m.h * scale) / 2) * 2),
    q,
    note: "flat",
  };
}

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    e.isDirectory() ? walk(p) : files.push(p);
  }
})(FROM);

let was = 0;
let now = 0;
for (const src of files) {
  const rel = relative(FROM, src);
  const dst = join(DEST, rel);
  const a = statSync(src).size;
  const m = /\.(webp|mp4)$/.test(src) ? probe(src) : null;
  const job = plan(rel, m);
  if (!job) {
    if (!dry && src !== dst) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
    was += a;
    now += a;
    continue;
  }
  if (dry) {
    console.log(`  ${rel.padEnd(34)} ${job.note}`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  if (job.kind === "webp") encode(src, dst, job.w, job.h, job.q, m.alpha);
  else if (job.kind === "clip") clip(src, dst, profile.clipCrf);
  else if (job.kind === "font") font(src, dst);
  if (statSync(dst).size >= a) copyFileSync(src, dst);
  const b = statSync(dst).size;
  was += a;
  now += b;
  const pct = (100 - (b / a) * 100).toFixed(0);
  console.log(
    `  ${rel.padEnd(34)} ${String(Math.round(a / 1024)).padStart(5)} -> ${String(Math.round(b / 1024)).padStart(5)} kB  -${pct}%  ${job.note}`,
  );
}

if (!dry) {
  console.log(
    `\nraw ${Math.round(was / 1024)} -> ${Math.round(now / 1024)} kB   base64 cost ~${Math.round((now * 4) / 3 / 1024)} kB`,
  );
}
