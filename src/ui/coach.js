/**
 * The lesson — the opening one, and every auto-hint after it.
 *
 * The creative used to explain itself with four words and a hand. `MATCH TO
 * ATTACK` says what to do to somebody who already knows what a match is, and
 * the hand demonstrates a swipe — but a swipe over gems that never move shows
 * a gesture and not a rule. Somebody meeting a match-three for the first time,
 * in a thirty second window, with a monster roaring at them, is not going
 * to infer "line three of the same colour up" from a gauntlet sliding sideways.
 * They will decide the screen is busy and wait for it to be over.
 *
 * So this shows the rule instead of naming it, in four beats and no words:
 *
 *   1. the two gems that are already in a line light up — here is a pair;
 *   2. the one that would complete it lights up too, with an arrow off it —
 *      this one, that way;
 *   3. the gem actually travels. Board.previewSwap slides the real stones on
 *      screen without touching the model, so what the player watches is the
 *      move they are being asked to make, made;
 *   4. the run lights as one, inside a single frame drawn round the whole of
 *      it — this is what you were making. One frame per run and not one round
 *      everything that lit: a swap can finish two runs at once, in two
 *      elements, and each gets its own frame in its own colour.
 *
 * Then it puts everything back and does it again, holding the pair lit at
 * REST_ALPHA in between, until whoever started it calls stop().
 *
 * Two things start it, both through Director.showLesson. The opening hint runs
 * it on the creative's first frame, for a player who has not touched the board
 * yet — cold, so the marks are already lit in that frame rather than fading up
 * into it — and the first touch ends that one for the whole run — see
 * Director.spendOpeningHint and T.openingHint. The auto-hint runs the same
 * thing, on the same board, every time somebody stalls for T.hint afterwards,
 * and every touch puts it away again. The second is the reason this file is not called the tutorial:
 * a player five moves in gets exactly the demonstration a player who has made
 * none gets, because there is only one way to say "three of these, in a line"
 * and the fight is too short to teach it twice.
 *
 * Nothing here ever blocks input: at every beat the board underneath is live,
 * and a player who has understood it two beats in can swipe straight through
 * the lesson.
 *
 * The marks themselves are painted: the corner frames and the arrow are cut off
 * the same neon UI sheet the gems came off, so a lit gem wears a bracket drawn
 * to sit round it rather than a shape this file guessed at. See
 * art/hintmarks.js. When that art does not decode the lesson falls back to
 * drawing its own rings and dart in Graphics — same beats, same places, plainer
 * marks — because a hint that does not come up is worse than a plain one.
 *
 * Every mark wears the element of the thing it is drawn on: a frame takes the
 * colour of the gem inside it, and a run's frame the colour the run is made of.
 * Only the arrow and the hand wear the travelling stone's, and only because
 * those two are about the stone rather than about a cell. A beat is therefore
 * as many colours as it has gems in it, which is the point — a lit gem and the
 * bracket round it are one statement, and a bracket that disagrees with what it
 * encloses reads as a mark that has landed in the wrong place.
 */

import { Container, Graphics } from "pixi.js";
import { GEM_LIGHT } from "../config.js";
import { tween, delay, killTweensOf } from "../core/tween.js";
import {
  hintArrowSprite,
  hintFrameSprite,
  hintMarksReady,
} from "../art/hintmarks.js";
import { READY_SCALE, READY_SWING } from "../art/heroes.js";

/** How long the completed run is held up before the board is put back. */
const HOLD = 0.62;
/** The travel, out and back. Out is the lesson; back is only bookkeeping. */
const TRAVEL = 0.4;
const RETURN = 0.26;
/** The beat between one pass and the next. */
const REST = 0.5;
/**
 * What the first two beats last on a cold open — the pass that is the first
 * thing in the creative, before the touch and before the roar.
 *
 * Short, and short on purpose. Everywhere else those beats are 0.28 and 0.34,
 * which is the pace of an explanation to somebody who is already watching; the
 * opening pass is talking to somebody who has just been handed a screen and is
 * deciding, in about a second, whether anything on it is worth a thumb. Held at
 * the reading pace the hand did not arrive until a second and a third in, and
 * an instruction that late has already lost the impressions it was written for.
 *
 * Only the two beats before the travel are cut. The swipe itself, the run
 * lighting up and the hold on it are the lesson, and they run at full length on
 * the first pass exactly as on the fifth.
 */
const COLD_BEAT = 0.14;
/**
 * What the marks fade back to between passes rather than off.
 *
 * The lesson used to go to nothing and come back from nothing, which on a loop
 * is a set of outlines blinking on and off over the board — and blinking is the
 * one thing on a screen that cannot be ignored and cannot be read either. Held
 * dim, the pair stays picked out the whole time the hint is up, so the answer
 * is on screen continuously and the demonstration of it merely repeats.
 */
const REST_ALPHA = 0.42;

/**
 * How long the opening demo holds on the hero card before going back to the
 * board — see the `cardFor` half of play().
 *
 * Long enough for one whole pass of Hand.tapLoop and the beat after it, which
 * is two taps: one tap reads as the hand arriving somewhere, two reads as the
 * hand telling you to do something. Any longer and the demo spends more of its
 * loop on the row than on the board, and the board is still the move the player
 * has to make first.
 */
const CARD_BEAT = 2.2;

/**
 * The frame's side, as a fraction of a cell.
 *
 * Measured off the gem and not off the cell: GemView.resize fits every disc to
 * 0.86 of a cell — see art/gems.js — and this is that plus a hair, so the
 * brackets sit on the corners of the gem's own square rather than out on the
 * corners of the cell's.
 *
 * It stood at 0.98, which is the cell. The frame is four corner brackets and a
 * gem is a circle, so a box drawn on the cell put each bracket about an eighth
 * of a cell diagonally off the disc it was pointing at — four marks floating in
 * the gaps between four gems, nearer the neighbours than the thing they were
 * bracketing. Pulled in to the disc they read as a frame *on* that gem.
 *
 * There is no crowding to pay for it. The brackets are corners and the gem is
 * round: at 0.88 the corner of the box is 0.62 of a cell from the middle and the
 * disc's edge is 0.43, so the mark still clears the art by a fifth of a cell on
 * the diagonal — it is only the flat runs of the box, where nothing is drawn,
 * that came in. Two frames on adjacent cells are further apart than they were.
 *
 * The board's hole in the scrim is grown by this too — see reaim — so the light
 * follows the marks in rather than being left standing around them.
 */
