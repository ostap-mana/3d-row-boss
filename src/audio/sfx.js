/**
 * Every sound the fight makes, in one place.
 *
 * The rule the palette is built on: a phone speaker is a two-centimetre cone
 * with nothing under about 400 Hz. Everything that has to read as *heavy* — the
 * boss's fists, the cataclysm, obsidian landing — carries its weight in filtered
 * noise and low harmonics rather than in a deep sine that only a pair of
 * headphones will ever hear. The sub is still there underneath for the players
 * who have them; nothing depends on it.
 *
 * The other rule: the board is the instrument. Matches are tuned, not sampled —
 * a cascade walks up a pentatonic ladder, so a four-step combo is a phrase that
 * resolves rather than the same pop four times. Everything the boss does is
 * deliberately untuned against that, all noise and detuning, so the two sides of
 * the fight never sound like each other.
 *
 * Both rules describe what plays when the game's own recordings cannot. Every
 * function below opens by offering the event to samples.js, which fires the
 * sound the real game makes and reports whether it did; what follows the guard
 * is the synthesized version, unchanged, for the webview that would not decode
 * an MP3 and for anyone who sets `sfxSamples` false. The palette here is
 * therefore still the whole palette — it is just no longer the first choice.
 */

import { AUDIO } from "../config.js";
import {
  audioBus,
  audioContext,
  chord,
  noise,
  onAudioReset,
  tone,
} from "./engine.js";
import { samples } from "./samples.js";

/**
 * A voice per element, so a hero's attack sounds like their colour.
 *
 * Fire growls, water is round and clean, nature is woody, lightning buzzes,
 * arcane sits dark and detuned, wind is thin and airy. Indexed by the element
 * constants in config.js, and appended to in the same order.
 */
const ELEMENT = [
  { note: 196.0, type: "sawtooth", cut: 2000 },
  { note: 261.6, type: "sine", cut: 3200 },
  { note: 220.0, type: "triangle", cut: 2400 },
  { note: 329.6, type: "square", cut: 3600 },
  { note: 246.9, type: "sawtooth", cut: 1500 },
  { note: 392.0, type: "triangle", cut: 4400 },
];

/**
 * The cascade ladder: one note per step, pentatonic so no two rungs can clash.
 *
 * A player who chains four steps hears a rising figure, which is the whole
 * reason the combo counter is worth chasing. It tops out rather than climbing
 * forever — past the sixth step it would be shrill on a phone speaker.
 */
const LADDER = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7];

const voice = (element) => ELEMENT[element] || ELEMENT[0];

/* ------------------------------------------------------------------ board */

/** Tap-select: the smallest sound in the creative, and the most frequent. */
export function select() {
  if (samples.play("select")) return;
  tone({ freq: 680, to: 1020, dur: 0.08, gain: 0.1, type: "triangle" });
}

/** Two gems changing places — a short cloth whoosh, not a click. */
export function swap() {
  if (samples.play("swap")) return;
  noise({ freq: 900, to: 2600, dur: 0.13, gain: 0.09, q: 0.7 });
  tone({ freq: 300, to: 460, dur: 0.09, gain: 0.06, type: "sine" });
}

/**
 * A swap that made nothing.
 *
 * A wooden knock, deliberately not a buzzer: the board answers a bad move with
 * a nudge and the hand coming back, and a failure tone on top of that would be
 * the one moment in the fight that tells the player off.
 */
export function reject() {
  if (samples.play("reject")) return;
  tone({
    freq: 210,
    to: 150,
    dur: 0.14,
    gain: 0.13,
    type: "triangle",
    cut: 900,
  });
}

/**
 * A match clearing.
 *
 * @param {number} step which rung of the cascade this is — the pitch
 * @param {number} cells how many gems went, which decides how full the chord is
 * @param {number} element the colour that led the clear, which decides the tone
 */
