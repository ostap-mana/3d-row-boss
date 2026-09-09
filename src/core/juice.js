/**
 * Hit-stop, and the noise the screen shake is built out of.
 *
 * Two pieces of game feel that belong to nobody in particular. Everything else
 * in the creative animates something it owns — the boss owns its pose, the hud
 * owns its numbers — and these two own the frame itself, so they live here and
 * are driven from main.js.
 */

import { WORLD_RATE } from "../config.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ------------------------------------------------------------------ hit-stop */

/**
 * The longest the world clock may be held, in seconds.
 *
 * A cascade lands six beams inside half a second and every one of them asks for
 * a stop. Merged rather than queued — see hitStop — but merging still has to be
 * bounded or a big combo turns the whole move into slow motion, and slow motion
 * is what a stop stops reading as the moment it outstays a fifth of a second.
 */
const MAX_STOP = 0.2;

/**
 * How much of a stop is spent held at the bottom before it climbs back.
 *
 * The shape is the whole trick. A blow that ramps smoothly back to full speed
 * reads as slow motion; a blow that holds still and *then* releases reads as
 * something being hit. So the first half is flat and the return is fast.
 */
const HOLD = 0.45;

let stopLeft = 0;
let stopTotal = 0;
let stopFloor = 1;

/**
 * Hold the world still for a moment because something just landed.
 *
 * The single juiciest thing in here, and the cheapest: for sixty milliseconds
 * the beam, the boss, the shards, the falling gems and the damage number are
 * all frozen mid-air while the screen rattles around them — see updateShake in
 * main.js, which deliberately runs on real time so it keeps moving through
 * this. Then everything lets go at once.
 *
 * Merged, not queued. A second call while one is running takes the deeper floor
 * and the longer remainder of the two, so six landings in a cascade are one
 * long-ish stop rather than six stacked ones, and the loudest of them is what
 * decides how hard it bites.
 *
 * @param {number} strength 0 = nothing, 1 = as close to frozen as this gets
 * @param {number} [duration] seconds; defaults to a length that suits `strength`
 */
export function hitStop(strength, duration) {
  const s = clamp(strength, 0, 1);
  if (s <= 0) return;

  // A weak hit is a flicker and a heavy one is a beat: 40ms to 140ms.
  const want = duration === undefined ? 0.04 + 0.1 * s : duration;
  const dur = clamp(want, 0, MAX_STOP);
  // 0.06 rather than 0 at full strength. A clock that stops dead stops every
  // tween that is *also* the frame's readability — the tint fading off the
  // boss, the flash coming down — and those coming back to life together on
  // release is a visible jolt. A sliver of movement keeps it a held breath.
  const floor = 1 - 0.94 * s;

  stopFloor = Math.min(stopFloor, floor);
  stopLeft = Math.max(stopLeft, dur);
  stopTotal = Math.max(stopTotal, stopLeft);
}

/**
 * Scale a frame's delta by whatever stop is running, and age the stop.
 *
 * The ageing is on the *real* delta and not the scaled one, which is the only
 * way round it: a stop that ran its own timer on the clock it is slowing would
 * take twenty times as long to expire as it asked for, and at full strength
 * would never expire at all.
 *
 * @param {number} dt real seconds since the last frame
 * @returns {number} the seconds the world should advance by
 */
export function warpDt(dt) {
  return dt * base * scale * stopFactor(dt);
}

/**
 * How much of a frame the stop in flight is letting through, and age it.
 *
 * Split out from warpDt so the time scale below multiplies the stop rather than
 * being swallowed by its early return: a rush engaged on the same frame as a
 * landing used to be ignored for as long as the freeze ran.
 */
function stopFactor(dt) {
  if (stopLeft <= 0) return 1;

  stopLeft -= dt;
  if (stopLeft <= 0) {
    stopLeft = 0;
    stopFloor = 1;
    stopTotal = 0;
    return 1;
  }

  // 0 at the moment of impact, 1 as it lets go.
  const t = 1 - stopLeft / stopTotal;
  if (t <= HOLD) return stopFloor;

  // cubicOut over the tail: most of the speed is back in the first third of the
  // release, so the world snaps out of it rather than sliding out.
  const k = (t - HOLD) / (1 - HOLD);
  const e = 1 - Math.pow(1 - k, 3);
  return stopFloor + (1 - stopFloor) * e;
}

