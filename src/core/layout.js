/**
 * Responsive layout solver.
 *
 * The creative is built for a 375x667 iPhone SE as the worst case and scales up
 * from there. Both orientations must survive, so every region is derived from
 * the current viewport instead of being authored once.
 *
 * It is not phones only any more, and the stage below is what that cost. A
 * playable is opened on a tablet and on a desktop browser as often as it is
 * reviewed on one, and a composition solved straight off the window does two
 * things wrong up there. It stretches: an iPad's 4:3 gives the board a width it
 * cannot use — the board is bound by the height it has — while the health bar
 * and the hero row keep taking the whole 4:3 anyway, so nothing on the screen
 * shares an edge with anything else. And it swells: on a 1920x1080 desktop the
 * same layout comes out at nearly three times the size it was drawn for, which
 * is a wall of 178 point gems, bitmaps packed for a phone stretched well past
 * the resolution they were packed at, and a hero card the size of a hand.
 *
 * So the layout is solved inside a stage rather than inside the window: a
 * centred box whose aspect is held to the range each orientation was actually
 * drawn for, and whose size stops at twice the reference phone — the same
 * ceiling `ui` has always had. Every region below is measured in that box and
 * translated into the window on the way out, so nothing downstream changes.
 *
 * Nothing is letterboxed by it. `w` and `h` are still the window, and the things
 * that are meant to fill it — the arena, the scrims, the flashes, the end card's
 * painting — still do. What the stage bounds is the composition: the board, the
 * boss, the row, the chrome. On every phone in the matrix the stage is the whole
 * window and this file computes exactly what it computed before.
 */

import { FRAME_ART, FRAME_OPENING } from "../art/boardframe.js";
import { LOGO_ART, PLAY_ART } from "../art/brand.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Natural drawing size of the boss rig, used to fit it into its region. */
export const BOSS_ART = { w: 560, h: 460 };

/**
 * Play grid as a fraction of the board's outer box — the frame's stone border
 * is the rest of it. Read off the art so that `board.cell` here and the cell
 * Board actually lays out can never drift apart.
 */
const GRID_RATIO =
  1 / Math.max(FRAME_ART.w / FRAME_OPENING.w, FRAME_ART.h / FRAME_OPENING.h);

/**
 * The hero card, and the row's margins around it.
 *
 * The row used to be a share of the screen's height, with the cards taking
 * whatever a fixed inset left of it. That works on a tall phone and fails on a
 * short one, because the two sides of a card come off different axes: its width
 * is the viewport's width divided six ways, and its height was the viewport's
 * height times a constant. On a 390x844 phone those two numbers happen to agree
 * and the card comes out 56 by 117 — a portrait. On a 375x667 phone the width
 * barely moves and the height loses a quarter, and the same card comes out 54 by
 * 92, which is not a portrait of anybody: it is a tile with a name across it.
 *
 * So the row is sized from the card instead. The width is what six of them and
 * five gaps make of the viewport, the aspect decides the height, and the row's
 * box is whatever that adds up to — the same card on every phone. What the row
 * takes comes out of the boss's band, which is the only region on this screen
 * with slack, and out of the board only on the screens short enough to need it.
 */
const CARD = {
  /**
   * Width over height.
   *
   * 0.48 is the roster art's own framing: the busts are head-and-shoulders, and
   * a card near enough half as wide as it is tall crops them at the sides — a
   * shoulder each way — rather than through the jaw.
   */
  aspect: 0.48,
  /** Gap between two cards, as a fraction of the width the row ends up with. */
  gap: 0.011,
  /** Air under the row, as a fraction of a card's height. */
  foot: 0.1,
  /**
   * Ceiling on a card's height, as a fraction of the viewport's height.
   *
   * Two numbers because the two orientations hit it for opposite reasons.
   *
   * Landscape reaches it because the column the row stands in is wide against
   * how tall it is — 500 points across and 390 tall — so six cards at the aspect
   * would ask for 160 points of a 390 point screen and take them off the boss.
   *
   * Portrait reaches it only on a short phone, and the reason is the boss. Six
   * cards at the aspect want a fifth of a 640 point screen, and a 640 point
   * screen does not have a fifth to spare once the board has taken the width it
   * is owed: the golem came out at 0.23 scale, which is a shape rather than a
   * monster. A sixth is the share at which he reads and the cards are still
   * portraits — cardBand narrows the card to hold the aspect rather than
   * squashing it, so what a short phone loses is a little row width, not the
   * framing of anybody's face.
   */
  tall: { portrait: 0.165, landscape: 0.34 },
};

