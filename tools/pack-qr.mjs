/**
 * Generate the store QR code and pack it for the end card.
 *
 *   node tools/pack-qr.mjs                # -> src/assets/brand/qr.webp
 *   node tools/pack-qr.mjs --png          # keep a lossless PNG beside it
 *   node tools/pack-qr.mjs --round        # rounded white plate, clear corners
 *   node tools/pack-qr.mjs --ecc M        # smaller matrix, less damage budget
 *   node tools/pack-qr.mjs --url https://…
 *   node tools/pack-qr.mjs --dump         # print the matrix as text
 *
 * ## Why this is generated and not painted
 *
 * Everything else in this folder packs a picture somebody made. This one packs
 * *data*: a QR is a lossless encoding of a string, and the only correct one for
 * a given URL is the one the standard produces. Draw it by hand, or resample it
 * with the box filter the other packers use, and it stops being a QR — it
 * becomes a picture of one that a camera may or may not agree to read.
 *
 * Two consequences run through the whole file. The URL is read from
 * src/config.js rather than typed here, so the code and the badges under it can
 * never point at two different places — see STORE_URL, and `pc` in it, which is
 * the one entry that is a landing page rather than a storefront and so the only
 * one worth putting in front of a camera. And every scaling step is an integer
 * multiply with no interpolation: a module is MODULE pixels of one colour, or
 * the file is wrong.
 *
 * ## Why there is an encoder in here
 *
 * `qrcode` on npm would do this in four lines. It is not here for the same
 * reason the resampler in pack-victory.mjs is written out: this folder's only
 * dependency is ffmpeg, and a build tool that pulls a tree of packages to emit
 * a kilobyte of black and white is a bad trade. The encoder below is byte mode,
 * versions 1 to 6, which covers any URL up to 84 characters at the default
 * error correction — comfortably more than a landing page needs. Past that it
 * refuses rather than guessing, because version 7 and up carry a second block
 * of version information that is not implemented here.
 *
 * ## Why it verifies itself
 *
 * A QR that is subtly wrong looks completely right. Reed-Solomon over the wrong
 * generator, a mask written into the format bits that is not the mask applied
 * to the data, one transposed coordinate in the zigzag — every one of those
 * produces a plausible-looking square of noise, and the first time anybody
 * finds out is when a phone will not read it off a screen in a meeting.
 *
 * So the matrix is decoded back before it is written: the format bits are read
 * out of the finished grid, the mask is undone, the codewords are lifted in the
 * same zigzag, de-interleaved, run through a Reed-Solomon syndrome check — all
 * syndromes must be zero — and the payload is parsed back to a string that has
 * to equal the URL that went in. Nothing reaches disk unless that passes.
 *
 * ## Error correction
 *
 * Default H, the highest: up to 30% of the code can be damaged and still read.
 * That is not paranoia about print, it is what buys the option of dropping the
 * game's crest into the middle of it later without re-deriving anything. It
 * costs nothing here — `https://invokers.com/` is 21 bytes, which lands in
 * version 3 at level H and version 3 at level Q alike, so the weaker level
 * would have bought the same 29x29 grid and less margin. `--ecc M` drops it to
 * 25x25 if a smaller grid ever matters more than the damage budget.
 *
 * ffmpeg is the only dependency, and only to encode, as everywhere else here.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "qr");

/** Pixels per module. Integer, and every scale below is a whole multiple. */
const MODULE = 12;

/**
 * The light border, in modules.
 *
 * Four is the standard's own minimum and it is not decoration: a scanner finds
 * the code by looking for the finder patterns against light, and a QR butted up
 * against the end card's near-black backdrop has no light for it to find. This
 * is also why the packed file is white rather than transparent.
 */
const QUIET = 4;

/** Corner radius for --round, in modules. Never eats into the quiet zone. */
const RADIUS = 3;

/* ----------------------------------------------------------------- GF(256) */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `deg` error correction codewords. */
function generator(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const n = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      n[j] ^= g[j];
      n[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = n;
  }
  return g;
}

/** The Reed-Solomon remainder: `count` codewords appended to a block. */
function eccOf(data, count) {
  const g = generator(count);
  const buf = new Uint8Array(data.length + count);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor === 0) continue;
    for (let j = 0; j < g.length; j++) buf[i + j] ^= mul(g[j], factor);
  }
  return Array.from(buf.slice(data.length));
}

