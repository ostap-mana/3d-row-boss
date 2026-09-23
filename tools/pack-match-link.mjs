import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "masters/hint/marks-sheet.webp");
const OUT_DIR = join(ROOT, "src/assets/hint");

const SHEET = 1254;

const ICON_BAND = [0.635, 0.735];

const ELEMENTS = [
  { name: "fire", rgb: [0xfd, 0x5d, 0x40] },
  { name: "water", rgb: [0x6e, 0xab, 0xfd] },
  { name: "nature", rgb: [0x8b, 0xdd, 0x3d] },
  { name: "lightning", rgb: [0xfd, 0xeb, 0x50] },
  { name: "arcane", rgb: [0xd6, 0x8e, 0xfb] },
  { name: "wind", rgb: [0xd5, 0xfc, 0xfa] },
];

const RING_AT = 0.36;

const ANGLES = 1440;

const GAP_FLOOR = 0.08;

const TOUCH = 40;

const FEATHER = 3;

const UPSCALE = 2;

const FLOOR = 22;

const MIN_AREA = 400;

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

function sample(px, w, h, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const out = [0, 0, 0, 0];
  const tap = (sx, sy, k) => {
    if (k <= 0 || sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const i = (sy * w + sx) * 4;
    const a = px[i + 3] * k;
    out[0] += px[i] * a;
    out[1] += px[i + 1] * a;
    out[2] += px[i + 2] * a;
    out[3] += a;
  };
  tap(x0, y0, (1 - fx) * (1 - fy));
  tap(x0 + 1, y0, fx * (1 - fy));
  tap(x0, y0 + 1, (1 - fx) * fy);
  tap(x0 + 1, y0 + 1, fx * fy);
  if (out[3] > 0) {
    out[0] /= out[3];
    out[1] /= out[3];
    out[2] /= out[3];
  }
  return out;
}

const quantile = (list, q) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

const PLATEAU = 0.85;

function polar(px, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const R = Math.ceil(Math.max(box.w, box.h) / 2) + 2;
  const rows = [];
  for (let r = 0; r <= R; r++) {
    const ring = [];
    for (let i = 0; i < ANGLES; i++) {
      const a = (i / ANGLES) * Math.PI * 2;
      ring.push(
        sample(px, SHEET, SHEET, cx + r * Math.cos(a), cy + r * Math.sin(a)),
      );
    }
    rows.push(ring);
  }
  const alphas = rows.map((ring) => ring.map((p) => p[3]));
  const low = alphas.map((list) => quantile(list, 0.25));
  const mid = alphas.map((list) => quantile(list, 0.5));

  let top = 0;
  let peak = 0;
  for (let r = Math.floor(R * 0.5); r <= R; r++) {
    if (low[r] > peak) {
      peak = low[r];
      top = r;
    }
  }
  let pA = top;
  while (pA > 0 && low[pA - 1] >= peak * PLATEAU) pA--;
  let pB = top;
  while (pB < R && low[pB + 1] >= peak * PLATEAU) pB++;
  const rc = Math.round((pA + pB) / 2);

  let rOut = pB;
  while (rOut < R && mid[rOut] > 1) rOut++;

  let rIn = pA;
  while (rIn > 0 && low[rIn] > peak * GAP_FLOOR) rIn--;
  rIn = Math.max(rIn, pA - (rOut - pB));

  const clean = new Uint8Array(ANGLES).fill(1);
  for (let i = 0; i < ANGLES; i++) {
    for (let r = Math.max(0, rIn - 2); r <= rIn; r++) {
      if (alphas[r][i] > TOUCH) clean[i] = 0;
    }
  }
  let touched = 0;
  for (let i = 0; i < ANGLES; i++) if (!clean[i]) touched++;

  const tint = hue(px, SHEET, box);
  return { cx, cy, R, rc, rIn, rOut, peak, rows, clean, touched, tint };
}

const gate = (r, rIn) => {
  const t = Math.min(1, Math.max(0, (r - (rIn - FEATHER)) / (FEATHER * 2)));
  return t * t * (3 - 2 * t);
};

function ringImage(px, geo) {
  const side = Math.round(geo.rc / RING_AT);
  const out = Buffer.alloc(side * side * 4);
  const mid = side / 2;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x + 0.5 - mid;
      const dy = y + 0.5 - mid;
      const r = Math.hypot(dx, dy);
      const o = (y * side + x) * 4;
      const p = sample(px, SHEET, SHEET, geo.cx + dx, geo.cy + dy);
      const a = Math.round(p[3] * gate(r, geo.rIn));
      if (a > 0) {
        out[o] = Math.round(p[0]);
        out[o + 1] = Math.round(p[1]);
        out[o + 2] = Math.round(p[2]);
        out[o + 3] = a;
      } else {
        out[o] = geo.tint[0];
        out[o + 1] = geo.tint[1];
        out[o + 2] = geo.tint[2];
      }
    }
  }
  return { px: out, w: side, h: side };
}