const FRAME_SPAN = 0.88;

/**
 * The arrow's length, as a fraction of a cell.
 *
 * It sits on the seam between the two cells being swapped, and there is nothing
 * else there: two adjacent gems leave a gap of 0.14 of a cell between their
 * discs. So it is always partly over the gems, and long enough to be read as an
 * arrow rather than short enough to fit in a gap that does not exist.
 */
const ARROW_SPAN = 0.62;

/**
 * How far the frame round a hero card stands off the card, as a fraction of the
 * card's width.
 *
 * None: the box is the card. Both things drawn off it — the brackets in wear()
 * and the hole in the scrim, see CARD_HOLE_PAD — land on the card's own painted
 * border rather than outside it, so the lit rectangle in the dark has exactly
 * the card's outline and the marks sit on its edge.
 *
 * It stood at 0.04, on the argument that a frame wants to clear what it is
 * framing. Against a scrim it does not: the brackets and the dark's edge are
 * the same box, so every point of standoff is a point of *lit background*
 * around the card — a bright margin with nothing in it, which the eye reads as
 * part of the thing being pointed at and which is the one thing a hole cut to
 * one card is trying not to say. On the row it was also the widest a frame
 * could go before landing on a neighbour: the gap between two cards is about a
 * hundredth of the row's width — CARD.gap in core/layout.js — and a card pops
 * to CARD_READY inside it.
 *
 * The box is still the card at its largest and not the slot the row laid out —
 * see CARD_READY — so what is left is a couple of points of daylight at the
 * bottom of the breath and nothing at the top of it.
 */
const CARD_PAD = 0;

/**
 * And how far the *hole in the scrim* stands off the same card, as a fraction
 * of the card's width, on top of the CARD_PAD the box already carries.
 *
 * Zero, and zero is a real answer: the light is cut on cardBox itself, which is
 * the very box the painted brackets are laid on — so the dark stops exactly
 * where the lesson's own mark stops and the lit rectangle has the card's
 * outline and no other.
 *
 * It is measured off the card at all — rather than left to Spotlight.aim's own
 * clearance — because that one is SPOTLIGHT.pad of a *board cell*, and a cell
 * is wider than a card: the board is five columns of the screen and the row is
 * six cards of it. What a card got by saying nothing was about a quarter of its
 * own width of dark-free air on every side, which on screen is a lit rectangle
 * standing well clear of the card with the neighbours it is not pointing at
 * half inside it. The eye read the rectangle before it read the card.
 *
 * What flush costs, and it is worth knowing which way it is paid: the charged
 * card's aura blooms outside its own border — see art/frameaura.js — so the
 * scrim's edge now crosses the outer half of that glow and takes it down with
 * everything else. That is the trade a hole cut to the element's size makes.
 * The card still reads: the bloom's bright half is inside the border, and the
 * brackets are on the edge the dark now starts at. Give it air again by raising
 * this — 0.06 or so clears the visible glow — not by putting the cell-measured
 * default back.
 */
const CARD_HOLE_PAD = 0;

/**
 * Where in the card's breath the box round it is measured, as a fraction of the
 * swing: 1 is the top of it, 0 the middle.
 *
 * This is the last slack there is. With CARD_PAD and CARD_HOLE_PAD both at zero
 * the box *is* the card, and the only thing still standing between the light
 * and the card's edge is that the card does not hold one size — it pulses. The
 * box is placed once and cannot pulse with it, so it has to be taken at some
 * one point of the swing, and where that point is decides which way the error
 * falls:
 *
 *   at the top      the light is never inside the card, and there is up to a
 *                   swing's worth of lit background under it at the bottom of
 *                   the breath. This is the safe end and is where it stood.
 *   at the middle   the light is flush on average, and the card's own rim
 *                   crosses out into the dark at the top of the breath — the
 *                   scrim is drawn over the hero row, so what that costs is the
 *                   outer edge of the card dimming for the moment it is out
 *                   there, twice a second.
 *
 * At this it is nearer the middle than the top: most of the daylight is gone
 * and what the card puts out through the light at its very largest is a couple
 * of points of its own border, briefly, at the peak of a sine. Raise it back
 * towards 1 if that rim ever reads as flickering; the sliver comes back with
 * it, and no value here gets both.
 */
const CARD_BREATH = 0.4;

/**
 * What the card being framed is actually the size of.
 *
 * A charged card pops to READY_SCALE and then breathes READY_SWING either side
 * of it — art/heroes.js owns both numbers and this reads them rather than
 * guessing, because the whole job here is to draw round the card and the card
 * is a fifth larger than the box the row gave it.
 */
const CARD_READY = READY_SCALE * (1 + CARD_BREATH * READY_SWING);

/** Whether two cells are the same cell. */
const same = (a, b) => a.r === b.r && a.c === b.c;

/**
 * The straight runs a list of matched cells is actually made of.
 *
 * Board.findMatches answers with every cell in a run of three or more anywhere
 * on the board, flattened into one list — and a single swap can light two runs
 * at once, in two different elements: the stone going down completes a line
 * where it lands while the stone coming up completes another where it started.
 *
 * The lesson used to take the bounding box of that whole list. On a double
 * match that is one rectangle with both runs inside it, every unmatched gem
 * between them inside it as well, drawn in whichever element happened to be
 * travelling — a lightning frame round three lightning gems *and* three nature
 * ones, which says the player made one six-gem yellow thing out of stones that
 * are plainly not all yellow.
 *
 * So the list is put back into the runs it came from before anything is drawn:
 * maximal same-element lines of three or more, along each axis. A plain match
 * gives one, framed as before. A double match gives two, each framed on its own
 * and each in its own colour. An L or a T gives its arm and its leg, which
 * overlap at the corner they share and cover no cell that is not in the match.
 *
 * @param {Array<{r:number,c:number}>} cells every matched cell
 * @param {function} typeOf the element at a cell, as the board reads *now*
 * @returns {Array<{cells:Array,type:number}>} one entry per run
 */
