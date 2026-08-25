/**
 * Heads-up display: boss health, callouts, damage numbers, the CTA lockup.
 *
 * The health bar deliberately carries no numbers — nobody reads
 * "7,500,000 / 10,000,000" in a twenty second creative (spec §7).
 */

import { Container, Graphics, Sprite, Text, Rectangle, Texture } from "pixi.js";
import { BOSS_NAME, COPY, DOOM, FONT, FONT_TITLE } from "../config.js";
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { lerpColor } from "../core/color.js";
import { hpBarShape, hpBarPaint, HP_FRAME } from "../art/hpbar.js";
import { glowTexture, sheenTexture } from "../art/textures.js";
import { BossCrest, haveBossCrest } from "../art/crest.js";
import {
  PLAY_FILL,
  PLAY_LABEL,
  PLAY_LABEL_STROKE,
  PLAY_RIM,
  fitLogo,
  fitPlayPlate,
  logoSprite,
  playPlateSprite,
} from "../art/brand.js";
import { fitFont } from "./text.js";
import * as sfx from "../audio/sfx.js";

/**
 * Colours of the layers the bar is stacked out of.
 *
 * BAR_EDGE is the frame, and it is the one of these that is still doing its
 * original job: the silhouette behind the bar is painted flat black, so the
 * colour of the outline is this and not the art's.
 *
 * The other four are stand-ins now — art/hpbar.js hands the track, the fill and
 * the chip their own paint, and each of these is only what that layer wears if
 * its file failed to decode. They are kept because the fallback is the whole
 * reason the bar cannot fail to draw.
 *
 * The track used to be 0x2a1020, which over a lava arena at dusk was the arena:
 * the empty half of the gauge did not read at all, so a hit that took a fifth of
 * the boss looked like it took nothing. It has to be dark enough to read as
 * empty and light enough to read as bar — which is what the painted #6a1d1d
 * track does now, and this is that reasoning in a flat colour.
 */
const BAR_EDGE = 0x0a0510;
const BAR_TRACK = 0x5c3346;
const BAR_CHIP = 0xffe9c9;
const BAR_HOT = 0xff6a10;
const BAR_LOW = 0xff3b1f;

/**
 * Tints the painted fill wears. It arrives red, so the danger state can only
 * deepen it — a tint multiplies, and no tint turns red into orange. The length
 * of the bar is the real signal; this is the second one.
 */
const PAINT_FULL = 0xffffff;
const PAINT_LOW = 0xff8a72;

/**
 * How the white behind the red is timed, as fractions of the hit's own duration.
 *
 * The white is the health just lost, and the reasoning used to be that it can
 * only say so while it is open — so it held past the red landing (0.75 of the
 * hit) and then took its time (0.7). Measured, that is 0.30s of a 0.4s hit in
 * which the bar does not get shorter. The red is draining underneath the whole
 * time and none of it can be seen, because the white above it is still standing
 * at the old length and the white is what the eye reads as the end of the bar.
 *
 * The result was a bar that took a hit, sat still through it, and then slid left
 * once the hit was over — two movements where the fight had one event, and the
 * second one arriving late enough to look like a bug rather than a flourish.
 *
 * So the white now leaves almost at once (0.10) and travels slower than the red
 * (0.85 against the red's 0.55). Same two layers, same reading — the white is
 * still a strip trailing the red, and how much was lost is still how long that
 * strip is — but the bar starts getting shorter on the frame it is hit.
 *
 * Both are relative to `dur` rather than absolute, which keeps the total where
 * it was: the director awaits setHp, and a slower drain here would push every
 * beat of the storyboard back.
 */
const CHIP_HOLD = 0.1;
const CHIP_DRAIN = 0.85;

/**
 * The highlight that travels along the bar, and how often.
 *
 * The bar had no life of its own. Everything it did, it did because it had just
 * been hit: it drained, the white behind it drained after it, and between hits
 * it was a red rectangle. Which is most of a twenty second creative — the boss
 * is hit perhaps six times, and the rest of the time the one piece of chrome
 * saying "this is a fight in progress" was holding perfectly still.
 *
 * So it sweeps. `sweep` is how long the highlight takes to cross, `period` how
 * long until the next one, and the gap between them is deliberately most of the
 * cycle: a gauge with a shine running back and forth without pause is a loading
 * spinner, and this is meant to read as a surface catching the light.
 *
 * `band` is the highlight's width against the bar's height. It is kept inside
 * the fill rather than masked to it — it starts at the left edge and stops a
 * band short of the leading one, and `sin(p*pi)` has it at nothing at both ends
 * anyway, so it never has to be clipped and the HUD stays free of a mask.
 */
const SHEEN = { sweep: 0.85, period: 3.1, band: 3.2, peak: 0.62, phase: 0 };

/**
 * How far the crest stands past the chrome it is pinned to.
 *
 * A badge flush with the block would read as another bar layer. Half again is
 * enough for it to read as a crest hung over the arena. What it is half again
 * *of* is the chrome block; where it hangs from is the top edge — see `resize`,
 * which is where those two came apart and why.
 */
const CREST_RISE = 1.65;

/** The same, for the doom strip: slower, dimmer, and out of step with above. */
const DOOM_SHEEN = {
  sweep: 1.15,
  period: 3.1,
  band: 5,
  peak: 0.42,
  phase: 1.5,
};

