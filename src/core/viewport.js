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

/** No cutouts anywhere: the answer on most of the devices this runs on. */
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The probe, cached.
 *
 * Looked up rather than held from boot because the insets are read on every
 * settle frame now — see apply() — and `getElementById` on every one of those
 * is a document walk for an element that never moves. Re-looked-up if it is
 * ever detached, which is the one thing that would make the cache lie.
 */
let probeEl = null;
function probe() {
  if (!probeEl || !probeEl.isConnected) {
    probeEl = document.getElementById("safe-probe");
  }
  return probeEl;
}

/**
 * The device's own insets — the notch, the home indicator, the gesture bar —
 * mapped into the box the renderer is drawing.
 *
 * Two halves, and the second one is the reason this lives here rather than in
 * main.js.
 *
 * The first half is the reading. `env(safe-area-inset-*)` is resolved by the
 * browser against the *layout* viewport and handed back as real padding on the
 * hidden probe in index.html — a computed padding rather than a custom
 * property, because `getPropertyValue` returns the unresolved `env(...)` token
 * on some webviews. Note that a creative running inside an ad container's
 * iframe is told zero by every engine, per spec: insets belong to the top-level
 * document. That is the right answer there — the container decided where the
 * frame goes and the frame's edges are not the screen's.
 *
 * The second half is the mapping, and without it the insets are being applied
 * to the wrong box. The render box is pinned to the *visual* viewport, which on
 * a phone browser is the layout viewport less whatever the toolbar is currently
 * covering — so a 34 point home indicator sitting under a 51 point toolbar is
 * already outside the box we draw in, and taking it off the bottom a second
 * time is 34 points of screen spent on nothing. So each inset is reduced by
 * however much of that edge the render box is already clear of. Where the two
 * boxes are the same box — a webview, a fullscreen page, a desktop window —
 * every gap is zero and the insets pass through untouched.
 *
 * @param {{w:number,h:number}} [box] the render box; omit for raw insets
 */
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

  // The host is pinned at the layout viewport's top left corner — see pin() —
  // so the box is only ever short at the right and the bottom, and those are
  // the only two edges with a gap to discount.
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

/**
 * How much browser furniture is sitting above the page, so the notch can stop
 * being paid for twice.
 *
 * This is the in-app browser case and it is the one a playable is actually
 * opened in: a link tapped inside a scanner app, a chat, a feed. The host puts
 * the page in a web view with its own bar across the top — a back chevron and
 * the domain — and that bar is drawn *over* the cutout, so the page below it is
 * nowhere near the camera. Every engine ought to report zero insets there, per
 * spec, because the safe area belongs to the viewport and this viewport starts
 * under a toolbar. Several iOS web views report the device's insets anyway.
 *
 * What that costs is a band of nothing. The layout takes the fifty-nine points
 * it is told about off the top, the boss's name and his health bar start below
 * them, and the player sees a strip of empty sky under the browser's own bar —
 * the notch charged for once by the host and once again by us. It is the single
 * most visible layout bug the creative has, because it is the top of the
 * screen and it is there for the whole run.
 *
 * So the reading is checked against the screen rather than believed. The page's
 * layout viewport is `docH` tall and the device's screen is `screenH`; whatever
 * is missing between them is furniture the browser kept, and a page that starts
 * that far down cannot be under a cutout that shallow. Subtracted rather than
 * zeroed, because a short bar on a deep notch leaves a real inset behind and
 * the difference is exactly what is left of it.
 *
 * The one thing the difference does not say is which end the furniture is at,
 * and a bar along the bottom would have the same arithmetic with the opposite
 * answer. The bottom inset settles it: a home indicator reported under us is
 * the device saying our bottom edge is the screen's bottom edge, so the missing
 * points are above. With no indicator to read — an older phone, or a bar at
 * each end — nothing is discounted and the band stays, which is the safe way
 * round to be wrong.
 *
 * @param {number} docW layout viewport width, for reading the orientation
 * @param {number} docH layout viewport height
 * @param {number} bottom the raw bottom inset, before any discount
 */
function chromeAbove(docW, docH, bottom) {
  // Nothing to weigh it against, and nothing that says the gap is above us.
  const scr = globalThis.screen;
  if (!scr || !(bottom > 0)) return 0;

  // `screen.width` and `screen.height` are the portrait pair on some engines
  // and the current pair on others, so they are sorted rather than trusted.
  const long = Math.max(scr.width || 0, scr.height || 0);
  const short = Math.min(scr.width || 0, scr.height || 0);
  if (!(long > 0)) return 0;
  const screenH = docH >= docW ? long : short;

  return Math.max(0, screenH - docH);
}

/** Whether two readings differ by enough to be worth a relayout. */
function insetsMoved(a, b) {
  if (!a) return true;
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.right - b.right) > 0.5 ||
    Math.abs(a.bottom - b.bottom) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5
  );
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
 * @param {(size:{w:number,h:number,resolution:number,
 *   safe:{top:number,right:number,bottom:number,left:number}}) => void} onChange
 * @returns {{refresh:()=>void, stop:()=>void, current:()=>{w:number,h:number,
 *   resolution:number,safe:object}}}
 */
export function watchViewport(host, onChange) {
  let last = { w: 0, h: 0, resolution: 0, safe: null };
  let settleUntil = 0;
  let stable = 0;
  let frame = 0;
  let stopped = false;
  let dprQuery = null;

  /** One measurement, applied if it moved. Returns whether it moved. */
  function apply() {
    const { w, h } = measureViewport();
    const resolution = resolutionFor(w, h);
    /**
     * The insets are part of the measurement, not something read off to the
     * side of it — and that is what makes a fullscreen transition land.
     *
     * A page entering fullscreen on a phone with a cutout keeps the size it
     * had and gains a notch: the browser was already drawing the status bar
     * area itself, and now the creative is under it. Same width, same height,
     * same pixel ratio — so a watcher that compares only those three sees
     * nothing happen and the boss name stays where it was, which is now behind
     * a camera. Rotation is the same story in reverse: a square-ish window
     * turning over swaps the notch from a side to the top without changing
     * either number by enough to notice.
     */
    const safe = measureSafeInsets({ w, h });
    // The ratio is compared loosely: it is a float off the device, and a
    // hairline difference is not worth rebuilding every texture for. So are the
    // insets, which are a used value off a computed style and can carry a
    // fraction of a point of rounding with them.
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

  /**
   * Fullscreen, entered and left — see goFullscreen in main.js.
   *
   * A `resize` usually comes with it and on a desktop it always does, which is
   * why this was never missed. On a phone it is the case where it does not: the
   * window keeps the size it had and only the insets move, and past that the
   * whole transition is a couple of hundred milliseconds of the browser
   * animating its own chrome away — during which every size reported is a size
   * that is on its way somewhere else. This is the signal that starts the
   * settle loop over that animation, so the layout follows the screen open
   * rather than being solved once against the middle of it.
   *
   * Both spellings: `webkit` is what an older iOS webview fires, and the
   * unprefixed name is not an alias of it there.
   */
  const DOC = ["fullscreenchange", "webkitfullscreenchange"];
  DOC.forEach((type) =>
    document.addEventListener(type, bump, { passive: true }),
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
