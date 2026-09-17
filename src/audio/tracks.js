import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioOpen, onAudioReset } from "./engine.js";
import { loadAudio } from "./decode.js";
import battleUrl from "../assets/audio/battle.mp3";
import endcardUrl from "../assets/audio/endcard.mp3";

const MIN = 0.0001;

const TRACKS = {
  battle: { url: battleUrl, loop: 23.7184, fade: 1.4 },
  endcard: { url: endcardUrl, loop: 15.4839, fade: 0.5 },
};

const GRACE_MS = 900;

let live = null;
let wanted = null;
let tension = -1;

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
    t.end = Math.min(t.head + t.loop, got.buffer.duration);
    return true;
  });
  return t.pending;
}

if (AUDIO.music && AUDIO.musicTracks) {
  load("battle");
  load("endcard");
}

function teardown(fade) {
  if (!live) return;
  const c = audioContext();
  const node = live;
  live = null;
  tension = -1;
  if (!c) return;
  const now = c.currentTime;
  node.gain.gain.cancelScheduledValues(now);
  node.gain.gain.setTargetAtTime(MIN, now, fade);
  try {
    node.src.stop(now + fade * 4 + 0.1);
  } catch (e) {}
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

onAudioReset(() => {
  live = null;
  tension = -1;
});

onAudioOpen(() => {
  if (wanted && !live) begin(wanted);
});

export const tracks = {
  enabled() {
    return !!(AUDIO.music && AUDIO.musicTracks);
  },

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
      if (wanted !== name) return;
      if (!ok || !begin(name)) {
        wanted = null;
        give();
      }
    });
  },

  playing() {
    return !!live;
  },

  setTension(v) {
    if (!live || live.name !== "battle") return;
    const t = Math.max(0, Math.min(1, v || 0));
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

  stop(fade) {
    wanted = null;
    teardown(fade === undefined ? 0.6 : fade);
  },
};
