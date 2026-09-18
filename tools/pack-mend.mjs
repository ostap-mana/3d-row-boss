import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

const USAGE = `
pack-mend — the boss mend sting, cut from one Invokers magic swell.

  node tools/pack-mend.mjs [--out <file>] [--layered] [--keep-wav]

  MGC_27 is the sound as the build plays it: nothing is layered onto it and
  nothing is pitched, only a trim, two fades and a normalise. It was picked
  because its own gesture is already the one the moment needs — it climbs for
  0.65 s, crests, crests again a quarter second later, and falls 26 dB on its
  own — and because 67% of its energy sits below 120 Hz, which puts it in the
  boss's register rather than the heroes'.

  sfx.bossMend plays it at its native rate and delays the start instead, so the
  crest lands on the frame the HP bar moves on. MEND_ACCENT below is what that
  delay is computed from: seconds from the first audible sample to the crest.
  Feed it back into src/audio/sfx.js whenever the trim changes.

  --layered       build the three-layer version instead (MGC_67 opens, MGC_34
                  carries the body, MGC_27 lays a recorded decay under the
                  tail). Denser and better synced, but it is an assembly rather
                  than a sound the game itself plays.
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
const layered = args.includes("--layered");

const RATE_HZ = 32000;
const BITRATE = "32k";

const STRAIGHT = {
  layers: ["MGC_27"],
  graph:
    "[0:a]atrim=0.03:1.43,asetpts=PTS-STARTPTS," +
    "highpass=f=75,afade=t=in:st=0:d=0.018,afade=t=out:st=1.35:d=0.05," +
    "volume=1.78[mix]",
};

const LAYERED = {
  layers: ["MGC_67", "MGC_34", "MGC_27"],
  graph: [
    "[0:a]atrim=0.10:1.20,asetpts=PTS-STARTPTS,volume=0.70,afade=t=in:st=0:d=0.06[open]",
    "[1:a]atrim=0:0.975,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.50:curve=cub,adelay=125[body]",
    "[2:a]atrim=0.95:1.45,asetpts=PTS-STARTPTS,volume=2.0,afade=t=in:st=0:d=0.05,adelay=720[settle]",
    "[open][body][settle]amix=inputs=3:normalize=0:dropout_transition=0," +
      "highpass=f=75,equalizer=f=760:t=o:w=1.5:g=4," +
      "atrim=0:1.1,asetpts=PTS-STARTPTS," +
      "volume='exp(-max(0\\,t-0.8)*9.5)':eval=frame," +
      "afade=t=in:st=0:d=0.012,afade=t=out:st=1.07:d=0.03,volume=1.41[mix]",
  ].join(";"),
};

const recipe = layered ? LAYERED : STRAIGHT;

for (const name of recipe.layers) {
  const p = join(SRC_DIR, `${name}.wav`);
  if (!existsSync(p)) {
    process.stderr.write(`missing ${p}\n`);
    process.exit(1);
  }
}

const ff = (list) => execFileSync("ffmpeg", ["-v", "error", "-y", ...list]);

ff([
  ...recipe.layers.flatMap((name) => ["-i", join(SRC_DIR, `${name}.wav`)]),
  "-filter_complex",
  recipe.graph,
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
  const pcmOut = new Float32Array(data.length / 2);
  for (let i = 0; i < pcmOut.length; i++) {
    pcmOut[i] = data.readInt16LE(i * 2) / 32768;
  }
  return pcmOut;
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
    `  ${recipe.layers.join(" + ")}${layered ? "" : " straight, trim and fades only"}`,
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
