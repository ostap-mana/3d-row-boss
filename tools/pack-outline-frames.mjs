import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/cards/outline-sheet.png");
const OUT_DIR = join(ROOT, "src/assets/cards");
const OUT = join(OUT_DIR, "outline");

const NAMES = ["red", "cyan", "green", "orange", "purple", "grey"];

const KEY_LOW = 28;

const LINE_Q = 0.98;

const SOLID = 0.6;

const ALPHA_FLOOR = 10;

const MIN_RUN = 4;

const RUN_LEVEL = 70;

const BOX_H = 264;
const PAD = 2;

const GROW = 5.2;

const GROW_STEPS = 24;

const GEM_COLORS = [0xff5a1f, 0x2fa8ff, 0x3fd16a, 0xffd22e, 0xa855f7, 0x8ceee2];

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x");
  return { w: Number(w), h: Number(h) };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file, args) {
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

const LOSSLESS = [
  "-c:v",
  "libwebp",
  "-lossless",
  "1",
  "-compression_level",
  "6",
];

const at = (w, x, y) => (y * w + x) * 4;

function backdrop(px, w, h) {
  const seen = new Map();
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = at(w, x, y);
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  let best = 0;
  let top = 0;
  for (const [key, n] of seen) {
    if (n > top) {
      top = n;
      best = key;
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

const away = (px, i, bg) =>
  Math.max(
    Math.abs(px[i] - bg[0]),
    Math.abs(px[i + 1] - bg[1]),
    Math.abs(px[i + 2] - bg[2]),
  );

function columnRuns(px, w, h, bg) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (away(px, at(w, x, y), bg) > RUN_LEVEL) n++;
    if (n >= MIN_RUN) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, w - 1]);
  return runs;
}

function lineLevel(px, w, h, bg, x0, x1) {
  const lit = [];
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = away(px, at(w, x, y), bg);
      if (d > KEY_LOW) lit.push(d);
    }
  }
  lit.sort((a, b) => a - b);
  return lit[Math.floor(lit.length * LINE_Q)] || KEY_LOW + 1;
}

function key(px, w, h, bg, x0, x1, level) {
  const out = Buffer.alloc(w * h * 4);
  const span = Math.max(1, level - KEY_LOW);
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = at(w, x, y);
      const a = Math.max(0, Math.min(1, (away(px, i, bg) - KEY_LOW) / span));
      if (a <= 0) continue;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = clamp8(a * 255);
    }
  }
  return out;
}

function fatten(px, w, h, x0, x1) {
  const r = GROW / 2;
  if (r <= 0) return { px, x0, x1 };

  const reach = Math.ceil(r);
  const lo = Math.max(0, x0 - reach);
  const hi = Math.min(w - 1, x1 + reach);
  const out = Buffer.from(px);

  const alpha = (fx, fy) => {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    let acc = 0;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const sx = ix + dx;
        const sy = iy + dy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        acc += px[at(w, sx, sy) + 3] * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
      }
    }
    return acc;
  };

  for (let y = 0; y < h; y++) {
    for (let x = lo; x <= hi; x++) {
      const i = at(w, x, y);
      let a = px[i + 3];
      for (let s = 0; s < GROW_STEPS; s++) {
        const t = (s / GROW_STEPS) * Math.PI * 2;
        const v = alpha(x + Math.cos(t) * r, y + Math.sin(t) * r);
        if (v > a) a = v;
      }
      if (a <= 0) continue;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = clamp8(a);
    }
  }
  return { px: out, x0: lo, x1: hi };
}

function lineBox(px, w, h, x0, x1) {
  let y0 = h;
  let y1 = -1;
  let bx0 = x1;
  let bx1 = x0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      if (px[at(w, x, y) + 3] <= SOLID * 255) continue;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
    }
  }
  return { x0: bx0, y0, w: bx1 - bx0 + 1, h: y1 - y0 + 1 };
}

function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = at(w, box.x0, y + box.y0);
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

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

function onCanvas(art, aw, ah, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < ah; y++) {
    const src = at(aw, 0, y);
    art.copy(out, at(w, PAD, y + PAD), src, src + aw * 4);
  }
  return out;
}

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const REACH = 16;

function profile(px, w, h, box) {
  const alpha = (x, y) => px[at(w, x, y) + 3] / 255;
  const inset = (n) => Math.round(n * 0.12);
  const runs = [];

  for (let y = box.y0 + inset(box.h); y < box.y0 + box.h - inset(box.h); y++) {
    let left = 0;
    let right = 0;
    for (let i = 0; i < REACH; i++) {
      left += alpha(box.x0 + i, y);
      right += alpha(box.x0 + box.w - 1 - i, y);
    }
    runs.push(left, right);
  }
  for (let x = box.x0 + inset(box.w); x < box.x0 + box.w - inset(box.w); x++) {
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < REACH; i++) {
      top += alpha(x, box.y0 + i);
      bottom += alpha(x, box.y0 + box.h - 1 - i);
    }
    runs.push(top, bottom);
  }

  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const sd = Math.sqrt(
    runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length,
  );
  return { mean, sd };
}

