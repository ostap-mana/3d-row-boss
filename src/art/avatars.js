/**
 * Painted hero portraits.
 *
 * The roster used to be six hooded silhouettes drawn with Graphics — five cloaks
 * and a cowl each, in six colourways. These are real faces: six painted
 * portraits packed by tools/pack-hero-portraits.mjs, baked here and handed to
 * every place a portrait shows up (the card, the ultimate cut-in, the end-card
 * roster).
 *
 * Five of them are painted one at a time now, each from its own source file, and
 * only RICKLOW is still cut out of the sheet the whole set started as. Nothing
 * here can tell the difference: they land at the same size under the same names,
 * which is the point of packing them.
 *
 * They are tiles rather than cut-outs. Each one is head and shoulders on the
 * backdrop it was painted against, 160 by 328 and opaque edge to edge — which is
 * a change from the set before them: those were square cut-outs with alpha, and
 * the card's own plate showed through wherever a hero did not cover it. Nothing
 * shows through these. The plate is still under them for a hero whose art fails
 * to decode.
 *
 * Two bakes of each, because the three places a portrait shows up want different
 * shapes:
 *
 *   bust     the card art, edge to edge. The card cover-fits it and clips it to
 *            its own corner radius, so the hero fills the whole tile instead of
 *            floating in a roundel a third of its size — and at 160x328 against a
 *            card of about 56x117 that fit is very nearly one to one, which is
 *            what the sheet was framed for. Carries a wash across the bottom in
 *            the hero's element colour, which is the one thing about the bottom
 *            of this art that is per-hero. Making it readable is not this file's
 *            job: the card lays its own dark band over the same edge — see
 *            FOOT_SCRIM in heroes.js.
 *   roundel  circle over a dark disc, for the ultimate cut-in and the end-card
 *            roster. Cover-fitted and cropped to the face rather than squashed
 *            into the circle — see ROUND_FOCUS. The disc behind it is what the
 *            end card's ring sits against.
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
import fireUrl from "../assets/heroes/portrait-fire.webp";
import waterUrl from "../assets/heroes/portrait-water.webp";
import natureUrl from "../assets/heroes/portrait-nature.webp";
import lightningUrl from "../assets/heroes/portrait-lightning.webp";
import arcaneUrl from "../assets/heroes/portrait-arcane.webp";
import windUrl from "../assets/heroes/portrait-wind.webp";

/**
 * Which art belongs to which element — the card, the cut-in and the end card all
 * reach the portrait through the hero's element, never through a filename.
 *
 * One file per element — or `{card, roundel}` for a hero whose two framings
 * genuinely want different art, which the loader still honours and nobody
 * currently needs. All six are covered, so the drawn portrait heroes.js falls
 * back to is now only ever reached by a file that fails to decode.
 */
const HERO_AVATAR = {
  // One packed file each, in roster order, so there is nothing per-element left
  // to say here — see the file header and tools/pack-hero-portraits.mjs.
  // RICKLOW is still the masked mage rather than a face, which is the art's
  // choice and not this file's.
  [FIRE]: fireUrl,
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

/** How much of the bust's height the element wash runs over. */
const SCRIM = 0.38;

/**
 * Which point down the art lands in the middle of the roundel.
 *
 * The portraits are more than twice as tall as they are wide, and a roundel is a
 * circle: something has to be cropped. Squashed to fit — which is what this used
 * to do, back when the busts were square and it cost nothing — a face comes out
 * two thirds as wide as it was painted. Cropped on the centre of the art, the
 * circle fills with a collarbone and the chin sits on its rim.
 *
 * 0.3 is where the eyes are on this sheet, measured across the six. Putting that
 * line through the middle of the circle is what makes six medallions read as six
 * faces.
 */
const ROUND_FOCUS = 0.3;

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
 * Card art: the bust untouched, plus the element wash along its bottom.
 *
 * Baked in rather than drawn by the card because it is the hero's own colour
 * and the bust is already per-hero — one texture, no second sprite per element.
 * It stops at a tint: the black end it used to finish on is the card's now, so
 * the two cannot stack into a bottom half nobody can see a hero through.
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
  g.addColorStop(0.5, css(GEM_DARK[element], 0.34));
  g.addColorStop(1, css(GEM_DARK[element], 0.62));
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

  // Cover the circle at the art's own aspect, then slide the face onto its
  // centre. The clamp is what keeps the slide honest: it can crop, it can never
  // pull the art off its own edge and leave the backing disc showing through.
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
