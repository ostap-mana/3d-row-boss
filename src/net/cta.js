/**
 * Ad-network plumbing.
 *
 * One build, runtime detection (spec §8). Order matters: MRAID first because
 * AppLovin/Unity/ironSource all inject it, then the vendor-specific hooks.
 */

import { STORE_URL } from "../config.js";

let fired = false;

function storeUrl() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? STORE_URL.ios
    : STORE_URL.android;
}

/**
 * Send the player to the store.
 * @param {string} source which surface was tapped — kept for analytics parity
 */
export function ctaClick(source) {
  // Networks dislike duplicate open() calls; one per session is plenty.
  if (fired) return;
  fired = true;

  const url = storeUrl();
  const w = window;

  try {
    if (typeof w.mraid !== "undefined" && w.mraid.open) {
      w.mraid.open(url);
    } else if (typeof w.FbPlayableAd !== "undefined") {
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
  } catch (e) {
    // A broken wrapper must never take the creative down with it.
    try {
      w.open(url, "_blank");
    } catch (e2) {
      /* nothing left to try */
    }
  }

  // Allow a retry if the network swallowed the first tap.
  setTimeout(() => {
    fired = false;
  }, 1200);
}

/** Meta wants an explicit readiness ping, everyone else ignores it. */
export function signalReady() {
  const w = window;
  try {
    if (w.FbPlayableAd && typeof w.FbPlayableAd.onReady === "function") {
      w.FbPlayableAd.onReady();
    }
    if (typeof w.mraid !== "undefined") {
      if (w.mraid.getState && w.mraid.getState() === "loading") {
        w.mraid.addEventListener("ready", () => {});
      }
    }
  } catch (e) {
    /* wrapper missing or half-implemented — nothing to do */
  }
}