function linkImage(geo) {
  const half = Math.max(geo.rOut - geo.rc, geo.rc - geo.rIn);
  const h = half * 2;
  const w = Math.round(Math.PI * 2 * geo.rc);
  const out = Buffer.alloc(w * h * 4);
  const columnFor = (i) => {
    if (geo.clean[i]) return i;
    for (let step = 1; step < ANGLES; step++) {
      const a = (i + step) % ANGLES;
      const b = (i - step + ANGLES) % ANGLES;
      if (geo.clean[a]) return a;
      if (geo.clean[b]) return b;
    }
    return i;
  };
  for (let x = 0; x < w; x++) {
    const i = Math.floor((x / w) * ANGLES);
    const col = columnFor(i);
    for (let y = 0; y < h; y++) {
      const r = geo.rc + (y + 0.5 - half);
      const row = geo.rows[Math.round(r)];
      const p = row ? row[col] : [0, 0, 0, 0];
      const o = (y * w + x) * 4;
      const a = Math.round(p[3] * gate(r, geo.rIn));
      if (a > 0) {
        out[o] = Math.round(p[0]);
        out[o + 1] = Math.round(p[1]);
        out[o + 2] = Math.round(p[2]);
        out[o + 3] = a;
      } else {
        out[o] = geo.tint[0];
        out[o + 1] = geo.tint[1];
        out[o + 2] = geo.tint[2];
      }
    }
  }
  return { px: out, w, h };
}

const rgb = decode(SOURCE);
const px = key(rgb, SHEET, SHEET);

const found = shapes(
  px,
  SHEET,
  Math.round(ICON_BAND[0] * SHEET),
  Math.round(ICON_BAND[1] * SHEET),
);
const byElement = {};
for (const box of found) {
  const name = classify(hue(px, SHEET, box));
  if (!byElement[name]) byElement[name] = box;
}

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
let total = 0;

for (const el of ELEMENTS) {
  const box = byElement[el.name];
  if (!box) throw new Error(`${el.name}: no icon found in the band`);
  const geo = polar(px, box);
  const ring = ringImage(px, geo);
  const link = linkImage(geo);
  const ringPath = join(OUT_DIR, `ring-${el.name}.webp`);
  const linkPath = join(OUT_DIR, `link-${el.name}.webp`);
  encode(ring.px, ring.w, ring.h, ringPath, UPSCALE);
  encode(link.px, link.w, link.h, linkPath, UPSCALE);
  const a = statSync(ringPath).size;
  const b = statSync(linkPath).size;
  total += a + b;
  const pct = ((geo.touched / ANGLES) * 100).toFixed(0);
  console.log(
    `${el.name.padEnd(10)} icon ${box.w}x${box.h} at ${box.x},${box.y}` +
      `  ring r=${geo.rc} in=${geo.rIn} out=${geo.rOut} peak=${geo.peak}` +
      `  touched ${pct}%  -> ring ${ring.w * UPSCALE}px ${kb(a)}` +
      `  link ${link.w * UPSCALE}x${link.h * UPSCALE} ${kb(b)}`,
  );
}

console.log(`\n12 files, ${kb(total)} total`);
console.log(
  `ring centre sits at ${RING_AT} of the ring texture side, stroke core at` +
    ` half the link height - RING_AT in src/art/matchlink.js`,
);
