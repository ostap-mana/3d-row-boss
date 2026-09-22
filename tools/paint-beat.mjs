import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
paint-beat — paint a boss beat off the build's own flipbook, as a painted page.

  node tools/paint-beat.mjs --src <flipbook.png> --out <page.png> [options]

  The Invokers flipbooks are hard silhouettes. pack-boss-beat paints them by
  inside-distance alone, which gives a rim and a hollow belly: a neon outline,
  which is what the board reads as UI. The lava fist that was approved is not
  that. It is a body — black obsidian crust split by molten seams, a hot torn
  rim, embers thrown off it and smoke left behind.

  So this paints five layers instead of one:

    crust   the silhouette filled with near-black rock, mottled, so the shape
            has a body instead of a hole
    seams   a domain-warped ridge field through the interior, hottest deep
            inside and dying at the rim, scrolling frame to frame so the rock
            looks molten rather than printed
    rim     the torn edge, white-hot and thin
    embers  sparks thrown off the boundary, each with its own life across the
            beat, deterministic from --seed
    smoke   the frames behind this one, blurred and drifting up, grey

  The output is a painted PAGE on black with real gutters, which is what
  pack-painted-beat.mjs already knows how to cut, align and alpha.

  --crack <n>     no flipbook at all: draw a splitting crack as <n> frames.
                  A jagged centreline tears open along its length, widest in
                  the middle, rock lips on both sides and white-hot light in
                  the gap, then closes and burns down. --src is not read.
  --crack-rise <n> how far flame licks climb out of the widest part. Default
                  0.42 of the cell.
  --src <png>     the flipbook. Grid is read off the filename (_4x3) unless
                  --grid says.
  --out <png>     the painted page. Required.
  --grid CxR      override the grid in the filename.
  --take a:b      source frames to paint, 1-based inclusive. Default all.
  --cell <px>     painted cell side. Default 256.
  --gutter <px>   black band between cells. Default 24.
  --cols <n>      cells per page row. Default 5.
  --ramp <name>   magma (obsidian and fire) or violet. Default magma.
  --rim <px>      how deep the torn rim burns, in cell pixels. Default 9.
  --crust <n>     how bright the rock body is, 0-1. Default 0.16.
  --seam <n>      seam density, 0-1. Default 0.5.
  --seam-scale <n> seam field size in cells. Default 3.2.
  --flow <n>      how far the seam field scrolls across the beat. Default 0.9.
  --embers <n>    sparks per frame at the peak. Default 26.
  --shards <n>    chips of obsidian thrown out with the beat, dark bodies with
                  a hot rim, on ballistic arcs. Default 0.
  --shard-size <n> chip radius in cell pixels. Default 7.
  --smoke <n>     smoke gain, 0 is off. Default 0.5.
  --cool a,b      ramp top first frame to last. Default 1,0.62.
  --gain a,b      overall gain first frame to last. Default 1,0.85.
  --ground <n>    where the beat stands in its cell, 0 top to 1 bottom. Smoke
                  rises from it and embers fall toward it. Default 0.88.
  --gravity <n>   how hard embers fall. Default 1.
  --seed <n>      ember and noise seed. Default 7.
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const pair = (name, a, b) => {
  const v = String(flag(name, `${a},${b}`))
    .split(",")
    .map(Number);
  return [v[0], v.length > 1 ? v[1] : v[0]];
};

const CRACK = flag("crack", null) ? Math.round(Number(flag("crack"))) : 0;
const CRACK_RISE = Number(flag("crack-rise", 0.42));

const SRC = CRACK ? "" : resolve(ROOT, flag("src", ""));
const OUT = resolve(ROOT, flag("out", ""));
if (!OUT || (!CRACK && !SRC)) {
  process.stderr.write("--out is required, and --src unless --crack\n");
  process.exit(1);
}
if (SRC && !existsSync(SRC)) {
  process.stderr.write(`no such file: ${SRC}\n`);
  process.exit(1);
}

