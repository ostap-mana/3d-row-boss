import { execFileSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
cut-breath-clip — a green-screen fire jet, turned into the boss's breath.

  node tools/cut-breath-clip.mjs [options]

  --in <file>     the green-screen master.
                  Default src/source/board/fire-breath-v2.mp4
  --out <file>    Default src/source/fx/clips/breath.mp4
  --core <x>      where along the jet the square starts, in the master's own
                  pixels. Default 320 — far enough down the stream to catch the
                  flame tongues rather than the bare white core, which on its
                  own is a pale column with no shape in it.
  --side <px>     the square taken out from there. Default 720.
  --top <y>       top of that square in the master. Default 0.
  --key <hex>     backdrop colour. Default 0x2BF821.
  --similarity    how far from it still counts as backdrop, 0..1. Default 0.20.
  --feather <l:r:t:b>  pixels over which each edge of the square is ramped to
                  black. Default 95:95:60:150.
  --gamma <n>     curve applied after the key, above 1 darkens the mid tones.
                  Default 1.7. This is the number that decides whether the jet
                  reads as fire at all: the master is a dense wall of bright
                  yellow, and added over a board already full of lit gems a wall
                  is a white wash with no shape in it. Bending the mids down
                  puts the gaps between the tongues back on black, and on the
                  add blend black is what draws the flame's edge.
  --level <n>     flat multiplier after the curve. Default 0.88.
  --warm <g:b>    what green and blue keep of themselves at the end. Default
                  0.85:0.5. The master is pale yellow-white, and pale is the
                  worst thing to add over a board of lit gems: luminance goes up
                  everywhere and nothing reads. Holding the cool channels back
                  makes the same fire land as red and orange, which tints the
                  board instead of bleaching it, and leaves the white core the
                  only truly white thing in the shot.
  --crf <n>       x264 quality, lower is better. Default 16.

  The master is a single jet firing left to right across a green screen, longer
  than any square can hold, so a square is taken from part-way along it and the
  rest is let go. It is then turned a quarter clockwise, because the breath in
  game runs from the beast's mouth down onto the hero row while the master's
  stream runs across: the core ends up at the top and the fire falls out of it.

  Where that square starts is the one framing decision worth making. Taken from
  the mouth of the jet it is mostly the white core, which is a pale column with
  no edges in it; taken from further along it is the tongues, which is the part
  that reads as fire.

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

    node tools/pack-spells.mjs breath --start 1.4 --span 2.2 --contact
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

const SRC = resolve(ROOT, opt("in", "src/source/board/fire-breath-v2.mp4"));
const OUT = resolve(ROOT, opt("out", "src/source/fx/clips/breath.mp4"));
const CORE = num("core", 320);
const SIDE = num("side", 720);
const TOP = num("top", 0);
const KEY = opt("key", "0x2BF821");
const SIMILARITY = num("similarity", 0.2);
const GAMMA = num("gamma", 1.7);
const LEVEL = num("level", 0.88);
const [WG, WB] = opt("warm", "0.85:0.5").split(":").map(Number);
const CRF = num("crf", 16);
const [FL, FR, FT, FB] = opt("feather", "95:95:60:150").split(":").map(Number);

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
const curve = (ch, keep) =>
  `pow(${ch}/255,${GAMMA})*255*${LEVEL * keep}*${fade}`;

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
      `geq=r='${curve("r(X,Y)", 1)}':` +
      `g='${curve("min(g(X,Y),r(X,Y))", WG)}':` +
      `b='${curve("min(b(X,Y),r(X,Y))", WB)}',format=yuv420p`,
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
    `     ${SIDE}px square from x${CORE}, y${TOP}, ` +
    `turned a quarter clockwise\n` +
    `     key ${KEY} at ${SIMILARITY}, green and blue clamped to red, ` +
    `edges ramped ${FL}:${FR}:${FT}:${FB}\n` +
    `out  ${rel(OUT)}  ${kb(statSync(OUT).size)} kB\n` +
    `     next: node tools/pack-spells.mjs breath --start 1.4 --span 2.2\n`,
);
