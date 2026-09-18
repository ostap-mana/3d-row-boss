import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "masters/hint/marks-sheet.webp");
const OUT_DIR = join(ROOT, "src/assets/hint");

const SHEET = 1254;

const ROWS = {
  cornerTop: [0.036, 0.062],
  cornerBottom: [0.103, 0.129],
  arrow: [0.175, 0.213],
};

const COLUMNS = 7;

const ELEMENTS = [
  { name: "fire", rgb: [0xfd, 0x5d, 0x40] },
  { name: "water", rgb: [0x6e, 0xab, 0xfd] },
  { name: "nature", rgb: [0x8b, 0xdd, 0x3d] },
  { name: "lightning", rgb: [0xfd, 0xeb, 0x50] },
  { name: "arcane", rgb: [0xd6, 0x8e, 0xfb] },
  { name: "wind", rgb: [0xd5, 0xfc, 0xfa] },
];

const CORNER_RATIO = 0.23;

const UPSCALE = 2;

const FLOOR = 22;

const MIN_AREA = 25;

const LOSSY = ["-c:v", "libwebp", "-q:v", "90", "-compression_level", "6"];

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, scale) {
  const filter =
    scale > 1 ? ["-vf", `scale=iw*${scale}:ih*${scale}:flags=lanczos`] : [];
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
      ...filter,
      ...LOSSY,
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

function key(rgb, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, o = 0; o < out.length; i += 3, o += 4) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const top = Math.max(r, g, b);
    if (top === 0) continue;
    const t = Math.min(1, Math.max(0, (top - FLOOR) / (FLOOR * 0.8)));
    const gate = t * t * (3 - 2 * t);
    if (gate <= 0) continue;
    const k = 255 / top;
    out[o] = Math.min(255, Math.round(r * k));
    out[o + 1] = Math.min(255, Math.round(g * k));
    out[o + 2] = Math.min(255, Math.round(b * k));
    out[o + 3] = Math.round(gate * top);
  }
  return out;
}

const alphaAt = (px, w, x, y) => px[(y * w + x) * 4 + 3];

function shapes(px, w, y0, y1) {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const found = [];
  const lit = (x, y) => alphaAt(px, w, x, y0 + y) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !lit(x, y)) continue;
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      let x0 = x;
      let x1 = x;
      let ya = y;
      let yb = y;
      let n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < ya) ya = cy;
        if (cy > yb) yb = cy;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (seen[ny * w + nx] || !lit(nx, ny)) continue;
            seen[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= MIN_AREA) {
        found.push({ x: x0, y: y0 + ya, w: x1 - x0 + 1, h: yb - ya + 1 });
      }
    }
  }
  return found.sort((a, b) => a.x - b.x);
}

function hue(px, w, box) {
  const bright = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 120) continue;
      bright.push([px[i + 3], px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (!bright.length) return [0, 0, 0];
  bright.sort((a, b) => b[0] - a[0]);
  const take = bright.slice(0, Math.max(1, Math.floor(bright.length * 0.25)));
  const sum = [0, 0, 0];
  for (const p of take) {
    sum[0] += p[1];
    sum[1] += p[2];
    sum[2] += p[3];
  }
  return sum.map((v) => Math.round(v / take.length));
}

const full = (rgb) => {
  const k = 255 / Math.max(1, Math.max(...rgb));
  return rgb.map((v) => v * k);
};

function classify(rgb) {
  const a = full(rgb);
  let best = null;
  let near = Infinity;
  for (const el of ELEMENTS) {
    const b = full(el.rgb);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < near) {
      near = d;
      best = el.name;
    }
  }
  return best;
}

function columns(px, w, band) {
  const [a, b] = band;
  const found = shapes(px, w, Math.round(a * SHEET), Math.round(b * SHEET));
  const pitch = SHEET / COLUMNS;
  const cols = Array.from({ length: COLUMNS }, () => []);
  for (const box of found) {
    const i = Math.min(COLUMNS - 1, Math.floor((box.x + box.w / 2) / pitch));
    cols[i].push(box);
  }
  const byElement = {};
  for (const col of cols) {
    if (!col.length) continue;
    const name = classify(hue(px, w, col[0]));
    if (!byElement[name]) byElement[name] = col;
  }
  return byElement;
}

