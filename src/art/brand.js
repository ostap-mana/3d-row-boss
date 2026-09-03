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
import retryLineUrl from "../assets/brand/retry-line.webp";
import appStoreUrl from "../assets/brand/badge-app-store.webp";
import googlePlayUrl from "../assets/brand/badge-google-play.webp";
import pcMacUrl from "../assets/brand/badge-pc-mac.webp";

/** Natural size of the packed art, and so the only aspect each may be drawn at. */
export const LOGO_ART = { w: 558, h: 131 };
export const PLAY_ART = { w: 640, h: 164 };

export const KEY_ART = { w: 1500, h: 1246 };

/**
 * The RETRY divider, packed by tools/pack-retry-line.mjs.
 *
 * The defeat card's way out, and deliberately not a second plate. A warm
 * champagne hairline with a small pale diamond finial off each end, breaking in
 * the middle around the word RETRY under a circular-arrow glyph and carrying a
 * shallow bracket under the label — the same divider vocabulary the outcome
 * screen is built from, with a label in the break instead of a plain notch. See
 * art/outcomeui.js.
 *
 * It replaced a blue gem plate that wore the PLAY NOW plate's own frame, and
 * the shape is the argument: two lit gem lockups stacked in one column is the
 * card making two offers at the same volume, and this card has exactly one
 * offer. A rule under the store row says "or" without asking for the tap. The
 * plate is still on disk and tools/pack-retry.mjs still makes it; nothing
 * imports it, so it is not bytes in the bundle.
 *
 * It is gold now and was chrome with magenta gems for one pass in between. Same
 * argument, one step further: the outcome screen's ornament is this gold, so a
 * chrome rule on the card after it was the only piece of furniture in the
 * creative quoting a different metal. That cut is still on disk as
 * `src/source/endcard/retry-line.png` and is the sharper file by a long way —
 * 1863 px of ink against this one's 444, see the note in the packer — so if the
 * softness at resolution 2 ever reads as a compression artefact, that is the
 * trade being paid for the colour, and it is reversible.
 *
 * At 12.05 it is a rule and not a button, which is why the card cannot measure
 * it off the PLAY NOW plate the way it measured the old one — see
 * EndCard.fitRetry and RETRY_W. Thinner than the chrome cut's 9.55: that one
 * stood a crest gem clear above the rule and hung a faceted finial off each
 * end, and this one spends its whole height on cap-height type and a bracket
 * that only just clears the baseline. At the width the card gives it that is
 * about four fifths of the depth, which the layout reads straight off this
 * constant and needs no telling about — but the hit box does, and it is grown
 * around the art rather than measured from it. See EndCard.placeRetry.
 */
export const RETRY_LINE_ART = { w: 1024, h: 85 };

/**
 * The two outcome banners — out of the build, and kept only as measurements.
 *
 * `victory.webp` and `defeat.webp` are off disk now — see .deleted-assets.txt —
 * and tools/pack-victory.mjs and tools/pack-defeat.mjs still make them on
 * demand. Nothing imported them even while they were there, so they were never
 * bytes in the bundle either. The screen they were for is gone: the
 * verdict is now the game's own title band with a word in it over a frozen still
 * of the fight — see ui/outcome.js — and the end card that follows has said
 * nothing about the result since. That is 170 kB of WebP, and about 227 kB of
 * base64 inside the one inlined file, off the deliverable.
 *
 * The constants stay because they are a transcript of what the packers printed,
 * and because `bannerSprite` below still answers the end card's question — with
 * null, now and always, which is an answer that card has always been written
 * for. See EndCard.show and its `stamped` argument, which is the only way it is
 * ever called.
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
let retryLineTexture = null;
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
    decode(retryLineUrl)
      .then((t) => {
        retryLineTexture = t;
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
 * One outcome banner — null, always. See the note on VICTORY_ART above.
 *
 * Kept rather than deleted because the end card's own answer to null is already
 * written and already correct: no banner art means no banner, upright and held
 * sideways both. Removing the function would mean editing that solve instead,
 * which is a change to a working layout for no gain.
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
 * The RETRY divider, centred on its own origin, or null if it never decoded.
 *
 * Null is a real answer and the end card is written for it: with no ornament the
 * control falls back to the drawn pill and the word in type, which is plainer
 * and is still a button that restarts the fight. See EndCard.fitRetry.
 */
export function retryLineSprite() {
  return sprite(retryLineTexture);
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

/** What the RETRY divider stands to at width `w`. The only height it may take. */
export function retryLineHeight(w) {
  return (w * RETRY_LINE_ART.h) / RETRY_LINE_ART.w;
}

/** Size the RETRY divider to `w`, at its own aspect. */
export function fitRetryLine(s, w) {
  const h = retryLineHeight(w);
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
