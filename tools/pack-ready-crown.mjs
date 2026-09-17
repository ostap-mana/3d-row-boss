import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/fx/invokers");
const OUT = join(ROOT, "src/assets/fx");

const CELL = { w: 112, h: 128 };
const COLS = 4;

const FLOOR = 12;

const PICKS = [
  {
    id: "fire",
    file: "T_FX_Fire_22_1_4x4.png",
    cols: 4,
    rows: 4,
    why: "the only fire on the shelf that is anchored: it catches along a flat base, rises in tongues and breaks up, which is fire burning *on* something rather than a fireball in free air",
  },
  {
    id: "water",
    file: "T_FX_Glow_Flash_11_1_4x4.png",
    cols: 4,
    rows: 4,
    why: "a burst that throws two arms up and out of a low point — the silhouette of a splash, which is what water does when something lands in it",
  },
  {
    id: "nature",
    file: "T_FX_Smoke_17_1_4x4.png",
    cols: 4,
    rows: 4,
    why: "round overlapping lobes that swell and part. As smoke it is a puff; in green, standing on a word, it is foliage coming up",
  },
  {
    id: "lightning",
    file: "T_FX_Electricity_7_1_4x2.png",
    cols: 4,
    rows: 2,
    why: "a vertical bolt that strikes and forks. Eight frames rather than sixteen, which is right for it: lightning is not supposed to have a slow half",
  },
  {
    id: "arcane",
    file: "T_FX_Smoke_4_1_4x4_A.png",
    cols: 4,
    rows: 4,
    why: "a ragged plume that climbs and frays instead of billowing — smoke off something being consumed, which in violet is the dark end of the roster",
  },
  {
    id: "wind",
    file: "T_FX_Electricity_1_1_4x4_A.png",
    cols: 4,
    rows: 4,
    why: "thin crackling curls with no trunk to them. The storm half of a storm wind: air you can only see because there is static in it",
  },
];

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

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

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

for (const pick of PICKS) {
  const file = join(SRC, pick.file);
  const info = probe(file);
  const px = decode(file);
  const count = pick.cols * pick.rows;

  if (count % COLS !== 0) {
    throw new Error(
      `${pick.id}: ${count} frames does not fill rows of ${COLS}`,
    );
  }

  const cw = Math.floor(info.w / pick.cols);
  const ch = Math.floor(info.h / pick.rows);

  const lum = (i) => Math.max(px[i], px[i + 1], px[i + 2]) * (px[i + 3] / 255);

  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -1;
  let by1 = -1;
  for (let f = 0; f < count; f++) {
    const sx = (f % pick.cols) * cw;
    const sy = Math.floor(f / pick.cols) * ch;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (lum(((sy + y) * info.w + sx + x) * 4) <= FLOOR) continue;
        if (sx + x - sx < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  if (bx1 < 0) throw new Error(`${pick.id}: every frame is empty`);

  const boxW = bx1 - bx0 + 1;
  const boxH = by1 - by0 + 1;

  const k = Math.min(CELL.w / boxW, CELL.h / boxH);
  const drawW = Math.max(1, Math.round(boxW * k));
  const drawH = Math.max(1, Math.round(boxH * k));
  const padX = Math.floor((CELL.w - drawW) / 2);
  const padY = CELL.h - drawH;

  const rows = count / COLS;
  const sheetW = COLS * CELL.w;
  const sheetH = rows * CELL.h;
  const out = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 0; i < sheetW * sheetH; i++) out[i * 4 + 3] = 255;

  const kx = boxW / drawW;
  const ky = boxH / drawH;

  for (let f = 0; f < count; f++) {
    const sx = (f % pick.cols) * cw + bx0;
    const sy = Math.floor(f / pick.cols) * ch + by0;
    const ox = (f % COLS) * CELL.w + padX;
    const oy = Math.floor(f / COLS) * CELL.h + padY;

    for (let y = 0; y < drawH; y++) {
      for (let x = 0; x < drawW; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        const x0 = Math.floor(x * kx);
        const x1 = Math.min(boxW, Math.max(x0 + 1, Math.floor((x + 1) * kx)));
        const y0 = Math.floor(y * ky);
        const y1 = Math.min(boxH, Math.max(y0 + 1, Math.floor((y + 1) * ky)));
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const s = ((sy + yy) * info.w + sx + xx) * 4;
            const a = px[s + 3] / 255;
            r += px[s] * a;
            g += px[s + 1] * a;
            b += px[s + 2] * a;
            n++;
          }
        }
        const dst = ((oy + y) * sheetW + ox + x) * 4;
        out[dst] = Math.round(r / n);
        out[dst + 1] = Math.round(g / n);
        out[dst + 2] = Math.round(b / n);
      }
    }
  }

  const target = join(OUT, `ready-${pick.id}`);
  encode(out, sheetW, sheetH, `${target}.webp`, [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    "80",
    "-compression_level",
    "6",
    "-preset",
    "picture",
    "-pix_fmt",
    "yuv420p",
  ]);

  console.log(
    `${pick.id.padEnd(9)} ${rel(file)}  ${info.w}x${info.h} -> ` +
      `${count} frames, ${sheetW}x${sheetH}, ` +
      `${(statSync(`${target}.webp`).size / 1024).toFixed(1)} kB`,
  );

  if (flags.has("--contact")) {
    const test = Buffer.alloc(sheetW * sheetH * 4);
    for (let i = 0; i < sheetW * sheetH; i++) {
      test[i * 4] = 26;
      test[i * 4 + 1] = 18;
      test[i * 4 + 2] = 30;
      test[i * 4 + 3] = 255;
      for (let c = 0; c < 3; c++) {
        test[i * 4 + c] = Math.min(255, test[i * 4 + c] + out[i * 4 + c]);
      }
    }
    encode(test, sheetW, sheetH, `${target}-contact.png`);
  }
}

console.log(`\n     cell ${CELL.w}x${CELL.h}, ${COLS} columns, every element.`);
