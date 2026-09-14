/**
 * Ad-network plumbing.
 *
 * One build, runtime detection (spec §8). Order matters: MRAID first because
 * AppLovin/Unity/ironSource all inject it, then the vendor-specific hooks.
 */

import { STORE_URL } from "../config.js";
import * as sfx from "../audio/sfx.js";
import { openStore } from "./mraid.js";
import { EV, track } from "./analytics.js";
import { clickUrl } from "./tags.js";

let fired = false;

/**
 * Where this tap leads.
 *
 * Nothing on the card names a platform any more — PLAY NOW, a tap on the card —
 * so every tap is sent to the store the device belongs to, which is the only
 * sensible reading of a tap that did not ask for one.
 *
 * Worth something only where the destination is ours to pick: standalone, and
 * under MRAID, which takes a URL. Meta, ExitApi and the `install()` family run
 * whatever click-through the campaign was booked with and never see this — see
 * ctaClick, where a wrapper overriding the choice is the normal case and not a
 * failure.
 */
function storeUrl() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? STORE_URL.ios
    : STORE_URL.android;
}

/**
 * Send the player to the store.
 * @param {string} source which surface was tapped — the analytics label.
 */
export function ctaClick(source) {
  // Networks dislike duplicate open() calls; one per session is plenty.
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

/**
 * Meta wants an explicit readiness ping, everyone else ignores it.
 *
 * MRAID used to be answered here too, with an empty listener on its `ready`
 * event — which did nothing, because MRAID's readiness is not something the
 * creative reports, it is something the creative waits for. That wait lives in
 * net/mraid.js now, where the things that actually depend on it are.
 */
export function signalReady() {
  const w = window;
  try {
    if (w.FbPlayableAd && typeof w.FbPlayableAd.onReady === "function") {
      w.FbPlayableAd.onReady();
    }
  } catch (e) {
    /* wrapper missing or half-implemented — nothing to do */
  }
}
