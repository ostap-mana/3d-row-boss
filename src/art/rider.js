import { loadAlphaClip } from "./alphavideo.js";
import riderUrl from "../assets/boss/rider-dash.mp4";

let clip = null;
let loaded = false;

export async function loadRiderArt() {
  if (loaded) return clip;
  loaded = true;
  try {
    clip = await loadAlphaClip(riderUrl);
    clip.visible = false;
  } catch {}
  return clip;
}

export function riderClip() {
  return clip;
}
