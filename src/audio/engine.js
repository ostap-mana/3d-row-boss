/**
 * The synth every sound in the creative is built out of.
 *
 * Synthesized, never sampled. The build is one inlined HTML file and every byte
 * in it is a byte of load time before the first frame — a sample pack for the
 * forty-odd noises this fight makes would be a few hundred kilobytes of base64
 * against the eight or so this file costs. Nothing here is fetched, decoded or
 * waited on: the first sound is ready the moment the player touches the screen.
 *
 * Three rules the whole file is shaped by:
 *
 *   - Nothing plays before a touch. Mobile browsers suspend a context that was
 *     never opened by a gesture, and an ad that made noise at somebody in a bus
 *     would deserve the mute it got. The intro's own sounds are simply dropped —
 *     see unlockAudio.
 *   - Nothing is trusted. A webview with no AudioContext, a context that throws
 *     on construction, a node that refuses to start: every one of those is a
 *     creative that plays silently, never one that fails to play.
 *   - Nothing is unbounded. A five-step cascade with a party volley behind it
 *     asks for dozens of voices inside a second, so there is a hard cap on how
 *     many can be in the air and a compressor across the sum of them. Phone
 *     speakers clip long before the mix does.
 */

import { AUDIO } from "../config.js";

/** Floor for every exponential ramp — the curve cannot reach or pass zero. */
const MIN = 0.0001;

/** Seconds of white noise baked once and reused by every hiss and crack. */
const NOISE_SECONDS = 2;

let ctx = null;
/** Compressor everything lands on, and the gain the mute switch owns. */
let bus = null;
let master = null;
let noiseBuf = null;
let voices = 0;
let muted = false;
let poked = false;

/** No window, no audio — and the creative still has to run. */
function host() {
  return typeof window === "undefined" ? null : window;
}

/**
 * The context, built on first use.
 *
 * Constructed suspended when it is built outside a gesture, which is the
 * common case: the boss is already rising by the time anybody touches the
 * screen. Sounds asked for before then are dropped on the floor by design.
 */
function context() {
  if (ctx || !AUDIO.on) return ctx;
  const w = host();
  const Ctor = w && (w.AudioContext || w.webkitAudioContext);
  if (!Ctor) return null;

  try {
    ctx = new Ctor();
  } catch (e) {
    return null;
  }

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
  return ctx;
}

/** The live context, or null. Only the bed — see sfx.js — needs this. */
export function audioContext() {
  return context();
}

/** Where every voice connects. Null until the context exists. */
export function audioBus() {
  context();
  return bus;
}

/**
 * Open the audio, from inside a user gesture.
 *
 * Safe to call on every touch and cheap after the first: resume() on a running
 * context is a no-op. The silent tick is the iOS half of it — some builds keep
 * a resumed context muted until a node has actually played through it.
 */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended" && c.resume) c.resume().catch(() => {});
  if (poked) return;
  poked = true;
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch (e) {
    /* the resume above was the part that mattered */
  }
}

/** Park the audio while the ad is off screen; wake it when it comes back. */
export function audioSleep(asleep) {
  if (!ctx) return;
  try {
    if (asleep) ctx.suspend();
    else if (poked) ctx.resume();
  } catch (e) {
    /* a context that will not park is not worth a broken creative */
  }
}

export function setMuted(on) {
  muted = !!on;
  if (master) master.gain.value = muted ? 0 : AUDIO.master;
}

export function isMuted() {
  return muted;
}

/** Whether another voice can be spared. */
function spare() {
  return voices < AUDIO.maxVoices;
}

/** Count a source in for as long as it runs. */
function track(node) {
  voices++;
  node.onended = () => {
    voices = Math.max(0, voices - 1);
  };
}

/**
 * Attack, optional hold, exponential fall.
 *
 * Exponential rather than linear on the way down because a linear fade reads as
 * a sound being switched off, and every one of these is something being hit.
 */
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
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/**
 * One oscillator through its own envelope, and optionally its own filter.
 *
 * @param {object} o
 *   freq/to/bend — pitch, where it ends up, and how long it takes to get there
 *   type         — oscillator shape
 *   dur/attack/hold/gain — the envelope
 *   cut/cutTo/cutType/q  — a filter in front of the envelope
 *   delay        — schedule it this far into the future
 */
export function tone(o) {
  const c = context();
  if (!c || muted || !spare()) return;
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
  track(osc);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/**
 * A band of noise: every hiss, crack, whoosh and crunch in the fight.
 *
 * Read from a random offset in the shared buffer, because two hits in a row off
 * the same start sample are audibly the same hit twice.
 */
export function noise(o) {
  const c = context();
  if (!c || muted || !spare()) return;
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
  track(src);
  // Clamped: a sound longer than the buffer would ask to start at a negative
  // offset, and that is one of the few things a real context throws on. The
  // source loops, so an offset of zero is a correct answer for any length.
  src.start(t0, Math.max(0, Math.random() * (NOISE_SECONDS - dur - 0.1)));
  src.stop(t0 + dur + 0.05);
}

/** Several notes at once, spread by `spread` seconds so they arrive as one. */
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
