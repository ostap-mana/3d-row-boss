/**
 * The painted lances the volley throws, one per element.
 *
 * A match fires `Vfx.beam` once per hero left standing, and until now every one
 * of those was the same two tinted quads: art/textures.js's gradient stretched
 * from the card to the beast, with a white one down the middle of it. Six
 * elements, one drawing, told apart by a tint.
 *
 * A bolt here replaces that drawing, and the same texture is what the hero's
 * ultimate throws across the arena — see `Vfx.ultCast`, which draws it turned to
 * face the path rather than stretched along it. It is a
 * still, not a flipbook — the beam is on screen for about a fifth of a second
 * and a sheet would be four frames nobody sees — and it carries its own core,
 * its own torn edges and its own light, which is the whole reason it is worth
 * the bytes.
 *
 * ## Two things this module is strict about
 *
 * **No tint by default.** The lance is painted in its element's own colour, and
 * a tint in Pixi is a multiply: laying GEM_COLORS over a white-hot core turns
 * the core into the tint and throws away the one part of the drawing that makes
 * it read as hot. `tint` stays here as a field so an element whose art arrives
 * off-palette can be pulled back without a repack, and it is null for anything
 * drawn right.
 *
 * **The aspect is measured, never declared.** `Vfx.paintedBeam` stretches the
 * lance the length of the shot, so the number is only used to keep the body in
 * proportion to that stretch; reading it off the decoded image means a redraw at
 * a different shape needs nothing here changed. tools/pack-bolt.mjs is what
 * crops and mirrors, and its header says why the mirror is not optional.
 *
 * Missing art is not an error. `boltArt` answers null and the element throws the
 * beam it always threw — the same bargain art/streams.js and art/spells.js make,
 * and the reason a half-finished set still ships.
 */

import { ImageSource, Texture } from "pixi.js";
import { ARCANE, FIRE, LIGHTNING, NATURE, WATER, WIND } from "../config.js";
import fireUrl from "../assets/fx/fire-bolt.webp";
import waterUrl from "../assets/fx/water-bolt.webp";
import natureUrl from "../assets/fx/nature-bolt.webp";
import lightningUrl from "../assets/fx/lightning-bolt.webp";
import arcaneUrl from "../assets/fx/arcane-bolt.webp";
import windUrl from "../assets/fx/wind-bolt.webp";

/**
 * Five of these are rows off one sheet, src/source/fx/lances.png, cut by
 * tools/pack-bolt.mjs --row. WIND is the odd one out and always was: the sheet
 * has a sixth lance, but it is a second violet — a void bolt with dark orbs
 * turning in it — and the roster has only one violet slot. So ARCANE takes the
 * bright violet that matches its own #A855F7 and WIND keeps the pale aqua lance
 * that arrived on its own, which is the colour WIND has on the board. The void
 * row stays in the sheet, unpacked, for whatever wants it.
 */
const ART = {
  [FIRE]: { url: fireUrl, tint: null },
  [WATER]: { url: waterUrl, tint: null },
  [NATURE]: { url: natureUrl, tint: null },
  [LIGHTNING]: { url: lightningUrl, tint: null },
  [ARCANE]: { url: arcaneUrl, tint: null },
  [WIND]: { url: windUrl, tint: null },
};

let bolts = null;
let loaded = false;

async function cut(entry) {
  const img = new Image();
  img.src = entry.url;
  await img.decode();
  return {
    texture: new Texture({ source: new ImageSource({ resource: img }) }),
    aspect: img.width / img.height,
    tint: entry.tint,
  };
}

export async function loadBoltArt() {
  if (loaded) return bolts;
  loaded = true;
  const out = {};
  for (const element of Object.keys(ART)) {
    try {
      out[element] = await cut(ART[element]);
    } catch {
      /* that element keeps the beam it already throws */
    }
  }
  bolts = out;
  return bolts;
}

export function boltArt(element) {
  return (bolts && bolts[element]) || null;
}
