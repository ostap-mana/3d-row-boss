/**
 * The scrim under the lesson: the screen goes dark everywhere except the cells
 * the hand is pointing at.
 *
 * Everything that teaches the move was already here and none of it could say
 * where to look. ui/coach.js frames the pair, points the arrow, slides the real
 * stone across and lights the run it makes; ui/hand.js puts a finger on the gem
 * and drags it. All of that is correct, and all of it is happening somewhere
 * inside a screen that also has a golem in it, a boss bar, a doom clock, six
 * hero cards and a line of type across the middle. A first-timer given one
 * second to find two outlined gems among that does not find them.
 *
 * So for as long as the lesson is up, the rest of the screen is taken away. A
 * hole is cut over the cells being taught, everything outside it is dimmed to
 * SPOTLIGHT.dim, and the one lit thing left on the glass is the thing the hand
 * is on. Nothing is hidden — the fight reads straight through the scrim, which
 * is the whole reason the arena is on screen in the creative's first frame at
 * all — but there is now exactly one place for the eye to go.
 *
 * Three things about how it is drawn.
 *
 * It lives in `world` rather than in the overlay, because the hole has to stay
 * on the board and the board shakes. A scrim outside the shake would slide off
 * its own cells the first time the boss lands a hit. It is drawn with a screen
 * of bleed round it for the same reason: a rect cut to the viewport shows a
 * bright seam down one edge the instant the world moves under it.
 *
 * The edge is feathered in bands rather than by a gradient texture. A hard cut
 * over painted art reads as a rendering fault instead of as light, and a
 * radial-gradient sprite would want a texture, a resolution and a resize. The
 * bands are thin rings of rising alpha — SPOTLIGHT.featherSteps of them — so
 * the whole falloff costs a fraction of a screen of overdraw on top of the one
 * full-screen fill underneath it.
 *
 * And it moves rather than cuts. A lesson re-aims — the coach re-solves its own
 * swap every pass, and the board does not hold still underneath it — and a hole
 * that jumped would read as two different lights rather than as one light being
 * moved onto something else.
 */

import { Container, Graphics } from "pixi.js";
import { SPOTLIGHT } from "../config.js";
import { Ease, killTweensOf, tween } from "../core/tween.js";

/** Cell size to fall back on before the first layout has landed. */
const CELL = 48;

export class Spotlight extends Container {
  constructor() {
    super();

    /** The dark, and the hole in it. */
    this.scrim = new Graphics();
    this.addChild(this.scrim);

    // A light, not a control. Everything under it stays as playable as it was:
    // the board takes swipes through the scrim exactly as it does without one,
    // and the CTA in the chrome stays a button.
    this.eventMode = "none";

    this.alpha = 0;
    this.visible = false;

    this.layout = null;
    /** The hole — `{x,y,w,h,r,dim}` in this container's coordinates, tweened. */
    this.hole = null;
    /** What is actually on screen, so a still lesson redraws nothing. */
    this.drawn = null;
    this.t = 0;
    /** Retires a fade-out, so a lesson that comes back mid-fade keeps its hole. */
    this.token = 0;
  }

  resize(layout) {
    this.layout = layout;
    // The board has already been laid out again by the time this runs — main.js
    // resizes it first — but the hole is in the old screen's coordinates until
    // whoever aimed it aims again, which the coach does off the same resize.
    // Dropping `drawn` is what makes that redraw actually happen: the hole can
    // come back with the very same numbers on a resize that only moved the
    // scrim's own edges.
    this.drawn = null;
    this.redraw();
  }

  /**
   * Put the light on a box.
   *
   * The light has no colour of its own any more, which is why nothing here
   * takes an element. It used to strike a rim round the hole in the lesson's
   * own hue; that rim is gone — see SPOTLIGHT — and what is left is a hole in
   * the dark, which is the same hole whatever is being taught through it.
   *
   * @param {{x:number,y:number,w:number,h:number,r?:number,pad?:number}} box
   *   what to light, in this container's coordinates. `r` is the corner it
   *   wants; a box that does not ask gets SPOTLIGHT.corner. `pad` is the
   *   clearance it wants, in the same coordinates; a box that does not ask gets
   *   SPOTLIGHT.pad of a board cell.
   * @param {boolean=} deep the opening lesson, which gets the deeper dim. See
   *   SPOTLIGHT.dim against SPOTLIGHT.dimInPlay for why there are two.
   */
  aim(box, deep) {
    if (!SPOTLIGHT.on) return;

    /**
     * The clearance, and why a caller is allowed to bring its own.
     *
     * The default is measured in board cells because almost everything this
     * light is ever put on *is* board cells, and air round a gem is only ever
     * legible against the size of a gem. A hero card is the one thing lit here
     * that the board did not lay out, and it is smaller than a cell — the board
     * is five columns of the screen's width and the row is six cards of it — so
     * a cell's worth of air round a card comes out at about a quarter of a card
     * on every side. That is not a light on a card any more; it is a lit
     * rectangle with a card somewhere inside it, reaching over the gap towards
     * the neighbours it is not talking about. So a caller lighting something
     * that is not a cell hands in a clearance measured off that thing instead —
     * see CARD_HOLE_PAD in ui/coach.js.
     */
    const cell = this.layout ? this.layout.board.cell : CELL;
    const pad = box.pad === undefined ? cell * SPOTLIGHT.pad : box.pad;
    const want = {
      x: box.x - pad,
      y: box.y - pad,
      w: box.w + pad * 2,
      h: box.h + pad * 2,
      // A fixed corner — see SPOTLIGHT.corner, which is where the stadium this
      // used to draw is written up, and why it is zero.
      //
      // The pad is added to a corner that came *in* and not to the default one,
      // and that is the difference between square and nearly square. A caller's
      // radius describes a box that is about to grow by `pad` on every side, so
      // it has to grow with it or the light stops tracing what was asked for —
      // a hero card's corner, say. The default describes the light itself, and
      // adding the pad to it put a corner back on a hole set to have none.
      r: box.r === undefined ? cell * SPOTLIGHT.corner : box.r + pad,
      dim: deep ? SPOTLIGHT.dim : SPOTLIGHT.dimInPlay,
    };

    // Any teardown in flight is off: this is the light being moved, not a
    // second one arriving behind the first going out.
    this.token++;
    killTweensOf(this);

    if (!this.hole || !this.visible) {
      // Nothing to travel from. Placed and drawn in this tick rather than a
      // frame later — the opening lesson is on screen in the creative's first
      // frame, and the scrim is half of what that frame says.
      this.hole = want;
      this.visible = true;
      this.redraw();
    } else {
      killTweensOf(this.hole);
      tween(this.hole, want, SPOTLIGHT.travel, { ease: Ease.cubicOut });
    }

    if (this.alpha < 1) tween(this, { alpha: 1 }, SPOTLIGHT.fade);
  }

