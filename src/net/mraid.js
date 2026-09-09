/**
 * MRAID: the container's half of the conversation.
 *
 * `window.mraid` is not something this file loads — it is injected into the
 * webview by the SDK the creative is playing inside, and the `<script
 * src="mraid.js">` at the top of index.html is how the creative asks for it.
 * That tag resolves against whatever base URL the network serves the ad from,
 * every SDK intercepts the request and answers it with its own build, and a
 * few of them (Google's among them) will not inject the object at all unless
 * the tag is there. Standalone, and on a network that injects regardless, the
 * request 404s and nothing happens: `window.mraid` stays undefined and every
 * function below turns into a no-op. That is the same fallback the CTA already
 * runs on — see net/cta.js.
 *
 * What is worth having from it is one thing that cannot be had any other way:
 * whether anybody is actually looking at this. A page uses
 * `document.visibilityState` for that and the creative listens to it, but
 * inside an SDK webview the document is very often *not* hidden while the ad
 * is scrolled off a feed or the app is in the background — the webview is
 * simply parked, still ticking, playing a thirty second fight to nobody and
 * losing it on their behalf. `viewableChange` is the container saying so out
 * loud, and it is the only honest signal there is.
 *
 * Two things this deliberately does not do:
 *
 *   - `useCustomClose(true)`. That tells the SDK to take its own close button
 *     away because the creative provides one. This creative does not provide
 *     one, and an ad a person cannot close is how an account gets pulled — the
 *     same rule that keeps goFullscreen out of a framed build.
 *   - Gate the start of the fight on any of it. A slot reporting itself
 *     viewable is not a person agreeing to be shown a monster; the fight
 *     starts on a touch and nothing here is allowed to start it. See
 *     firstTouch in main.js.
 *
 * Nothing in here may throw. A half-implemented wrapper is the normal case,
 * not the exception, and a creative that dies on one is a blank impression.
 */

/** The container's object, or null when this is just a web page. */
function host() {
  try {
    const m = globalThis.mraid;
    return m && typeof m === "object" ? m : null;
  } catch {
    // A cross-origin `window.mraid` access can throw in a hostile frame.
    return null;
  }
}

/** Whether an SDK is wrapping this creative at all. */
export function inContainer() {
  return host() !== null;
}

/**
 * The `ready` latch the head set, if this page carried one.
 *
 * See the inline script in index.html. It subscribes to `ready` before the
 * bundle exists, because the SDK fires that event within a few milliseconds
 * of the page loading and the module graph is only just evaluated by then —
 * subscribing from here is subscribing after the fact, which is precisely
 * what the networks' compliance checks fail a creative for.
 *
 * `{ ready, waiting }` is the whole of the contract. Absent — a page served
 * without the head script, which is a build mistake rather than a case worth
 * supporting, and the dev server before a hard reload — and whenReady falls
 * back to subscribing itself.
 */
function latch() {
  try {
    const l = globalThis.__siegeMraid;
    return l && typeof l === "object" && Array.isArray(l.waiting) ? l : null;
  } catch {
    return null;
  }
}

/**
 * Run `fn` once the container is ready to be talked to.
 *
 * MRAID has one rule about ordering and this is it: until the state leaves
 * `loading` the object exists but its methods are not required to answer, so
 * anything asked before then may come back a lie. `ready` is the event that
 * says the SDK has finished wiring itself up.
 *
 * A page with no container is ready by definition and `fn` runs on the spot.
 * A container that never fires `ready` never runs it — which is the correct
 * failure: everything that hangs off this is an improvement on the creative's
 * own behaviour, not a prerequisite for it.
 */
export function whenReady(fn) {
  const m = host();
  if (!m) {
    fn();
    return;
  }

  const armed = latch();
  if (armed) {
    if (armed.ready) fn();
    else armed.waiting.push(fn);
    return;
  }

  try {
    if (typeof m.getState !== "function" || m.getState() !== "loading") {
      fn();
      return;
    }
    let spent = false;
    const once = () => {
      if (spent) return;
      spent = true;
      try {
        m.removeEventListener("ready", once);
      } catch {
        /* a wrapper with no removeEventListener keeps the listener */
      }
      fn();
    };
    m.addEventListener("ready", once);
  } catch {
    // A wrapper that will not say whether it is ready is treated as ready:
    // late is recoverable, never is not.
    fn();
  }
}

export function openStore(url) {
  const m = host();
  if (!m || typeof m.open !== "function") return false;
  whenReady(() => {
    try {
      m.open(url);
    } catch {}
  });
  return true;
}

