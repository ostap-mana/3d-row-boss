import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";

const USAGE = `
pack-heal — the party heal sting: the heal sound Invokers itself plays.

  node tools/pack-heal.mjs [--take 1|2|3] [--out <file>] [--keep-wav]

  Same three takes as the boss mend — TTM_HEAL_1..3, the healing totems the
  game randomises between. The boss already owns take 3, the darkest of them
  (centroid 1537 Hz). The party takes 1, the brightest at 2089 Hz, so a hero
  being mended and the boss mending itself never read as the same event.

  Nothing is layered onto it, nothing is pitched and nothing is stretched.
  The sound is normalised, fenced with two short fades so the slice cannot
  click, and high-passed at 75 Hz — below that is headroom a phone will not
  reproduce and bits a 32 kbps encode should not spend.

  The party heals once for the whole row, so this plays flat: no delay, no
  crest to hit. What the tool does work out is the gain that leaves the mix
  where it was, by matching the sting against the sprite slice it replaces.
  Feed the printed line into src/audio/samples.js.

  --take <n>      which heal take to ship, 1..3. Default 1.
  --out <file>    default: src/assets/audio/heal.mp3
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
const out = resolve(ROOT, flag("out", "src/assets/audio/heal.mp3"));
const master = out.replace(/\.mp3$/, ".master.wav");

const take = Number(flag("take", 1));
if (![1, 2, 3].includes(take)) {
  process.stderr.write("--take must be 1, 2 or 3\n");
  process.exit(1);
}

const RATE_HZ = 32000;
const BITRATE = "32k";
const LEVEL = { 1: 1.82, 2: 2.45, 3: 2.37 }[take];

const WAS = { bank: "sfx", at: 8.08, dur: 1.1, gain: 0.1 };

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

const before = out.replace(/\.mp3$/, ".before.wav");
ff([
  "-ss",
  String(WAS.at),
  "-t",
  String(WAS.dur),
  "-i",
  join(ROOT, "src/assets/audio/sfx.mp3"),
  "-ar",
  String(RATE_HZ),
  "-ac",
  "1",
  before,
]);

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

function rms(x) {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, x.length));
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

const tail = x.length / RATE_HZ;
const span = tail - head;

const loudNow = rms(x);
const loudWas = rms(pcm(before));
const gain = (loudWas * WAS.gain) / Math.max(1e-9, loudNow);
const db = 20 * Math.log10(loudNow / Math.max(1e-9, loudWas));

process.stdout.write(
  [
    `heal sting -> ${out.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, "")}`,
    `  TTM_HEAL_${take} as the game plays it, normalised and fenced only`,
    `  ${(statSync(out).size / 1024).toFixed(1)} kB · ${RATE_HZ} Hz mono · ${BITRATE}`,
    `  decoded ${tail.toFixed(3)}s · head ${head.toFixed(3)}s · peak ${peak.toFixed(3)}`,
    "",
    `  it lands ${db.toFixed(1)} dB over the sprite slice it replaces,`,
    `  so the gain that leaves the mix where it was is ${gain.toFixed(3)}`,
    "",
    '  samples.js  heal: { bank: "heal", at: 0, dur: ' +
      span.toFixed(3) +
      ", gain: " +
      gain.toFixed(3) +
      " }",
    "",
  ].join("\n"),
);

if (!args.includes("--keep-wav")) unlinkSync(master);
unlinkSync(probe);
unlinkSync(before);