/**
 * The band of `count` cards that fits `avail` wide and `maxH` tall, centred in
 * the width it was offered.
 *
 * Width first: the aspect turns it into a height, and if that height is more
 * than there is, the height becomes the given and the aspect turns it back into
 * a narrower card. Either way the band is exactly the cards and the gaps
 * between them, so nothing downstream has to know which of the two ran.
 *
 * `avail` is the width the row actually gets. The margin that used to be taken
 * off in here is the caller's now — there is one gutter on this screen and the
 * row is not the only thing keeping to it, so it is measured in one place. See
 * gutter().
 */
function cardBand(x, avail, count, maxH) {
  const inner = avail;
  const gap = inner * CARD.gap;
  let cardW = (inner - gap * (count - 1)) / count;
  let cardH = cardW / CARD.aspect;

  if (cardH > maxH) {
    cardH = maxH;
    cardW = cardH * CARD.aspect;
  }

  const w = cardW * count + gap * (count - 1);
  return { x: x + (avail - w) / 2, w, h: cardH, gap };
}

/**
 * The one margin every piece of chrome keeps off the edge of the screen.
 *
 * There used to be three. The health bar sat at `pad * 1.6`, the hero row at
 * 2.1% of the width, and the board went edge to edge — so on a 390 point screen
 * the bar was inset 16 points, the cards 8, and the board 0. Three gutters is
 * three left edges, and nothing on the screen lined up with anything else.
 *
 * Now there is this, and the board. The board is deliberately not in it: a
 * full-bleed play field under inset chrome is a decision, and it only reads as
 * one while the chrome agrees with itself about where the edge is.
 */
function gutter(w) {
  return clamp(w * 0.042, 12, 28);
}

/**
 * The persistent CTA plate, sized and placed here rather than hung off a corner
 * by whoever draws it.
 *
 * It was the HUD's own business and it had no business being: a banner that
 * decides for itself which corner it likes is a banner that lands on whatever
 * is already there, and in landscape what is already there is the board. The
 * layout is the one thing on this screen that knows where everything else is,
 * so it hands the HUD a box and the HUD fills it. See ui/hud.js.
 *
 * It is the wordmark over the PLAY NOW plate — the end card's own two pieces,
 * at HUD size. It used to be the gem banner with INSTALL set across it, which
 * spent the one persistent surface in the fight on the one word in the
 * creative that names a chore rather than the game, and spent it in art
 * nothing else on screen wears. The card's lockup is the thing the player is
 * being walked towards; showing it early is what makes the card a landing
 * rather than an interruption.
 *
 * 124 is not arbitrary — it is the width at which the PLAY NOW baked into the
 * plate still reads on the smallest phone this runs on, and the plate is the
 * half that has to be legible. The wordmark is held under that width rather
 * than matched to it: flush edges read as one blob at this size.
 *
 * Both heights come off their arts' own aspects, and the 1.045 is the breath
 * the HUD gives the lockup in update() — the box is measured against it at its
 * largest, not at rest.
 */
const BANNER_W = 124;
/** The wordmark over the plate, as a fraction of the plate's width. */
const BANNER_LOGO_W = 0.84;
/** Beside it instead, where the wordmark is no longer paying in height. */
const BANNER_LOGO_W_WIDE = 0.9;
/** Air between the two, as a fraction of the plate's height. */
const BANNER_GAP = 0.2;
const BANNER_BREATH = 1.045;

/**
 * The box, and the pieces inside it.
 *
 * The HUD arranges them and does not size them, so what the layout reserves and
 * what actually gets drawn cannot drift — which is the whole reason this plate
 * stopped being the HUD's own business.
 *
 * `stacked` is why the two orientations get different shapes rather than one
 * shape at two scales. Upright the lockup is an overlay in the corner above the
 * golem: height there is free and width is not, so the wordmark goes over the
 * plate. Sideways the CTA is a bought band across the top and the board yields
 * the height for it — every point the lockup grows downwards is a point off the
 * grid — so the wordmark goes beside the plate instead and the band stays one
 * plate tall. Stacking it in both would have cost a landscape board a ninth of
 * its size to say the same thing.
 *
 * @param {boolean} stacked wordmark over the plate, rather than left of it
 * @returns {{w:number,h:number,stacked:boolean,plateW:number,plateH:number,
 *   logoW:number,logoH:number,gap:number}}
 */
