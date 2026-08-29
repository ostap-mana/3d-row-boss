/**
 * The aura a hero card's frame wears when its ultimate is charged.
 *
 * The card already grows, prints READY and lights a radial wash over the
 * portrait the moment it fills — see HeroCard.setReady. All three of those
 * happen *inside* the tile, and the one thing the player has to find in a row of
 * six is the tile itself. This is the half of that callout that happens outside
 * it: light coming off the border, in the hero's own colour, so a charged card
 * reads as charged from a thumb's distance and out of the corner of an eye.
 *
 * Two painted assets, packed by tools/pack-card-aura.mjs out of two flux frames:
 *
 *   aura-frame.webp  200x402  the standing halo. A white-hot rim with a bloom
 *                             and a scatter of sparks around it, and enough
 *                             margin baked into the file for the bloom to have
 *                             somewhere to go — see PAD below.
 *   aura-burst.webp  200x520  the ring the tap throws off. The same rectangle
 *                             with a far denser discharge, filaments crawling
 *                             the whole border, and no margin at all: what
 *                             carries it outwards is `scale`, not the file.
 *
 * Both are white on alpha and are tinted where they are used, which is the whole
 * reason the packer throws the recovered colour away: the six element colours
 * live in GEM_COLORS and nowhere else, and a glow painted in the model's own
 * taste would put a seventh opinion in front of them.
 *
 * Neither is nine-sliced, and it is worth saying why not, because the frame the
 * halo sits on is — see art/cardframe.js. A nine-slice exists to keep a *line*
 * at one weight across sizes, and it pays for that by stretching the flat middle
 * of every run, which is exactly what would smear the sparks and the filaments
 * that are the reason these are paintings and not a canvas bake. They do not
 * need it either: core/layout.js holds every card to CARD.aspect whatever the
 * screen is, so the box these are laid on is the same shape on every device and
 * a plain stretched Sprite is not stretching anything.
 *
 * The canvas bake at the bottom is the fallback for a device that could not
 * decode the art, the way the drawn stroke in art/heroes.js is the fallback for
 * the frame itself. It is the same shape and none of the character.
 */

import { canvasTexture } from "./textures.js";
import frameUrl from "../assets/cards/aura-frame.webp";
import burstUrl from "../assets/cards/aura-burst.webp";

/**
 * Where the card's own border sits inside each file, as a fraction of the lit
 * rectangle — which is to say how much margin the packer left round it.
 *
 * Printed by tools/pack-card-aura.mjs, which measures the four sides of the lit
 * rectangle in the source and crops to them plus a fixed margin. These are the
 * whole contract between that tool and this file: they are what turns "a card
 * w by h" into the size the sprite is drawn at, so the rim lands on the border
 * and the bloom hangs outside it.
 *
 * Re-run the packer and paste what it prints. Nothing here can detect that they
 * have gone stale — a wrong pair does not throw, it just draws the rim a few
 * points inside the card, which reads as a glow sitting on the portrait.
 */
const ART = {
  frame: { url: frameUrl, padX: 0.2689, padY: 0.1054 },
  burst: { url: burstUrl, padX: 0.04, padY: 0.0147 },
};

const textures = {};

/**
 * Decode both before the first card is built.
 *
 * Never rejects: a card whose aura is missing wears the baked one below, which
 * is plainer but is still light on the border. Every reference goes through
 * cardAura/cardBurst for that reason.
 */
export async function loadCardAura() {
  await Promise.all(
    Object.entries(ART).map(async ([key, art]) => {
      try {
        const img = new Image();
        img.src = art.url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        textures[key] = canvasTexture(c);
      } catch {
        /* the bake stands in */
      }
    }),
  );
}

/**
 * The halo, and the burst: a texture and the two numbers it is laid out by.
 *
 * Handed over as one object rather than as a texture the caller then has to find
 * the margins for, because which margins are right depends on which texture came
 * back — the bake's are not the art's, and a card that fell back to it while
 * still using the art's numbers would draw the rim a tenth of a card inside its
 * own border.
 */
