import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/cards");
const PROOF_DIR = join(ROOT, "src/animation/vfx-proof");

const COLS = 6;
const COUNT = 18;
const CELL_W = 216;
const CELL_H = 344;

const FPS = 10;

const CARD_W = 128;
const CARD_H = 256;
const MARGIN = 44;
const LINE = 7;
const RADIUS = 5;

const SS = 3;
const QUALITY = 72;

const W = CELL_W * SS;
const H = CELL_H * SS;
const hw = (CARD_W * SS) / 2;
const hh = (CARD_H * SS) / 2;
const rad = RADIUS * SS;
const half = (LINE * SS) / 2;
const cx = W / 2;
const cy = H / 2;
const REACH = MARGIN * SS * 0.94;

const ELEMENTS = [
  { id: "fire", color: 0xff5a1f, deep: 0xa81200 },
  { id: "water", color: 0x2fa8ff, deep: 0x0c37b4 },
  { id: "nature", color: 0x3fd16a, deep: 0x0d6b2a },
  { id: "lightning", color: 0xffd22e, deep: 0xb85c00 },
  { id: "arcane", color: 0xa855f7, deep: 0x431a96 },
  { id: "wind", color: 0x8ceee2, deep: 0x1d7f92 },
];

const runX = 2 * (hw - rad);
const runY = 2 * (hh - rad);
const runArc = (Math.PI / 2) * rad;
const PERIM = 2 * runX + 2 * runY + 4 * runArc;

const CORNER_U = [
  runX + runArc / 2,
  runX + runArc + runY + runArc / 2,
  2 * runX + 2 * runArc + runY + runArc / 2,
  2 * runX + 3 * runArc + 2 * runY + runArc / 2,
].map((d) => d / PERIM);

const CORNER_SIGMA = 0.032;

const CORNER_LIFT = 0.6;

function cornerAt(u) {
  let best = 0;
  for (const c of CORNER_U) {
    let d = Math.abs(u - c);
    if (d > 0.5) d = 1 - d;
    const g = Math.exp(-(d * d) / (2 * CORNER_SIGMA * CORNER_SIGMA));
    if (g > best) best = g;
  }
  return best;
}

function pointAt(u) {
  let d = (u - Math.floor(u)) * PERIM;
  const ex = hw - rad;
  const ey = hh - rad;

  if (d < runX) return [cx - ex + d, cy - hh, 0, -1, 1, 0];
  d -= runX;
  if (d < runArc) {
    const a = -Math.PI / 2 + d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx + ex + rad * nx, cy - ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runY) return [cx + hw, cy - ey + d, 1, 0, 0, 1];
  d -= runY;
  if (d < runArc) {
    const a = d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx + ex + rad * nx, cy + ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runX) return [cx + ex - d, cy + hh, 0, 1, -1, 0];
  d -= runX;
  if (d < runArc) {
    const a = Math.PI / 2 + d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx - ex + rad * nx, cy + ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runY) return [cx - hw, cy + ey - d, -1, 0, 0, -1];
  d -= runY;
  const a = Math.PI + d / rad;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  return [cx - ex + rad * nx, cy - ey + rad * ny, nx, ny, -ny, nx];
}

const lineMask = new Float32Array(W * H);
const bandMask = new Float32Array(W * H);
const inlayMask = new Float32Array(W * H);
const uOf = new Float32Array(W * H);
const cornerOf = new Float32Array(W * H);
const touched = [];

{
  const ex = hw - rad;
  const ey = hh - rad;
  const feather = SS * 0.8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const qx = ax - ex;
      const qy = ay - ey;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = out + Math.min(Math.max(qx, qy), 0) - rad;
      const off = Math.abs(d) - half;
      const i = y * W + x;

      lineMask[i] = Math.min(1, Math.max(0, 0.5 - off / feather));
      inlayMask[i] = Math.min(
        1,
        Math.max(0, (half * 0.34 - Math.abs(d)) / feather + 0.5),
      );
      bandMask[i] =
        off <= 0
          ? 1
          : d > 0
            ? Math.pow(Math.max(0, 1 - off / REACH), 1.4)
            : Math.exp(-off / (3.5 * SS));

      if (lineMask[i] > 0.002 || bandMask[i] > 0.004) {
        let s;
        if (qx > 0 && qy > 0) s = runY / 2 + Math.atan2(qy, qx) * rad;
        else if (qx >= qy) s = ay;
        else s = runY / 2 + runArc + (ex - ax);
        const quad = runY / 2 + runArc + runX / 2;
        let u;
        if (dx >= 0 && dy >= 0) u = s;
        else if (dx < 0 && dy >= 0) u = 2 * quad - s;
        else if (dx < 0) u = 2 * quad + s;
        else u = 4 * quad - s;
        uOf[i] = (u / (4 * quad)) % 1;
        cornerOf[i] = cornerAt(uOf[i]);
        touched.push(i);
      }
    }
  }
}

