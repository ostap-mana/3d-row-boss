/**
 * Cut the two endings out of the game's own audio and pack them as one sprite.
 *
 *   node tools/pack-outcome.mjs           # -> src/assets/audio/outcome.mp3
 *   node tools/pack-outcome.mjs --wav     # keep the intermediate cuts too
 *
 * The fight can be won or lost, and until now neither ending sounded like one.
 * `victory` was 2.4 seconds of `ui_click_battle_horn` and `defeat` was 1.3 of
 * `ui_click_back_2` — a menu tab and a back button, borrowed because they were
 * already in the sprite. Both are UI clicks. Standing under a VICTORY banner
 * they read as a mis-fire, which is the one thing the last second of a playable
 * cannot afford: it is the second the player is deciding whether the game they
 * just saw is worth the install.
 *
 * So both are lifted from the game the ad is for, the way everything in
 * samples.js is:
 *
 *   victory  DEMO_victory      the demo's own victory stinger — 0.2 s of riser
 *                              into the hit at 1.25 s, sustaining to 3.1 s.
 *                              Cut from 1.05 s so the hit lands a fifth of a
 *                              second after the call and not a beat and a half.
 *   defeat   ui_click_braam    the braam, dropped a major third (0.78x, which
 *                              slows it as well as lowers it) and given the
 *                              tail it is not allowed at its own pitch. Same
 *                              horn `doomWarn` fires a second of higher up the
 *                              clock, which is the point — the thing that has
 *                              been threatening all fight is what lands.
 *
 * ## The voice
 *
 * Two more cuts, and they are the reason this file grew past the two stingers:
 * the game has a narrator, and the fight's two endings are the one place in a
 * twenty-six second creative where a voice is worth its bytes. A stinger says
 * *something happened*; the narrator says *which* thing, at the same instant
 * the banner spells it out. Under COPY.victory that is the game announcing its
 * own win in its own voice, which is the whole argument for lifting audio from
 * the build rather than synthesizing it.
 *
 *   victoryVo  }  two of the three VO_ENG_CMN lines in the game's VO in-game
 *   defeatVo   }  bank. See VOICE below for which, and for the note on why the
 *                 mapping is a constant rather than baked into CUTS.
 *
 * They are cut, not layered into the stingers: samples.js fires them as their
 * own one-shots behind `victory` and `defeat`, on a delay measured there, so
 * the gap between the hit and the word is tuned in the mix rather than frozen
 * into an encode. Levels are the stingers' own problem for the same reason.
 *
 * ## The card's rungs
 *
 * Five more cuts, and the same argument a third time. The end card assembles
 * part by part and each part landed on the *board's* select click — one 90 ms
 * cut resampled up a major sixth, five rungs of it, because it was the only
 * click in the sprite. Resampling is the problem: by the top rung the click is
 * 63 ms long and a fifth higher than anything else in the creative, which is
 * the sound of a sample being stretched rather than of a card being built.
 * `ui_click_tab` is also, still, the board's own tap — the last borrowed sound
 * on the last screen, after the two endings were re-cut off it.
 *
 * The game already has the sounds this wants. `ui_click_add_*` is its own
 * element-arrives click and it ships as three graded variants; `ui_click_tab_add`
 * is a fourth. Laid down darkest to brightest they climb on timbre instead of
 * on pitch, which is what the ladder was reaching for:
 *
 *   cardA  ui_click_add_2    3.2 kHz, the darkest and the tightest
 *   cardB  ui_click_add_3    4.7 kHz
 *   cardC  ui_click_add_1    6.9 kHz
 *   cardD  ui_click_tab_add  6.9 kHz and a longer decay — the top of the climb
 *   cardPlate  ui_bottle     1.3 kHz, 100 ms of decay, the only one with a body
 *
 * The plate is the rung the card is built around and the only part of it that
 * can be tapped, so it is not a click at all but a clack, and it is the game's
 * own — which is what let the synthesized body underneath it go away.
 *
 * They are appended after the endings rather than laid down among them, and
 * deliberately: `at` is measured from the first sample of the first cut, so
 * anything added at the end leaves victory, defeat and the two voice lines on
 * the offsets they were already verified at.
 *
 * Both are peak-normalized like everything else here, and both are trimmed to
 * the speech rather than to the file: the source lines carry a second of room
 * reverb past the last syllable, which is a second of a six-second sprite spent
 * on a tail nobody hears under a banner and a stinger.
 *
 * ## Why a second file rather than a slot in sfx.mp3
 *
 * The sprite is the right shape and its header makes the argument: an MP3 pays
 * a fixed toll on priming and padding at each end, and thirty-four tolls on
 * sounds that short would cost more than the sounds. Two more one-shots do not
 * change that arithmetic, and on a clean build these would live in it.
 *
 * What is in the way is that the sprite is a *deliverable*, not a source. The
 * thirty-three cuts inside it were made once, from offsets in the library that
 * were never written down, and the only copy of them is the encoded file.
 * Opening a slot at 27.6 s means decoding all thirty-three, re-cutting them,
 * re-concatenating and re-encoding — putting a second generation of MP3 on
 * thirty-one sounds that are finished, and moving every offset after the seam,
 * to save one file's worth of priming on a build that inlines everything into
 * a single index.html anyway. The two endings get their own 6 kB file, the
 * fight's palette is not touched, and samples.js grew a `bank` field to say
 * which of the two a slice is cut from.
 *
 * ## Levels
 *
 * Every cut in sfx.mp3 is peak-normalized to about -1.4 dBFS and carries its
 * place in the mix as `gain` in the SLICES table rather than as level in the
 * file. These are normalized to PEAK the same way for the same reason: the
 * table stays the one place the mix is balanced, and a re-cut with a different
 * source does not silently move a sound's weight.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

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
const SRC_DIR = join(ROOT, "src/source/audio");
const OUT_DIR = join(ROOT, "src/assets/audio");
const OUT = join(OUT_DIR, "outcome.mp3");

/**
 * The sprite's shape, in seconds.
 *
 * LEAD is the digital silence the file opens with, and it is not decoration:
 * `play` in samples.js starts every cut at `head + at`, where the head is found
 * at runtime rather than assumed — see findHead in decode.js — because an MP3
 * decoder is entitled to hand back a few milliseconds of its own priming at the
 * front. Silence at the head is what makes that search land on the first sample
 * of the first cut instead of somewhere inside it.
 *
 * GAP is the same 120 ms sfx.mp3 leaves between its cuts. A one-shot played
 * back slow — `endcard` runs at 0.92x on a loss — reads a little past its own
 * duration, and the gap is what it reads into. TAIL is the same courtesy at the
 * end of the file, where there is no next cut to run into.
 */
