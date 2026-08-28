/**
 * The synth every sound in the creative is built out of.
 *
 * Synthesized, never sampled. The build is one inlined HTML file and every byte
 * in it is a byte of load time before the first frame — a sample pack for the
 * forty-odd noises this fight makes would be a few hundred kilobytes of base64
 * against the eight or so this file costs. Nothing here is fetched, decoded or
 * waited on: the first sound is ready the moment the player touches the screen.
 *
 * Three rules the whole file is shaped by:
 *
 *   - Nothing plays before a touch. Mobile browsers suspend a context that was
 *     never opened by a gesture, and an ad that made noise at somebody in a bus
 *     would deserve the mute it got. The intro's own sounds are simply dropped —
 *     see unlockAudio.
 *   - Nothing is trusted. A webview with no AudioContext, a context that throws
 *     on construction, a node that refuses to start: every one of those is a
 *     creative that plays silently, never one that fails to play.
 *   - Nothing is unbounded. A five-step cascade with a party volley behind it
 *     asks for dozens of voices inside a second, so there is a hard cap on how
 *     many can be in the air and a compressor across the sum of them. Phone
 *     speakers clip long before the mix does.
 */

import { AUDIO } from "../config.js";
import { promoteSession, sessionSleep } from "./session.js";

/** Floor for every exponential ramp — the curve cannot reach or pass zero. */
const MIN = 0.0001;

/** Seconds of white noise baked once and reused by every hiss and crack. */
const NOISE_SECONDS = 2;

/**
 * How long a context may go on refusing to open before we stop believing it.
 *
 * Long enough that an ordinary `resume()` — a promise, and a slow one on a
 * cheap phone — has had every chance to settle, short enough that the player is
 * still on their first swipe when the last resort fires. See rebuild.
 */
const STUBBORN_MS = 1200;

/** And how long before we are allowed to give up on the *next* one. */
const REBUILD_GAP_MS = 4000;

/** An attempt per drag frame would be dozens a second. This is the floor. */
const MOVE_GAP_MS = 120;

const now = () => Date.now();

let ctx = null;
/** Compressor everything lands on, and the gain the mute switch owns. */
let bus = null;
let master = null;
let noiseBuf = null;
let voices = 0;
let muted = false;
/** True once the context has actually reached `running` — not once we tried. */
let opened = false;
let watching = false;
/**
 * True from the first gesture onward, and the gate on building a context at all.
 *
 * A context built before anybody has touched the screen is the single largest
 * cause of a silent session on iOS. WebKit hands one back already parked, and a
 * context parked that way is not reliably resumable afterwards — `resume()`
 * settles, the state does not move, and every sound for the rest of the session
 * is scheduled into silence. Built from inside a gesture instead, it is born
 * `running` and never needs resuming at all.
 *
 * So nothing constructs one early any more, not even a sound asking to play:
 * the intro's noises are dropped without a context ever existing, which is what
 * the header of this file promised all along.
 */
let gestured = false;
/**
 * Subscribers, kept rather than spent.
 *
 * The context can be thrown away and rebuilt underneath them — see rebuild —
 * and everything hanging off the audio opening has to hang off the new one too,
 * or the bed is a set of nodes on a context that is closed.
 */
const openCbs = [];
/** Called when a context is thrown away, so whoever holds nodes lets go. */
const resetCbs = [];
/**
 * Called when the browser refuses to build a context at all, so that anything
 * holding one it does not strictly need gives it up. See onAudioNeedsRoom.
 */
const roomCbs = [];
/** When the context first refused to open, and when we last gave up on one. */
let refusedAt = 0;
let rebuiltAt = 0;
/** True while context() is inside itself. See the guard at the top of it. */
let building = false;

/** No window, no audio — and the creative still has to run. */
function host() {
  return typeof window === "undefined" ? null : window;
}

function hidden() {
  return typeof document !== "undefined" && document.hidden;
}

/**
 * Whether the page has ever been touched, according to the browser rather than
 * to us. Covers the gestures that landed before this module was listening.
 */
function hasBeenActive(w) {
  try {
    return !!(
      w.navigator &&
      w.navigator.userActivation &&
      w.navigator.userActivation.hasBeenActive
    );
  } catch (e) {
    return false;
  }
}

/** Run a subscriber list, where one of them throwing does not cost the rest. */
function fire(list) {
  list.slice().forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* one listener throwing is not worth the rest of the audio */
    }
  });
}

