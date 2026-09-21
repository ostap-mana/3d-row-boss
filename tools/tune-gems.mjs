import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync, existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "masters/gems";
const OUT_DIR = "src/assets/gems";

const GEMS = ["fire", "water", "nature", "lightning", "arcane", "wind"];

const SATURATION = 0.87;
const QUALITY = 82;

const USAGE = `
tune-gems — re-encode the board gems off their masters.

  node tools/tune-gems.mjs [--saturation 0.87]

  The gems are the largest painted surface in the creative: twenty-five of
  them fill more than half the board. They shipped at full saturation, which
  put them level with the arena behind and left everything shouting at once.
  Pulling them back lets the background and the boss come forward.

  Reads masters/gems/*.webp and writes src/assets/gems/*.webp, so the knob is
  re-runnable without stacking loss on an already-processed file.

  --saturation <n>  1 keeps the master, 0.87 takes 13% out. Default 0.87.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};

const saturation = flag("saturation", SATURATION);
if (!(saturation > 0) || saturation > 2) {
  process.stderr.write(`saturation out of range: ${saturation}\n`);
  process.exit(1);
}

let before = 0;
let after = 0;

for (const name of GEMS) {
  const src = join(ROOT, SRC_DIR, `${name}.webp`);
  const out = join(ROOT, OUT_DIR, `${name}.webp`);
  if (!existsSync(src)) {
    process.stderr.write(`no master: ${src}\n`);
    process.exit(1);
  }

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      src,
      "-vf",
      `format=rgba,hue=s=${saturation},format=rgba`,
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      String(QUALITY),
      "-compression_level",
      "6",
      "-pix_fmt",
      "yuva420p",
      out,
    ],
    { stdio: "inherit" },
  );

  const from = statSync(src).size;
  const to = statSync(out).size;
  before += from;
  after += to;
  process.stdout.write(
    `${name.padEnd(10)} ${(from / 1024).toFixed(1)} kB -> ${(to / 1024).toFixed(1)} kB\n`,
  );
}

process.stdout.write(
  `gems at saturation ${saturation}: ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB\n`,
);
