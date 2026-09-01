/**
 * The two pieces of chrome the outcome card is built from — the game's own.
 *
 * `S_ScreenTitleBackground` and `S_TitleOrnamentLine`, pulled out of the
 * Invokers Titan Legacy Unity bundles and packed by tools/pack-outcome-ui.mjs.
 * They are not a reconstruction of the card the game shows over a finished
 * fight; they are the parts that card is made of.
 *
 * The plate is a navy band that fades to nothing at both ends, with a bright
 * gold hairline along its top and bottom edge and a small gold chevron centred
 * on each. The line is one hairline with a diamond notch in the middle.
 *
 * ## The plate is the one bitmap in this creative that may be stretched
 *
 * Everything else painted — the store plate, the retry plate, the wordmark — is
 * fitted by width and takes back the height its own aspect implies, because
 * stretching a bevelled frame is how art starts looking cheap. This one is the
 * exception, and the art is why: the ornament sits on the centre line, the
 * hairlines run along the edges, and everything between them is a flat vertical
 * gradient. There is nothing in the middle for a stretch to distort.
 *
 * That is also what the game does with it. Its own aspect is 11.25:1, which at
 * a phone's width is a band thirty points deep — no headline fits in that. The
 * shipped card is visibly taller, with a visibly taller chevron, which is this
 * plate pulled vertically. See `fitPlate`.
 */

import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import plateUrl from "../assets/outcome/title-plate.webp";
import lineUrl from "../assets/outcome/ornament-line.webp";

/** Natural size of the packed art — a transcript of what the packer prints. */
export const PLATE_ART = { w: 1024, h: 91 };
export const LINE_ART = { w: 438, h: 29 };

/**
 * The plate's own gold, sampled off the hairline.
 *
 * Exported because the card lights the word and the bloom behind it in the same
 * colour, and because a device that could not decode the plate still gets a
 * drawn stand-in in the colour the plate would have been.
 */
export const PLATE_GOLD = 0xf5c65a;

/** The navy inside the band, sampled off its middle. */
export const PLATE_FILL = 0x101c33;

let plateTexture = null;
let lineTexture = null;

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

/**
 * Decode both before the card is built.
 *
 * Never rejects, and not all-or-nothing: each is caught on its own, so a device
 * that cannot read one still gets the other, and one that can read neither gets
 * the card's own drawn band. See OutcomeScreen.drawPlate.
 */
export async function loadOutcomeUi() {
  await Promise.all([
    decode(plateUrl)
      .then((t) => {
        plateTexture = t;
      })
      .catch(() => {}),
    decode(lineUrl)
      .then((t) => {
        lineTexture = t;
      })
      .catch(() => {}),
  ]);
}

/** The title band, centred on its own origin, or null if it never decoded. */
export function plateSprite() {
  return sprite(plateTexture);
}

/** The hairline, centred on its own origin, or null if it never decoded. */
export function lineSprite() {
  return sprite(lineTexture);
}

/**
 * Size the plate into a box, stretching it.
 *
 * Both dimensions are given, which is the whole difference between this and
 * every other fit in the project. See the header for why that is allowed here
 * and nowhere else.
 */
export function fitPlate(s, w, h) {
  s.setSize(w, h);
}

/** Size the hairline to `w`, at its own aspect. The only height it may take. */
export function fitLine(s, w) {
  const h = (w * LINE_ART.h) / LINE_ART.w;
  s.setSize(w, h);
  return h;
}

function sprite(texture) {
  if (!texture) return null;
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  return s;
}
