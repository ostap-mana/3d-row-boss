import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

const USAGE = `
pack-mend — the boss mend sting, built from three Invokers magic swells.

  node tools/pack-mend.mjs [--out <file>] [--keep-wav]

  The boss heals itself over DIFFICULTY.mend.cast seconds and the HP bar only
  moves at cast * MEND_FX.peak. The sting has to put its accent on that frame,
  so it is assembled rather than cut: MGC_67 opens it, because it is the only
  one of the three audible inside the first 200 ms, while MGC_34 is still in
  digital silence; MGC_34 carries the body and its own crest is the accent;
  MGC_27's decay region is laid under the tail so the settle is recorded
  material and not just an imposed fade.

  findHead strips the inaudible lead-in, so the accent does not sit where the
  filter graph put it. sfx.bossMend rates the slice by MEND_ACCENT, the number
  this tool prints: buffer seconds from the first audible sample to the accent.
  Feed that number back into src/audio/sfx.js whenever the graph changes.

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

const LAYERS = ["MGC_67", "MGC_34", "MGC_27"];
for (const name of LAYERS) {
  const p = join(SRC_DIR, `${name}.wav`);
  if (!existsSync(p)) {
    process.stderr.write(`missing ${p}\n`);
    process.exit(1);
  }
}

const SPAN = 1.1;
const DECAY_FROM = 0.8;
const RATE_HZ = 32000;
const BITRATE = "32k";

const GRAPH = [
  "[0:a]atrim=0.10:1.20,asetpts=PTS-STARTPTS,volume=0.70,afade=t=in:st=0:d=0.06[open]",
  "[1:a]atrim=0:0.975,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.50:curve=cub,adelay=125[body]",
  "[2:a]atrim=0.95:1.45,asetpts=PTS-STARTPTS,volume=2.0,afade=t=in:st=0:d=0.05,adelay=720[settle]",
  "[open][body][settle]amix=inputs=3:normalize=0:dropout_transition=0," +
    "highpass=f=75,equalizer=f=760:t=o:w=1.5:g=4," +
    `atrim=0:${SPAN},asetpts=PTS-STARTPTS,` +
    `volume='exp(-max(0\\,t-${DECAY_FROM})*9.5)':eval=frame,` +
    "afade=t=in:st=0:d=0.012,afade=t=out:st=1.07:d=0.03,volume=1.41[mix]",
].join(";");

const ff = (list) => execFileSync("ffmpeg", ["-v", "error", "-y", ...list]);

ff([
  ...LAYERS.flatMap((name) => ["-i", join(SRC_DIR, `${name}.wav`)]),
  "-filter_complex",
  GRAPH,
  "-map",
  "[mix]",
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
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
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

const step = Math.round(RATE_HZ * 0.01);
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
    `  ${(statSync(out).size / 1024).toFixed(1)} kB · ${RATE_HZ} Hz mono · ${BITRATE}`,
    `  decoded ${tail.toFixed(3)}s · head ${head.toFixed(3)}s · peak ${peak.toFixed(3)}`,
    "",
    '  samples.js  mend: { bank: "mend", at: 0, dur: ' +
      span.toFixed(3) +
      ", gain: 0.26 }",
    `  sfx.js      MEND_ACCENT = ${lead.toFixed(3)}`,
    "",
    `  hp moves ${hp.toFixed(3)}s into a ${cast.toFixed(2)}s cast`,
    `  plays at rate ${(lead / hp).toFixed(4)} -> sting runs ${(span / (lead / hp)).toFixed(3)}s`,
    "",
  ].join("\n"),
);

if (!args.includes("--keep-wav")) {
  execFileSync("cmd", ["/c", "del", "/q", master.replace(/\//g, "\\")]);
}
execFileSync("cmd", ["/c", "del", "/q", probe.replace(/\//g, "\\")]);
