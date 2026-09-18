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
import { stream } from "../core/rng.js";

const rand = stream("sfx");

const ELEMENT = [
  { note: 196.0, type: "sawtooth", cut: 2000 },
  { note: 261.6, type: "sine", cut: 3200 },
  { note: 220.0, type: "triangle", cut: 2400 },
  { note: 329.6, type: "square", cut: 3600 },
  { note: 246.9, type: "sawtooth", cut: 1500 },
  { note: 392.0, type: "triangle", cut: 4400 },
];

const LADDER = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7];

const voice = (element) => ELEMENT[element] || ELEMENT[0];

const BURST_GAP = 0.26;
const BURST_KEEP = 3;

const bursts = new Map();

function burst(key, gap) {
  const t = Date.now() / 1000;
  const prev = bursts.get(key);
  const n =
    prev && t - prev.at < (gap === undefined ? BURST_GAP : gap)
      ? prev.n + 1
      : 1;
  bursts.set(key, { at: t, n });
  return n;
}

export function select() {
  if (samples.play("select")) return;
  tone({ freq: 680, to: 1020, dur: 0.08, gain: 0.1, type: "triangle" });
}

export function swap() {
  if (samples.play("swap")) return;
  noise({ freq: 900, to: 2600, dur: 0.13, gain: 0.09, q: 0.7 });
  tone({ freq: 300, to: 460, dur: 0.09, gain: 0.06, type: "sine" });
}

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
  noise({
    type: "highpass",
    freq: 1800 + step * 500,
    to: 6000,
    dur: 0.13,
    gain: 0.05,
  });
}

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

export function obsidianChip(count) {
  if (samples.play("obsBreak", { rate: 1.45, gain: 0.38 })) return;
  const n = Math.max(1, count || 1);
  noise({ type: "bandpass", freq: 1800, to: 900, dur: 0.14, gain: 0.12 });
  tone({
    freq: 240,
    to: 150,
    dur: 0.12,
    gain: 0.07,
    type: "square",
    cut: 1600,
  });
  for (let i = 1; i < Math.min(n, 3); i++) {
    noise({
      type: "bandpass",
      freq: 1500,
      to: 800,
      dur: 0.1,
      gain: 0.06,
      delay: i * 0.06,
    });
  }
}

export function obsidianBreak(count) {
  if (samples.play("obsBreak", { gain: 0.85 + Math.min(count, 4) * 0.08 })) {
    return;
  }
  const n = Math.max(1, count || 1);
  noise({ type: "highpass", freq: 2200, to: 5200, dur: 0.26, gain: 0.16 });
  tone({ freq: 320, to: 120, dur: 0.18, gain: 0.1, type: "square", cut: 2200 });
  for (let i = 1; i < Math.min(n, 5); i++) {
    tone({
      freq: 900 + rand() * 900,
      dur: 0.1,
      gain: 0.06,
      type: "triangle",
      delay: i * 0.05,
    });
  }
}

export function knock() {
  if (samples.play("knock")) return;
  tone({ freq: 140, to: 96, dur: 0.11, gain: 0.13, type: "sine", cut: 600 });
  noise({ type: "lowpass", freq: 600, to: 220, dur: 0.09, gain: 0.07 });
}

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

export function ultCall(element, gain) {
  const v = voice(element);
  const g = 0.05 * (gain === undefined ? 1 : gain);
  [1, 1.5].forEach((mul, i) => {
    tone({
      freq: v.note * 2 * mul,
      dur: 0.22,
      gain: g,
      type: "triangle",
      delay: i * 0.09,
      cut: 5200,
    });
  });
}

