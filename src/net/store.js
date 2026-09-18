import { STORE_URL } from "../config.js";
import { openStore as openThroughMraid } from "./mraid.js";

export function storeUrl() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? STORE_URL.ios
    : STORE_URL.android;
}

export function fallbackStore() {
  const url = storeUrl();
  const w = window;

  try {
    if (openThroughMraid(url)) return "mraid";
    if (typeof w.FbPlayableAd !== "undefined") {
      w.FbPlayableAd.onCTAClick();
      return "fb";
    }
    if (typeof w.ExitApi !== "undefined") {
      w.ExitApi.exit();
      return "exit";
    }
    if (typeof w.install === "function") {
      w.install();
      return "install";
    }
    if (typeof w.gameEnd === "function") {
      w.gameEnd();
      return "gameEnd";
    }
    if (typeof w.gameclose === "function") {
      w.gameclose();
      return "gameclose";
    }
    w.open(url, "_blank");
    return "open";
  } catch {
    try {
      w.open(url, "_blank");
      return "open";
    } catch {
      return "none";
    }
  }
}