function straightRuns(cells, typeOf) {
  const key = (r, c) => `${r},${c}`;
  const set = new Set(cells.map((cell) => key(cell.r, cell.c)));
  const out = [];

  [
    [0, 1],
    [1, 0],
  ].forEach(([dr, dc]) => {
    cells.forEach((cell) => {
      const type = typeOf(cell.r, cell.c);
      // -1 is an encased cell. The boss can drop obsidian between the hint
      // being solved and this beat being drawn, and a run through one is no
      // longer a run.
      if (type < 0) return;
      // Only ever walked from the head of a line, so each line is found once
      // however many of its cells this loop visits.
      if (
        set.has(key(cell.r - dr, cell.c - dc)) &&
        typeOf(cell.r - dr, cell.c - dc) === type
      ) {
        return;
      }
      const line = [cell];
      for (;;) {
        const r = cell.r + dr * line.length;
        const c = cell.c + dc * line.length;
        if (!set.has(key(r, c)) || typeOf(r, c) !== type) break;
        line.push({ r, c });
      }
      if (line.length >= 3) out.push({ cells: line, type });
    });
  });

  return out;
}

export class Coach extends Container {
  constructor() {
    super();
    globalThis.__coach = this; // PROBE

    /** The fallback, and empty for the whole of a lesson when the art decoded. */
    this.marks = new Graphics();
    /**
     * The painted marks: the arrow, and a pool of frames per element. Rebuilt
     * when the lesson changes element — see wear().
     */
    this.kit = new Container();
    this.addChild(this.marks, this.kit);
    this.painted = null;
    /** The beat on screen, kept so a relayout can put it back — see resize(). */
    this.last = null;
    /**
     * The point the hand is tapping through an ult lesson.
     *
     * Handed to Hand.tapLoop once and then written in place rather than passed
     * again, because the loop reads it at the top of every pass: a relayout
     * moves the card under a demo that is already running, and the prop picks
     * the new place up on its next tap instead of going on knocking at where
     * the row used to be.
     */
    this.cardAt = null;
    /**
     * The scrim, when main.js gave us one — see useSpotlight and ui/spotlight.js.
     *
     * The marks say what the move is; the scrim says where on the screen it is
     * happening, which is the one thing five outlined gems in a busy arena
     * could never say for themselves. Optional on purpose: everything below
     * draws the same lesson whether or not it is there, and SPOTLIGHT.on turns
     * it off from config without a branch anywhere in here.
     */
    this.spot = null;
    /**
     * What the scrim is lit on, kept rather than passed straight through.
     *
     * The light is aimed once a pass and not once a beat. Every beat of the
     * lesson draws a different set of boxes — the pair, then the pair and the
     * traveller, then the finished run — and a hole that resized itself for
     * each of them would be a light flickering between three shapes over a
     * board where nothing had happened. So it is put round the whole of what
     * the pass is going to touch and left there, and this is what a relayout
     * re-solves it from. See spotOn and reaim.
     */
    this.focus = null;
    /** Whether the lesson running is the opening one — it gets the deeper dim. */
    this.opening = false;

    this.alpha = 0;
    this.visible = false;
    /** Retires a lesson in flight — every await in the loop checks it. */
    this.token = 0;
  }

  /** Hand the coach the scrim it lights its lessons with. Called once, by main. */
  useSpotlight(spot) {
    this.spot = spot;
  }

  resize() {
    // Every mark is placed from the board's own cell size at draw time, so the
    // beat that is up, drawn again, lands on the new layout by itself. Drawn
    // again rather than merely taken down: the beats are as much as a second
    // apart — the travel and then the hold on the finished run — and a lesson
    // that cleared and waited would spend that second as a hand moving over an
    // unmarked board. Nothing is redrawn when nothing is up: stop() drops this.
    if (!this.last) {
      this.clearMarks();
      return;
    }
    // And the light with them. It is solved from cell and card positions the
    // same way the marks are, so the same call that puts a beat back on the new
    // layout puts the hole it is standing in back too — otherwise the board
    // moves out from under the scrim and the lesson ends up lit next to itself.
    this.reaim();
    // Two lessons, so two things to put back. The row has already been laid out
    // again by the time this runs — main.js resizes it before the coach — so
    // the card is simply asked where it is now, and this is also what moves the
    // point the hand is tapping. See cardAt.
    if (this.last.card) {
      this.drawCard(this.last.card, this.last.type, this.last.color);
      return;
    }
    this.draw(this.last.board, this.last.step);
  }

  /**
   * End the lesson. The board is put back by whoever owns it.
   *
   * The fade is killed rather than overwritten. Setting the alpha under a tween
   * that is still running does nothing at all — the next frame writes the
   * curve's own value back over it — so a lesson retired mid-fade went on
   * climbing to REST_ALPHA behind `visible = false`, and the next one to open
   * came up already half lit instead of arriving from nothing.
   */
  stop() {
    this.token++;
    killTweensOf(this);
    this.last = null;
    this.clearMarks();
    this.alpha = 0;
    this.visible = false;
    // The marks go instantly — they are meaningless the moment the lesson they
    // belong to is retired — and the dark lifts over a fifth of a second,
    // because it is the whole screen and a screen that snaps back to full
    // brightness reads as a fault rather than as a light going out.
    this.focus = null;
    this.opening = false;
    if (this.spot) this.spot.hide();
  }

  /** Take every mark off screen without throwing the sprites away. */
  clearMarks() {
    this.marks.clear();
    if (!this.painted) return;
    this.painted.arrow.visible = false;
    // The whole pool, not just what the last beat used: this is the door every
    // route out of a lesson goes through, and a frame left visible behind it is
    // a bracket sitting on a board with no hint on it.
    this.painted.pool.forEach((list) =>
      list.forEach((f) => (f.visible = false)),
    );
    this.painted.used = [];
  }

  /* ------------------------------------------------------------ the light */

  /**
   * Light a set of cells and hold the light there for the rest of the pass.
   *
   * @param {object} board the live Board
   * @param {Array<{r:number,c:number}>} cells everything the pass will touch
   * @param {number} type the element the rim wears
   */
  spotOn(board, cells, type) {
    if (!this.spot) return;
    // Deduplicated on the way in. The three lists a lesson is made of overlap
    // by design — the pair is inside the run, and on a swap that finishes at
    // both ends the traveller is inside it too — and a bounding box would not
    // care either way, but this list is kept and re-solved on every relayout
    // for as long as the pass lasts, and there is no reason to keep the same
    // cell in it three times.
    const seen = new Set();
    const cell = [];
    cells.forEach((c) => {
      const key = `${c.r},${c.c}`;
      if (seen.has(key)) return;
      seen.add(key);
      cell.push({ r: c.r, c: c.c });
    });
    this.focus = { board, cells: cell, type };
    this.reaim();
  }

