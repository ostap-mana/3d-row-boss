import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import keyArtUrl from "../assets/brand/key-art.webp";
import logoUrl from "../assets/brand/logo-invokers.webp";
import playUrl from "../assets/brand/play-now.webp";
import retryPlateUrl from "../assets/brand/retry-plate.webp";

export const LOGO_ART = { w: 558, h: 131 };
export const PLAY_ART = { w: 640, h: 164 };

export const KEY_ART = { w: 1500, h: 1246 };

export const RETRY_BOSS_ART = { w: 640, h: 551 };

export const RETRY_PLATE_ART = { w: 472, h: 128 };

export const RETRY_LINE_ART = { w: 1024, h: 85 };

export const VICTORY_ART = { w: 1024, h: 513 };
export const DEFEAT_ART = { w: 1024, h: 390 };

export const KEY_ART_FOCUS = { x: 0.6, y: 0.49 };

export const PLAY_FILL = 0xc31839;
export const PLAY_RIM = 0xf0a33c;
export const PLAY_LABEL = 0xfbf1e4;

let keyArtTexture = null;
let logoTexture = null;
let playTexture = null;
let retryPlateTexture = null;
let victoryTexture = null;
let defeatTexture = null;

async function decode(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

export async function loadBrandArt() {
  await Promise.all([
    decode(keyArtUrl)
      .then((t) => {
        keyArtTexture = t;
      })
      .catch(() => {}),
    decode(logoUrl)
      .then((t) => {
        logoTexture = t;
      })
      .catch(() => {}),
    decode(playUrl)
      .then((t) => {
        playTexture = t;
      })
      .catch(() => {}),
    decode(retryPlateUrl)
      .then((t) => {
        retryPlateTexture = t;
      })
      .catch(() => {}),
  ]);
}

export function bannerSprite(defeated) {
  return sprite(defeated ? defeatTexture : victoryTexture);
}

export function bannerHeight(defeated, w) {
  const art = defeated ? DEFEAT_ART : VICTORY_ART;
  return (w * art.h) / art.w;
}

export function fitBanner(s, defeated, w) {
  const h = bannerHeight(defeated, w);
  s.setSize(w, h);
  return h;
}

export function keyArtSprite() {
  return sprite(keyArtTexture);
}

export function logoSprite() {
  return sprite(logoTexture);
}

export function playPlateSprite() {
  return sprite(playTexture);
}

export function retryPlateSprite() {
  return sprite(retryPlateTexture);
}

function sprite(texture) {
  if (!texture) return null;
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  return s;
}

export function logoHeight(w) {
  return (w * LOGO_ART.h) / LOGO_ART.w;
}

export function playHeight(w) {
  return (w * PLAY_ART.h) / PLAY_ART.w;
}

export function fitLogo(s, w) {
  const h = logoHeight(w);
  s.setSize(w, h);
  return h;
}

export function fitPlayPlate(s, w) {
  const h = playHeight(w);
  s.setSize(w, h);
  return h;
}

export function retryPlateHeight(w) {
  return (w * RETRY_PLATE_ART.h) / RETRY_PLATE_ART.w;
}

export function fitRetryPlate(s, w, maxH) {
  let h = retryPlateHeight(w);
  if (maxH > 0 && h > maxH) {
    h = maxH;
    w = (h * RETRY_PLATE_ART.w) / RETRY_PLATE_ART.h;
  }
  s.setSize(w, h);
  return { w, h };
}

export function fitKeyArt(s, w, h, fx, fy, zoom) {
  const k = Math.max(w / KEY_ART.w, h / KEY_ART.h) * (zoom || 1);
  const aw = KEY_ART.w * k;
  const ah = KEY_ART.h * k;
  s.setSize(aw, ah);
  const x = fx - (KEY_ART_FOCUS.x - 0.5) * aw;
  const y = fy - (KEY_ART_FOCUS.y - 0.5) * ah;
  s.position.set(
    Math.max(w - aw / 2, Math.min(aw / 2, x)),
    Math.max(h - ah / 2, Math.min(ah / 2, y)),
  );
}
