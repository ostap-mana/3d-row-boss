/**
 * Cut a baked backdrop off a cutout and give it a real alpha channel.
 *
 *   node tools/cut-bg.mjs src/boss/image.png                 # -> image-nobg.png
 *   node tools/cut-bg.mjs src/boss/image.png out.png         # explicit output
 *   node tools/cut-bg.mjs src/boss/image.png --trim          # drop empty margin
 *   node tools/cut-bg.mjs src/boss/image.png --preview       # also composite it
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

const maybe = classify(px, info.w, info.h);
const bg = flood(maybe, info.w, info.h);
const pockets = sweepPockets(maybe, bg, info.w, info.h);
const band = bandOf(bg, info.w, info.h);
const { out, touched } = decontaminate(px, bg, band, info.w, info.h);

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