export function match(step, cells, element) {
  if (
    samples.play("match", {
      rate: samples.rate(step) * samples.elementRate(element),
      gain: 0.8 + Math.min(cells, 8) * 0.04,
    })
  ) {
    return;
  }
  const root = LADDER[Math.min(step, LADDER.length) - 1];
  const v = voice(element);
  const notes =
    cells >= 5
      ? [root, root * 1.5, root * 2]
      : cells >= 4
        ? [root, root * 1.5]
        : [root];

  chord(notes, {
    type: v.type === "square" ? "triangle" : v.type,
    dur: 0.26 + step * 0.02,
    gain: 0.16,
    attack: 0.004,
    cut: v.cut,
    cutTo: v.cut * 0.5,
  });
  // The sparkle over the top, brighter every step.
  noise({
    type: "highpass",
    freq: 1800 + step * 500,
    to: 6000,
    dur: 0.13,
    gain: 0.05,
  });
}

/** The whole cascade landing back down. One thunk for the wave, not per gem. */
export function drop(count) {
  if (samples.play("drop", { gain: 0.8 + Math.min(count, 12) * 0.03 })) return;
  if (!count) return;
  const weight = Math.min(1, count / 8);
  tone({
    freq: 150,
    to: 82,
    dur: 0.12,
    gain: 0.05 + weight * 0.07,
    type: "sine",
  });
  noise({
    type: "lowpass",
    freq: 700,
    to: 260,
    dur: 0.14,
    gain: 0.04 + weight * 0.05,
  });
}

/** A dead board being dealt again — a shimmer walking up the ladder. */
export function shuffle() {
  if (samples.play("shuffle")) return;
  LADDER.slice(0, 5).forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.22,
      gain: 0.09,
      type: "triangle",
      delay: i * 0.055,
      cut: 4000,
    });
  });
}

/** Obsidian hardening over a cell. */
export function obsidianForm(count) {
  if (samples.play("obsForm", { gain: 0.85 + Math.min(count, 4) * 0.08 })) {
    return;
  }
  const n = Math.max(1, count || 1);
  tone({
    freq: 180,
    to: 62,
    dur: 0.34,
    gain: 0.16,
    type: "sawtooth",
    cut: 700,
  });
  noise({ type: "lowpass", freq: 1400, to: 200, dur: 0.36, gain: 0.16 });
  // One extra crust per block after the first, so a four-block wave is heavier
  // than a one-block one without being four separate sounds.
  for (let i = 1; i < Math.min(n, 4); i++) {
    noise({
      type: "lowpass",
      freq: 900,
      to: 180,
      dur: 0.2,
      gain: 0.07,
      delay: i * 0.07,
    });
  }
}

/** A block cracking open — the one genuinely bright sound the board makes. */
export function obsidianBreak(count) {
  if (samples.play("obsBreak", { gain: 0.85 + Math.min(count, 4) * 0.08 })) {
    return;
  }
  const n = Math.max(1, count || 1);
  noise({ type: "highpass", freq: 2200, to: 5200, dur: 0.26, gain: 0.16 });
  tone({ freq: 320, to: 120, dur: 0.18, gain: 0.1, type: "square", cut: 2200 });
  for (let i = 1; i < Math.min(n, 5); i++) {
    tone({
      freq: 900 + Math.random() * 900,
      dur: 0.1,
      gain: 0.06,
      type: "triangle",
      delay: i * 0.05,
    });
  }
}

/** A thumb dragging a block that will not move. */
export function knock() {
  if (samples.play("knock")) return;
  tone({ freq: 140, to: 96, dur: 0.11, gain: 0.13, type: "sine", cut: 600 });
  noise({ type: "lowpass", freq: 600, to: 220, dur: 0.09, gain: 0.07 });
}

/* ------------------------------------------------------------------ heroes */

/** A hero's bar filling: their own note, arpeggiated up an octave. */
export function charged(element) {
  if (samples.play("charged", { rate: samples.elementRate(element) })) return;
  const v = voice(element);
  [1, 1.5, 2].forEach((mul, i) => {
    tone({
      freq: v.note * 2 * mul,
      dur: 0.3,
      gain: 0.13,
      type: "triangle",
      delay: i * 0.07,
      cut: 5000,
    });
  });
}

