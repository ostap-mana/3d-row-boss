const active = [];
let timers = [];
let clock = 0;

export const Ease = {
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

  backOutSoft: (t) => {
    const c = 0.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },

  backOutHard: (t) => {
    const c = 2.6;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },

  anticipate: (t) => {
    const c = 1.9;
    if (t < 0.36) {
      const k = t / 0.36;
      return -0.14 * ((c + 1) * k * k * k - c * k * k);
    }
    const k = (t - 0.36) / 0.64;
    const back = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
    return -0.14 + 1.14 * back;
  },

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

export function updateTweens(dt) {
  clock += dt;

  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];

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

export function tweenValue(from, to, duration, onStep, opts) {
  const holder = { v: from };
  const o = opts || {};
  return tween(holder, { v: to }, duration, {
    ease: o.ease,
    delay: o.delay,
    onUpdate: () => onStep(holder.v),
  });
}

export function delay(seconds) {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((resolve) =>
    timers.push({ at: clock + seconds, resolve }),
  );
}

export function killTweensOf(target) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].target === target) {
      active.splice(i, 1)[0].resolve();
    }
  }
}

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