/**
 * The audio is genuinely open. Everything that was waiting on that runs.
 *
 * Once per context, and again after a rebuild, because the subscribers are the
 * things that own nodes and a new context needs new ones.
 */
function opening() {
  if (opened) return;
  opened = true;
  refusedAt = 0;
  fire(openCbs);
}

/**
 * Watch the context's own account of itself.
 *
 * Two things this catches that a flag of our own could not. Safari parks a
 * context as `interrupted` — a call, a route change, a lock screen — and an
 * interrupted context never comes back on its own. And `resume()` is a
 * promise: the gesture that finally opens the audio has long since returned by
 * the time the state flips, so nothing that must *begin* on the first sound
 * can hang off the handler that unlocked it.
 */
function watch(c) {
  if (watching || typeof c.addEventListener !== "function") return;
  watching = true;
  c.addEventListener("statechange", () => {
    if (c.state === "running") {
      opening();
      return;
    }
    // Only what was taken from us, and only while somebody is looking: a
    // context we parked ourselves reads `suspended`, and the ad being off
    // screen is the one case where the silence is the point.
    if (c.state === "interrupted" && opened && !hidden()) {
      try {
        c.resume().catch(() => {});
      } catch (e) {
        /* nothing left to try */
      }
    }
  });
}

/**
 * The context, built on the first gesture and not before it.
 *
 * Which is the whole trick, and it is the opposite of what this used to do.
 * Built early — and the boss is already rising by the time anybody touches the
 * screen — it is born parked, and a context iOS parked before the page was
 * ever touched is one `resume()` may never get back. Built from inside the
 * gesture, it is born `running` and there is nothing to resume.
 *
 * So the intro's sounds are not merely inaudible before the first touch: there
 * is no context for them to be scheduled into, and they are dropped on the
 * floor by design. Everything below returns null until then.
 */
function context() {
  if (ctx || !AUDIO.on) return ctx;
  // Re-entrancy guard. The failure path below runs subscribers, and a
  // subscriber that asks for the context it is helping to build would come
  // straight back through here to the constructor that just threw.
  if (building) return null;
  const w = host();
  if (!w) return null;
  // Not one is built before the first gesture — see `gestured`. A page the
  // browser already counts as interacted with counts here too, so a sound asked
  // for between that gesture and our own handler is not dropped for nothing.
  if (!gestured && !hasBeenActive(w)) return null;
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;

  // Before the constructor, where it used not to be. A context takes its
  // category from the session in force when it is built, so a `playback`
  // session asked for afterwards is a context that was already born ambient —
  // and an ambient context is the one the ring/silent switch mutes, which is
  // the exact failure this call exists to prevent.
  promoteSession(w);

  building = true;
  try {
    ctx = new Ctor();
  } catch (e) {
    // Out of contexts, almost certainly — see onAudioNeedsRoom. Ask for one
    // back and try exactly once more, because the alternative is a session
    // that never makes a sound and there is nothing else left to try.
    fire(roomCbs);
    try {
      ctx = new Ctor();
    } catch (e2) {
      building = false;
      return null;
    }
  }
  building = false;

  // And again, on the far side of it. Which order WebKit actually wants is not
  // worth being clever about: the second ask is a no-op once the first has
  // taken, and asking in only the wrong one of the two would cost the creative
  // its sound on every iPhone with the switch flipped.
  promoteSession(w);
  watch(ctx);

  bus = ctx.createDynamicsCompressor();
  bus.threshold.value = -16;
  bus.knee.value = 22;
  bus.ratio.value = 9;
  bus.attack.value = 0.003;
  bus.release.value = 0.2;

  master = ctx.createGain();
  master.gain.value = muted ? 0 : AUDIO.master;

  bus.connect(master);
  master.connect(ctx.destination);

  // Born running is the good case, and a silent one if nothing notices: there
  // is no `statechange` to follow a state that never changed, so the
  // subscribers are called here or they are never called at all. This used to
  // set the flag and skip them, which cost the lava bed every session that
  // opened cleanly — and opening cleanly is the common case now, because the
  // context is built from inside the gesture rather than long before it.
  if (ctx.state === "running") opening();
  return ctx;
}

/** The live context, or null. Only the bed — see sfx.js — needs this. */
export function audioContext() {
  return context();
}

/** Where every voice connects. Null until the context exists. */
export function audioBus() {
  context();
  return bus;
}