/**
 * A hero swinging.
 *
 * Fired once per standing hero per cascade step, staggered fifty milliseconds
 * apart — so it has to be short, quiet and different enough per element that six
 * of them in a row read as a squad and not as a stutter.
 *
 * @param {boolean} lead the hero whose colour was actually matched
 */
export function heroStrike(element, lead) {
  if (
    samples.play("strike", {
      rate: samples.elementRate(element),
      gain: lead ? 1.25 : 0.8,
    })
  ) {
    return;
  }
  const v = voice(element);
  tone({
    freq: v.note * (lead ? 4 : 3),
    to: v.note * (lead ? 1.5 : 2),
    dur: lead ? 0.22 : 0.14,
    bend: lead ? 0.16 : 0.1,
    gain: lead ? 0.16 : 0.07,
    type: v.type,
    cut: v.cut,
    cutTo: v.cut * 0.4,
  });
  noise({
    freq: 2600,
    to: 900,
    dur: lead ? 0.16 : 0.1,
    gain: lead ? 0.07 : 0.03,
    q: 1.4,
  });
}

/** A hero eating a hit. */
export function heroHurt() {
  if (samples.play("hurt")) return;
  tone({
    freq: 280,
    to: 110,
    dur: 0.2,
    gain: 0.14,
    type: "sawtooth",
    cut: 1200,
  });
  noise({ type: "bandpass", freq: 700, to: 300, dur: 0.16, gain: 0.1, q: 0.8 });
}

/** A hero going down: the same fall, slower and further. */
export function heroDown() {
  if (samples.play("down")) return;
  tone({
    freq: 220,
    to: 82,
    dur: 0.55,
    gain: 0.15,
    type: "triangle",
    cut: 900,
  });
  tone({
    freq: 174,
    to: 65,
    dur: 0.6,
    gain: 0.1,
    type: "sine",
    delay: 0.06,
  });
}

/** The tide picking the party back up. */
export function heal() {
  if (samples.play("heal")) return;
  [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.5,
      gain: 0.1,
      type: "sine",
      delay: i * 0.08,
      cut: 6000,
    });
  });
  noise({ type: "highpass", freq: 3000, to: 7000, dur: 0.5, gain: 0.04 });
}

/* --------------------------------------------------------------- the ult */

/** The cut-in: a riser that has to pay off in ultBlast half a second later. */
export function ultCutin(element) {
  if (samples.play("cutin", { rate: samples.elementRate(element) })) return;
  const v = voice(element);
  tone({
    freq: v.note * 0.5,
    to: v.note * 4,
    dur: 0.62,
    gain: 0.14,
    type: "sawtooth",
    attack: 0.12,
    cut: 800,
    cutTo: 6000,
  });
  noise({
    type: "bandpass",
    freq: 400,
    to: 5000,
    dur: 0.6,
    gain: 0.09,
    q: 0.6,
  });
  // The slam the portrait lands on.
  tone({
    freq: 160,
    to: 55,
    dur: 0.3,
    gain: 0.2,
    type: "sine",
    delay: 0.6,
  });
}

/** The ultimate landing on the boss. The biggest sound in the fight. */
export function ultBlast(element) {
  if (samples.play("ult", { rate: samples.elementRate(element) })) {
    samples.play("boom", { delay: 0.06, gain: 0.7 });
    return;
  }
  const v = voice(element);
  tone({ freq: 120, to: 40, dur: 0.7, gain: 0.26, type: "sine" });
  tone({
    freq: v.note * 2,
    to: v.note * 0.5,
    dur: 0.5,
    gain: 0.16,
    type: v.type,
    cut: 3000,
    cutTo: 500,
  });
  noise({ type: "lowpass", freq: 5000, to: 300, dur: 0.75, gain: 0.2 });
  chord([v.note * 2, v.note * 3, v.note * 4], {
    dur: 0.5,
    gain: 0.1,
    type: "triangle",
    delay: 0.06,
    cut: 5000,
  });
}

/* -------------------------------------------------------------- the boss */