  /**
   * Solve the hole's box again and hand it to the scrim.
   *
   * Called when the light is first aimed and again on every relayout, and it is
   * the same work both times: the cells and the card are the thing that is
   * remembered, and where they are on the glass is asked fresh. Nothing here
   * caches a screen position, which is why a rotation mid-lesson lands the hole
   * on the same gems rather than on the place those gems used to be.
   */
  reaim() {
    const spot = this.spot;
    const focus = this.focus;
    if (!spot || !focus) return;

    /**
     * The scrim belongs to the opening guideline and to nothing after it.
     *
     * It is a hole cut in a sheet laid over the whole screen, and what that is
     * worth depends entirely on whether the player has anything else to do. On
     * the start screen they do not: no clock is running, the boss has not moved,
     * and taking the arena down to point at one gesture is the whole reason the
     * scrim exists. The second time it appears the player is *playing* — and
     * then it is a pale ring drawn round part of their own board, dimming the
     * gems they are reading in order to tell them something the frames, the
     * arrow and the hand are already saying inside it.
     *
     * So it goes up once, with the lesson that has the screen to itself, and
     * never again. Every route back here — a relayout, a new pass, the card
     * beat, the in-play ult hint — lands on this line and puts it away. The
     * marks themselves are untouched: the hint still draws, it just stops
     * bringing a spotlight with it.
     */
    if (!this.opening) {
      spot.hide();
      return;
    }

    // The ult lesson. The card's own x and y are already coordinates in this
    // container — the row sits at the world's origin — so there is no board
    // offset to add, exactly as in drawCard.
    if (focus.card) {
      // Before the row's first resize a card has no size, and a hole round
      // nothing is a bright rectangle in the corner of a dark screen.
      const box = this.cardBox(focus.card);
      if (!box) return;
      /**
       * Square, and the card's own corner deliberately thrown away on the way
       * in.
       *
       * `cardBox` still carries it, because the drawn fallback frame is a ring
       * *on* the card and a ring has to trace what it is drawn on — see stroke,
       * which is the other caller. The light is not on the card. It is a hole in
       * the dark with the card standing in it, and every other hole this scrim
       * cuts is a plain rectangle for the reason written up at SPOTLIGHT.corner:
       * a radius is a shape the light is claiming to have, and the only shape it
       * should be claiming is *this thing, here*.
       *
       * The radius is left off rather than sent in as a zero, and the two are
       * not the same thing. A radius that comes *in* is a description of the box
       * before the pad is added, so aim() grows it by the pad to keep tracing
       * what was asked for — which turns a zero into a corner of `pad`, or about
       * a fifth of a cell. Only a box with no opinion gets SPOTLIGHT.corner, and
       * that is the zero this wants.
       */
      spot.aim(
        {
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          // The clearance comes from the card too, for the reason written up at
          // CARD_HOLE_PAD: the scrim's own is a fraction of a board cell, and a
          // card is not a board cell.
          pad: (focus.card.cardW || 0) * CARD_HOLE_PAD,
        },
        this.opening,
      );
      return;
    }

    // And the board lesson: the bounding box of every cell in the pass, grown
    // by the same span the frames are drawn at, so the light clears the marks
    // instead of cutting through them.
    const { board, cells } = focus;
    const span = board.cell * FRAME_SPAN;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    cells.forEach((c) => {
      const p = board.cellPos(c.r, c.c);
      x0 = Math.min(x0, board.x + p.x);
      y0 = Math.min(y0, board.y + p.y);
      x1 = Math.max(x1, board.x + p.x);
      y1 = Math.max(y1, board.y + p.y);
    });
    if (!Number.isFinite(x0)) return;

    spot.aim(
      {
        x: x0 - span / 2,
        y: y0 - span / 2,
        w: x1 - x0 + span,
        h: y1 - y0 + span,
      },
      this.opening,
    );
  }

  /**
   * One pass of the demo's card half: light a hero, tap it, hand the prop back.
   *
   * The finite cousin of playCard. That one is a lesson in its own right and
   * loops until the director retires it; this one is a beat inside another
   * lesson and has to give the board its prop back, so it holds for CARD_BEAT
   * and leaves.
   *
   * The board's marks come off first and go back on after. Two sets of frames on
   * screen at once would be two lessons rather than one sentence with two
   * halves, and the point of this beat is that it is the *same* sentence: these
   * gems, then the hero those gems charge.
   */
  async cardBeat(id, card, hand, type) {
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    this.last = null;
    this.clearMarks();
    // Taken off the board before it is asked for the row. The swap beat leaves
    // the prop wherever its last slide ended, and a hand that travelled from
    // there to the card would read as the player dragging a gem into the row.
    hand.stop();

    this.drawCard(card, type, color);
    if (!this.cardAt) return;
    hand.setElement(type);
    hand.tapLoop(this.cardAt);

    await tween(this, { alpha: 1 }, 0.2);
    if (id !== this.token) return;
    await delay(CARD_BEAT);
    if (id !== this.token) return;

    // And back to the board. Stopped rather than left to finish its loop: the
    // swap beat reaches for the board on its own clock, and a tap still running
    // on the row while that happens is two hands.
    hand.stop();
    this.last = null;
    this.clearMarks();
    await tween(this, { alpha: REST_ALPHA }, 0.22);
  }

