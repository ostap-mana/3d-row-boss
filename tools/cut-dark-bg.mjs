/**
 * Cut a glowing lockup off a flat *dark* backdrop and give it a real alpha
 * channel.
 *
 *   node tools/cut-dark-bg.mjs src/source/image.png            # -> image-nobg.png
 *   node tools/cut-dark-bg.mjs src/source/image.png out.png    # explicit output
 *   node tools/cut-dark-bg.mjs src/source/image.png --preview  # also composite it
 *   node tools/cut-dark-bg.mjs src/source/image.png --report    # thresholds only
 *
 * The third cutter in this folder, and the reason neither of the other two can
 * be pointed at this sheet is the backdrop.
 *
 * tools/cut-bg.mjs cuts a subject off a *light* neutral checkerboard: its
 * classifier asks "is this pixel flat and light", and its `--glow` pass unmixes
 * a bloom by reading how far a pixel's darkest channel has fallen below white.
 * Both of those questions have the wrong answer on a sheet whose backdrop is
 * rgb(1, 26, 27) — nothing here is light, and there is no white to fall below.
 *
 * tools/cut-glow.mjs inverts a glow off *black*, which is the right model and
 * the wrong subject. A neon bar is glow all the way through, so
 * `alpha = max(r,g,b)` is the whole answer for every pixel on the sheet. This is
 * a painting: a beast, a rider, gold brackets and a banner, drawn opaque and
 * wrapped in a magenta bloom. Handed to that inversion the bloom comes out
 * perfect and the art comes out a ghost — the darkest pixels inside the beast
 * are a few levels off the backdrop, so a black outline is returned at eight
 * percent alpha and the lockup arrives see-through.
 *
 * So this is both of them, split by connectivity rather than by threshold:
 *
 *   1. Read the backdrop. The median of the border ring, which on this sheet is
 *      116 distinct near-identical colours — a flat fill plus the encoder's
 *      noise — and never further than six levels off its own median.
 *
 *   2. Model every pixel as that backdrop plus an additive glow, which over a
 *      dark fill is what a bloom actually is:
 *
 *        pixel = B + colour * alpha   ->   alpha = max(pixel - B) / 255
 *
 *      and the colour divides back out of it. Over the backdrop this is zero,
 *      through the bloom it is the falloff itself, and at the bloom's core it is
 *      near enough one.
 *
 *   3. Flood from the border through everything that model calls translucent,
 *      and stop at the ridge where the bloom goes solid against the art's own
 *      outline. What the flood reaches is bloom and backdrop, and keeps the
 *      alpha step 2 gave it. What it cannot reach is the painting, and is
 *      opaque — outline, shadow, black and all.
 *
 * The ridge is what makes this work and it is worth being explicit about: this
 * tool is safe on art that is *lit* — a subject with an unbroken rim of near
 * solid glow around it — and it is the wrong tool for art that is not, because
 * there the flood walks in through a dark edge and hollows the subject out. A
 * leak shows up as a bite out of the figure in `--preview`, which is why the
 * preview is one flag rather than a separate step.
 *
 * ffmpeg is the only dependency, and only to decode and encode PNG — the same
 * dependency every other tool in this folder already has.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How far off the measured backdrop a pixel may be and still be *only* the
 * backdrop.
 *
 * Eight. The border ring on this sheet never gets further than six from its own
 * median, so this clears the encoder's noise by two levels and no more — the
 * bloom's outermost breath is a real signal and every level of it that is
 * thrown away here is a level of hard edge put back in.
 */
const NOISE = 8;

/**
 * Alpha at or above which the flood stops, out of 255.
 *
 * This is the ridge. Walking inwards the fill crosses the backdrop, then the
 * bloom's falloff, then the bloom's core where it is bright enough to be
 * effectively opaque — and it has to be stopped there, because the next thing
 * past it is the art's black outline, which the additive model reads as almost
 * nothing and would otherwise be walked straight through.
 *
 * 218 is high on purpose. Every pixel the flood is stopped *short* of becomes
 * fully opaque, so a floor set too low does not leak — it flattens the inner
 * bloom to solid magenta and leaves a visible step where the fill gave up. High
 * enough that the step lands where the bloom is already opaque to the eye, low
 * enough that the encoder's noise in the core cannot punch a hole through the
 * ridge for the fill to pour through.
 */
const RIDGE = 218;

/**
 * How deep a crevice the shape pass is allowed to close. See close().
 *
 * Four. The cracks this sheet opens up are two to six pixels across at 1344
 * wide, which is a quarter of a pixel at the size the lockup is drawn, and four
 * passes shut all of them. Every pass also turns one more pixel of the ridge
 * opaque, so this is not free — it is just very cheap, because the ridge is the
 * part of the bloom that was already reading as solid.
 */
const CLOSE_PASSES = 4;

/**
 * Largest enclosed run of backdrop-coloured pixels still treated as backdrop.
 *
 * The pockets on this sheet are the gaps between the bracket arms and the
 * beast's shoulders, and the bloom fills most of them; what is left is a few
 * hundred pixels apiece. Twenty thousand is the same number tools/cut-bg.mjs
 * uses for the same job, two orders of magnitude clear of that, and far under
 * anything a painting would plausibly fill with flat backdrop.
 */
