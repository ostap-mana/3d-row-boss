/**
 * The art the outcome card is built from.
 *
 * Two finished verdict banners and one hairline, packed by
 * tools/pack-outcome-ui.mjs.
 *
 * A banner is the whole verdict in one bitmap: a plate that fades to nothing at
 * both ends, a gold hairline along its top and bottom edge, a small gold chevron
 * centred on each, a wash in the ending's colour between them — green for
 * VICTORY, oxblood for DEFEAT — and the word itself, set in the serif the game
 * announces things in. The line is one hairline with a diamond notch in the
 * middle, and it is the lid over "tap to continue".
 *
 * ## These are fitted and never stretched
 *
 * This module used to export the game's own `S_ScreenTitleBackground` with a
 * licence written above it: that one bitmap, alone in the creative, could be
 * stretched vertically, because everything between its hairlines was a flat
 * gradient and there was nothing in the middle for a stretch to distort. The
 * card leaned on that hard — it pulled the plate into a box on every device and
 * then laid three tinted sprites and a line of type inside the hairlines to make
 * a verdict out of it.
 *
 * The licence does not carry over and the plate is gone. There is a word in the
 * middle of these, so they take a width and give back the height their own
 * aspect implies, like every other painted thing in this project. See
 * `fitVerdict`, which is the whole of that rule in three lines.
 *
 * What the card lost with the plate is a fallback that was never one: a device
 * that cannot decode one of these webps cannot decode any of them. The card
 * draws its own band when nothing here answers — see OutcomeScreen.drawBand.
 */

import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import victoryUrl from "../assets/outcome/victory-band.webp";
import defeatUrl from "../assets/outcome/defeat-band.webp";
import lineUrl from "../assets/outcome/ornament-line.webp";

/**
 * Natural size of a verdict banner — a transcript of what the packer prints.
 *
 * One constant for both, because both are 816x266 and the packer shouts if a
 * pack ever makes them disagree. It is the aspect that matters: 3.068:1 is the
 * shape the word was drawn into, and `fitVerdict` is what holds the card to it.
 */
export const VERDICT_ART = { w: 816, h: 266 };

export const LINE_ART = { w: 438, h: 29 };

/**
 * The banner's gold, sampled off its hairline.
 *
 * Exported because the card lights the bloom behind the verdict in the same
 * colour, and because a device that could decode none of this still gets a drawn
 * stand-in in the colour the art would have been.
 */
export const PLATE_GOLD = 0xf5c65a;

/** The dark inside the band, sampled between its hairlines. */
export const PLATE_FILL = 0x101c33;

let victoryTexture = null;
let defeatTexture = null;
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
 * Decode all three before the card is built.
 *
 * Never rejects, and not all-or-nothing: each is caught on its own, so a device
 * that cannot read one still gets the others, and one that can read none of them
 * gets the card's own drawn band. See OutcomeScreen.drawBand.
 *
 * Both endings are decoded, on both endings, and the loser is 39 kB of texture
 * nobody looks at. That is the trade, and it is the right way round: the card is
 * shown at the exact moment a fight ends, `show` takes its still and starts the
 * flash on the same frame, and a decode started there is a decode racing the one
 * animation in the creative that has to be instant. A rematch makes it worse —
 * lose, retry, win, and the second verdict would be the one arriving late.
 */
export async function loadOutcomeUi() {
  const into = (url, set) =>
    decode(url)
      .then(set)
      .catch(() => {});
  await Promise.all([
    into(victoryUrl, (t) => {
      victoryTexture = t;
    }),
    into(defeatUrl, (t) => {
      defeatTexture = t;
    }),
    into(lineUrl, (t) => {
      lineTexture = t;
    }),
  ]);
}

/**
 * The verdict banner for an ending, centred on its own origin, or null if it
 * never decoded.
 *
 * @param {boolean} defeat
 */
export function verdictSprite(defeat) {
  return sprite(defeat ? defeatTexture : victoryTexture);
}

/**
 * Point an existing banner sprite at the other ending.
 *
 * The card builds one sprite and re-aims it, because a rematch can show this
 * screen twice and swapping a texture is free where adding and removing a child
 * mid-flight is a thing that can go wrong. Answers whether there was anything to
 * aim it at: a false here is what puts the card on its drawn band.
 *
 * @param {import("pixi.js").Sprite} s
 * @param {boolean} defeat
 */
export function aimVerdict(s, defeat) {
  const t = defeat ? defeatTexture : victoryTexture;
  if (!t) return false;
  s.texture = t;
  return true;
}

/** The hairline, centred on its own origin, or null if it never decoded. */
export function lineSprite() {
  return sprite(lineTexture);
}

/**
 * Size a verdict banner to `w`, at its own aspect. The only height it may take.
 *
 * Returns that height, because the card hangs the bloom behind the banner off
 * it and there is no reason for two places to divide by the same number.
 */
export function fitVerdict(s, w) {
  const h = (w * VERDICT_ART.h) / VERDICT_ART.w;
  s.setSize(w, h);
  return h;
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
