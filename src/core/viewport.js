/**
 * The viewport: one measurement of "how big is the screen", and one place that
 * says when it changed.
 *
 * This used to be `resizeTo: window` and a `resize` listener, which is the
 * answer that works on a desktop browser and on nothing else. Three separate
 * things are wrong with it on a phone, and each one of them shows up as the
 * hero row sitting under something.
 *
 * `window.innerHeight` is not the visible height. Mobile browsers retract and
 * extend a URL bar over the page, and the number they report is the viewport
 * with the bar gone whether the bar is gone or not — so the row at the bottom
 * edge of the layout is drawn under a toolbar that is still on screen. In an
 * in-app webview — which is where a playable actually runs — the same number
 * can be the host app's window rather than the frame the creative was given.
 *
 * The `resize` event is not fired for every resize. iOS Safari does not fire it
 * when the toolbar collapses; a container that resizes the ad's iframe may not
 * fire it either; a foldable changing posture and a tablet entering split view
 * are both cases where the element changed size and the window did not.
 *
 * And the size reported during a rotation is stale. Every mobile browser
 * reports the pre-rotation size for some number of frames after
 * `orientationchange`, so a layout solved on the first event is a layout solved
 * for the orientation the phone has just left.
 *
 * So: the size is measured off the box the canvas actually fills, every signal
 * that a size may have changed is subscribed to rather than one of them, and
 * every signal starts a settle loop that keeps re-measuring until the number
 * stops moving. The host is then pinned to that measurement in pixels, so the
 * box the renderer draws for and the box the browser paints into are the same
 * box by construction rather than by agreement between a CSS rule and a JS
 * number.
 */

/** How long a settle keeps re-measuring before giving up on a stable answer. */
const SETTLE_MS = 900;
/** Frames the size has to hold still for before a settle is called done. */
const SETTLE_FRAMES = 3;

/**
 * Device pixels the renderer is allowed to draw, before the ratio is capped.
 *
 * The ratio was capped at a flat 2 "for the sake of the iPhone SE class of
 * device", which is the right cap for a phone and the wrong one for everything
 * that is not one: a 3x phone at 430x932 is 2.4 megapixels of buffer at cap 2,
 * and a 1024x1366 tablet is 5.6 — for a creative that never composes anything
 * larger than the 750 point stage core/layout.js clamps to. The real constraint
 * is a fill rate, so it is written as one and the cap falls out of it.
 *
 * 2.6M is that 430x932 phone at its full 2x: the heaviest thing in the matrix
 * that holds sixty frames, and the line every other device is measured against.
 */
const PIXEL_BUDGET = 2.6e6;
/** Never below this: under 1 the canvas is upscaled and the type goes soft. */
const MIN_DPR = 1;
/** Never above this: past 2 nothing in the creative has the detail to show it. */
const MAX_DPR = 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The visual viewport, when it can be trusted.
 *
 * It is the only API that reports the box a person can actually see — it is
 * what shrinks when the URL bar extends — and it is the reason this file
 * exists. It is not trusted while the page is pinch-zoomed, because then it
 * reports the magnified window rather than the screen, and a layout solved for
 * that would fight the zoom.
 *
 * `user-scalable=no` is set in index.html, so a scale other than 1 is either an
 * accessibility zoom or a webview ignoring the meta tag. Both are cases where
 * the honest answer is the document's own size, below.
 */
function visual() {
  const vv = globalThis.visualViewport;
  if (!vv) return null;
  if (typeof vv.scale === "number" && Math.abs(vv.scale - 1) > 0.01)
    return null;
  if (!(vv.width > 0) || !(vv.height > 0)) return null;
  return { w: vv.width, h: vv.height };
}

/**
 * The size to draw for, in CSS pixels.
 *
 * Three sources, in falling order of how close each one is to the box a person
 * is looking at, and every one of them is the right answer somewhere:
 * `visualViewport` on a phone browser with a retracting toolbar,
 * `documentElement.clientWidth` inside an ad container's iframe — where the
 * frame is the creative's whole world and the visual viewport belongs to the
 * host page — and `innerWidth` in the webviews old enough to have neither.
 *
 * The host element is deliberately not among them: it is pinned from this
 * answer by the watcher below, so reading it back would be reading our own
 * last output.
 */
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

  // Nothing answered. A guess beats a zero-sized canvas, and this is the
  // reference phone the whole creative is drawn for.
  return { w: 375, h: 667 };
}

