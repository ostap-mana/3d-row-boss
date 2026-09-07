/**
 * Pack the glow-on-black RETRY divider into a real asset.
 *
 *   node tools/pack-retry-glow.mjs           # -> src/assets/brand/retry-glow.webp
 *   node tools/pack-retry-glow.mjs --png     # keep the intermediate PNG too
 *   node tools/pack-retry-glow.mjs --proof   # composite it over the end card's ground
 *
 * The source is `src/source/endcard/retry-glow.png`, 2170x725: a gold hairline
 * running the full width with a refresh arrow and RETRY set in thin capitals in
 * a break at the middle, four blue diamonds along it, all of it drawn as light
 * on a flat near-black ground.
 *
 * ## Why this is not cut-bg.mjs
 *
 * That keyer classifies a backdrop pixel as flat *and light*, floods in from the
 * border and decontaminates the edge — which is the right three passes for art
 * delivered on white, and finds nothing at all here. The ground on this one is
 * near-black, and it is not a backdrop that has to be identified and removed: it
 * is the absence of the thing being drawn. Gold light on black *is* its own
 * matte, and the alpha it wants is how bright each pixel already is.
 *
 * So there is no classifier, no flood and no pocket sweep in this file. What
 * there is instead is a subtraction, and it is the whole of the method.
 *
 * The ground is not black. It is measured at rgb(10,14,24) on this delivery — a
 * navy, and 98% of the frame is within a couple of levels of it — so alpha taken
 * straight off brightness hands back a dim navy rectangle covering the card with
 * the art faintly on top of it. The ground is *read off the border* and then
 * subtracted from every pixel; what is left is the light the artist added, and
 * that residual is both the colour and the alpha.
 *
 * That inversion is exact rather than approximate, because it is the inverse of
 * how the picture was made: a glow composited onto a flat ground is ground plus
 * light, so light is the picture minus ground. Nothing is thresholded, nothing
 * is classified, and a pixel the artist left at the ground goes to exactly zero
 * rather than to nearly zero.
 *
 * The colour is then unpremultiplied — divided back up by its own alpha — so the
 * gold reads as gold at every opacity rather than going muddy where the line is
 * faint. Drawn additively that division makes no difference; drawn normally it
 * is the difference between a hairline and a smear.
 *
 * FLOOR is left as the noise gate under all of it: a lossy save leaves the
 * ground dithered a level or two either side of its own value, and half of that
 * dither survives the subtraction as single-level speckle across the whole card.
 *
 * ## Trim
 *
 * The hairline fades out long before the edge of the frame, so a straight pack
 * would spend a third of its pixels on transparent margin and then ask the
 * layout to know how much. The bounding box of everything above FLOOR is taken
 * here and the art is cropped to it, which is what every other packer in this
 * folder does with `--trim`.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/endcard/retry-glow.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "retry-glow");

/**
 * Alpha under this is the encoder's noise floor rather than the art, and is
 * taken to nothing. Six of 255: high enough to clear a near-black ground that
 * saved at three or four, low enough that the outer end of the hairline — which
 * is genuinely faint — still fades rather than stopping.
 */
const FLOOR = 6;

/**
 * The shipping width. The divider is drawn about 300 points across on a phone,
 * so 1024 is a comfortable three device pixels per point at a renderer clamped
 * to resolution 2 — and it is what retry-line.webp already ships at, which
 * keeps the two interchangeable in the layout.
 */
const WIDTH = 1024;

const QUALITY = 86;

/** The card this lands on, for --proof. Near-black, faintly blue. */
const PROOF_BG = [11, 6, 24];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x").map(Number);
  return { w, h };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    {
      maxBuffer: 1 << 29,
    },
  );
}