function bannerBox(ui, stacked) {
  const plateW = Math.max(100, BANNER_W * ui);
  const plateH = (plateW * PLAY_ART.h) / PLAY_ART.w;
  const logoW = plateW * (stacked ? BANNER_LOGO_W : BANNER_LOGO_W_WIDE);
  const logoH = (logoW * LOGO_ART.h) / LOGO_ART.w;
  const gap = plateH * BANNER_GAP;
  const content = stacked
    ? { w: plateW, h: logoH + gap + plateH }
    : { w: logoW + gap + plateW, h: Math.max(logoH, plateH) };
  return {
    w: content.w,
    h: content.h * BANNER_BREATH,
    stacked,
    plateW,
    plateH,
    logoW,
    logoH,
    gap,
  };
}

/**
 * The box the composition is solved in — the safe zone.
 *
 * `short` is the reference phone's short side, and it is the same 375 `ui` has
 * always divided by; `maxScale` is the same 2.0 `ui` has always clamped to. Tying
 * the stage to those two numbers is the point of it: past this size the type
 * stopped growing, so past this size nothing else may either, and a composition
 * that stops growing all at once keeps the proportions it was drawn with
 * instead of coming apart at one end.
 *
 * The aspects are read off the devices rather than chosen. Upright, every phone
 * this ships to is between 0.42 wide over tall (a 21:9 Xperia) and 0.5625 (a
 * 9:16 SE), so the range is exactly the phones and every one of them gets the
 * whole window. Anything squarer than 9:16 — an iPad's 0.75, a desktop window's
 * anything — is a shape the creative was never drawn for, and it gets a 9:16
 * stage centred in it with the arena running out to the edges behind. Sideways
 * the same reading gives 1.2 to 2.2: an SE on its side is 1.78 and a modern
 * phone 2.17, while an ultrawide desktop's 2.37 is trimmed back to a shape the
 * boss's column and the board can still share honestly.
 */
const STAGE = {
  short: 375,
  maxScale: 2,
  portrait: { min: 0.42, max: 0.5625 },
  landscape: { min: 1.2, max: 2.2 },
};

/**
 * Corner the ad container keeps for its own close button.
 *
 * Every network draws one over the creative — Unity, ironSource, AppLovin,
 * Google — and every one of them draws it in a top corner, at a fixed size in
 * CSS pixels rather than at ours, somewhere around forty points square with a
 * margin outside it. Nothing in here can move it, so the one thing this file can
 * do about it is not put the CTA underneath it.
 *
 * And it is the CTA and only the CTA that this pushes down. The lockup is the
 * one thing on the fight screen a player taps on purpose, in both orientations
 * it is right-aligned at the top, and a tap that lands on a close button instead
 * of on PLAY NOW is the whole creative wasted. The boss name and the doom clock
 * are up there too and are left where they are: they are read rather than
 * touched, and buying them the same clearance would cost the board fifty points
 * on every phone to protect type a close button overlaps for the last seconds of
 * a thirty second fight.
 *
 * Zero it to put the lockup back at the foot of the chrome.
 */
const CLOSE_KEEPOUT = 52;

/**
 * The stage: the largest box of an allowed shape and size, centred in the
 * window.
 *
 * Two clamps, in order. The aspect first — the window is trimmed on whichever
 * axis is too long for the range, so a 4:3 tablet loses width and a folded
 * phone's sliver loses height. Then the size, which scales the box down whole
 * rather than trimming it again: past twice the reference phone the creative
 * gains nothing by being bigger, and a box that keeps its shape while it shrinks
 * is the difference between a desktop showing the game and a desktop showing a
 * stretched phone.
 */
function stageBox(w, h, portrait) {
  const range = portrait ? STAGE.portrait : STAGE.landscape;
  const view = w / h;
  const aspect = clamp(view, range.min, range.max);

  let sw = view > aspect ? h * aspect : w;
  let sh = view < aspect ? w / aspect : h;

  const cap = STAGE.short * STAGE.maxScale;
  const over = Math.min(sw, sh) / cap;
  if (over > 1) {
    sw /= over;
    sh /= over;
  }

  return {
    x: (w - sw) / 2,
    y: (h - sh) / 2,
    w: sw,
    h: sh,
    cx: w / 2,
    cy: h / 2,
    right: (w + sw) / 2,
    bottom: (h + sh) / 2,
  };
}

