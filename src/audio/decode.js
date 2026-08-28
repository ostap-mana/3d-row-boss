/**
 * Turning an inlined asset into an AudioBuffer, defensively.
 *
 * Shared by tracks.js and samples.js, which are the only two things in the
 * creative that load audio rather than synthesizing it. Both of them are
 * allowed to fail — there is a synthesized fallback behind each — so
 * everything here reports failure rather than throwing it.
 *
 * Nothing in here goes near the network. The assets arrive as data: URIs
 * inlined at build time and are turned back into bytes in-process, because ad
 * networks reject creatives that reference anything off-host and QA greps the
 * built file for `http`. The `fetch` branch exists for `vite dev`, where the
 * import is still a path on disk, and never runs in a build.
 */

import { audioContext, onAudioNeedsRoom, onAudioOpen } from "./engine.js";

/** The bytes of an inlined asset. */
export function bytes(url) {
  if (url.slice(0, 5) === "data:") {
    const raw = atob(url.slice(url.indexOf(",") + 1));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  return fetch(url).then((r) => r.arrayBuffer());
}

/**
 * The scratch context the assets are decoded on, built at most once.
 *
 * Kept in a module variable rather than made per call, and that is not a
 * micro-optimisation — it is the difference between an iPhone that has sound
 * and one that does not. WebKit caps how many audio contexts may exist at
 * once, and an OfflineAudioContext counts against the same cap as the real
 * one; a context is only given back when it is closed, and one that is merely
 * unreferenced is not closed. This file used to build a fresh one per asset,
 * so four of them — the two music cuts in tracks.js, the sprite and the room
 * in samples.js — were alive and holding slots before the page had been
 * touched. The live context is built on the first touch, after all four, and
 * on the far side of that cap `new AudioContext()` does not return a parked
 * context to resume: it throws. engine.js catches it, returns null, and every
 * sound for the rest of the session is dropped on the floor by a creative
 * that never had a context to play them through.
 *
 * One decoder for every asset, released the moment it is no longer needed.
 */
let scratch = null;
/** Decodes still running on it. It cannot be closed out from under them. */
let decoding = 0;

/**
 * Give the scratch context's slot back, once nothing is still decoding on it.
 *
 * Called when the live context appears and after the last decode settles,
 * whichever is second, because the slot is worth most to whoever needs one
 * next — and after a call or a lock screen that is engine.js's rebuild, which
 * builds a replacement context and is the last line of defence against a
 * session going silent.
 */
function release() {
  if (decoding > 0 || !audioContext()) return;
  evict();
}

/**
 * Close the scratch context now, whatever it was in the middle of.
 *
 * The unconditional half of release, and the difference matters: this one is
 * called when the live context could not be built at all, which is a session
 * with no sound in it. A decode abandoned here resolves to null and the caller
 * falls back to its synthesized twin — one recording traded for one synth
 * voice, against every sound in the fight. It takes the trade every time.
 *
 * Note what it does not do: ask engine.js anything. It is called from inside
 * the constructor's own failure path, where the context does not exist yet and
 * a question about it would build one — which is the call that just threw.
 */
function evict() {
  if (!scratch) return;
  const dead = scratch;
  scratch = null;
  try {
    if (dead.close) dead.close();
  } catch (e) {
    /* a scratch context that will not close is not worth an exception */
  }
}

/**
 * Something that can decode, gesture or no gesture.
 *
 * The live context if there is one, because a buffer decoded at its own rate
 * needs no resampling at playback. Otherwise the one scratch context above,
 * which every browser will build before the first touch — and that is the
 * whole point, because both callers start decoding at module load rather than
 * at the tap.
 */
export function decoder() {
  const live = audioContext();
  if (live) {
    release();
    return live;
  }
  if (scratch) return scratch;
  if (typeof window === "undefined") return null;
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctor) return null;
  try {
    // One frame at a plausible device rate: nothing is rendered through this
    // context, it exists only to own decodeAudioData. A buffer that comes back
    // at a rate the live context does not share is resampled by the source
    // node at playback, so the number here costs nothing but the constructor's
    // approval of it.
    scratch = new Ctor(1, 1, 48000);
  } catch (e) {
    scratch = null;
  }
  return scratch;
}

// The other half of release, and the one that fires in the common case: every
// asset is usually decoded and done long before the first touch, so by the
// time the live context exists there is no decode left to settle and nothing
// else would ever ask for the slot back. Handing it over here is what leaves
// exactly one context alive for the session — and one spare for the rebuild
// engine.js falls back on when iOS parks the audio mid-fight.
onAudioOpen(release);

// And the emergency: a live context that could not be built is worth more than
// every recording in the creative put together. See evict.
onAudioNeedsRoom(evict);

/** decodeAudioData, in the callback form every browser still understands. */
export function decode(c, buf) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (b) => {
      if (!settled) {
        settled = true;
        resolve(b);
      }
    };
    const no = (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    };
    try {
      const p = c.decodeAudioData(buf, ok, no);
      // Chrome returns a promise as well as calling back; Safari used not to.
      if (p && p.then) p.then(ok, no);
    } catch (e) {
      no(e);
    }
  });
}

/**
 * Where the audio actually starts, in seconds into the buffer.
 *
 * Every asset here is written with 150 ms of digital silence in front of it,
 * because an MP3 decoder is entitled to leave the encoder's priming samples in
 * the buffer and browsers disagree about whether to. Finding the head rather
 * than trusting the offset is what makes that disagreement stop mattering:
 * every offset in tracks.js and samples.js is measured from what this returns.
 *
 * One per cent of the peak rather than an absolute floor: an MP3 encoder puts
 * a little pre-echo in front of a hard onset, and a fixed threshold either
 * catches that or misses a quiet asset entirely.
 */
export function findHead(buffer) {
  const d = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    const v = d[i] < 0 ? -d[i] : d[i];
    if (v > peak) peak = v;
  }
  if (peak <= 0) return 0;
  const floor = peak * 0.01;
  for (let i = 0; i < d.length; i++) {
    const v = d[i] < 0 ? -d[i] : d[i];
    if (v > floor) return i / buffer.sampleRate;
  }
  return 0;
}

/**
 * Bytes to buffer, with the head already found.
 *
 * Resolves to `{ buffer, head }`, or to null if anything at all went wrong —
 * no decoder, a refused file, a decode that threw. The caller falls back.
 */
export function loadAudio(url) {
  return bytes(url)
    .then((raw) => {
      const c = decoder();
      if (!c) throw new Error("no decoder");
      // Counted across the settle below rather than around the call, because
      // decodeAudioData is asynchronous and a context closed while it is still
      // working is a decode that never comes back. See release.
      decoding++;
      return decode(c, raw).then(
        (b) => {
          decoding--;
          release();
          return b;
        },
        (e) => {
          decoding--;
          release();
          throw e;
        },
      );
    })
    .then((buffer) => ({ buffer, head: findHead(buffer) }))
    .catch(() => null);
}
