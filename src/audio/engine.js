import { AUDIO } from "../config.js";
import { promoteSession, sessionSleep } from "./session.js";
import { stream } from "../core/rng.js";

const rand = stream("audio-engine");

const MIN = 0.0001;

const NOISE_SECONDS = 2;

const STUBBORN_MS = 1200;

const REBUILD_GAP_MS = 4000;

const MOVE_GAP_MS = 120;

const PARK_FADE = 0.04;
const WAKE_FADE = 0.14;
const BEAT_MS = 200;
const WATCH_HOLD = 1.1;
const WATCH_FALL = 0.45;
const DOZE_MS = 1300;
const DOZE_GAP_MS = 400;

const now = () => Date.now();

let ctx = null;
let bus = null;
let master = null;
let noiseBuf = null;
const live = [];
let muted = false;
let parked = false;
let parkTimer = null;
let fadeUntil = 0;
let beatAt = 0;
let dozed = false;
let framedAt = 0;
let dozeTimer = null;
let opened = false;
let watching = false;
let gestured = false;
const openCbs = [];
const resetCbs = [];
const roomCbs = [];
const parkCbs = [];
let refusedAt = 0;
let rebuiltAt = 0;
let building = false;

function host() {
  return typeof window === "undefined" ? null : window;
}

function hidden() {
  return typeof document !== "undefined" && document.hidden;
}

function fire(list, arg) {
  list.slice().forEach((fn) => {
    try {
      fn(arg);
    } catch (e) {}
  });
}

function opening() {
  if (opened) return;
  opened = true;
  refusedAt = 0;
  fire(openCbs);
}

function watch(c) {
  if (watching || typeof c.addEventListener !== "function") return;
  watching = true;
  c.addEventListener("statechange", () => {
    if (c !== ctx) return;
    if (c.state === "running") {
      opening();
      return;
    }
    if (c.state === "interrupted" && opened) {
      hardMute();
      if (!parked) {
        parked = true;
        fire(parkCbs, true);
      }
      staleRefusal();
    }
  });
}

function context() {
  if (ctx || !AUDIO.on) return ctx;
  if (building) return null;
  const w = host();
  if (!w) return null;
  if (!gestured) return null;
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;

  promoteSession(w);

  building = true;
  try {
    ctx = new Ctor();
  } catch (e) {
    fire(roomCbs);
    try {
      ctx = new Ctor();
    } catch (e2) {
      building = false;
      return null;
    }
  }
  building = false;

  promoteSession(w);
  watch(ctx);

  bus = ctx.createDynamicsCompressor();
  bus.threshold.value = -16;
  bus.knee.value = 22;
  bus.ratio.value = 9;
  bus.attack.value = 0.003;
  bus.release.value = 0.2;

  master = ctx.createGain();
  master.gain.value = muted ? 0 : AUDIO.master;

  bus.connect(master);
  master.connect(ctx.destination);

  if (ctx.state === "running") opening();
  return ctx;
}

export function audioContext() {
  return context();
}

export function audioBus() {
  context();
  return bus;
}

function audioReady() {
  return !!ctx && ctx.state === "running";
}

export function audioParked() {
  return parked;
}

export function onAudioOpen(fn) {
  openCbs.push(fn);
  if (audioReady()) fn();
}

export function onAudioReset(fn) {
  resetCbs.push(fn);
}

export function onAudioNeedsRoom(fn) {
  roomCbs.push(fn);
}

export function onAudioPark(fn) {
  parkCbs.push(fn);
}