/**
 * Every region the solver returned, moved out of stage space and into the
 * window's.
 *
 * The two solvers below are written against a box at the origin and they stay
 * that way — this is the one place that knows the box is not at the origin any
 * more. `w` and `h` come back as the window rather than as the stage on purpose:
 * everything that is meant to fill the screen reads them, and everything that is
 * part of the composition reads `stage` instead.
 */
function place(solved, stage, w, h) {
  const { x: dx, y: dy } = stage;
  const move = (r) => ({ ...r, x: r.x + dx, y: r.y + dy });

  return {
    ...solved,
    w,
    h,
    stage,
    board: move(solved.board),
    banner: move(solved.banner),
    cards: move(solved.cards),
    hud: move(solved.hud),
    boss: { ...move(solved.boss), floor: solved.boss.floor + dy },
  };
}

/**
 * @param {{top:number,right:number,bottom:number,left:number}} [safe] device
 *   insets — the notch, the home indicator. Measured in main.js; zero is a
 *   perfectly good answer and every browser without cutouts gives it.
 */
export function computeLayout(w, h, safe) {
  const device = safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const portrait = h >= w;
  const stage = stageBox(w, h, portrait);

  /**
   * The cutouts, as much of them as actually reaches into the stage.
   *
   * A notch is measured from the window's edge and the stage does not always
   * start there any more, so on a tablet with a home indicator and a margin
   * under the stage the indicator is already outside the box and the layout owes
   * it nothing. On a phone the stage is the window and these are the insets
   * themselves, which is why every phone lays out exactly as it did before.
   *
   * This is what comes back as `layout.safe`, and it is stage-relative like
   * every other number in here: read it against `layout.stage`, never against
   * the window.
   */
  const inset = {
    top: Math.max(0, device.top - stage.y),
    right: Math.max(0, device.right - (w - stage.right)),
    bottom: Math.max(0, device.bottom - (h - stage.bottom)),
    left: Math.max(0, device.left - stage.x),
  };

  // The same measurement for the close button: it is drawn at the window's
  // corner, so what the stage owes it is whatever is left of it once the margin
  // above the stage has cleared it. On a desktop that is nothing.
  const keepout = Math.max(0, CLOSE_KEEPOUT - stage.y);

  // Off the stage rather than off the window — this is the number the whole
  // creative is scaled by and it has to agree with the box it is scaling inside.
  // On a phone the two are the same thing.
  const ui = clamp(Math.min(stage.w, stage.h) / STAGE.short, 0.72, 2.0);

  const solved = portrait
    ? portraitLayout(stage.w, stage.h, ui, inset, keepout)
    : landscapeLayout(stage.w, stage.h, ui, inset, keepout);

  return place(solved, stage, w, h);
}

/**
 * How far the boss's floor is allowed past the top edge of the board, as a
 * fraction of the board's height.
 *
 * He used to stop dead above it, which on a short phone meant the two of them
 * were competing for the same points and he lost. But there is no edge there to
 * stop at any more: the field under the gems feathers out over its top tenth —
 * see art/boardframe.js — so a golem standing a little into it has his ankles
 * behind a fade rather than cut off by a border. Seven percent buys most of the
 * height a short phone was short of, and reads as depth rather than as overlap.
 */
const BOSS_OVERLAP = 0.07;

/**
 * Floor under the boss's band, as a fraction of the viewport's height.
 *
 * Under about a fifth he stops being a monster and becomes a smudge over the
 * board. This is the term the board now yields to, rather than the other way
 * round — with the overlap above and an honestly measured top chrome, both of
 * them can be had at once on every phone in the matrix.
 */
const BOSS_MIN = 0.215;

