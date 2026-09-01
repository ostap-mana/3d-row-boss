/**
 * Pack the two pieces of chrome the outcome screen is built from.
 *
 *   node tools/pack-outcome-ui.mjs           # -> src/assets/outcome/*.webp
 *   node tools/pack-outcome-ui.mjs --png     # keep the intermediate PNGs too
 *   node tools/pack-outcome-ui.mjs --proof   # both over the game's own navy
 *
 * Both are lifted straight out of the Invokers Titan Legacy build — they are
 * the game's own UI, pulled out of its Unity bundles with UnityPy rather than
 * redrawn:
 *
 *   S_ScreenTitleBackground   2000x178   -> title-plate.png
 *   S_TitleOrnamentLine        438x29    -> ornament-line.png
 *
 * The plate is the band the game puts every screen title inside: a navy fill
 * that fades out at both ends, a bright gold hairline along the top and the
 * bottom, and a small gold chevron centred on each. The line is a single
 * hairline with a diamond notch in the middle of it. Between them they are the
 * whole vocabulary of the "VICTORY" card the game shows over a finished fight,
 * which is what ui/outcome.js now rebuilds.
 *
 * ## Why the plate is stretched vertically and that is not a bug
 *
 * Its own aspect is 11.24:1, and at the width the card wants it that is a band
 * about thirty points deep — too thin to put a headline in. The game stretches
 * it, and the stretch is safe because of what is in it: the ornament sits on the
 * centre line, the hairlines run along the edges, and everything between them is
 * a flat vertical gradient. Stretching it taller makes the chevron taller, which
 * is exactly what the shipped card looks like. See PLATE_ART and OutcomeScreen.
 *
 * Nothing is trimmed. The plate's fade to nothing at each end is the art, and a
 * trim to the ink would cut it off; the line's own ends do the same thing.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src/source/outcome");
const OUT_DIR = join(ROOT, "src/assets/outcome");

/**
 * The two cuts.
 *
 * `width` is where each is resampled to. The plate goes to half its shipped
 * size, which is still twice the widest the card draws it at on the biggest
 * screen in the matrix, and it is a flat gradient with two hairlines in it so
 * the halving costs nothing anybody can see. The line is already small enough
 * that resampling it would only soften the one thing it is made of.
 */
const CUTS = [
  { key: "title-plate", src: "title-plate.png", width: 1024, quality: 88 },
  { key: "ornament-line", src: "ornament-line.png", width: 0, quality: 92 },
];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

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

/* ------------------------------------------------------------------- pixels */

/** The share of the buffer that is fully clear, fully solid, and in between. */
function alphaProfile(px) {
  let clear = 0;
  let solid = 0;
  let soft = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 8) clear++;
    else if (px[i] > 247) solid++;
    else soft++;
  }
  const n = px.length / 4;
  const pc = (v) => `${((v / n) * 100).toFixed(1)}%`;
  return `clear ${pc(clear)}  soft ${pc(soft)}  solid ${pc(solid)}`;
}

/**
 * Box-average down to `dw` by `dh`, weighting colour by alpha.
 *
 * The same resampler the rest of this folder uses, and the alpha weighting is
 * the whole reason it is written out rather than handed to ffmpeg's scaler:
 * both of these are ornament on nothing, so every pixel that is not fully clear
 * is an edge, and an unweighted average drags the transparent black around a
 * gold hairline into the hairline itself.
 */
function resample(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const kx = sw / dw;
  const ky = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const fy0 = dy * ky;
    const fy1 = fy0 + ky;
    const iy0 = Math.floor(fy0);
    const iy1 = Math.min(sh - 1, Math.ceil(fy1) - 1);

    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * kx;
      const fx1 = fx0 + kx;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(sw - 1, Math.ceil(fx1) - 1);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;

      for (let y = iy0; y <= iy1; y++) {
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        if (wy <= 0) continue;
        for (let x = ix0; x <= ix1; x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          if (wx <= 0) continue;
          const i = (y * sw + x) * 4;
          const cover = wx * wy;
          const av = (src[i + 3] / 255) * cover;
          r += src[i] * av;
          g += src[i + 1] * av;
          b += src[i + 2] * av;
          a += av;
          area += cover;
        }
      }

      const o = (dy * dw + dx) * 4;
      out[o] = a > 0 ? clamp8(r / a) : 0;
      out[o + 1] = a > 0 ? clamp8(g / a) : 0;
      out[o + 2] = a > 0 ? clamp8(b / a) : 0;
      out[o + 3] = area > 0 ? clamp8((a / area) * 255) : 0;
    }
  }
  return out;
}

/* ---------------------------------------------------------------------- run */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const packed = [];

for (const cut of CUTS) {
  const src = join(SRC_DIR, cut.src);
  const out = join(OUT_DIR, cut.key);
  const info = probe(src);
  const px = decode(src);

  console.log(
    `in   ${rel(src)}  ${info.w}x${info.h}  ${kb(statSync(src).size)}` +
      `\n     ${alphaProfile(px)}`,
  );

  const outW = cut.width || info.w;
  const outH = Math.round((info.h * outW) / info.w);
  const art =
    outW === info.w && outH === info.h
      ? px
      : resample(px, info.w, info.h, outW, outH);

  if (flags.has("--png")) encode(art, outW, outH, `${out}.png`);
  encode(art, outW, outH, `${out}.webp`, [
    "-c:v",
    "libwebp",
    "-quality",
    String(cut.quality),
    "-compression_level",
    "6",
  ]);

  console.log(
    `out  ${rel(out)}.webp  ${outW}x${outH}  ${kb(statSync(`${out}.webp`).size)}` +
      `   aspect ${(outW / outH).toFixed(3)}\n`,
  );
  packed.push({ key: cut.key, w: outW, h: outH, art });
}

console.log("     for art/outcomeui.js:");
packed.forEach((p) => {
  const name = p.key === "title-plate" ? "PLATE_ART" : "LINE_ART";
  console.log(`       ${name} { w: ${p.w}, h: ${p.h} }`);
});

/**
 * Both over the navy the game itself puts them on.
 *
 * Worth looking at because the one thing this tool can get wrong is invisible on
 * a checkerboard: these are two hairlines and a chevron, and a resample that
 * loses half a pixel of the line turns a bright gold edge into a dull one. On
 * the ground they are drawn against, that is obvious in a second.
 */
if (flags.has("--proof")) {
  const W = 1100;
  const pad = 40;
  const rows = packed.map((p) => Math.round((p.h * (W - pad * 2)) / p.w));
  const H = rows.reduce((a, h) => a + h + pad, pad);
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 0x1a;
    proof[i * 4 + 1] = 0x1f;
    proof[i * 4 + 2] = 0x2e;
    proof[i * 4 + 3] = 255;
  }

  let y = pad;
  packed.forEach((p, i) => {
    const pw = W - pad * 2;
    const ph = rows[i];
    const small = resample(p.art, p.w, p.h, pw, ph);
    for (let sy = 0; sy < ph; sy++) {
      for (let sx = 0; sx < pw; sx++) {
        const s = (sy * pw + sx) * 4;
        const d = ((y + sy) * W + pad + sx) * 4;
        const a = small[s + 3] / 255;
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(proof[d + c] * (1 - a) + small[s + c] * a);
        }
      }
    }
    y += ph + pad;
  });

  const file = join(OUT_DIR, "outcome-ui-proof.png");
  encode(proof, W, H, file);
  console.log(`\nout  ${rel(file)}  (delete when looked at)`);
}
