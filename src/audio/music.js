/**
 * The fight's music — played, not loaded. The fallback now, not the plan.
 *
 * This file was the whole answer once, and the reasoning still holds on its own
 * terms: the deliverable is a single inlined index.html, thirty seconds of even
 * miserly 64 kbps mono is a quarter of a megabyte of MP3 that becomes a third
 * of a megabyte of base64 sitting in front of the first frame, and the whole
 * synth in engine.js costs eight kilobytes against this file's four. So the
 * theme was written as notes and played by the same oscillators the boss roars
 * through. See the header of engine.js — this was that argument carried one
 * step further, from noises to music.
 *
 * What changed is not the price but what it buys. Those bytes buy the game's
 * own score now instead of a generic loop: see tracks.js, which plays two cuts
 * out of the game this creative is selling for about 416 kB of the five
 * megabytes the spec allows, and which `music` at the foot of this file prefers
 * whenever a decoder will take them. Everything above that export is what plays
 * when one will not — a webview with no decodeAudioData, an MP3 it refuses, a
 * decode still running when the fight has already opened. Four kilobytes is a
 * cheap price for the difference between a scored creative and a silent one, so
 * the written theme stays in the build behind the recorded one.
 *
 * The one rule that shapes the code rather than the tune: no voice churn.
 * sfx.js allocates an oscillator per hit and pays for it out of a budget of
 * eighteen, which is the right trade for a sound that happens when a player
 * does something. Music happens whether or not anybody does anything — five
 * notes a second, forever — and an allocation per note would spend the whole
 * budget on the backing track and leave the cascade silent. So every layer here
 * is built once, runs for as long as the context lives, and is played by writing
 * envelopes onto parameters it already has. Nothing is created per note, and the
 * voice counter never sees this file at all.
 *
 * The tune, for anyone who has to change it: D harmonic minor at 138, eight
 * bars, i i VI VII i i VI V. Harmonic minor because its raised seventh is the
 * one interval that says siege without anybody having to be told, and V rather
 * than v in the last bar so the form pulls back to the top instead of merely
 * arriving there. The arrangement enters in stages across the eight bars —
 * drums, then bass, then strings, then the horn line — because a playable is
 * watched for forty seconds, and a loop that is complete in its first bar has
 * nothing left to give the other thirty-nine.
 */

import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioReset } from "./engine.js";
import { tracks } from "./tracks.js";

/** Floor for every exponential ramp — the curve cannot reach or pass zero. */
const MIN = 0.0001;

/** 138 BPM counted in eighths: the step every pattern below is written in. */
const STEP = 60 / 138 / 2;

/** Eighths to the bar, and bars to the form. */
const BAR = 8;
const BARS = 8;
const FORM = BAR * BARS;

/**
 * How far ahead of the clock notes are written, and how often we look.
 *
 * A timer cannot be trusted to fire on the beat — a phone throttles it, a
 * collection sits on it, and a note scheduled from inside the callback would
 * arrive audibly late. So the callback only ever writes notes that are still in
 * the future, and the audio clock plays them exactly on time. The look-ahead is
 * longer than five pumps, so a couple of skipped timers still leave the next
 * beat already written.
 */
const LOOK = 0.32;
const PUMP_MS = 60;

/**
 * The progression, one entry per bar.
 *
 * `bass` is the root down where a phone speaker cannot reach it — it is there
 * for headphones and for the harmonics it throws off, not for the cone. `tones`
 * are what the string stabs actually play, up in the register a two-centimetre
 * driver can move air in. Same rule as the sound palette in sfx.js.
 */
