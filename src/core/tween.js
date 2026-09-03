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
  expoIn: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
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

  /**
   * backOut with a tenth of the overshoot, for travel of about one cell.
   *
   * `backOut` overshoots its distance by a tenth, which is a nice settle over a
   * card sliding in from off screen and a gem visibly bumping into the next
   * column over the width of one tile. This carries the same settle at a size
   * that fits inside the cell it lands in.
   */
  backOutSoft: (t) => {
    const c = 0.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },

  /** backOut with half again the overshoot — for things that arrive hard. */
  backOutHard: (t) => {
    const c = 2.6;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },

  /**
   * Pull back, then throw — the windup and the overshoot in one curve.
   *
   * Worth having as a curve rather than as two tweens because the anticipation
   * is what makes a snap read as intended rather than as a dropped frame, and a
   * two-tween version of it has to be awaited to stay in order.
   */
  anticipate: (t) => {
    const c = 1.9;
    if (t < 0.36) {
      const k = t / 0.36;
      return -0.14 * ((c + 1) * k * k * k - c * k * k);
    }
    // Picks up exactly where the windup left off, so the curve is continuous:
    // -0.14 at the handover, 1 at the end.
    const k = (t - 0.36) / 0.64;
    const back = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
    return -0.14 + 1.14 * back;
  },

  /** Lands, bounces twice, settles. */
  bounceOut: (t) => {
    const n = 7.5625;
    if (t < 1 / 2.75) return n * t * t;
    if (t < 2 / 2.75) {
      const k = t - 1.5 / 2.75;
      return n * k * k + 0.75;
    }
    if (t < 2.5 / 2.75) {
      const k = t - 2.25 / 2.75;
      return n * k * k + 0.9375;
    }
    const k = t - 2.625 / 2.75;
    return n * k * k + 0.984375;
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

/**
 * Squash-and-stretch scale kick, snapped on and elastic on the way home.
 *
 * The one bit of animation vocabulary the creative was missing everywhere at
 * once. A thing that is struck, or that strikes, does not change size smoothly
 * in both directions — it is deformed on the frame of the event and springs
 * back, and it conserves its area while it does, so a stretch along x is a
 * squash along y. Written once here because six files wanted it.
 *
 * Set rather than tweened on the way out: the deformation IS the impact frame,
 * and easing into it over a tenth of a second is what makes an impact read as a
 * throb. Only the return is animated.
 *
 * Takes over the scale it is given — whatever else was tweening it is killed,
 * because two owners on one scale is a stutter and a punch is a caller saying
 * "this is mine now".
 *
 * @param {{scale?:object, x?:number, y?:number}} target a display object, or a
 *        bare point to drive directly
 * @param {number} amount how far it deforms; 0.2 is a nudge, 0.6 is a wallop
 * @param {number} [duration] seconds of spring-back
 * @param {object} [opts] `base` rest scale (default 1), `ratio` how much of the
 *        stretch the cross axis gives back (default 0.6, i.e. mostly), `axis`
 *        "x" to stretch wide and squash flat, "y" for tall and thin, and
 *        `ease` for the return
 * @returns {Promise<void>} resolves when it has settled
 */
export function punch(target, amount, duration, opts) {
  const o = opts || {};
  const scale = target.scale || target;
  const base = o.base === undefined ? 1 : o.base;
  const ratio = o.ratio === undefined ? 0.6 : o.ratio;
  const wide = o.axis !== "y";

  killTweensOf(scale);
  const along = base * (1 + amount);
  const across = base * (1 - amount * ratio);
  scale.x = wide ? along : across;
  scale.y = wide ? across : along;

  return tween(
    scale,
    { x: base, y: base },
    duration === undefined ? 0.34 : duration,
    {
      ease: o.ease || Ease.elasticOut,
    },
  );
}

export function now() {
  return clock;
}
