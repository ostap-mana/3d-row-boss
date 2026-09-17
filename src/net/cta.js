import { STORE_URL } from "../config.js";
import * as sfx from "../audio/sfx.js";
import { openStore } from "./mraid.js";
import { EV, track } from "./analytics.js";
import { clickUrl } from "./tags.js";

let fired = false;

function storeUrl() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? STORE_URL.ios
    : STORE_URL.android;
}

export function ctaClick(source) {
  if (fired) return;
  fired = true;
  track(EV.cta, { source });
  sfx.cta();

  const url = clickUrl(storeUrl());
  const w = window;

  try {
    if (!openStore(url)) {
      if (typeof w.FbPlayableAd !== "undefined") {
        w.FbPlayableAd.onCTAClick();
      } else if (typeof w.ExitApi !== "undefined") {
        w.ExitApi.exit();
      } else if (typeof w.install === "function") {
        w.install();
      } else if (typeof w.gameEnd === "function") {
        w.gameEnd();
      } else if (typeof w.gameclose === "function") {
        w.gameclose();
      } else {
        w.open(url, "_blank");
      }
    }
  } catch (e) {
    try {
      w.open(url, "_blank");
    } catch (e2) {}
  }

  setTimeout(() => {
    fired = false;
  }, 1200);
}

export function signalReady() {
  const w = window;
  try {
    if (w.FbPlayableAd && typeof w.FbPlayableAd.onReady === "function") {
      w.FbPlayableAd.onReady();
    }
  } catch (e) {}
}
