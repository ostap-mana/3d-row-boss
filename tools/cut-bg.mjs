/**
 * Cut a baked backdrop off a cutout and give it a real alpha channel.
 *
 *   node tools/cut-bg.mjs src/boss/image.png                 # -> image-nobg.png
 *   node tools/cut-bg.mjs src/boss/image.png out.png         # explicit output
 *   node tools/cut-bg.mjs src/boss/image.png --trim          # drop empty margin
 *   node tools/cut-bg.mjs src/boss/image.png --preview       # also composite it
 *   node tools/cut-bg.mjs src/logo.png --glow                 # white matte + bloom
 *
 * The problem this solves: `src/boss/image.png` has no alpha channel at all. Its
 * transparency is a *picture* of transparency — the editor's grey-and-white
 * checkerboard, welded into the pixels, and softened by a lossy save so no two
 * grey squares are quite the same grey. Handed to a Sprite it would arrive as a
 * monster sitting on a chessboard.
 *
 * Three passes, and the third is the one that matters:
 *
 *   1. Classify. A backdrop pixel is flat (its channels within FLAT of each
 *      other) and light (at or above LEVEL). Both squares of the checker pass;
 *      the lava, the rock and the crystals do not.
 *   2. Flood, from the border inwards, and then sweep up the pockets. The fill
 *      is what stops the classifier punching pale flat holes *through* a subject
 *      that happens to own a white; the pocket sweep is what gets the backdrop
 *      the fill cannot reach — the squares trapped between the golem's chains
 *      and under its jaw, which are enclosed by the figure and would otherwise
 *      survive as confetti. A pocket is only swept if it is small: a big
 *      enclosed flat-light region is far likelier to be art than backdrop.
 *   3. Decontaminate the edge. Every pixel on the boundary is a blend of the
 *      subject and the checker, so leaving it opaque leaves a pale fringe, and
 *      that fringe is what makes a cutout look cheap over a dark arena. Each
 *      band pixel gets the alpha its distance from the local backdrop implies,
 *      and then the backdrop's own contribution is divided back out of its
 *      colour.
 *
 * ## --glow, and the backdrop the three passes above cannot see
 *
 * Those three passes answer one question — *is this pixel the backdrop?* — with
 * yes or no, and a soft ramp only ever two pixels wide. That is the whole story
 * for a cutout knocked out against a checker, and it is half of it for art that
 * was rendered *glowing* on white: the bloom around a lit logo leaves the flat
 * neutral band long before it stops being mostly backdrop, so pass 1 keeps it,
 * and what ships is a subject wearing a pale halo that only shows up once it is
 * over something dark. The halo is not a fringe two pixels wide that BAND could
 * reach. On the RETRY lockup it is forty.
 *
 * `--glow` adds one pass for it, and only for sources that are matted on white:
 *
 *   4. Unmix the bloom. Every *bright* pixel the backdrop can walk to is a
 *      blend of white and something, and over white the blend is readable: a
 *      pixel's darkest channel is what its white has been eaten down to, so
 *      `a = (W - min) / W` is its coverage and the colour divides back out of
 *      it the same way the band's does.
 *
 * Bright, and reachable, are what keep it honest. The flood starts from the
 * backdrop and stops at anything dark, so it walks in through the bloom and
 * stops on the art's own ink line — which is why this is safe on art that is
 * drawn with one and unusable on art that is not. Nothing enclosed is swept
 * here: a cream highlight inside the subject is bright and is not the backdrop,
 * and pass 2b already had its chance to sweep whatever the border could not
 * reach. Without that rule the first thing this pass does is punch the speculars
 * out of the gold.
 *
 * It is off by default because it is wrong for a checkerboard. There the
 * backdrop is two greys and neither of them is white, so `(W - min) / W` reads
 * the light square as most of a subject and the dark square as a little less of
 * one, and hands back a figure printed on a chessboard at 8% alpha.
 *
 * ffmpeg is the only tool assumed, and only to decode and encode PNG — the same
 * dependency tools/slice-pack.mjs already has.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How flat a pixel's channels have to be to count as backdrop.
 *
 * Generous, because the file has been through a lossy encoder: what was 220 grey
 * arrives anywhere in 217..222 and a "neutral" pixel can be three or four levels
 * off neutral. Tightening this leaves grey confetti around the figure; loosening
 * it starts eating the rock's own grey highlights, which is why the flood in
 * pass 2 is what keeps this safe rather than the threshold.
 */
const FLAT = 12;

/** How light a pixel has to be. The checker's dark square is 220. */
const LEVEL = 200;

/**
 * Width of the boundary band, in pixels.
 *
 * Two: one for the anti-aliased edge the art was exported with, one for the
 * ringing the lossy save added around it.
 */