/**
 * How hard the bar throbs once the boss is nearly down, and how fast.
 *
 * The colour already deepens under 30% — see PAINT_LOW — but a colour is a state
 * and this is meant to be a countdown. The throb rides on top of it, between the
 * deepened red and the full one, so the bar is visibly ticking over rather than
 * simply darker than it was.
 */
const LOW_AT = 0.3;
const THROB = { rate: 7.4, depth: 0.55 };

/**
 * The white flash over the bar when a hit lands: how bright, and how briefly.
 *
 * 0.42 over 0.13s. It was 0.34 over `max(0.2, dur * 0.6)`, which on a 0.4s hit
 * is 0.24s — longer than the red takes to drain (0.22s). So the flash covered
 * the drain end to end: the one part of this the player was meant to watch
 * happened underneath a white rectangle, and the bar appeared to jump to its new
 * length the moment the flash cleared.
 *
 * A flash is an impact, not a state. Fixed rather than scaled off `dur` for the
 * same reason — the impact is instant whatever the drain is worth — and brighter
 * to make up for being a third as long.
 */
const HIT_FLASH = { alpha: 0.42, dur: 0.13 };

/** 2150000 -> "2,150,000" without leaning on locale support. */
export function comma(n) {
  const s = String(Math.max(0, Math.round(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
}

export class Hud extends Container {
  constructor(onInstall) {
    super();
    this.onInstall = onInstall;

    /**
     * The bar, in layers: the frame, the empty track, the health just lost, the
     * health still standing, and the flash over the lot of them. Every one of
     * them is the same chevron stamp — the frame and the flash under a tint, the
     * other three poured full of their own paint. See art/hpbar.js. `bar` is the
     * fallback underneath: without the art it draws the rounded bar the HUD
     * always drew.
     *
     * The two draining layers are cropped by texture frame rather than scaled,
     * so the mitre on the left cap holds its angle while the leading edge stays
     * a clean vertical cut.
     */
    this.bar = new Graphics();
    this.addChild(this.bar);

    this.barEdge = this.addBarLayer(BAR_EDGE, 0.85);
    this.barTrack = this.addBarLayer(BAR_TRACK, 1);
    this.barChip = this.addBarLayer(BAR_CHIP, 0.55);
    this.barFill = this.addBarLayer(BAR_HOT, 1);
    /**
     * White over the whole silhouette, added rather than drawn, spiked to
     * HIT_FLASH the moment health drops and faded from there. Cropped to the
     * chip's level, not the fill's, so the flash covers the health that was
     * there when the hit landed instead of only what survived it.
     */
    this.barFlash = this.addBarLayer(PAINT_FULL, 0);
    this.barFlash.blendMode = "add";
    this.barShape = null;

    /**
     * The travelling highlight, and the bloom at the fill's leading edge.
     *
     * Both added rather than blended, and neither masked: the sheen is held
     * inside the fill by SHEEN — see animateBar — and the bloom is a round glow
     * sitting on the cut, which is meant to spill past the bar. They are added
     * after the bar's own layers so they land on top of all four.
     */
    this.barSheen = new Sprite(sheenTexture());
    this.barSheen.blendMode = "add";
    this.barSheen.visible = false;
    this.addChild(this.barSheen);

    this.barTip = new Sprite(glowTexture());
    this.barTip.anchor.set(0.5);
    this.barTip.blendMode = "add";
    this.barTip.visible = false;
    this.addChild(this.barTip);

    /**
     * What is left of the boss, printed across the middle of his own bar.
     *
     * The bar has always said this and only ever in one way: a length, read
     * against a length the player has to remember. That is enough to feel the
     * fight going well and not enough to know it — a bar that has crept from a
     * fifth to a sixth over four matches looks like a bar that has not moved.
     * The number moves every hit.
     *
     * Centred on the bar rather than set at one end, and that is the whole point
     * of the placement: the fill's leading edge is the one thing on this strip
     * that travels, and a reading parked at either end is either always on the
     * red or always on the black. In the middle it is passed by the edge exactly
     * once a fight, and it is drawn to be read against both — see the stroke in
     * `resize`, which is the same trick the hero gauges use.
     *
     * Added here, after the four bar layers and after the sheen and the tip
     * bloom, so nothing the bar does at run time is drawn over it.
     */
    this.hpLabel = new Text({
      text: "100%",
      style: {
        fontFamily: FONT,
        fontWeight: "900",
        fontSize: 14,
        fill: 0xffffff,
      },
    });
    this.hpLabel.anchor.set(0.5);
    this.addChild(this.hpLabel);

    /** Last whole percent printed, so the texture is rebaked only when it moves. */
    this.hpPrinted = -1;

    this.name = new Text({
      text: BOSS_NAME,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 16,
        fontWeight: "800",
        fill: 0xffd9a8,
        letterSpacing: 2.4,
      },
    });
    this.name.anchor.set(0, 1);
    this.addChild(this.name);

    /* The doom clock: how long the party has before the cataclysm lands. */
    this.doomBar = new Graphics();
    this.addChild(this.doomBar);

    /** The strip's own highlight, on the same terms as the bar's. */
    this.doomSheen = new Sprite(sheenTexture());
    this.doomSheen.blendMode = "add";
    this.doomSheen.visible = false;
    this.addChild(this.doomSheen);

    this.doomLabel = new Text({
      text: COPY.doomLabel + " --",
      style: {
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: "900",
        fill: 0xffb060,
        letterSpacing: 1.6,
      },
    });
    // Right-aligned on the boss name's baseline: the only piece of empty chrome
    // up here, and it keeps the clock out of the INSTALL banner's corner.
    this.doomLabel.anchor.set(1, 1);
    this.doomLabel.alpha = 0;
    this.addChild(this.doomLabel);

    this.doomLeft = 0;
    this.doomTotal = DOOM.seconds;
    this.doomOn = false;

    /**
     * The boss's own face, at the head of his bar.
     *
     * Null when the art did not decode, and every use of it below is guarded on
     * that — a crest that failed to arrive gives its width back to the bar and
     * the chrome is what it was before there was one.
     *
     * Added after the bar and the doom strip so it closes over both: the badge
     * is taller than the block it stands at the head of, on purpose, and the
     * strip runs under its lower corner rather than beside it.
     */
    this.crest = haveBossCrest() ? new BossCrest() : null;
    if (this.crest) this.addChild(this.crest);

    /* Persistent CTA — the second of the three install surfaces. */
    this.banner = new Container();
    this.banner.alpha = 0;
    this.banner.visible = false;
    /**
     * The end card's own lockup at HUD size: the wordmark over the PLAY NOW
     * plate — see art/brand.js. Neither may be stretched, so each takes a width
     * and stands at its own aspect; the layout has already reserved the height
     * that implies. See `banner` in core/layout.js.
     *
     * Both are guarded, and separately. The brand art is decoded piece by piece
     * and a device that could not read one of these still gets the other, so a
     * missing wordmark leaves the plate exactly where it was rather than taking
     * the CTA down with it.
     */
    this.bannerBg = new Graphics();
    this.banner.addChild(this.bannerBg);
    this.bannerLogo = logoSprite();
    if (this.bannerLogo) this.banner.addChild(this.bannerLogo);
    this.bannerArt = playPlateSprite();
    if (this.bannerArt) this.banner.addChild(this.bannerArt);

    this.bannerText = new Text({
      text: COPY.cta,
      style: {
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: "900",
        fill: PLAY_LABEL,
        letterSpacing: 1.2,
        stroke: { color: PLAY_LABEL_STROKE, width: 3, join: "round" },
      },
    });
    this.bannerText.anchor.set(0.5);
    // The plate has PLAY NOW painted into it. The label is the stand-in's label.
    this.bannerText.visible = !this.bannerArt;
    this.banner.addChild(this.bannerText);
    this.banner.eventMode = "static";
    this.banner.cursor = "pointer";
    this.banner.on("pointertap", () => this.onInstall("banner"));
    this.addChild(this.banner);

    /* Big centre-screen callouts: MATCH TO ATTACK, COMBO x3, VICTORY. */
    this.callout = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 34,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 2,
        stroke: { color: 0x180a1e, width: 6, join: "round" },
        align: "center",
      },
    });
    this.callout.anchor.set(0.5);
    this.callout.alpha = 0;
    this.addChild(this.callout);

    this.numbers = new Container();
    this.addChild(this.numbers);

    this.hp = 1;
    this.hpShown = 1;
    this.hpChip = 1;
    // Persistent tween holders: a second setHp() must cancel the first one
    // rather than have two tweens writing the same bar every frame.
    this.barDriver = { v: 1 };
    this.chipDriver = { v: 1 };
    this.shoutToken = 0;
    this.t = 0;
    this.layout = null;
  }

  /**
   * The boss turned over. Hand it to the crest, which is the only piece of
   * chrome up here carrying his face and so the only one that can show it.
   *
   * Called beside every `boss.enrage()` rather than off a health threshold: the
   * boss enrages when an armour layer breaks and when the doom lands, neither of
   * which is a number this bar knows.
   */
  enrage() {
    if (this.crest) this.crest.enrage();
  }

  /** One tinted layer of the bar, top-left anchored so a crop grows rightwards. */
  addBarLayer(tint, alpha) {
    const s = new Sprite(Texture.EMPTY);
    s.anchor.set(0, 0);
    s.tint = tint;
    s.alpha = alpha;
    s.visible = false;
    this.addChild(s);
    return s;
  }

  resize(layout) {
    this.layout = layout;
    const { x, y, w, h } = layout.hud;
    const ui = layout.ui;

    /**
     * The crest, and what it costs the bar.
     *
     * Its height is the whole top chrome — the name's cap to the foot of the
     * doom strip — times CREST_RISE, and the overhang is deliberately not split
     * evenly: a badge hangs, so all of the extra goes below, into the empty sky
     * over the golem, where there is nothing to collide with.
     *
     * Measured off the chrome, placed off the top edge, and those used to be the
     * same line. Pinned at the name's cap, the badge left a strip of empty sky
     * above itself — the cap line sits a name's ascender below the top of the
     * screen — and spent all sixty-five percent of CREST_RISE below the doom
     * strip: forty points of badge hanging under a sixty point block. Hung off
     * the edge instead, the same badge sits twelve points higher and hangs
     * twelve fewer, which is the whole of the difference. It is still not
     * centred on the chrome, because a badge centred on it would run under the
     * safe-area inset on a phone.
     *
     * The gap to the bar is two ui rather than five for the same reason: at five
     * the badge read as a separate thing that happened to be up there, and the
     * point of it is that it is the boss's face on the boss's bar.
     *
     * The name and the bar both start after it. Everything downstream of this
     * — the sheen, the tip, the percent, the doom strip, the banner — is placed
     * off `barRect`, so insetting it here is the only place the badge is paid
     * for.
     */
    let inset = 0;
    if (this.crest) {
      const top = y - 3 * ui - 11 * ui;
      const foot = y + h + 3 * ui + Math.max(3, h * 0.32);
      const crestH = (foot - top) * CREST_RISE;
      const crestW = this.crest.resize(crestH);
      this.crest.x = x + crestW / 2;
      this.crest.y = layout.safe.top + 2 * ui + crestH / 2;
      inset = crestW + 2 * ui;
    }

    // Set up front rather than just before the bake: the banner is placed off
    // the doom strip, and doomRect() is measured from this.
    this.barRect = { x: x + inset, y, w: w - inset, h };

    this.name.style.fontSize = Math.max(9, 11 * ui);
    this.name.x = x + inset;
    this.name.y = y - 3 * ui;

    // The bar hands the type its size, the way a hero card's gauge does — see
    // READOUT_TYPE in art/heroes.js, where the rule is written out. 0.72 rather
    // than that card's 0.776 because this strip carries a mitre at each end and
    // a lit rim along both long edges, so there is less flat bore in it than
    // its depth suggests.
    //
    // The outline is what lets one reading sit on two grounds. It is over the
    // red where the boss still has health and over the near-black track where
    // he does not, and the fill's edge crosses under it during the fight: white
    // alone vanishes into the flash, and any dark fill vanishes into the track.
    const hpSize = Math.max(9, h * 0.72);
    this.hpLabel.style.fontSize = hpSize;
    this.hpLabel.style.letterSpacing = hpSize * 0.02;
    this.hpLabel.style.stroke = {
      color: 0x2a0a08,
      width: Math.max(1.6, hpSize * 0.19),
      join: "round",
    };
    this.hpLabel.x = this.barRect.x + this.barRect.w / 2;
    this.hpLabel.y = y + h / 2;
    // Forced: the size just changed, and `printHp` is a no-op while the percent
    // has not.
    this.hpPrinted = -1;
    this.printHp();

    this.callout.style.stroke = {
      color: 0x180a1e,
      width: Math.max(3, 5 * ui),
      join: "round",
    };

    if (layout.portrait) {
      /**
       * On the seam where the boss's feet meet the top of the play field.
       *
       * It used to sit a cell and a bit above the board, on the reasoning that
       * there is a gap up there to put it in. On a tall phone there is. On a 640
       * point one there is not, and "LAVA BREATH!" landed across the golem's
       * face — the one thing on the screen the shout is about.
       *
       * The seam is the safe line at every height, because it is the only line
       * on this screen that is dark at both ends: the field is a near-black scrim
       * below it and the scrim's own feather is fading out above it. So the words
       * read whatever the arena is doing behind them, and they are never on top
       * of anybody's face.
       */
      this.calloutWidth = layout.w - layout.safe.left - layout.safe.right - 24;
      this.calloutSize = Math.max(17, Math.min(layout.w * 0.078, 38 * ui));
      this.callout.x = layout.w / 2;
      this.callout.y = layout.board.y;
    } else {
      // Landscape has no gap, so the callout lives over the boss column —
      // centring it on screen would put it straight through the health bar.
      this.calloutWidth = layout.board.x * 0.92;
      this.calloutSize = Math.max(16, Math.min(layout.board.x * 0.17, 34 * ui));
      this.callout.x = layout.boss.x;
      this.callout.y = layout.boss.floor - layout.h * 0.13;
    }
    this.callout.style.fontSize = this.calloutSize;

    /**
     * The lockup is handed a box by the layout and fills it — see `banner` in
     * core/layout.js, which is where the width and the corner are decided now
     * and why. This used to size itself and then hang itself off whichever
     * corner looked free from in here, which is how a gold plate came to be
     * drawn over the top right of the board: from inside the HUD the screen's
     * right edge looks like empty chrome, and sideways it is the play field.
     *
     * The `h` in the box already carries the breath `update` gives the lockup,
     * which is the layout's business and not this one's — so what gets arranged
     * here is measured off the pieces, at rest.
     */
    const { w: bw, stacked, plateW, plateH, logoW, logoH, gap } = layout.banner;
    const contentH = stacked ? logoH + gap + plateH : Math.max(logoH, plateH);
    const top = -contentH / 2;
    const left = -bw / 2;
    const logoX = stacked ? 0 : left + logoW / 2;
    const logoY = stacked ? top + logoH / 2 : 0;
    const plateX = stacked ? 0 : left + logoW + gap + plateW / 2;
    const plateY = stacked ? top + logoH + gap + plateH / 2 : 0;

    if (this.bannerLogo) {
      fitLogo(this.bannerLogo, logoW);
      this.bannerLogo.position.set(logoX, logoY);
    }

    // Set before fitting, not after: the rim is part of what the word measures.
    this.bannerText.style.stroke = {
      color: PLAY_LABEL_STROKE,
      width: Math.max(2, plateH * 0.09),
      join: "round",
    };
    fitFont(this.bannerText, plateW * 0.7, Math.max(12, plateH * 0.42));
    this.bannerText.position.set(plateX, plateY);

    this.bannerBg.clear();
    if (this.bannerArt) {
      fitPlayPlate(this.bannerArt, plateW);
      this.bannerArt.position.set(plateX, plateY);
    } else {
      // Stand-in for a bitmap that never decoded, in the plate's own colours
      // and cut to the box the plate would have filled — a device that fell
      // back to it gets the same layout, not a second one. The CTA is the last
      // thing in this creative allowed to go missing.
      this.bannerBg.roundRect(
        plateX - plateW / 2,
        plateY - plateH / 2,
        plateW,
        plateH,
        plateH * 0.22,
      );
      this.bannerBg.fill({ color: PLAY_FILL });
      this.bannerBg.stroke({
        width: Math.max(2, plateH * 0.08),
        color: PLAY_RIM,
      });
    }
    // A few pixels of slack around the lockup: it is a small target that slides
    // into place, and a near miss on a CTA is a lost install. The wordmark is
    // inside the target too — it is part of the button rather than decoration
    // beside one, and a thumb that lands on the logo meant the plate.
    const slack = 7 * ui;
    this.banner.hitArea = new Rectangle(
      left - slack,
      top - slack,
      bw + slack * 2,
      contentH + slack * 2,
    );
    this.banner.x = layout.banner.x;
    this.banner.y = layout.banner.y;

    this.doomLabel.style.fontSize = Math.max(9, 11 * ui);
    this.doomLabel.x = x + w;
    this.doomLabel.y = y - 3 * ui;

    this.bakeBar();
    this.drawBar();
    this.drawDoom();
  }

  /**
   * Rebake the chevron at the size the layout just handed us.
   *
   * Every layer is the same canvas, but the chip and the fill get a Texture each
   * over it: they crop themselves every frame and a frame belongs to a Texture,
   * not to the source it reads from.
   */
  bakeBar() {
    const { x, y, w, h } = this.barRect;
    this.disposeBar();

    // The edge is the same silhouette proud of the bar on every side, which is
    // how the shape gets an outline that follows its mitre. HP_FRAME rather than
    // a number picked here: the art ships a frame and a track, and how far one
    // stands outside the other is the art's decision, not the HUD's.
    const grow = Math.max(2, h * HP_FRAME);
    const edge = hpBarShape(w + grow * 2, h + grow * 2);
    const shape = hpBarShape(w, h);
    const track = hpBarPaint(w, h, "track");
    const fill = hpBarPaint(w, h, "fill");
    const chip = hpBarPaint(w, h, "chip");
    this.barShape = shape && edge && track && fill && chip ? shape : null;

    const layers = [
      this.barEdge,
      this.barTrack,
      this.barChip,
      this.barFill,
      this.barFlash,
    ];
    if (!this.barShape) {
      layers.forEach((s) => {
        s.visible = false;
      });
      this.barSheen.visible = false;
      this.barTip.visible = false;
      return;
    }
    this.barBakes = [
      edge.texture,
      shape.texture,
      track.texture,
      fill.texture,
      chip.texture,
    ];
    this.barPainted = fill.painted;
    // The painted layers bring their own colour, so each needs neither the tint
    // that stood in for it nor the alpha that kept that tint from shouting.
    this.barTrack.tint = track.painted ? PAINT_FULL : BAR_TRACK;
    this.barChip.tint = chip.painted ? PAINT_FULL : BAR_CHIP;
    this.barChip.alpha = chip.painted ? 1 : 0.55;
    layers.forEach((s) => {
      s.visible = true;
    });

    this.barEdge.texture = edge.texture;
    this.barEdge.setSize(w + grow * 2, h + grow * 2);
    this.barEdge.x = x - grow;
    this.barEdge.y = y - grow;

    // The track is the only layer that never crops: the empty gauge is the whole
    // shape whatever the health is, and the fill is what shortens over it.
    this.barTrack.texture = track.texture;
    this.barTrack.setSize(w, h);
    this.barTrack.x = x;
    this.barTrack.y = y;

    // Every layer that crops itself needs a Texture of its own over its own
    // bake: a frame belongs to a Texture, not to the source behind it. The flash
    // crops too, and takes the plain white stamp — it is a flash, not a paint.
    //
    // `dynamic` is what makes a crop show up on screen at all. A Sprite only
    // subscribes to its texture's "update" when the texture declares itself
    // dynamic, and without that subscription the quad it batched the moment the
    // texture was assigned is the quad it goes on drawing for the rest of the
    // fight — full width, full uvs, however far `cropBar` cuts the frame back.
    // That is exactly what the boss bar did: it sat at full health all game.
    [
      [this.barChip, chip],
      [this.barFill, fill],
      [this.barFlash, shape],
    ].forEach(([s, art]) => {
      s.texture = new Texture({
        source: art.texture.source,
        frame: new Rectangle(0, 0, art.pw, art.ph),
        dynamic: true,
      });
      s.x = x;
      s.y = y;
    });
  }

  /** Drop the previous bake. Rotation can call bakeBar() any number of times. */
  disposeBar() {
    // The cropping textures first: they read a source the bakes own.
    [this.barChip, this.barFill, this.barFlash].forEach((s) => {
      if (s.texture && s.texture !== Texture.EMPTY) s.texture.destroy(false);
      s.texture = Texture.EMPTY;
    });
    this.barEdge.texture = Texture.EMPTY;
    this.barTrack.texture = Texture.EMPTY;
    (this.barBakes || []).forEach((t) => t.destroy(true));
    this.barBakes = [];
  }

  /**
   * Show `frac` of a draining layer: crop the frame, then match the size.
   *
   * `update()` rather than `updateUvs()`. Both recompute the uvs; only one emits
   * the event the sprite is listening for, and the uvs on their own were a
   * number nothing ever read back — see `bakeBar`, where the layer is made
   * dynamic so there is a listener to emit to.
   *
   * The size goes last, and has to. `setSize` divides by `texture.orig.width`,
   * and a Texture built without an `orig` of its own aliases the very frame that
   * was just cut — so the scale comes out as w/pw at every fraction and the crop
   * is carried by the quad alone, which is what it should be. Sizing first would
   * divide by the *previous* frame and leave the bar reading a fraction behind.
   */
  cropBar(sprite, frac) {
    const { w, h } = this.barRect;
    const f = Math.max(0, Math.min(1, frac));
    sprite.visible = f > 0.001;
    if (!sprite.visible) return;

    const tex = sprite.texture;
    tex.frame.width = Math.max(1, Math.round(this.barShape.pw * f));
    tex.frame.height = this.barShape.ph;
    tex.update();
    sprite.setSize(w * f, h);
  }

  /**
   * Thin strip under the health bar that drains as the cataclysm charges.
   *
   * Deliberately the same width and corner as the boss bar: the two of them
   * together read as one gauge with two directions — his health going down,
   * his patience running out.
   */
  /**
   * Where the doom strip sits, drawn or not.
   *
   * Two callers: the draw below, and the banner, which shares this corner of
   * the screen and has to clear the strip whether the clock is running yet or
   * not. One formula, so the two cannot drift apart.
   */
  doomRect() {
    const { x, y, w, h } = this.barRect;
    const ui = this.layout ? this.layout.ui : 1;
    return { x, y: y + h + 3 * ui, w, h: Math.max(3, h * 0.32) };
  }

  drawDoom() {
    if (!this.barRect) return;
    const g = this.doomBar;
    const { x, y, w, h } = this.doomRect();
    const r = h / 2;

    g.clear();
    if (!this.doomOn) return;

    g.roundRect(x, y, w, h, r);
    g.fill({ color: 0x1c0a12, alpha: 0.9 });

    const left = Math.max(0, Math.min(1, this.doomLeft / this.doomTotal));
    if (left > 0.001) {
      g.roundRect(x, y, w * left, h, r);
      g.fill({ color: this.doomPanic() ? 0xff2f1a : 0xffa030 });
    }
  }

  doomPanic() {
    return this.doomOn && this.doomLeft <= DOOM.panicAt;
  }

  /**
   * Drive the clock. Called every frame by the director, which owns the count —
   * the HUD only ever renders what it is told, so a paused fight cannot leave
   * the numbers ticking on their own.
   */
  setDoom(left, total) {
    const wasOn = this.doomOn;
    this.doomOn = true;
    this.doomLeft = Math.max(0, left);
    this.doomTotal = total || DOOM.seconds;

    const text = COPY.doomLabel + " " + Math.ceil(this.doomLeft);
    if (this.doomLabel.text !== text) {
      this.doomLabel.text = text;
      this.doomLabel.style.fill = this.doomPanic() ? 0xff5a3a : 0xffb060;
    }
    if (this.doomLabel.alpha < 1) tween(this.doomLabel, { alpha: 1 }, 0.3);

    // Called every frame, so the bar is only rebuilt when a pixel of it would
    // actually move. A Graphics redraw per frame is the one thing the phones
    // this creative targets cannot afford.
    const step = Math.round((this.doomLeft / this.doomTotal) * 200);
    if (!wasOn || step !== this.doomStep) {
      this.doomStep = step;
      this.drawDoom();
    }
  }

  hideDoom() {
    this.doomOn = false;
    this.doomLabel.alpha = 0;
    this.doomLabel.scale.set(1);
    this.drawDoom();
  }

  drawBar() {
    if (!this.barRect) return;
    const { x, y, w, h } = this.barRect;
    const g = this.bar;
    const r = h / 2;

    if (this.barShape) {
      g.clear();
      this.cropBar(this.barChip, this.hpChip);
      this.cropBar(this.barFill, this.hpShown);
      // The flash covers what was there when the hit landed, which the chip is
      // still holding. Its alpha is a tween's business, not this function's.
      this.cropBar(this.barFlash, Math.max(this.hpChip, this.hpShown));
      const low = this.hpShown < 0.3;
      this.barFill.tint = this.barPainted
        ? low
          ? PAINT_LOW
          : PAINT_FULL
        : low
          ? BAR_LOW
          : BAR_HOT;
      return;
    }

    g.clear();
    g.roundRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.fill({ color: BAR_EDGE, alpha: 0.85 });

    g.roundRect(x, y, w, h, r);
    g.fill({ color: BAR_TRACK });

    // Chip bar: the white ghost that drains a beat after the real one.
    if (this.hpChip > 0.001) {
      g.roundRect(x, y, w * this.hpChip, h, r);
      g.fill({ color: BAR_CHIP, alpha: 0.55 });
    }

    if (this.hpShown > 0.001) {
      g.roundRect(x, y, w * this.hpShown, h, r);
      g.fill({ color: this.hpShown < 0.3 ? BAR_LOW : BAR_HOT });
      g.roundRect(x, y, w * this.hpShown, h * 0.42, r);
      g.fill({ color: 0xffb257, alpha: 0.55 });
    }

    g.roundRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.stroke({ width: Math.max(1.5, h * 0.14), color: 0x6b3a2a, alpha: 0.9 });
  }

  /** Drive the bar to a scripted health value. */
  async setHp(value, dur) {
    const d = dur === undefined ? 0.45 : dur;
    const hit = value < this.hpShown - 0.001;
    this.hp = value;

    // A hit reads on the bar itself, not only in how far it drains. Guarded on
    // the direction: the healer's ultimate drives this upwards, and a white
    // flash over a bar going the other way says the boss just took a hit.
    if (hit && this.barShape) {
      killTweensOf(this.barFlash);
      this.barFlash.alpha = HIT_FLASH.alpha;
      tween(this.barFlash, { alpha: 0 }, HIT_FLASH.dur, { ease: Ease.quadOut });
    }
    // The crest takes it too, scaled by how big a bite this was: the bar says
    // how much is left and the badge says that something just landed, which is
    // the half of a hit a draining rectangle is worst at.
    if (hit && this.crest) this.crest.hit(0.6 + (this.hpShown - value) * 4);

    killTweensOf(this.barDriver);
    killTweensOf(this.chipDriver);
    this.barDriver.v = this.hpShown;
    this.chipDriver.v = this.hpChip;

    tween(this.barDriver, { v: value }, d * 0.55, {
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpShown = this.barDriver.v;
        this.drawBar();
      },
    });
    await tween(this.chipDriver, { v: value }, d * CHIP_DRAIN, {
      delay: d * CHIP_HOLD,
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpChip = this.chipDriver.v;
        this.drawBar();
      },
    });
  }

  /**
   * Centre-screen shout. Resolves once it has faded out again.
   *
   * Token-guarded: the boss counterattack lands close behind the lava callout,
   * and without this the older shout's fade-out would erase the newer one.
   */
  async shout(text, hold, opts) {
    const o = opts || {};
    const token = ++this.shoutToken;
    killTweensOf(this.callout);
    killTweensOf(this.callout.scale);
    this.callout.text = text;
    this.callout.style.fill = o.fill || 0xffffff;
    this.callout.alpha = 0;
    fitFont(this.callout, this.calloutWidth || 320, this.calloutSize || 28);
    // Modest overshoot: a long headline popping in at 1.6x spills off a 375pt
    // screen for a couple of frames.
    this.callout.scale.set(o.from || 1.25);
    await Promise.all([
      tween(this.callout, { alpha: 1 }, 0.14),
      tween(this.callout.scale, { x: 1, y: 1 }, 0.28, { ease: Ease.backOut }),
    ]);
    if (token !== this.shoutToken) return;
    await delay(hold === undefined ? 0.6 : hold);
    if (token !== this.shoutToken) return;
    await Promise.all([
      tween(this.callout, { alpha: 0 }, 0.22),
      tween(this.callout.scale, { x: 1.18, y: 1.18 }, 0.22),
    ]);
  }

  hideShout() {
    this.shoutToken++;
    killTweensOf(this.callout);
    tween(this.callout, { alpha: 0 }, 0.15);
  }

  /**
   * Damage number flying off whatever just got hit.
   * @param {object} [opts] `sign` and `fill` — hero damage comes through here
   *   as a red "-N" so the two directions of damage never read the same.
   */
  damage(value, x, y, tier, opts) {
    const o = opts || {};
    const size = Math.max(
      13,
      (tier === 2 ? 30 : tier === 1 ? 24 : 19) *
        (this.layout ? this.layout.ui : 1),
    );
    const label = new Text({
      text: (o.sign || "+") + comma(value),
      style: {
        fontFamily: FONT,
        fontSize: size,
        fontWeight: "900",
        fill: o.fill || (tier === 2 ? 0xffe066 : 0xffffff),
        letterSpacing: 0.5,
        stroke: {
          color: 0x2b0a12,
          width: Math.max(3, size * 0.18),
          join: "round",
        },
      },
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    // Numbers over the outer hero cards start half off screen otherwise.
    if (this.layout) {
      const half = label.width / 2 + 4;
      label.x = Math.min(Math.max(x, half), this.layout.w - half);
    }
    label.scale.set(0.4);
    this.numbers.addChild(label);

    tween(label.scale, { x: 1, y: 1 }, 0.22, { ease: Ease.backOut });
    tween(label, { alpha: 0 }, 0.3, { delay: 0.5 });
    // Destroy on the longest tween, never before one that is still writing.
    tween(label, { y: y - 70 - Math.random() * 30 }, 0.85, {
      ease: Ease.quadOut,
    }).then(() => label.destroy());
  }

  showBanner() {
    if (this.banner.visible) return;
    this.banner.visible = true;
    sfx.banner();
    const home = this.banner.y;
    this.banner.y = home - 30;
    tween(this.banner, { alpha: 1 }, 0.3);
    tween(this.banner, { y: home }, 0.45, { ease: Ease.backOut });
  }

  /**
   * Where a sweeping highlight is, given how long the cycle has been running.
   *
   * Returns null while the cycle is in its gap, and otherwise the left edge and
   * the alpha for a band of `band` points crossing `span` points of bar. The
   * band is held wholly inside the span — from the left edge to a band short of
   * the leading one — so nothing has to clip it, and `sin(p*pi)` puts it at zero
   * alpha at both ends, which is what keeps it off the mitre on the left cap and
   * off the cut on the right.
   *
   * Null too when the span is barely wider than the band: a highlight with
   * nowhere to travel is a flashing rectangle.
   */
  sweep(cfg, span, band) {
    if (span < band * 1.5) return null;
    const p = ((this.t + cfg.phase) % cfg.period) / cfg.sweep;
    if (p > 1) return null;
    return {
      x: p * (span - band),
      alpha: Math.pow(Math.sin(p * Math.PI), 0.7) * cfg.peak,
    };
  }

  /**
   * The bar's own life, every frame: the highlight, the bloom on the leading
   * edge, and the throb once the boss is nearly down.
   *
   * Positions and alphas only — no Graphics is redrawn here and no texture is
   * rebaked. That is the whole reason this can run at 60fps on the phones this
   * creative targets, and it is why the sheen is a sprite being moved rather
   * than a gradient being painted into the bar.
   */
  /**
   * Put the health the bar is currently showing on the bar, as a whole percent.
   *
   * Off `hpShown` rather than `hp`, so the number drains with the fill instead
   * of snapping to the new total the frame the hit lands. They are the same
   * value a third of a second later; for that third of a second the bar and its
   * reading have to agree, or the number is announcing damage the bar has not
   * shown yet.
   *
   * Rounded down, and never to zero while anything is left. A boss on 0.4% is a
   * boss who is still standing, and a bar that reads 0% with paint still in it
   * is the reading the player will call a bug — the one time this number is
   * being watched closely is the last three seconds of the fight. 0 is reserved
   * for a boss with nothing left, which is the only state that earns it.
   *
   * Guarded on the printed value, because setting `text` rebakes the texture
   * and this runs every frame: a percent changes about a hundred times a fight,
   * not sixty times a second.
   */
  printHp() {
    const v = this.hpShown;
    const pct = v <= 0 ? 0 : Math.max(1, Math.floor(v * 100));
    if (pct === this.hpPrinted) return;
    this.hpPrinted = pct;
    this.hpLabel.text = `${pct}%`;
  }

  animateBar() {
    if (!this.barRect || !this.barShape) return;
    const { x, y, w, h } = this.barRect;
    const span = w * this.hpShown;
    const low = this.hpShown < LOW_AT;

    if (span <= h * 0.5) {
      this.barSheen.visible = false;
      this.barTip.visible = false;
      return;
    }

    const band = h * SHEEN.band;
    const s = this.sweep(SHEEN, span, band);
    this.barSheen.visible = !!s;
    if (s) {
      this.barSheen.setSize(band, h);
      this.barSheen.x = x + s.x;
      this.barSheen.y = y;
      this.barSheen.alpha = s.alpha;
    }

    // The bloom sits on the cut at the end of the fill, half on the bar and half
    // off it, in the fill's own colour. It is the one part of the bar that says
    // where the damage stops without the player having to compare two lengths.
    const bloom = h * 3.2;
    this.barTip.visible = true;
    this.barTip.setSize(bloom, bloom);
    this.barTip.x = x + span;
    this.barTip.y = y + h / 2;
    this.barTip.tint = low ? BAR_LOW : BAR_HOT;
    this.barTip.alpha = 0.3 + Math.sin(this.t * 5.2) * 0.09;

    // Under 30% the fill throbs between its deepened red and the full one. Set
    // here rather than in drawBar because this runs after the tweens do, so the
    // frame this writes is the frame that gets presented.
    if (low) {
      const beat = (1 + Math.sin(this.t * THROB.rate)) * 0.5 * THROB.depth;
      this.barFill.tint = this.barPainted
        ? lerpColor(PAINT_LOW, PAINT_FULL, beat)
        : lerpColor(BAR_LOW, BAR_HOT, beat);
    }
  }

  /**
   * The doom strip's highlight.
   *
   * Its own sweep, out of phase with the bar's by DOOM_SHEEN.phase, because two
   * gauges glinting in unison read as one animation on a two-line widget rather
   * than as two gauges.
   */
  animateDoom() {
    if (!this.doomOn || !this.barRect) {
      this.doomSheen.visible = false;
      return;
    }
    const { x, y, w, h } = this.doomRect();
    const left = Math.max(0, Math.min(1, this.doomLeft / this.doomTotal));
    const band = h * DOOM_SHEEN.band;
    const s = this.sweep(DOOM_SHEEN, w * left, band);

    this.doomSheen.visible = !!s;
    if (!s) return;
    this.doomSheen.setSize(band, h);
    this.doomSheen.x = x + s.x;
    this.doomSheen.y = y;
    this.doomSheen.alpha = s.alpha;
  }

  update(dt) {
    this.t += dt;
    if (this.banner.visible) {
      const p = 1 + Math.sin(this.t * 4.2) * 0.045;
      this.banner.scale.set(p);
    }

    this.printHp();
    if (this.crest) this.crest.update(dt);
    this.animateBar();
    this.animateDoom();

    // The clock only twitches inside the panic window. A permanently pulsing
    // number up in the chrome is noise the player learns to stop seeing.
    if (this.doomPanic()) {
      this.doomLabel.scale.set(1 + Math.abs(Math.sin(this.t * 6.5)) * 0.12);
      // The strip goes with it. Alpha on the whole Graphics rather than a redraw
      // of it — see setDoom, which will not rebuild this thing per frame.
      this.doomBar.alpha = 0.74 + Math.abs(Math.sin(this.t * 6.5)) * 0.26;
    } else {
      if (this.doomLabel.scale.x !== 1) this.doomLabel.scale.set(1);
      if (this.doomBar.alpha !== 1) this.doomBar.alpha = 1;
    }
  }
}
