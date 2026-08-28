/**
 * The mark a gem leaves when it goes.
 *
 * A ten-frame starburst — spikes out, then a collapsing ring — lifted from the
 * Invokers Titan Legacy build and packed by tools/pack-invokers-fx.mjs. Before
 * it, a match was six tinted sparks thrown outward by `Vfx.burst` and nothing
 * else: correct, cheap, and the same shape whatever cleared.
 *
 * ## Why this one keeps its mask
 *
 * Every other sheet from that build is baked in its own colour, because a spell
 * has exactly one. A gem has six, and six copies of one starburst is five files
 * of the same drawing. So this ships grey and `Vfx.pop` tints it, which is the
 * one thing a mask is good for and the reason the build's own particle library
 * is stored that way.
 *
 * The cost of the tint is the hot core: a white middle multiplied by a colour is
 * that colour, so this cannot burn out to white the way the baked sheets do.
 * On a mark the size of a gem there was never room to see that anyway.
 *
 * ## Its own grid, deliberately
 *
 * `art/spells.js` globs `*-sheet.webp` and cuts everything it finds on a 228
 * cell. This file is `gem-pop.webp` — no `-sheet` in the name — precisely so
 * that glob does not find it, because an ultimate is drawn four hundred points
 * across and a gem is forty. The 96 cell here is the honest size for the mark,
 * and it is what makes the whole thing five kilobytes.
 *
 * Never rejects. If the sheet is missing or will not decode, `popFrames`
 * returns null for the rest of the run and the sparks that were always there
 * carry the pop on their own.
 */

import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import popUrl from "../assets/fx/gem-pop.webp";

/** The grid, exactly as tools/pack-invokers-fx.mjs packs it. */
const SHEET = { cols: 5, cell: 100, count: 10 };

/** Cells are square. */
export const POP_ASPECT = 1;

let frames = null;
let loaded = false;

/**
 * Decode the sheet into ten windows onto one texture.
 *
 * Windows rather than ten textures of their own, for the reason every sheet in
 * this project is cut that way: swapping frames then costs nothing at render
 * time and the batch never breaks — which matters more here than anywhere else,
 * because a five-step cascade can ask for a dozen of these inside a second.
 */
export async function loadGemPopArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = popUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const sheet = canvasTexture(c);

    const out = [];
    for (let i = 0; i < SHEET.count; i++) {
      out.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            (i % SHEET.cols) * SHEET.cell,
            Math.floor(i / SHEET.cols) * SHEET.cell,
            SHEET.cell,
            SHEET.cell,
          ),
        }),
      );
    }
    frames = out;
  } catch {
    frames = null;
  }
  return frames;
}

/** The ten frames, or null if the sheet never arrived. */
export function popFrames() {
  return frames;
}