function rebuild() {
  const dead = ctx;
  ctx = null;
  bus = null;
  master = null;
  noiseBuf = null;
  parked = false;
  dozed = false;
  fadeUntil = 0;
  beatAt = 0;
  if (parkTimer) {
    clearTimeout(parkTimer);
    parkTimer = null;
  }
  live.length = 0;
  opened = false;
  watching = false;
  refusedAt = 0;
  rebuiltAt = now();
  fire(resetCbs);
  if (dead) {
    try {
      const p = dead.close();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  return context();
}

function unlockAudio() {
  if (!activated()) return false;
  gestured = true;
  promoteSession(host());
  let c = context();
  if (!c) return false;
  if (c.state === "running") {
    refusedAt = 0;
    if (!opened) opening();
    return true;
  }

  const t = now();
  if (!refusedAt) refusedAt = t;
  if (
    !hidden() &&
    t - refusedAt > STUBBORN_MS &&
    t - rebuiltAt > REBUILD_GAP_MS
  ) {
    c = rebuild();
    if (!c) return false;
    if (c.state === "running") return true;
  }

  if (c.resume) {
    try {
      c.resume().catch(() => {});
    } catch (e) {}
  }

  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch (e) {}

  return c.state === "running";
}

const GESTURES = [
  "pointerdown",
  "pointerup",
  "pointercancel",
  "touchstart",
  "touchend",
  "touchcancel",
  "mousedown",
  "mouseup",
  "click",
  "keydown",
  "keyup",
];

const MOVES = ["pointermove", "touchmove", "mousemove"];

let installed = false;
let tapped = false;

function activated() {
  return tapped;
}

export function installAudioUnlock() {
  const w = host();
  if (installed || !w || typeof w.addEventListener !== "function") return;
  installed = true;

  const opts = { capture: true, passive: true };
  const wake = () => {
    tapped = true;
    unlockAudio();
  };

  let lastMove = 0;
  const moved = () => {
    if (!activated() || audioReady()) return;
    const t = now();
    if (t - lastMove < MOVE_GAP_MS) return;
    lastMove = t;
    unlockAudio();
  };

  GESTURES.forEach((type) => w.addEventListener(type, wake, opts));
  MOVES.forEach((type) => w.addEventListener(type, moved, opts));
}

export function audioSleep(asleep) {
  sessionSleep(asleep);
  if (!ctx || !opened) return;
  if (parkTimer) {
    clearTimeout(parkTimer);
    parkTimer = null;
  }
  const was = parked;
  parked = !!asleep;
  if (!parked) dozed = false;
  if (parked !== was) fire(parkCbs, parked);
  try {
    if (asleep) {
      if (ctx.state !== "running") {
        hardMute();
        return;
      }
      fadeMaster(0, PARK_FADE);
      const dying = ctx;
      parkTimer = setTimeout(
        () => {
          parkTimer = null;
          if (dying !== ctx) return;
          hardMute();
          try {
            const p = dying.suspend();
            if (p && p.catch) p.catch(() => {});
          } catch (e) {}
        },
        Math.round(PARK_FADE * 1000) + 30,
      );
      return;
    }
    const c = ctx;
    const settle = () => {
      if (c !== ctx) return;
      if (c.state !== "running") {
        staleRefusal();
        return;
      }
      fadeMaster(level(), WAKE_FADE);
    };
    const p = c.resume();
    if (p && p.then) p.then(settle, staleRefusal);
    else settle();
  } catch (e) {
    staleRefusal();
  }
}

function level() {
  return muted ? 0 : AUDIO.master;
}

function fadeMaster(to, seconds) {
  if (!ctx || !master) return;
  const g = master.gain;
  const at = ctx.currentTime;
  try {
    const from = g.value;
    g.cancelScheduledValues(at);
    g.setValueAtTime(from, at);
    g.linearRampToValueAtTime(to, at + seconds);
    fadeUntil = at + seconds;
  } catch (e) {
    g.value = to;
  }
}

function hardMute() {
  if (!master) return;
  const g = master.gain;
  try {
    g.cancelScheduledValues(0);
  } catch (e) {}
  g.value = 0;
  fadeUntil = 0;
}

function dozeGuard() {
  if (!ctx || !opened || parked) return;
  if (now() - framedAt < DOZE_MS) return;
  audioSleep(true);
  dozed = true;
}

export function audioHeartbeat() {
  framedAt = now();
  if (!ctx || !master) return;
  if (!dozeTimer) dozeTimer = setInterval(dozeGuard, DOZE_GAP_MS);
  if (parked) {
    if (dozed && !hidden()) audioSleep(false);
    return;
  }
  const t = now();
  if (t - beatAt < BEAT_MS) return;
  beatAt = t;

  const g = master.gain;
  const at = ctx.currentTime;
  if (at < fadeUntil) return;

  const hold = level();
  if (g.value < hold - 0.001) {
    fadeMaster(hold, 0.08);
    return;
  }
  try {
    g.cancelScheduledValues(at);
    g.setValueAtTime(hold, at);
    g.linearRampToValueAtTime(hold, at + WATCH_HOLD);
    g.linearRampToValueAtTime(0, at + WATCH_HOLD + WATCH_FALL);
  } catch (e) {}
}

function staleRefusal() {
  refusedAt = now() - STUBBORN_MS - 1;
  rebuiltAt = 0;
}

export function setMuted(on) {
  muted = !!on;
  if (master) fadeMaster(parked ? 0 : level(), 0.05);
}

function reap(c) {
  if (!live.length) return;
  const t = c.currentTime;
  let kept = 0;
  for (let i = 0; i < live.length; i++) {
    if (live[i] > t) live[kept++] = live[i];
  }
  live.length = kept;
}

function spare(c) {
  reap(c);
  return live.length < AUDIO.maxVoices;
}

function track(node, until) {
  live.push(until);
  node.onended = () => {
    const i = live.indexOf(until);
    if (i >= 0) live.splice(i, 1);
  };
}

function shape(param, t0, dur, peak, attack, hold) {
  const a = attack === undefined ? 0.005 : attack;
  const top = Math.max(MIN * 2, peak);
  const held = t0 + a + (hold || 0);
  param.setValueAtTime(MIN, t0);
  param.exponentialRampToValueAtTime(top, t0 + a);
  if (hold) param.setValueAtTime(top, held);
  param.exponentialRampToValueAtTime(MIN, Math.max(held + 0.02, t0 + dur));
}

function noiseBuffer(c) {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * NOISE_SECONDS);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
  return noiseBuf;
}

export function tone(o) {
  const c = context();
  if (!c || muted || parked || !spare(c)) return;
  const t0 = c.currentTime + (o.delay || 0);
  const dur = o.dur === undefined ? 0.2 : o.dur;

  const osc = c.createOscillator();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
  if (o.to !== undefined) {
    const bend = o.bend === undefined ? dur : o.bend;
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + bend);
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const g = c.createGain();
  shape(
    g.gain,
    t0,
    dur,
    o.gain === undefined ? 0.22 : o.gain,
    o.attack,
    o.hold,
  );

  let head = g;
  if (o.cut) {
    const f = c.createBiquadFilter();
    f.type = o.cutType || "lowpass";
    f.frequency.setValueAtTime(Math.max(40, o.cut), t0);
    if (o.cutTo) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutTo), t0 + dur);
    }
    if (o.q !== undefined) f.Q.value = o.q;
    f.connect(g);
    head = f;
  }

  osc.connect(head);
  g.connect(o.dest || bus);
  const until = t0 + dur + 0.05;
  track(osc, until);
  osc.start(t0);
  osc.stop(until);
}