export function heroStrike(element, lead) {
  const n = burst("strike", 0.16);
  if (!lead && n > BURST_KEEP) return;
  const fade = lead ? 1 : 1 / n;
  const skew = lead ? 1 : 1 + (n - 1) * 0.06;
  if (
    samples.play("strike", {
      rate: samples.elementRate(element) * skew,
      gain: (lead ? 1.25 : 0.8) * fade,
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
    gain: (lead ? 0.16 : 0.07) * fade,
    type: v.type,
    cut: v.cut,
    cutTo: v.cut * 0.4,
  });
  noise({
    freq: 2600,
    to: 900,
    dur: lead ? 0.16 : 0.1,
    gain: (lead ? 0.07 : 0.03) * fade,
    q: 1.4,
  });
}

export function heroHurt() {
  const n = burst("hurt");
  if (n > BURST_KEEP) return;
  const fade = 1 / n;
  if (samples.play("hurt", { gain: fade, rate: 1 + (n - 1) * 0.08 })) return;
  tone({
    freq: 280 * (1 + (n - 1) * 0.08),
    to: 110,
    dur: 0.2,
    gain: 0.14 * fade,
    type: "sawtooth",
    cut: 1200,
  });
  noise({
    type: "bandpass",
    freq: 700,
    to: 300,
    dur: 0.16,
    gain: 0.1 * fade,
    q: 0.8,
  });
}

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
  tone({
    freq: 160,
    to: 55,
    dur: 0.3,
    gain: 0.2,
    type: "sine",
    delay: 0.6,
  });
}

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

export function bossBreath(hold) {
  const dur = 0.5 + (hold || 0.6);
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
  for (let i = 0; i < 4; i++) {
    noise({
      type: "highpass",
      freq: 2400,
      dur: 0.09,
      gain: 0.05,
      delay: 0.12 + i * 0.07 + rand() * 0.05,
    });
  }
}

export function bossHit(power) {
  const p = Math.max(0.3, Math.min(power || 1, 3));
  const n = burst("hit", 0.16);
  if (n > BURST_KEEP) return;
  const fade = 1 / n;
  if (
    samples.play("hit", {
      gain: (0.55 + p * 0.3) * fade,
      rate: (1.06 - p * 0.04) * (1 + (n - 1) * 0.07),
    })
  ) {
    return;
  }
  tone({
    freq: (190 + p * 30) * (1 + (n - 1) * 0.07),
    to: 70,
    dur: 0.16 + p * 0.05,
    gain: (0.09 + p * 0.05) * fade,
    type: "square",
    cut: 1600,
    cutTo: 500,
  });
  noise({
    type: "lowpass",
    freq: 2600,
    to: 500,
    dur: 0.18 + p * 0.05,
    gain: (0.07 + p * 0.04) * fade,
  });
}

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

export function bossMend(hold) {
  const dur = Math.max(0.6, hold === undefined ? 1.15 : hold);
  if (samples.play("mend", { rate: 1.1 / dur })) return;

  noise({
    type: "bandpass",
    freq: 320,
    to: 2400,
    dur: dur * 0.72,
    gain: 0.09,
    q: 0.7,
    attack: dur * 0.5,
  });
  [98, 146.8, 196].forEach((f, i) => {
    tone({
      freq: f,
      to: f * 1.34,
      dur: dur * 0.78,
      gain: 0.12,
      type: "sawtooth",
      delay: i * 0.05,
      cut: 1100,
      attack: dur * 0.42,
    });
  });
  [392, 587.3, 784].forEach((f, i) => {
    tone({
      freq: f * 0.75,
      to: f,
      dur: dur * 0.62,
      gain: 0.07,
      type: "sine",
      delay: dur * 0.2 + i * 0.07,
      cut: 5200,
    });
  });
  chord([196, 261.6, 392], {
    dur: dur * 0.5,
    gain: 0.1,
    type: "triangle",
    delay: dur * 0.6,
    cut: 3400,
  });
  tone({
    freq: 58,
    to: 44,
    dur: dur * 0.5,
    gain: 0.16,
    type: "sine",
    delay: dur * 0.62,
  });
}

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

const VO_DELAY = { victory: 0.45, defeat: 0.4 };

function outcomeVoice(which, at) {
  samples.play(`${which}Vo`, { delay: VO_DELAY[which] + at });
}

export function victory(at = 0) {
  outcomeVoice("victory", at);
  if (samples.play("victory", { delay: at })) return;
  [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.7,
      gain: 0.16,
      type: "triangle",
      delay: at + i * 0.11,
      cut: 6000,
    });
    tone({
      freq: f * 2,
      dur: 0.5,
      gain: 0.06,
      type: "sine",
      delay: at + i * 0.11,
    });
  });
}

