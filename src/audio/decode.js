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

import { audioContext } from "./engine.js";

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
 * Something that can decode, gesture or no gesture.
 *
 * The live context if there is one, because a buffer decoded at its own rate
 * needs no resampling at playback. Otherwise an offline one, which every
 * browser will build before the first touch — and that is the whole point,
 * because both callers start decoding at module load rather than at the tap.
 */
export function decoder() {
  const live = audioContext();
  if (live) return live;
  if (typeof window === "undefined") return null;
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor(1, 1, 48000);
  } catch (e) {
    return null;
  }
}

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
      return decode(c, raw);
    })
    .then((buffer) => ({ buffer, head: findHead(buffer) }))
    .catch(() => null);
}
