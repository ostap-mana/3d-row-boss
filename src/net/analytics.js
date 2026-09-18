import { inContainer } from "./mraid.js";

export const EV = Object.freeze({
  load: "ad_load",
  ready: "ad_ready",
  view: "ad_view",
  hide: "ad_hide",
  start: "game_start",
  firstSwap: "first_swap",
  ultimate: "ultimate_cast",
  bossMend: "boss_mend",
  end: "game_end",
  endcard: "endcard_shown",
  retry: "retry",
  cta: "cta_click",
});

const CHANNEL = "elemental-siege";
const RING = 64;

const log = [];
const spent = new Set();
const started = Date.now();
let seq = 0;

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
}

export function trackOnce(name, props) {
  if (spent.has(name)) return;
  spent.add(name);
  track(name, props);
}

export function eventLog() {
  return log.slice();
}