const CHORDS = [
  { bass: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm
  { bass: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm
  { bass: 58.27, tones: [116.54, 146.83, 174.61] }, // Bb
  { bass: 65.41, tones: [130.81, 164.81, 196.0] }, // C
  { bass: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm
  { bass: 73.42, tones: [146.83, 174.61, 220.0] }, // Dm
  { bass: 58.27, tones: [116.54, 146.83, 174.61] }, // Bb
  { bass: 55.0, tones: [110.0, 138.59, 164.81] }, // A — the raised seventh
];

/**
 * Where the root sits on each eighth of the bar, as a multiple of it.
 *
 * Three, three and two — the oldest war rhythm there is, and the reason the
 * pattern drives without a backbeat to push it. The octaves on the fourth and
 * the eighth are the push; the fifth on the seventh is the one place the line
 * leans somewhere other than home.
 */
const BASS = [1, 1, 1, 2, 1, 1, 1.5, 2];

/** Kick on that same three-three-two, and nothing else. */
const KICK = [0, 3, 6];

/** Toms fill the gaps the kick leaves rather than doubling it. */
const TOM = [2, 5];

/** Off-beat stabs: the bar's own pulse is the kick's, this is the answer. */
const STAB = [1, 3, 5, 7];

/**
 * The horn line, as [step in the form, frequency, length in steps].
 *
 * Written out rather than generated, because it is a tune: it climbs to the
 * fourth over the VI, falls through the raised seventh in the last bar and
 * lands on D as the form turns over. Bars five to eight only — by then the
 * player has been in the fight long enough for a melody to be a reward rather
 * than an introduction.
 */
const HORN = [
  [32, 440.0, 2],
  [34, 466.16, 1],
  [35, 440.0, 1],
  [36, 349.23, 2],
  [38, 392.0, 2],
  [40, 349.23, 3],
  [43, 329.63, 1],
  [44, 293.66, 4],
  [48, 466.16, 2],
  [50, 440.0, 2],
  [52, 392.0, 2],
  [54, 349.23, 2],
  [56, 329.63, 2],
  [58, 554.37, 2],
  [60, 587.33, 4],
];

let nodes = null;
let timer = null;
let step = 0;
let at = 0;
/** Quantized tension, so a per-frame call is not a per-frame ramp. */
let tension = -1;

onAudioReset(() => {
  // These nodes belong to a context that is closed. Let go of them, and let
  // start() build the graph again on whatever replaced it.
  if (timer) clearInterval(timer);
  timer = null;
  nodes = null;
  tension = -1;
});

/** Attack, hold, exponential fall — the envelope shape sfx.js is built on. */
function hit(param, t0, dur, peak, attack, hold) {
  const a = attack === undefined ? 0.004 : attack;
  const top = Math.max(MIN * 2, peak);
  const held = t0 + a + (hold || 0);
  param.setValueAtTime(MIN, t0);
  param.exponentialRampToValueAtTime(top, t0 + a);
  if (hold) param.setValueAtTime(top, held);
  param.exponentialRampToValueAtTime(MIN, Math.max(held + 0.02, t0 + dur));
}

/** Two seconds of noise on a loop: every drum in this file reads out of it. */
function noiseSource(c, dest) {
  const src = c.createBufferSource();
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start();
  return src;
}

function build(c, out) {
  const master = c.createGain();
  master.gain.value = MIN;
  master.connect(out);

  /* ------------------------------------------------------------------ kick */

  // One oscillator for every kick the fight will ever play. The pitch drop is
  // written onto its frequency at the moment of the hit; between hits the
  // envelope holds it at silence and it costs nothing but its own phase.
  const kickGain = c.createGain();
  kickGain.gain.value = MIN;
  kickGain.connect(master);
  const kick = c.createOscillator();
  kick.type = "sine";
  kick.frequency.value = 46;
  kick.connect(kickGain);
  kick.start();

  /* ----------------------------------------------------------------- drums */

  const tomGain = c.createGain();
  tomGain.gain.value = MIN;
  tomGain.connect(master);
  const tomBand = c.createBiquadFilter();
  tomBand.type = "bandpass";
  tomBand.frequency.value = 260;
  tomBand.Q.value = 1.4;
  tomBand.connect(tomGain);
  const tom = noiseSource(c, tomBand);

  // The shaker exists to make the last ten seconds of the doom clock feel
  // faster than the first, so it stays shut until setTension opens it.
  const hatGain = c.createGain();
  hatGain.gain.value = MIN;
  hatGain.connect(master);
  const hatLevel = c.createGain();
  hatLevel.gain.value = 0;
  hatLevel.connect(hatGain);
  const hatBand = c.createBiquadFilter();
  hatBand.type = "highpass";
  hatBand.frequency.value = 5200;
  hatBand.connect(hatLevel);
  const hat = noiseSource(c, hatBand);

  /* ------------------------------------------------------------------ bass */

  const bassGain = c.createGain();
  bassGain.gain.value = MIN;
  bassGain.connect(master);
  const bassCut = c.createBiquadFilter();
  bassCut.type = "lowpass";
  bassCut.frequency.value = 420;
  bassCut.Q.value = 0.8;
  bassCut.connect(bassGain);
  // Two saws a few cents apart rather than one: a single saw at this pitch is a
  // test tone, and the beating between the pair is the whole body of the sound.
  const bass = [0, 7].map((cents) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 73.42;
    o.detune.value = cents;
    o.connect(bassCut);
    o.start();
    return o;
  });

  /* --------------------------------------------------------------- strings */

  const strGain = c.createGain();
  strGain.gain.value = MIN;
  strGain.connect(master);
  const strCut = c.createBiquadFilter();
  strCut.type = "lowpass";
  strCut.frequency.value = 1250;
  strCut.Q.value = 0.9;
  strCut.connect(strGain);
  const strings = CHORDS[0].tones.map((f) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = 5;
    o.connect(strCut);
    o.start();
    return o;
  });

  /* ------------------------------------------------------------------ horn */

  const hornGain = c.createGain();
  hornGain.gain.value = MIN;
  hornGain.connect(master);
  const hornCut = c.createBiquadFilter();
  hornCut.type = "lowpass";
  hornCut.frequency.value = 2300;
  hornCut.Q.value = 0.7;
  hornCut.connect(hornGain);
  // Triangle for the note, and a quiet saw under it for the rasp. A horn is the
  // rasp; the triangle on its own is a flute, and a flute over war drums reads
  // as a lullaby.
  const hornRasp = c.createGain();
  hornRasp.gain.value = 0.35;
  hornRasp.connect(hornCut);
  const horn = ["triangle", "sawtooth"].map((type, i) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = 440;
    o.connect(i ? hornRasp : hornCut);
    o.start();
    return o;
  });

  /* ------------------------------------------------------------------- pad */

  // The only layer that never stops. It is what the room sounds like, and the
  // reason the gap between two bars is not silence.
  const padGain = c.createGain();
  padGain.gain.value = MIN;
  padGain.connect(master);
  const padCut = c.createBiquadFilter();
  padCut.type = "lowpass";
  padCut.frequency.value = 320;
  padCut.Q.value = 0.6;
  padCut.connect(padGain);
  const pad = [73.42, 110.0, 146.83].map((f) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(padCut);
    o.start();
    return o;
  });

  return {
    master,
    kick,
    kickGain,
    tom,
    tomGain,
    hat,
    hatLevel,
    hatGain,
    bass,
    bassCut,
    bassGain,
    strings,
    strCut,
    strGain,
    horn,
    hornCut,
    hornGain,
    pad,
    padCut,
    padGain,
  };
}