/**
 * Tell `fn` whether the ad is being looked at, whenever that changes.
 *
 * @param {(seen:boolean, live:boolean) => void} fn `seen` is whether anybody
 *   is looking; `live` is whether that came from the container saying so, as
 *   against being read off it at start-up.
 *
 * The two are not the same kind of fact and the caller has to be able to tell
 * them apart. A first reading is a guess about a slot that may not have been
 * measured yet, and SDKs are known to answer `false` at start-up and never
 * correct it — so anything irreversible, like holding the fight's clock, may
 * only be hung on an event. An event is the container's own word, which means
 * it is also a promise to send the other one when the ad comes back.
 *
 * MRAID 2 says `viewableChange` with a boolean; MRAID 3 replaced it with
 * `exposureChange` and a percentage. Both are subscribed, because which one
 * arrives is the SDK's business, and repeats are dropped — an SDK that reports
 * exposure on every scroll frame would otherwise suspend and resume the audio
 * sixty times a second.
 */
export function watchViewable(fn) {
  const m = host();
  if (!m) return;

  let last = null;
  const settle = (seen, live) => {
    if (seen === last) return;
    last = seen;
    try {
      fn(seen, live);
    } catch {
      /* a listener that throws must not take the container down with it */
    }
  };

  whenReady(() => {
    const on = (type, handler) => {
      try {
        m.addEventListener(type, handler);
      } catch {
        /* an SDK without this event is an SDK that never sends it */
      }
    };

    on("viewableChange", (v) => settle(!!v, true));
    on("exposureChange", (pct) => settle(Number(pct) > 0, true));
    // Only the one state that means the ad is going away. The others —
    // `default`, `expanded`, `resized` — are about the size of the container,
    // and that is watchSize's half of the job.
    on("stateChange", (state) => {
      if (state === "hidden") settle(false, true);
    });

    let seen = true;
    try {
      if (typeof m.isViewable === "function") seen = !!m.isViewable();
      if (typeof m.getState === "function" && m.getState() === "hidden") {
        seen = false;
      }
    } catch {
      // A wrapper that will not answer is not a reason to park the creative.
      seen = true;
    }
    settle(seen, false);
  });
}

/**
 * Tell `fn` when the container says the ad's box changed size.
 *
 * @param {(w:number, h:number) => void} fn the container's own numbers, which
 *   are advisory — the caller re-measures rather than trusting them.
 *
 * The creative already watches every size signal the *page* can produce — see
 * watchViewport, which listens to resize, orientationchange, the visual
 * viewport, a ResizeObserver on the root and the screen orientation object.
 * That is what this was left out for, and on most containers it is genuinely
 * enough.
 *
 * It is not enough on all of them, and the case it misses is the one MRAID
 * invented this event for: an SDK that resizes the ad's own frame from the
 * native side without the webview reporting a resize into the page. Both
 * orientations have to work, and on such a container nothing else in the
 * creative would ever be told that one had become the other. Every network's
 * compliance check asks for this listener by name for that reason.
 *
 * What it does is nudge the measurement rather than take the numbers: `w` and
 * `h` come from the SDK and describe the frame it just made, which is not
 * always the box the canvas ended up in, and there is a real measurement one
 * function call away. Re-measuring on a signal that turns out to be a
 * duplicate costs a frame; believing a wrong number costs the layout.
 */
export function watchSize(fn) {
  const m = host();
  if (!m) return;

  const on = (type, handler) => {
    try {
      m.addEventListener(type, handler);
    } catch {
      /* an SDK without this event is an SDK that never sends it */
    }
  };

  const bump = (w, h) => {
    try {
      fn(Number(w) || 0, Number(h) || 0);
    } catch {
      /* a listener that throws must not take the container down with it */
    }
  };

  on("sizeChange", bump);
  // The state half of the same fact: `expanded` and `resized` are the two
  // states that arrive with a new box, and an SDK is allowed to announce the
  // change either way round.
  on("stateChange", (state) => {
    if (state === "default" || state === "expanded" || state === "resized") {
      bump(0, 0);
    }
  });
}

/**
 * What the container is saying right now, for `__SIEGE__.mraid()`.
 *
 * The one thing that cannot be worked out from the outside on a real device:
 * whether the object arrived at all, and what it thinks the state is. Read off
 * a phone during a network test, and worth nothing anywhere else.
 */
export function mraidReport() {
  const m = host();
  if (!m) return { present: false };
  const ask = (name) => {
    try {
      return typeof m[name] === "function" ? m[name]() : undefined;
    } catch {
      return "threw";
    }
  };
  return {
    present: true,
    version: ask("getVersion"),
    state: ask("getState"),
    viewable: ask("isViewable"),
    placement: ask("getPlacementType"),
  };
}
