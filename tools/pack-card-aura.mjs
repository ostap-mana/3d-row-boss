import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "masters/cards");
const OUT_DIR = join(ROOT, "src/assets/cards");

const ASSETS = [
  { src: "aura-sheet.png", out: "aura-frame", pad: 64, width: 200 },
  { src: "aura-burst-sheet.png", out: "aura-burst", pad: 20, width: 200 },
];

const PROOF_BG = [26, 18, 34];
const PROOF_CARD = [0x12, 0x0b, 0x1e];
const PROOF_TINT = [0xff, 0x6b, 0x3d];

const LOSSY = ["-c:v", "libwebp", "-quality", "92", "-compression_level", "6"];
const LOSSLESS = [
  "-c:v",
  "libwebp",
  "-lossless",
  "1",
  "-compression_level",
  "6",
];

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

function decode(file) {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);

  const px = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
  if (px.length !== w * h * 4) {
    throw new Error(
      `${rel(file)}: decoded ${px.length} bytes, expected ${w * h * 4}`,
    );
  }
  return { w, h, px };
}

function encode(file, w, h, px, args) {
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
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: px, maxBuffer: 1 << 30 },
  );
}

const level = (px, i) => Math.max(px[i], px[i + 1], px[i + 2]);

function rimBox({ w, h, px }) {
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  const y0 = Math.round(h * 0.25);
  const y1 = Math.round(h * 0.75);
  const x0 = Math.round(w * 0.25);
  const x1 = Math.round(w * 0.75);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = level(px, (y * w + x) * 4);
      if (y >= y0 && y < y1) cols[x] += v;
      if (x >= x0 && x < x1) rows[y] += v;
    }
  }

  const peak = (arr, a, b) => {
    let best = -1;
    let at = a;
    for (let i = a; i < b; i++) {
      if (arr[i] > best) {
        best = arr[i];
        at = i;
      }
    }
    return at;
  };

  return {
    left: peak(cols, 0, w >> 1),
    right: peak(cols, w >> 1, w),
    top: peak(rows, 0, h >> 1),
    bottom: peak(rows, h >> 1, h),
  };
}

function lift({ w, px }, box) {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const out = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = level(px, ((y + box.y0) * w + (x + box.x0)) * 4);
      const o = (y * bw + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = a;
    }
  }
  return { w: bw, h: bh, px: out };
}

function pack(asset) {
  const src = join(SRC_DIR, asset.src);
  const sheet = decode(src);
  const rim = rimBox(sheet);
  const rw = rim.right - rim.left;
  const rh = rim.bottom - rim.top;

  const box = {
    x0: Math.max(0, rim.left - asset.pad),
    y0: Math.max(0, rim.top - asset.pad),
    x1: Math.min(sheet.w, rim.right + asset.pad),
    y1: Math.min(sheet.h, rim.bottom + asset.pad),
  };
  const cut = lift(sheet, box);

  const outW = asset.width - (asset.width % 2);
  const outH = Math.round((cut.h * outW) / cut.w / 2) * 2;
  const file = join(OUT_DIR, `${asset.out}.webp`);
  encode(file, cut.w, cut.h, cut.px, [
    "-vf",
    `scale=${outW}:${outH}:flags=lanczos`,
    ...LOSSY,
  ]);

  const padX = (rim.left - box.x0 + (box.x1 - rim.right)) / 2 / rw;
  const padY = (rim.top - box.y0 + (box.y1 - rim.bottom)) / 2 / rh;

  console.log(
    `${asset.src}  ${sheet.w}x${sheet.h}\n` +
      `  rim    ${rw}x${rh} at ${rim.left},${rim.top}` +
      `  aspect ${(rw / rh).toFixed(3)}\n` +
      `  crop   ${cut.w}x${cut.h} at ${box.x0},${box.y0}\n` +
      `  out    ${rel(file)}  ${outW}x${outH}  ${kb(statSync(file).size)}\n` +
      `  PAD_X ${padX.toFixed(4)}   PAD_Y ${padY.toFixed(4)}` +
      `   <- art/frameaura.js`,
  );

  return { asset, cut, rim, box, padX, padY };
}

function proof(packed) {
  const CARD_W = 59 * 3;
  const CARD_H = Math.round((59 / 0.48) * 3);
  const W = Math.round(CARD_W * 2.2);
  const H = Math.round(CARD_H * 1.7);
  const px = Buffer.alloc(W * H * 4);

  for (let i = 0; i < W * H; i++) {
    px[i * 4] = PROOF_BG[0];
    px[i * 4 + 1] = PROOF_BG[1];
    px[i * 4 + 2] = PROOF_BG[2];
    px[i * 4 + 3] = 255;
  }

  const cx = (W - CARD_W) / 2;
  const cy = (H - CARD_H) / 2;
  for (let y = 0; y < CARD_H; y++) {
    for (let x = 0; x < CARD_W; x++) {
      const o = ((y + cy) * W + (x + cx)) * 4;
      px[o] = PROOF_CARD[0];
      px[o + 1] = PROOF_CARD[1];
      px[o + 2] = PROOF_CARD[2];
    }
  }

  const aw = CARD_W * (1 + 2 * packed.padX);
  const ah = CARD_H * (1 + 2 * packed.padY);
  const ax = cx - CARD_W * packed.padX;
  const ay = cy - CARD_H * packed.padY;

  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const dx = Math.round(x + ax);
      const dy = Math.round(y + ay);
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const sx = Math.min(
        packed.cut.w - 1,
        Math.floor((x / aw) * packed.cut.w),
      );
      const sy = Math.min(
        packed.cut.h - 1,
        Math.floor((y / ah) * packed.cut.h),
      );
      const a = packed.cut.px[(sy * packed.cut.w + sx) * 4 + 3] / 255;
      if (a <= 0) continue;
      const o = (dy * W + dx) * 4;
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.min(255, px[o + c] + PROOF_TINT[c] * a);
      }
    }
  }

  const file = join(SRC_DIR, `${packed.asset.out}-proof.png`);
  encode(file, W, H, px, LOSSLESS);
  console.log(`  proof  ${rel(file)}  ${W}x${H}`);
}

const wantProof = process.argv.includes("--proof");
for (const asset of ASSETS) {
  const packed = pack(asset);
  if (wantProof) proof(packed);
}