function rnd(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const BRUSH_DIR = "src/source/fx/invokers";

const BRUSH_PX = 96;

const BRUSH_FLOOR = 0.07;

const BRUSH_KEEP = 0.3;

const BRUSH_BURN = 0.55;

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

function gridOf(name) {
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

function maskAt(px, i) {
  const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return (l * px[i + 3]) / (255 * 255);
}

const brushes = {};

function loadBrush(name) {
  if (brushes[name]) return brushes[name];
  const file = join(ROOT, BRUSH_DIR, `${name}.png`);
  const { w, h } = probe(file);
  const { cols, rows } = gridOf(name);
  const px = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
  const cw = Math.floor(w / cols);
  const ch = Math.floor(h / rows);

  const cells = [];
  let peak = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = new Float32Array(BRUSH_PX * BRUSH_PX);
      for (let y = 0; y < BRUSH_PX; y++) {
        const sy0 = r * ch + Math.floor((y * ch) / BRUSH_PX);
        const sy1 = Math.max(
          sy0 + 1,
          r * ch + Math.floor(((y + 1) * ch) / BRUSH_PX),
        );
        for (let x = 0; x < BRUSH_PX; x++) {
          const sx0 = c * cw + Math.floor((x * cw) / BRUSH_PX);
          const sx1 = Math.max(
            sx0 + 1,
            c * cw + Math.floor(((x + 1) * cw) / BRUSH_PX),
          );
          let sum = 0;
          let n = 0;
          for (let sy = sy0; sy < sy1; sy++) {
            for (let sx = sx0; sx < sx1; sx++) {
              sum += maskAt(px, (sy * w + sx) * 4);
              n++;
            }
          }
          const v = sum / n;
          m[y * BRUSH_PX + x] = v;
          if (v > peak) peak = v;
        }
      }
      cells.push(m);
    }
  }
  if (peak <= 0) throw new Error(`${name}: decoded to nothing`);

  const frames = [];
  for (const m of cells) {
    let hi = 0;
    let sum = 0;
    let mx = 0;
    let my = 0;
    for (let y = 0; y < BRUSH_PX; y++) {
      for (let x = 0; x < BRUSH_PX; x++) {
        const i = y * BRUSH_PX + x;
        const dx = (x + 0.5) / BRUSH_PX - 0.5;
        const dy = (y + 0.5) / BRUSH_PX - 0.5;
        const q = Math.min(1, Math.hypot(dx, dy) / 0.5);
        const win =
          q <= 0.84 ? 1 : Math.pow(Math.max(0, 1 - (q - 0.84) / 0.16), 1.5);
        let v = m[i] / peak;
        v = v <= BRUSH_FLOOR ? 0 : (v - BRUSH_FLOOR) / (1 - BRUSH_FLOOR);
        v *= win;
        m[i] = v;
        if (v > hi) hi = v;
        sum += v;
        mx += v * x;
        my += v * y;
      }
    }
    if (hi < BRUSH_KEEP || !(sum > 0)) continue;

    const sx = Math.round(BRUSH_PX / 2 - mx / sum);
    const sy = Math.round(BRUSH_PX / 2 - my / sum);
    if (sx === 0 && sy === 0) {
      frames.push(m);
      continue;
    }
    const out = new Float32Array(BRUSH_PX * BRUSH_PX);
    for (let y = 0; y < BRUSH_PX; y++) {
      const ty = y + sy;
      if (ty < 0 || ty >= BRUSH_PX) continue;
      for (let x = 0; x < BRUSH_PX; x++) {
        const tx = x + sx;
        if (tx < 0 || tx >= BRUSH_PX) continue;
        out[ty * BRUSH_PX + tx] = m[y * BRUSH_PX + x];
      }
    }
    frames.push(out);
  }
  if (!frames.length) throw new Error(`${name}: every cell read as dead`);

  brushes[name] = { name, size: BRUSH_PX, frames };
  return brushes[name];
}