const CELL = Math.round(Number(flag("cell", 256)));
const GUTTER = Math.round(Number(flag("gutter", 24)));
const PAGE_COLS = Math.round(Number(flag("cols", 5)));
const RIM = Number(flag("rim", 9));
const CRUST = Number(flag("crust", 0.16));
const SEAM = Number(flag("seam", 0.5));
const SEAM_SCALE = Number(flag("seam-scale", 3.2));
const FLOW = Number(flag("flow", 0.9));
const EMBERS = Number(flag("embers", 26));
const SMOKE = Number(flag("smoke", 0.5));
const SHARDS = Number(flag("shards", 0));
const SHARD_SIZE = Number(flag("shard-size", 7));
const SHARD_FACETS = 7;
const GROUND = Number(flag("ground", 0.88));
const GRAVITY = Number(flag("gravity", 1));
const SEED = Number(flag("seed", 7));
const [COOL_A, COOL_B] = pair("cool", 1, 0.62);
const [GAIN_A, GAIN_B] = pair("gain", 1, 0.85);

const RAMPS = {
  magma: [
    [0.0, 0x1a0d08],
    [0.16, 0x4a1206],
    [0.36, 0xa32408],
    [0.56, 0xff4a12],
    [0.74, 0xff8c1a],
    [0.88, 0xffd35a],
    [1.0, 0xfff6de],
  ],
  violet: [
    [0.0, 0x140a1e],
    [0.18, 0x3f1170],
    [0.4, 0x7b2fb0],
    [0.6, 0xc0399a],
    [0.78, 0xff3a5a],
    [0.9, 0xffd35a],
    [1.0, 0xfff2d0],
  ],
};
const RAMP = RAMPS[String(flag("ramp", "magma"))] || RAMPS.magma;
const SMOKE_TINT = [148, 136, 132];