  /**
   * Loop the lesson until stop().
   *
   * @param {object} board the live Board
   * @param {object} hand the tutorial hand
   * @param {object} shape from Board.matchShape — what the swap would make
   * @param {function=} solve asked for a fresh shape when this one stops being
   *   true, and allowed to answer null when the board has nothing left to teach
   * @param {boolean=} cold whether the *first* pass snaps up rather than fading
   *   in and reads its opening beats at COLD_BEAT. For the opening hint, which
   *   is on screen before anything else in the creative is. Every pass after it
   *   runs at the ordinary pace: what is bought here is the arrival, not the
   *   lesson, and a demonstration that stayed hurried would be a worse one.
   * @param {function=} cardFor asked, once a swap has been demonstrated, for the
   *   hero that swap's colour belongs to — and the director answers only while
   *   that hero's charge bar is standing at its maximum. Answer a card and the
   *   loop plays the second half of the demo on it — see cardBeat; answer null,
   *   or leave this out, and the lesson is the board and nothing else. What the
   *   condition buys is that the hand never lands on a control that would do
   *   nothing if it were tapped, which is what it did on the start screen where
   *   the party is dealt a tenth charged. See Director.showLesson.
   */
  async play(board, hand, shape, solve, cold = false, cardFor = null) {
    const id = ++this.token;
    this.visible = true;
    // `cold` is only ever true for the opening lesson — see Director.showLesson
    // — which is also the only lesson allowed to take the whole screen down.
    // Every pass after the first runs warm and the flag stays set, because what
    // the deeper dim is answering is who is watching, not which pass it is.
    this.opening = !!cold;
    let live = shape;
    let open = cold;
    while (id === this.token) {
      // Nothing is drawn over a board that is still moving. Every mark here is
      // placed from a cell position, and mid-cascade the gems are not on their
      // cells — so a pass that started now would outline empty squares and then
      // be refused by previewSwap anyway.
      while (board.busy) {
        await delay(0.12);
        if (id !== this.token) return;
      }

      // And then the swap is solved again rather than remembered. A hint loops
      // for as long as the player stalls, and the board does not hold still
      // underneath it — the boss drops obsidian on a cell, the lava lands, a
      // cascade settles the run somewhere else. The director re-aims this from
      // outside at the places it knows about, but it cannot know about all of
      // them, and a lesson that has stopped being true is worse than no lesson:
      // it demonstrates, in full, a swipe that makes nothing. matchShape is
      // model-only and costs one pass over sixty-four cells.
      //
      // The destination goes in first, and that is load-bearing. matchShape
      // reads its own first argument as the traveller's landing cell whenever
      // that cell is in the run, and a swap can complete a line at *both* ends
      // — hand it the pair the other way round and it answers with the mirror
      // lesson, so the arrow would turn round between one pass and the next
      // over a board where nothing had changed at all.
      const next =
        board.matchShape(live.to, live.from) || (solve ? solve() : null);
      if (!next) {
        this.stop();
        return;
      }
      // A different pair is a different sentence, so it starts from nothing
      // rather than from the marks still lit on the old one — frames sliding
      // across the board to new cells read as the marks moving, which is the
      // one thing on screen here that is not supposed to mean anything.
      if (!same(next.from, live.from) || !same(next.to, live.to)) {
        this.last = null;
        this.clearMarks();
        this.alpha = 0;
      }
      live = next;

      await this.lesson(id, board, hand, live, open);
      open = false;
      if (id !== this.token) return;

      // The colour is read off the board rather than off the shape, for the same
      // reason lesson() reads it: a shape is a pair of cells and a run, and
      // which element it is made of is a question only the board can answer.
      const type = board.typeAt(live.from.r, live.from.c);
      const card = cardFor && cardFor(type);
      if (card) {
        await this.cardBeat(id, card, hand, type);
        if (id !== this.token) return;
      }

      await delay(REST);
    }
  }

  /**
   * The other lesson: which hero is charged, and what to do about it.
   *
   * Everything above teaches the board. This teaches the row underneath it, in
   * the same marks and the same grammar — the frame off the hint sheet, in the
   * hero's own element, with the hand that drags gems tapping instead. A player
   * who has watched the board lesson has already been told what a frame round a
   * thing means, so this only has to say which thing.
   *
   * No arrow and no words: there is nowhere for the card to travel to, and the
   * gesture is the whole of the instruction. The HUD's own TAP {hero} shout is
   * still up while this arrives — Director.teachUlt waits for it on purpose —
   * so the hero is named once, in type, by the surface that names everything
   * else in the creative, and the hand says the rest.
   *
   * Loops until stop(), exactly as play() does, and what bounds it is the
   * director: the prop is held for T.ultHint and then handed back to the board,
   * because a hand parked on the row is a hand pointing away from the fight.
   *
   * @param {object} card the HeroCard that just charged
   * @param {object} hand the tutorial hand
   * @param {number} type the hero's element, which picks the painted set
   */
  async playCard(card, hand, type) {
    const id = ++this.token;
    this.visible = true;
    // Never the opening lesson: this one only ever runs once a hero has charged,
    // which is a good way into a fight the player is already reading.
    this.opening = false;
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    // The hand wears the hero's colour the way it wears a gem's on the board,
    // and it is told before it is shown rather than while it is up.
    hand.setElement(type);
    this.drawCard(card, type, color);
    // Fired, not awaited: the loop below is the frame's beat and the tap is the
    // prop's, and the two are deliberately not on one clock — a frame that
    // waited for the hand would spend half the lesson holding still.
    hand.tapLoop(this.cardAt);

    await tween(this, { alpha: 1 }, 0.2);
    // And then it breathes between full and REST_ALPHA rather than blinking,
    // for the reason that constant exists at all: the frame is the answer to
    // "which card", and an answer that goes out is one the player has to wait
    // for all over again.
    while (id === this.token) {
      await delay(0.55);
      if (id !== this.token) return;
      await tween(this, { alpha: REST_ALPHA }, 0.3);
      if (id !== this.token) return;
      await delay(0.2);
      if (id !== this.token) return;
      await tween(this, { alpha: 1 }, 0.22);
    }
  }

  /**
   * Place the frame round one hero card.
   *
   * The cards are children of a row that sits at the world's origin, so a
   * card's own x and y are already coordinates in this container — no
   * conversion, unlike the board, whose cells are offsets inside it.
   *
   * @param {object} card the HeroCard
   * @param {number} type the element, which picks the painted set
   * @param {number} color the element's light, which the fallback strokes with
   */
  /**
   * The box a frame or a hole goes round one hero card, or null when the row
   * has not been laid out yet.
   *
   * One function because two things need it and they have to agree to the pixel
   * — the frame drawCard paints and the hole reaim cuts. They were the same
   * arithmetic written twice.
   *
   * The scale is read off what the card is actually doing rather than assumed.
   * A charged card is measured at the top of its ready pulse — CARD_READY, the
   * peak and not the live value, so the frame holds still while the card
   * breathes inside it.
   *
   * Both demos now only ever put a frame on a charged card — see the `cardFor`
   * in Director.showLesson, and teachUlt, which fires off the charge itself — so
   * that is the branch this takes in practice. The other one is kept because the
   * arithmetic is wrong rather than merely unused without it: a box drawn a
   * fifth larger than the card it is round is a bracket floating off all four
   * sides, and something asking for a frame on a card that is not popped should
   * get a frame on the card that is there.
   */
  cardBox(card) {
    const w = card.cardW || 0;
    const h = card.cardH || 0;
    // Before the row's first resize a card has no size at all, and a frame
    // round nothing is a bracket in the corner of the screen.
    if (!w || !h) return null;

    const k = card.ready ? CARD_READY : card.scale.x || 1;
    const cw = w * k;
    const ch = h * k;
    const pad = w * CARD_PAD;
    return {
      x: card.x - cw / 2 - pad,
      y: card.y - ch / 2 - pad,
      w: cw + pad * 2,
      h: ch + pad * 2,
      // The card's own corner, so the drawn fallback traces the card instead of
      // putting a capsule round it: a box twice as tall as it is wide, taken at
      // the stadium radius the board's marks want, comes out an oval. Same
      // fraction HeroCard.resize falls back to — see art/heroes.js.
      r: Math.min(cw, ch) * 0.18,
    };
  }