export function noise(o) {
  const c = context();
  if (!c || muted || parked || !spare(c)) return;
  const t0 = c.currentTime + (o.delay || 0);
  const dur = o.dur === undefined ? 0.18 : o.dur;

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, t0);

  const f = c.createBiquadFilter();
  f.type = o.type || "bandpass";
  f.frequency.setValueAtTime(
    Math.max(40, o.freq === undefined ? 1200 : o.freq),
    t0,
  );
  if (o.to !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
  }
  f.Q.value = o.q === undefined ? 1 : o.q;

  const g = c.createGain();
  shape(g.gain, t0, dur, o.gain === undefined ? 0.2 : o.gain, o.attack, o.hold);

  src.connect(f);
  f.connect(g);
  g.connect(o.dest || bus);
  track(src, t0 + dur + 0.05);
  src.start(t0, Math.max(0, rand() * (NOISE_SECONDS - dur - 0.1)));
  src.stop(t0 + dur + 0.05);
}

export function chord(freqs, o) {
  const spread = (o && o.spread) || 0.012;
  freqs.forEach((f, i) => {
    tone({
      ...o,
      freq: f,
      to: o && o.to ? o.to * (f / freqs[0]) : undefined,
      delay: ((o && o.delay) || 0) + i * spread,
    });
  });
}