const BAND = 2;

/** Radius the band samples its backdrop and its subject over. */
const SAMPLE = 3;

/**
 * Largest enclosed run of backdrop-coloured pixels that is still treated as
 * backdrop rather than as art.
 *
 * The golem's pockets come to a few hundred pixels between them. Twenty thousand
 * is two orders of magnitude clear of that and still far under anything a
 * subject would plausibly paint in flat neutral light grey.
 */
const POCKET = 20000;

/**
 * --glow only: how bright a pixel has to be to still be counted as bloom.
 *
 * The floor is the ink line, not the art. Everything this pass is allowed to
 * walk through is white with something mixed into it, and the thing that stops
 * it is the near-black outline the art is drawn with — around 10 on every
 * channel where it is solid, and climbing through the anti-aliased pixel or two
 * on either side of it. 170 clears that ramp with room to spare and still
 * catches bloom thin enough to be a fifteenth of an alpha.
 *
 * Raising it leaves the outer bloom opaque, which is the halo this pass exists
 * to remove. Lowering it far enough to reach the mid-tones is how the flood
 * finds a gap in the outline and eats the subject, so it is the direction to be
 * careful in: 170 is two hundred levels clear of the ink and a hundred short of
 * the darkest thing the bloom is measured to reach.
 */
const GLOW_FLOOR = 170;

/**
 * --glow only: coverage under this is the encoder talking, not the art.
 *
 * A backdrop saved lossily is not one number. This file's white sits at 248 and
 * wanders three or four levels either side of it, and every level below the
 * measured white reads as another 0.4% of coverage — so a clean sheet of
 * backdrop comes back as a haze at one or two alpha, spread over the entire
 * frame. Nothing is visible at that level and everything is, as far as a trim is
 * concerned: --trim would hand back the whole picture.
 *
 * Subtracted rather than clipped, so the ramp still starts at zero instead of
 * stepping to 3.5% at its foot.
 */
const GLOW_TOE = 0.035;

/** What --preview composites onto: the end card's own backdrop. */
const PREVIEW_BG = [11, 6, 24];

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,pix_fmt",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h, pixFmt] = out.split("x");
  return { w: Number(w), h: Number(h), pixFmt };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 28 },
  );
}

function writePng(buf, w, h, file) {
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
    { input: buf },
  );
}

/* ------------------------------------------------------------------ passes */

/** Pass 1: which pixels could be backdrop at all. */
function classify(px, w, h) {
  const maybe = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn <= FLAT && mn >= LEVEL) maybe[i] = 1;
  }
  return maybe;
}

/** Pass 2: flood the candidates that the border can reach. */
function flood(maybe, w, h) {
  const bg = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;

  const push = (i) => {
    if (i < 0 || i >= w * h || bg[i] || !maybe[i]) return;
    bg[i] = 1;
    stack[top++] = i;
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    push(i - w);
    push(i + w);
  }
  return bg;
}

/**
 * Pass 2b: the backdrop the flood could not get to.
 *
 * Every candidate the fill left behind is enclosed by the subject. Small ones
 * are swept into the mask; a large one is left alone and reported, because at
 * that size the odds have flipped and it is probably something the artist drew.
 *
 * @returns {number} pixels swept
 */
function sweepPockets(maybe, bg, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const run = new Int32Array(w * h);
  let swept = 0;
  let kept = 0;

  for (let start = 0; start < w * h; start++) {
    if (seen[start] || bg[start] || !maybe[start]) continue;

    let top = 0;
    let n = 0;
    seen[start] = 1;
    stack[top++] = start;

    while (top > 0) {
      const i = stack[--top];
      run[n++] = i;
      const x = i % w;
      const around = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (let k = 0; k < 4; k++) {
        const j = around[k];
        if (j < 0 || j >= w * h) continue;
        if (seen[j] || bg[j] || !maybe[j]) continue;
        seen[j] = 1;
        stack[top++] = j;
      }
    }

    if (n > POCKET) {
      kept += n;
      continue;
    }
    for (let k = 0; k < n; k++) bg[run[k]] = 1;
    swept += n;
  }

  if (kept) {
    console.log(`     kept ${kept} enclosed px — too big to be backdrop`);
  }
  return swept;
}

/**
 * --glow, step one: what the backdrop's own white actually is.
 *
 * Read off the border ring rather than assumed to be 255, because it is not:
 * this art arrives out of a lossy encoder and its sheet of white sits at 248.
 * Unmixing against 255 when the sheet is 248 puts three percent of coverage on
 * every clear pixel in the file and tints the bloom towards its own colour.
 *
 * The median, so a subject running off the edge of the frame moves it by
 * nothing at all.
 */