  drawCard(card, type, color) {
    this.last = { card, type, color };
    const w = card.cardW || 0;
    const box = this.cardBox(card);
    if (!box) return;

    if (this.cardAt) {
      this.cardAt.x = card.x;
      this.cardAt.y = card.y;
    } else {
      this.cardAt = { x: card.x, y: card.y };
    }

    // The light on the card, and the board goes dark behind it. That is the
    // whole argument for this lesson existing: a player three quarters of the
    // way through a run has been looking at the board and nowhere else, and the
    // row underneath it is the one place on screen they have never once looked.
    //
    // Whether the dark comes at all is `opening` — see reaim, which is where
    // that is decided and why. In the opening demo it does, and deep: the card
    // beat and the board beat are two halves of one sentence, and a scrim that
    // lifted between them would flash the whole screen twice a loop. Mid-fight
    // — Coach.playCard, off Director.teachUlt — it does not come at all. That
    // one lands over a boss bar and a doom clock the player is reading, and the
    // frame on the card says which card without dimming the fight to do it.
    this.focus = { card, type };
    this.reaim();

    // Measured off the card's width rather than a board cell's: it is what the
    // stroked fallback weights its line against, and a card is about three
    // quarters of a cell.
    this.paint([box], null, type, color, w);
  }

  /**
   * One pass. Bails at every await if the lesson has been retired.
   *
   * @param {boolean=} cold the opening pass — see play() and COLD_BEAT.
   */
  async lesson(id, board, hand, shape, cold = false) {
    const { from, to, run, rest } = shape;
    const type = board.typeAt(from.r, from.c);
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    // The light goes on before the first mark does, round everything this pass
    // is going to touch: the pair, the stone that travels, the cell it travels
    // to and the run the two of them make. All four at once and not a beat at a
    // time — the hole is a light on the move, and a move is the whole of that,
    // so it is placed once here and then holds still while the lesson happens
    // inside it. `to` is in there on its own account: on a swap that completes
    // its run at the far end the traveller lands outside every cell of it, and
    // a light that stopped at the run would push the gem out of its own hole
    // halfway through beat three.
    this.spotOn(board, rest.concat([from, to], run), type);

    // The travelling stone's element. It is what the arrow and the hand wear,
    // because they are the two marks that are *about* the stone that moves, and
    // it is what a mark falls back to when the gem under it has no element of
    // its own — an encased cell. Every frame otherwise wears the gem it is
    // drawn round; draw() reads that off the board a cell at a time.
    const show = (step) => this.draw(board, { type, color, ...step });

    // 1. What is already lined up. Up from nothing on the first pass and from
    //    REST_ALPHA on every one after it, which is why the alpha is not reset
    //    here: the marks were never all the way off.
    show({ lit: rest });
    if (cold) {
      // There is nothing to fade up from. This is the first thing the creative
      // puts on the screen, and a fade is a fifth of a second of the player
      // looking at a board with nothing on it — which is the exact state the
      // hint exists to get out of. The tweens are killed first for the reason
      // stop() kills them: an alpha written under a live tween is written back
      // over on the next frame.
      killTweensOf(this);
      this.alpha = 1;
    } else {
      await tween(this, { alpha: 1 }, 0.2);
      if (id !== this.token) return;
    }
    await delay(cold ? COLD_BEAT : 0.28);
    if (id !== this.token) return;

    // 2. The one that completes it, and which way it goes.
    //
    //    `from` is already in `rest` whenever the swap finishes a run at both
    //    ends: the traveller's own cell is part of the run the *other* stone
    //    makes when it arrives there. Adding it again stacks a second frame
    //    exactly on the first, which is one bracket drawn twice — brighter than
    //    every other mark on the board, for no reason a player could read.
    const lit = rest.some((cell) => same(cell, from))
      ? rest
      : rest.concat([from]);
    show({ lit, from, to });
    await delay(cold ? COLD_BEAT : 0.34);
    if (id !== this.token) return;

    // 3. The move, hand and stone together. The hand refuses the demo outright
    //    if the player's own finger already has the prop, and that is the
    //    right answer: somebody touching the board does not need the lesson.
    const a = board.cellPos(from.r, from.c);
    const b = board.cellPos(to.r, to.c);
    // The same element the frames and the arrow are wearing this pass. Set
    // before the hand is asked for, so it arrives already the right colour
    // rather than changing to it in front of the player.
    hand.setElement(type);
    const grip = await hand.reach(board.x + a.x, board.y + a.y);
    if (!grip || id !== this.token) return;

    // The board is asked once more, in the same tick the travel starts — the
    // reach above took a third of a second, and a boss turn fits inside that.
    // previewSwap refuses a busy or blocked board on its first line and returns
    // false immediately, while Promise.all below would still run the hand's
    // full 0.4s slide beside it: a finger dragging a stone that never moves,
    // which is the one thing this whole file exists so as not to show.
    if (
      board.busy ||
      board.isLocked(from.r, from.c) ||
      board.isLocked(to.r, to.c)
    ) {
      hand.leave(grip);
      return;
    }

    show({ lit: rest });
    const [, moved] = await Promise.all([
      hand.slideTo(grip, board.x + b.x, board.y + b.y, TRAVEL),
      board.previewSwap(from, to, TRAVEL),
    ]);
    if (id !== this.token) return;
    if (!moved) {
      hand.leave(grip);
      return;
    }

    // 4. Three of a kind, joined up and held — one frame per run rather than
    //    one round the lot, because a swap can finish two runs at once and two
    //    runs are not one thing and not one colour. See straightRuns.
    //
    //    The board is swapped on screen and not in the model — that is the
    //    whole of what previewSwap does — so the two travelling cells are asked
    //    about the other way round, or every run the swap actually made would
    //    be measured against the colours that were there before it.
    const landed = (r, c) => {
      if (r === from.r && c === from.c) return board.typeAt(to.r, to.c);
      if (r === to.r && c === to.c) return board.typeAt(from.r, from.c);
      return board.typeAt(r, c);
    };
    show({ lit: run, joined: straightRuns(run, landed) });
    await delay(HOLD);
    if (id !== this.token) return;

    // 5. Put the board back the way the model has always had it — and leave
    //    the pair lit underneath while the lesson waits to say it again.
    hand.leave(grip);
    show({ lit: rest });
    await board.previewSwap(from, to, RETURN, true);
    if (id !== this.token) return;
    await tween(this, { alpha: REST_ALPHA }, 0.22);
  }