function encode(buf, w, h, file, args) {
  mkdirSync(dirname(file), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${w}x${h}`,
      "-i",
      "pipe:0",
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

/* --------------------------------------------------------------------- work */

if (!existsSync(SRC)) {
  console.error(`missing source: ${rel(SRC)}`);
  process.exit(1);
}

const flags = new Set(process.argv.slice(2));
const { w: sw, h: sh } = probe(SRC);
const px = decode(SRC);

/**
 * The ground, read off the border rather than assumed.
 *
 * The median of the frame's outermost ring, per channel. A median and not a
 * mean because the hairline runs off both edges of this particular art and
 * lands *in* the sample — an average would be dragged up by it and would then
 * subtract more than the ground from everything else, eating the faint end of
 * the very line it was polluted by.
 */
function groundColour() {
  const ch = [[], [], []];
  const take = (x, y) => {
    const i = (y * sw + x) * 4;
    ch[0].push(px[i]);
    ch[1].push(px[i + 1]);
    ch[2].push(px[i + 2]);
  };
  for (let x = 0; x < sw; x++) {
    take(x, 0);
    take(x, sh - 1);
  }
  for (let y = 0; y < sh; y++) {
    take(0, y);
    take(sw - 1, y);
  }
  return ch.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1];
  });
}

const ground = groundColour();

// Subtract the ground, then alpha from what is left. See the header.
let minX = sw;
let minY = sh;
let maxX = -1;
let maxY = -1;
let lit = 0;
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4;
    const r = Math.max(0, px[i] - ground[0]);
    const g = Math.max(0, px[i + 1] - ground[1]);
    const b = Math.max(0, px[i + 2] - ground[2]);
    const a = Math.max(r, g, b);
    if (a < FLOOR) {
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 0;
      continue;
    }
    // Unpremultiplied: the brightest channel goes to full and the others keep
    // their ratio to it, so the hue survives all the way down the fade.
    const k = 255 / a;
    px[i] = Math.min(255, Math.round(r * k));
    px[i + 1] = Math.min(255, Math.round(g * k));
    px[i + 2] = Math.min(255, Math.round(b * k));
    px[i + 3] = a;
    lit++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

if (maxX < 0) {
  console.error(
    "nothing above the alpha floor — is the source really glow on black?",
  );
  process.exit(1);
}

const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const cropped = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  px.copy(
    cropped,
    y * cw * 4,
    ((y + minY) * sw + minX) * 4,
    ((y + minY) * sw + minX + cw) * 4,
  );
}

const tmp = join(OUT_DIR, ".retry-glow-cut.png");
encode(cropped, cw, ch, tmp);

const outH = Math.max(1, Math.round((ch * WIDTH) / cw));
const webp = `${OUT}.webp`;
execFileSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  tmp,
  "-vf",
  `scale=${WIDTH}:${outH}:flags=lanczos`,
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-frames:v",
  "1",
  webp,
]);

if (flags.has("--png")) {
  const png = `${OUT}.png`;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    tmp,
    "-vf",
    `scale=${WIDTH}:${outH}:flags=lanczos`,
    "-frames:v",
    "1",
    png,
  ]);
  console.log(
    `  png    ${rel(png)}  ${WIDTH}x${outH}  ${kb(statSync(png).size)}`,
  );
}

if (flags.has("--proof")) {
  const proof = join(OUT_DIR, "retry-glow-proof.png");
  const [r, g, b] = PROOF_BG;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}:s=${WIDTH}x${outH + 80}`,
    "-i",
    webp,
    "-filter_complex",
    "[0][1]overlay=(W-w)/2:(H-h)/2",
    "-frames:v",
    "1",
    proof,
  ]);
  console.log(`  proof  ${rel(proof)}`);
}

unlinkSync(tmp);

console.log(`retry-glow`);
console.log(`  source ${rel(SRC)}  ${sw}x${sh}  ${kb(statSync(SRC).size)}`);
console.log(
  `  ground rgb(${ground.join(",")}) — measured off the border and subtracted`,
);
console.log(
  `  trim   ${cw}x${ch}  (${((100 * lit) / (sw * sh)).toFixed(1)}% of the frame is lit)`,
);
console.log(
  `  out    ${rel(webp)}  ${WIDTH}x${outH}  ${kb(statSync(webp).size)}`,
);
