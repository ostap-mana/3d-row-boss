import * as sfx from "../audio/sfx.js";
import { EV, track } from "./analytics.js";
import { sayOnce } from "./bus.js";

const COOLDOWN = 1200;

let fired = false;

export function ctaClick(source) {
  if (fired) return;
  fired = true;
  track(EV.cta, { source });
  sfx.cta();
  sayOnce("cta", { source });

  try {
    window.__PLAYABLE.openStore();
  } catch {
    fired = false;
  }

  setTimeout(() => {
    fired = false;
  }, COOLDOWN);
}
