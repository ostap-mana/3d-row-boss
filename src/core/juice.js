import { WORLD_RATE } from "../config.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const MAX_STOP = 0.2;

const HOLD = 0.45;

let stopLeft = 0;
let stopTotal = 0;
let stopFloor = 1;

export function hitStop(strength, duration) {
  const s = clamp(strength, 0, 1);
  if (s <= 0) return;

  const want = duration === undefined ? 0.04 + 0.1 * s : duration;
  const dur = clamp(want, 0, MAX_STOP);
  const floor = 1 - 0.94 * s;

  stopFloor = Math.min(stopFloor, floor);
  stopLeft = Math.max(stopLeft, dur);
  stopTotal = Math.max(stopTotal, stopLeft);
}

export function warpDt(dt) {
  return dt * base * scale * stopFactor(dt);
}

function stopFactor(dt) {
  if (stopLeft <= 0) return 1;

  stopLeft -= dt;
  if (stopLeft <= 0) {
    stopLeft = 0;
    stopFloor = 1;
    stopTotal = 0;
    return 1;
  }

  const t = 1 - stopLeft / stopTotal;
  if (t <= HOLD) return stopFloor;

  const k = (t - HOLD) / (1 - HOLD);
  const e = 1 - Math.pow(1 - k, 3);
  return stopFloor + (1 - stopFloor) * e;
}

let scale = 1;
const base = WORLD_RATE;

export function setTimeScale(v) {
  scale = v > 0 ? v : 1;
}

export function worldRate() {
  return base;
}

export function clearStop() {
  stopLeft = 0;
  stopTotal = 0;
  stopFloor = 1;
  scale = 1;
}

export function rumble(t, seed, freq) {
  const f = freq === undefined ? 1 : freq;
  const a = Math.sin(t * 58.3 * f + seed * 2.7);
  const b = Math.sin(t * 27.1 * f + seed * 5.1 + 1.3);
  const grit = (Math.random() - 0.5) * 0.56 * Math.min(1, f);
  return (a * 0.6 + b * 0.4) * 0.72 + grit;
}

export function shakeDecay(k) {
  return k * k * (3 - 2 * k);
}