/** Whether sound is actually coming out, rather than merely having been asked for. */
export function audioReady() {
  return !!ctx && ctx.state === "running";
}

/**
 * Run `fn` the moment the audio is genuinely open, or now if it already is.
 *
 * Anything that has to *begin* with the first sound — the bed — hangs off this
 * rather than off a gesture, because the gesture handler has returned long
 * before `resume()` settles.
 */
export function onAudioOpen(fn) {
  // Subscribed either way: a rebuilt context has to start the bed again.
  openCbs.push(fn);
  if (audioReady()) fn();
}

/**
 * Run `fn` when a context is thrown away.
 *
 * Anything holding nodes has to let go of them here. A node belongs to the
 * context that made it, and the context that made these is closed.
 */
export function onAudioReset(fn) {
  resetCbs.push(fn);
}

/**
 * Run `fn` when a context could not be built, to free one that can be spared.
 *
 * There is a cap on how many audio contexts may exist at once — a small one on
 * WebKit, and an OfflineAudioContext counts against it — and past that cap the
 * constructor throws rather than handing back something to resume. That is a
 * creative with no sound at all for the rest of the session, which is the
 * worst failure in this file, so it is worth spending anything at all to
 * avoid: a subscriber here gives up a decode still in flight, and a decode
 * given up is one sound falling through to its synthesized twin. See
 * audio/decode.js, which is the only subscriber and holds the only context
 * that is ever expendable.
 */
export function onAudioNeedsRoom(fn) {
  roomCbs.push(fn);
}

/**
 * Throw the context away and build its replacement here and now.
 *
 * Only ever called from inside a gesture — see the note at the call site for
 * when, and for why a context sometimes has to be given up on rather than
 * resumed. Everything derived from the old one goes with it: the bus, the
 * noise buffer every hiss reads out of, the voice count whose `onended`
 * callbacks are never going to arrive, and — through resetCbs — the bed's own
 * nodes, which belong to a context that is about to be closed.
 */
function rebuild() {
  const dead = ctx;
  ctx = null;
  bus = null;
  master = null;
  noiseBuf = null;
  voices = 0;
  opened = false;
  watching = false;
  refusedAt = 0;
  rebuiltAt = now();
  // Before the replacement, so nothing is still holding a node off the dead
  // context by the time the new one starts handing out live ones.
  fire(resetCbs);
  if (dead) {
    try {
      dead.close();
    } catch (e) {
      /* a context that will not close is one we have already let go of */
    }
  }
  return context();
}

/**
 * Open the audio, from inside a user gesture.
 *
 * Safe to call on every gesture and free after the first: the live state is
 * the guard, so audio taken away mid-fight simply comes back on the next
 * swipe rather than staying gone for the session.
 *
 * Three things used to go wrong here and every one of them cost a session its
 * sound. `resume()` was only tried while the state read exactly `suspended`,
 * so Safari's `interrupted` was a dead end. The silent tick was a one-shot,
 * spent on the first `pointerdown` — an event that for a finger carries no
 * user activation at all — so the tick went into a locked context and the
 * `touchend` that could have opened it never got one. And the context itself
 * was already built and already parked by the time any of that ran, which is
 * the one of the three that no amount of resuming could answer: hence
 * `gestured`, which holds construction back until we are inside a gesture, and
 * hence rebuild, for the contexts that are parked anyway.
 *
 * A tap survived all three by accident. A swipe, which is the only thing
 * anybody does to a match-3 board, did not.
 *
 * @returns {boolean} whether the context is running *already*; the gesture
 *   that does the opening reports false, because resume() has not settled yet.
 *   Use onAudioOpen to be told, and audioReady to ask.
 */