/** Climbing out of the lava. */
export function bossRise() {
  if (samples.play("rise")) return;
  tone({ freq: 46, to: 34, dur: 1.1, gain: 0.24, type: "sine", attack: 0.3 });
  noise({
    type: "lowpass",
    freq: 180,
    to: 700,
    dur: 1.1,
    gain: 0.14,
    attack: 0.4,
  });
}

/** The roar: detuned, filthy, and the loudest thing the boss owns. */
export function bossRoar() {
  if (samples.play("roar")) return;
  [0, -14, 11].forEach((detune, i) => {
    tone({
      freq: 104,
      to: 78,
      dur: 0.8,
      gain: i === 0 ? 0.2 : 0.11,
      type: "sawtooth",
      detune,
      attack: 0.05,
      cut: 1100,
      cutTo: 420,
    });
  });
  noise({
    type: "bandpass",
    freq: 500,
    to: 240,
    dur: 0.85,
    gain: 0.15,
    q: 0.5,
  });
  tone({ freq: 58, to: 40, dur: 0.9, gain: 0.16, type: "sine" });
}

/** The wind-up before lava lands on the board. */
export function bossSpit() {
  if (samples.play("spit")) return;
  noise({
    type: "bandpass",
    freq: 300,
    to: 1600,
    dur: 0.28,
    gain: 0.12,
    q: 0.8,
  });
  tone({ freq: 90, to: 150, dur: 0.24, gain: 0.1, type: "sawtooth", cut: 900 });
}

/** A cone of fire over the party — a held hiss with a fire rumble under it. */
export function bossBreath(hold) {
  const dur = 0.5 + (hold || 0.6);
  // Stretched to the length the fight asked for rather than cut off at it: the
  // cut is 1.2 s of held fire and the hold is whatever the attack needs.
  if (samples.play("breath", { rate: 1.2 / dur })) return;
  noise({
    type: "bandpass",
    freq: 700,
    to: 2000,
    dur,
    gain: 0.17,
    q: 0.5,
    attack: 0.14,
    hold: dur * 0.4,
  });
  noise({ type: "lowpass", freq: 400, to: 180, dur, gain: 0.12, attack: 0.2 });
  tone({ freq: 70, to: 52, dur, gain: 0.12, type: "sawtooth", cut: 500 });
}

/** Both fists into the floor. */
export function bossSmash() {
  if (samples.play("smash")) return;
  tone({ freq: 130, to: 38, dur: 0.55, gain: 0.28, type: "sine" });
  tone({
    freq: 220,
    to: 60,
    dur: 0.3,
    gain: 0.14,
    type: "sawtooth",
    cut: 1400,
  });
  noise({ type: "lowpass", freq: 3000, to: 200, dur: 0.6, gain: 0.2 });
  // Debris skittering off the impact.
  for (let i = 0; i < 4; i++) {
    noise({
      type: "highpass",
      freq: 2400,
      dur: 0.09,
      gain: 0.05,
      delay: 0.12 + i * 0.07 + Math.random() * 0.05,
    });
  }
}

/** The boss taking a hit. `power` is the same number the flinch is scaled by. */
export function bossHit(power) {
  const p = Math.max(0.3, Math.min(power || 1, 3));
  if (samples.play("hit", { gain: 0.55 + p * 0.3, rate: 1.06 - p * 0.04 })) {
    return;
  }
  tone({
    freq: 190 + p * 30,
    to: 70,
    dur: 0.16 + p * 0.05,
    gain: 0.09 + p * 0.05,
    type: "square",
    cut: 1600,
    cutTo: 500,
  });
  noise({
    type: "lowpass",
    freq: 2600,
    to: 500,
    dur: 0.18 + p * 0.05,
    gain: 0.07 + p * 0.04,
  });
}

/** The tell that the fight just got worse. */
export function bossEnrage() {
  if (samples.play("enrage")) return;
  [155.6, 220].forEach((f, i) => {
    tone({
      freq: f,
      to: f * 1.5,
      dur: 0.5,
      gain: 0.14,
      type: "sawtooth",
      delay: i * 0.03,
      cut: 1800,
    });
  });
  noise({ type: "highpass", freq: 1200, to: 4000, dur: 0.4, gain: 0.08 });
}