function whiteLevel(px, w, h) {
  const ring = [];
  const mn = (i) => Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  for (let x = 0; x < w; x++) {
    ring.push(mn(x));
    ring.push(mn((h - 1) * w + x));
  }
  for (let y = 0; y < h; y++) {
    ring.push(mn(y * w));
    ring.push(mn(y * w + w - 1));
  }
  ring.sort((a, b) => a - b);
  return ring[ring.length >> 1];
}

/**
 * --glow, step two: the bloom, as the pixels the backdrop can walk to.
 *
 * A second flood, seeded from every backdrop pixel pass 2 found and spreading
 * through anything bright — see GLOW_FLOOR. Seeded from the mask rather than
 * from the border so it reaches the bloom inside a pocket too: the glow trapped
 * between a claw and the plate is backdrop-adjacent once the pocket sweep has
 * run, and it is the same halo as the one outside.
 *
 * Returns a mask that contains `bg`, so it is the one thing the passes after
 * this have to look at.
 */
function glowFlood(px, bg, w, h) {
  const soft = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;

  const push = (i) => {
    if (i < 0 || i >= w * h || soft[i]) return;
    const mn = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    if (!bg[i] && mn < GLOW_FLOOR) return;
    soft[i] = 1;
    stack[top++] = i;
  };

  for (let i = 0; i < w * h; i++) if (bg[i]) push(i);

  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    push(i - w);
    push(i + w);
  }
  return soft;
}

/**
 * --glow, step three: coverage and colour for everything the bloom covers.
 *
 * `P = a*F + (1-a)*W` again, the same equation pass 3 solves — but with W known
 * to be the backdrop's white rather than measured from the neighbours, and with
 * F unknown rather than sampled. One channel closes it: whatever the subject is,
 * its darkest channel is where the backdrop's white has been eaten down the
 * furthest, so `a = (W - min) / W` is coverage and the rest divides out.
 *
 * That is exact for a subject with a black in it and an under-estimate for one
 * without — which is the right way round to be wrong. Under-estimating leaves a
 * faint bloom slightly fainter; over-estimating would eat the art.
 *
 * @returns {number} pixels given a coverage of their own
 */
function unmixGlow(out, px, soft, w, h, white) {
  let touched = 0;
  for (let i = 0; i < w * h; i++) {
    if (!soft[i]) continue;

    const mn = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    let a = (white - mn) / white;
    a = (a - GLOW_TOE) / (1 - GLOW_TOE);

    if (a <= 0) {
      out[i * 4 + 3] = 0;
      continue;
    }
    if (a > 1) a = 1;

    out[i * 4 + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) {
      const v = (px[i * 4 + c] - (1 - a) * white) / a;
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    touched++;
  }
  return touched;
}

/** Chebyshev-distance dilation of the backdrop mask: the boundary band. */
function bandOf(bg, w, h) {
  const band = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) continue;
      let near = false;
      for (let dy = -BAND; dy <= BAND && !near; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -BAND; dx <= BAND; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (bg[yy * w + xx]) {
            near = true;
            break;
          }
        }
      }
      if (near) band[i] = 1;
    }
  }
  return band;
}

const dist = (a, b, c, d, e, f) =>
  Math.sqrt((a - d) * (a - d) + (b - e) * (b - e) + (c - f) * (c - f));

/**
 * Pass 3: alpha and colour for the band.
 *
 * `P = a*F + (1-a)*B`, with B measured from the backdrop next door and F from
 * the solid subject next door. Rearranged for a, then for F.
 */
function decontaminate(px, bg, band, w, h) {
  const out = Buffer.from(px);
  let touched = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) {
        out[i * 4 + 3] = 0;
        continue;
      }
      if (!band[i]) continue;

      let br = 0;
      let bgn = 0;
      let bb = 0;
      let nb = 0;
      let fr = 0;
      let fg = 0;
      let fb = 0;
      let nf = 0;

      for (let dy = -SAMPLE; dy <= SAMPLE; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -SAMPLE; dx <= SAMPLE; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (bg[j]) {
            br += px[j * 4];
            bgn += px[j * 4 + 1];
            bb += px[j * 4 + 2];
            nb++;
          } else if (!band[j]) {
            fr += px[j * 4];
            fg += px[j * 4 + 1];
            fb += px[j * 4 + 2];
            nf++;
          }
        }
      }

      // No backdrop in reach means the band flag was spurious; leave it alone.
      if (nb === 0) continue;
      const Br = br / nb;
      const Bg = bgn / nb;
      const Bb = bb / nb;
      // No solid subject in reach — a lone spur one pixel wide. Its own colour
      // is the best estimate of itself there is.
      const Fr = nf ? fr / nf : px[i * 4];
      const Fg = nf ? fg / nf : px[i * 4 + 1];
      const Fb = nf ? fb / nf : px[i * 4 + 2];

      const spread = dist(Fr, Fg, Fb, Br, Bg, Bb);
      const reach = dist(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], Br, Bg, Bb);
      // A subject the same colour as the backdrop carries no information about
      // its own coverage; keeping it opaque is the safe half of that guess.
      let a = spread < 8 ? 1 : Math.min(1, reach / spread);
      if (a < 0.02) a = 0;

      out[i * 4 + 3] = Math.round(a * 255);
      if (a > 0) {
        for (let c = 0; c < 3; c++) {
          const B = c === 0 ? Br : c === 1 ? Bg : Bb;
          const v = (px[i * 4 + c] - (1 - a) * B) / a;
          out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
        }
      }
      touched++;
    }
  }
  return { out, touched };
}