  /**
   * Place every mark for one beat.
   *
   * The layout is worked out once, as boxes on screen, and then either worn as
   * painted sprites or stroked in Graphics. Both routes get the same boxes, so
   * a device that could not decode the art gets the lesson in the same places
   * — only plainer.
   *
   * @param {object} board
   * @param {object} step
   *   `lit`    cells to frame
   *   `joined` the finished runs — straightRuns entries, each of which gets one
   *            frame round the whole of it, in its own element, instead of its
   *            cells being framed one by one
   *   `from`/`to` point the travel arrow between these two
   *   `type`   the element, which picks the painted set
   *   `color`  the element's own light, which the fallback strokes with
   */
  draw(board, step) {
    // Kept for resize(), which has no other way of knowing which of the five
    // beats is the one on screen.
    this.last = { board, step };
    const size = board.cell;
    const at = (cell) => {
      const p = board.cellPos(cell.r, cell.c);
      return { x: board.x + p.x, y: board.y + p.y };
    };

    const joined = step.joined && step.joined.length ? step.joined : null;
    const inRun = (cell) =>
      !!joined &&
      joined.some((group) =>
        group.cells.some((j) => j.r === cell.r && j.c === cell.c),
      );

    const span = size * FRAME_SPAN;
    const boxes = [];

    // One frame round each finished run, so three gems read as the one thing
    // the player just made rather than as three things that happen to be lit —
    // and so two runs finished by the one swap read as two things and not as
    // one box with both of them and the gems between them inside it. It is the
    // same frame as a single gem wears, pulled along the run — which is what
    // the nine-slice is for.
    //
    // Each in its own element rather than in the traveller's: a run is made of
    // the colour it is made of, and the frame saying otherwise was the whole of
    // what looked wrong about a double match.
    (joined || []).forEach((group) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      group.cells.forEach((cell) => {
        const p = at(cell);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      });
      boxes.push({
        x: x0 - span / 2,
        y: y0 - span / 2,
        w: x1 - x0 + span,
        h: y1 - y0 + span,
        type: group.type,
        color:
          GEM_LIGHT[group.type] === undefined
            ? step.color
            : GEM_LIGHT[group.type],
      });
    });

    // A gem already inside a run's frame does not get one of its own: it is
    // framed, and a second frame inside the first is two marks for one fact.
    //
    // Each in its own element, like the run frames and for the same reason.
    // Every mark used to wear the one colour a beat — the travelling gem's —
    // which is right for the arrow and right for the hand, because those *are*
    // the stone that moves, and wrong for every frame that is not on it. A swap
    // that finishes two runs lights the far run's gems in the traveller's
    // colour, so three water gems sat in arcane brackets; a bracket that
    // disagrees with the gem inside it reads as a mark drawn in the wrong place
    // rather than as a hint about that gem.
    (step.lit || []).forEach((cell) => {
      if (inRun(cell)) return;
      const p = at(cell);
      // typeAt is -1 for an encased cell, which has no painted set of its own.
      // That one keeps the beat's element instead: the alternative is paint()
      // finding a box it has no art for and standing the entire lesson down to
      // the stroked fallback over a single gem the boss happened to bury.
      const type = board.typeAt(cell.r, cell.c);
      const el = type < 0 ? step.type : type;
      boxes.push({
        x: p.x - span / 2,
        y: p.y - span / 2,
        w: span,
        h: span,
        type: el,
        color: GEM_LIGHT[el] === undefined ? step.color : GEM_LIGHT[el],
      });
    });

    // The pointer, on the seam the stone is about to cross. Only ever placed
    // before it does: once the gem is moving it is sitting on this exact spot,
    // and an arrow under a gem is a smudge.
    let arrow = null;
    if (step.from && step.to) {
      const p = at(step.from);
      const q = at(step.to);
      arrow = {
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
        // Adjacent cells only, so this is a quarter turn or a half one and the
        // packed arrow — which points right — covers all four directions.
        rotation: Math.atan2(q.y - p.y, q.x - p.x),
        length: size * ARROW_SPAN,
      };
    }

