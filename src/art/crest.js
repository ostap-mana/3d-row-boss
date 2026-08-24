/**
 * The boss crest: the badge at the head of KOLTMOS's health bar.
 *
 * Three files out of `src/assets/ui/`, packed by tools/pack-boss-crest.mjs, and
 * none of them is a badge on its own:
 *
 *   boss-crest-frame.webp  268x430  the gold hexagon, and only the gold — the
 *                                   source art is 96% transparent, an outline
 *                                   with nothing behind it.
 *   boss-crest-plate.webp  268x430  that outline's interior as a white stamp,
 *                                   filled row by row off the frame itself so
 *                                   the bore can never drift out of the rim it
 *                                   sits in. Tinted here, never shown white.
 *   boss-crest-face.webp   256x251  the beast's head, with its bottom fifth
 *                                   ramped out so it rises out of the plate
 *                                   rather than being pasted on top of it.
 *
 * Stacked plate, glow, face, frame, and the face is deliberately not masked:
 * it is drawn half again as wide as its own plate so the jaw and the horns break
 * the rim, which is the whole reason a crest reads as a portrait of something
 * dangerous rather than as an avatar in a box. The frame goes on last so the
 * gold still closes around what is bursting out of it.
 *
 * No masks and no gradient fills anywhere: this is chrome that is on screen for
 * the whole creative, over an arena that is already the most expensive thing
 * being drawn. The lift from dark bore to lit head is a single additive glow
 * doing the work a gradient would otherwise cost a render pass for.
 */

import { Container, Sprite } from "pixi.js";
import { canvasTexture, glowTexture } from "./textures.js";
import { tween, Ease } from "../core/tween.js";
import frameUrl from "../assets/ui/boss-crest-frame.webp";
import plateUrl from "../assets/ui/boss-crest-plate.webp";
import faceUrl from "../assets/ui/boss-crest-face.webp";

/** Aspect of the plate and the frame, which share a cell. 268/430. */
const ASPECT = 268 / 430;

/** Aspect of the face's own cell. 256/251. */
const FACE_ASPECT = 256 / 251;

/**
 * How the head sits in the plate, as fractions of the plate.
 *
 * `WIDE` past 1 is the point of the thing — see the header. `FOOT` is where the
 * head's own bottom edge lands, and it is low: the fade has already taken the
 * bottom fifth of that art, so what reaches down there is the beast's chest
 * going to nothing rather than a cut edge.
 *
 * They were 1.18 and 0.78, which bottomed the head out around 0.62 of the plate
 * and left the whole lower third as empty bore with a small gold lozenge set in
 * it — the shape of a rank badge, not of a boss.
 *
 * These are the far side of that, and the number that decides them is not in
 * this file: the badge renders at about 104 points tall — see CREST_RISE in
 * ui/hud.js — and at that size the frame is a hairline. Judged big, 1.45 looks
 * like a beast bursting out of a shield. Judged at 104, it looks like the shield
 * fell off: the head's shoulders clear the rim by a fifth of the plate on each
 * side, and the gold has nothing left to close around. 1.26 is where the whole
 * hexagon still reads, top point to bottom edge, with the jaw and the frills
 * just touching it — which is the bursting-out the header is after, at the size
 * this thing is actually looked at.
 */
const FACE_WIDE = 1.26;
const FACE_FOOT = 0.92;

/** Bore, and the light behind the head. */
const BORE = 0x1d1024;
const HALO = 0xb43cff;

let frameTex = null;
let plateTex = null;
let faceTex = null;

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
 * Decode the crest before the HUD is built.
 *
 * Never rejects, and not all-or-nothing: each layer is caught on its own, and
 * the badge draws whichever of them arrived. A crest with no face is still a
 * gold plate at the head of the bar; a crest with nothing at all takes itself
 * off the HUD and the bar spans the full width, which is where it started.
 */
