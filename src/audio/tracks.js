/**
 * The game's own music, as recorded.
 *
 * Everything else this creative makes noise with is synthesized — see the
 * header of engine.js for why, and music.js for the same argument carried as
 * far as a theme written out in notes. This file is where that argument stops.
 *
 * A synthesized theme is the right trade when what it replaces is a generic
 * loop nobody would recognise: eight kilobytes against a quarter of a megabyte,
 * for music that does the same job. It is the wrong trade against *this* music.
 * The creative is an ad for a game that has a score of its own, and the player
 * who has heard it knows it inside a bar; the one who has not is at least
 * hearing the real thing rather than an impression of it. Neither is worth
 * giving up to save bytes the budget already has — two mono 64 kbps files,
 * about 313 kB on disk and 416 kB once they are base64 inside the one inlined
 * index.html, against a five-megabyte ceiling.
 *
 * Two rules, both inherited from engine.js:
 *
 *   - Nothing is trusted. A webview with no decodeAudioData, an MP3 it refuses,
 *     a decode that never settles — each of those falls back to the synth
 *     theme rather than to silence. The synth is still in the build and this
 *     file is allowed to fail. See `request`.
 *   - Nothing is fetched. The assets are inlined as data: URIs at build time
 *     and turned back into bytes in-process, because ad networks reject
 *     creatives that reference anything off-host and QA greps the built file
 *     for `http`. The `fetch` branch below exists for `vite dev`, where the
 *     import is still a path on disk, and never runs in a build.
 *
 * The loop is the only part with a trick in it. Both assets carry 150 ms of
 * digital silence at each end, because an MP3 decoder is entitled to leave the
 * encoder's priming samples in the buffer and browsers disagree about whether
 * to. So the loop points are not the buffer's edges: the head is found rather
 * than assumed — see findHead in decode.js — and the loop runs from there for
 * exactly the length in TRACKS, a whole number of bars cut and crossfaded
 * before encoding. What the decoder did or did not trim then stops mattering.
 */

import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioOpen, onAudioReset } from "./engine.js";
import { loadAudio } from "./decode.js";
import battleUrl from "../assets/audio/battle.mp3";
import endcardUrl from "../assets/audio/endcard.mp3";

/** Floor for every exponential ramp — the curve cannot reach or pass zero. */
const MIN = 0.0001;

/**
 * The two cuts, and the exact length of the loop inside each.
 *
 * `loop` is not a measurement taken from the file — it is the length the file
 * was cut to, sixteen bars of MUSIC_INGAME_PRO at 161.9 BPM and twelve of
 * MUSIC_LOBBY, and it is written here to four places because a loop that is
 * a millisecond long in either direction drifts audibly inside half a minute.
 * Changing an asset means changing the number beside it: cut on a bar boundary,
 * crossfade the seam into the bar that followed it, and pad both ends with
 * 150 ms of silence for the head-finding above.
 */
const TRACKS = {
  /** The fight. Sixteen bars, so it outlasts the twenty-six the player gets. */
  battle: { url: battleUrl, loop: 23.7184, fade: 1.4 },
  /** The lobby theme, under the end card. Twelve bars. */
  endcard: { url: endcardUrl, loop: 15.4839, fade: 0.5 },
};

/**
 * How long a decode may take before the synth is started instead.
 *
 * Long enough that a cheap phone chewing through a quarter-megabyte of MP3 is
 * not cut off for being slow, short enough that nobody watches the fight open
 * in silence. The decode is kicked off at module load, so by the time a gesture
 * has arrived this has usually already elapsed with the buffer in hand.
 */
const GRACE_MS = 900;

let live = null;
/** What is meant to be playing, which outlives the nodes playing it. */
let wanted = null;
/** Quantized tension, so a per-frame call is not a per-frame ramp. */
let tension = -1;

/**
 * Kicked off at module load — see GRACE_MS. Resolves to true or false.
 *
 * The decode itself lives in decode.js, which samples.js loads its sprite
 * through as well; what is left here is the part that is about a loop.
 */
function load(name) {
  const t = TRACKS[name];
  if (t.pending) return t.pending;
  t.pending = loadAudio(t.url).then((got) => {
    if (!got) {
      t.dead = true;
      return false;
    }
    t.buffer = got.buffer;
    t.head = got.head;
    // A decoder that left the priming samples in pushes `head` later than the
    // asset was cut, and the tail padding is what absorbs that. Clamp anyway:
    // a loopEnd past the end of the buffer is silence on every wrap.
    t.end = Math.min(t.head + t.loop, got.buffer.duration);
    return true;
  });
  return t.pending;
}

if (AUDIO.music && AUDIO.musicTracks) {
  load("battle");
  load("endcard");
}

/* ----------------------------------------------------------------- playing */

