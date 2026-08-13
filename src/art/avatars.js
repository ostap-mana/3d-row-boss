/**
 * Painted hero portraits.
 *
 * The roster used to be six hooded silhouettes drawn with Graphics — five
 * cloaks and a cowl each, in six colourways. These are real faces: the busts in
 * src/avatars, baked once into circular medallions and handed to every place a
 * portrait shows up (the card, the ultimate cut-in, the end-card roster).
 *
 * Two bakes of each bust, because the three places a portrait shows up want
 * different shapes:
 *
 *   bust     the card art, edge to edge. The card cover-fits it and clips it to
 *            its own corner radius, so the hero fills the whole tile instead of
 *            floating in a roundel a third of its size. Carries a scrim across
 *            the bottom in the hero's element colour — the name sits there, and
 *            white text over gold armour is unreadable without it.
 *   roundel  circle over a dark disc, for the ultimate cut-in and the end-card
 *            roster. The end card draws its portraits inside a ring, so a square
 *            bust would poke its corners out through it, and the disc hides that
 *            `wind-avatar.png` is the one file with no alpha channel — its
 *            background is painted black.
 */

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
import fireBodyUrl from "../avatars/fire-avatar-full-body.png";
import fireBustUrl from "../avatars/fire-avatar-full-bust.png";
import waterUrl from "../avatars/water-avatar.png";
import natureUrl from "../avatars/quinto.png";
import lightningUrl from "../avatars/sun-avatar-selisa.png";
import arcaneUrl from "../avatars/silanth.png";
import windUrl from "../avatars/wind-avatar.png";

/**
 * Which art belongs to which element — the card, the cut-in and the end card all
 * reach the portrait through the hero's element, never through a filename.
 *
 * One file per element, or `{card, roundel}` when the two framings want
 * different art. All six are covered, so the drawn portrait heroes.js falls back
 * to is now only ever reached by a file that fails to decode.
 */
const HERO_AVATAR = {
  // EMBRA stands at full height on the card and keeps the bust in the roundel:
  // a whole figure shrunk into a circle puts her face at a few pixels, and the
  // cut-in's whole job is that face. `fire-avatar-full-body.png` is
  // `full-fire-avatar.png` recentred and taken down to 384 — the original is
  // 1600 square and would have cost the bundle 2 MB of base64 for a tile that
  // renders under 90 CSS pixels tall.
  [FIRE]: { card: fireBodyUrl, roundel: fireBustUrl },
  [WATER]: waterUrl,
  [NATURE]: natureUrl,
  [LIGHTNING]: lightningUrl,
  [ARCANE]: arcaneUrl,
  [WIND]: windUrl,
};

/**
 * Baked roundel size. Above the 256 the busts arrive at, so the rim stroke has
 * room to land on a whole pixel; well under what the cut-in blows a portrait up
 * to, which no amount of baking can invent detail for.
 */
const SIZE = 320;

/** Disc behind the bust. The end card's own roundel fill, so they agree. */
const BACKING = "rgba(18,10,34,0.88)";

/** Rim, dark: hides the aliasing along the clip and reads on a bright plate. */
const RIM = "rgba(10,6,18,0.55)";

/** How much of the card's height the name's scrim washes over. */
const SCRIM = 0.44;

/** element -> {bust, roundel} */
const baked = {};

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** 0xRRGGBB + alpha as a canvas colour. */
function css(color, alpha) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Card art: the bust untouched, plus the scrim the name reads against.
 *
 * The scrim is baked in rather than drawn by the card because it is the hero's
 * own element colour and the bust is already per-hero — one texture, no second
 * sprite and no mask of its own to keep in step with the card's corners.
 */
function bust(img, element) {
  const w = img.width;
  const h = img.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const top = h * (1 - SCRIM);
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, css(GEM_DARK[element], 0));
  g.addColorStop(0.45, css(GEM_DARK[element], 0.5));
  g.addColorStop(1, css(0x08040e, 0.92));
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, h - top);

  return canvasTexture(c);
}

/** Clip one bust into its disc. */
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
  // The busts are square, so this is a fit rather than a crop: the circle takes
  // the corners and leaves the face, which is what the framing puts in the
  // middle anyway.
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(r, r, r - SIZE * 0.012, 0, Math.PI * 2);
  ctx.closePath();
  ctx.lineWidth = SIZE * 0.024;
  ctx.strokeStyle = RIM;
  ctx.stroke();

  return canvasTexture(c);
}

/**
 * Decode the busts before the first card is built.
 *
 * Never rejects, exactly like loadCardPlates: a hero whose art fails to decode
 * falls back to the drawn portrait, so the row is always six cards.
 */
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
          bust: bust(card, element),
          roundel: roundel(round || card),
        };
      } catch {
        /* the drawn portrait stands in */
      }
    }),
  );
}

async function decode(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Card art for an element, or null when it has no bust — or none that decoded.
 * @returns {import("pixi.js").Texture|null}
 */
export function heroBust(element) {
  const art = baked[element];
  return (art && art.bust) || null;
}

/**
 * The same bust as a roundel, for the cut-in and the end-card roster.
 * @returns {import("pixi.js").Texture|null}
 */
export function heroRoundel(element) {
  const art = baked[element];
  return (art && art.roundel) || null;
}