/** Dying: a groan, an explosion, and the crumble after it. */
export function bossDie() {
  if (samples.play("die")) {
    samples.play("boom", { delay: 0.18 });
    return;
  }
  tone({ freq: 110, to: 30, dur: 1.4, gain: 0.24, type: "sawtooth", cut: 900 });
  tone({ freq: 70, to: 26, dur: 1.5, gain: 0.18, type: "sine" });
  noise({ type: "lowpass", freq: 4000, to: 120, dur: 1.5, gain: 0.22 });
  noise({
    type: "bandpass",
    freq: 900,
    to: 250,
    dur: 0.9,
    gain: 0.1,
    delay: 0.5,
    q: 0.6,
  });
}

/* ----------------------------------------------------------------- the fight */

/** The combo callout, one rung above the match that earned it. */
export function combo(step) {
  if (samples.play("combo", { rate: samples.rate(step) })) return;
  const root = LADDER[Math.min(step + 1, LADDER.length) - 1];
  chord([root, root * 1.25, root * 1.5], {
    dur: 0.34,
    gain: 0.12,
    type: "triangle",
    cut: 6000,
    spread: 0.03,
  });
}

/**
 * The doom clock's warnings.
 * @param {number} level 0 is the first warning, 1 and up are the panic ones
 */
export function doomWarn(level) {
  const base = level > 0 ? 740 : 620;
  if (
    samples.play("doomWarn", {
      rate: level > 0 ? 1.18 : 1,
      gain: level > 0 ? 1.15 : 1,
    })
  ) {
    return;
  }
  [0, 0.16].forEach((d) => {
    tone({
      freq: base,
      dur: 0.13,
      gain: 0.13,
      type: "square",
      delay: d,
      cut: 2600,
    });
  });
}

/** The cataclysm: charge, then the whole screen. */
export function doomCast() {
  if (samples.play("doomCast")) return;
  tone({
    freq: 90,
    to: 700,
    dur: 0.55,
    gain: 0.16,
    type: "sawtooth",
    attack: 0.2,
    cut: 600,
    cutTo: 4000,
  });
  noise({
    type: "bandpass",
    freq: 300,
    to: 4000,
    dur: 0.55,
    gain: 0.1,
    q: 0.7,
  });
  tone({ freq: 150, to: 32, dur: 1, gain: 0.3, type: "sine", delay: 0.55 });
  noise({
    type: "lowpass",
    freq: 5000,
    to: 150,
    dur: 1,
    gain: 0.24,
    delay: 0.55,
  });
}

/** The boss falls: a major arpeggio with a bell on top. */
export function victory() {
  if (samples.play("victory")) return;
  [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.7,
      gain: 0.16,
      type: "triangle",
      delay: i * 0.11,
      cut: 6000,
    });
    tone({
      freq: f * 2,
      dur: 0.5,
      gain: 0.06,
      type: "sine",
      delay: i * 0.11,
    });
  });
}

/** The party falls: the same shape, minor and going the other way. */
export function defeat() {
  if (samples.play("defeat")) return;
  [523.3, 466.2, 392.0, 311.1].forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.8,
      gain: 0.15,
      type: "triangle",
      delay: i * 0.14,
      cut: 2200,
    });
  });
  tone({ freq: 82, to: 55, dur: 1.2, gain: 0.16, type: "sine", delay: 0.2 });
}

/** The install banner sliding in. */
export function banner() {
  if (samples.play("banner")) return;
  tone({ freq: 880, to: 1320, dur: 0.16, gain: 0.11, type: "triangle" });
  noise({ type: "highpass", freq: 3000, dur: 0.1, gain: 0.04 });
}

/** The end card arriving. */
export function endcard(defeated) {
  if (samples.play("endcard", { rate: defeated ? 0.92 : 1 })) return;
  if (defeated) {
    tone({
      freq: 196,
      to: 147,
      dur: 0.9,
      gain: 0.14,
      type: "triangle",
      cut: 1800,
    });
    return;
  }
  chord([392, 523.3, 659.3], {
    dur: 0.9,
    gain: 0.13,
    type: "triangle",
    cut: 6000,
    spread: 0.05,
  });
  noise({ type: "highpass", freq: 2000, to: 7000, dur: 0.6, gain: 0.05 });
}