export async function loadBossCrest() {
  await Promise.all([
    decode(frameUrl)
      .then((t) => {
        frameTex = t;
      })
      .catch(() => {}),
    decode(plateUrl)
      .then((t) => {
        plateTex = t;
      })
      .catch(() => {}),
    decode(faceUrl)
      .then((t) => {
        faceTex = t;
      })
      .catch(() => {}),
  ]);
}

/** Whether there is enough of it to be worth putting on the HUD. */
export function haveBossCrest() {
  return !!(frameTex || plateTex);
}

/**
 * The badge, anchored on its own centre so the HUD can place it by one point.
 *
 * Sized by height alone — `resize(h)` — because height is what the chrome has
 * to spare and width is whatever the art's aspect makes of it.
 */
export class BossCrest extends Container {
  constructor() {
    super();

    this.plate = new Sprite(plateTex || glowTexture());
    this.plate.anchor.set(0.5);
    this.plate.tint = BORE;
    this.plate.visible = !!plateTex;
    this.addChild(this.plate);

    // The light in the bore. Additive over the plate and under the head, which
    // is the whole gradient this badge gets.
    this.halo = new Sprite(glowTexture());
    this.halo.anchor.set(0.5);
    this.halo.blendMode = "add";
    this.halo.tint = HALO;
    this.halo.alpha = 0.6;
    this.addChild(this.halo);

    this.face = new Sprite(faceTex || glowTexture());
    this.face.anchor.set(0.5, 1);
    this.face.visible = !!faceTex;
    this.addChild(this.face);

    /**
     * Hit flash: the head drawn over itself with the `add` blend, the same
     * bargain art/boss.js strikes. A tint can only take a colour down, and this
     * art is dark enough that a darker version of it reads as nothing.
     */
    this.flash = new Sprite(faceTex || glowTexture());
    this.flash.anchor.set(0.5, 1);
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    this.flash.visible = !!faceTex;
    this.addChild(this.flash);

    this.frame = new Sprite(frameTex || glowTexture());
    this.frame.anchor.set(0.5);
    this.frame.visible = !!frameTex;
    this.addChild(this.frame);

    this.t = 0;
    this.h = 0;
  }

  /** Fit the badge into `h` points of height. Returns the width it took. */
  resize(h) {
    this.h = h;
    const w = h * ASPECT;

    this.plate.setSize(w, h);
    this.frame.setSize(w, h);

    // Centred, now that the head is. It was pulled up by a tenth while the head
    // sat in the top two thirds and a centred halo would have lit the empty band
    // under it; there is no empty band left to light.
    this.halo.setSize(w * 1.5, h * 0.95);

    const fw = w * FACE_WIDE;
    for (const s of [this.face, this.flash]) {
      s.setSize(fw, fw / FACE_ASPECT);
      s.y = -h / 2 + h * FACE_FOOT;
    }

    return w;
  }

  /** The boss took one. Light the head up and rock the badge. */
  hit(power) {
    const p = power === undefined ? 1 : power;
    this.flash.alpha = Math.min(0.7, 0.42 * p);
    tween(this.flash, { alpha: 0 }, 0.34, { ease: Ease.quadOut });
    this.scale.set(1 + 0.06 * Math.min(1.5, p));
    tween(this.scale, { x: 1, y: 1 }, 0.4, { ease: Ease.elasticOut });
  }

  /**
   * Phase two: the bore goes hot and the halo with it.
   *
   * The badge is the one piece of chrome that carries the boss's own face, so
   * it turns over when he does — the bar beside it only ever gets shorter.
   */
  enrage() {
    this.plate.tint = 0x3a1020;
    this.halo.tint = 0xff2a6a;
  }

  /** Breathe. Slow, and off the bar's own clock so the two never lock up. */
  update(dt) {
    this.t += dt;
    this.halo.alpha = 0.6 + Math.sin(this.t * 2.4) * 0.14;
  }
}