    this.paint(boxes, arrow, step.type, step.color, size);
  }

  /**
   * Put one set of boxes on screen: painted where the art allows, stroked where
   * it does not.
   *
   * The one door to the marks, so both lessons come through it and a device
   * that could not decode the sheet gets them both plainly rather than getting
   * one of them not at all.
   *
   * Asked about this element, not about the set as a whole. Board.typeAt
   * reports -1 for an encased cell, and the boss can encase one between the
   * hint being solved and the beat being drawn — wear() would find no art for
   * -1, quietly draw nothing, and leave the lesson miming over a bare board.
   * The stroked marks do not care what element it is.
   *
   * A box may name an element of its own — the run frames do, so a double
   * match wears one set per colour — and every one of those has to have art
   * too. All or nothing per beat, for the reason loadHintMarks is all or
   * nothing: half a lesson in painted frames and half in stroked rings looks
   * like a bug rather than like a fallback.
   *
   * @param {object[]} boxes what to frame, in this container's coordinates;
   *   `type` and `color` on a box override the beat's own
   * @param {object} arrow the pointer, or null when there is nowhere to point
   * @param {number} type the element, which picks the painted set
   * @param {number} color the element's light, for the fallback
   * @param {number} size what the fallback weights its line against
   */
  paint(boxes, arrow, type, color, size) {
    const ready =
      hintMarksReady(type) &&
      boxes.every((box) => box.type === undefined || hintMarksReady(box.type));
    if (ready) this.wear(type, boxes, arrow);
    else this.stroke(boxes, arrow, color, size);
  }

  /**
   * The painted marks: a frame on each box and the arrow on the seam.
   *
   * Sprites are kept and reused rather than rebuilt, because a lesson redraws
   * five times a pass and loops until it is stopped.
   *
   * They are pooled per element rather than per slot. One beat now carries as
   * many colours as it has gems in it, and which colour lands in which slot
   * changes from beat to beat — the pair, then the pair and the traveller, then
   * the finished runs — so a pool indexed by position would be throwing a
   * sprite away and building another one on nearly every draw. Indexed by
   * element it settles after the first pass and never allocates again: the beat
   * asks for two water frames and one arcane, and gets the same three sprites
   * it got last time round.
   *
   * The whole kit is still torn down when the *lesson's* element changes, which
   * is the arrow's element and happens only when a new hint picks a different
   * traveller.
   */
  wear(type, boxes, arrow) {
    this.marks.clear();

    if (!this.painted || this.painted.type !== type) {
      // The textures are shared and stay; only the views go. Sprite.destroy()
      // with nothing passed leaves the texture alone, which is what the next
      // lesson on this element will want. `painted` is dropped before anything
      // can throw, so clearMarks() is never left holding a destroyed sprite.
      this.kit.removeChildren().forEach((child) => child.destroy());
      this.painted = null;
      const pointer = hintArrowSprite(type);
      if (!pointer) return;
      this.painted = { type, pool: new Map(), used: [], arrow: pointer };
      this.kit.addChild(pointer);
    }
    const kit = this.painted;

    // Last beat's frames go down before this one's go up — all of them, because
    // this beat may want fewer, or the same number in different colours. They
    // are only hidden; the pool keeps them.
    kit.used.forEach((frame) => (frame.visible = false));
    kit.used = [];

    // How many of each element this beat has already placed, so two water boxes
    // take the pool's first two water frames rather than both taking the first.
    const taken = new Map();

    boxes.forEach((box) => {
      const el = box.type === undefined ? kit.type : box.type;
      const n = taken.get(el) || 0;
      taken.set(el, n + 1);

      let free = kit.pool.get(el);
      if (!free) kit.pool.set(el, (free = []));
      if (!free[n]) {
        const made = hintFrameSprite(el);
        if (!made) return;
        free[n] = made;
        this.kit.addChild(made);
      }
      const frame = free[n];
      frame.visible = true;
      // Sized in the art's own pixels with the scale carrying the rest, so the
      // corner slices land the same size on both axes and every extra point of
      // a run's length is spent on the empty middle. Same trick as the hero
      // cards' frames — see art/cardframe.js.
      const k = Math.min(box.w, box.h) / frame.texture.width;
      frame.scale.set(k);
      frame.setSize(box.w / k, box.h / k);
      frame.x = box.x;
      frame.y = box.y;
      kit.used.push(frame);
    });

    // Back on top of every frame placed above, which is what addChild does to a
    // child it already has. The arrow is the one mark allowed to sit over
    // anything: it is pointing at a gem that is inside a frame.
    this.kit.addChild(kit.arrow);
    kit.arrow.visible = !!arrow;
    if (arrow) {
      const scale = arrow.length / kit.arrow.texture.width;
      kit.arrow.scale.set(scale);
      kit.arrow.rotation = arrow.rotation;
      kit.arrow.x = arrow.x;
      kit.arrow.y = arrow.y;
    }
  }

  /**
   * The fallback: the same lesson stroked in Graphics.
   *
   * Round, and measured off the gem rather than off the cell. GemView.resize
   * fits every disc to 0.86 of a cell, so the art has a radius of 0.43 and the
   * ring clears it by a hair.
   *
   * Every mark is struck twice — once in black, a little wider, then once in
   * the element's own light on top. GEM_LIGHT is a set of pale pastels, and
   * this runs over gold and violet discs as often as over the dark board, so a
   * single coloured line has stretches where it carries no contrast at all.
   */
  stroke(boxes, arrow, color, size) {
    const g = this.marks;
    const weight = Math.max(2, size * 0.042);
    const shadow = { width: weight * 1.9, color: 0x000000, alpha: 0.42 };

    this.clearMarks();

    boxes.forEach((box) => {
      // Per box, not per beat: the run frames carry their own element, so a
      // swap that finishes two runs strokes each in the colour it is made of
      // here exactly as the painted marks do.
      const light = {
        width: weight,
        color: box.color === undefined ? color : box.color,
        alpha: 0.92,
      };
      // Inset by the shadow it carries, so a ring on one cell of a lit pair
      // stops short of the ring on the other. The painted frame does not need
      // this — its brackets are open where a ring is closed, and two of them
      // meeting at a seam reads as a pair rather than as a collision.
      const pad = shadow.width / 2;
      const w = box.w - pad * 2;
      const h = box.h - pad * 2;
      // Cornered at half its own thickness a box comes out a stadium, which on
      // a single cell is the ring round one gem and on a run is that ring at
      // both ends with the line between them filled in. A box that asked for a
      // corner of its own gets that instead — the hero cards do, because a card
      // is twice as tall as it is wide and the stadium on that is an oval.
      const r =
        box.r === undefined
          ? Math.min(w, h) / 2
          : Math.min(box.r, w / 2, h / 2);
      g.roundRect(box.x + pad, box.y + pad, w, h, r);
      g.stroke(shadow);
      g.roundRect(box.x + pad, box.y + pad, w, h, r);
      g.stroke(light);
    });

    if (!arrow) return;

    // A filled dart with a dark rim, because the seam is half one gem and half
    // the next and the arrow has to survive both.
    const ux = Math.cos(arrow.rotation);
    const uy = Math.sin(arrow.rotation);
    // `along` runs with the travel and `across` square to it, so one set of
    // numbers draws the arrow whichever of the four ways the stone goes.
    const point = (along, across) => ({
      x: arrow.x + ux * along - uy * across,
      y: arrow.y + uy * along + ux * across,
    });
    const len = arrow.length * 0.45;
    const wing = arrow.length * 0.26;
    const tip = point(len, 0);
    const right = point(-len * 0.55, wing);
    const notch = point(-len * 0.2, 0);
    const left = point(-len * 0.55, -wing);
    const dart = [
      tip.x,
      tip.y,
      right.x,
      right.y,
      notch.x,
      notch.y,
      left.x,
      left.y,
    ];
    // Closed explicitly. Polygon defaults closePath to true, but ShapePath
    // assigns whatever poly() was handed straight over the top of that, so
    // leaving the argument off sets it to undefined and the stroke comes back
    // open — a dart with one wing unattached to the tip.
    g.poly(dart, true);
    g.stroke({
      width: weight * 2.2,
      color: 0x000000,
      alpha: 0.5,
      join: "round",
    });
    g.poly(dart, true);
    g.fill({ color: 0xffffff, alpha: 0.97 });
  }
}
