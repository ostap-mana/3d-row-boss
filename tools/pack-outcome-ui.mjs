/**
 * Pack the chrome the outcome screen is built from.
 *
 *   node tools/pack-outcome-ui.mjs           # -> src/assets/outcome/*.webp
 *   node tools/pack-outcome-ui.mjs --png     # keep the intermediate PNGs too
 *   node tools/pack-outcome-ui.mjs --proof   # all of them over the game's navy
 *
 * Three things, and they arrived from two different places:
 *
 *   victory-band.png    816x266   the finished VICTORY banner
 *   defeat-band.png     816x266   the finished DEFEAT banner
 *   S_TitleOrnamentLine  438x29   -> ornament-line.png
 *
 * The line is the game's own UI, pulled out of the Invokers Titan Legacy Unity
 * bundles with UnityPy rather than redrawn: one gold hairline with a diamond
 * notch in the middle, which is the lid the shipped card puts over "tap to
 * continue".
 *
 * The two bands are finished art, supplied whole. Each is the plate, the wash,
 * both hairlines, the chevron at either end AND the word, in one bitmap: a green
 * plate under VICTORY and an oxblood one under DEFEAT, both fading to nothing at
 * each end.
 *
 * ## What that replaced, and why the plate is no longer packed here
 *
 * The card used to *build* this shape out of four pieces at run time —
 * S_ScreenTitleBackground stretched into a box, three tinted gradient sprites
 * laid inside its hairlines, and the verdict set in type over the lot — and the
 * bulk of both this tool and ui/outcome.js was the arithmetic of holding those
 * four things registered against each other on every aspect ratio a phone has.
 * A finished bitmap has no registration problem: the word is where the artist
 * put it, and the only thing left to decide is how wide to draw it.
 *
 * So `title-plate` is gone from this file and its webp with it. It was only ever
 * the frame under a composition that no longer exists, and it cannot serve as
 * the fallback for these two either — anything that fails to decode one webp
 * fails to decode all three. What is behind them when the decode fails is the
 * card's own drawn band, which needs no art at all. See OutcomeScreen.drawBand.
 *
 * ## The one thing these two may not be
 *
 * Stretched. The plate could be: everything between its hairlines was a flat
 * vertical gradient, so pulling it taller distorted nothing, and the card pulled
 * it taller on every device it ran on. These have a word in the middle of them,
 * so they are fitted at their own 3.068:1 and take back the height that implies.
 * See VERDICT_ART and `fitVerdict` in art/outcomeui.js.
 *
 * ## What the encode may not be
 *
 * Lossy webp is 4:2:0 and no flag changes that — libwebp has no lossy 4:4:4
 * mode. Chroma at half resolution is survivable for the plate, whose gold is a
 * broad shape, and it is not survivable for the hairline in `ornament-line`,
 * which is a gold thread a pixel wide on nothing: subsampled, it comes back
 * grey-green. That one is packed lossless, and it costs 1.1 kB.
 *
 * Do not reach for `-preset drawing` to make a lossless encode smaller. It looks
 * like it works — 132 kB becomes 35 kB — because ffmpeg applies the preset over
 * the config and silently turns `lossless` back off. `pix_fmt` on the output is
 * how to tell: `argb` is lossless, `yuva420p` is not.
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
 * The cuts.
 *
 * `width` is where each is resampled to and `height` where it is held; all three
 * are packed at their source's own size, so the resampler is a no-op on every
 * one of them and nothing here is softened before it is encoded.
 *
 * 816 across is one-to-one on a phone and a little short of it above that: the
 * band is drawn about as wide as the safe box, which is around 1170 device
 * pixels on a 390-point phone at 3x. The art is what it is — there is no larger
 * master — so the choice is between shipping it at its own size and shipping a
 * pre-blurred upscale of it, and an upscale done by the GPU at draw time costs
 * nothing and looks the same.
 *
 * Quality 92 on the two bands. The table is this tool's own output measured
 * against the source: mean absolute error over everything not transparent, out
 * of 255.
 *
 *     q82        36.7 kB   1.90
 *     q88        39.9 kB   1.56
 *     q92        43.5 kB   1.49   <- here
 *     q96        49.4 kB   1.40
 *     lossless  124.4 kB   0.00
 *
 * The knee is at 88 and 92 is a step past it — three and a half kB for the last
 * of the difference an eye has any chance with, and then 75 kB more for the
 * rest, which it has not. What the step is spent on is the cream serif in the
 * middle: it is the one hard edge in either bitmap, it is the thing the player
 * actually looks at, and low down the table its stems pick up the faint ringing
 * lossy webp puts around high-contrast type.
 *
 * `ornament-line` stays lossless, and that is not the same call. Chroma at half
 * resolution is survivable on the bands, whose gold sits on a broad coloured
 * plate; it is not survivable on a gold thread a pixel wide on nothing, which
 * comes back grey-green. It costs 1.1 kB.
 */
const CUTS = [
  { key: "victory-band", src: "victory-band.png", width: 0, quality: 92 },
  { key: "defeat-band", src: "defeat-band.png", width: 0, quality: 92 },
  { key: "ornament-line", src: "ornament-line.png", width: 0, lossless: true },
];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Size and pixel format.
 *
 * `pix_fmt` is here for the encode and not for the decode: it is the only way to
 * find out what libwebp actually did, and a lossless encode that quietly came
 * back lossy reports `yuva420p` where it should report `argb`. Printed on every
 * line this tool writes, so the answer is in the log rather than in a hunch.
 */
function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,pix_fmt",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h, fmt] = out.split(",");
  return { w: Number(w), h: Number(h), fmt };
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
  const outH = cut.height || Math.round((info.h * outW) / info.w);
  const art =
    outW === info.w && outH === info.h
      ? px
      : resample(px, info.w, info.h, outW, outH);

  if (flags.has("--png")) encode(art, outW, outH, `${out}.png`);
  encode(art, outW, outH, `${out}.webp`, [
    "-c:v",
    "libwebp",
    ...(cut.lossless ? ["-lossless", "1"] : ["-quality", String(cut.quality)]),
    "-compression_level",
    "6",
  ]);

  console.log(
    `out  ${rel(out)}.webp  ${outW}x${outH}  ${kb(statSync(`${out}.webp`).size)}` +
      `   aspect ${(outW / outH).toFixed(3)}` +
      `   ${cut.lossless ? "lossless" : `quality ${cut.quality}`}` +
      `   ${probe(`${out}.webp`).fmt}\n`,
  );
  packed.push({ key: cut.key, w: outW, h: outH, art });
}

console.log("     for art/outcomeui.js:");

/**
 * One constant covers both bands, so the defeat cut has nothing of its own to
 * print — and a defeat band that is not the size of the victory one is worth
 * shouting about here rather than finding out about as a squashed word on a
 * phone. VERDICT_ART is a single aspect and cannot describe two.
 */
const NAMES = { "victory-band": "VERDICT_ART", "ornament-line": "LINE_ART" };
packed.forEach((p) => {
  if (p.key === "defeat-band") {
    const v = packed.find((q) => q.key === "victory-band");
    if (v && (v.w !== p.w || v.h !== p.h)) {
      console.log(
        `       !! defeat-band is ${p.w}x${p.h} and victory-band is ` +
          `${v.w}x${v.h} — VERDICT_ART describes one shape and cannot do both`,
      );
    }
    return;
  }
  console.log(`       ${NAMES[p.key]} { w: ${p.w}, h: ${p.h} }`);
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