function teardown(fade) {
  if (!live) return;
  const c = audioContext();
  const node = live;
  live = null;
  tension = -1;
  if (!c) return;
  const now = c.currentTime;
  // Faded rather than cut: a loop that stops on a frame boundary is a click,
  // and a click at the end of the fight is the last thing the player hears.
  node.gain.gain.cancelScheduledValues(now);
  node.gain.gain.setTargetAtTime(MIN, now, fade);
  try {
    node.src.stop(now + fade * 4 + 0.1);
  } catch (e) {
    /* a source that will not stop is already stopped */
  }
}

function begin(name) {
  const t = TRACKS[name];
  if (!t || !t.buffer) return false;
  const c = audioContext();
  const out = audioBus();
  if (!c || !out) return false;

  teardown(0.2);

  const gain = c.createGain();
  gain.gain.value = MIN;
  gain.connect(out);

  // The same gesture setTension makes on the synth's strings: the mix leans in
  // as the clock runs down. Wide open is 18 kHz — past anything a phone speaker
  // moves air at, so the top of the sweep is transparent rather than bright.
  const cut = c.createBiquadFilter();
  cut.type = "lowpass";
  cut.frequency.value = 5200;
  cut.Q.value = 0.3;
  cut.connect(gain);

  const src = c.createBufferSource();
  src.buffer = t.buffer;
  src.loop = true;
  src.loopStart = t.head;
  src.loopEnd = t.end;
  src.connect(cut);
  try {
    // Offset as well as loopStart, or the first pass through plays the silence
    // the loop points exist to skip.
    src.start(c.currentTime + 0.02, t.head);
  } catch (e) {
    return false;
  }

  live = { src, gain, cut, name };
  tension = -1;
  gain.gain.setTargetAtTime(
    AUDIO.musicTrackLevel,
    c.currentTime,
    TRACKS[name].fade,
  );
  return true;
}

// A rebuilt context is a different context, and these nodes belonged to the one
// that was closed. Let go of them; `wanted` is what survives, and onAudioOpen
// below starts the same cut again on whatever replaced it.
onAudioReset(() => {
  live = null;
  tension = -1;
});

onAudioOpen(() => {
  if (wanted && !live) begin(wanted);
});

export const tracks = {
  /** Whether this file is allowed to try at all. */
  enabled() {
    return !!(AUDIO.music && AUDIO.musicTracks);
  },

  /**
   * Play `name`, or hand the job back.
   *
   * @param {string} name a key of TRACKS
   * @param {Function} [fallback] called once, if the cut cannot be played —
   *   no decoder, a refused file, or a decode still running when GRACE_MS is
   *   up. music.js passes the synth theme in here.
   */
  request(name, fallback) {
    const give = () => {
      if (fallback) fallback();
    };
    if (!this.enabled() || !TRACKS[name]) return give();
    wanted = name;
    const t = TRACKS[name];
    if (t.buffer) {
      if (!begin(name)) give();
      return;
    }
    if (t.dead) return give();

    let done = false;
    const late = setTimeout(() => {
      if (done) return;
      done = true;
      wanted = null;
      give();
    }, GRACE_MS);
    load(name).then((ok) => {
      if (done) return;
      done = true;
      clearTimeout(late);
      // `wanted` can have moved on while we were decoding — the fight can end
      // inside a second on a fast tap, and the end card has asked for its own
      // cut by then. Starting this one now would play the fight over it.
      if (wanted !== name) return;
      if (!ok || !begin(name)) {
        wanted = null;
        give();
      }
    });
  },

  /** Whether a cut is actually playing right now. */
  playing() {
    return !!live;
  },

  /**
   * The doom clock, as a recording hears it.
   *
   * The synth has four things to open; a finished mix has two. The filter comes
   * off the top and the whole thing leans in, and that is all — a recording
   * that is EQ'd much harder than this stops sounding like the game it is
   * quoting, which is the entire reason the file is in the build.
   *
   * @param {number} v 0 at the top of the clock, 1 when it is about to land
   */
  setTension(v) {
    if (!live || live.name !== "battle") return;
    const t = Math.max(0, Math.min(1, v || 0));
    // Quantized for the same reason the bed's is: this is called every frame,
    // and a ramp per frame on one param is a stutter rather than a swell.
    const q = Math.round(t * 12);
    if (q === tension) return;
    tension = q;
    const c = audioContext();
    if (!c) return;
    const now = c.currentTime;
    live.cut.frequency.setTargetAtTime(5200 + t * 12800, now, 0.7);
    live.gain.gain.setTargetAtTime(
      AUDIO.musicTrackLevel * (1 + t * 0.3),
      now,
      0.7,
    );
  },

  /** Out with the fight — or out with the cut the end card replaced. */
  stop(fade) {
    wanted = null;
    teardown(fade === undefined ? 0.6 : fade);
  },
};
