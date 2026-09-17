import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioOpen, onAudioReset } from "./engine.js";
import { loadAudio } from "./decode.js";
import spriteUrl from "../assets/audio/sfx.mp3";
import outcomeUrl from "../assets/audio/outcome.mp3";
import roomUrl from "../assets/audio/room.mp3";

const MIN = 0.0001;

const SLICES = {
  select: { at: 0, dur: 0.09, gain: 0.1 },
  swap: { at: 0.21, dur: 0.26, gain: 0.09 },
  reject: { at: 0.59, dur: 0.19, gain: 0.12 },
  match: { at: 0.9, dur: 0.42, gain: 0.16 },
  drop: { at: 1.44, dur: 0.55, gain: 0.12 },
  shuffle: { at: 2.11, dur: 0.7, gain: 0.1 },
  obsForm: { at: 2.93, dur: 0.65, gain: 0.16 },
  obsBreak: { at: 3.7, dur: 0.55, gain: 0.16 },
  knock: { at: 4.37, dur: 0.34, gain: 0.13 },
  combo: { at: 4.83, dur: 0.42, gain: 0.14 },
  charged: { at: 5.37, dur: 0.8, gain: 0.12 },
  strike: { at: 6.29, dur: 0.28, gain: 0.1 },
  hurt: { at: 6.69, dur: 0.3, gain: 0.12 },
  down: { at: 7.11, dur: 0.85, gain: 0.14 },
  heal: { at: 8.08, dur: 1.1, gain: 0.1 },
  cutin: { at: 9.3, dur: 1, gain: 0.18 },
  ult: { at: 10.42, dur: 1.6, gain: 0.3 },
  rise: { at: 12.14, dur: 1.1, gain: 0.24 },
  roar: { at: 13.36, dur: 1.7, gain: 0.3 },
  spit: { at: 15.18, dur: 0.85, gain: 0.16 },
  breath: { at: 16.15, dur: 1.2, gain: 0.14 },
  smash: { at: 17.47, dur: 1.2, gain: 0.3 },
  hit: { at: 18.79, dur: 0.5, gain: 0.14 },
  enrage: { at: 19.41, dur: 1.5, gain: 0.24 },
  die: { at: 21.03, dur: 1.9, gain: 0.3 },
  boom: { at: 23.05, dur: 1.4, gain: 0.26 },
  doomWarn: { at: 24.57, dur: 1, gain: 0.18 },
  doomCast: { at: 25.69, dur: 1.8, gain: 0.26 },
  victory: { bank: "outcome", at: 0, dur: 3.0, gain: 0.28 },
  defeat: { bank: "outcome", at: 3.12, dur: 2.6, gain: 0.22 },
  victoryVo: { bank: "outcome", at: 5.84, dur: 1.2, gain: 0.32 },
  defeatVo: { bank: "outcome", at: 7.16, dur: 1, gain: 0.36 },
  cardA: { bank: "outcome", at: 8.26, dur: 0.13, gain: 0.2 },
  cardB: { bank: "outcome", at: 8.49, dur: 0.14, gain: 0.2 },
  cardC: { bank: "outcome", at: 8.73, dur: 0.14, gain: 0.2 },
  cardD: { bank: "outcome", at: 8.97, dur: 0.14, gain: 0.2 },
  cardPlate: { bank: "outcome", at: 9.21, dur: 0.26, gain: 0.27 },
  cardShine: { bank: "outcome", at: 9.57, dur: 0.23, gain: 0.36 },
  cardBack: { bank: "outcome", at: 9.9, dur: 0.07, gain: 0.27 },
  banner: { at: 31.55, dur: 0.32, gain: 0.1 },
  endcard: { at: 31.99, dur: 1.6, gain: 0.16 },
  cta: { at: 33.71, dur: 0.12, gain: 0.18 },
};

const RATE = [1.0, 1.12, 1.26, 1.5, 1.68, 2.0, 2.24];

const ELEMENT_RATE = [0.86, 1.06, 0.94, 1.18, 1.0, 1.3];

let sprite = null;
let outcome = null;
let roomAudio = null;
const live = [];

let roomNodes = null;
let roomTension = -1;