export function cardAura() {
  return textures.frame
    ? { texture: textures.frame, padX: ART.frame.padX, padY: ART.frame.padY }
    : bakedAura();
}

export function cardBurst() {
  return textures.burst
    ? { texture: textures.burst, padX: ART.burst.padX, padY: ART.burst.padY }
    : bakedAura();
}

/**
 * Lay an aura on a card `w` by `h`, centred on the card's own origin.
 *
 * `grow` is the burst's expansion and nothing else touches it. It is a size
 * rather than a `scale` on purpose: a Sprite's width *is* its scale in Pixi, so
 * a sprite sized here and then scaled would have this size thrown away on the
 * next frame — see HeroCard.sizeBurst, which drives the growth through here.
 */
export function fitCardAura(sprite, art, w, h, grow) {
  const k = grow === undefined ? 1 : grow;
  sprite.setSize(w * (1 + 2 * art.padX) * k, h * (1 + 2 * art.padY) * k);
}

/* ------------------------------------------------------------- the fallback */

/**
 * A rounded-rectangle glow, painted into a canvas, for a device that could not
 * decode the art.
 *
 * The falloff is stacked strokes rather than a blur: ctx.filter = "blur()" is
 * unimplemented on older WebViews, silently, and a silent no-op there would put
 * a hard-edged slab of colour round every charged card. Ten strokes of one path,
 * each a little wider than the last, accumulate into a curve instead — and the
 * alpha each is laid at is solved rather than picked, so that they composite to
 * PEAK*(1-d/spread)^GAMMA. Flat tenths would give a linear ramp, which at this
 * size reads as a band of colour with an edge on it rather than as light.
 *
 * Every pass is expanded outwards by half of what it spends outwards, which pins
 * the inner edge of all of them at INNER: an outer glow with a rim on it, not a
 * fat blurred border washing over the portrait.
 */
const BOX_W = 120;
const BOX_H = 264;
const RADIUS = 4;
const SPREAD = 22;
const INNER = 5;
const PASSES = 10;
const PEAK = 0.78;
const GAMMA = 2.4;

/** What one pass is laid at, so the stack composites to that curve. */
function passAlpha(k) {
  const band = (i) => PEAK * Math.pow(Math.max(0, 1 - (i - 1) / PASSES), GAMMA);
  return 1 - (1 - band(k)) / (1 - band(k + 1));
}

/**
 * Rounded rectangle by arcTo, the way plates.js draws one: roundRect is newer
 * than some of the WebViews this creative has to survive.
 */
function roundedPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0.01, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

let bakedTex = null;

function bakedAura() {
  if (!bakedTex) {
    const c = document.createElement("canvas");
    c.width = BOX_W + SPREAD * 2;
    c.height = BOX_H + SPREAD * 2;
    const ctx = c.getContext("2d");
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";

    // Widest first: the narrow passes are the bright ones and go on top.
    for (let i = PASSES; i > 0; i--) {
      const out = (SPREAD * i) / PASSES;
      const grow = (out - INNER) / 2;
      ctx.globalAlpha = passAlpha(i);
      ctx.lineWidth = INNER + out;
      roundedPath(
        ctx,
        SPREAD - grow,
        SPREAD - grow,
        BOX_W + grow * 2,
        BOX_H + grow * 2,
        RADIUS + grow,
      );
      ctx.stroke();
    }

    // The rim, so the line the frame is drawn along is the brightest pixel in
    // the picture. Without it the bake is a cloud with no edge in it.
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 5;
    roundedPath(ctx, SPREAD, SPREAD, BOX_W, BOX_H, RADIUS);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    roundedPath(ctx, SPREAD, SPREAD, BOX_W, BOX_H, RADIUS);
    ctx.stroke();

    bakedTex = canvasTexture(c);
  }
  return { texture: bakedTex, padX: SPREAD / BOX_W, padY: SPREAD / BOX_H };
}