export function defeat(at = 0) {
  outcomeVoice("defeat", at);
  if (samples.play("defeat", { delay: at })) return;
  [523.3, 466.2, 392.0, 311.1].forEach((f, i) => {
    tone({
      freq: f,
      dur: 0.8,
      gain: 0.15,
      type: "triangle",
      delay: at + i * 0.14,
      cut: 2200,
    });
  });
  tone({
    freq: 82,
    to: 55,
    dur: 1.2,
    gain: 0.16,
    type: "sine",
    delay: at + 0.2,
  });
}

export function banner() {
  if (samples.play("banner")) return;
  tone({ freq: 880, to: 1320, dur: 0.16, gain: 0.11, type: "triangle" });
  noise({ type: "highpass", freq: 3000, dur: 0.1, gain: 0.04 });
}

export function endcard(defeated) {
  if (samples.play("endcard", { rate: defeated ? 0.84 : 1 })) return;
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

const TICKS = ["cardA", "cardB", "cardC", "cardD"];

export function cardTick(index, at = 0) {
  const i = Math.max(0, Math.min(TICKS.length - 1, index | 0));
  if (samples.play(TICKS[i], { delay: at })) return;
  tone({
    freq: 620 + i * 90,
    to: 900 + i * 120,
    dur: 0.07,
    gain: 0.08,
    type: "triangle",
    delay: at,
  });
}

export function cardSnap(at = 0) {
  if (samples.play("cardPlate", { delay: at })) return;
  tone({
    freq: 260,
    to: 120,
    dur: 0.18,
    gain: 0.13,
    type: "triangle",
    cut: 1400,
    delay: at,
  });
  noise({
    type: "lowpass",
    freq: 1600,
    to: 400,
    dur: 0.16,
    gain: 0.08,
    delay: at,
  });
}

export function cardShine(at = 0) {
  if (samples.play("cardShine", { delay: at })) return;
  noise({
    type: "bandpass",
    freq: 1400,
    to: 6000,
    dur: 0.22,
    gain: 0.07,
    q: 0.8,
    attack: 0.08,
    delay: at,
  });
}

export function cardBack(at = 0) {
  if (samples.play("cardBack", { delay: at })) return;
  tone({
    freq: 340,
    to: 220,
    dur: 0.06,
    gain: 0.09,
    type: "square",
    cut: 1800,
    delay: at,
  });
}

export function cta() {
  if (samples.play("cta")) return;
  tone({ freq: 740, to: 1180, dur: 0.1, gain: 0.24, type: "triangle" });
  tone({ freq: 1180, dur: 0.12, gain: 0.18, type: "sine", delay: 0.08 });
}

let bedNodes = null;
let bedTension = -1;

onAudioReset(() => {
  bedNodes = null;
  bedTension = -1;
  bursts.clear();
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

  const hiss = c.createBufferSource();
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
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
    if (samples.room.start()) return;
    if (!AUDIO.bed) return;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return;
    if (bedNodes) {
      bedNodes.gain.gain.setTargetAtTime(AUDIO.bedLevel, c.currentTime, 1.2);
      return;
    }
    bedNodes = buildBed(c, out);
    bedNodes.gain.gain.setTargetAtTime(AUDIO.bedLevel, c.currentTime, 1.2);
  },

  setTension(v) {
    samples.room.setTension(v);
    if (!bedNodes) return;
    const t = Math.max(0, Math.min(1, v || 0));
    const step = Math.round(t * 12);
    if (step === bedTension) return;
    const c = audioContext();
    if (!c) return;
    bedTension = step;
    const at = c.currentTime;
    bedNodes.cut.frequency.setTargetAtTime(240 + t * 900, at, 0.6);
    bedNodes.gain.gain.setTargetAtTime(AUDIO.bedLevel * (1 + t * 1.4), at, 0.6);
  },

  stop() {
    samples.room.stop();
    if (!bedNodes) return;
    const c = audioContext();
    if (!c) return;
    bedNodes.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
  },
};