  /**
   * The lesson is over. The screen comes back.
   *
   * The hole is not dropped until the fade has landed, so what the player
   * watches is the dark lifting off the board rather than the board being
   * uncovered a cell at a time.
   */
  hide() {
    if (!this.visible) return;
    const id = ++this.token;
    killTweensOf(this);
    if (this.hole) killTweensOf(this.hole);
    tween(this, { alpha: 0 }, SPOTLIGHT.fade * 0.7).then(() => {
      // Aimed again while this was going out — that light is the live one now.
      if (id !== this.token) return;
      this.visible = false;
      this.hole = null;
      this.drawn = null;
      this.scrim.clear();
    });
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    // The hole is tweened, so the geometry is chased here rather than pushed
    // from the tween — and only when it actually moved, which for most of a
    // lesson is not at all.
    if (this.moved()) this.redraw();
  }

  /** Whether what is on screen still matches the hole that is wanted. */
  moved() {
    const h = this.hole;
    const d = this.drawn;
    if (!h) return false;
    if (!d) return true;
    return (
      d.x !== h.x ||
      d.y !== h.y ||
      d.w !== h.w ||
      d.h !== h.h ||
      d.r !== h.r ||
      d.dim !== h.dim
    );
  }

  redraw() {
    const g = this.scrim;
    g.clear();
    this.drawn = null;

    const layout = this.layout;
    const h = this.hole;
    if (!layout || !h) return;

    // A whole screen of bleed on every side. The world shakes under this, and a
    // scrim cut to the viewport would show a bright band down whichever edge
    // the shake pulled it off.
    const bleed = Math.max(layout.w, layout.h);
    const cell = layout.board.cell || CELL;
    /**
     * How many rings of falloff there are, and zero is a real answer.
     *
     * At one step the ring covers the whole span at the same alpha the dark
     * outside it is already at, so it draws nothing the eye can find — and it
     * draws it as a *second* fill butted against the first. Two adjacent
     * antialiased shapes do not composite to one flat field: they leave a
     * hairline down the seam, which on a scrim this dark is a thin bright
     * rectangle floating a fraction of a cell outside the light. Which is the
     * exact fault the single step was set to get rid of.
     *
     * So one step means no feather: the dark is holed on the light's own edge
     * and there is one fill, one edge and one rectangle. See
     * SPOTLIGHT.featherSteps.
     */
    const steps = SPOTLIGHT.featherSteps > 1 ? SPOTLIGHT.featherSteps : 0;
    const step = steps ? (cell * SPOTLIGHT.feather) / steps : 0;

    /** The hole at a given distance outside its own edge. */
    const path = (target, grow) =>
      target.roundRect(
        h.x - grow,
        h.y - grow,
        h.w + grow * 2,
        h.h + grow * 2,
        Math.max(0, h.r + grow),
      );

    // The dark itself, holed at the far edge of the feather.
    g.rect(-bleed, -bleed, layout.w + bleed * 2, layout.h + bleed * 2);
    g.fill({ color: SPOTLIGHT.color, alpha: h.dim });
    path(g, steps * step);
    g.cut();

    // And the falloff, as rings between one step and the next. Drawn outward so
    // the alpha curve reads in the order it is written; they do not overlap, so
    // the order on screen is the same either way.
    for (let i = 0; i < steps; i++) {
      // Eased rather than linear: a straight ramp puts as much dark right
      // against the gems as it does out at the edge of the falloff, and the
      // near half is the half a player can see banding in.
      const k = Math.pow((i + 1) / steps, 1.6);
      path(g, (i + 1) * step);
      g.fill({ color: SPOTLIGHT.color, alpha: h.dim * k });
      path(g, i * step);
      g.cut();
    }

    this.drawn = { ...h };
  }
}