/**
 * Write one eighth note, to be played `t` seconds into the context's own clock.
 *
 * Every layer is written off the same step index, so the arrangement is a table
 * lookup rather than a state machine: which of the eight bars we are in decides
 * both the chord and which layers have entered yet.
 */
function play(n, i, t) {
  const bar = Math.floor(i / BAR) % BARS;
  const beat = i % BAR;
  const chord = CHORDS[bar];
  const last = bar === BARS - 1;

  /**
   * Layers enter across the first pass of the form and stay in from then on.
   *
   * The staging is an introduction, not a feature of the loop: dropping the
   * bass out for a bar every fourteen seconds would be a hole, and the second
   * one lands right about when the doom clock starts asking for more rather
   * than less. The turnaround fill is what marks the seam after that.
   */
  const entered = (b) => i >= FORM || bar >= b;

  /* Drums, from the first bar. Nothing waits for the drums. */
  if (KICK.indexOf(beat) !== -1) {
    // 118 down to 44 in a twelfth of a second: the drop is the drum. A sine
    // held at 46 is a hum; the same sine falling onto 46 is a hit.
    n.kick.frequency.setValueAtTime(118, t);
    n.kick.frequency.exponentialRampToValueAtTime(44, t + 0.085);
    hit(n.kickGain.gain, t, 0.3, 0.9, 0.003, 0.01);
  }
  if (TOM.indexOf(beat) !== -1) hit(n.tomGain.gain, t, 0.16, 0.32);
  // The fill: the last two eighths of the form get a sixteenth between them, so
  // the loop turns over on a roll rather than on a seam.
  if (last && beat >= 6) hit(n.tomGain.gain, t + STEP * 0.5, 0.12, 0.4);
  hit(n.hatGain.gain, t, 0.05, beat % 2 ? 0.5 : 0.85, 0.002);

  /* Bass, from the second bar. */
  if (entered(1)) {
    const f = chord.bass * BASS[beat];
    n.bass.forEach((o) => o.frequency.setValueAtTime(f, t));
    hit(n.bassGain.gain, t, STEP * 0.95, 0.5, 0.006, STEP * 0.35);
  }

  /* String stabs, from the third. */
  if (entered(2) && STAB.indexOf(beat) !== -1) {
    n.strings.forEach((o, k) => o.frequency.setValueAtTime(chord.tones[k], t));
    hit(n.strGain.gain, t, 0.15, 0.3, 0.008);
  }

  /* And the horn line, which is written against the form, not the bar. */
  const note = HORN.find((h) => h[0] === i % FORM);
  if (note) {
    n.horn.forEach((o) => o.frequency.setValueAtTime(note[1], t));
    const dur = note[2] * STEP;
    hit(n.hornGain.gain, t, dur * 0.92, 0.42, 0.03, dur * 0.5);
  }
}