export function unlockAudio() {
  gestured = true;
  // First, and on every gesture rather than the first one. On iOS this is
  // what decides whether the ring/silent switch applies to everything
  // below, and on the phones that need a media element for it, the gesture
  // is the only thing allowed to start one. See audio/session.js.
  promoteSession(host());
  let c = context();
  if (!c) return false;
  // Also the fallback for a webview with no `statechange` to listen to: the
  // gesture after the one that opened the audio is what notices, and notices
  // is all anything waiting on onAudioOpen needs.
  if (c.state === "running") {
    refusedAt = 0;
    if (!opened) opening();
    return true;
  }

  // The last resort, and the one cure for the failure this file exists to
  // avoid. A context iOS has parked — built before the first touch, or taken
  // away by a call — can sit at `suspended` or `interrupted` through every
  // gesture left in the session: the resume promise settles and the state never
  // moves. Nothing short of a new context fixes that, and the gesture we are
  // inside is what makes the new one open cleanly. Rate limited on both sides,
  // because a drag is dozens of events and a fresh AudioContext per event would
  // be worse than the silence. Never while the ad is off screen, where a
  // suspended context is one we parked ourselves and meant to.
  const t = now();
  if (!refusedAt) refusedAt = t;
  if (
    !hidden() &&
    t - refusedAt > STUBBORN_MS &&
    t - rebuiltAt > REBUILD_GAP_MS
  ) {
    c = rebuild();
    if (!c) return false;
    if (c.state === "running") return true;
  }

  if (c.resume) {
    try {
      c.resume().catch(() => {});
    } catch (e) {
      /* the tick below is the other half and may still land */
    }
  }

  // The iOS half: some builds keep a resumed context muted until a node has
  // actually played through it. Every attempt gets one, until one of them
  // takes — see the note above about why this used to be a one-shot.
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
  } catch (e) {
    /* the resume above was the part that mattered */
  }

  return c.state === "running";
}

/**
 * Every gesture on the page tries to open the audio, for the whole session.
 *
 * Call this before anything is awaited. It used to be wired up at the end of
 * boot, behind a font decode and fourteen bitmaps, so a player who touched the
 * creative while it was still loading spent the one gesture that mattered on
 * nothing at all.
 *
 * The list is deliberately *everything*, rather than the events that are
 * supposed to carry user activation, and that is the whole fix:
 *
 *   - By the letter of it, a finger's activation rides on `pointerup` and
 *     `touchend`. Neither of those is guaranteed to arrive. A drag that iOS
 *     decides to take over ends in `pointercancel` and `touchcancel` and never
 *     delivers either one — and a drag is the only thing anybody does to a
 *     match-3 board. That is how session after session came up mute while a
 *     stray tap on the frame fixed it instantly, which is exactly backwards
 *     from what the creative asks the player to do.
 *   - So the cancels are in the list, and so are the moves. WebKit's own notion
 *     of "inside a user gesture" is wider than the specified one and a
 *     `touchmove` often satisfies it; on the browsers where it does not, the
 *     attempt costs a state read. Which is also why the moves are rate limited
 *     rather than left to fire sixty times a second — and why every event here
 *     is free once the audio is open, since unlockAudio returns on the first
 *     line from then on.
 *   - For the rest of the session, never removed, because the audio can be
 *     taken away again — a call, a route change, a lock screen — and the next
 *     swipe should hand it back without anybody noticing.
 *
 * Capture phase on `window`, which is the first thing in the propagation path:
 * nothing further down — Pixi's own canvas listeners included — can stop these
 * from running, whatever it does with the event afterwards.
 */
const GESTURES = [
  "pointerdown",
  "pointerup",
  "pointercancel",
  "touchstart",
  "touchend",
  "touchcancel",
  "mousedown",
  "mouseup",
  "click",
  "keydown",
  "keyup",
];

/** The high-rate ones, which get an attempt at most every MOVE_GAP_MS. */
const MOVES = ["pointermove", "touchmove", "mousemove"];

let installed = false;

export function installAudioUnlock() {
  const w = host();
  if (installed || !w || typeof w.addEventListener !== "function") return;
  installed = true;

  const opts = { capture: true, passive: true };
  const wake = () => unlockAudio();

  let lastMove = 0;
  const moved = () => {
    if (audioReady()) return;
    const t = now();
    if (t - lastMove < MOVE_GAP_MS) return;
    lastMove = t;
    unlockAudio();
  };

  GESTURES.forEach((type) => w.addEventListener(type, wake, opts));
  MOVES.forEach((type) => w.addEventListener(type, moved, opts));
}

/** Park the audio while the ad is off screen; wake it when it comes back. */
export function audioSleep(asleep) {
  // Above the guard below, because the silent-switch keeper is not the context
  // and an ad parked off screen should not be holding a media session open.
  sessionSleep(asleep);
  // Only a context that genuinely opened. Suspending one that never did is
  // itself a way to park a context somewhere resume() cannot reach it, and an
  // ad preloaded into an off-screen slot gets that visibilitychange every time.
  if (!ctx || !opened) return;
  try {
    if (asleep) ctx.suspend();
    else ctx.resume();
  } catch (e) {
    /* a context that will not park is not worth a broken creative */
  }
}