/* ------------------------------------------------------------------ tables */

/**
 * Block layout per version and level: [eccPerBlock, g1Blocks, g1Data, g2Blocks,
 * g2Data]. Straight out of the standard's block table, versions 1 to 6 only.
 */
const BLOCKS = {
  "1L": [7, 1, 19],
  "1M": [10, 1, 16],
  "1Q": [13, 1, 13],
  "1H": [17, 1, 9],
  "2L": [10, 1, 34],
  "2M": [16, 1, 28],
  "2Q": [22, 1, 22],
  "2H": [28, 1, 16],
  "3L": [15, 1, 55],
  "3M": [26, 1, 44],
  "3Q": [18, 2, 17],
  "3H": [22, 2, 13],
  "4L": [20, 1, 80],
  "4M": [18, 2, 32],
  "4Q": [26, 2, 24],
  "4H": [16, 4, 9],
  "5L": [26, 1, 108],
  "5M": [24, 2, 43],
  "5Q": [18, 2, 15, 2, 16],
  "5H": [22, 2, 11, 2, 12],
  "6L": [18, 2, 68],
  "6M": [16, 4, 27],
  "6Q": [24, 4, 19],
  "6H": [28, 4, 15],
};

/** Alignment pattern centres per version. */
const ALIGN = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

/** The two bits that name each level inside the format information. */
const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const dataCapacity = (v, lvl) => {
  const b = BLOCKS[`${v}${lvl}`];
  return b[1] * b[2] + (b[3] || 0) * (b[4] || 0);
};

/* ------------------------------------------------------------------ encode */

/** Mode indicator, 8-bit length, payload, terminator, pad — as a byte array. */
function codewords(bytes, version, level) {
  const cap = dataCapacity(version, level);
  const bits = [];
  const push = (v, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);

  const room = cap * 8;
  for (let i = 0; i < 4 && bits.length < room; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  // The standard's own pad bytes, alternating, until the block is full.
  for (let i = 0; out.length < cap; i++) out.push(i % 2 ? 0x11 : 0xec);
  return out;
}

/** Split, add ECC to each block, and interleave the way the standard wants. */
function interleave(data, version, level) {
  const [ecc, n1, d1, n2 = 0, d2 = 0] = BLOCKS[`${version}${level}`];
  const blocks = [];
  let at = 0;
  for (let i = 0; i < n1 + n2; i++) {
    const len = i < n1 ? d1 : d2;
    const chunk = data.slice(at, at + len);
    at += len;
    blocks.push({ data: chunk, ecc: eccOf(chunk, ecc) });
  }

  const out = [];
  const widest = Math.max(d1, d2);
  for (let i = 0; i < widest; i++)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

/* ------------------------------------------------------------------ matrix */

/** The function patterns: everything that is not payload. */
function skeleton(version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Uint8Array(size));
  const fn = Array.from({ length: size }, () => new Uint8Array(size));
  const put = (r, c, v) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    m[r][c] = v;
    fn[r][c] = 1;
  };

  // Finders, plus the light separator that rings each one.
  for (const [r0, c0] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ])
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        put(r0 + dr, c0 + dc, inside && d !== 2 ? 1 : 0);
      }

  // Timing: the alternating spine between the finders, on both axes.
  for (let i = 8; i < size - 8; i++) {
    put(6, i, i % 2 === 0 ? 1 : 0);
    put(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Alignment, minus the three that would land on a finder.
  const pos = ALIGN[version];
  for (const r of pos)
    for (const c of pos) {
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8)
      )
        continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          put(
            r + dr,
            c + dc,
            Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1,
          );
    }

  // The one module that is always dark, and the format areas held open for it.
  put(size - 8, 8, 1);
  for (let i = 0; i <= 8; i++) {
    if (!fn[i][8]) put(i, 8, 0);
    if (!fn[8][i]) put(8, i, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!fn[8][size - 1 - i]) put(8, size - 1 - i, 0);
    if (!fn[size - 1 - i][8]) put(size - 1 - i, 8, 0);
  }

  return { size, m, fn };
}

/** Walk the payload zigzag, handing every free module to `visit`. */
function zigzag(size, fn, visit) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const up = ((right + 1) & 2) === 0;
        const r = up ? size - 1 - vert : vert;
        if (fn[r][c]) continue;
        visit(r, c, i++);
      }
  }
}