function grid() {
  const set = flag("grid", "");
  if (set) {
    const m = String(set).match(/^([1-9]\d*)x([1-9]\d*)$/);
    if (!m) throw new Error(`--grid ${set}: want CxR`);
    return { cols: Number(m[1]), rows: Number(m[2]) };
  }
  const all = [...SRC.matchAll(/_([1-9]\d?)x([1-9]\d?)(?![0-9])/g)];
  if (!all.length) throw new Error(`${SRC}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
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
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file) {
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
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function rampAt(t) {
  const k = clamp01(t);
  for (let i = 1; i < RAMP.length; i++) {
    if (k > RAMP[i][0] && i < RAMP.length - 1) continue;
    const [lo, a] = RAMP[i - 1];
    const [hi, b] = RAMP[i];
    const p = hi === lo ? 0 : (k - lo) / (hi - lo);
    return [
      lerp((a >> 16) & 255, (b >> 16) & 255, p),
      lerp((a >> 8) & 255, (b >> 8) & 255, p),
      lerp(a & 255, b & 255, p),
    ];
  }
  return [255, 255, 255];
}

function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647 + SEED * 972897;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);
  const zf = smoothstep(z - zi);
  let acc = 0;
  for (let dz = 0; dz < 2; dz++) {
    const wz = dz ? zf : 1 - zf;
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy ? yf : 1 - yf;
      for (let dx = 0; dx < 2; dx++) {
        const wx = dx ? xf : 1 - xf;
        acc += hash3(xi + dx, yi + dy, zi + dz) * wx * wy * wz;
      }
    }
  }
  return acc;
}

function fbm(x, y, z, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(fx, fy, z) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.01;
  }
  return sum / norm;
}

function chamfer(on, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (y > 0 && x > 0) v = Math.min(v, d[i - w - 1] + 1.4142);
      if (y > 0 && x < w - 1) v = Math.min(v, d[i - w + 1] + 1.4142);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (y < h - 1 && x < w - 1) v = Math.min(v, d[i + w + 1] + 1.4142);
      if (y < h - 1 && x > 0) v = Math.min(v, d[i + w - 1] + 1.4142);
      d[i] = v;
    }
  }
  return d;
}

function blurInto(src, w, h, radius) {
  if (radius < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const r = Math.round(radius);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++)
      acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / span;
      const drop = src[y * w + Math.min(w - 1, Math.max(0, x - r))];
      const add = src[y * w + Math.min(w - 1, Math.max(0, x + r + 1))];
      acc += add - drop;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++)
      acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      const drop = tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      const add = tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
      acc += add - drop;
    }
  }
  return out;
}

function sampleCell(px, sw, x0, y0, cw, ch, size) {
  const out = new Float32Array(size * size);
  const scale = Math.min(size / cw, size / ch);
  const dw = Math.round(cw * scale);
  const dh = Math.round(ch * scale);
  const ox = Math.round((size - dw) / 2);
  const oy = Math.round((size - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const sy0 = y0 + Math.floor((y * ch) / dh);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((y + 1) * ch) / dh));
    for (let x = 0; x < dw; x++) {
      const sx0 = x0 + Math.floor((x * cw) / dw);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((x + 1) * cw) / dw));
      let acc = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const s = (sy * sw + sx) * 4;
          const l = 0.2126 * px[s] + 0.7152 * px[s + 1] + 0.0722 * px[s + 2];
          acc += (l * px[s + 3]) / 255;
          n++;
        }
      }
      out[(oy + y) * size + ox + x] = acc / n / 255;
    }
  }
  return out;
}

function crackCoverage(n) {
  const out = [];
  const lip = CELL * 0.5;
  const spine = new Float32Array(CELL);
  const teeth = new Float32Array(CELL);
  const reach = new Float32Array(CELL);
  for (let x = 0; x < CELL; x++) {
    const u = x / CELL;
    spine[x] = lip + (fbm(u * 3.4, 0.5, 4.2, 4) - 0.5) * CELL * 0.14;
    teeth[x] = 0.45 + fbm(u * 11, 2.5, 8.1, 3) * 1.15;
    reach[x] = fbm(u * 5.5, 7.5, 1.3, 3);
  }

  for (let f = 0; f < n; f++) {
    const t = n === 1 ? 0 : f / (n - 1);
    const open = clamp01(t / 0.3);
    const shut = 1 - smoothstep(clamp01((t - 0.52) / 0.48));
    const cov = new Float32Array(CELL * CELL);

    for (let x = 0; x < CELL; x++) {
      const u = x / CELL;
      const along =
        Math.pow(Math.sin(Math.PI * clamp01(u)), 0.5) *
        (0.42 + 1.05 * fbm(u * 2.3, 9.5, 3.1, 3));
      const gap =
        smoothstep(open) * shut * along * teeth[x] * CELL * 0.095 + 0.6;
      const lick =
        smoothstep(clamp01((open - 0.25) / 0.75)) *
        shut *
        along *
        reach[x] *
        CELL *
        CRACK_RISE;

      for (let y = 0; y < CELL; y++) {
        const d = y - spine[x];
        let v = 0;
        if (Math.abs(d) <= gap) v = 1;
        else if (d < 0 && lick > 0) {
          const up = -d - gap;
          const tongue =
            0.35 + 0.9 * fbm(u * 9, (y / CELL) * 6 - t * 3.5, 5.7, 3);
          v = clamp01(1 - up / Math.max(1, lick * tongue)) * 0.95;
        } else if (d > 0) {
          const down = d - gap;
          v = clamp01(1 - down / Math.max(1, gap * 0.34));
        }
        if (v > 0) cov[y * CELL + x] = Math.max(cov[y * CELL + x], v);
      }
    }
    out.push(cov);
  }
  return out;
}

const GRID = CRACK ? { cols: 1, rows: 1 } : grid();
const info = CRACK ? { w: CELL, h: CELL } : probe(SRC);
const page = CRACK ? null : decode(SRC);
const cellW = Math.floor(info.w / GRID.cols);
const cellH = Math.floor(info.h / GRID.rows);
const total = CRACK || GRID.cols * GRID.rows;

const takeArg = String(flag("take", `1:${total}`));
const [takeA, takeB] = takeArg.includes(":")
  ? takeArg.split(":").map(Number)
  : [Number(takeArg), Number(takeArg)];
const picked = [];
for (let i = takeA; i <= Math.min(takeB, total); i++) picked.push(i - 1);

const N = picked.length;
if (N === 0) {
  process.stderr.write("nothing to paint\n");
  process.exit(1);
}

const coverage = CRACK
  ? crackCoverage(CRACK).filter((_, i) => picked.indexOf(i) !== -1)
  : picked.map((index) =>
      sampleCell(
        page,
        info.w,
        (index % GRID.cols) * cellW,
        Math.floor(index / GRID.cols) * cellH,
        cellW,
        cellH,
        CELL,
      ),
    );

const peak = coverage.map((c) => {
  let sum = 0;
  for (let i = 0; i < c.length; i++) sum += c[i];
  return sum;
});
const topMass = Math.max(...peak);

const seats = (() => {
  const at = peak.indexOf(topMass);
  const cov = coverage[at];
  const found = [];
  for (let y = 1; y < CELL - 1; y++) {
    for (let x = 1; x < CELL - 1; x++) {
      const i = y * CELL + x;
      if (cov[i] <= 0.3) continue;
      const edge =
        cov[i - 1] <= 0.3 ||
        cov[i + 1] <= 0.3 ||
        cov[i - CELL] <= 0.3 ||
        cov[i + CELL] <= 0.3;
      if (edge) found.push({ x, y });
    }
  }
  if (!found.length) return [{ x: CELL / 2, y: GROUND * CELL }];
  const want = Math.min(found.length, 420);
  const stride = found.length / want;
  const out = [];
  for (let i = 0; i < want; i++) out.push(found[Math.floor(i * stride)]);
  return out;
})();

const smokeBed = new Float32Array(CELL * CELL);
const frames = [];

for (let f = 0; f < N; f++) {
  const t = N === 1 ? 0 : f / (N - 1);
  const cov = coverage[f];
  const on = new Uint8Array(CELL * CELL);
  for (let i = 0; i < cov.length; i++) on[i] = cov[i] > 0.3 ? 1 : 0;
  const off = new Uint8Array(CELL * CELL);
  for (let i = 0; i < on.length; i++) off[i] = on[i] ? 0 : 1;

  const dIn = chamfer(on, CELL, CELL);
  const dOut = chamfer(off, CELL, CELL);

  const coolTop = lerp(COOL_A, COOL_B, t);
  const gain = lerp(GAIN_A, GAIN_B, t);
  const flowZ = t * FLOW * 4;
  const step = SEAM_SCALE / CELL;

  const rgb = new Float32Array(CELL * CELL * 3);
  const emberBed = new Float32Array(CELL * CELL);

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = y * CELL + x;
      if (!on[i]) continue;

      const nx = x * step;
      const ny = y * step;
      const tear = fbm(nx * 3.1, ny * 3.1, flowZ * 0.5, 3);
      const rimHere = RIM * (0.45 + 1.5 * tear * tear);
      const depth = clamp01(dIn[i] / Math.max(1, rimHere));
      const warp = fbm(nx * 0.6, ny * 0.6, flowZ * 0.4, 3);
      const field = fbm(
        nx + warp * 1.6,
        ny - flowZ * 0.6 + warp * 1.6,
        flowZ,
        4,
      );
      const ridge = 1 - Math.abs(field * 2 - 1);
      const seamCut = Math.pow(clamp01((ridge - (1 - SEAM)) / SEAM), 2.2);
      const seamHeat = seamCut * smoothstep(clamp01(depth * 1.4));

      const rimHeat = Math.pow(1 - depth, 1.6);
      const mottle = 0.72 + 0.56 * fbm(nx * 2.4, ny * 2.4, flowZ * 0.2, 2);
      const body = CRUST * mottle;

      const heat = clamp01(Math.max(rimHeat, seamHeat * 1.05));
      const [r, g, b] = rampAt(heat * coolTop);
      const solid = smoothstep(clamp01((cov[i] - 0.18) / 0.24));
      const v = (body + (1 - body) * Math.pow(heat, 1.25)) * gain * solid;
      rgb[i * 3] = r * v;
      rgb[i * 3 + 1] = g * v;
      rgb[i * 3 + 2] = b * v;
    }
  }

  const glowReach = RIM * 1.6;
  for (let i = 0; i < on.length; i++) {
    if (on[i]) continue;
    const k = 0.55 * Math.exp(-dOut[i] / glowReach) * gain;
    if (k < 0.004) continue;
    const [r, g, b] = rampAt(0.72 * coolTop);
    rgb[i * 3] += r * k;
    rgb[i * 3 + 1] += g * k;
    rgb[i * 3 + 2] += b * k;
  }

  const mass = peak[f] / (topMass || 1);
  const sparks = Math.round(EMBERS * (0.35 + mass));
  for (let s = 0; s < sparks; s++) {
    const born = hash3(s * 17 + 3, 0, 91);
    const age = clamp01((t - born * 0.55) / 0.45);
    if (age <= 0 || age >= 1) continue;

    const seat = seats[(s * 7) % Math.max(1, seats.length)];
    if (!seat) continue;
    const ang = -Math.PI / 2 + (hash3(s * 31, 0, 55) - 0.5) * 2.1;
    const speed = (0.1 + hash3(s * 11, 0, 77) * 0.3) * CELL;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const cx = seat.x + vx * age;
    const cy = seat.y + vy * age + GRAVITY * age * age * CELL * 0.34;

    const size = 0.8 + hash3(s * 13, 0, 33) * 1.3;
    const bright =
      (0.55 + hash3(s * 7, 0, 12) * 0.45) * gain * (1 - age) * (1 - age * 0.4);
    const streak = Math.max(1, (speed / CELL) * 14);
    const ux = vx / (speed || 1);
    const uy = (vy + GRAVITY * age * CELL * 0.68) / (speed || 1);
    const un = Math.hypot(ux, uy) || 1;

    const reach = Math.ceil(size * 2 + streak);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (x < 0 || y < 0 || x >= CELL || y >= CELL) continue;
        const along = (dx * ux + dy * uy) / un;
        const across = (dx * -uy + dy * ux) / un;
        const d =
          (along * along) / (streak * streak) +
          (across * across) / (size * size);
        const k = Math.exp(-d) * bright;
        if (k < 0.012) continue;
        emberBed[y * CELL + x] += k;
      }
    }
  }
  for (let i = 0; i < emberBed.length; i++) {
    const k = Math.min(1.6, emberBed[i]);
    if (k < 0.01) continue;
    const [r, g, b] = rampAt(clamp01(0.82 + k * 0.2) * coolTop);
    rgb[i * 3] += r * k;
    rgb[i * 3 + 1] += g * k;
    rgb[i * 3 + 2] += b * k;
  }

  for (let s = 0; s < SHARDS; s++) {
    const born = hash3(s * 23 + 9, 0, 411) * 0.42;
    const age = clamp01((t - born) / (1 - born || 1));
    if (age <= 0) continue;

    const seat = seats[(s * 37 + 5) % Math.max(1, seats.length)];
    if (!seat) continue;
    const ang = -Math.PI / 2 + (hash3(s * 41, 0, 77) - 0.5) * 2.4;
    const speed = (0.16 + hash3(s * 19, 0, 29) * 0.34) * CELL;
    const cx = seat.x + Math.cos(ang) * speed * age;
    const cy =
      seat.y + Math.sin(ang) * speed * age + GRAVITY * age * age * CELL * 0.55;
    const spin =
      hash3(s * 53, 0, 13) * Math.PI * 2 +
      age * (hash3(s * 3, 0, 61) - 0.5) * 7;
    const rad = SHARD_SIZE * (0.55 + hash3(s * 29, 0, 97) * 0.9);
    const squash = 0.45 + hash3(s * 71, 0, 5) * 0.5;
    const fade = (1 - smoothstep(clamp01((age - 0.45) / 0.45))) * gain;
    if (fade < 0.05) continue;

    const corners = [];
    for (let k = 0; k < SHARD_FACETS; k++) {
      const a =
        spin +
        ((k + 0.5 * (hash3(s * 101 + k, 0, 7) - 0.5)) / SHARD_FACETS) *
          Math.PI *
          2;
      const q = rad * (0.6 + hash3(s * 131 + k, 0, 19) * 0.55);
      corners.push([Math.cos(a) * q, Math.sin(a) * q * squash]);
    }

    const reach = Math.ceil(rad * 1.5);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (x < 0 || y < 0 || x >= CELL || y >= CELL) continue;

        let near = 1e9;
        for (let k = 0; k < SHARD_FACETS; k++) {
          const [ax, ay] = corners[k];
          const [bx, by] = corners[(k + 1) % SHARD_FACETS];
          const ex = bx - ax;
          const ey = by - ay;
          const len = Math.hypot(ex, ey) || 1;
          const side = (ex * (dy - ay) - ey * (dx - ax)) / len;
          if (side < near) near = side;
        }
        if (near < -0.9) continue;

        const solid = smoothstep(clamp01((near + 0.5) / 1.1));
        const lip = 1 - smoothstep(clamp01(near / Math.max(1.4, rad * 0.32)));
        const heat = clamp01(0.08 + lip * 0.92);
        const [cr, cg, cb] = rampAt(heat * coolTop);
        const v = (0.1 + 0.9 * Math.pow(lip, 1.5)) * fade;
        const i = y * CELL + x;
        rgb[i * 3] = rgb[i * 3] * (1 - solid * 0.82) + cr * v * solid;
        rgb[i * 3 + 1] = rgb[i * 3 + 1] * (1 - solid * 0.82) + cg * v * solid;
        rgb[i * 3 + 2] = rgb[i * 3 + 2] * (1 - solid * 0.82) + cb * v * solid;
      }
    }
  }

  if (SMOKE > 0) {
    const puff = blurInto(smokeBed, CELL, CELL, Math.max(2, CELL * 0.02));
    const step2 = SEAM_SCALE / CELL;
    for (let i = 0; i < puff.length; i++) {
      if (puff[i] < 0.02) continue;
      const x = i % CELL;
      const y = (i / CELL) | 0;
      const torn =
        0.45 +
        0.9 * fbm(x * step2 * 1.9, y * step2 * 1.9 - flowZ, flowZ * 0.7, 3);
      const k = clamp01(puff[i] * SMOKE * torn - 0.03);
      if (k < 0.008) continue;
      rgb[i * 3] += SMOKE_TINT[0] * k;
      rgb[i * 3 + 1] += SMOKE_TINT[1] * k;
      rgb[i * 3 + 2] += SMOKE_TINT[2] * k;
    }
    const rise = Math.max(1, Math.round(CELL * 0.03));
    const next = new Float32Array(CELL * CELL);
    for (let y = 0; y < CELL; y++) {
      const sy = Math.min(CELL - 1, y + rise);
      for (let x = 0; x < CELL; x++) {
        const born =
          on[sy * CELL + x] && dIn[sy * CELL + x] < RIM * 0.8 ? 0.22 : 0;
        next[y * CELL + x] = smokeBed[sy * CELL + x] * 0.7 + born;
      }
    }
    smokeBed.set(next);
  }

  frames.push(rgb);
}

const pageCols = Math.min(PAGE_COLS, N);
const pageRows = Math.ceil(N / pageCols);
const pitch = CELL + GUTTER;
const pageW = pageCols * pitch + GUTTER;
const pageH = pageRows * pitch + GUTTER;
const sheet = new Uint8Array(pageW * pageH * 4);
for (let i = 0; i < pageW * pageH; i++) sheet[i * 4 + 3] = 255;

frames.forEach((rgb, f) => {
  const ox = GUTTER + (f % pageCols) * pitch;
  const oy = GUTTER + Math.floor(f / pageCols) * pitch;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const s = (y * CELL + x) * 3;
      const d = ((oy + y) * pageW + ox + x) * 4;
      sheet[d] = Math.min(255, Math.round(rgb[s]));
      sheet[d + 1] = Math.min(255, Math.round(rgb[s + 1]));
      sheet[d + 2] = Math.min(255, Math.round(rgb[s + 2]));
    }
  }
});

encode(sheet, pageW, pageH, OUT);
process.stdout.write(
  `paint-beat: ${N} cells, ${pageCols}x${pageRows} page, ${pageW}x${pageH} → ${OUT}\n`,
);
