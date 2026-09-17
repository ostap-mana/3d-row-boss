import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const NOISE = 8;

const RIDGE = 218;

const CLOSE_PASSES = 4;

const POCKET = 20000;

const PREVIEW_BG = [
  [14, 10, 20],
  [232, 228, 236],
];

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
    const a = alpha[p] <= NOISE ? 0 : alpha[p];
    out[i + 3] = a;
    if (a === 0) continue;
    const k = 255 / a;
    out[i] = clamp8((px[i] - B[0]) * k);
    out[i + 1] = clamp8((px[i + 1] - B[1]) * k);
    out[i + 2] = clamp8((px[i + 2] - B[2]) * k);
  }
  return out;
}

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
