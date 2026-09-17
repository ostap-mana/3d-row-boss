import { execFileSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
cut-breath-clip — one half of a two-way fire blast, turned into the boss's jet.

  node tools/cut-breath-clip.mjs [options]

  --in <file>     the green-screen master.
                  Default src/source/board/fire-attack-boss.mp4
  --out <file>    Default src/source/fx/clips/breath.mp4
  --core <x>      where the blast's white core sits in the master, in its own
                  pixels. Everything left of it is the other stream and is
                  thrown away. Default 600.
  --side <px>     the square taken out from there. Default 680.
  --top <y>       top of that square in the master. Default 20.
  --key <hex>     backdrop colour. Default 0x64E006.
  --similarity    how far from it still counts as backdrop, 0..1. Default 0.18.
  --feather <l:r:t:b>  pixels over which each edge of the square is ramped to
                  black. Default 80:80:70:120.
  --crf <n>       x264 quality, lower is better. Default 16.

  The master is one blast firing both ways out of a core in the middle of frame,
  and a boss does not breathe in two directions, so this keeps the right-hand
  stream and drops the left. It is then turned a quarter clockwise, because the
  breath in game runs from the beast's mouth down onto the hero row and the
  master's stream runs across: the core ends up at the top and the fire falls
  out of it.

  Two corrections that are not framing, and both are about the add blend that
  src/art/spells.js plays these on.

  Green is clamped to red per pixel after the key. Fire has no pixel where green
  beats red, so it is an exact rule here rather than a taste one, and it is what
  finally took off the lit-green rim the key leaves behind wherever the backdrop
  was bright enough to survive it. Blue is clamped the same way for the same
  reason.

  And every edge of the square is ramped to black. Additively there is no such
  thing as a harmless edge: the cell is drawn as a square over the board, so
  anything still lit where the cell ends arrives as a lit rectangle with corners.
  The bottom gets the widest ramp because the jet leaves the master's frame
  rather than ending in it, and without one the fire stops in a straight line
  across the board.

  Writes a clip on pure black, which is what tools/pack-spells.mjs expects:

    node tools/pack-spells.mjs breath --start 0.75 --span 1.6 --contact
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = opt(name, null);
  return v === null ? fallback : Number(v);
};

const SRC = resolve(ROOT, opt("in", "src/source/board/fire-attack-boss.mp4"));
const OUT = resolve(ROOT, opt("out", "src/source/fx/clips/breath.mp4"));
const CORE = num("core", 600);
const SIDE = num("side", 680);
const TOP = num("top", 20);
const KEY = opt("key", "0x64E006");
const SIMILARITY = num("similarity", 0.18);
const CRF = num("crf", 16);
const [FL, FR, FT, FB] = opt("feather", "80:80:70:120").split(":").map(Number);

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => (n / 1024).toFixed(1);

if (!existsSync(SRC)) {
  process.stderr.write(`no master at ${rel(SRC)}\n`);
  process.exit(1);
}

const last = SIDE - 1;
const fade =
  `min(1,X/${FL})*min(1,(${last}-X)/${FR})` +
  `*min(1,Y/${FT})*min(1,(${last}-Y)/${FB})`;

mkdirSync(dirname(OUT), { recursive: true });
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-i",
    SRC,
    "-filter_complex",
    `[0:v]crop=${SIDE}:${SIDE}:${CORE}:${TOP},transpose=1,` +
      `colorkey=${KEY}:${SIMILARITY}:0.06,format=rgba[k];` +
      `color=black:s=${SIDE}x${SIDE}:r=24[bg];` +
      `[bg][k]overlay=shortest=1,format=gbrp,` +
      `geq=r='r(X,Y)*${fade}':` +
      `g='min(g(X,Y),r(X,Y))*${fade}':` +
      `b='min(b(X,Y),r(X,Y))*${fade}',format=yuv420p`,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    String(CRF),
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    OUT,
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);

process.stdout.write(
  `in   ${rel(SRC)}\n` +
    `     right-hand stream from x${CORE}, ${SIDE}px square at y${TOP}, ` +
    `turned a quarter clockwise\n` +
    `     key ${KEY} at ${SIMILARITY}, green and blue clamped to red, ` +
    `edges ramped ${FL}:${FR}:${FT}:${FB}\n` +
    `out  ${rel(OUT)}  ${kb(statSync(OUT).size)} kB\n` +
    `     next: node tools/pack-spells.mjs breath --start 0.75 --span 1.6\n`,
);
