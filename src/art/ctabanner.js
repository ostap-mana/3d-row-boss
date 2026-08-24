/**
 * The gem banner — the painted plate under INSTALL in the HUD corner.
 *
 * `src/assets/ui/cta-banner.webp` is a 512x141 cutout packed out of a 2172x724
 * render by tools/pack-cta-banner.mjs: a gem bar in a gold frame, a diamond
 * finial off each end, and a star centred above and below.
 *
 * It is deliberately not nine-sliced the way the gold plate is — see
 * art/button.js. That one is a flat field with a rim, so it can be pulled from
 * 4:1 to 9:1 and only its middle moves. This one has ornament in the middle:
 * the two stars sit on the centre line, which is exactly the band a nine-slice
 * stretches, and a star pulled to twice its width stops being a star. So the
 * banner is drawn at one aspect and one only, and the HUD asks for a width and
 * takes back whatever height that implies.
 *
 * That is also why this is a separate surface from the end card's CTA rather
 * than the same art at two sizes. The end card's button is 3.8:1 held upright
 * and past 9:1 held sideways, and nothing that keeps its aspect can fill it.
 * The HUD banner is a fixed shape, which is the shape this art already is.
 */

import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import bannerUrl from "../assets/ui/cta-banner.webp";

/** Natural size of the packed art. */
export const BANNER_ART = { w: 512, h: 141 };

/**
 * The largest box inside the gem field that is flat enough to put a word on,
 * as fractions of the whole art. Measured, not guessed: the field is a
 * stretched hexagon, so its usable width depends on how tall a box is asked of
 * it, and the two points at the ends are not room the label can have.
 */
export const BANNER_LABEL = { w: 0.739, h: 0.53 };

/**
 * Height of the bar itself, as a fraction of the art. The rest is the stars
 * above and below it, which are silhouette rather than plate — the stand-in
 * below draws the bar, not the whole box.
 */
export const BANNER_BAR_H = 0.729;

/**
 * The banner's own colours, sampled off the render.
 *
 * The HUD draws a stand-in when the bitmap does not decode, and the whole point
 * of a stand-in is that the CTA — the one surface in the creative that has to
 * be there — survives a device that cannot read a WebP. `FILL` is the mean of
 * the gem field, which runs magenta at one end and orange at the other, so no
 * single colour is more right than the average of them.
 */
export const BANNER_FILL = 0xb41913;
export const BANNER_RIM = 0xea8f41;

/**
 * The label rides on top of the gem rather than being cut out of it, because
 * the field spans a very dark red in the middle and a bright orange at the
 * right end — nothing solid reads over both. Warm white with a dark rim does.
 */
export const BANNER_LABEL_FILL = 0xfff2e0;
export const BANNER_LABEL_STROKE = 0x3d0308;

let bannerTexture = null;

/**
 * Decode the banner before the HUD is built.
 *
 * Never rejects: the HUD falls back to the drawn pill, which is plainer but is
 * still a button the player can hit. Every reference to the sprite is guarded
 * for that reason.
 */
export async function loadCtaBanner() {
  if (bannerTexture) return bannerTexture;
  try {
    const img = new Image();
    img.src = bannerUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    bannerTexture = canvasTexture(c);
  } catch {
    bannerTexture = null;
  }
  return bannerTexture;
}

/** The banner plate, centred on its parent's origin, or null if it never decoded. */
export function ctaBannerSprite() {
  if (!bannerTexture) return null;
  const s = new Sprite(bannerTexture);
  s.anchor.set(0.5);
  return s;
}

/** What this art stands to at width `w`. The only height it may be given. */
export function bannerHeight(w) {
  return (w * BANNER_ART.h) / BANNER_ART.w;
}

/** Size the plate to `w`, at its own aspect. */
export function fitCtaBanner(sprite, w) {
  const h = bannerHeight(w);
  sprite.setSize(w, h);
  return h;
}
