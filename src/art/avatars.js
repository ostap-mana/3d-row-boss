import {
  FIRE,
  WATER,
  NATURE,
  LIGHTNING,
  ARCANE,
  WIND,
  GEM_DARK,
} from "../config.js";
import { canvasTexture } from "./textures.js";
import fireUrl from "../assets/heroes/portrait-fire.webp";
import waterUrl from "../assets/heroes/portrait-water.webp";
import natureUrl from "../assets/heroes/portrait-nature.webp";
import lightningUrl from "../assets/heroes/portrait-lightning.webp";
import arcaneUrl from "../assets/heroes/portrait-arcane.webp";
import windUrl from "../assets/heroes/portrait-wind.webp";

const HERO_AVATAR = {
  [FIRE]: fireUrl,
  [WATER]: waterUrl,
  [NATURE]: natureUrl,
  [LIGHTNING]: lightningUrl,
  [ARCANE]: arcaneUrl,
  [WIND]: windUrl,
};

const SIZE = 320;

const CARD = { w: 160, h: 328 };

const BACKING = "rgba(18,10,34,0.88)";

const RIM = "rgba(10,6,18,0.55)";

const SCRIM = 0.38;

const ROUND_FOCUS = 0.3;

const baked = {};

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function css(color, alpha) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function bust(img, element, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  const top = h * (1 - SCRIM);
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, css(GEM_DARK[element], 0));
  g.addColorStop(0.5, css(GEM_DARK[element], 0.34));
  g.addColorStop(1, css(GEM_DARK[element], 0.62));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);

  return canvasTexture(c);
}

function roundel(img) {
  const c = makeCanvas(SIZE, SIZE);
  const ctx = c.getContext("2d");
  const r = SIZE / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = BACKING;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const k = Math.max(SIZE / img.width, SIZE / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  const y = Math.max(SIZE - dh, Math.min(0, SIZE / 2 - dh * ROUND_FOCUS));
  ctx.drawImage(img, (SIZE - dw) / 2, y, dw, dh);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(r, r, r - SIZE * 0.012, 0, Math.PI * 2);
  ctx.closePath();
  ctx.lineWidth = SIZE * 0.024;
  ctx.strokeStyle = RIM;
  ctx.stroke();

  return canvasTexture(c);
}

export async function loadHeroAvatars() {
  await Promise.all(
    Object.entries(HERO_AVATAR).map(async ([element, entry]) => {
      const art =
        typeof entry === "string" ? { card: entry, roundel: entry } : entry;
      try {
        const [card, round] = await Promise.all([
          decode(art.card),
          art.roundel === art.card ? null : decode(art.roundel),
        ]);
        baked[element] = {
          bust: bust(card, element, card.width, card.height),
          card: bust(card, element, CARD.w, CARD.h),
          roundel: roundel(round || card),
        };
      } catch {}
    }),
  );
}

async function decode(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export function heroBust(element) {
  const art = baked[element];
  return (art && art.bust) || null;
}

export function heroCardBust(element) {
  const art = baked[element];
  return (art && art.card) || null;
}

export function heroRoundel(element) {
  const art = baked[element];
  return (art && art.roundel) || null;
}