/**
 * How many device pixels per CSS pixel to render at, for a viewport this size.
 *
 * The device's own ratio, held between the two bounds, and then held again to
 * whatever the budget affords at this size — so a big screen gives up sharpness
 * before it gives up frame rate, and a small one keeps all of it.
 */
export function resolutionFor(w, h) {
  const dpr = globalThis.devicePixelRatio || 1;
  const capped = clamp(dpr, MIN_DPR, MAX_DPR);
  const afford = Math.sqrt(PIXEL_BUDGET / Math.max(1, w * h));
  return clamp(Math.min(capped, afford), MIN_DPR, capped);
}

/**
 * Pin the host to a measurement, so the CSS box and the render box are one box.
 *
 * Fixed and pinned in pixels rather than left at `inset: 0`, because `inset: 0`
 * resolves against the body, the body resolves against the initial containing
 * block, and on a mobile browser the initial containing block is the viewport
 * with the toolbar gone — which is the number this whole file exists to stop
 * trusting.
 */
function pin(host, w, h) {
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.right = "auto";
  host.style.bottom = "auto";
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
}

/**
 * Watch the viewport and call back whenever the size or the pixel ratio moves.
 *
 * @param {HTMLElement} host element the canvas fills; pinned to each measurement
 * @param {(size:{w:number,h:number,resolution:number}) => void} onChange
 * @returns {{refresh:()=>void, stop:()=>void, current:()=>{w:number,h:number,resolution:number}}}
 */
export function watchViewport(host, onChange) {
  let last = { w: 0, h: 0, resolution: 0 };
  let settleUntil = 0;
  let stable = 0;
  let frame = 0;
  let stopped = false;
  let dprQuery = null;

  /** One measurement, applied if it moved. Returns whether it moved. */
  function apply() {
    const { w, h } = measureViewport();
    const resolution = resolutionFor(w, h);
    // The ratio is compared loosely: it is a float off the device, and a
    // hairline difference is not worth rebuilding every texture for.
    const moved =
      w !== last.w ||
      h !== last.h ||
      Math.abs(resolution - last.resolution) > 0.01;
    if (!moved) return false;

    last = { w, h, resolution };
    pin(host, w, h);
    onChange(last);
    return true;
  }

  /**
   * Re-measure every frame until the answer holds still.
   *
   * This is the whole of the rotation fix. A phone reports the size it is
   * leaving for anywhere between one frame and a dozen after it says it
   * rotated, and there is no event for "and now I mean it" — so the size is
   * taken again on each frame and the layout follows it the whole way down.
   * The player watches the composition settle rather than watching it be wrong
   * and then be right.
   */
  function settle() {
    frame = 0;
    if (stopped) return;

    if (apply()) stable = 0;
    else stable += 1;

    if (stable >= SETTLE_FRAMES || performance.now() > settleUntil) return;
    frame = requestAnimationFrame(settle);
  }

  /** A signal arrived. Start, or extend, the settle window. */
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

  /**
   * Re-arm the ratio watch.
   *
   * `matchMedia` is the only event there is for a pixel ratio changing — a
   * window dragged to a second monitor, a browser zoomed, a desktop display
   * scale changed — and the query has to name the ratio it watches for, so it
   * is torn down and rebuilt around whatever the new one turns out to be.
   */
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

  const vv = globalThis.visualViewport;
  if (vv) {
    // `scroll` as well as `resize`: on iOS the toolbar retracting is reported
    // as the visual viewport scrolling inside the layout viewport, and the
    // height that comes with it is the one worth having.
    vv.addEventListener("resize", bump, { passive: true });
    vv.addEventListener("scroll", bump, { passive: true });
  }

  // The catch-all, and on a foldable or a tablet in split view the only one
  // that fires: the box changed size and no window-level event says so.
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
