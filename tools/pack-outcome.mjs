import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "masters/audio");
const OUT_DIR = join(ROOT, "src/assets/audio");
const OUT = join(OUT_DIR, "outcome.mp3");

const LEAD = 0.15;
const GAP = 0.12;
const TAIL = 0.2;

const PRE = 0.02;

const PEAK = -1.4;

const RATE = 32000;
const BITRATE = "64k";

const VOICE = {
  victory: "VO_ENG_CMN_00001.wav",
  defeat: "VO_ENG_CMN_00002.wav",
};

const CUTS = [
  {
    name: "victory",
    src: "DEMO_victory.wav",
    filter:
      "atrim=1.05:4.05,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.02,afade=t=out:st=2.3:d=0.7",
  },
  {
    name: "defeat",
    src: "ui_click_braam.wav",
    filter:
      "asetrate=48000*0.78,aresample=48000," +
      "atrim=0:2.6,asetpts=PTS-STARTPTS,afade=t=out:st=1.7:d=0.9",
  },
  {
    name: "victoryVo",
    src: VOICE.victory,
    filter:
      "atrim=0:1.2,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.015,afade=t=out:st=0.9:d=0.3",
  },
  {
    name: "defeatVo",
    src: VOICE.defeat,
    filter:
      "atrim=0:1.0,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.015,afade=t=out:st=0.72:d=0.28",
  },

  {
    name: "cardA",
    pre: PRE,
    src: "ui_click_add_2.wav",
    filter: "atrim=0:0.11,asetpts=PTS-STARTPTS,afade=t=out:st=0.065:d=0.045",
  },
  {
    name: "cardB",
    pre: PRE,
    src: "ui_click_add_3.wav",
    filter: "atrim=0:0.12,asetpts=PTS-STARTPTS,afade=t=out:st=0.075:d=0.045",
  },
  {
    name: "cardC",
    pre: PRE,
    src: "ui_click_add_1.wav",
    filter: "atrim=0:0.12,asetpts=PTS-STARTPTS,afade=t=out:st=0.075:d=0.045",
  },
  {
    name: "cardD",
    pre: PRE,
    src: "ui_click_tab_add.wav",
    filter: "atrim=0:0.12,asetpts=PTS-STARTPTS,afade=t=out:st=0.075:d=0.045",
  },
  {
    name: "cardPlate",
    pre: PRE,
    src: "ui_bottle.wav",
    filter: "atrim=0:0.24,asetpts=PTS-STARTPTS,afade=t=out:st=0.15:d=0.09",
  },

  {
    name: "cardShine",
    pre: PRE,
    src: "ui_click_high.wav",
    filter: "atrim=0:0.21,asetpts=PTS-STARTPTS,afade=t=out:st=0.15:d=0.06",
  },
  {
    name: "cardBack",
    pre: PRE,
    src: "ui_click_back_1.wav",
    filter: "atrim=0:0.05,asetpts=PTS-STARTPTS,afade=t=out:st=0.03:d=0.02",
  },
];

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function duration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

function peak(file) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || "");
  if (!m) throw new Error(`no max_volume for ${file}`);
  return Number(m[1]);
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const work = mkdtempSync(join(tmpdir(), "outcome-"));

try {
  const made = [];
  for (const cut of CUTS) {
    const src = join(SRC_DIR, cut.src);
    const raw = join(work, `${cut.name}-raw.wav`);
    const flat = join(work, `${cut.name}.wav`);

    ffmpeg([
      "-i",
      src,
      "-af",
      `aformat=channel_layouts=mono,${cut.filter}`,
      "-ar",
      String(RATE),
      "-ac",
      "1",
      raw,
    ]);

    const gain = PEAK - peak(raw);
    ffmpeg(["-i", raw, "-af", `volume=${gain.toFixed(2)}dB`, flat]);

    made.push({ ...cut, file: flat, dur: duration(flat), gain });
    if (flags.has("--wav"))
      copyFileSync(flat, join(OUT_DIR, `${cut.name}.wav`));
  }

  const inputs = [];
  const parts = [];
  let n = 0;
  const silence = (d) => {
    parts.push(
      `anullsrc=r=${RATE}:cl=mono,atrim=0:${d},asetpts=PTS-STARTPTS[s${n}]`,
    );
    return `[s${n++}]`;
  };
  const chain = [silence(LEAD)];
  made.forEach((m, i) => {
    inputs.push("-i", m.file);
    chain.push(`[${i}:a]`);
    if (i < made.length - 1) chain.push(silence(GAP));
  });
  chain.push(silence(TAIL));
  const graph =
    parts.join(";") +
    (parts.length ? ";" : "") +
    `${chain.join("")}concat=n=${chain.length}:v=0:a=1[out]`;

  mkdirSync(OUT_DIR, { recursive: true });
  ffmpeg([
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-b:a",
    BITRATE,
    "-write_xing",
    "1",
    OUT,
  ]);

  let at = 0;
  const rows = made.map((m, i) => {
    const pre = i === 0 ? 0 : m.pre || 0;
    const row = `  ${m.name}: { bank: "outcome", at: ${(at - pre).toFixed(3)}, dur: ${(m.dur + pre).toFixed(3)}, gain: ??? }, // ${m.src.replace(/\.wav$/, "")}`;
    at += m.dur + GAP;
    return row;
  });

  console.log(
    `${rel(OUT)} — ${kb(statSync(OUT).size)}, ${duration(OUT).toFixed(2)}s`,
  );
  for (const m of made) {
    console.log(
      `  ${m.name.padEnd(8)} ${m.dur.toFixed(2)}s  ${m.gain > 0 ? "+" : ""}${m.gain.toFixed(1)} dB  <- ${m.src}`,
    );
  }
  console.log("\nslices:");
  console.log(rows.join("\n"));
} finally {
  rmSync(work, { recursive: true, force: true });
}