function blit(src, sw, box, dst, dw, dx, dy) {
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((box.y + y) * sw + box.x + x) * 4;
      if (!src[s + 3]) continue;
      const d = ((dy + y) * dw + dx + x) * 4;
      if (src[s + 3] <= dst[d + 3]) continue;
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

function heading(px, w, box) {
  const horizontal = box.w >= box.h;
  const span = horizontal ? box.w : box.h;
  const len = horizontal ? box.h : box.w;
  const across = (i) => {
    let n = 0;
    for (let j = 0; j < len; j++) {
      const x = horizontal ? box.x + i : box.x + j;
      const y = horizontal ? box.y + j : box.y + i;
      if (px[(y * w + x) * 4 + 3] > 90) n++;
    }
    return n;
  };
  let widest = 0;
  let at = 0;
  for (let i = 0; i < span; i++) {
    const n = across(i);
    if (n > widest) {
      widest = n;
      at = i;
    }
  }
  const forward = at >= span / 2;
  if (horizontal) return forward ? "right" : "left";
  return forward ? "down" : "up";
}

function turn(src, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (x * h + (h - 1 - y)) * 4;
      src.copy(out, d, s, s + 4);
    }
  }
  return { px: out, w: h, h: w };
}

const rgb = decode(SOURCE);
const px = key(rgb, SHEET, SHEET);

const top = columns(px, SHEET, ROWS.cornerTop);
const bottom = columns(px, SHEET, ROWS.cornerBottom);
const arrows = columns(px, SHEET, ROWS.arrow);

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
const written = [];

const cut = ELEMENTS.map((el) => {
  const up = top[el.name];
  const down = bottom[el.name];
  const arrow = arrows[el.name];
  if (!up || up.length < 2 || !down || down.length < 2 || !arrow) {
    throw new Error(`${el.name}: sheet is missing a corner pair or an arrow`);
  }
  return { el, corners: [up[0], up[1], down[0], down[1]], arrow: arrow[0] };
});

const SIDE = Math.round(
  cut.reduce(
    (sum, { corners }) =>
      sum + corners.reduce((s, c) => s + (c.w + c.h) / 2, 0) / corners.length,
    0,
  ) /
    cut.length /
    CORNER_RATIO,
);

for (const { el, corners, arrow: box } of cut) {
  const [tl, tr, bl, br] = corners;
  const side = SIDE;
  const frame = Buffer.alloc(side * side * 4);
  blit(px, SHEET, tl, frame, side, 0, 0);
  blit(px, SHEET, tr, frame, side, side - tr.w, 0);
  blit(px, SHEET, bl, frame, side, 0, side - bl.h);
  blit(px, SHEET, br, frame, side, side - br.w, side - br.h);
  const framePath = join(OUT_DIR, `frame-${el.name}.webp`);
  encode(frame, side, side, framePath, UPSCALE);

  let shape = Buffer.alloc(box.w * box.h * 4);
  blit(px, SHEET, box, shape, box.w, 0, 0);
  let aw = box.w;
  let ah = box.h;
  const points = heading(px, SHEET, box);
  const turns = { right: 0, down: 3, left: 2, up: 1 }[points];
  for (let i = 0; i < turns; i++) {
    const t = turn(shape, aw, ah);
    shape = t.px;
    aw = t.w;
    ah = t.h;
  }
  const arrowPath = join(OUT_DIR, `arrow-${el.name}.webp`);
  encode(shape, aw, ah, arrowPath, UPSCALE);

  written.push({ el: el.name, side, aw, ah, points, framePath, arrowPath });
}

const slice =
  Math.max(
    ...cut.flatMap(({ corners }) => corners.flatMap((c) => [c.w, c.h])),
  ) / SIDE;

let total = 0;
for (const r of written) {
  const a = statSync(r.framePath).size;
  const b = statSync(r.arrowPath).size;
  total += a + b;
  console.log(
    `${r.el.padEnd(10)} frame ${String(r.side * UPSCALE).padStart(3)}px ` +
      `${kb(a).padStart(7)}   arrow ${r.aw * UPSCALE}x${r.ah * UPSCALE} ` +
      `${kb(b).padStart(7)}  (drawn ${r.points})`,
  );
}
console.log(`\n12 files, ${kb(total)} total`);
console.log(
  `frame ${SIDE * UPSCALE}px square, nine-slice past ${(slice * 100).toFixed(1)}%` +
    ` of it — FRAME_SLICE in src/art/hintmarks.js`,
);