function portraitLayout(w, h, ui, safe, keepout) {
  const pad = 10 * ui;
  const gut = gutter(w);

  /* ------------------------------------------------------------ top chrome */

  // Measured rather than budgeted. This was `clamp(h * 0.085, 48, 96)`, a guess
  // at how much room the boss name, the health bar and the doom strip need — and
  // a guess that ran 12 points long on a 640 point screen, which is 12 points
  // the golem could have had. The block is the name, the bar, and the strip
  // under it at the offsets ui/hud.js actually draws them at.
  const barH = clamp(h * 0.018, 12, 26);
  // The name is set at 11 * ui and drawn with an ascender, so it measures about
  // 15 — and this is that plus the air a top edge wants when there is no cutout
  // to stand off from. At 13 it came out with five points over it on a phone
  // with no notch, which is a title touching the bezel.
  const nameH = 16 * ui;
  const hudY = safe.top + pad * 0.9 + nameH;
  const doomH = Math.max(3, barH * 0.32);
  const chromeBottom = hudY + barH + 3 * ui + doomH;

  /* --------------------------------------------------------------- the row */

  // Full width bar the gutter, and it stands on the bottom edge with a tenth of
  // a card under it — plus whatever the device keeps for its home indicator,
  // which is where the row's own health bars were sitting.
  const chromeW = w - safe.left - safe.right - gut * 2;
  const band = cardBand(safe.left + gut, chromeW, 6, h * CARD.tall.portrait);
  const row = { y: h - safe.bottom - band.h * (1 + CARD.foot) };

  /* ------------------------------------------------------- board and boss */

  // The board is the hero of the screen and it is the whole width of it. `size`
  // is the grid itself: with the frame gone the box and the play field are the
  // same square, so every point of the width is gem.
  //
  // What is left between the top chrome and the row, the board and the boss
  // share — and the share is solved rather than split. The boss is owed BOSS_MIN
  // and his floor may sit BOSS_OVERLAP of the board's height inside it, so
  //
  //   bossTop + h * BOSS_MIN  =  boardY + size * BOSS_OVERLAP
  //   boardY                  =  row.y - pad * 0.8 - size
  //
  // and the size that satisfies both is the one below. The board takes the whole
  // width on every phone from a 360 up; on the shortest of them it lands a point
  // or two short, which the field's own bleed covers.
  const bossTop = chromeBottom + pad * 0.6;
  const room =
    (row.y - pad * 0.8 - bossTop - h * BOSS_MIN) / (1 - BOSS_OVERLAP);
  // The width or the share, whichever runs out first — and nothing else. There
  // was a third term, a flat 560, and it is the kind of number that is invisible
  // on the device it was written for and wrong on every other one: past a 560
  // point screen the board stopped growing while the row, the boss and the type
  // all kept going, so the biggest thing on the screen became a hero card and
  // the play field sat in the middle of a margin. Every term here is now a
  // measurement of this screen.
  const size = Math.min(w, room);
  const cell = (size * GRID_RATIO) / 5;
  const boardY = row.y - pad * 0.8 - size;
  const boardX = (w - size) / 2;

  const bossFloor = boardY + size * BOSS_OVERLAP;
  const bossH = bossFloor - bossTop;
  const bossScale = Math.min((w * 0.92) / BOSS_ART.w, bossH / BOSS_ART.h);

  // Under the doom strip at the chrome's right edge, which in portrait is the
  // screen's right edge less the gutter. Nothing is reserved for it: the board
  // in portrait starts a long way below the chrome — it is the boss's band that
  // is up here — and the plate has never had to be fitted in against anything.
  //
  // The one thing it is fitted in against is the container's close button. See
  // CLOSE_KEEPOUT: on a tall phone the chrome clears that corner already and
  // this is the line the lockup was on anyway; on a short one it drops a few
  // points into the sky over the golem, where there is nothing to collide with.
  const plate = bannerBox(ui, true);
  const bannerTop = Math.max(chromeBottom + 3 * ui, keepout);

  return {
    w,
    h,
    ui,
    portrait: true,
    safe,
    board: { x: boardX, y: boardY, size, cell },
    banner: {
      ...plate,
      x: safe.left + gut + chromeW - plate.w / 2,
      y: bannerTop + plate.h / 2,
    },
    boss: {
      x: w / 2,
      y: bossTop + bossH * 0.52,
      scale: bossScale,
      floor: bossFloor,
    },
    cards: { ...band, y: row.y },
    hud: {
      x: safe.left + gut,
      y: hudY,
      w: chromeW,
      h: barH,
    },
  };
}

