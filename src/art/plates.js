/**
 * Painted plates behind the hero cards.
 *
 * Three roundels' worth of art in src/assets/cards — a dark rim, a shaft of light
 * up the middle, and a 128x171 panel that happens to be the exact aspect of a
 * hero card. They replace the flat rectangle each card draws for itself; the
 * portrait, the bars and the captions all still sit on top and are untouched.
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

const plates = {};

/**
 * Bake one plate.
 *
 * Straight through now. This used to clip the art to the card's corner radius,
 * because two of the three files carry no alpha channel — their rounded corners
 * are painted black rather than cut out — and unclipped they poked black nubs
 * past the card's rounded edge. The card has square corners and no border, so
 * what the file was painted with is the silhouette the card wants.
 */
function plateTexture(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

/**
 * Decode the plates before the first card is built.
 *
 * Never rejects: a card whose plate fails to decode falls back to the drawn
 * rectangle underneath it, so the row is always complete.
 */
export async function loadCardPlates() {
  const urls = [...new Set(Object.values(CARD_PLATE).map((p) => p.url))];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        plates[url] = plateTexture(img);
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