const maskAt = (mask, r, c) =>
  [
    (r + c) % 2 === 0,
    r % 2 === 0,
    c % 3 === 0,
    (r + c) % 3 === 0,
    (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0,
    ((r * c) % 2) + ((r * c) % 3) === 0,
    (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ][mask];

/** The 15 bits of format information, BCH-coded and masked, per the standard. */
function formatBits(level, mask) {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function writeFormat(m, size, level, mask) {
  const bits = formatBits(level, mask);
  const bit = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
  m[size - 8][8] = 1;
}

/**
 * How bad a masked grid looks to a scanner. Lower is better.
 *
 * The four rules of the standard, with the third simplified to a literal search
 * for the two finder-lookalike runs rather than the full window walk. Only the
 * ordering matters here — every mask produces a readable code, and this only
 * decides which one is picked.
 */
function penalty(m, size) {
  let score = 0;
  const FIND = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];

  const line = (get) => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
    for (let i = 0; i + 11 <= size; i++) {
      let fwd = true;
      let rev = true;
      for (let j = 0; j < 11; j++) {
        if (get(i + j) !== FIND[j]) fwd = false;
        if (get(i + j) !== FIND[10 - j]) rev = false;
      }
      if (fwd || rev) score += 40;
    }
  };

  for (let r = 0; r < size; r++) line((i) => m[r][i]);
  for (let c = 0; c < size; c++) line((i) => m[i][c]);

  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1])
        score += 3;
    }

  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** Encode `text` and return the finished matrix, mask and all. */
function encode(text, level) {
  const bytes = Array.from(Buffer.from(text, "utf8"));
  let version = 0;
  for (let v = 1; v <= 6; v++)
    if (dataCapacity(v, level) * 8 >= 4 + 8 + bytes.length * 8) {
      version = v;
      break;
    }
  if (!version)
    throw new Error(
      `${bytes.length} bytes does not fit in version 6 at level ${level} — ` +
        `shorten the URL, drop to --ecc L, or teach this tool version info`,
    );

  const stream = interleave(codewords(bytes, version, level), version, level);
  const { size, m, fn } = skeleton(version);
  zigzag(size, fn, (r, c, i) => {
    m[r][c] = i < stream.length * 8 ? (stream[i >> 3] >> (7 - (i & 7))) & 1 : 0;
  });

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const test = m.map((row) => Uint8Array.from(row));
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!fn[r][c] && maskAt(mask, r, c)) test[r][c] ^= 1;
    writeFormat(test, size, level, mask);
    const s = penalty(test, size);
    if (!best || s < best.score) best = { mask, score: s, m: test };
  }

  return {
    version,
    level,
    size,
    mask: best.mask,
    score: best.score,
    m: best.m,
  };
}

/* ------------------------------------------------------------------ verify */

/**
 * Read the finished grid back and prove it says what it was asked to say.
 *
 * Deliberately walks in from the outside: the format bits are recovered by
 * matching all 32 legal words rather than by trusting the mask the encoder
 * chose, the codewords come back out of the same zigzag, and every block is
 * checked against its own Reed-Solomon syndromes before a byte is believed.
 */
