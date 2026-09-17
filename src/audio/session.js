import { AUDIO } from "../config.js";

const RATE = 8000;

const SECONDS = 4;

let keeper = null;
let wanted = false;
let napping = false;
let asked = false;

function apple(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  tag(36, "data");
  view.setUint32(40, frames, true);
  bytes.fill(128, 44);

  let s = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  }
  return "data:audio/wav;base64," + btoa(s);
}

function keep() {
  try {
    if (!keeper) {
      const el = document.createElement("audio");
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.setAttribute("x-webkit-airplay", "deny");
      el.disableRemotePlayback = true;
      el.controls = false;
      el.muted = false;
      el.volume = 1;
      el.loop = true;
      el.preload = "auto";
      el.src = silence();
      el.style.cssText =
        "position:absolute;width:0;height:0;opacity:0;pointer-events:none";
      if (document.body) document.body.appendChild(el);
      el.addEventListener("ended", () => {
        if (wanted && !napping) keep();
      });
      keeper = el;
    }
    if (keeper.paused) {
      const p = keeper.play();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
}

export function promoteSession(w) {
  if (!AUDIO.overrideSilentSwitch || !w) return;
  const nav = w.navigator;
  if (nav && nav.audioSession) {
    try {
      if (nav.audioSession.type !== "playback") {
        nav.audioSession.type = "playback";
      }
      asked = true;
    } catch (e) {}
    return;
  }
  if (asked || !apple(nav)) return;
  if (typeof document === "undefined" || !document.createElement) return;
  wanted = true;
  keep();
}

export function sessionSleep(asleep) {
  napping = !!asleep;
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (asked && nav && nav.audioSession) {
    const want = napping ? "auto" : "playback";
    try {
      if (nav.audioSession.type !== want) nav.audioSession.type = want;
    } catch (e) {}
  }
  if (!keeper) return;
  try {
    if (napping) keeper.pause();
    else if (wanted) keep();
  } catch (e) {}
}

export function sessionKeeper() {
  return keeper;
}
