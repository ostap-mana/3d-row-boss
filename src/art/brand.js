/**
 * The brand furniture on the end card: the wordmark, the PLAY NOW plate, and
 * the three store badges.
 *
 * All five are packed out of the marketing key art by tools/pack-endcard.mjs —
 * trimmed to their own ink, re-encoded as WebP, and renamed to something that
 * can be imported without quoting a space. The originals stay in src/letters
 * next to them.
 *
 * None of it is nine-sliced, and none of it may be stretched. The plate is a
 * painted gem with a faceted field, a gold frame and a diamond finial off each
 * end; the wordmark is type; the badges are somebody else's trade dress and
 * their proportions are not ours to change. So every fit here takes a width and
 * hands back the height that width implies.
 *
 * The end card is laid out around those returned heights rather than around
 * numbers of its own, which is what lets one stack solve for a phone held
 * upright and the same one held sideways. The HUD's persistent CTA is the same
 * two pieces at a smaller width — the wordmark over the plate — for the same
 * reason: see `banner` in core/layout.js.
 */

import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import keyArtUrl from "../assets/brand/key-art.webp";
import logoUrl from "../assets/brand/logo-invokers.webp";
import playUrl from "../assets/brand/play-now.webp";
import retryUrl from "../assets/brand/retry.webp";
import appStoreUrl from "../assets/brand/badge-app-store.webp";
import googlePlayUrl from "../assets/brand/badge-google-play.webp";
import pcMacUrl from "../assets/brand/badge-pc-mac.webp";
import victoryUrl from "../assets/brand/victory.webp";
import defeatUrl from "../assets/brand/defeat.webp";

/** Natural size of the packed art, and so the only aspect each may be drawn at. */
export const LOGO_ART = { w: 558, h: 131 };
export const PLAY_ART = { w: 640, h: 164 };

export const KEY_ART = { w: 1500, h: 1246 };

/**
 * The RETRY plate, packed by tools/pack-retry.mjs.
 *
 * The defeat card's second button — a blue gem plate in the same chromed frame
 * the PLAY NOW plate wears, with RETRY cut into it in the same bevelled type.
 * It is here rather than beside the banners because it is furniture and not a
 * verdict: it is a control the card carries, the way the plate above it is.
 *
 * Its own aspect and not the plate's. At 3.11 it is chunkier than PLAY NOW's
 * 3.90 — a shorter word in a frame of the same weight — so the two cannot share
 * a constant, and the card sizes this by width and takes the height it gets.
 * See EndCard.fitRetry.
 */
export const RETRY_ART = { w: 640, h: 206 };

/**
 * The two outcome banners, packed by tools/pack-victory.mjs and
 * tools/pack-defeat.mjs.
 *
 * Not marketing furniture like the four above them — they are the one thing on
 * the end card that says what just happened, and exactly one of the two ever
 * appears. They live here anyway because they are the same kind of object: a
 * painted bitmap with an aspect that is not ours to change, fitted by width and
 * asked for its own height. See EndCard.placeBanner, which lays whichever one
 * won in the hole the stack leaves for the picture rather than as a rung of the
 * stack.
 *
 * Two constants and not one, because the two paintings are not the same shape:
 * VICTORY is a crowned plaque at 2.00 and DEFEAT is a spiked one at 2.63, and a
 * shared aspect would squash whichever of them lost the argument. Both are
 * transcripts of what their own packer printed.
 */
export const VICTORY_ART = { w: 1024, h: 513 };
export const DEFEAT_ART = { w: 1024, h: 390 };

/**
 * Where the picture actually is inside the key art, as fractions of it.
 *
 * The painting is mostly smoke: the phone and the four figures bursting out of
 * it sit right of centre and a little above it, and everything else is
 * atmosphere. A plain centred cover fit on a phone held upright would crop to
 * the middle of the file and cut the golem off the right-hand edge, so the fit
 * below aims this point instead of the file's centre.
 *
 * Measured off the pack, not guessed.
 */
export const KEY_ART_FOCUS = { x: 0.6, y: 0.49 };

/**
 * The store row, in the order the key art has it.
 *
 * `id` is what gets handed to ctaClick, so a network's report can tell an
 * install that came off the Google badge from one that came off the plate — and
 * so the badge opens the store it is a picture of, which it looks up by that same
 * id. See BADGE_STORE in config.js.
 *
 * A badge is a promise about where it leads and it keeps it wherever the
 * destination is ours to pick — standalone, and under MRAID. A network wrapper
 * that runs its own booked click-through overrides all three, and nothing here
 * can or should change that.
 */
const BADGES = [
  { id: "appstore", url: appStoreUrl },
  { id: "googleplay", url: googlePlayUrl },
  { id: "pcmac", url: pcMacUrl },
];

/**
 * The plate's own colours, sampled off the art.
 *
 * Exported because the end card draws a stand-in when the bitmap does not
 * decode, and the CTA is the one surface in the whole creative that has to be
 * there. `FILL` is the middle of the gem field, which runs magenta at one end
 * and orange at the other; the label is the warm off-white of the baked type.
 */
export const PLAY_FILL = 0xc31839;
export const PLAY_RIM = 0xf0a33c;
export const PLAY_LABEL = 0xfbf1e4;
export const PLAY_LABEL_STROKE = 0x3d0511;

let keyArtTexture = null;
let logoTexture = null;
let playTexture = null;
let retryTexture = null;
let victoryTexture = null;
let defeatTexture = null;
const badgeTextures = {};

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
 * Decode all of it before the end card is built.
 *
 * Never rejects, and not all-or-nothing either: each piece is caught on its own,
 * so a device that cannot read one of these still gets the rest. The card draws
 * its own headline when the wordmark is missing and its own pill when the plate
 * is, and simply leaves out any badge that did not arrive.
 */