const LEAD = 0.15;
const GAP = 0.12;
const TAIL = 0.2;

/**
 * Seconds of the preceding gap a cut is allowed to claim, for its own pre-echo.
 *
 * An MP3 encoder spreads a sharp attack backwards. The transform window is
 * about 26 ms wide and the bit reservoir widens it further, so a click whose
 * energy is entirely in its first two milliseconds comes back out of the
 * decoder with a few milliseconds of that click sitting *in front of* where it
 * was laid down. Measured on the four card rungs here: cardA's attack begins
 * 10 ms before its own offset.
 *
 * A cut started exactly at its offset therefore plays from the middle of its
 * own transient, which on a click is most of the sound. So a cut may declare a
 * `pre` and the row printed for SLICES opens that much earlier and runs that
 * much longer — the end is where it always was, and what is claimed is silence
 * that was going to be gap anyway.
 *
 * It is per-cut rather than global because it costs something the long cuts
 * cannot pay. `victory` and `defeat` are aligned against the frame their word
 * lands on — see the note above `victory` in sfx.js and the offsets in
 * ui/outcome.js — and starting either 20 ms earlier moves its weight 20 ms
 * later against that frame. A click has no such appointment; a stinger does.
 * The first cut in the file needs none either way: findHead searches for the
 * first sample over one per cent of peak, so it lands on the pre-echo and the
 * whole table shifts with it.
 */
const PRE = 0.02;

/** Peak every cut is normalized to, in dBFS — sfx.mp3's own, near enough. */
const PEAK = -1.4;

/** Mono at 32 kHz and 64 kbps: what the other four files in the folder are. */
const RATE = 32000;
const BITRATE = "64k";

/**
 * The two cuts, in the order they are laid down.
 *
 * `filter` is everything that happens before the normalize pass, which is why
 * the fades are here and the gain is not: the fades are part of the shape of
 * the sound and the gain is measured off the result of them.
 *
 * The defeat cut is the reason `at`/`t` are inside the filter chain rather than
 * on the command line — `asetrate` is a re-labelling of the sample rate, so a
 * `-t` in front of it is measured in the source's seconds and a trim behind it
 * in the slowed ones. Only the second is the length of the sound.
 */
/**
 * Which narrator line is which ending.
 *
 * The game's VO in-game bank carries three unnamed English lines — 00001, 00002
 * and 00004, with 00003 absent from the build — and nothing shipped alongside
 * them says what they are. The FMOD strings bank does name the events
 * (`UI/InGame/Victory`, `UI/InGame/Defeat`, `VO/Gameplay/Narrator/TitanCharge`)
 * but it is prefix-compressed and carries no mapping from event to asset; the
 * il2cpp metadata hardcodes the Lobby events and not these; the build has no
 * subtitles. So the three were transcribed instead, with faster-whisper
 * small.en and medium.en agreeing:
 *
 *   00001  "Victory!"
 *   00002  "Defeat"
 *   00004  "Titan charged"  — a gameplay call, not an ending; unused here
 *
 * Worth writing down because the shapes mislead. 00004 is the three-syllable
 * one and the obvious guess for VIC-TO-RY, and it is TI-TAN-CHARGED; picking it
 * by ear puts a gameplay line under the VICTORY banner. If either name here
 * changes, transcribe rather than audition — then re-run and paste the printed
 * rows into SLICES.
 */
const VOICE = {
  victory: "VO_ENG_CMN_00001.wav",
  defeat: "VO_ENG_CMN_00002.wav",
};

