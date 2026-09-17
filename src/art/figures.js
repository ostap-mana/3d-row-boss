import { Texture, VideoSource } from "pixi.js";
import victoryUrl from "../assets/outcome/victory-figure.mp4";

const CLIP = { url: victoryUrl, w: 960, h: 960 };

export const FIGURE_ASPECT = CLIP.w / CLIP.h;

/**
 * Whether the clip brings its own three stars.
 *
 * It does, and that is the whole reason this one replaced the toast: the figure
 * opens a tome and three gold stars climb out of it, spin, and settle into the
 * same arc src/assets/outcome/stars-victory.webp draws as a still. So the card
 * must not also hang that still above him — see `starsUp` in ui/outcome.js,
 * which drops the painted set on a win and leaves it on a loss, where there is
 * no figure to carry anything.
 *
 * It is exported rather than assumed because the card has to keep working with
 * a clip that has none: the flag is what tells it whether the room above the
 * figure is the figure's or the stars'.
 */
export const FIGURE_CARRIES_STARS = true;

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