export async function loadBrandArt() {
  await Promise.all([
    decode(victoryUrl)
      .then((t) => {
        victoryTexture = t;
      })
      .catch(() => {}),
    decode(defeatUrl)
      .then((t) => {
        defeatTexture = t;
      })
      .catch(() => {}),
    decode(keyArtUrl)
      .then((t) => {
        keyArtTexture = t;
      })
      .catch(() => {}),
    decode(logoUrl)
      .then((t) => {
        logoTexture = t;
      })
      .catch(() => {}),
    decode(playUrl)
      .then((t) => {
        playTexture = t;
      })
      .catch(() => {}),
    decode(retryUrl)
      .then((t) => {
        retryTexture = t;
      })
      .catch(() => {}),
    ...BADGES.map((b) =>
      decode(b.url)
        .then((t) => {
          badgeTextures[b.id] = t;
        })
        .catch(() => {}),
    ),
  ]);
}

/**
 * One outcome banner, centred on its own origin, or null if it never decoded.
 *
 * Taken by outcome rather than exposed as two functions, so that the end card
 * asks for "the banner for this result" and there is one place — here — that
 * knows which painting that is. The card is written to take null for an answer
 * either way, which is also what a device that decoded one and not the other
 * gets.
 */
export function bannerSprite(defeated) {
  return sprite(defeated ? defeatTexture : victoryTexture);
}

/** What that banner stands to at width `w`. The only height it may be given. */
export function bannerHeight(defeated, w) {
  const art = defeated ? DEFEAT_ART : VICTORY_ART;
  return (w * art.h) / art.w;
}

/** Size the banner to `w`, at its own aspect. */
export function fitBanner(s, defeated, w) {
  const h = bannerHeight(defeated, w);
  s.setSize(w, h);
  return h;
}

/** The key art, centred on its own origin, or null if it never decoded. */
export function keyArtSprite() {
  return sprite(keyArtTexture);
}

/** The wordmark, centred on its parent's origin, or null if it never decoded. */
export function logoSprite() {
  return sprite(logoTexture);
}

/** The PLAY NOW plate, centred on its parent's origin, or null. */
export function playPlateSprite() {
  return sprite(playTexture);
}

/**
 * The RETRY plate, centred on its own origin, or null if it never decoded.
 *
 * Null is a real answer and the end card is written for it: with no painting the
 * button falls back to the drawn pill and the word in type, which is plainer and
 * is still a button that restarts the fight. See EndCard.fitRetry.
 */
export function retryPlateSprite() {
  return sprite(retryTexture);
}

/**
 * The badges that decoded, in key-art order, each centred on its own origin.
 * @returns {Array<{id: string, sprite: Sprite, aspect: number}>}
 */
export function badgeSprites() {
  return BADGES.filter((b) => badgeTextures[b.id]).map((b) => {
    const tex = badgeTextures[b.id];
    return {
      id: b.id,
      sprite: sprite(tex),
      aspect: tex.width / tex.height,
    };
  });
}

function sprite(texture) {
  if (!texture) return null;
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  return s;
}

/** What the wordmark stands to at width `w`. The only height it may be given. */
export function logoHeight(w) {
  return (w * LOGO_ART.h) / LOGO_ART.w;
}

/** The same for the plate. */
export function playHeight(w) {
  return (w * PLAY_ART.h) / PLAY_ART.w;
}

/** Size the wordmark to `w`, at its own aspect. */
export function fitLogo(s, w) {
  const h = logoHeight(w);
  s.setSize(w, h);
  return h;
}

/** Size the plate to `w`, at its own aspect. */
export function fitPlayPlate(s, w) {
  const h = playHeight(w);
  s.setSize(w, h);
  return h;
}

/** What the RETRY plate stands to at width `w`. The only height it may take. */
export function retryHeight(w) {
  return (w * RETRY_ART.h) / RETRY_ART.w;
}

/** Size the RETRY plate to `w`, at its own aspect. */
export function fitRetryPlate(s, w) {
  const h = retryHeight(w);
  s.setSize(w, h);
  return h;
}

/**
 * Cover `w` by `h` with the key art, with its focal point landing on `fx, fy`.
 *
 * Cover and not contain: this is a backdrop, and a letterboxed backdrop is two
 * black bars and an admission that the art did not fit. The aim is then clamped
 * so that no edge of the painting can ever come inside the screen — a phone
 * wide enough to pull the focus that far simply gets a straighter crop, which
 * is the one failure here nobody will notice.
 *
 * `zoom` is scale on top of that cover, and it is what buys the aim any room to
 * work in. A plain cover fit matches one axis exactly, and on that axis the
 * clamp above is the only answer there is: on a phone held sideways the
 * painting comes out precisely as wide as the screen, so asking for the phone
 * to sit right of centre moves nothing at all. Overscanning it gives the aim
 * something to spend. It costs crop, so it is worth asking for only where the
 * composition needs to move.
 */
export function fitKeyArt(s, w, h, fx, fy, zoom) {
  const k = Math.max(w / KEY_ART.w, h / KEY_ART.h) * (zoom || 1);
  const aw = KEY_ART.w * k;
  const ah = KEY_ART.h * k;
  s.setSize(aw, ah);
  // The sprite is anchored at its middle, so this solves for the middle given
  // where the focus has to end up.
  const x = fx - (KEY_ART_FOCUS.x - 0.5) * aw;
  const y = fy - (KEY_ART_FOCUS.y - 0.5) * ah;
  s.position.set(
    Math.max(w - aw / 2, Math.min(aw / 2, x)),
    Math.max(h - ah / 2, Math.min(ah / 2, y)),
  );
}
