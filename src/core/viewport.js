const SETTLE_MS = 900;
const SETTLE_FRAMES = 3;

const PIXEL_BUDGET = 2.6e6;
const MIN_DPR = 1;
const MAX_DPR = 3;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function visual() {
  const vv = globalThis.visualViewport;
  if (!vv) return null;
  if (typeof vv.scale === "number" && Math.abs(vv.scale - 1) > 0.01)
    return null;
  if (!(vv.width > 0) || !(vv.height > 0)) return null;
  return { w: vv.width, h: vv.height };
}

export function measureViewport() {
  const vv = visual();
  if (vv) return { w: Math.round(vv.w), h: Math.round(vv.h) };

  const de = document.documentElement;
  if (de && de.clientWidth > 0 && de.clientHeight > 0) {
    return { w: de.clientWidth, h: de.clientHeight };
  }

  const iw = globalThis.innerWidth;
  const ih = globalThis.innerHeight;
  if (iw > 0 && ih > 0) return { w: iw, h: ih };

  return { w: 375, h: 667 };
}

export function resolutionFor(w, h) {
  const dpr = globalThis.devicePixelRatio || 1;
  const capped = clamp(dpr, MIN_DPR, MAX_DPR);
  const afford = Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h));
  return clamp(Math.min(capped, afford), MIN_DPR, capped);
}

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

let probeEl = null;
function probe() {
  if (!probeEl || !probeEl.isConnected) {
    probeEl = document.getElementById("safe-probe");
  }
  return probeEl;
}

export function measureSafeInsets(box) {
  const el = probe();
  if (!el) return { ...NO_INSETS };

  const cs = getComputedStyle(el);
  const px = (v) => {
    const n = parseFloat(v);
    return n > 0 ? n : 0;
  };
  const top = px(cs.paddingTop);
  const right = px(cs.paddingRight);
  const bottom = px(cs.paddingBottom);
  const left = px(cs.paddingLeft);
  if (!box) return { top, right, bottom, left };

  const de = document.documentElement;
  const docW = de && de.clientWidth > 0 ? de.clientWidth : box.w;
  const docH = de && de.clientHeight > 0 ? de.clientHeight : box.h;
  const spareX = Math.max(0, docW - box.w);
  const spareY = Math.max(0, docH - box.h);

  return {
    top: Math.max(0, top - chromeAbove(docW, docH, bottom)),
    right: Math.max(0, right - spareX),
    bottom: Math.max(0, bottom - spareY),
    left,
  };
}

function chromeAbove(docW, docH, bottom) {
  const scr = globalThis.screen;
  if (!scr || !(bottom > 0)) return 0;

  const long = Math.max(scr.width || 0, scr.height || 0);
  const short = Math.min(scr.width || 0, scr.height || 0);
  if (!(long > 0)) return 0;
  const screenH = docH >= docW ? long : short;

  return Math.max(0, screenH - docH);
}

function insetsMoved(a, b) {
  if (!a) return true;
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.right - b.right) > 0.5 ||
    Math.abs(a.bottom - b.bottom) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5
  );
}

function pin(host, w, h) {
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.right = "auto";
  host.style.bottom = "auto";
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
}

export function watchViewport(host, onChange) {
  let last = { w: 0, h: 0, resolution: 0, safe: null };
  let settleUntil = 0;
  let stable = 0;
  let frame = 0;
  let stopped = false;
  let dprQuery = null;

  function apply() {
    const { w, h } = measureViewport();
    const resolution = resolutionFor(w, h);
    const safe = measureSafeInsets({ w, h });
    const moved =
      w !== last.w ||
      h !== last.h ||
      Math.abs(resolution - last.resolution) > 0.01 ||
      insetsMoved(last.safe, safe);
    if (!moved) return false;

    last = { w, h, resolution, safe };
    pin(host, w, h);
    onChange(last);
    return true;
  }

  function settle() {
    frame = 0;
    if (stopped) return;

    if (apply()) stable = 0;
    else stable += 1;

    if (stable >= SETTLE_FRAMES || performance.now() > settleUntil) return;
    frame = requestAnimationFrame(settle);
  }

  function bump() {
    if (stopped) return;
    settleUntil = performance.now() + SETTLE_MS;
    stable = 0;
    if (!frame) frame = requestAnimationFrame(settle);
  }

  function onDpr() {
    watchDpr();
    bump();
  }

  function watchDpr() {
    if (!globalThis.matchMedia) return;
    if (dprQuery) dprQuery.removeEventListener("change", onDpr);
    const dpr = globalThis.devicePixelRatio || 1;
    dprQuery = globalThis.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener("change", onDpr);
  }

  const WIN = ["resize", "orientationchange", "pageshow", "focus"];
  WIN.forEach((type) =>
    globalThis.addEventListener(type, bump, { passive: true }),
  );

  const DOC = ["fullscreenchange", "webkitfullscreenchange"];
  DOC.forEach((type) =>
    document.addEventListener(type, bump, { passive: true }),
  );

  const vv = globalThis.visualViewport;
  if (vv) {
    vv.addEventListener("resize", bump, { passive: true });
    vv.addEventListener("scroll", bump, { passive: true });
  }

  let ro = null;
  if (globalThis.ResizeObserver) {
    ro = new ResizeObserver(bump);
    ro.observe(document.documentElement);
  }

  const orientation = globalThis.screen && globalThis.screen.orientation;
  if (orientation && orientation.addEventListener) {
    orientation.addEventListener("change", bump);
  }

  watchDpr();
  apply();

  return {
    refresh: bump,
    current: () => last,
    stop() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      WIN.forEach((type) => globalThis.removeEventListener(type, bump));
      DOC.forEach((type) => document.removeEventListener(type, bump));
      if (vv) {
        vv.removeEventListener("resize", bump);
        vv.removeEventListener("scroll", bump);
      }
      if (ro) ro.disconnect();
      if (orientation && orientation.removeEventListener) {
        orientation.removeEventListener("change", bump);
      }
      if (dprQuery) dprQuery.removeEventListener("change", onDpr);
    },
  };
}