if (AUDIO.sfxSamples) {
  loadAudio(spriteUrl).then((got) => {
    sprite = got;
  });
  loadAudio(outcomeUrl).then((got) => {
    outcome = got;
  });
  if (AUDIO.bed) {
    loadAudio(roomUrl).then((got) => {
      roomAudio = got;
    });
  }
}

onAudioReset(() => {
  live.length = 0;
  roomNodes = null;
  roomTension = -1;
});

function reap(c) {
  if (!live.length) return;
  const t = c.currentTime;
  let kept = 0;
  for (let i = 0; i < live.length; i++) {
    if (live[i] > t) live[kept++] = live[i];
  }
  live.length = kept;
}

export const samples = {
  enabled() {
    return !!AUDIO.sfxSamples;
  },

  ready() {
    return !!sprite;
  },

  play(name, o) {
    const s = SLICES[name];
    if (!AUDIO.sfxSamples || !s) return false;
    const bank = s.bank === "outcome" ? outcome : sprite;
    if (!bank) return false;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return false;
    reap(c);
    if (live.length >= AUDIO.maxVoices) return true;

    const opts = o || {};
    const gain = c.createGain();
    gain.gain.value =
      s.gain * (opts.gain === undefined ? 1 : opts.gain) * AUDIO.sfxSampleLevel;
    gain.connect(out);

    const src = c.createBufferSource();
    src.buffer = bank.buffer;
    if (opts.rate) src.playbackRate.value = opts.rate;
    src.connect(gain);
    const at = c.currentTime + (opts.delay || 0);
    try {
      src.start(at, bank.head + s.at, s.dur);
    } catch (e) {
      return false;
    }
    const until = at + s.dur / (opts.rate || 1) + 0.05;
    live.push(until);
    src.onended = () => {
      const i = live.indexOf(until);
      if (i >= 0) live.splice(i, 1);
    };
    return true;
  },

  rate(step) {
    return RATE[Math.max(0, Math.min(RATE.length - 1, step | 0))];
  },

  elementRate(element) {
    return ELEMENT_RATE[element] || ELEMENT_RATE[0];
  },

  room: {
    start() {
      if (!AUDIO.bed || !AUDIO.sfxSamples || roomNodes || !roomAudio)
        return false;
      const c = audioContext();
      const out = audioBus();
      if (!c || !out) return false;

      const gain = c.createGain();
      gain.gain.value = MIN;
      gain.connect(out);
      const cut = c.createBiquadFilter();
      cut.type = "lowpass";
      cut.frequency.value = 500;
      cut.Q.value = 0.7;
      cut.connect(gain);

      const src = c.createBufferSource();
      src.buffer = roomAudio.buffer;
      src.loop = true;
      src.loopStart = roomAudio.head;
      src.loopEnd = Math.min(
        roomAudio.head + AUDIO.roomLoop,
        roomAudio.buffer.duration,
      );
      src.connect(cut);
      try {
        src.start(c.currentTime + 0.02, roomAudio.head);
      } catch (e) {
        return false;
      }

      roomNodes = { src, gain, cut };
      roomTension = -1;
      gain.gain.setTargetAtTime(AUDIO.bedLevel, c.currentTime, 1.2);
      return true;
    },

    playing() {
      return !!roomNodes;
    },

    setTension(v) {
      if (!roomNodes) return;
      const t = Math.max(0, Math.min(1, v || 0));
      const step = Math.round(t * 12);
      if (step === roomTension) return;
      roomTension = step;
      const c = audioContext();
      if (!c) return;
      const at = c.currentTime;
      roomNodes.cut.frequency.setTargetAtTime(500 + t * 2100, at, 0.6);
      roomNodes.gain.gain.setTargetAtTime(
        AUDIO.bedLevel * (1 + t * 1.4),
        at,
        0.6,
      );
    },

    stop() {
      if (!roomNodes) return;
      const c = audioContext();
      if (!c) return;
      roomNodes.gain.gain.setTargetAtTime(MIN, c.currentTime, 0.5);
    },
  },
};

onAudioOpen(() => {
  if (AUDIO.bed && AUDIO.sfxSamples && !roomNodes) samples.room.start();
});
