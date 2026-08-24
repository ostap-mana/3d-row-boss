/**
 * Ad-network plumbing.
 *
 * One build, runtime detection (spec §8). Order matters: MRAID first because
 * AppLovin/Unity/ironSource all inject it, then the vendor-specific hooks.
 */

import { STORE_URL, BADGE_STORE } from "../config.js";
import * as sfx from "../audio/sfx.js";

let fired = false;

/**
 * Where this tap leads.
 *
 * A badge asks for its own store, and it gets it: the Apple badge is a picture of
 * the App Store, and opening Play from it on an Android phone would make three
 * badges into one badge drawn three ways. Everything else asks for nothing —
 * PLAY NOW, a tap on the card — and is sent to the store the device belongs to,
 * which is the only sensible reading of a tap that did not name a platform.
 *
 * Worth something only where the destination is ours to pick: standalone, and
 * under MRAID, which takes a URL. Meta, ExitApi and the `install()` family run
 * whatever click-through the campaign was booked with and never see this — see
 * ctaClick, where a wrapper overriding the choice is the normal case and not a
 * failure.
 */
function storeUrl(source) {
  const named = BADGE_STORE[source];
  if (named && STORE_URL[named]) return STORE_URL[named];
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? STORE_URL.ios
    : STORE_URL.android;
}

/**
 * Send the player to the store.
 * @param {string} source which surface was tapped — the analytics label, and the
 *   store the badges route by. See storeUrl.
 */
export function ctaClick(source) {
  // Networks dislike duplicate open() calls; one per session is plenty.
  if (fired) return;
  fired = true;
  sfx.cta();

  const url = storeUrl(source);
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