function dumpBrush(brush) {
  const B = brush.size;
  const n = brush.frames.length;
  const out = Buffer.alloc(B * n * B * 3);
  for (let f = 0; f < n; f++) {
    const m = brush.frames[f];
    for (let y = 0; y < B; y++) {
      for (let x = 0; x < B; x++) {
        const v = Math.round(255 * clamp01(m[y * B + x]));
        const j = (y * B * n + f * B + x) * 3;
        out[j] = v;
        out[j + 1] = v;
        out[j + 2] = v;
      }
    }
  }
  mkdirSync(PROOF_DIR, { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${B * n}x${B}`,
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      join(PROOF_DIR, `brush-${brush.name}.png`),
    ],
    { input: out, maxBuffer: 1 << 29 },
  );
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function splat(buf, px, py, r, amp, cr, cg, cb) {
  if (amp <= 0.0015 || r <= 0.4) return;
  const x0 = Math.max(0, Math.floor(px - r));
  const x1 = Math.min(W - 1, Math.ceil(px + r));
  const y0 = Math.max(0, Math.floor(py - r));
  const y1 = Math.min(H - 1, Math.ceil(py + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      const q = (dx * dx + dy * dy) / rr;
      if (q >= 1) continue;
      const fall = (1 - q) * (1 - q);
      const hot = fall * fall * fall * fall;
      const j = (y * W + x) * 3;
      buf[j] += amp * (fall * cr + hot);
      buf[j + 1] += amp * (fall * cg + hot);
      buf[j + 2] += amp * (fall * cb + hot);
    }
  }
}

function stamp(buf, brush, fi, px, py, ra, rb, rot, amp, cr, cg, cb) {
  if (amp <= 0.0015 || ra <= 0.5 || rb <= 0.5) return;
  const n = brush.frames.length;
  const m = brush.frames[((fi % n) + n) % n];
  const B = brush.size;
  const ext = Math.max(ra, rb) * 1.4143;
  const x0 = Math.max(0, Math.floor(px - ext));
  const x1 = Math.min(W - 1, Math.ceil(px + ext));
  const y0 = Math.max(0, Math.floor(py - ext));
  const y1 = Math.min(H - 1, Math.ceil(py + ext));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const last = B - 1;

  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      const a = (dx * c + dy * s) / ra;
      const b = (-dx * s + dy * c) / rb;
      if (a <= -1 || a >= 1 || b <= -1 || b >= 1) continue;
      const fx = (b * 0.5 + 0.5) * last;
      const fy = (0.5 - a * 0.5) * last;
      const ix = fx | 0;
      const iy = fy | 0;
      const tx = fx - ix;
      const ty = fy - iy;
      const jx = ix < last ? ix + 1 : ix;
      const jy = iy < last ? iy + 1 : iy;
      const r0 = iy * B;
      const r1 = jy * B;
      const fall =
        m[r0 + ix] * (1 - tx) * (1 - ty) +
        m[r0 + jx] * tx * (1 - ty) +
        m[r1 + ix] * (1 - tx) * ty +
        m[r1 + jx] * tx * ty;
      if (fall <= 0.004) continue;
      const f2 = fall * fall;
      const hot = f2 * f2 * BRUSH_BURN;
      const j = (y * W + x) * 3;
      buf[j] += amp * (fall * cr + hot);
      buf[j + 1] += amp * (fall * cg + hot);
      buf[j + 2] += amp * (fall * cb + hot);
    }
  }
}

function streak(
  buf,
  brush,
  fi,
  px,
  py,
  vx,
  vy,
  ra,
  rb,
  rot,
  amp,
  cr,
  cg,
  cb,
  steps,
) {
  for (let k = 0; k < steps; k++) {
    const t = steps === 1 ? 0 : k / steps;
    const w = (1 - t) * (1 - t);
    const k2 = 1 - 0.42 * t;
    stamp(
      buf,
      brush,
      fi,
      px - vx * t,
      py - vy * t,
      ra * k2,
      rb * k2,
      rot,
      amp * w,
      cr,
      cg,
      cb,
    );
  }
}

function bolt(buf, x0, y0, x1, y1, r, amp, cr, cg, cb, seed) {
  const n = 9;
  const jitter = Math.hypot(x1 - x0, y1 - y0) * 0.13;
  let px = x0;
  let py = y0;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const bend = Math.sin(Math.PI * t) * jitter;
    const qx = x0 + (x1 - x0) * t + (rnd(seed + k) - 0.5) * bend;
    const qy = y0 + (y1 - y0) * t + (rnd(seed + k + 40) - 0.5) * bend;
    const seg = Math.max(2, Math.hypot(qx - px, qy - py));
    const steps = Math.ceil(seg / (r * 0.7));
    for (let m = 0; m < steps; m++) {
      const s = m / steps;
      splat(buf, px + (qx - px) * s, py + (qy - py) * s, r, amp, cr, cg, cb);
    }
    px = qx;
    py = qy;
  }
}

const GOLD = [1, 0.78, 0.34];

const INLAY = 0.62;

const INLAY_SHEEN = 1.5;

const SPEC = 0.9;

const INLAY_MIX = 0.62;

const BEAD = 5.2;

const SHEEN_BAND = 0.25;

function rim(buf, cr, cg, cb, lineAmp, glowAmp, wave, sheen, deep) {
  const [dr, dg, db] = deep;
  for (const i of touched) {
    const u = uOf[i];
    const m = wave ? wave(u) : 1;
    const sh = sheen ? sheen(u) : 0;
    const l = lineMask[i] * lineAmp;
    const g =
      bandMask[i] *
      glowAmp *
      (m * (1 + CORNER_LIFT * cornerOf[i]) + sh * SHEEN_BAND);
    const warm =
      inlayMask[i] *
      lineAmp *
      (INLAY * (1 + 0.5 * cornerOf[i]) + INLAY_SHEEN * sh);
    const spec = l * sh * SPEC;
    const gold = warm + spec;
    if (l + g + gold <= 0.002) continue;
    const hot = l * 0.1 + Math.pow(g, 3) * 0.5;
    const keep = 1 - inlayMask[i] * INLAY_MIX;
    const t = Math.pow(bandMask[i], 1.7);
    const j = i * 3;
    buf[j] += (l * cr + g * (dr + (cr - dr) * t)) * keep + hot + gold * GOLD[0];
    buf[j + 1] +=
      (l * cg + g * (dg + (cg - dg) * t)) * keep + hot + gold * GOLD[1];
    buf[j + 2] +=
      (l * cb + g * (db + (cb - db) * t)) * keep + hot + gold * GOLD[2];
  }
}

function corners(buf, cr, cg, cb, amp, sheen) {
  if (amp <= 0.01) return;
  const r = BEAD * SS;
  const rr = r * r;
  for (const u of CORNER_U) {
    const [px, py] = pointAt(u);
    const sh = sheen ? sheen(u) : 0;
    const a = amp * (1 + 1.1 * sh);
    splat(buf, px, py, 11 * SS, a * 0.3, cr, cg, cb);
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(W - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(H - 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px;
        const q = (dx * dx + dy * dy) / rr;
        if (q >= 1) continue;
        const fall = (1 - q) * (1 - q);
        const k = a * (fall + fall * fall * fall * fall * 0.35);
        const j = (y * W + x) * 3;
        buf[j] += k * GOLD[0];
        buf[j + 1] += k * GOLD[1];
        buf[j + 2] += k * GOLD[2];
      }
    }
  }
}

function finish(buf) {
  const w = CELL_W;
  const h = CELL_H;
  const lin = new Float32Array(w * h * 3);
  const inv = 1 / (SS * SS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        const row = (y * SS + sy) * W;
        for (let sx = 0; sx < SS; sx++) {
          const j = (row + x * SS + sx) * 3;
          r += buf[j];
          g += buf[j + 1];
          b += buf[j + 2];
        }
      }
      const o = (y * w + x) * 3;
      lin[o] = r * inv;
      lin[o + 1] = g * inv;
      lin[o + 2] = b * inv;
    }
  }

  const R = 7;
  const tmp = new Float32Array(w * h * 3);
  const blur = new Float32Array(w * h * 3);
  const src = new Float32Array(w * h * 3);
  for (let i = 0; i < src.length; i++) {
    src[i] = Math.max(0, lin[i] - 0.22);
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -R; x <= R; x++)
        sum += src[(y * w + Math.max(0, Math.min(w - 1, x))) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = sum / (2 * R + 1);
        const add = Math.min(w - 1, x + R + 1);
        const drop = Math.max(0, x - R);
        sum += src[(y * w + add) * 3 + c] - src[(y * w + drop) * 3 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -R; y <= R; y++)
        sum += tmp[(Math.max(0, Math.min(h - 1, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        blur[(y * w + x) * 3 + c] = sum / (2 * R + 1);
        const add = Math.min(h - 1, y + R + 1);
        const drop = Math.max(0, y - R);
        sum += tmp[(add * w + x) * 3 + c] - tmp[(drop * w + x) * 3 + c];
      }
    }
  }

  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) {
    const v = lin[i] + blur[i] * 0.85;
    out[i] = Math.round(255 * clamp01(1 - Math.exp(-v * 1.15)));
  }
  return out;
}

const pulses = (n, speed, sharp, floor) => {
  if (!Number.isInteger(speed)) {
    throw new Error(
      `pulses: speed ${speed} is not whole — the loop would seam`,
    );
  }
  return (u) => (f) =>
    floor +
    (1 - floor) *
      Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (u * n - f * speed)), sharp);
};

const sheenOf = (laps, width, peak) => {
  if (!Number.isInteger(laps)) {
    throw new Error(`sheenOf: laps ${laps} is not whole — the loop would seam`);
  }
  const k = Math.max(
    1,
    Math.round(Math.log(0.5) / Math.log(Math.cos(Math.PI * width * 0.5) ** 2)),
  );
  const at = (f) => (u) =>
    peak *
    Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (u * laps - f * laps)), k);
  at.laps = laps;
  return at;
};

const breatheAt = (depth, f) => 1 + depth * Math.cos(2 * Math.PI * (f / COUNT));

const RECIPES = {
  fire: {
    lineAmp: 1.0,
    glowAmp: 0.75,
    wave: pulses(3, 1, 3.6, 0.3),
    sheen: sheenOf(1, 0.05, 0.85),
    comet: {
      tail: 14,
      len: 0.13,
      out: 0.5,
      up: 0.35,
      size: 9,
      amp: 1.1,
      head: 1.0,
    },
    breathe: 0.1,
    glint: { count: 30, size: 1.9, amp: 1.5, out: 0.55, sharp: 2.2, star: 1.0 },
    brush: "T_FX_Fire_22_1_4x4",
    orient: "up",
    stretch: 1.35,
    count: 44,
    size: [16, 5.5],
    out: 0.55,
    along: 0.05,
    up: 0.45,
    steps: 2,
    amp: 1.45,
    flicker: 0.5,
  },
  water: {
    lineAmp: 1.0,
    glowAmp: 0.7,
    wave: pulses(2, 1, 4.2, 0.27),
    sheen: sheenOf(1, 0.055, 1.0),
    comet: {
      tail: 16,
      len: 0.16,
      out: 0.3,
      up: 0,
      size: 8,
      amp: 1.0,
      head: 1.05,
    },
    breathe: 0.09,
    glint: {
      count: 34,
      size: 1.9,
      amp: 2.1,
      out: 0.35,
      sharp: 2.6,
      star: 1.15,
    },
    brush: "T_FX_Fire_17_1_3x3",
    orient: "vel",
    stretch: 1.15,
    count: 34,
    size: [14, 6],
    out: 0.22,
    along: 0.6,
    up: 0,
    steps: 3,
    amp: 1.3,
    flicker: 0.12,
  },
  nature: {
    lineAmp: 0.95,
    glowAmp: 0.62,
    wave: pulses(1, 1, 1.6, 0.4),
    sheen: sheenOf(1, 0.07, 0.75),
    comet: {
      tail: 12,
      len: 0.1,
      out: 0.55,
      up: 0.1,
      size: 8.5,
      amp: 0.95,
      head: 0.9,
    },
    breathe: 0.13,
    glint: {
      count: 26,
      size: 1.7,
      amp: 1.35,
      out: 0.5,
      sharp: 2.4,
      star: 0.95,
    },
    brush: "T_FX_Glow_Flash_17_1_4x2",
    orient: "out",
    stretch: 1.6,
    count: 30,
    size: [15, 4.5],
    out: 0.66,
    along: 0.24,
    up: 0.12,
    steps: 2,
    amp: 1.2,
    flicker: 0.28,
  },
  lightning: {
    lineAmp: 1.0,
    glowAmp: 0.5,
    wave: pulses(5, 2, 4, 0.18),
    sheen: sheenOf(2, 0.035, 1.2),
    comet: {
      tail: 10,
      len: 0.07,
      out: 0.42,
      up: 0,
      size: 7,
      amp: 1.15,
      head: 1.25,
    },
    breathe: 0.06,
    glint: {
      count: 38,
      size: 1.8,
      amp: 1.85,
      out: 0.45,
      sharp: 3.2,
      star: 1.1,
    },
    brush: "T_FX_Glow_Flash_11_2_4x4",
    orient: "spin",
    spin: 0,
    stretch: 1,
    count: 24,
    size: [12, 3.5],
    out: 0.5,
    along: 0.1,
    up: 0,
    steps: 1,
    amp: 1.35,
    flicker: 0.75,
    arcs: 5,
  },
  arcane: {
    lineAmp: 1.0,
    glowAmp: 0.66,
    wave: pulses(4, -1, 2.5, 0.3),
    sheen: sheenOf(-1, 0.055, 0.9),
    comet: {
      tail: 14,
      len: 0.14,
      out: 0.34,
      up: 0,
      size: 8.5,
      amp: 0.95,
      head: 1.0,
    },
    breathe: 0.11,
    glint: { count: 30, size: 1.9, amp: 1.5, out: 0.4, sharp: 2.4, star: 1.0 },
    brush: "T_FX_Smoke_18_1_3x3",
    orient: "spin",
    spin: 1,
    stretch: 1,
    count: 26,
    size: [14, 7],
    out: 0.36,
    along: 0.95,
    up: 0,
    steps: 2,
    amp: 1.15,
    flicker: 0.08,
    inward: 14,
  },
  wind: {
    lineAmp: 0.95,
    glowAmp: 0.5,
    wave: pulses(3, 2, 3.4, 0.28),
    sheen: sheenOf(2, 0.055, 0.85),
    comet: {
      tail: 18,
      len: 0.2,
      out: 0.26,
      up: 0,
      size: 7,
      amp: 0.85,
      head: 0.95,
    },
    breathe: 0.08,
    glint: { count: 28, size: 1.6, amp: 1.35, out: 0.3, sharp: 2.6, star: 0.9 },
    brush: "T_FX_Fire_3_1_4x3",
    orient: "vel",
    stretch: 2.6,
    count: 32,
    size: [12, 4],
    out: 0.28,
    along: 1.6,
    up: 0,
    steps: 3,
    amp: 0.88,
    flicker: 0.1,
  },
};

function facing(R, k, life, nx, ny, vx, vy) {
  if (R.orient === "up") return -Math.PI / 2;
  if (R.orient === "out") return Math.atan2(ny, nx);
  if (R.orient === "vel") return Math.atan2(vy, vx);
  return rnd(k * 11 + 3) * Math.PI * 2 + (R.spin || 0) * life * Math.PI * 2;
}

function glints(buf, R, cr, cg, cb, phase, breath, scale) {
  const G = R.glint;
  if (!G) return;
  const k0 = scale === undefined ? 1 : scale;
  if (k0 <= 0.02) return;
  const step = Math.floor(phase * COUNT);
  for (let k = 0; k < G.count; k++) {
    const u = rnd(k * 17 + 5);
    const life = (phase + rnd(k * 17 + 6)) % 1;
    const [px, py, nx, ny] = pointAt(u);
    const d = REACH * G.out * life;
    const x = px + nx * d;
    const y = py + ny * d;
    const tw = Math.pow(Math.sin(Math.PI * life), G.sharp);
    const fl = 0.3 + 0.7 * rnd(k * 23 + step * 7);
    const amp = G.amp * tw * fl * breath * k0;
    if (amp < 0.02) continue;
    const r = G.size * (1 - 0.3 * life) * SS;
    splat(buf, x, y, r, amp, cr, cg, cb);
    if (amp <= G.star) continue;
    const len = r * 3.8;
    const rr = r * 0.42;
    const a = (amp - G.star) * 0.9;
    for (let m = 1; m <= 4; m++) {
      const t = m / 4;
      const w = a * (1 - t) * (1 - t);
      splat(buf, x + len * t, y, rr, w, cr, cg, cb);
      splat(buf, x - len * t, y, rr, w, cr, cg, cb);
      splat(buf, x, y + len * t, rr, w, cr, cg, cb);
      splat(buf, x, y - len * t, rr, w, cr, cg, cb);
    }
  }
}

function comet(buf, R, f, cr, cg, cb, breath) {
  if (!R.comet) return;
  const C = R.comet;
  const laps = R.sheen.laps;
  const n = Math.abs(laps);
  const cycle = f / COUNT;
  const brush = R.art;
  const nb = brush.frames.length;
  const [dr, dg, db] = R.deep;

  for (let j = 0; j < n; j++) {
    const head = cycle * laps + j / n;

    for (let i = 0; i < C.tail; i++) {
      const t = (i + 1) / C.tail;
      const lag = C.len * t * t * Math.sign(laps);
      const u = head - lag;
      const [px, py, nx, ny, tx, ty] = pointAt(u);
      const side = (rnd(i * 7 + j * 31 + 3) - 0.5) * 2;
      const out = REACH * C.out * t * (0.55 + 0.45 * rnd(i * 5 + 11));
      const x = px + nx * out + tx * out * side * 0.35;
      const y = py + ny * out + ty * out * side * 0.35 - out * C.up;
      const rot =
        R.orient === "up" ? -Math.PI / 2 : Math.atan2(-ty * laps, -tx * laps);
      const r = C.size * (1 - 0.6 * t) * SS;
      const amp = C.amp * Math.pow(1 - t, 1.35) * breath;
      const cool = 1 - 0.7 * t;
      stamp(
        buf,
        brush,
        Math.floor(t * nb) + i * 3 + j * 5,
        x,
        y,
        r * R.stretch,
        r,
        rot,
        amp,
        dr + (cr - dr) * cool,
        dg + (cg - dg) * cool,
        db + (cb - db) * cool,
      );
    }

    const [hx, hy, hnx, hny] = pointAt(head);
    const d = REACH * 0.1;
    const px = hx + hnx * d;
    const py = hy + hny * d;
    splat(buf, px, py, C.size * 1.9 * SS, C.head * 0.3 * breath, cr, cg, cb);
    splat(buf, px, py, C.size * 0.45 * SS, C.head * 1.6 * breath, cr, cg, cb);
  }
}

function emit(buf, R, f, cr, cg, cb, breath) {
  const cycle = f / COUNT;
  const brush = R.art;
  const nb = brush.frames.length;
  const br = breath === undefined ? 1 : breath;
  const [dr, dg, db] = R.deep;
  for (let k = 0; k < R.count; k++) {
    const u = rnd(k * 3 + 1);
    const life = (cycle + rnd(k * 3 + 2)) % 1;
    const [px, py, nx, ny, tx, ty] = pointAt(u + R.along * 0.06 * life);
    const ease = 1 - Math.pow(1 - life, 2);
    const dist = ease * REACH;
    const x = px + nx * dist * R.out + tx * dist * R.along;
    const y = py + ny * dist * R.out + ty * dist * R.along - dist * R.up;
    const step = (REACH * 2.2) / COUNT;
    const vx = nx * step * R.out + tx * step * R.along;
    const vy = ny * step * R.out + ty * step * R.along - step * R.up;
    const fl = 1 - R.flicker * rnd(k * 7 + Math.floor(cycle * COUNT) * 13);
    const rb = (R.size[0] + (R.size[1] - R.size[0]) * life) * SS;
    const amp = R.amp * Math.pow(1 - life, 1.5) * fl * br;
    const fi = Math.floor(life * nb) + k * 5;
    const rot = facing(R, k, life, nx, ny, vx, vy);
    const cool = 1 - 0.8 * life;
    streak(
      buf,
      brush,
      fi,
      x,
      y,
      vx,
      vy,
      rb * R.stretch,
      rb,
      rot,
      amp,
      dr + (cr - dr) * cool,
      dg + (cg - dg) * cool,
      db + (cb - db) * cool,
      R.steps,
    );
  }

  if (R.arcs) {
    for (let k = 0; k < R.arcs; k++) {
      const seed = f * 97 + k * 31;
      if (rnd(seed) > 0.72) continue;
      const u0 = rnd(seed + 1);
      const u1 = u0 + 0.02 + rnd(seed + 2) * 0.04;
      const [x0, y0, n0x, n0y] = pointAt(u0);
      const [x1, y1, n1x, n1y] = pointAt(u1);
      const lift = REACH * (0.16 + rnd(seed + 3) * 0.26);
      const ax = x0 + n0x * lift * 0.3;
      const ay = y0 + n0y * lift * 0.3;
      const bx = x1 + n1x * lift;
      const by = y1 + n1y * lift;
      bolt(buf, ax, ay, bx, by, 1.5 * SS, 0.7, cr, cg, cb, seed);
      const fr = Math.floor(rnd(seed + 5) * nb);
      stamp(buf, brush, fr, ax, ay, 7 * SS, 7 * SS, 0, 0.85 * br, cr, cg, cb);
      stamp(
        buf,
        brush,
        fr + 3,
        bx,
        by,
        5 * SS,
        5 * SS,
        0,
        0.6 * br,
        cr,
        cg,
        cb,
      );
    }
  }

  if (R.inward) {
    for (let k = 0; k < R.inward; k++) {
      const u = rnd(k * 5 + 11);
      const life = (cycle + rnd(k * 5 + 12)) % 1;
      const [px, py, nx, ny] = pointAt(u);
      const d = (1 - life) * REACH;
      const amp = 0.55 * Math.sin(Math.PI * life) * br;
      streak(
        buf,
        brush,
        Math.floor(life * nb) + k * 7,
        px + nx * d,
        py + ny * d,
        nx * REACH * 0.14,
        ny * REACH * 0.14,
        4.6 * SS,
        3.4 * SS,
        Math.atan2(-ny, -nx),
        amp,
        cr,
        cg,
        cb,
        3,
      );
    }
  }
}

const GATHER = 2 / COUNT;

function env(p) {
  if (p < GATHER) return 0.28 + 0.34 * (p / GATHER);
  const q = (p - GATHER) / (1 - GATHER);
  const attack = 0.1;
  if (q < attack) return 0.62 + 0.38 * Math.pow(q / attack, 0.6);
  return Math.pow(1 - (q - attack) / (1 - attack), 1.7);
}

const FLASH_BRUSH = "T_FX_Glow_Flash_11_2_4x4";

function burstFrame(buf, R, f, cr, cg, cb) {
  const p = f / (COUNT - 1);
  const e = env(p);
  const g = clamp01(p / GATHER);
  const q = clamp01((p - GATHER) / (1 - GATHER));
  const brush = R.art;
  const nb = brush.frames.length;

  const fade = 1 - Math.pow(q, 1.3);
  const sheenNow = p < GATHER ? 0.25 + 0.75 * g : 1.05 * Math.pow(1 - q, 2);
  rim(
    buf,
    cr,
    cg,
    cb,
    fade * (0.7 + 0.9 * e),
    fade * (0.3 + 1.1 * e),
    null,
    () => sheenNow,
    R.deep,
  );
  corners(buf, cr, cg, cb, fade * (0.6 + 0.8 * e), () => sheenNow);

  if (p < GATHER) {
    for (let k = 0; k < 26; k++) {
      const u = rnd(k * 9 + 71);
      const [px, py, nx, ny] = pointAt(u);
      const d = REACH * (1 - g) * (0.55 + rnd(k * 9 + 72) * 0.55);
      const size = R.size[0] * 0.85 * SS;
      streak(
        buf,
        brush,
        Math.floor(g * nb) + k * 3,
        px + nx * d,
        py + ny * d,
        nx * REACH * 0.3,
        ny * REACH * 0.3,
        size * R.stretch,
        size,
        Math.atan2(-ny, -nx),
        0.5 + 0.5 * g,
        cr,
        cg,
        cb,
        3,
      );
    }
    return;
  }

  const flash = Math.exp(-q * 16);
  if (flash > 0.004) {
    for (const i of touched) {
      const a = bandMask[i] * flash * 1.5;
      const j = i * 3;
      buf[j] += a;
      buf[j + 1] += a;
      buf[j + 2] += a;
    }
  }

  const starAmp = 1.35 * Math.pow(Math.max(0, 1 - q / 0.22), 1.6);
  if (starAmp > 0.01) {
    const flashArt = loadBrush(FLASH_BRUSH);
    for (let k = 0; k < CORNER_U.length; k++) {
      const [px, py, nx, ny] = pointAt(CORNER_U[k]);
      const r = (16 + 26 * Math.min(1, q / 0.22)) * SS;
      stamp(
        buf,
        flashArt,
        k * 3 + Math.floor(q * 6),
        px + nx * REACH * 0.12,
        py + ny * REACH * 0.12,
        r,
        r,
        Math.atan2(ny, nx),
        starAmp,
        0.55 + 0.45 * cr,
        0.55 + 0.45 * cg,
        0.55 + 0.45 * cb,
      );
    }
  }

  const ringAt = 1 - Math.pow(1 - Math.min(1, q / 0.5), 2.2);
  const ringAmp = 1.7 * Math.pow(1 - Math.min(1, q / 0.55), 1.5);
  if (ringAmp > 0.01) {
    const n = 560;
    for (let k = 0; k < n; k++) {
      const [px, py, nx, ny] = pointAt(k / n);
      const d = ringAt * REACH * 0.8;
      splat(
        buf,
        px + nx * d,
        py + ny * d,
        3.2 * SS,
        ringAmp * 0.55,
        cr,
        cg,
        cb,
      );
    }
  }

  const rayAmp = 0.8 * Math.sin(Math.PI * clamp01(q / 0.8)) * e;
  if (rayAmp > 0.01) {
    for (let k = 0; k < 14; k++) {
      const u = k / 14 + 0.013;
      const [px, py, nx, ny] = pointAt(u);
      const len = REACH * (0.55 + rnd(k + 3) * 0.5) * ringAt;
      const steps = 12;
      for (let m = 0; m < steps; m++) {
        const t = m / steps;
        splat(
          buf,
          px + nx * len * t,
          py + ny * len * t,
          (2.4 - 1.6 * t) * SS,
          rayAmp * (1 - t) * 0.3,
          cr,
          cg,
          cb,
        );
      }
    }
  }

  const spray = Math.round(R.count * 1.7);
  for (let k = 0; k < spray; k++) {
    const u = rnd(k * 3 + 5);
    const [px, py, nx, ny, tx, ty] = pointAt(u);
    const speed = 0.5 + rnd(k * 3 + 6) * 0.9;
    const t = clamp01((q - rnd(k * 3 + 7) * 0.12) / 0.9);
    if (t <= 0) continue;
    const ease = 1 - Math.pow(1 - t, 2.4);
    const d = ease * REACH * speed;
    const side = (rnd(k * 3 + 8) - 0.5) * 0.7;
    const x = px + nx * d + tx * d * side;
    const y = py + ny * d + ty * d * side - d * R.up * 0.6;
    const vx = nx * REACH * 0.16 * speed;
    const vy = ny * REACH * 0.16 * speed;
    const rb = (R.size[0] * 1.1 - (R.size[0] - R.size[1]) * t) * SS;
    const rot =
      R.orient === "up"
        ? -Math.PI / 2
        : Math.atan2(vy, vx) + rnd(k * 3 + 9) * 6.283 + t * 12.566;
    streak(
      buf,
      brush,
      Math.floor(t * nb) + k * 5,
      x,
      y,
      vx,
      vy,
      rb * R.stretch,
      rb,
      rot,
      0.95 * Math.pow(1 - t, 1.3),
      cr,
      cg,
      cb,
      R.steps + 1,
    );
  }

  glints(buf, R, cr, cg, cb, q, 1, Math.pow(1 - q, 1.1) * 1.5);
}

function encode(sheet, w, h, file, proof) {
  const args = [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${w}x${h}`,
    "-i",
    "pipe:0",
    "-frames:v",
    "1",
  ];
  if (proof) {
    mkdirSync(PROOF_DIR, { recursive: true });
    const png = join(
      PROOF_DIR,
      file.slice(file.lastIndexOf("ult-")).replace(/\.webp$/, ".png"),
    );
    execFileSync("ffmpeg", [...args, png], {
      input: sheet,
      maxBuffer: 1 << 29,
    });
  }
  execFileSync(
    "ffmpeg",
    [
      ...args.slice(0, -2),
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      String(QUALITY),
      "-compression_level",
      "6",
      "-preset",
      "drawing",
      "-frames:v",
      "1",
      file,
    ],
    { input: sheet, maxBuffer: 1 << 29 },
  );
}

function sheetOf(draw, R, color) {
  const cr = ((color >> 16) & 255) / 255;
  const cg = ((color >> 8) & 255) / 255;
  const cb = (color & 255) / 255;
  const rows = COUNT / COLS;
  const sw = CELL_W * COLS;
  const sh = CELL_H * rows;
  const sheet = Buffer.alloc(sw * sh * 3);
  const buf = new Float32Array(W * H * 3);

  for (let f = 0; f < COUNT; f++) {
    buf.fill(0);
    draw(buf, R, f, cr, cg, cb);
    const cell = finish(buf);
    const ox = (f % COLS) * CELL_W;
    const oy = Math.floor(f / COLS) * CELL_H;
    for (let y = 0; y < CELL_H; y++) {
      cell.copy(
        sheet,
        ((oy + y) * sw + ox) * 3,
        y * CELL_W * 3,
        (y + 1) * CELL_W * 3,
      );
    }
  }
  return { sheet, sw, sh };
}

const argv = process.argv.slice(2);
const proof = argv.includes("--proof");
const dumpBrushes = argv.includes("--brushes");
const only = new Set(argv.filter((a) => !a.startsWith("--")));
const kb = (f) => (statSync(f).size / 1024).toFixed(1);

mkdirSync(OUT_DIR, { recursive: true });

const loopDraw = (buf, R, f, cr, cg, cb) => {
  const breath = breatheAt(R.breathe, f);
  rim(
    buf,
    cr,
    cg,
    cb,
    R.lineAmp,
    R.glowAmp * breath,
    (u) => R.wave(u)(f / COUNT),
    R.sheen(f / COUNT),
    R.deep,
  );
  corners(buf, cr, cg, cb, R.lineAmp * 0.85 * breath, R.sheen(f / COUNT));
  emit(buf, R, f, cr, cg, cb, breath);
  comet(buf, R, f, cr, cg, cb, breath);
  glints(buf, R, cr, cg, cb, f / COUNT, breath);
};

let total = 0;
console.log(
  `${COLS}x${COUNT / COLS} of ${CELL_W}x${CELL_H}, ${SS}x supersampled`,
);
for (const { id, color, deep } of ELEMENTS) {
  if (only.size && !only.has(id)) continue;
  const R = RECIPES[id];
  R.art = loadBrush(R.brush);
  R.deep = [
    ((deep >> 16) & 255) / 255,
    ((deep >> 8) & 255) / 255,
    (deep & 255) / 255,
  ];
  if (dumpBrushes) dumpBrush(R.art);
  for (const [what, draw] of [
    ["", loopDraw],
    ["burst-", burstFrame],
  ]) {
    const t0 = Date.now();
    const { sheet, sw, sh } = sheetOf(draw, R, color);
    const out = join(OUT_DIR, `ult-${what}${id}.webp`);
    encode(sheet, sw, sh, out, proof);
    total += statSync(out).size;
    console.log(
      `  ult-${what}${id}`.padEnd(24) +
        `${sw}x${sh}  ${kb(out).padStart(6)} kB  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
}

console.log(`\n${(total / 1024).toFixed(1)} kB of sheets`);
console.log(
  `\nsrc/art/ultborder.js: cols ${COLS}, count ${COUNT}, ` +
    `cell ${CELL_W}x${CELL_H}, fps ${FPS}\n` +
    `  padX ${((CELL_W / CARD_W - 1) / 2).toFixed(4)}  ` +
    `padY ${((CELL_H / CARD_H - 1) / 2).toFixed(4)}  cycle (not ping-pong)\n` +
    `  sheet ${CELL_W * COLS}x${(CELL_H * COUNT) / COLS}`,
);
