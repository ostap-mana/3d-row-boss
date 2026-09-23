const WINDOW = 90;
const SLOW_MS = 20;
const IGNORE_MS = 250;
const GRACE_S = 1.5;
const STEP = 0.8;
const FLOOR = 0.4;

export function deviceStartScale() {
  const memory = globalThis.navigator && navigator.deviceMemory;
  if (!(memory > 0)) return 1;
  if (memory <= 2) return 0.6;
  if (memory <= 4) return 0.8;
  return 1;
}

export function startFrameGovernor(app, opts) {
  const o = opts || {};
  let scale = o.scale === undefined ? 1 : o.scale;
  const apply = o.apply || (() => {});
  const frames = [];
  let grace = GRACE_S;
  let steps = 0;
  let median = 0;
  let stopped = false;

  function stepDown() {
    if (scale <= FLOOR + 1e-6) return false;
    scale = Math.max(FLOOR, scale * STEP);
    steps += 1;
    grace = GRACE_S;
    frames.length = 0;
    apply(scale);
    return true;
  }

  function tick(ticker) {
    if (stopped) return;
    const ms = ticker.deltaMS;
    if (document.hidden || ms > IGNORE_MS) return;
    if (grace > 0) {
      grace -= ms / 1000;
      return;
    }
    frames.push(ms);
    if (frames.length < WINDOW) return;
    const sorted = frames.slice().sort((a, b) => a - b);
    median = sorted[sorted.length >> 1];
    frames.length = 0;
    if (median > SLOW_MS) stepDown();
  }

  app.ticker.add(tick, null, -40);

  return {
    state: () => ({ scale, steps, median: Math.round(median * 10) / 10 }),
    stepDown,
    stop() {
      stopped = true;
      app.ticker.remove(tick);
    },
  };
}
