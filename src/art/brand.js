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
import retryPlateUrl from "../assets/brand/retry-plate.webp";
import appStoreUrl from "../assets/brand/badge-app-store.webp";
import googlePlayUrl from "../assets/brand/badge-google-play.webp";
import pcMacUrl from "../assets/brand/badge-pc-mac.webp";

/** Natural size of the packed art, and so the only aspect each may be drawn at. */
export const LOGO_ART = { w: 558, h: 131 };
export const PLAY_ART = { w: 640, h: 164 };

export const KEY_ART = { w: 1500, h: 1246 };

/**
 * The RETRY lockup, packed by tools/pack-retry-boss.mjs.
 *
 * The defeat card's way out, painted: the beast roaring straight out of the
 * frame over a banner with RETRY across it, a claw hooked round each end of the
 * banner and the little shaman riding its shoulders, the whole thing wrapped in
 * a magenta bloom. The rematch offered by the thing that took the fight off the
 * player, which is an argument only a picture can make.
 *
 * It is the third shape this control has had and the first that is a picture of
 * the game rather than a piece of furniture. It replaced a hairline rule, which
 * had replaced a blue gem plate, and both of those were chosen against exactly
 * this: two lit lockups stacked in one column is the card making two offers at
 * the same volume, and the card has one offer. That objection has not gone away
 * — it has been overruled, and the sizing is where the overruling is paid for.
 * See RETRY_BOSS_W in ui/endcard.js, which holds this to about three quarters of
 * the CTA plate's width so the pitch still wins the column on width, and only
 * on width.
 *
 * Both older cuts are still on disk and both packers still run —
 * tools/pack-retry-line.mjs and tools/pack-retry.mjs. Nothing imports either,
 * so neither is bytes in the bundle.
 *
 * At 1.16 it is a painting and not a rule, and the difference costs the layout
 * a second number: fitted to the width the old rule was given it would stand
 * about twelve times as deep, which upright eats the picture and sideways is
 * taller than the column it is a rung of. So this one is fitted to a width
 * *and* a ceiling, and hands back the box it settled on. See fitRetryBoss.
 *
 * ## Three deliveries, and why the shape keeps moving
 *
 * The first cut came in at 1.42 on a sheet of white and had to be keyed off it —
 * see tools/cut-bg.mjs --glow. The second was the artist's own matted delivery
 * at 1.38, a plate of cracked obsidian with the boss leaning over it. This is
 * the third: a different lockup rather than a recut of the same one, and the
 * one place in the creative where the art is louder than the pitch above it on
 * purpose. It arrived at 1344x896 on a flat dark teal sheet with no alpha at
 * all, and is cut by tools/cut-dark-bg.mjs, which is in the folder because of
 * it — a bloom over a dark fill is an additive glow and neither of the other
 * two cutters can read one.
 *
 * Every one of those three was a different aspect and none of them cost the
 * card a line: the fit asks this constant, the constant is a transcript of what
 * the packer printed, and the ceiling in the caller is what keeps a taller
 * painting from taking the screen. All three sources are still on disk beside
 * the current one, as `retry-boss-v1-*.png`, `retry-boss-v2.png` and
 * `retry-boss-v3-teal.png`.
 */
export const RETRY_BOSS_ART = { w: 640, h: 551 };

export const RETRY_PLATE_ART = { w: 472, h: 128 };

/**
 * The RETRY divider, out of the build — and kept only as a measurement.
 *
 * `retry-line.webp` is still on disk and tools/pack-retry-line.mjs still makes
 * it, but nothing imports it any more: the control above replaced it. The
 * constant stays as the transcript of what that packer printed, the same way
 * VICTORY_ART and DEFEAT_ART below do, so the rule can be put back by pointing
 * the card's fit at it rather than by re-deriving its aspect.
 *
 * A warm champagne hairline with a small pale diamond finial off each end,
 * breaking in the middle around the word RETRY under a circular-arrow glyph and
 * carrying a shallow bracket under the label — the same divider vocabulary the
 * outcome screen is built from. See art/outcomeui.js.
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

let keyArtTexture = null;
let logoTexture = null;
let playTexture = null;
let retryPlateTexture = null;
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
    decode(retryPlateUrl)
      .then((t) => {
        retryPlateTexture = t;
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
 * The RETRY lockup, centred on its own origin, or null if it never decoded.
 *
 * Null is a real answer and the end card is written for it: with no painting the
 * control falls back to the drawn pill and the word in type, which is plainer
 * and is still a button that restarts the fight. See EndCard.fitRetry.
 */
export function retryPlateSprite() {
  return sprite(retryPlateTexture);
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

export function retryPlateHeight(w) {
  return (w * RETRY_PLATE_ART.h) / RETRY_PLATE_ART.w;
}

/**
 * Size the RETRY lockup into `w` by `maxH`, and report the box it took.
 *
 * The only fit on this screen that takes two numbers, and the only one that can
 * hand back a width other than the one it was given. Every other piece of brand
 * art here is a wide, shallow thing — a wordmark, a plate, a store badge, a rule
 * — so a width is the whole question and the aspect answers the rest. This one
 * is nearly square by comparison, and a width that suits the column can imply a
 * height the column does not have: sideways there is barely a third of a phone's
 * short edge for the entire pitch, and this rung asked for more of it than the
 * wordmark, the plate and the store row together.
 *
 * So the ceiling wins when the two disagree, and the width comes back down to
 * meet it rather than the art being squashed into the box. The caller places
 * what it is handed, which is why this returns a box and not a height.
 *
 * @returns {{w: number, h: number}}
 */
export function fitRetryPlate(s, w, maxH) {
  let h = retryPlateHeight(w);
  if (maxH > 0 && h > maxH) {
    h = maxH;
    w = (h * RETRY_PLATE_ART.w) / RETRY_PLATE_ART.h;
  }
  s.setSize(w, h);
  return { w, h };
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
