/**
 * Minimal promise-based tween engine.
 * A dependency-free stand-in for GSAP — every animation in the creative
 * awaits one of these, which keeps the director readable as a script.
 */

const active = [];
let timers = [];
let clock = 0;

export const Ease = {
  /** Used where the caller drives its own curve, e.g. a thrown arc. */
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  backIn: (t) => {
    const c = 1.70158;
    return (c + 1) * t * t * t - c * t * t;
  },
  elasticOut: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.36;
    return (
      Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
    );
  },
};

/** Advance every running tween/timer. Driven once per frame from main.js. */
export function updateTweens(dt) {
  clock += dt;

  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];

    // A creative must never throw. If something tore down its target while a
    // tween was still running, drop the tween instead of writing to a corpse.
    if (!tw.target || tw.target.destroyed) {
      active.splice(i, 1);
      tw.resolve();
      continue;
    }

    tw.elapsed += dt;

    if (tw.elapsed < tw.delay) continue;

    const raw = tw.duration <= 0 ? 1 : (tw.elapsed - tw.delay) / tw.duration;
    const t = raw >= 1 ? 1 : raw;
    const e = tw.ease(t);

    for (let k = 0; k < tw.keys.length; k++) {
      const key = tw.keys[k];
      const from = tw.from[k];
      tw.setter(tw.target, key, from + (tw.to[k] - from) * e);
    }
    if (tw.onUpdate) tw.onUpdate(e, t);

    if (raw >= 1) {
      active.splice(i, 1);
      tw.resolve();
    }
  }

  for (let i = timers.length - 1; i >= 0; i--) {
    if (clock >= timers[i].at) {
      const timer = timers.splice(i, 1)[0];
      timer.resolve();
    }
  }
}

/** Resolve dotted paths so `tween(gem, { "scale.x": 1 })` works. */
function setProp(target, path, value) {
  if (path.indexOf(".") === -1) {
    target[path] = value;
    return;
  }
  const parts = path.split(".");
  let obj = target;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
}

function getProp(target, path) {
  if (path.indexOf(".") === -1) return target[path];
  const parts = path.split(".");
  let obj = target;
  for (let i = 0; i < parts.length; i++) obj = obj[parts[i]];
  return obj;
}

/**
 * Tween properties on an object.
 * @returns {Promise<void>} resolves when the tween lands
 */
export function tween(target, props, duration, opts) {
  const o = opts || {};
  const keys = Object.keys(props);
  const from = keys.map((k) => getProp(target, k));
  const to = keys.map((k) => props[k]);

  return new Promise((resolve) => {
    active.push({
      target,
      keys,
      from,
      to,
      duration,
      delay: o.delay || 0,
      elapsed: 0,
      ease: o.ease || Ease.quadOut,
      onUpdate: o.onUpdate || null,
      setter: setProp,
      resolve,
    });
  });
}

/** Tween a bare number, reporting each step to a callback. */
export function tweenValue(from, to, duration, onStep, opts) {
  const holder = { v: from };
  const o = opts || {};
  return tween(holder, { v: to }, duration, {
    ease: o.ease,
    delay: o.delay,
    onUpdate: () => onStep(holder.v),
  });
}

/** Await a number of seconds on the game clock (pauses with the tab). */
export function delay(seconds) {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((resolve) =>
    timers.push({ at: clock + seconds, resolve }),
  );
}

/**
 * Kill the tweens driving a given object.
 * Killed tweens still resolve, so nothing awaiting them can deadlock.
 */
export function killTweensOf(target) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].target === target) {
      active.splice(i, 1)[0].resolve();
    }
  }
}

export function now() {
  return clock;
}