/** The tap that leaves for the store. */
export function cta() {
  if (samples.play("cta")) return;
  tone({ freq: 740, to: 1180, dur: 0.1, gain: 0.16, type: "triangle" });
  tone({ freq: 1180, dur: 0.12, gain: 0.12, type: "sine", delay: 0.08 });
}

/* --------------------------------------------------------------- the bed */

/**
 * The lava under everything.
 *
 * Two detuned saws through a lowpass and a band of noise over them — not music,
 * a room. It exists so that the gaps between beats are not silence, and it is
 * mixed low enough that nothing else has to fight it.
 *
 * `setTension` opens the filter as the doom clock runs down, which is the one
 * piece of the mix that tells the player something the screen has not already.
 */
let bedNodes = null;
let bedTension = -1;

// The nodes belong to the context that made them. If that context is thrown
// away — see rebuild in engine.js — the bed has to forget its own, or start()
// looks at a set of dead nodes, decides it is already running, and the room
// goes quiet for the rest of the session.
onAudioReset(() => {
  bedNodes = null;
  bedTension = -1;
});

function buildBed(c, out) {
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.connect(out);

  const cut = c.createBiquadFilter();
  cut.type = "lowpass";
  cut.frequency.value = 240;
  cut.Q.value = 0.7;
  cut.connect(gain);

  const oscs = [55, 55.4, 82.5].map((f, i) => {
    const o = c.createOscillator();
    o.type = i === 2 ? "triangle" : "sawtooth";
    o.frequency.value = f;
    o.connect(cut);
    o.start();
    return o;
  });

  // The hiss of the pool, kept under the saws rather than beside them.
  const hiss = c.createBufferSource();
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  hiss.buffer = buf;
  hiss.loop = true;
  const hissCut = c.createBiquadFilter();
  hissCut.type = "bandpass";
  hissCut.frequency.value = 420;
  hissCut.Q.value = 0.5;
  const hissGain = c.createGain();
  hissGain.gain.value = 0.35;
  hiss.connect(hissCut);
  hissCut.connect(hissGain);
  hissGain.connect(gain);
  hiss.start();

  // Slow swell, so the room breathes instead of humming.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain);
  lfoGain.connect(cut.frequency);
  lfo.start();

  return { gain, cut, oscs, hiss, lfo };
}

export const bed = {
  start() {
    // The game's own volcano first — see samples.room, which is the same room
    // recorded rather than built, and which fails the same way everything else
    // in this file does.
    // `playing` as well as `start`: samples.js starts the room from its own
    // onAudioOpen hook, which can land before this does, and without the first
    // half of this test the synthesized bed would start underneath it.
    if (samples.room.playing() || samples.room.start()) return;
    if (!AUDIO.bed || bedNodes) return;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return;
    bedNodes = buildBed(c, out);
    bedNodes.gain.gain.setTargetAtTime(AUDIO.bedLevel, c.currentTime, 1.2);
  },

  /**
   * @param {number} v 0 at the top of the clock, 1 when it is about to land
   */
  setTension(v) {
    samples.room.setTension(v);
    if (!bedNodes) return;
    const t = Math.max(0, Math.min(1, v || 0));
    // Quantized: this is called every frame and a ramp per frame on the same
    // param is a stutter, not a swell.
    const step = Math.round(t * 12);
    if (step === bedTension) return;
    bedTension = step;
    const c = audioContext();
    const at = c.currentTime;
    bedNodes.cut.frequency.setTargetAtTime(240 + t * 900, at, 0.6);
    bedNodes.gain.gain.setTargetAtTime(AUDIO.bedLevel * (1 + t * 1.4), at, 0.6);
  },

  stop() {
    samples.room.stop();
    if (!bedNodes) return;
    const c = audioContext();
    bedNodes.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
  },
};