/** Tight box around everything that is not fully transparent. */
function bounds(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1 };
}

function crop(px, w, box) {
  const cw = box.x1 - box.x0 + 1;
  const ch = box.y1 - box.y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    px.copy(
      out,
      y * cw * 4,
      ((y + box.y0) * w + box.x0) * 4,
      ((y + box.y0) * w + box.x0 + cw) * 4,
    );
  }
  return { buf: out, w: cw, h: ch };
}

/** Flatten onto a colour, so a fringe has something to show up against. */
function composite(px, w, h, bgColour) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(px[i * 4 + c] * a + bgColour[c] * (1 - a));
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* -------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const paths = args.filter((a) => !a.startsWith("--"));

if (paths.length === 0) {
  console.error(
    "usage: node tools/cut-bg.mjs <in.png> [out.png] [--trim] [--preview]",
  );
  process.exit(1);
}

const inFile = resolve(ROOT, paths[0]);
const outFile = paths[1]
  ? resolve(ROOT, paths[1])
  : join(
      dirname(inFile),
      basename(inFile, extname(inFile)) + "-nobg" + extname(inFile),
    );

const info = probe(inFile);
const px = decode(inFile);
console.log(`in   ${paths[0]}  ${info.w}x${info.h}  ${info.pixFmt}`);

const glowing = flags.has("--glow");

const maybe = classify(px, info.w, info.h);
const bg = flood(maybe, info.w, info.h);
const pockets = sweepPockets(maybe, bg, info.w, info.h);

/**
 * What the edge pass treats as "behind the subject".
 *
 * Plain, that is the backdrop. Under --glow it is the backdrop *and* its bloom,
 * so the two-pixel band lands on the art's own edge instead of forty pixels out
 * in the halo — and it samples the bloom's colour as the thing to unmix the
 * edge against, which over a lit lockup is what is actually behind it.
 */
const white = glowing ? whiteLevel(px, info.w, info.h) : 255;
const soft = glowing ? glowFlood(px, bg, info.w, info.h) : bg;

const band = bandOf(soft, info.w, info.h);
const { out, touched } = decontaminate(px, soft, band, info.w, info.h);

// Last, because it overwrites the flat zero decontaminate leaves on the mask:
// under the bloom the backdrop is not gone, it is partly covered.
const bloom = glowing ? unmixGlow(out, px, soft, info.w, info.h, white) : 0;

let cut = 0;
let candidates = 0;
for (let i = 0; i < info.w * info.h; i++) {
  if (bg[i]) cut++;
  if (maybe[i]) candidates++;
}
const box = bounds(out, info.w, info.h);

const pct = (n) => ((n / (info.w * info.h)) * 100).toFixed(1) + "%";
console.log(`     backdrop candidates ${pct(candidates)}, cut ${pct(cut)}`);
console.log(`     enclosed pockets swept ${pockets} px`);
if (glowing) {
  console.log(`     backdrop white ${white}, bloom unmixed ${bloom} px`);
}
console.log(`     edge pixels rebuilt ${touched}`);
console.log(
  `     subject box ${box.x1 - box.x0 + 1}x${box.y1 - box.y0 + 1} at ${box.x0},${box.y0}`,
);

let final = { buf: out, w: info.w, h: info.h };
if (flags.has("--trim")) {
  final = crop(out, info.w, box);
  console.log(`     trimmed to ${final.w}x${final.h}`);
}

writePng(final.buf, final.w, final.h, outFile);
console.log("out  " + outFile.slice(ROOT.length + 1).replace(/\\/g, "/"));

if (flags.has("--preview")) {
  const file = join(
    dirname(outFile),
    basename(outFile, extname(outFile)) + "-on-dark" + extname(outFile),
  );
  writePng(
    composite(final.buf, final.w, final.h, PREVIEW_BG),
    final.w,
    final.h,
    file,
  );
  console.log("out  " + file.slice(ROOT.length + 1).replace(/\\/g, "/"));
}
