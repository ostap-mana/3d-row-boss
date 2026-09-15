import { Texture, VideoSource } from "pixi.js";
import toastUrl from "../assets/outcome/toast.mp4";
import pointUrl from "../assets/outcome/retry.mp4";

const CLIP = {
  victory: { url: toastUrl, w: 960, h: 618 },
  defeat: { url: pointUrl, w: 480, h: 520 },
};

export const FIGURE_ASPECT = {
  victory: CLIP.victory.w / CLIP.victory.h,
  defeat: CLIP.defeat.w / CLIP.defeat.h,
};

export const FIGURE_KEY = {
  victory: { cut: 60 / 255, ramp: 38 / 255, spill: 1, lift: 12 / 255 },
  defeat: { cut: 70 / 255, ramp: 30 / 255, spill: 1, lift: 16 / 255 },
};

const clips = { victory: null, defeat: null };
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
  for (const ending of ["victory", "defeat"]) {
    try {
      clips[ending] = await mount(CLIP[ending].url);
    } catch {
      clips[ending] = null;
    }
  }
}

export function figureTexture(ending) {
  const clip = clips[ending];
  return clip ? clip.texture : null;
}

export function startFigure(ending) {
  const clip = clips[ending];
  if (!clip) return;
  try {
    clip.video.currentTime = 0;
    const started = clip.video.play();
    if (started && started.catch) started.catch(() => {});
  } catch {}
}

export function stopFigure(ending) {
  const clip = clips[ending];
  if (!clip) return;
  try {
    clip.video.pause();
  } catch {}
}
