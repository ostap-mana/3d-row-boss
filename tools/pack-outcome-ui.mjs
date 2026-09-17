import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src/source/outcome");
const OUT_DIR = join(ROOT, "src/assets/outcome");

const CUTS = [
  { key: "victory-band", src: "victory-band.png", width: 0, quality: 92 },
  { key: "defeat-band", src: "defeat-band.png", width: 0, quality: 92 },
  { key: "ornament-line", src: "ornament-line.png", width: 0, lossless: true },
  { key: "stars-victory", src: "stars-victory.png", width: 0, quality: 92 },
  { key: "stars-defeat", src: "stars-defeat.png", width: 0, quality: 92 },
];

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,pix_fmt",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h, fmt] = out.split(",");
  return { w: Number(w), h: Number(h), fmt };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file, args) {
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
    { input: buf, maxBuffer: 1 << 29 },
  );
}

function alphaProfile(px) {
  let clear = 0;
  let solid = 0;
  let soft = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 8) clear++;
    else if (px[i] > 247) solid++;
    else soft++;
  }
  const n = px.length / 4;
  const pc = (v) => `${((v / n) * 100).toFixed(1)}%`;
  return `clear ${pc(clear)}  soft ${pc(soft)}  solid ${pc(solid)}`;
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

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const packed = [];

for (const cut of CUTS) {
  const src = join(SRC_DIR, cut.src);
  const out = join(OUT_DIR, cut.key);
  const info = probe(src);
  const px = decode(src);

  console.log(
    `in   ${rel(src)}  ${info.w}x${info.h}  ${kb(statSync(src).size)}` +
      `\n     ${alphaProfile(px)}`,
  );

  const outW = cut.width || info.w;
  const outH = cut.height || Math.round((info.h * outW) / info.w);
  const art =
    outW === info.w && outH === info.h
      ? px
      : resample(px, info.w, info.h, outW, outH);

  if (flags.has("--png")) encode(art, outW, outH, `${out}.png`);
  encode(art, outW, outH, `${out}.webp`, [
    "-c:v",
    "libwebp",
    ...(cut.lossless ? ["-lossless", "1"] : ["-quality", String(cut.quality)]),
    "-compression_level",
    "6",
  ]);

  console.log(
    `out  ${rel(out)}.webp  ${outW}x${outH}  ${kb(statSync(`${out}.webp`).size)}` +
      `   aspect ${(outW / outH).toFixed(3)}` +
      `   ${cut.lossless ? "lossless" : `quality ${cut.quality}`}` +
      `   ${probe(`${out}.webp`).fmt}\n`,
  );
  packed.push({ key: cut.key, w: outW, h: outH, art });
}

console.log("     for art/outcomeui.js:");

const NAMES = {
  "victory-band": "VERDICT_ART",
  "ornament-line": "LINE_ART",
  "stars-victory": "STARS_ART.victory",
  "stars-defeat": "STARS_ART.defeat",
};
packed.forEach((p) => {
  if (p.key === "defeat-band") {
    const v = packed.find((q) => q.key === "victory-band");
    if (v && (v.w !== p.w || v.h !== p.h)) {
      console.log(
        `       !! defeat-band is ${p.w}x${p.h} and victory-band is ` +
          `${v.w}x${v.h} — VERDICT_ART describes one shape and cannot do both`,
      );
    }
    return;
  }
  console.log(`       ${NAMES[p.key]} { w: ${p.w}, h: ${p.h} }`);
});

if (flags.has("--proof")) {
  const W = 1100;
  const pad = 40;
  const rows = packed.map((p) => Math.round((p.h * (W - pad * 2)) / p.w));
  const H = rows.reduce((a, h) => a + h + pad, pad);
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 0x1a;
    proof[i * 4 + 1] = 0x1f;
    proof[i * 4 + 2] = 0x2e;
    proof[i * 4 + 3] = 255;
  }

  let y = pad;
  packed.forEach((p, i) => {
    const pw = W - pad * 2;
    const ph = rows[i];
    const small = resample(p.art, p.w, p.h, pw, ph);
    for (let sy = 0; sy < ph; sy++) {
      for (let sx = 0; sx < pw; sx++) {
        const s = (sy * pw + sx) * 4;
        const d = ((y + sy) * W + pad + sx) * 4;
        const a = small[s + 3] / 255;
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(proof[d + c] * (1 - a) + small[s + c] * a);
        }
      }
    }
    y += ph + pad;
  });

  const file = join(OUT_DIR, "outcome-ui-proof.png");
  encode(proof, W, H, file);
  console.log(`\nout  ${rel(file)}  (delete when looked at)`);
}
