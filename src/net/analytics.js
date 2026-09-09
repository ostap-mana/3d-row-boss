import { inContainer } from "./mraid.js";
import { firePixel } from "./tags.js";

export const EV = Object.freeze({
  load: "ad_load",
  ready: "ad_ready",
  view: "ad_view",
  hide: "ad_hide",
  start: "game_start",
  firstSwap: "first_swap",
  ultimate: "ultimate_cast",
  end: "game_end",
  endcard: "endcard_shown",
  retry: "retry",
  cta: "cta_click",
});

const CHANNEL = "elemental-siege";
const RING = 64;

const VENDOR_LIFECYCLE = {
  [EV.ready]: "gameReady",
  [EV.start]: "gameStart",
  [EV.end]: "gameEnd",
};

const log = [];
const spent = new Set();
const started = Date.now();
let seq = 0;

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function mintegral() {
  const w = safe(() => globalThis, null);
  if (!w || typeof w.install !== "function") return null;
  return w;
}

function toVendor(name) {
  const hook = VENDOR_LIFECYCLE[name];
  if (!hook) return;
  const w = mintegral();
  if (!w) return;
  safe(() => (typeof w[hook] === "function" ? w[hook]() : null), null);
}

function toParent(payload) {
  const up = safe(
    () =>
      globalThis.parent && globalThis.parent !== globalThis
        ? globalThis.parent
        : null,
    null,
  );
  if (!up) return;
  safe(() => up.postMessage(payload, "*"), null);
}

export function track(name, props) {
  if (typeof name !== "string" || name === "") return;
  const payload = {
    channel: CHANNEL,
    event: name,
    seq: ++seq,
    ms: Date.now() - started,
    container: inContainer(),
  };
  if (props && typeof props === "object") payload.props = props;

  log.push(payload);
  if (log.length > RING) log.shift();

  toParent(payload);
  toVendor(name);
  firePixel(name);
}

export function trackOnce(name, props) {
  if (spent.has(name)) return;
  spent.add(name);
  track(name, props);
}

export function eventLog() {
  return log.slice();
}