const POCKET = 20000;

/** What --preview composites onto: the outcome card's own dark, and a light. */
const PREVIEW_BG = [
  [14, 10, 20],
  [232, 228, 236],
];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

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

function encode(buf, w, h, file) {
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
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

/* ------------------------------------------------------------------- pixels */

/**
 * The backdrop, read off the border ring rather than assumed.
 *
 * The median and not the mean: a mean is moved by whatever art or bloom happens
 * to touch an edge, and on a sheet where the subject is centred the median of
 * two thousand border pixels is the fill itself even if a quarter of them are
 * something else.
 */
function backdrop(px, w, h) {
  const ch = [[], [], []];
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    ch[0].push(px[i]);
    ch[1].push(px[i + 1]);
    ch[2].push(px[i + 2]);
  };
  for (let x = 0; x < w; x++) {
    take(x, 0);
    take(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    take(0, y);
    take(w - 1, y);
  }
  return ch.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1];
  });
}

/**
 * The additive alpha, per pixel, out of 255 — step 2 of the header.
 *
 * `max` over the three channels because a coloured glow only reaches full on the
 * channels it is made of: this bloom is magenta, so its green is near the
 * backdrop's own green everywhere and a mean would read the core at two thirds.
 */
function additiveAlpha(px, w, h, B) {
  const a = new Uint8Array(w * h);
  for (let p = 0; p < a.length; p++) {
    const i = p * 4;
    const r = px[i] - B[0];
    const g = px[i + 1] - B[1];
    const b = px[i + 2] - B[2];
    a[p] = clamp8(Math.max(r, g, b, 0));
  }
  return a;
}

/**
 * The backdrop-and-bloom region: everything the border can reach without
 * crossing the ridge — step 3 of the header.
 *
 * Four-connected, on an explicit stack rather than by recursion: this is a
 * million-pixel sheet and the fill front through a bloom is wide.
 */
function reach(alpha, w, h) {
  const out = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => {
    if (out[p] || alpha[p] >= RIDGE) return;
    out[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
  }
  return out;
}

/**
 * Close the crevices the ridge has no answer for.
 *
 * The flood is stopped by bright glow, and there are places on a painting where
 * there is none to stop it: a dark crack between the rider's beard and the
 * beast's head, the shadow under a bracket arm, the seam beside the banner —
 * each of them open to the outside and each of them drawn in the same near-black
 * the model reads as almost nothing. The fill runs up those seams and hands back
 * paint at eight percent alpha, which is invisible over the card's own dark and
 * a white crack the moment the lockup is put over anything else.
 *
 * No threshold separates a crevice from the bloom, because there is nothing
 * different about the pixels — what is different is the *shape*. A crevice is a
 * filament a few pixels across; the bloom is a field that covers half the sheet.
 * So the mask is eroded: every pass takes one pixel off the whole frontier of
 * the reach, a filament is eaten from both sides at once and closes, and the
 * field loses a rim it can afford.
 *
 * The rim it loses is the ridge, which is the cheapest pixel on the sheet to
 * spend — the flood was stopped there because the glow had gone near enough
 * solid, so making it solid in fact is a change of a few levels on a couple of
 * pixels. That is the trade this pass is: a hairline of extra glow bought with
 * every crack in the painting shut.
 *
 * Three non-reach neighbours out of eight is a straight edge, which is what
 * makes this an erosion rather than the majority filter it looks like.
 *
 * @param {number} passes pixels off the frontier, so twice this is the widest
 *   crack that closes
 */
function close(got, w, h, passes) {
  let shut = 0;
  for (let pass = 0; pass < passes; pass++) {
    const prev = got.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (!prev[p]) continue;
        let out = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            // Off the sheet counts as reach: the border *is* the backdrop, and
            // a pixel on the edge of the frame must not be eroded for having
            // fewer neighbours than one in the middle.
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (!prev[ny * w + nx]) out++;
          }
        }
        if (out >= 3) {
          got[p] = 0;
          shut++;
        }
      }
    }
  }
  return shut;
}

/**
 * Sweep the pockets: small enclosed runs of near-backdrop the border could not
 * reach, which are backdrop wherever they are too small to be paint.
 *
 * Only the near-backdrop is swept and not the whole translucent band. An
 * enclosed pocket of *bloom* is bloom — the light between two of the beast's
 * claws is part of the picture and belongs in it at whatever alpha it has —
 * where an enclosed pocket of flat fill is a hole in the sheet and nothing else.
 */
function pockets(alpha, got, w, h) {
  let swept = 0;
  const seen = new Uint8Array(w * h);
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || got[p] || alpha[p] > NOISE) continue;
    const run = [];
    const stack = [p];
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop();
      run.push(q);
      const x = q % w;
      const step = (r) => {
        if (seen[r] || got[r] || alpha[r] > NOISE) return;
        seen[r] = 1;
        stack.push(r);
      };
      if (x > 0) step(q - 1);
      if (x < w - 1) step(q + 1);
      if (q >= w) step(q - w);
      if (q < (h - 1) * w) step(q + w);
    }
    if (run.length <= POCKET) {
      run.forEach((q) => (got[q] = 1));
      swept += run.length;
    }
  }
  return swept;
}