export function setMuted(on) {
  muted = !!on;
  if (master) master.gain.value = muted ? 0 : AUDIO.master;
}

export function isMuted() {
  return muted;
}

/** Whether another voice can be spared. */
function spare() {
  return voices < AUDIO.maxVoices;
}

/** Count a source in for as long as it runs. */
function track(node) {
  voices++;
  node.onended = () => {
    voices = Math.max(0, voices - 1);
  };
}

/**
 * Attack, optional hold, exponential fall.
 *
 * Exponential rather than linear on the way down because a linear fade reads as
 * a sound being switched off, and every one of these is something being hit.
 */
function shape(param, t0, dur, peak, attack, hold) {
  const a = attack === undefined ? 0.005 : attack;
  const top = Math.max(MIN * 2, peak);
  const held = t0 + a + (hold || 0);
  param.setValueAtTime(MIN, t0);
  param.exponentialRampToValueAtTime(top, t0 + a);
  if (hold) param.setValueAtTime(top, held);
  param.exponentialRampToValueAtTime(MIN, Math.max(held + 0.02, t0 + dur));
}

function noiseBuffer(c) {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * NOISE_SECONDS);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/**
 * One oscillator through its own envelope, and optionally its own filter.
 *
 * @param {object} o
 *   freq/to/bend — pitch, where it ends up, and how long it takes to get there
 *   type         — oscillator shape
 *   dur/attack/hold/gain — the envelope
 *   cut/cutTo/cutType/q  — a filter in front of the envelope
 *   delay        — schedule it this far into the future
 */
export function tone(o) {
  const c = context();
  if (!c || muted || !spare()) return;
  const t0 = c.currentTime + (o.delay || 0);
  const dur = o.dur === undefined ? 0.2 : o.dur;

  const osc = c.createOscillator();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(Math.max(20, o.freq), t0);
  if (o.to !== undefined) {
    const bend = o.bend === undefined ? dur : o.bend;
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + bend);
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

  const g = c.createGain();
  shape(
    g.gain,
    t0,
    dur,
    o.gain === undefined ? 0.22 : o.gain,
    o.attack,
    o.hold,
  );

  let head = g;
  if (o.cut) {
    const f = c.createBiquadFilter();
    f.type = o.cutType || "lowpass";
    f.frequency.setValueAtTime(Math.max(40, o.cut), t0);
    if (o.cutTo) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutTo), t0 + dur);
    }
    if (o.q !== undefined) f.Q.value = o.q;
    f.connect(g);
    head = f;
  }

  osc.connect(head);
  g.connect(o.dest || bus);
  track(osc);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/**
 * A band of noise: every hiss, crack, whoosh and crunch in the fight.
 *
 * Read from a random offset in the shared buffer, because two hits in a row off
 * the same start sample are audibly the same hit twice.
 */
export function noise(o) {
  const c = context();
  if (!c || muted || !spare()) return;
  const t0 = c.currentTime + (o.delay || 0);
  const dur = o.dur === undefined ? 0.18 : o.dur;

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, t0);

  const f = c.createBiquadFilter();
  f.type = o.type || "bandpass";
  f.frequency.setValueAtTime(
    Math.max(40, o.freq === undefined ? 1200 : o.freq),
    t0,
  );
  if (o.to !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
  }
  f.Q.value = o.q === undefined ? 1 : o.q;

  const g = c.createGain();
  shape(g.gain, t0, dur, o.gain === undefined ? 0.2 : o.gain, o.attack, o.hold);

  src.connect(f);
  f.connect(g);
  g.connect(o.dest || bus);
  track(src);
  // Clamped: a sound longer than the buffer would ask to start at a negative
  // offset, and that is one of the few things a real context throws on. The
  // source loops, so an offset of zero is a correct answer for any length.
  src.start(t0, Math.max(0, Math.random() * (NOISE_SECONDS - dur - 0.1)));
  src.stop(t0 + dur + 0.05);
}

/** Several notes at once, spread by `spread` seconds so they arrive as one. */
export function chord(freqs, o) {
  const spread = (o && o.spread) || 0.012;
  freqs.forEach((f, i) => {
    tone({
      ...o,
      freq: f,
      to: o && o.to ? o.to * (f / freqs[0]) : undefined,
      delay: ((o && o.delay) || 0) + i * spread,
    });
  });
}