function verify(grid, text) {
  const { size, m } = grid;
  let read = 0;
  for (let i = 0; i <= 5; i++) read |= m[i][8] << i;
  read |= m[7][8] << 6;
  read |= m[8][8] << 7;
  read |= m[8][7] << 8;
  for (let i = 9; i < 15; i++) read |= m[8][14 - i] << i;

  let found = null;
  for (const lvl of Object.keys(LEVEL_BITS))
    for (let mask = 0; mask < 8; mask++)
      if (formatBits(lvl, mask) === read) found = { lvl, mask };
  if (!found) throw new Error("format information does not decode");
  if (found.lvl !== grid.level || found.mask !== grid.mask)
    throw new Error("format information disagrees with the grid it is on");

  const version = (size - 17) / 4;
  const { fn } = skeleton(version);
  const bits = [];
  zigzag(size, fn, (r, c) => {
    bits.push(m[r][c] ^ (maskAt(found.mask, r, c) ? 1 : 0));
  });

  const stream = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    stream.push(b);
  }

  // De-interleave back into blocks, exactly reversing the walk above.
  const [ecc, n1, d1, n2 = 0, d2 = 0] = BLOCKS[`${version}${found.lvl}`];
  const lens = [];
  for (let i = 0; i < n1; i++) lens.push(d1);
  for (let i = 0; i < n2; i++) lens.push(d2);
  const blocks = lens.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(d1, d2); i++)
    for (let b = 0; b < lens.length; b++)
      if (i < lens[b]) blocks[b].push(stream[at++]);
  const eccs = lens.map(() => []);
  for (let i = 0; i < ecc; i++)
    for (let b = 0; b < lens.length; b++) eccs[b].push(stream[at++]);

  blocks.forEach((data, b) => {
    const full = [...data, ...eccs[b]];
    for (let j = 0; j < ecc; j++) {
      let s = 0;
      for (let i = 0; i < full.length; i++)
        s ^= mul(full[i], EXP[(j * (full.length - 1 - i)) % 255]);
      if (s !== 0)
        throw new Error(`block ${b} fails its Reed-Solomon syndrome ${j}`);
    }
  });

  const flat = blocks.flat();
  if (flat[0] >> 4 !== 0b0100) throw new Error("payload is not byte mode");
  const len = ((flat[0] & 0xf) << 4) | (flat[1] >> 4);
  const out = [];
  for (let i = 0; i < len; i++)
    out.push(((flat[1 + i] & 0xf) << 4) | (flat[2 + i] >> 4));
  const got = Buffer.from(out).toString("utf8");
  if (got !== text)
    throw new Error(
      `decoded ${JSON.stringify(got)}, wanted ${JSON.stringify(text)}`,
    );
  return { version, level: found.lvl, mask: found.mask, len };
}

/* ------------------------------------------------------------------ render */

/** Nearest-neighbour by construction: every module is MODULE px of one colour. */
function render(grid, round) {
  const n = grid.size + QUIET * 2;
  const px = n * MODULE;
  const buf = Buffer.alloc(px * px * 4);

  const r2 = RADIUS * MODULE;
  const inPlate = (x, y) => {
    if (!round) return true;
    const cx = x < r2 ? r2 : x >= px - r2 ? px - r2 - 1 : x;
    const cy = y < r2 ? r2 : y >= px - r2 ? px - r2 - 1 : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r2 * r2;
  };

  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const r = Math.floor(y / MODULE) - QUIET;
      const c = Math.floor(x / MODULE) - QUIET;
      const dark =
        r >= 0 && c >= 0 && r < grid.size && c < grid.size && grid.m[r][c];
      const i = (y * px + x) * 4;
      const v = dark ? 0 : 255;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = inPlate(x, y) ? 255 : 0;
    }
  return { buf, px };
}

function encodeFile(buf, size, file, args) {
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
      `${size}x${size}`,
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

/* --------------------------------------------------------------------- run */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const config = await import(pathToFileURL(join(ROOT, "src/config.js")).href);
const url = value("url", config.STORE_URL.pc);
const level = value("ecc", "H").toUpperCase();
if (!LEVEL_BITS[level])
  throw new Error(`--ecc must be one of L M Q H, got ${level}`);

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

const grid = encode(url, level);
const checked = verify(grid, url);

console.log(
  `in   ${url}  (${Buffer.byteLength(url, "utf8")} bytes)\n` +
    `     version ${grid.version}-${grid.level}   ${grid.size}x${grid.size} modules` +
    `   mask ${grid.mask}   penalty ${grid.score}\n` +
    `     verified: decoded back ${checked.len} bytes, all Reed-Solomon syndromes zero`,
);

if (flag("dump")) {
  console.log("");
  for (let r = -QUIET; r < grid.size + QUIET; r++) {
    let line = "";
    for (let c = -QUIET; c < grid.size + QUIET; c++) {
      const on =
        r >= 0 && c >= 0 && r < grid.size && c < grid.size && grid.m[r][c];
      line += on ? "##" : "  ";
    }
    console.log(line);
  }
  console.log("");
}

const { buf, px } = render(grid, flag("round"));
if (flag("png")) encodeFile(buf, px, `${OUT}.png`);
encodeFile(buf, px, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "1",
  "-compression_level",
  "6",
]);

console.log(
  `\nout  ${rel(OUT)}.webp  ${px}x${px}  ${kb(statSync(`${OUT}.webp`).size)}` +
    `   (${MODULE} px per module, ${QUIET}-module quiet zone)` +
    `\n     lossless on purpose: a resampled QR is a picture of a QR`,
);