function cornerRadius(px, w, h) {
  const solid = (x, y) => px[at(w, x, y) + 3] > SOLID * 255;

  let top = 0;
  while (top < h && !solid(Math.round(w / 2), top)) top++;
  let left = 0;
  while (left < w && !solid(left, Math.round(h / 2))) left++;

  for (let x = left; x < w; x++) {
    let ymin = -1;
    for (let y = 0; y < h; y++) {
      if (solid(x, y)) {
        ymin = y;
        break;
      }
    }
    if (ymin >= 0 && ymin <= top) return x - left;
  }
  return 0;
}

function denoise(px, floor) {
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] <= floor) {
      px[i] = 0;
      px[i - 1] = 0;
      px[i - 2] = 0;
      px[i - 3] = 0;
    }
  }
  return px;
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const sheet = decode(SOURCE);
const bg = backdrop(sheet, info.w, info.h);
console.log(
  `in   ${rel(SOURCE)}  ${info.w}x${info.h}  ${kb(statSync(SOURCE).size)}`,
);
console.log(`     backdrop rgb(${bg.join(",")}), ramp from ${KEY_LOW}`);

const runs = columnRuns(sheet, info.w, info.h, bg);
if (runs.length !== NAMES.length) {
  throw new Error(`expected ${NAMES.length} frames, found ${runs.length}`);
}

const cut = runs.map(([x0, x1], i) => {
  const level = lineLevel(sheet, info.w, info.h, bg, x0, x1);
  const keyed = fatten(
    key(sheet, info.w, info.h, bg, x0, x1, level),
    info.w,
    info.h,
    x0,
    x1,
  );
  const box = lineBox(keyed.px, info.w, info.h, keyed.x0, keyed.x1);
  const scale = (BOX_H - PAD * 2) / box.h;
  const aw = Math.round(box.w * scale);
  const ah = BOX_H - PAD * 2;
  const cw = aw + PAD * 2;
  const art = resample(crop(keyed.px, info.w, box), box.w, box.h, aw, ah);
  const out = denoise(onCanvas(art, aw, ah, cw, BOX_H), ALPHA_FLOOR);
  const line = profile(out, cw, BOX_H, {
    x0: PAD,
    y0: PAD,
    w: aw,
    h: BOX_H - PAD * 2,
  });
  return {
    name: NAMES[i],
    out,
    w: cw,
    level,
    line,
    radius: cornerRadius(out, cw, BOX_H),
    aspect: box.w / box.h,
  };
});

for (const f of cut) {
  console.log(
    `     ${f.name.padEnd(7)} line ${f.level.toString().padStart(3)} off the backdrop` +
      `  weight ${f.line.mean.toFixed(2)}px  spread ${f.line.sd.toFixed(3)}` +
      `  radius ${f.radius}  ${f.w}x${BOX_H}`,
  );
}

const master = cut.reduce((a, b) => (b.line.sd < a.line.sd ? b : a));

if (flags.has("--png")) encode(master.out, master.w, BOX_H, `${OUT}.png`);
encode(master.out, master.w, BOX_H, `${OUT}.webp`, LOSSLESS);

console.log(
  `\nout  ${rel(OUT)}.webp  ${master.w}x${BOX_H}  ${kb(statSync(`${OUT}.webp`).size)}` +
    `  <- the ${master.name}, evenest of the six`,
);
console.log(
  `\n     for art/cardframe.js:  BOX_H ${BOX_H - PAD * 2}  MARGIN ${PAD}` +
    `  BORDER ${master.line.mean.toFixed(2)}  RADIUS ${master.radius}`,
);

if (flags.has("--proof")) {
  const gap = 8;
  const W = (master.w + gap) * NAMES.length + gap;
  const H = BOX_H + gap * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 26;
    proof[i * 4 + 1] = 18;
    proof[i * 4 + 2] = 40;
    proof[i * 4 + 3] = 255;
  }
  const CARD = [0x12, 0x0b, 0x1e];
  let ox = gap;
  GEM_COLORS.forEach((tint) => {
    const rgb = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];
    for (let y = PAD; y < BOX_H - PAD; y++) {
      for (let x = PAD; x < master.w - PAD; x++) {
        const d = at(W, ox + x, gap + y);
        for (let c = 0; c < 3; c++) proof[d + c] = CARD[c];
      }
    }
    for (let y = 0; y < BOX_H; y++) {
      for (let x = 0; x < master.w; x++) {
        const a = master.out[at(master.w, x, y) + 3] / 255;
        if (a === 0) continue;
        const d = at(W, ox + x, gap + y);
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(rgb[c] * a + proof[d + c] * (1 - a));
        }
      }
    }
    ox += master.w + gap;
  });
  const file = join(OUT_DIR, "outline-proof.png");
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  (delete when looked at)`);
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
