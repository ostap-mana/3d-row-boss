import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
pack-boss-beat — paint a boss plate off the build's own FX masks.

  node tools/pack-boss-beat.mjs --src <png> --out <webp> [options]
  node tools/pack-boss-beat.mjs --src <slash.png> --wipe <erosion.png> ...

  The Invokers masks are hard black-and-white silhouettes: filled flat they pack
  as a pale blob over the board. This measures how deep inside the shape every
  pixel sits and paints by that depth — a white-hot torn rim, gold behind it,
  magma and crimson under that, violet in the belly that all but vanishes on the
  additive blend. Only the edges burn and the middle is a hole the grid shows
  through, which is what keeps a match-3 board readable under the hit.

  --grid CxR    frames in the source sheet. Read off the filename when it says.
  --take a:b    which source frames to walk. Default the whole sheet.
  --cell N      cell side in the packed sheet. Default 320.
  --rim N       how many source pixels of rim burn white. Default 15.
  --margin N    padding before the distance transform, so the violet bloom is
                not cut off square at the cell edge. Default 22.
  --cool a,b,c,d,e  ramp top and gain from first frame to last, plus the bend.
  --glow g      outside bloom gain. Default 0.42.
  --wipe <png>  no flipbook: tear one slash open along the erosion gradient and
                burn it back down, the way the build animates its own slashes.
  --claw        three gashes off that one slash, the middle the longest.
  --ramp r      magma (fire over obsidian) or violet (the rest of the boss).
  --strip       also write the sheet as a PNG to look at.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const SRC = resolve(ROOT, arg("--src", ""));
const OUT = resolve(ROOT, arg("--out", "src/assets/fx/beat-sheet.webp"));
const WIPE = arg("--wipe", "") ? resolve(ROOT, arg("--wipe", "")) : "";
const STRIP = args.includes("--strip");
const CLAW = args.includes("--claw");

const COLS = 5;
const COUNT = 10;
const CELL = Number(arg("--cell", 320));
const PAD = 2;
const QUALITY = 82;

const RAMPS = {
  magma: [
    [0.0, 0x7b2fb0],
    [0.24, 0xa855f7],
    [0.44, 0xff3a5a],
    [0.66, 0xff6a10],
    [0.86, 0xffd35a],
    [1.0, 0xfff2d0],
  ],
  violet: [
    [0.0, 0x3a0a5e],
    [0.3, 0x7b2fb0],
    [0.52, 0xa855f7],
    [0.72, 0xff3a5a],
    [0.88, 0xffd35a],
    [1.0, 0xfff2d0],
  ],
};

const RAMP = RAMPS[arg("--ramp", "magma")] || RAMPS.magma;

const MARGIN = Number(arg("--margin", 22));
const RIM = Number(arg("--rim", 15));
const FEATHER = 1.7;
const DEEP = 0.22;
const CURVE = 1.1;
const GLOW = { reach: 7, gain: Number(arg("--glow", 0.42)), tint: 0xa855f7 };

const coolArg = arg("--cool", "1,0.5,1.3,0.4,1.3").split(",").map(Number);
const COOL = {
  top: [coolArg[0], coolArg[1]],
  gain: [coolArg[2], coolArg[3]],
  bend: coolArg[4],
};
const FLOOR = 6;

function gridOf(name) {
  const flag = arg("--grid", "");
  if (flag) {
    const m = flag.match(/^([1-9]\d*)x([1-9]\d*)$/);
    if (!m) throw new Error(`--grid ${flag}: want CxR`);
    return { cols: Number(m[1]), rows: Number(m[2]) };
  }
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
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
  const [w, h] = out.split("x");
  return { w: Number(w), h: Number(h) };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, extra) {
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
      ...(extra || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

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

function light(on, w, h, cool, rim, scale) {
  const off = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) off[i] = on[i] ? 0 : 1;

  const dIn = chamfer(on, w, h);
  const dOut = chamfer(off, w, h);

  const gr = (GLOW.tint >> 16) & 255;
  const gg = (GLOW.tint >> 8) & 255;
  const gb = GLOW.tint & 255;

  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < on.length; i++) {
    const inside = on[i] === 1;
    const signed = inside ? dIn[i] : -dOut[i];
    const cov = clamp01(0.5 + signed / FEATHER);

    if (cov > 0.002) {
      const heat = clamp01(1 - (inside ? dIn[i] : 0) / rim);
      const [r, g, b] = rampAt(heat * cool.top);
      const v = (DEEP + (1 - DEEP) * Math.pow(heat, CURVE)) * cool.gain * cov;
      out[i * 3] = r * v;
      out[i * 3 + 1] = g * v;
      out[i * 3 + 2] = b * v;
    }

    if (!inside) {
      const k =
        GLOW.gain * Math.exp(-dOut[i] / (GLOW.reach * scale)) * cool.gain;
      out[i * 3] += gr * k;
      out[i * 3 + 1] += gg * k;
      out[i * 3 + 2] += gb * k;
    }
  }
  return out;
}

function blit(src, w, h, dst, dw, ox, oy, tw, th) {
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * h) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * w) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / tw));

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const s = (sy * w + sx) * 3;
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      const lit = Math.max(r, g, b) > FLOOR;
      const o = ((oy + y) * dw + ox + x) * 4;
      dst[o] = lit ? Math.min(255, Math.round(r)) : 0;
      dst[o + 1] = lit ? Math.min(255, Math.round(g)) : 0;
      dst[o + 2] = lit ? Math.min(255, Math.round(b)) : 0;
      dst[o + 3] = 255;
    }
  }
}

