import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = join(ROOT, "src/assets");

const args = process.argv.slice(2);
const ORIG = args[args.indexOf("--from") + 1];
if (args.indexOf("--from") === -1 || !existsSync(ORIG)) {
  console.error(
    "usage: node tools/slim-assets.mjs --from <pristine-assets-dir>",
  );
  process.exit(1);
}

const dry = args.includes("--dry");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

function pristine(rel) {
  return join(ORIG, rel);
}

function probe(file) {
  const [w, h, pix] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,pix_fmt",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim()
    .split(",");
  return { w: Number(w), h: Number(h), alpha: pix.includes("a") };
}

const SHEETS = [
  {
    rel: "outcome/victory-figure.webp",
    cols: 7,
    cell: "300x300",
    pad: 2,
    count: 28,
    scale: 0.56,
    q: 82,
  },
  {
    rel: "outcome/fireworks.webp",
    cols: 8,
    cell: "224x196",
    pad: 2,
    count: 62,
    scale: 0.58,
    q: 82,
  },
  {
    rel: "fx/torrent-sheet.webp",
    cols: 4,
    cell: "512x152",
    pad: 2,
    count: 16,
    grids: 2,
    block: 618,
    scale: 0.6,
    q: 82,
  },
  {
    rel: "fx/fire-lance.webp",
    cols: 4,
    cell: "512x160",
    pad: 2,
    count: 16,
    scale: 0.62,
    q: 82,
  },
];

const PITCH = { cols: 5, rows: 2, scale: 0.66, q: 84 };

const PLAIN = [
  ["boss/magmaroth.webp", 0.6, 86],
  ["arena/sky.webp", 0.7, 86],
  ["brand/key-art.webp", 0.6, 84],
  ["brand/play-now.webp", 0.72, 86],
  ["outcome/stars-defeat.webp", 0.62, 84],
  ["outcome/stars-victory.webp", 0.62, 84],
  ["outcome/victory-band.webp", 0.62, 84],
  ["outcome/defeat-band.webp", 0.62, 84],
  ["outcome/ornament-line.webp", 0.8, 86],
  ["ui/boss-crest-face.webp", 0.75, 86],
];

const GLOBS = [
  { dir: "hint", match: /^hand-/, scale: 0.62, q: 84 },
  { dir: "hint", match: /^frame-/, scale: 0.75, q: 86 },
  { dir: "hint", match: /^arrow-/, scale: 0.75, q: 86 },
];

const EXACT = [
  { dir: "cards", match: /^ult-/, cell: [216, 344], out: [134, 214], q: 84 },
  {
    dir: "fx",
    match: /^fire-sheet\.webp$/,
    cell: [399, 258],
    out: [288, 186],
    q: 84,
  },
  { dir: "fx", match: /^ready-/, cell: [112, 128], out: [84, 96], q: 84 },
];

const AUDIO = { bitrate: "48k", rate: 32000 };

let before = 0;
let after = 0;

function encode(src, out, w, h, q, alpha) {
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      src,
      "-vf",
      `scale=${w}:${h}:flags=lanczos`,
      "-c:v",
      "libwebp",
      "-quality",
      String(q),
      "-preset",
      "picture",
      "-compression_level",
      "6",
      "-pix_fmt",
      alpha ? "yuva420p" : "yuv420p",
      out,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}

function report(rel, was, now) {
  before += was;
  after += now;
  const pct = (100 - (now / was) * 100).toFixed(0);
  console.log(
    `  ${rel.padEnd(36)} ${String(Math.round(was / 1024)).padStart(5)} -> ${String(Math.round(now / 1024)).padStart(5)} kB  -${pct}%`,
  );
}