/**
 * The cut: the alpha each pixel earned, and the colour divided back out of it.
 *
 * Two answers and one line between them. Inside the reach the pixel is backdrop
 * plus bloom, so it keeps the additive alpha and gives back the bloom's own
 * colour — which is what stops the tail carrying a wash of the backdrop's teal
 * onto whatever it is composited over. Outside the reach the pixel is paint, and
 * paint over an opaque fill is just paint.
 */
function cut(px, alpha, got, w, h, B) {
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (!got[p]) {
      out[i] = px[i];
      out[i + 1] = px[i + 1];
      out[i + 2] = px[i + 2];
      out[i + 3] = 255;
      continue;
    }
    // At or under the noise floor there is nothing there: the flat fill carries
    // a level or two of the encoder's own dither, and left in it is an alpha of
    // 3 across half the sheet — invisible to composite and fatal to trim, since
    // the packer downstream measures the art's box off any pixel above zero.
    // See NOISE, and inkBox.
    const a = alpha[p] <= NOISE ? 0 : alpha[p];
    out[i + 3] = a;
    if (a === 0) continue;
    // The inverse of `pixel = B + colour * alpha`, which is the whole of the
    // model in the header. Clamped rather than trusted: the encoder's noise can
    // put a channel a level or two under the backdrop and a divide by a small
    // alpha turns that into a wild negative.
    const k = 255 / a;
    out[i] = clamp8((px[i] - B[0]) * k);
    out[i + 1] = clamp8((px[i + 1] - B[1]) * k);
    out[i + 2] = clamp8((px[i + 2] - B[2]) * k);
  }
  return out;
}

/** The share of the buffer that is clear, soft and solid. */
function profile(px) {
  let clear = 0;
  let soft = 0;
  let solid = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 8) clear++;
    else if (px[i] > 247) solid++;
    else soft++;
  }
  const n = px.length / 4;
  const pc = (v) => `${((v / n) * 100).toFixed(1)}%`;
  return `clear ${pc(clear)}  soft ${pc(soft)}  solid ${pc(solid)}`;
}

/** The box the art occupies, ignoring anything at or under the noise floor. */
function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= NOISE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* ---------------------------------------------------------------------- run */

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const files = args.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error(
    "usage: node tools/cut-dark-bg.mjs <in.png> [out.png] [--preview]",
  );
  process.exit(1);
}

const SRC = resolve(ROOT, files[0]);
const OUT = files[1]
  ? resolve(ROOT, files[1])
  : join(
      dirname(SRC),
      `${basename(SRC, extname(SRC))}-nobg${extname(SRC) || ".png"}`,
    );

const { w, h } = probe(SRC);
const px = decode(SRC);
const BG = backdrop(px, w, h);

console.log(`in   ${rel(SRC)}  ${w}x${h}`);
console.log(`     backdrop rgb(${BG.join(", ")})  read off the border ring`);

const alpha = additiveAlpha(px, w, h, BG);
const got = reach(alpha, w, h);
const shut = close(got, w, h, CLOSE_PASSES);
const swept = pockets(alpha, got, w, h);

let reached = 0;
for (let p = 0; p < got.length; p++) if (got[p]) reached++;

const art = cut(px, alpha, got, w, h, BG);
const box = inkBox(art, w, h);

console.log(
  `     reach ${((reached / (w * h)) * 100).toFixed(1)}% of the sheet` +
    `  (${shut} px shut as crevice, ${swept} px swept from pockets)` +
    `\n     ${profile(art)}` +
    `\n     ink box ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  aspect ${(box.w / box.h).toFixed(3)}`,
);

if (flags.has("--report")) process.exit(0);

encode(art, w, h, OUT);
console.log(`out  ${rel(OUT)}  ${w}x${h}`);

/**
 * The cut over two grounds, side by side, cropped to the ink box.
 *
 * Two because the two failures this tool can have show up on opposite ends: a
 * bloom whose coverage came out high reads as fog on the dark, and a colour that
 * was not properly divided back out reads as a teal rim on the light.
 */
if (flags.has("--preview")) {
  const pad = 16;
  const W = box.w * 2 + pad * 3;
  const H = box.h + pad * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bg = PREVIEW_BG[x < W / 2 ? 0 : 1];
      const d = (y * W + x) * 4;
      proof[d] = bg[0];
      proof[d + 1] = bg[1];
      proof[d + 2] = bg[2];
      proof[d + 3] = 255;
    }
  }
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((y + box.y0) * w + x + box.x0) * 4;
      const a = art[s + 3] / 255;
      for (const dx of [pad, box.w + pad * 2]) {
        const d = ((y + pad) * W + x + dx) * 4;
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(art[s + c] * a + proof[d + c] * (1 - a));
        }
      }
    }
  }
  const file = `${OUT.slice(0, -extname(OUT).length)}-preview.png`;
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  ${W}x${H}`);
}
