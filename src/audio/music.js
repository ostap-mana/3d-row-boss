import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioPark, onAudioReset } from "./engine.js";
import { tracks } from "./tracks.js";
import { stream } from "../core/rng.js";

const rand = stream("music");

const MIN = 0.0001;

const STEP = 60 / 138 / 2;

const BAR = 8;
const BARS = 8;
const FORM = BAR * BARS;

const LOOK = 0.32;
const PUMP_MS = 60;

const CHORDS = [
  { bass: 73.42, tones: [146.83, 174.61, 220.0] },
  { bass: 73.42, tones: [146.83, 174.61, 220.0] },
  { bass: 58.27, tones: [116.54, 146.83, 174.61] },
  { bass: 65.41, tones: [130.81, 164.81, 196.0] },
  { bass: 73.42, tones: [146.83, 174.61, 220.0] },
  { bass: 73.42, tones: [146.83, 174.61, 220.0] },
  { bass: 58.27, tones: [116.54, 146.83, 174.61] },
  { bass: 55.0, tones: [110.0, 138.59, 164.81] },
];

const BASS = [1, 1, 1, 2, 1, 1, 1.5, 2];

const KICK = [0, 3, 6];

const TOM = [2, 5];

const STAB = [1, 3, 5, 7];

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
let tension = -1;
let playing = false;

onAudioReset(() => {
  if (timer) clearInterval(timer);
  timer = null;
  nodes = null;
  tension = -1;
  playing = false;
});

onAudioPark((asleep) => {
  if (asleep) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  if (playing && nodes && !timer) timer = setInterval(pump, PUMP_MS);
});

function hit(param, t0, dur, peak, attack, hold) {
  const a = attack === undefined ? 0.004 : attack;
  const top = Math.max(MIN * 2, peak);
  const held = t0 + a + (hold || 0);
  param.setValueAtTime(MIN, t0);
  param.exponentialRampToValueAtTime(top, t0 + a);
  if (hold) param.setValueAtTime(top, held);
  param.exponentialRampToValueAtTime(MIN, Math.max(held + 0.02, t0 + dur));
}

function noiseSource(c, dest) {
  const src = c.createBufferSource();
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
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

  const kickGain = c.createGain();
  kickGain.gain.value = MIN;
  kickGain.connect(master);
  const kick = c.createOscillator();
  kick.type = "sine";
  kick.frequency.value = 46;
  kick.connect(kickGain);
  kick.start();

  const tomGain = c.createGain();
  tomGain.gain.value = MIN;
  tomGain.connect(master);
  const tomBand = c.createBiquadFilter();
  tomBand.type = "bandpass";
  tomBand.frequency.value = 260;
  tomBand.Q.value = 1.4;
  tomBand.connect(tomGain);
  const tom = noiseSource(c, tomBand);

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

  const bassGain = c.createGain();
  bassGain.gain.value = MIN;
  bassGain.connect(master);
  const bassCut = c.createBiquadFilter();
  bassCut.type = "lowpass";
  bassCut.frequency.value = 420;
  bassCut.Q.value = 0.8;
  bassCut.connect(bassGain);
  const bass = [0, 7].map((cents) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 73.42;
    o.detune.value = cents;
    o.connect(bassCut);
    o.start();
    return o;
  });

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

  const hornGain = c.createGain();
  hornGain.gain.value = MIN;
  hornGain.connect(master);
  const hornCut = c.createBiquadFilter();
  hornCut.type = "lowpass";
  hornCut.frequency.value = 2300;
  hornCut.Q.value = 0.7;
  hornCut.connect(hornGain);
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

function play(n, i, t) {
  const bar = Math.floor(i / BAR) % BARS;
  const beat = i % BAR;
  const chord = CHORDS[bar];
  const last = bar === BARS - 1;

  const entered = (b) => i >= FORM || bar >= b;

  if (KICK.indexOf(beat) !== -1) {
    n.kick.frequency.setValueAtTime(118, t);
    n.kick.frequency.exponentialRampToValueAtTime(44, t + 0.085);
    hit(n.kickGain.gain, t, 0.3, 0.9, 0.003, 0.01);
  }
  if (TOM.indexOf(beat) !== -1) hit(n.tomGain.gain, t, 0.16, 0.32);
  if (last && beat >= 6) hit(n.tomGain.gain, t + STEP * 0.5, 0.12, 0.4);
  hit(n.hatGain.gain, t, 0.05, beat % 2 ? 0.5 : 0.85, 0.002);

  if (entered(1)) {
    const f = chord.bass * BASS[beat];
    n.bass.forEach((o) => o.frequency.setValueAtTime(f, t));
    hit(n.bassGain.gain, t, STEP * 0.95, 0.5, 0.006, STEP * 0.35);
  }

  if (entered(2) && STAB.indexOf(beat) !== -1) {
    n.strings.forEach((o, k) => o.frequency.setValueAtTime(chord.tones[k], t));
    hit(n.strGain.gain, t, 0.15, 0.3, 0.008);
  }

  const note = HORN.find((h) => h[0] === i % FORM);
  if (note) {
    n.horn.forEach((o) => o.frequency.setValueAtTime(note[1], t));
    const dur = note[2] * STEP;
    hit(n.hornGain.gain, t, dur * 0.92, 0.42, 0.03, dur * 0.5);
  }
}

function pump() {
  const c = audioContext();
  if (!c || !nodes) return;
  const now = c.currentTime;
  if (at < now) at = now + 0.05;
  while (at < now + LOOK) {
    play(nodes, step, at);
    step++;
    at += STEP;
  }
}

const synth = {
  start() {
    if (!AUDIO.music) return;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return;
    if (nodes && playing) return;
    if (!nodes) nodes = build(c, out);
    step = 0;
    at = c.currentTime + 0.12;
    tension = -1;
    nodes.master.gain.cancelScheduledValues(c.currentTime);
    nodes.master.gain.setTargetAtTime(AUDIO.musicLevel, c.currentTime, 1.4);
    nodes.padGain.gain.setTargetAtTime(0.5, c.currentTime, 1.4);
    playing = true;
    pump();
    if (!timer) timer = setInterval(pump, PUMP_MS);
  },

  setTension(v) {
    if (!nodes) return;
    const t = Math.max(0, Math.min(1, v || 0));
    const q = Math.round(t * 12);
    if (q === tension) return;
    tension = q;
    const c = audioContext();
    if (!c) return;
    const now = c.currentTime;
    nodes.strCut.frequency.setTargetAtTime(1250 + t * 1750, now, 0.7);
    nodes.hatLevel.gain.setTargetAtTime(t > 0.25 ? 0.1 * t : 0, now, 0.8);
    nodes.padCut.frequency.setTargetAtTime(320 + t * 380, now, 0.7);
    nodes.master.gain.setTargetAtTime(
      AUDIO.musicLevel * (1 + t * 0.3),
      now,
      0.7,
    );
  },

  stop() {
    if (!nodes) return;
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    const c = audioContext();
    if (!c) return;
    nodes.master.gain.cancelScheduledValues(c.currentTime);
    nodes.master.gain.setTargetAtTime(MIN, c.currentTime, 0.6);
  },
};

export const music = {
  start() {
    if (!AUDIO.music) return;
    tracks.request("battle", () => synth.start());
  },

  endcard() {
    synth.stop();
    if (AUDIO.music && AUDIO.musicEndcard) {
      tracks.request("endcard", () => tracks.stop());
    } else {
      tracks.stop();
    }
  },

  setTension(v) {
    tracks.setTension(v);
    synth.setTension(v);
  },

  stop() {
    tracks.stop();
    synth.stop();
  },
};