if (!only || only === "sheets") {
  console.log("sheets (repacked):");
  for (const s of SHEETS) {
    const src = pristine(s.rel);
    const dst = join(A, s.rel);
    const was = statSync(src).size;
    if (dry) {
      console.log(`  ${s.rel} scale ${s.scale}`);
      continue;
    }
    const argv = [
      join(ROOT, "tools/shrink-sheet.mjs"),
      src,
      "--cols",
      String(s.cols),
      "--cell",
      s.cell,
      "--pad",
      String(s.pad),
      "--count",
      String(s.count),
      "--scale",
      String(s.scale),
      "--quality",
      String(s.q),
      "--out",
      dst,
    ];
    if (s.grids)
      argv.push("--grids", String(s.grids), "--block", String(s.block));
    const out = execFileSync("node", argv).toString();
    console.log("  " + out.trim().split("\n").join("\n  "));
    report(s.rel, was, statSync(dst).size);
  }
}

if (!only || only === "pitch") {
  console.log("pitch sheets (width stays cols x cell):");
  for (const f of readdirSync(join(ORIG, "fx"))) {
    if (!/-sheet\.webp$/.test(f)) continue;
    if (f === "fire-sheet.webp" || f === "torrent-sheet.webp") continue;
    const rel = `fx/${f}`;
    const src = pristine(rel);
    const dst = join(A, rel);
    const was = statSync(src).size;
    const m = probe(src);
    const cell = Math.round((m.w / PITCH.cols) * PITCH.scale);
    const w = cell * PITCH.cols;
    const h = cell * Math.round(m.h / (m.w / PITCH.cols));
    if (dry) {
      console.log(`  ${rel} ${m.w}x${m.h} -> ${w}x${h}`);
      continue;
    }
    encode(src, dst, w, h, PITCH.q, m.alpha);
    report(rel, was, statSync(dst).size);
  }
}

if (!only || only === "plain") {
  console.log("plain images:");
  const jobs = [...PLAIN];
  for (const g of GLOBS) {
    for (const f of readdirSync(join(ORIG, g.dir))) {
      if (!g.match.test(f)) continue;
      jobs.push([`${g.dir}/${f}`, g.scale, g.q]);
    }
  }
  for (const [rel, scale, q] of jobs) {
    const src = pristine(rel);
    if (!existsSync(src)) continue;
    const dst = join(A, rel);
    const was = statSync(src).size;
    const m = probe(src);
    const w = Math.max(2, Math.round((m.w * scale) / 2) * 2);
    const h = Math.max(2, Math.round((m.h * scale) / 2) * 2);
    if (dry) {
      console.log(`  ${rel} ${m.w}x${m.h} -> ${w}x${h}`);
      continue;
    }
    encode(src, dst, w, h, q, m.alpha);
    report(rel, was, statSync(dst).size);
  }
}

if (!only || only === "exact") {
  console.log("cell grids (no gutter):");
  for (const g of EXACT) {
    for (const f of readdirSync(join(ORIG, g.dir))) {
      if (!g.match.test(f)) continue;
      const rel = `${g.dir}/${f}`;
      const src = pristine(rel);
      const dst = join(A, rel);
      const was = statSync(src).size;
      const m = probe(src);
      const w = Math.round(m.w / g.cell[0]) * g.out[0];
      const h = Math.round(m.h / g.cell[1]) * g.out[1];
      if (dry) {
        console.log(`  ${rel} ${m.w}x${m.h} -> ${w}x${h}`);
        continue;
      }
      encode(src, dst, w, h, g.q, m.alpha);
      report(rel, was, statSync(dst).size);
    }
  }
}

if (!only || only === "audio") {
  console.log("audio:");
  for (const f of readdirSync(join(ORIG, "audio"))) {
    if (!/\.mp3$/.test(f)) continue;
    const rel = `audio/${f}`;
    const src = pristine(rel);
    const dst = join(A, rel);
    const was = statSync(src).size;
    if (dry) {
      console.log(`  ${rel} -> ${AUDIO.bitrate}`);
      continue;
    }
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        src,
        "-c:a",
        "libmp3lame",
        "-b:a",
        AUDIO.bitrate,
        "-ac",
        "1",
        "-ar",
        String(AUDIO.rate),
        dst,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    report(rel, was, statSync(dst).size);
  }
}

if (!dry) {
  console.log(
    `\ntotal: ${Math.round(before / 1024)} kB -> ${Math.round(after / 1024)} kB  (saved ${Math.round((before - after) / 1024)} kB raw)`,
  );
}