function luma(px, sw, x0, y0, cw, ch, pad) {
  const w = cw + pad * 2;
  const h = ch + pad * 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y0 + y) * sw + x0 + x) * 4;
      const l = 0.2126 * px[s] + 0.7152 * px[s + 1] + 0.0722 * px[s + 2];
      out[(y + pad) * w + x + pad] = (l * px[s + 3]) / 255;
    }
  }
  return { out, w, h };
}

if (!SRC || !existsSync(SRC)) {
  process.stderr.write(`pack-boss-beat: no source at ${SRC}\n`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });

const info = probe(SRC);
const px = decode(SRC);

const cellOut = CELL + PAD * 2;
const sheetRows = Math.ceil(COUNT / COLS);
const sheetW = cellOut * COLS;
const sheetH = cellOut * sheetRows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

let plan;
if (WIPE) {
  if (!existsSync(WIPE)) {
    process.stderr.write(`pack-boss-beat: no erosion mask at ${WIPE}\n`);
    process.exit(1);
  }
  const wipeInfo = probe(WIPE);
  if (wipeInfo.w !== info.w || wipeInfo.h !== info.h) {
    process.stderr.write("pack-boss-beat: slash and erosion differ in size\n");
    process.exit(1);
  }
  plan = {
    cw: info.w,
    ch: info.h,
    shape: px,
    erosion: decode(WIPE),
    frames: null,
  };
} else {
  const { cols, rows } = gridOf(basename(SRC));
  const take = arg("--take", "");
  const span = take ? take.split(":").map(Number) : [0, cols * rows - 1];
  plan = {
    cw: Math.floor(info.w / cols),
    ch: Math.floor(info.h / rows),
    cols,
    rows,
    frames: span,
  };
}

const scale = plan.cw / CELL;
const pad = Math.round(MARGIN * scale);
const padW = plan.cw + pad * 2;
const padH = plan.ch + pad * 2;
const wide = padW >= padH;
const bandW = wide ? CELL : Math.round((CELL * padW) / padH);
const bandH = wide ? Math.round((CELL * padH) / padW) : CELL;
const bandX = Math.round((CELL - bandW) / 2);
const bandY = Math.round((CELL - bandH) / 2);

for (let f = 0; f < COUNT; f++) {
  const t = Math.pow(f / (COUNT - 1), COOL.bend);
  const cool = {
    top: lerp(COOL.top[0], COOL.top[1], t),
    gain: lerp(COOL.gain[0], COOL.gain[1], t),
  };

  let on;
  let w;
  let h;

  if (WIPE) {
    const shape = luma(plan.shape, info.w, 0, 0, plan.cw, plan.ch, pad);
    const gap = luma(plan.erosion, info.w, 0, 0, plan.cw, plan.ch, pad);
    w = shape.w;
    h = shape.h;
    on = new Uint8Array(w * h);

    const k = f / (COUNT - 1);
    const gashes = CLAW
      ? [
          { dy: -0.3, scale: 0.78, lag: 0.06 },
          { dy: 0.02, scale: 1, lag: 0 },
          { dy: 0.34, scale: 0.86, lag: 0.1 },
        ]
      : [{ dy: 0, scale: 1, lag: 0 }];
    for (const gash of gashes) {
      const open = clamp01((k - gash.lag) / 0.3);
      const burn = clamp01((k - 0.46) / 0.54);
      const hi = 255 * (0.08 + 0.92 * open);
      const lo = 255 * Math.pow(burn, 0.85);
      const shiftY = Math.round(gash.dy * h);
      for (let y = 0; y < h; y++) {
        const sy = Math.round((y - shiftY - h / 2) / gash.scale + h / 2);
        if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < w; x++) {
          const sx = Math.round((x - w / 2) / gash.scale + w / 2);
          if (sx < 0 || sx >= w) continue;
          const si = sy * w + sx;
          if (shape.out[si] <= 110) continue;
          const g = gap.out[si];
          if (g <= hi && g >= lo) on[y * w + x] = 1;
        }
      }
    }
  } else {
    const [a, b] = plan.frames;
    const s = a + Math.round((f * (b - a)) / (COUNT - 1));
    const cut = luma(
      px,
      info.w,
      (s % plan.cols) * plan.cw,
      Math.floor(s / plan.cols) * plan.ch,
      plan.cw,
      plan.ch,
      pad,
    );
    w = cut.w;
    h = cut.h;
    on = new Uint8Array(w * h);
    for (let i = 0; i < on.length; i++) on[i] = cut.out[i] > 110 ? 1 : 0;
  }

  const painted = light(on, w, h, cool, RIM * scale, scale);
  blit(
    painted,
    w,
    h,
    sheet,
    sheetW,
    (f % COLS) * cellOut + PAD + bandX,
    Math.floor(f / COLS) * cellOut + PAD + bandY,
    bandW,
    bandH,
  );
}

if (STRIP) encode(sheet, sheetW, sheetH, OUT.replace(/\.webp$/, ".png"));

encode(sheet, sheetW, sheetH, OUT, [
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
]);

const kb = (statSync(OUT).size / 1024).toFixed(1);
process.stdout.write(
  `beat  ${basename(SRC)}${WIPE ? " + " + basename(WIPE) : ""}` +
    `  -> ${COUNT} frames  band ${bandW}x${bandH}  ${sheetW}x${sheetH}  ${kb} kB\n`,
);
