/**
 * Making an iPhone play at all — on every iPhone, not only the recent ones.
 *
 * Web Audio with nothing else behind it runs in what iOS calls an *ambient*
 * session, and an ambient session is silenced by the ring/silent switch on the
 * side of the phone. Not by the volume keys: a player with the switch flipped
 * holds volume-up at a creative that is never going to make a sound, decides
 * the ad is broken, and is right. It is the largest cause of a silent
 * impression on iOS that has nothing to do with the code making the noise.
 *
 * There are two ways out of an ambient session and this file has both, because
 * neither one covers the whole fleet:
 *
 *   - `navigator.audioSession`, iOS 16.4 and up. One property, and the honest
 *     answer: ask for `playback` and the switch stops applying. Every iPhone
 *     from March 2023 onward has it, and it is used wherever it exists.
 *   - A media element playing silence, for everything older. iOS works out the
 *     page's session from what the page is doing, and a page with an
 *     HTMLMediaElement playing is a page playing media rather than one making
 *     ambient noise — a session the switch does not silence, and the Web Audio
 *     graph is inside it too. So a few seconds of digital silence on a loop,
 *     started inside the same gesture that opens the audio, buys the older
 *     phones what the property buys the newer ones.
 *
 * The floor underneath both is Pixi's rather than ours: v8 wants WebGL2, so
 * nothing below iOS 15 renders this creative at all. The element is for the
 * band between there and 16.4, and it is deliberately not used above it — the
 * property is the better tool wherever there is a choice, and an audio element
 * playing for a whole session is a media indicator in the tab, a lock-screen
 * control, and a pipeline the host page might have wanted.
 *
 * Which is also why the whole file sits behind AUDIO.overrideSilentSwitch and
 * behind an iPhone check. On Android and on the desktop there is no switch to
 * play through, and a silent loop there would buy a speaker icon on the tab in
 * exchange for nothing at all.
 */

import { AUDIO } from "../config.js";

/** Sample rate for the silence. About as low as a WAV header may claim. */
const RATE = 8000;

/**
 * Seconds of it, and the only reason it is not a tenth of that.
 *
 * The element loops, and a loop is a stop and a start however gapless it
 * sounds. Each one is a moment where the page is not playing media and iOS
 * could decide the session is over, so the seam is worth having rarely rather
 * than eleven times a second. Four seconds of eight-bit mono is 32 kB built at
 * runtime and nothing at all in the bundle.
 */
const SECONDS = 4;

let keeper = null;
/** Whether the keeper is meant to be running, as against merely existing. */
let wanted = false;
/** True once the modern property has taken, which retires the element half. */
let asked = false;

/**
 * An iPhone, or the iPad that says it is a Mac.
 *
 * The check is on the hardware rather than the browser because every browser
 * on iOS is WebKit underneath — a silent switch is a silent switch whether the
 * player opened Safari, Chrome, or the in-app browser inside a social feed.
 */
function apple(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac. A Mac with a touchscreen is an iPad.
  return /Mac/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

/**
 * A few seconds of digital silence as a WAV, built here rather than shipped.
 *
 * Eight-bit mono at eight kilohertz, which is about the cheapest thing a WAV
 * header can describe and is not asked to carry anything: what matters to iOS
 * is that a media element is playing, not what it is playing. Built at runtime
 * because a base64 asset would be forty kilobytes of the one inlined file for
 * a sound nobody can hear.
 */
function silence() {
  const frames = RATE * SECONDS;
  const bytes = new Uint8Array(44 + frames);
  const view = new DataView(bytes.buffer);
  const tag = (at, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + frames, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true); // one byte per frame, so the same number
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits
  tag(36, "data");
  view.setUint32(40, frames, true);
  // Unsigned eight-bit silence is the midpoint, not zero. Zero is a DC offset
  // held at full negative deflection, which is a click into every loop and a
  // click out of it.
  bytes.fill(128, 44);

  let s = "";
  // In chunks: String.fromCharCode.apply on thirty-two thousand arguments is a
  // stack overflow on exactly the old phones this file is written for.
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  }
  return "data:audio/wav;base64," + btoa(s);
}

/** Start the keeper, or restart it if something stopped it. Never throws. */
function keep() {
  try {
    if (!keeper) {
      const el = document.createElement("audio");
      // Inline, or iOS takes the element full screen the moment it plays.
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      // Nothing here belongs on an AirPlay target or a lock screen.
      el.setAttribute("x-webkit-airplay", "deny");
      el.disableRemotePlayback = true;
      el.controls = false;
      // Not muted, and that is the whole point: iOS does not count a muted
      // element as the page playing media, and an element it does not count
      // buys nothing.
      el.muted = false;
      el.volume = 1;
      el.loop = true;
      el.preload = "auto";
      el.src = silence();
      // Attached. An element that was never in the document is one some
      // versions of WebKit decline to start.
      el.style.cssText =
        "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
      if (document.body) document.body.appendChild(el);
      // Belt and braces against a `loop` that did not: the seam is the one
      // moment the session can lapse, so a missed wrap is started again here.
      el.addEventListener("ended", () => {
        if (wanted) keep();
      });
      keeper = el;
    }
    if (keeper.paused) {
      const p = keeper.play();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {
    /* a creative that cannot play silence still has to play everything else */
  }
}

/**
 * Ask iOS for a session the silent switch does not apply to.
 *
 * Call it from inside a user gesture, and call it often: it is cheap once it
 * has taken, and the media element half needs the gesture. Call it before the
 * AudioContext is constructed, so whichever of the two halves is doing the
 * work has done it by the time there is a graph to put in the session — see
 * the call sites in engine.js, which also call it on the far side.
 */
export function promoteSession(w) {
  if (!AUDIO.overrideSilentSwitch || !w) return;
  const nav = w.navigator;
  if (nav && nav.audioSession) {
    try {
      // Read before writing. Every gesture in the session comes through here,
      // and asking for a playback session is the thing that stops whatever the
      // player was listening to — worth doing once, not sixty times a second.
      if (nav.audioSession.type !== "playback") {
        nav.audioSession.type = "playback";
      }
      asked = true;
    } catch (e) {
      /* an unknown session type is not a reason to lose the audio */
    }
    return;
  }
  // Older iOS, where the property does not exist. Everything else on earth has
  // no silent switch to play through and is left entirely alone.
  if (asked || !apple(nav)) return;
  if (typeof document === "undefined" || !document.createElement) return;
  wanted = true;
  keep();
}

/** Park the keeper with the rest of the audio: an off-screen ad holds nothing. */
export function sessionSleep(asleep) {
  if (!keeper) return;
  try {
    if (asleep) keeper.pause();
    else if (wanted) keep();
  } catch (e) {
    /* nothing in here is worth an exception */
  }
}

/** Whether the keeper is actually running. For the tests, and for nothing else. */
export function sessionKeeper() {
  return keeper;
}
