import { Texture, VideoSource } from "pixi.js";
import toastUrl from "../assets/outcome/toast.mp4";

const CLIP = { w: 960, h: 618 };

export const TOAST_ASPECT = CLIP.w / CLIP.h;
export const TOAST_KEY = {
  cut: 60 / 255,
  ramp: 38 / 255,
  spill: 1,
  lift: 12 / 255,
};

let texture = null;
let video = null;
let loaded = false;

function playableUrl(src) {
  const comma = src.indexOf(",");
  if (!src.startsWith("data:") || comma === -1) return src;
  const binary = atob(src.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
}

export async function loadToastArt() {
  if (loaded) return texture;
  loaded = true;
  try {
    video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.autoplay = false;
    video.loop = false;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "auto";
    video.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1";
    video.src = playableUrl(toastUrl);
    document.body.appendChild(video);

    const source = new VideoSource({
      resource: video,
      autoLoad: false,
      autoPlay: false,
      updateFPS: 0,
    });
    await source.load();
    texture = new Texture({ source });
  } catch {
    texture = null;
    video = null;
  }
  return texture;
}

export function toastTexture() {
  return texture;
}

export function startToast() {
  if (!video) return;
  try {
    video.currentTime = 0;
    const started = video.play();
    if (started && started.catch) started.catch(() => {});
  } catch {}
}

export function stopToast() {
  if (!video) return;
  try {
    video.pause();
  } catch {}
}
