import { audioContext, onAudioNeedsRoom, onAudioOpen } from "./engine.js";

function bytes(url) {
  if (url.slice(0, 5) === "data:") {
    const raw = atob(url.slice(url.indexOf(",") + 1));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  return fetch(url).then((r) => r.arrayBuffer());
}

let scratch = null;
let decoding = 0;

function release() {
  if (decoding > 0 || !audioContext()) return;
  evict();
}

function evict() {
  if (!scratch) return;
  const dead = scratch;
  scratch = null;
  try {
    const p = dead.close ? dead.close() : null;
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

function decoder() {
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
    scratch = new Ctor(1, 1, 48000);
  } catch (e) {
    scratch = null;
  }
  return scratch;
}

onAudioOpen(release);

onAudioNeedsRoom(evict);

function decode(c, buf) {
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
      if (p && p.then) p.then(ok, no);
    } catch (e) {
      no(e);
    }
  });
}

function findHead(buffer) {
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

export function loadAudio(url) {
  return bytes(url)
    .then((raw) => {
      const c = decoder();
      if (!c) throw new Error("no decoder");
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
