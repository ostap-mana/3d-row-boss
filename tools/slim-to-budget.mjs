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
  deliverable. The profiles below name what each family may give up; run with
  --dry to see the plan without touching src/assets.
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

const PROFILES = {
  light: {
    sheet: [0.94, 74],
    flat: [1, 80],
    card: [1, 80],
    claw: [0.9, 70],
    clipCrf: 26,
    audioBitrate: null,
  },
  medium: {
    sheet: [0.88, 70],
    flat: [0.92, 76],
    card: [0.94, 76],
    claw: [0.9, 70],
    clipCrf: 28,
    audioBitrate: "28k",
  },
  hard: {
    sheet: [0.82, 66],
    flat: [0.86, 72],
    card: [0.88, 72],
    claw: [0.74, 62],
    clipCrf: 30,
    audioBitrate: "24k",
  },
};
const profile = PROFILES[flag("profile", "medium")];
if (!profile) {
  process.stderr.write(`unknown profile: ${flag("profile")}\n`);
  process.exit(1);
}

const GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?'\"-+/%()[]{}*&#@x\u00d7\u2013\u2014\u2026";

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

function webp(src, dst, scale, quality) {
  const m = probe(src);
  const w = Math.max(2, Math.round((m.w * scale) / 2) * 2);
  const h = Math.max(2, Math.round((m.h * scale) / 2) * 2);
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
    m.alpha ? "yuva420p" : "yuv420p",
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

function mp3(src, dst, bitrate) {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-c:a",
    "libmp3lame",
    "-b:a",
    bitrate,
    "-ac",
    "1",
    "-ar",
    "32000",
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

function plan(rel) {
  const parts = rel.split(sep);
  const [dir, name] = [parts[0], parts[parts.length - 1]];
  if (name === "claw-rake.webp") return { kind: "webp", args: profile.claw };
  if (/\.mp4$/.test(name)) return { kind: "clip" };
  if (/\.mp3$/.test(name)) return profile.audioBitrate ? { kind: "mp3" } : null;
  if (/\.woff2$/.test(name)) return { kind: "font" };
  if (!/\.webp$/.test(name)) return null;
  if (dir === "cards") return { kind: "webp", args: profile.card };
  if (/-sheet\.webp$|-lance\.webp$|-bolt\.webp$|-rake\.webp$/.test(name))
    return { kind: "webp", args: profile.sheet };
  return { kind: "webp", args: profile.flat };
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
  const job = plan(rel);
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
    console.log(
      `  ${rel.padEnd(34)} ${job.kind} ${JSON.stringify(job.args ?? "")}`,
    );
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  if (job.kind === "webp") webp(src, dst, job.args[0], job.args[1]);
  else if (job.kind === "clip") clip(src, dst, profile.clipCrf);
  else if (job.kind === "mp3") mp3(src, dst, profile.audioBitrate);
  else if (job.kind === "font") font(src, dst);
  if (statSync(dst).size >= a) copyFileSync(src, dst);
  const b = statSync(dst).size;
  was += a;
  now += b;
  const pct = (100 - (b / a) * 100).toFixed(0);
  console.log(
    `  ${rel.padEnd(34)} ${String(Math.round(a / 1024)).padStart(5)} -> ${String(Math.round(b / 1024)).padStart(5)} kB  -${pct}%`,
  );
}

if (!dry) {
  console.log(
    `\nraw ${Math.round(was / 1024)} -> ${Math.round(now / 1024)} kB   base64 cost ~${Math.round((now * 4) / 3 / 1024)} kB`,
  );
}