const CUTS = [
  {
    name: "victory",
    src: "DEMO_victory.wav",
    /**
     * 1.05 s in, for 3.0. The stinger's swell starts at 0.27 and the hit is at
     * 1.25, so this opens a fifth of a second before the hit with the swell
     * already at -13 dB — loud enough that findHead lands on the first sample
     * of the cut rather than partway into it, which is what keeps `at: 0`
     * honest. Out at 4.05 with the last 0.7 faded: the sustain is done by 3.1
     * and what follows is room, and the end card arrives 1.4 s after the call
     * with a stinger of its own to arrive over.
     */
    filter:
      "atrim=1.05:4.05,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.02,afade=t=out:st=2.3:d=0.7",
  },
  {
    name: "defeat",
    src: "ui_click_braam.wav",
    /**
     * The braam at 0.78x — a major third down, and a third longer with it. Its
     * own tail runs dry at 3.75 s and is thin well before that, so the cut ends
     * at 2.6 with a 0.9 s fade over the part that was going to fade anyway.
     * Long enough to still be under COPY.defeat, short enough to be gone before
     * the end card.
     */
    filter:
      "asetrate=48000*0.78,aresample=48000," +
      "atrim=0:2.6,asetpts=PTS-STARTPTS,afade=t=out:st=1.7:d=0.9",
  },
  {
    name: "victoryVo",
    src: VOICE.victory,
    /**
     * The word, and nothing after it. silencedetect at -38 dB puts the last
     * syllable out at 0.90 s, and what follows is the room the line was
     * recorded in. Out at 1.20 with the last 0.30 faded, which keeps the decay
     * that makes it sound like a hall and drops the third of a second that is
     * only noise floor. The 15 ms fade in is for the trim edge, not the sound:
     * the line starts on a syllable rather than on silence, and a cut that
     * opens mid-waveform is a click.
     */
    filter:
      "atrim=0:1.2,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.015,afade=t=out:st=0.9:d=0.3",
  },
  {
    name: "defeatVo",
    src: VOICE.defeat,
    /** Same treatment, and a shorter line: two syllables, out by 0.75 s. */
    filter:
      "atrim=0:1.0,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.015,afade=t=out:st=0.72:d=0.28",
  },

  /*
   * The card's four light rungs, darkest first — see "The card's rungs" above.
   *
   * All four sources are 185 ms files whose sound is over inside twenty: what
   * follows the click is the room it was recorded in, and under a card being
   * assembled at a rung every tenth of a second that room is the next rung's
   * lead-in. So each is trimmed to 120 ms with the last 45 faded, which keeps
   * the whole decay and drops only floor. They open on the transient — every
   * one of them is at half power inside four milliseconds — so there is no fade
   * in to put on them; a fade over an attack that fast is an attack removed.
   */
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
    /**
     * The clack, and the one cut here with a tail worth keeping: 100 ms of it,
     * an octave and a half below the four clicks. Out at 240 ms with the last
     * 90 faded, which is past the decay and short of the room behind it.
     */
    filter: "atrim=0:0.24,asetpts=PTS-STARTPTS,afade=t=out:st=0.15:d=0.09",
  },
];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/** Seconds of audio in a file, as ffprobe reads them. */
function duration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

/**
 * The loudest sample in a file, in dBFS.
 *
 * volumedetect writes to stderr at info level, so the log level is lifted for
 * this one call and the answer is read back out of the noise.
 */
function peak(file) {
  // spawnSync rather than execFileSync because the answer comes back on stderr
  // on a clean exit, which execFileSync only hands over when the exit is not.
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || "");
  if (!m) throw new Error(`no max_volume for ${file}`);
  return Number(m[1]);
}

/* --------------------------------------------------------------------- pack */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const work = mkdtempSync(join(tmpdir(), "outcome-"));

try {
  const made = [];
  for (const cut of CUTS) {
    const src = join(SRC_DIR, cut.src);
    const raw = join(work, `${cut.name}-raw.wav`);
    const flat = join(work, `${cut.name}.wav`);

    // Shape first, at the source's own rate and width, so the fades and the
    // resample of the pitch drop are done before anything is thrown away.
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

    // Then normalize, which is a second pass because the gain to apply is
    // measured off the first one.
    const gain = PEAK - peak(raw);
    ffmpeg(["-i", raw, "-af", `volume=${gain.toFixed(2)}dB`, flat]);

    made.push({ ...cut, file: flat, dur: duration(flat), gain });
    if (flags.has("--wav"))
      copyFileSync(flat, join(OUT_DIR, `${cut.name}.wav`));
  }

  // One graph rather than a concat demuxer: the silences are generated, and
  // anullsrc has no length of its own to give a demuxer to line up against.
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

  // The table samples.js wants, with `at` measured from the first sample of the
  // first cut and not from the head of the file — see SLICES over there.
  let at = 0;
  const rows = made.map((m, i) => {
    // See PRE. The first cut is the one the head is found on and cannot back
    // off; everything else opens into the gap behind it by as much as it asked.
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
