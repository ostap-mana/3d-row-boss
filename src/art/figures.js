import { Texture, VideoSource } from "pixi.js";
import toastUrl from "../assets/outcome/toast.mp4";

const CLIP = { url: toastUrl, w: 960, h: 618 };

export const FIGURE_ASPECT = CLIP.w / CLIP.h;

export const FIGURE_KEY = {
  cut: 50 / 255,
  ramp: 26 / 255,
  spill: 1,
  lift: 4 / 255,
};

let clip = null;
let loaded = false;

function playableUrl(src) {
  const comma = src.indexOf(",");
  if (!src.startsWith("data:") || comma === -1) return src;
  const binary = atob(src.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
}

async function mount(url) {
  const video = document.createElement("video");
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
  video.src = playableUrl(url);
  document.body.appendChild(video);

  const source = new VideoSource({
    resource: video,
    autoLoad: false,
    autoPlay: false,
    updateFPS: 0,
  });
  await source.load();
  return { video, texture: new Texture({ source }) };
}

export async function loadOutcomeFigures() {
  if (loaded) return;
  loaded = true;
  try {
    clip = await mount(CLIP.url);
  } catch {
    clip = null;
  }
}

export function figureTexture() {
  return clip ? clip.texture : null;
}

export function startFigure() {
  if (!clip) return;
  try {
    clip.video.currentTime = 0;
    const started = clip.video.play();
    if (started && started.catch) started.catch(() => {});
  } catch {}
}

export function stopFigure() {
  if (!clip) return;
  try {
    clip.video.pause();
  } catch {}
}
