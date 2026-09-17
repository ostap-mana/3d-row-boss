import { execFileSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
despill-sheet — take the backdrop's colour out of what it shone through.

  node tools/despill-sheet.mjs <sheet.webp> [options]

  --lift <n>      how much green a pixel is left with over its own red and blue
                  once it has been pulled down. Default 4.
  --ceiling <n>   greenness at or above which a pixel is left alone, because it
                  is painted green rather than lit green. Default 30.
  --quality <n>   webp quality. Default 74.
  --out <file>    default: in place.
  --proof <file>  also write a PNG of the result over a dark ground, which is
                  the only way to see what came off.

  A second pass over what tools/pack-video-sheet.mjs already keyed, for the one
  thing a flood key cannot do on its own.

  A flood key answers "is this pixel backdrop" by reaching in from the frame's
  border, and anything joined to the subject is kept whole. A glow is joined to
  the subject: the soft light around a star is gold mixed with whatever it was
  shining over, so off a green screen it survives the key at full opacity and
  arrives on the card as a dirty olive halo. The packer's own --despill is a band
  a few pixels wide inside the matte edge, which is where screen bounce lives on
  a solid subject; a glow is not an edge and the band never reaches it.

  What separates the two here is how green they are, not how transparent. On the
  defeat sheet the halo measures 5 to 25 levels of green over its own red and
  blue and the greenest thing actually painted — a gem in the man's crown —
  measures 68, with almost nothing between them. So the pull runs up to
  --ceiling and stops: screen light is weakly green over everything, and paint is
  strongly green over a few hundred pixels.
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
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

const SRC = resolve(ROOT, args[0]);
const OUT = resolve(ROOT, opt("out", args[0]));
const LIFT = num("lift", 4);
const EAT = num("eat", 10);
const KEEP = num("keep", 3);
const DIM = num("dim", 0.45);
const WARM_G = num("warm-g", 0.8);
const WARM_B = num("warm-b", 0.3);
const CEILING = num("ceiling", 30);
const QUALITY = num("quality", 74);
const PROOF = opt("proof", null);

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => (n / 1024).toFixed(1);

if (!existsSync(SRC)) {
  process.stderr.write(`no sheet at ${rel(SRC)}\n`);
  process.exit(1);
}

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
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file, extra) {
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
      ...(extra || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

const { w, h } = probe(SRC);
const px = decode(SRC);
if (px.length < w * h * 4) {
  process.stderr.write(`${rel(SRC)} did not decode to rgba\n`);
  process.exit(1);
}

const greenAt = (p) => px[p * 4 + 1] - Math.max(px[p * 4], px[p * 4 + 2]);

let eaten = 0;
if (EAT > KEEP) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = [];
  for (let p = 0; p < n; p++) {
    if (px[p * 4 + 3] === 0) {
      seen[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p / w) | 0;
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ]) {
      if (q < 0 || seen[q]) continue;
      const green = greenAt(q);
      if (green <= KEEP) continue;
      seen[q] = 1;
      const bite = green >= EAT ? 1 : (green - KEEP) / (EAT - KEEP);
      const j = q * 4;
      px[j + 3] = Math.round(px[j + 3] * (1 - bite * (1 - DIM)));
      const warm = bite;
      px[j + 1] = Math.round(
        px[j + 1] + (Math.min(px[j + 1], px[j] * WARM_G) - px[j + 1]) * warm,
      );
      px[j + 2] = Math.round(
        px[j + 2] + (Math.min(px[j + 2], px[j] * WARM_B) - px[j + 2]) * warm,
      );
      eaten++;
      stack.push(q);
    }
  }
}

let touched = 0;
for (let i = 0; i < w * h * 4; i += 4) {
  if (px[i + 3] === 0) continue;
  const g = px[i + 1];
  const other = Math.max(px[i], px[i + 2]);
  const green = g - other;
  if (green <= LIFT || green >= CEILING) continue;
  px[i + 1] = other + LIFT;
  touched++;
}

encode(px, w, h, OUT, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-compression_level",
  "6",
  "-preset",
  "picture",
  "-pix_fmt",
  "yuva420p",
]);

process.stdout.write(
  `in   ${rel(SRC)}  ${w}x${h}\n` +
    `     eat ${EAT}, keep ${KEEP}, lift ${LIFT}, ceiling ${CEILING}
` +
    `     dim ${DIM}, warm ${WARM_G}/${WARM_B}, ${((eaten * 100) / (w * h)).toFixed(1)}% of pixels relit, ` +
    `${((touched * 100) / (w * h)).toFixed(1)}% of pixels pulled\n` +
    `out  ${rel(OUT)}  ${kb(statSync(OUT).size)} kB\n`,
);

if (PROOF) {
  const file = resolve(ROOT, PROOF);
  const proof = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    const ground = [22, 18, 28];
    for (let c = 0; c < 3; c++) {
      proof[i * 4 + c] = Math.round(ground[c] * (1 - a) + px[i * 4 + c] * a);
    }
    proof[i * 4 + 3] = 255;
  }
  encode(proof, w, h, file, []);
  process.stdout.write(`     ${rel(file)} — scratch, delete it\n`);
}
