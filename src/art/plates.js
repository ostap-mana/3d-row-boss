/**
 * Painted plates behind the hero cards.
 *
 * Three roundels' worth of art in src/assets/cards — a dark rim, a shaft of light
 * up the middle, and a 128x171 frame that happens to be the exact aspect of a
 * hero card. They replace the flat rounded rectangle each card used to draw for
 * itself; the portrait, the frame, the bars and the ready glow all still sit on
 * top and are untouched.
 *
 * The three files are named for the colour they are painted, not the element
 * they end up on — `plate-blue.webp` carries WATER and NATURE both, and the tint
 * below is what tells them apart.
 */

import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import { canvasTexture } from "./textures.js";
import blueUrl from "../assets/cards/plate-blue.webp";
import goldUrl from "../assets/cards/plate-gold.webp";
import violetUrl from "../assets/cards/plate-violet.webp";

/**
 * Which plate each hero stands on, and the tint that lands it on its element.
 *
 * Three plates, six heroes, and the card's colour is what tells the player
 * which gem charges which hero — so the plate is picked by hue and the tint
 * only has to nudge it the rest of the way. Tints are pale on purpose: a
 * Pixi tint multiplies, so a saturated one would drag the whole plate towards
 * black instead of colouring it.
 *
 * Three of them need no nudge at all. The gold plate is already LIGHTNING's
 * gold, the violet plate is ARCANE's, and the blue plate's cyan core is very
 * nearly the WIND colour itself — which is why WATER, not WIND, is the one
 * carrying a tint that pushes it back towards blue. Left alone, those two
 * cards would be the same card.
 */
const CARD_PLATE = {
  [FIRE]: { url: goldUrl, tint: 0xffb08a },
  [WATER]: { url: blueUrl, tint: 0x7fb4ff },
  [NATURE]: { url: blueUrl, tint: 0x9ef0a0 },
  [LIGHTNING]: { url: goldUrl, tint: 0xffffff },
  [ARCANE]: { url: violetUrl, tint: 0xdcb0ff },
  [WIND]: { url: blueUrl, tint: 0xffffff },
};

/** Corner radius as a fraction of the short side — HeroCard.resize's own. */
const RADIUS = 0.18;

const plates = {};

/**
 * Bake one plate: the art, clipped to the card's corner radius.
 *
 * Two of the three files carry no alpha channel at all — their rounded corners
 * are painted black rather than cut out — so handed straight to a Sprite they
 * would poke black nubs out through the card's frame stroke. Clipping here
 * gives every plate the silhouette the card already draws, whatever the file
 * arrived with.
 */
function clippedTexture(img) {
  const w = img.width;
  const h = img.height;
  const r = Math.min(w, h) * RADIUS;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  // arcTo rather than roundRect: the creative has to survive old WebViews.
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  return canvasTexture(c);
}

/**
 * Decode the plates before the first card is built.
 *
 * Never rejects: a card whose plate fails to decode falls back to the drawn
 * rounded rectangle underneath it, so the row is always complete.
 */
export async function loadCardPlates() {
  const urls = [...new Set(Object.values(CARD_PLATE).map((p) => p.url))];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        plates[url] = clippedTexture(img);
      } catch {
        /* the card's own rounded rectangle stands in */
      }
    }),
  );
}

/**
 * Plate for an element, or null if its art never decoded.
 * @returns {{texture: import("pixi.js").Texture, tint: number}|null}
 */
export function cardPlate(element) {
  const spec = CARD_PLATE[element];
  const texture = spec && plates[spec.url];
  return texture ? { texture, tint: spec.tint } : null;
}