/* ------------------------------------------------------------- time scale */

/**
 * A standing multiplier on the world clock — the other half of warpDt.
 *
 * Hit-stop is a beat: something landed, hold it, let go. This is a *rate*, held
 * for as long as somebody wants the world to run at it, and it exists for one
 * thing: the gap between a tap on a charged hero and the ultimate that tap
 * bought. Everything in the fight animates off this clock — the cascade still
 * falling, the boss mid-swing, the cut-in itself — so one number moves all of
 * it at once, and nothing downstream has to learn how to be interrupted.
 *
 * Two rates use it, both from the director. A *rush* (ULT_PACE.rush) runs while
 * a tapped ultimate is stuck behind a cascade the board is still playing: the
 * remaining animation flushes in a few frames instead of a second and a half,
 * so the cast starts on the tap rather than whenever the board happens to go
 * quiet. A *cast* rate (ULT_PACE.cast) runs for the ultimate itself.
 *
 * Deliberately not applied to the two clocks main.js ticks on real time — the
 * cataclysm fuse and the camera shake. A fuse that ran faster because the
 * player rushed an animation would be charging them for the rush.
 */
let scale = 1;
let base = WORLD_RATE;

/** @param {number} v 1 = real time, 4 = four times as fast */
export function setTimeScale(v) {
  scale = v > 0 ? v : 1;
}

export function setWorldRate(v) {
  base = v > 0 ? v : 1;
}

export function worldRate() {
  return base;
}

/** The rate the world is running at. */
export function timeScale() {
  return scale * base;
}

/** Whether the world clock is currently being held. */
export function stopped() {
  return stopLeft > 0;
}

/**
 * Drop any stop in flight — used when the whole fight is rebuilt, and by the
 * director's ult rush, which must not have to wait out a freeze the last blow
 * queued.
 *
 * The time scale goes with it: a rematch dealt while the previous run was
 * mid-cast would otherwise open running at the cast's rate.
 */
export function clearStop() {
  stopLeft = 0;
  stopTotal = 0;
  stopFloor = 1;
  scale = 1;
}

/* --------------------------------------------------------------------- shake */

/**
 * Smooth two-octave noise in -1..1, for a shake that rumbles.
 *
 * `Math.random()` per frame per axis is what this replaces, and the difference
 * is the difference between a struck object and a loose connector: white noise
 * has energy at every rate including one frame, so the screen buzzes, and a
 * buzz at 8 points of amplitude looks exactly like a buzz at 30. Two sines at
 * unrelated rates have a body to them — the frame travels somewhere and comes
 * back, which is what a thing that was hit does.
 *
 * The third of the amplitude that *is* still random is grit: enough that two
 * shakes never trace the same path, not enough to be seen on its own.
 *
 * The rate is a parameter because not everything in the fight hits at the same
 * pitch. A fist coming down is a crack and wants the noise fast; a jet of lava
 * arriving over half a second is pressure, and pressure hums — the same
 * amplitude at half the rate reads as weight rather than as a rattle. The grit
 * follows the rate down, so a slow shake is a smooth one.
 *
 * @param {number} t seconds since the shake started
 * @param {number} seed pulls the two axes apart so they never agree
 * @param {number} [freq] rate multiplier; 1 is a blow, 0.5 a rumble, 1.3 a snap
 */
export function rumble(t, seed, freq) {
  const f = freq === undefined ? 1 : freq;
  const a = Math.sin(t * 58.3 * f + seed * 2.7);
  const b = Math.sin(t * 27.1 * f + seed * 5.1 + 1.3);
  const grit = (Math.random() - 0.5) * 0.56 * Math.min(1, f);
  return (a * 0.6 + b * 0.4) * 0.72 + grit;
}

/**
 * How a shake's amplitude falls off over its life.
 *
 * Smoothstep rather than the straight line this used to be: full amplitude
 * through the opening — the part that sells the hit — and a tail that arrives
 * at nothing flat instead of at an angle, so the shake settles rather than
 * being switched off one frame while the frame is still off centre.
 *
 * @param {number} k seconds left over seconds asked for, 1 down to 0
 */
export function shakeDecay(k) {
  return k * k * (3 - 2 * k);
}
