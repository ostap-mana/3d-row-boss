import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

const USAGE = `
pack-mend — the boss mend sting: the heal sound Invokers itself plays.

  node tools/pack-mend.mjs [--take 1|2|3] [--out <file>] [--keep-wav]

  TTM_HEAL_1..3 are the three takes the game randomises between for its
  healing totems (OGR049_Healing_Totem1/2, DEM550_Inv_Heal1, NEC004). Take 3
  is the default: it is the darkest of the three (centroid 1483 Hz against
  1866 and 2518), 78% of its energy sits in 120-300 Hz, and its crest is the
  latest at 0.55 s, which leaves the longest audible ramp into the moment the
  HP bar moves.

  Nothing is layered onto it, nothing is pitched and nothing is stretched.
  The sound is normalised, fenced with two short fades so the slice cannot
  click, and high-passed at 75 Hz — below that is headroom a phone will not
  reproduce and bits a 32 kbps encode should not spend.

  sfx.bossMend plays it at its native rate and delays the start, so the crest
  lands on the frame the HP bar moves on. MEND_ACCENT below is what that delay
  is computed from: seconds from the first audible sample to the crest. Feed it
  back into src/audio/sfx.js whenever the take changes.

  --take <n>      which heal take to ship, 1..3. Default 3.
  --out <file>    default: src/assets/audio/mend.mp3
  --keep-wav      also leave the 48 kHz master next to the mp3 output
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const SRC_DIR = join(ROOT, "masters/audio");
const out = resolve(ROOT, flag("out", "src/assets/audio/mend.mp3"));
const master = out.replace(/\.mp3$/, ".master.wav");

const take = Number(flag("take", 3));
if (![1, 2, 3].includes(take)) {
  process.stderr.write("--take must be 1, 2 or 3\n");
  process.exit(1);
}

const RATE_HZ = 32000;
const BITRATE = "32k";
const LEVEL = { 1: 1.82, 2: 2.45, 3: 2.37 }[take];

const source = join(SRC_DIR, `TTM_HEAL_${take}.wav`);
if (!existsSync(source)) {
  process.stderr.write(`missing ${source}\n`);
  process.exit(1);
}

const ff = (list) => execFileSync("ffmpeg", ["-v", "error", "-y", ...list]);

ff([
  "-i",
  source,
  "-af",
  [
    "highpass=f=75",
    "afade=t=in:st=0:d=0.012",
    "areverse,afade=t=in:st=0:d=0.04,areverse",
    `volume=${LEVEL}`,
  ].join(","),
  "-ar",
  "48000",
  "-ac",
  "1",
  master,
]);

ff([
  "-i",
  master,
  "-c:a",
  "libmp3lame",
  "-b:a",
  BITRATE,
  "-ar",
  String(RATE_HZ),
  "-ac",
  "1",
  out,
]);

const probe = out.replace(/\.mp3$/, ".probe.wav");
ff(["-i", out, "-ar", String(RATE_HZ), "-ac", "1", probe]);

function pcm(file) {
  const raw = readFileSync(file);
  let at = 12;
  let data = null;
  while (at + 8 <= raw.length) {
    const id = raw.toString("ascii", at, at + 4);
    const size = raw.readUInt32LE(at + 4);
    if (id === "data") {
      data = raw.subarray(at + 8, at + 8 + size);
      break;
    }
    at += 8 + size + (size & 1);
  }
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = data.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

const x = pcm(probe);
let peak = 0;
for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
const floor = peak * 0.01;
let head = 0;
for (let i = 0; i < x.length; i++) {
  if (Math.abs(x[i]) > floor) {
    head = i / RATE_HZ;
    break;
  }
}

const step = Math.round(RATE_HZ * 0.05);
let accent = 0;
let loudest = 0;
for (let i = 0; i + step <= x.length; i += step) {
  let sum = 0;
  for (let k = i; k < i + step; k++) sum += x[k] * x[k];
  const rms = Math.sqrt(sum / step);
  if (rms > loudest) {
    loudest = rms;
    accent = i / RATE_HZ;
  }
}

function tuned(name, key) {
  const text = readFileSync(join(ROOT, "src/config.js"), "utf8");
  const block = text.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  const m = block && block[1].match(new RegExp(`${key}:\\s*([0-9.]+)`));
  return m ? Number(m[1]) : 0;
}

const tail = x.length / RATE_HZ;
const span = tail - head;
const lead = accent - head;
const cast = tuned("DIFFICULTY", "cast") || tuned("MEND_FX", "seconds");
const hp = cast * tuned("MEND_FX", "peak");

process.stdout.write(
  [
    `mend sting -> ${out.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "")}`,
    `  TTM_HEAL_${take} as the game plays it, normalised and fenced only`,
    `  ${(statSync(out).size / 1024).toFixed(1)} kB · ${RATE_HZ} Hz mono · ${BITRATE}`,
    `  decoded ${tail.toFixed(3)}s · head ${head.toFixed(3)}s · peak ${peak.toFixed(3)}`,
    "",
    '  samples.js  mend: { bank: "mend", at: 0, dur: ' +
      span.toFixed(3) +
      ", gain: 0.26 }",
    `  sfx.js      MEND_ACCENT = ${lead.toFixed(3)}`,
    "",
    `  hp moves ${hp.toFixed(3)}s into a ${cast.toFixed(2)}s cast`,
    `  starts ${Math.max(0, hp - lead).toFixed(3)}s late so the crest lands on it`,
    `  sting ends ${(Math.max(0, hp - lead) + span).toFixed(3)}s into the cast`,
    "",
  ].join("\n"),
);

if (!args.includes("--keep-wav")) {
  execFileSync("cmd", ["/c", "del", "/q", master.replace(/\//g, "\\")]);
}
execFileSync("cmd", ["/c", "del", "/q", probe.replace(/\//g, "\\")]);