function landscapeLayout(w, h, ui, safe, keepout) {
  const pad = 9 * ui;
  const gut = gutter(h);

  const barH = clamp(h * 0.032, 10, 22);
  const nameH = 15 * ui;
  const hudY = safe.top + pad * 0.8 + nameH;
  const chromeBottom = hudY + barH + 3 * ui + Math.max(3, barH * 0.32);

  // Board hugs the right edge — thumb reach on a held-sideways phone. Sideways
  // is also where the cutout is: it lands on one of the short edges, so the
  // inset that matters here is the horizontal one and the board is what would
  // have run under it.
  const rightEdge = w - safe.right - pad * 1.4;

  /**
   * The CTA gets a band of its own across the top, and the board starts under
   * it. This is the one region on the screen that is bought rather than found.
   *
   * Sideways there is nothing to find. The boss stands in his column from the
   * chrome down to the hero row and the board fills the rest of the screen, so
   * every corner a banner might hang itself in belongs to something: hung on the
   * screen's right it landed on the top right of the grid, and moved to the
   * column's right it came to rest eighteen points off the board's own edge,
   * pressed into the seam between a bright arena and a near-black field.
   *
   * So it is given a band instead, and the board yields the height for it. What
   * that costs is only ever paid where the height was what bound the board: a
   * board held by `w * 0.5` has slack above it already and comes out the same
   * size it was, which is every landscape wider than about 2:1. On a 16:9 screen
   * it is a little over a tenth of the board — a cell of 145 points against 126,
   * both of them still well past the flat 520 this used to be capped at.
   */
  const plate = bannerBox(ui, false);
  // Held down off the corner the container's close button lands in, the same as
  // upright — and here the board is what pays for it, because the board starts
  // under the band. Six points on a phone, nothing at all on anything with a
  // margin above the stage. See CLOSE_KEEPOUT.
  const bannerY = Math.max(chromeBottom + 3 * ui, keepout) + plate.h / 2;
  const bandBottom = bannerY + plate.h / 2 + pad * 0.6;

  // What the height leaves under the CTA band, or half the width — the half
  // being what keeps a column for the boss and the row to stand in. A flat 520
  // used to sit alongside them and it is gone for the reason the portrait cap
  // is: on anything roomier than a phone it was the term that won, and it won by
  // leaving the bottom quarter of the screen empty under a board that had
  // stopped growing.
  const size = Math.min(
    h - safe.top - safe.bottom - bandBottom - pad * 1.4,
    w * 0.5,
  );
  const cell = (size * GRID_RATIO) / 5;
  const boardX = rightEdge - size;
  const boardY = bandBottom + (h - safe.bottom - bandBottom - size) / 2;

  const leftEdge = safe.left + gut;
  const leftW = boardX - pad - leftEdge;

  // The same card as portrait, in the column the board leaves it. The column is
  // wide against how tall it is, so here the aspect asks for more height than
  // there is and CARD.tall.landscape is what actually sets the card — see
  // cardBand, which narrows it to hold the framing.
  const band = cardBand(leftEdge, leftW, 6, h * CARD.tall.landscape);
  const row = { y: h - safe.bottom - band.h * (1 + CARD.foot) };

  const bossTop = chromeBottom;
  const bossH = row.y - bossTop - pad;
  const bossScale = Math.min((leftW * 0.98) / BOSS_ART.w, bossH / BOSS_ART.h);

  return {
    w,
    h,
    ui,
    portrait: false,
    safe,
    board: { x: boardX, y: boardY, size, cell },
    boss: {
      x: leftEdge + leftW / 2,
      // A twentieth of the band below centre. Centred, the figure sat with its
      // feet a good forty points clear of its own floor — the fit comes off the
      // rig's box and the painted beast does not fill the bottom of it — so the
      // column read as a boss hung in the sky over a gap. Down here his feet are
      // near enough the floor the layout drew for him, and the hero row is drawn
      // after the boss anyway: a slam that carries the feet into the top of a
      // card reads as the row standing in front of him, which is where it is.
      y: bossTop + bossH * 0.55,
      scale: bossScale,
      floor: bossTop + bossH,
    },
    cards: { ...band, y: row.y },
    // Right-aligned on the board's own right edge, which is the screen's. The
    // plate and the grid under it share an edge, so the two read as one column
    // of chrome rather than as a badge that happened to land there.
    banner: {
      ...plate,
      x: rightEdge - plate.w / 2,
      y: bannerY,
    },
    // The bar gets the boss's column and not a point more. It used to be
    // `max(w * 0.4, column)`, a floor under how short the health bar is allowed
    // to get — and a floor that, the moment it was the one that won, ran the bar
    // and the doom clock in under the board. A column narrow enough to trip it
    // is a column with a narrow health bar in it; that is the honest answer, and
    // it is the one thing on this screen that cannot be allowed to overlap the
    // grid, because the banner hangs off its right edge. See ui/hud.js.
    hud: {
      x: leftEdge,
      y: hudY,
      w: leftW,
      h: barH,
    },
  };
}