/** Write every note inside the look-ahead, then get back out of the way. */
function pump() {
  const c = audioContext();
  if (!c || !nodes) return;
  const now = c.currentTime;
  // Fallen behind — a throttled timer, or a context that was parked while the
  // ad was off screen. Pick the beat up from here rather than firing the whole
  // backlog at once: either way the tempo stumbles, but only one of the two is
  // a burst of noise at somebody who just scrolled back.
  if (at < now) at = now + 0.05;
  while (at < now + LOOK) {
    play(nodes, step, at);
    step++;
    at += STEP;
  }
}

const synth = {
  start() {
    if (!AUDIO.music || nodes) return;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return;
    nodes = build(c, out);
    step = 0;
    at = c.currentTime + 0.12;
    // In over about three seconds. The fight opens on a roar and a board being
    // dealt; a theme that arrived at full level under those would be a third
    // thing shouting, and nobody would hear any of the three.
    nodes.master.gain.setTargetAtTime(AUDIO.musicLevel, c.currentTime, 1.4);
    nodes.padGain.gain.setTargetAtTime(0.5, c.currentTime, 1.4);
    pump();
    timer = setInterval(pump, PUMP_MS);
  },

  /**
   * The doom clock, as the arrangement hears it.
   *
   * @param {number} v 0 at the top of the clock, 1 when it is about to land
   */
  setTension(v) {
    if (!nodes) return;
    const t = Math.max(0, Math.min(1, v || 0));
    // Quantized for the same reason the bed's is: this is called every frame,
    // and a ramp per frame on one param is a stutter rather than a swell.
    const q = Math.round(t * 12);
    if (q === tension) return;
    tension = q;
    const c = audioContext();
    if (!c) return;
    const now = c.currentTime;
    // Four things at once, and all four say the same word. The strings open up,
    // the shaker arrives, the room brightens and the whole mix leans in — none
    // of them by much, because the clock is already on screen and the music
    // only has to agree with it.
    nodes.strCut.frequency.setTargetAtTime(1250 + t * 1750, now, 0.7);
    nodes.hatLevel.gain.setTargetAtTime(t > 0.25 ? 0.1 * t : 0, now, 0.8);
    nodes.padCut.frequency.setTargetAtTime(320 + t * 380, now, 0.7);
    nodes.master.gain.setTargetAtTime(
      AUDIO.musicLevel * (1 + t * 0.3),
      now,
      0.7,
    );
  },

  /** Out with the fight. The end card gets its own sound and nothing else. */
  stop() {
    if (!nodes) return;
    if (timer) clearInterval(timer);
    timer = null;
    const c = audioContext();
    if (!c) return;
    // Faded rather than cut, and the notes already written play out underneath
    // it: a theme that stops on a frame boundary is a bug the player can hear.
    nodes.master.gain.setTargetAtTime(MIN, c.currentTime, 0.6);
  },
};

/**
 * The theme, wherever this particular device turned out to be getting it from.
 *
 * Every call site talks to this and none of them knows which of the two is
 * playing, which is the point: `setTension` and the stops are addressed to both
 * and each is a no-op unless it is the one running. The only asymmetry is at
 * the start, where the recorded cut is asked for first and the written one is
 * what `request` falls back to.
 */
export const music = {
  /** The fight, from the first gesture. See main.js. */
  start() {
    if (!AUDIO.music) return;
    tracks.request("battle", () => synth.start());
  },

  /**
   * The fight is over and the card is coming up.
   *
   * This used to be a plain stop, on the argument that the end card gets its
   * own sound and nothing else. The argument was about the lava bed — a drone
   * under a store button is a drone nobody asked for — and it still retires the
   * bed and the written theme. What it no longer retires is the music, because
   * the game has a lobby theme and the lobby is exactly what the card is
   * offering: the cut crossfades under the wordmark rather than leaving the
   * badges in silence. Set `musicEndcard` false for placements that want the
   * card quiet, and this goes back to being a stop.
   */
  endcard() {
    // Whichever way the fight was scored, the written theme does not follow it
    // out: it is the fight's music and it has no second movement.
    synth.stop();
    if (AUDIO.music && AUDIO.musicEndcard) {
      tracks.request("endcard", () => tracks.stop());
    } else {
      tracks.stop();
    }
  },

  /**
   * The doom clock, as the arrangement hears it.
   *
   * @param {number} v 0 at the top of the clock, 1 when it is about to land
   */
  setTension(v) {
    tracks.setTension(v);
    synth.setTension(v);
  },

  /** Out with the fight, and nothing after it. */
  stop() {
    tracks.stop();
    synth.stop();
  },
};
