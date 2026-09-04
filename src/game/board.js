/**
 * The 5x5 board: model, view and input in one place.
 *
 * It used to run on soft rails — a hand-stacked opening whose obvious move was
 * the scripted one, and a planter that rewrote refilled gems until the cascade
 * hit the length the storyboard had promised. Both are gone: the opening is
 * dealt fresh every run and whatever cascade happens is the one the player
 * actually earned.
 *
 * What the board still guarantees is only that it is playable: never a
 * ready-made match sitting on a refill, and never fewer than MIN_SWAPS moves
 * available — because the boss spends every turn taking one of them. That is a
 * fairness floor, not a script.
 */

import { Container, Graphics, Rectangle } from "pixi.js";
import { COLS, ROWS, START_BOARD, GEM_COLORS, DIFFICULTY } from "../config.js";
import { GemView } from "../art/gems.js";
import { ObsidianView } from "../art/obsidian.js";
import {
  boardFrameSprite,
  fitBoardFrame,
  FRAME_ART,
  FRAME_OPENING,
} from "../art/boardframe.js";
import { tween, delay, Ease, killTweensOf, now, punch } from "../core/tween.js";
import { rndInt } from "../core/rng.js";
import * as sfx from "../audio/sfx.js";

const GEM_TYPES = GEM_COLORS.length;
const SWIPE_RATIO = 0.34;

/**
 * How long a swap takes, and how long it takes to come back.
 *
 * The one animation the player's own hand authors, so it is the one that may
 * not read as a cut. It ran in 0.15s: a stone crossing a hundred-point cell in
 * nine frames, which is over before the eye has followed it and lands as a
 * jump rather than as a move. The lesson shows that exact travel over 0.4s,
 * which is most of why the tutorial read as smooth while the real thing did
 * not. 0.22 is the middle — still ahead of the finger coming off the glass,
 * long enough to be followed across the cell.
 *
 * The revert is a shade quicker. Same distance the other way, and the player
 * already knows what happened, so it does not need the same room — but it is
 * not allowed to be a snap either: a swap that fails in a fifth of the time it
 * succeeded in reads as the board slapping the stone back.
 */
const SWAP_TIME = 0.22;
const REVERT_TIME = 0.2;

/** How long the shown board takes to slide back onto the model's cells. */
const PREVIEW_HOME = 0.18;

/**
 * How far the stones follow the finger before the swipe commits, in cells.
 *
 * The board's last cut, and the one that was never going to be spotted as a
 * cut because it looks like nothing at all: the stone under the finger did not
 * move. A gesture crossed a third of a cell with the whole grid sitting
 * perfectly still, the threshold tripped, and only then did anything travel —
 * so the first third of every swipe was the board ignoring the player and the
 * rest was the board catching up. The tutorial hand rode the finger from the
 * first pixel while the stone it was holding sat still, which is the version
 * of this that is hardest to unsee once noticed.
 *
 * So the pair leans. One to one with the finger, both stones together, along
 * the one axis the swipe can commit to, capped just short of the SWIPE_RATIO
 * that fires it. What that buys is not the two dozen pixels of travel — it is
 * that the swap then starts from where the stones already are, so there is no
 * frame anywhere in a move where anything is in a place the finger did not put
 * it.
 */
const LEAN_MAX = 0.3;

/**
 * What a stone gives when the finger drags it at nothing.
 *
 * The edge of the board, or a neighbour the boss has encased. A tenth of a
 * cell is a stone that answers and does not go, which is the difference
 * between a board that refused the swipe and a board that never felt it.
 */
const LEAN_REFUSE = 0.1;

/** How long a lean the player did not spend takes to settle back. */
const LEAN_HOME = 0.14;

/**
 * How closely a leaning stone chases the finger, as a time constant.
 *
 * The finger's own position, written straight onto the stone, is the version
 * of this with no lag in it at all — and it is the wrong one, because it is
 * also a teleport waiting for a reason. The stone is not always in its socket
 * when the finger takes hold of it: the pair from a cancelled lesson is still
 * gliding home, an abandoned gesture's stone is still settling back, and a
 * finger that turns a corner leaves an offset on the axis it just gave up.
 * Each of those is a jump of up to a whole cell, written on the one frame the
 * player is guaranteed to be looking at the stone.
 *
 * Chased instead, and the whole family of them stops existing: two hundredths
 * of a second is half the remaining distance every frame at 60Hz, so a stone
 * closes on anything within three or four frames and there is no discontinuity
 * anywhere in the gesture. What it costs is about a frame and a half of lag
 * behind a fast flick, which is a stone that has weight rather than a stone
 * that is glued to the glass — and a flick that outruns it hands the travel
 * straight over to the swap, which is what should be animating a flick anyway.
 */
const LEAN_CHASE = 0.022;

/**
 * How far ahead the other axis has to be before a gesture changes its mind.
 *
 * A finger travelling diagonally crosses the x == y line several times on the
 * way, and picking the dominant axis fresh every frame made the pair flick
 * between two directions. Once a direction is chosen it is defended: the other
 * axis has to be clearly ahead, not merely ahead. The swipe then commits to
 * the direction the stones were already leaning in, which is the only reason
 * the lean is allowed to decide this at all.
 */
const LEAN_HYST = 1.4;

/** The swell of a cleared stone, and its collapse. */
const POP_SWELL = 0.1;
const POP_COLLAPSE = 0.17;

/**
 * How much of that collapse the board waits out before it drops the stones
 * above into the hole.
 *
 * The pop and the collapse used to be strictly in sequence — every stone gone
 * to the last frame of its shrink, and only then did anything fall. Which is
 * a beat of stillness in the middle of the one moment the genre is built on,
 * and a cascade made of those reads as a list of steps rather than as a board
 * coming apart. At six tenths the cleared stone is a speck at seven percent of
 * its size and half faded; the stones above it are already moving, and the
 * clear and the collapse are one event again.
 */
const POP_HANDOVER = 0.6;

/**
 * Spare stones kept in the pool.
 *
 * A refill takes gems out of the pool and a clear puts them back, and the two
 * used to be exactly in step because the collapse waited for the last frame of
 * the pop. They are not in step any more — see POP_HANDOVER — so for a tenth
 * of a second in the middle of every cascade the pool is empty and obtainGem
 * builds GemViews instead: a Graphics, a Sprite and a texture lookup apiece,
 * on the exact frame the eye is following stones down the board. Eight is more
 * than any one rung of a cascade can ask for.
 */
const POOL_SPARE = 8;

/** Stand-in dropped into `locks` while the boss is looking ahead. */
const PROBE = { probe: true };

/**
 * Legal swaps the board owes the player at all times.
 *
 * Two, not one. The boss spends every turn burying one of the player's options,
 * and a board that only ever guaranteed a single move would hand it the last
 * one — leaving a dead board that then has to be reshuffled out from under the
 * player. Two is the floor that makes "he takes one of your ideas" a threat
 * rather than a softlock.
 */
export const MIN_SWAPS = 2;

/**
 * What a reshuffle aims to leave behind, as opposed to what it owes.
 *
 * The search used to stop at the first arrangement that cleared MIN_SWAPS,
 * which parked the board back on the exact edge it had just fallen off: the
 * boss's next block knocked it straight over again and the player watched the
 * screen mix itself two and three times in a row. Four is headroom — enough
 * that a wave of obsidian, or a cascade that eats half the board, costs the
 * player options without costing them the board.
 */
const SHUFFLE_TARGET = 4;

/**
 * Seconds between one reshuffle and the next.
 *
 * Only a board with no move at all is allowed to ignore this. Everything else
 * — the one-move board that is tight rather than dead — waits, because two
 * mixes inside a second do not read as two events. They read as the game
 * having a fit, and a mechanic the player cannot separate into beats is a
 * mechanic they cannot learn to expect.
 */
const SHUFFLE_GAP = 2.0;

/** The wind-up before the stones move, and the beat they land on. */
const SHUFFLE_TELL = 0.22;
const SHUFFLE_SETTLE = 0.16;

/**
 * Alternating cell wash: a 5x5 still has to read as a grid.
 *
 * Light, where every version of this before it was dark. The basalt field was
 * bright where it cracked and the jewelled field was navy, so both could be
 * divided into cells by shading them — but the plate's field is very nearly
 * black, and there is nothing left under it to take away. So the checker is put
 * in rather than taken out, in the rule's own gold so that the board reads as one
 * prop, and at an alpha that divides the cells without lighting them.
 */
const CELL_TINT = [0.07, 0.02];
const CELL_WASH = 0xe5ce8a;

export class Board extends Container {
  constructor() {
    super();
    globalThis.__board = this; // PROBE

    /** Painted frame, or null when the art failed to decode. */
    this.plate = boardFrameSprite();
    if (this.plate) this.addChild(this.plate);

    this.frame = new Graphics();
    this.addChild(this.frame);

    /**
     * Gems and the blocks that trap them are masked to the frame's opening:
     * refills drop in from a cell and a half above the top row, and over a
     * painted border that has to read as falling out from behind the stone
     * rather than sliding across it.
     */
    this.field = new Container();
    this.addChild(this.field);

    this.gemLayer = new Container();
    this.field.addChild(this.gemLayer);

    /** Obsidian sits above the gems it traps. */
    this.lockLayer = new Container();
    this.field.addChild(this.lockLayer);

    this.fieldMask = new Graphics();
    this.addChild(this.fieldMask);
    this.field.mask = this.fieldMask;

    this.grid = [];
    /** locks[r][c] = ObsidianView while that cell is encased, else null. */
    this.locks = [];
    this.pool = [];
    this.cell = 64;
    this.size = 320;
    /** Top-left of the play grid in board-local space — inside the frame. */
    this.originX = 0;
    this.originY = 0;

    this.inputEnabled = false;
    this.moveResolver = null;
    /**
     * A swap the player committed while nothing was waiting on one, or null.
     *
     * The board takes input from the first frame drawn now — the start prompt
     * is a caption, not a gate, and the fight's opening beat is an animation
     * the player watches rather than one they wait through. Both of those
     * leave a window where a real swipe can land before `waitForMove` has
     * installed a resolver for it, and a swap that matched has already moved
     * the model: dropping it would leave a standing match on the board that
     * nothing is ever going to resolve.
     *
     * So it is held here instead, and the next `waitForMove` is answered with
     * it on the spot. Never cleared by `lockInput` or `cancelWait` for the
     * same reason it exists — the grid is already in the state this describes.
     */
    this.pendingMove = null;
    /** Resolvers handed out by whenQuiet, answered when the board lets go. */
    this.quiet = [];
    this.busy = false;
    /** Game-clock stamp of the last reshuffle — see SHUFFLE_GAP. */
    this.lastShuffle = -Infinity;
    /**
     * The swap the opening lesson is showing but has not made, or null.
     *
     * A preview is a lie the board is telling on purpose: two gems are drawn
     * on each other's cells while the model has them exactly where it always
     * did. Everything that writes the grid cancels it first, because the one
     * thing worse than not teaching the player is teaching them a board that
     * is not the board. See previewSwap.
     */
    this.preview = null;
    this.previewToken = 0;

    /** Hooks the director subscribes to. */
    this.onPop = null;
    this.onInvalid = null;
    this.onInteract = null;
    /**
     * The player's own touch, in board-local pixels, so the tutorial hand can
     * ride it — down, moved, and let go. Separate from `onInteract`, which fires
     * once to say somebody is playing and carries nothing about where.
     */
    this.onTouchStart = null;
    this.onTouchMove = null;
    this.onTouchEnd = null;
    this.onShatter = null;
    this.onShuffle = null;

    this.eventMode = "static";
    this.hitArea = new Rectangle(0, 0, this.size, this.size);
    this.on("pointerdown", this.handleDown, this);
    this.on("pointermove", this.handleMove, this);
    this.on("pointerup", this.handleUp, this);
    this.on("pointerupoutside", this.handleUp, this);

    this.drag = null;
    this.selected = null;
    /** The stone the finger is currently holding down — see press(). */
    this.pressed = null;
    /**
     * The pair the finger is currently pulling apart, or null — see leanTo.
     *
     * Holds the cells it borrowed the stones from rather than the positions it
     * moved them to, so putting them back asks the model where they belong
     * instead of trusting a point read half a gesture ago.
     */
    this.lean = null;

    this.build();
    this.prewarm();
  }

  /* ------------------------------------------------------------ model init */

  /**
   * Deal the opening board.
   *
   * A fresh random deal every run — see DIFFICULTY.randomOpening. The deal is
   * rejected and retried until it has no free match sitting on it and offers
   * the same MIN_SWAPS the board owes at every other moment, so the boss can
   * take an option on turn one without leaving the player stranded.
   *
   * The hand-authored START_BOARD is the opt-in now, kept for the runs that
   * have to be reproducible: it guarantees the tutorial swap is the most
   * obvious move on screen and that the board a viewer sees is the board
   * everybody else saw. It is also the fallback below, for the deal that never
   * comes good.
   */
  build() {
    for (let r = 0; r < ROWS; r++) {
      this.grid[r] = [];
      this.locks[r] = [];
      for (let c = 0; c < COLS; c++) {
        const gem = new GemView(0);
        this.gemLayer.addChild(gem);
        this.grid[r][c] = gem;
        this.locks[r][c] = null;
      }
    }

    if (!DIFFICULTY.randomOpening) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++)
          this.grid[r][c].setType(START_BOARD[r][c]);
      }
      return;
    }

    for (let attempt = 0; attempt < 60; attempt++) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          this.grid[r][c].setType(rndInt(GEM_TYPES));
        }
      }
      if (this.findMatches().length === 0 && this.countSwaps() >= MIN_SWAPS) {
        return;
      }
    }
    // 60 bad deals in a row is not a thing that happens, but a board is still
    // owed to the player if it does.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) this.grid[r][c].setType(START_BOARD[r][c]);
    }
  }

  /**
   * Put spare stones in the pool before anything needs one.
   *
   * Built at boot, where a few objects cost nothing, rather than during the
   * first cascade that outruns its own recycling. See POOL_SPARE.
   */
  prewarm() {
    for (let i = 0; i < POOL_SPARE; i++) {
      const gem = new GemView(0);
      gem.visible = false;
      this.gemLayer.addChild(gem);
      this.pool.push(gem);
    }
  }

  isLocked(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.locks[r][c] !== null;
  }

  hasObsidian() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (this.locks[r][c]) return true;
    }
    return false;
  }

  obtainGem(type) {
    const gem = this.pool.pop();
    if (gem) {
      gem.setType(type);
      gem.alpha = 1;
      gem.scale.set(1);
      // Cleared with a quarter turn on it now — see popCells — and a pool that
      // hands the tilt back out is a board that slowly fills up with crooked
      // stones.
      gem.rotation = 0;
      gem.visible = true;
      gem.resize(this.cell);
      return gem;
    }
    const fresh = new GemView(type);
    fresh.resize(this.cell);
    this.gemLayer.addChild(fresh);
    return fresh;
  }

  recycle(gem) {
    gem.visible = false;
    gem.glow.alpha = 0;
    // The swell a swap puts on a stone outlives a cancelled preview by design
    // — it always settles back at 1 — but a stone recycled inside that window
    // would be dealt back out with a tween still writing to its scale, and
    // whatever obtainGem set would be overwritten on the next frame.
    killTweensOf(gem.scale);
    this.pool.push(gem);
  }

  /* ---------------------------------------------------------------- layout */

  resize(layout) {
    this.size = layout.board.size;
    this.x = layout.board.x;
    this.y = layout.board.y;
    this.hitArea = new Rectangle(0, 0, this.size, this.size);

    this.fitFrame();
    this.drawFrame();

    // An orientation flip can land mid-cascade: cancel any in-flight motion
    // and snap gems to their cells rather than letting stale tween targets win.
    // That includes a lesson in progress, which is drawn from cell positions
    // that have just moved underneath it.
    this.preview = null;
    this.previewToken++;
    // Whatever the finger was holding, it is not holding it at this size.
    this.lean = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem) continue;
        killTweensOf(gem);
        gem.resize(this.cell);
        const p = this.cellPos(r, c);
        gem.x = p.x;
        gem.y = p.y;

        const lock = this.locks[r][c];
        if (lock) {
          lock.resize(this.cell);
          lock.x = p.x;
          lock.y = p.y;
        }
      }
    }
    this.pool.forEach((g) => g.resize(this.cell));
  }

  /**
   * Sit the frame in the square the layout allots, then hand the grid whatever
   * the opening leaves.
   *
   * The frame is not quite square and neither is its opening — it is a painted
   * prop, not a shape — so each axis is scaled by what its own side of the
   * opening asks for, and the larger of the two decides how big a square grid
   * fits. The difference between the axes is a fraction of a percent, which is
   * invisible in the ornament and would be a visible misalignment in the grid.
   */
  fitFrame() {
    if (!this.plate) {
      this.originX = 0;
      this.originY = 0;
      this.cell = this.size / COLS;
      return;
    }

    // Largest square grid whose frame still fits the box, in both axes.
    const span =
      this.size /
      Math.max(FRAME_ART.w / FRAME_OPENING.w, FRAME_ART.h / FRAME_OPENING.h);
    const sx = span / FRAME_OPENING.w;
    const sy = span / FRAME_OPENING.h;
    const fw = FRAME_ART.w * sx;
    const fh = FRAME_ART.h * sy;

    fitBoardFrame(
      this.plate,
      (this.size - fw) / 2,
      (this.size - fh) / 2,
      fw,
      fh,
    );

    this.originX = this.plate.x + FRAME_OPENING.x * sx;
    this.originY = this.plate.y + FRAME_OPENING.y * sy;
    this.cell = span / COLS;
  }

  drawFrame() {
    const g = this.frame;
    const cell = this.cell;
    const span = cell * COLS;
    g.clear();

    // A hair wider than the grid so a popping gem's glow is not shaved off at
    // the outer cells; the slack lands on the frame's inner bevel, not on it.
    const bleed = cell * 0.09;
    this.fieldMask.clear();
    this.fieldMask.roundRect(
      this.originX - bleed,
      this.originY - bleed,
      span + bleed * 2,
      span + bleed * 2,
      cell * 0.2,
    );
    this.fieldMask.fill({ color: 0xffffff });

    if (!this.plate) {
      // The drawn panel the board shipped with, kept as the fallback: a device
      // that cannot decode the frame art still gets a board it can read.
      const pad = cell * 0.09;
      g.roundRect(-pad, -pad, span + pad * 2, span + pad * 2, cell * 0.26);
      g.fill({ color: 0x061131, alpha: 0.86 });
      g.stroke({
        width: Math.max(2, cell * 0.05),
        color: 0x2a5ad0,
        alpha: 0.9,
      });
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        /**
         * The tile is the gem's footprint, not the cell's.
         *
         * It sat at 0.06, which is to say 0.88 of a cell — and 0.88 of a cell
         * is also where the lesson's corner brackets are now drawn, see
         * FRAME_SPAN in ui/coach.js. Two different things at the same size on
         * the same square do not read as a frame round a gem; they read as one
         * thick muddled edge, with the brackets apparently clamped to the
         * corners of the tile rather than to the corners of anything on it.
         *
         * A gem is 0.86 of a cell — GemView.resize, art/gems.js — so this is a
         * little inside it: what is left of the tile once the disc is over it is
         * the four corners it shows past a circle, which is all the checker ever
         * needed to divide the cells. The brackets now stand a clear tenth of a
         * cell outside it and have the gem to themselves.
         */
        const inset = cell * 0.1;
        g.roundRect(
          this.originX + c * cell + inset,
          this.originY + r * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          // Pulled in with the box, so the tile keeps the corner it had rather
          // than turning into a lozenge at the smaller span.
          cell * 0.18,
        );
        g.fill(
          this.plate
            ? { color: CELL_WASH, alpha: CELL_TINT[(r + c) % 2] }
            : { color: (r + c) % 2 ? 0x101f47 : 0x0c1938, alpha: 0.9 },
        );
      }
    }
  }

  cellPos(r, c) {
    return {
      x: this.originX + (c + 0.5) * this.cell,
      y: this.originY + (r + 0.5) * this.cell,
    };
  }

  /** Board-local point -> cell, or null when outside. */
  cellAt(x, y) {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((y - this.originY) / this.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  /* ----------------------------------------------------------------- input */

  handleDown(e) {
    if (this.onInteract) this.onInteract();
    if (!this.inputEnabled) return;
    const p = e.getLocalPosition(this);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    this.drag = { start: cell, x: p.x, y: p.y, fired: false };
    this.press(cell);
    if (this.onTouchStart) this.onTouchStart(p.x, p.y);
  }

  /**
   * The stone under the finger, admitting the finger is there.
   *
   * The one animation in the creative the player is the author of, and there
   * was nothing here: a press moved a glow up behind the gem — see
   * clearSelection — and the gem itself did not budge, which on a touch screen
   * with no cursor is a board that cannot tell you whether it heard you. So it
   * is picked up: a tenth of its size on a fast overshoot, which at a hundred
   * point cell is a stone visibly lifted out of its socket.
   *
   * Held rather than sprung. Everything else in here is an impulse that decays,
   * because everything else in here is an event; a press is a state, and it
   * lasts exactly as long as the finger does.
   */
  press(cell) {
    this.letGo();
    // Not while the board is writing itself. A stone halfway through a
    // collapse is not the player's to pick up, and taking its scale over would
    // leave it wearing the shape its fall was in the middle of giving it.
    if (this.busy) return;
    if (this.locks[cell.r] && this.locks[cell.r][cell.c]) return;
    const gem = this.grid[cell.r][cell.c];
    if (!gem || gem.destroyed) return;
    this.pressed = gem;
    // Brought to the front for as long as the finger has it. A stone lifted a
    // tenth inside its own socket overlapped nothing and the display order
    // could be left alone; one that travels a third of a cell out of it passes
    // over the stone it is heading for, and the grid is dealt row by row — so
    // half the board would slide *under* its neighbour. Nothing in here reads
    // the child order: the grid holds the stones themselves, not indices.
    if (gem.parent) {
      gem.parent.setChildIndex(gem, gem.parent.children.length - 1);
    }
    killTweensOf(gem.scale);
    tween(gem.scale, { x: 1.1, y: 1.1 }, 0.1, { ease: Ease.backOutHard });
  }

  /**
   * Put back whatever the last press picked up.
   *
   * Deliberately not awaited and deliberately not conditional on the touch
   * having done anything: every path out of a touch comes through here — the
   * swipe that fired, the tap that selected, the finger that slid off the
   * board, the input lock that took the board away mid-drag — because a stone
   * left lifted is a stone that stays lifted for the rest of the run.
   *
   * `animateSwap` and `popCells` both take the scale over from here on their
   * first frame, so a stone that is on its way somewhere is never fought over.
   *
   * The size is only half of it now. A touch also leaves the pair standing
   * wherever the gesture last dragged them, and that is put back here too —
   * see homeLean.
   */
  letGo() {
    this.homeLean();
    const gem = this.pressed;
    this.pressed = null;
    if (!gem || gem.destroyed) return;
    killTweensOf(gem.scale);
    tween(gem.scale, { x: 1, y: 1 }, 0.16, { ease: Ease.backOut });
  }

  /**
   * Carry the pair the finger is dragging, and say which way it is going.
   *
   * Called from every pointermove before the swipe has committed to anything —
   * see LEAN_MAX for why the board is not allowed to sit still through that
   * part of a gesture. Positions are written rather than tweened: the finger
   * is the animation here, and a curve between the two is exactly the lag this
   * exists to take out.
   *
   * Both stones move, in opposite directions, along the one axis a swap can
   * happen on. A pair that leans is already saying what the swipe will do,
   * which is the same job the opening lesson does with a demo hand — except
   * this one is answering a gesture the player is making rather than proposing
   * one they are not.
   *
   * @returns {?{r:number,c:number}} the direction the swipe would commit to,
   *          or null while the gesture is still inside the deadzone
   */
  leanTo(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    // A finger that has not moved has no direction to have an opinion about.
    if (ax < 1 && ay < 1) return null;

    // Chosen once and then defended — see LEAN_HYST.
    const held = this.lean;
    const horiz = held
      ? held.horiz
        ? ay <= ax * LEAN_HYST
        : ax > ay * LEAN_HYST
      : ax > ay;
    const dir = horiz
      ? { r: 0, c: dx > 0 ? 1 : -1 }
      : { r: dy > 0 ? 1 : -1, c: 0 };

    const start = this.drag.start;
    const gem = this.pressed;
    // Nothing to carry: a press on a block, or on a board that is busy writing
    // itself. The swipe still gets its direction, because attemptSwap has an
    // answer for both — a nudge, and nothing at all, respectively.
    if (!gem || this.busy) return dir;

    const to = { r: start.r + dir.r, c: start.c + dir.c };
    const open =
      this.inBounds(to) &&
      !this.isLocked(start.r, start.c) &&
      !this.isLocked(to.r, to.c);
    const partner = open ? this.grid[to.r][to.c] : null;

    if (!held || held.gem !== gem) {
      /**
       * Only a stone that is home may be picked up.
       *
       * A lesson that has just been cancelled is still carrying its two stones
       * back — see glideGems — and for those two tenths of a second the model
       * and the screen disagree about which stone is standing on this cell.
       * The model is what press and this read, so leaning during that window
       * drags a gem in from a cell away while the one actually under the
       * finger sits still: the single worst thing the board could do with the
       * player's first ever touch, which is exactly when it would happen.
       *
       * Nothing is lost by waiting. The gesture leans a few frames later, on
       * the stone the player is looking at, and a swipe that fires before then
       * still moves the right pair into the right sockets — see animateSwap.
       */
      const at = this.cellPos(start.r, start.c);
      if (Math.hypot(gem.x - at.x, gem.y - at.y) > this.cell * 0.25) {
        return dir;
      }
      // A different stone: whatever the last gesture borrowed goes back before
      // this one picks anything up.
      this.homeLean();
      killTweensOf(gem);
      this.lean = {
        gem,
        cell: start,
        partner: null,
        pcell: null,
        horiz,
        off: 0,
      };
    }
    const lean = this.lean;
    lean.horiz = horiz;
    if (lean.partner !== partner) {
      // The finger turned a corner, or dragged onto a block. The stone the old
      // direction had borrowed is nobody's now.
      this.homeStone(lean.partner, lean.pcell);
      lean.partner = partner;
      lean.pcell = partner ? to : null;
      if (partner) killTweensOf(partner);
    }

    // Clamped rather than eased towards the cap: one to one with the finger is
    // the whole idea, and the cap sits four hundredths of a cell short of the
    // threshold that fires the swipe, so the flat part of it lasts a couple of
    // frames at most. Recorded rather than applied — the stones are carried
    // there a frame at a time by updateLean.
    const reach = this.cell * (partner ? LEAN_MAX : LEAN_REFUSE);
    const raw = horiz ? dx : dy;
    lean.off = Math.max(-reach, Math.min(reach, raw));
    return dir;
  }

  /**
   * Carry the leaning pair towards where the finger has asked for them.
   *
   * A frame's worth of the distance left, on the board's own clock, rather
   * than the whole of it on the pointer's — see LEAN_CHASE. Cheap enough to
   * run unconditionally: there is at most one pair leaning at any moment and
   * most frames have none.
   *
   * The cells are checked, not trusted, for the same reason homeStone checks
   * them: a wave of obsidian or a reshuffle can deal one of these stones
   * somewhere else while the finger is still down, and it belongs to whatever
   * put it there.
   */
  updateLean(dt) {
    const lean = this.lean;
    if (!lean) return;
    const k = 1 - Math.exp(-dt / LEAN_CHASE);

    const carry = (gem, cell, sign) => {
      if (!gem || !cell || gem.destroyed) return;
      if (this.grid[cell.r][cell.c] !== gem) return;
      const p = this.cellPos(cell.r, cell.c);
      const off = lean.off * sign;
      const tx = p.x + (lean.horiz ? off : 0);
      const ty = p.y + (lean.horiz ? 0 : off);
      gem.x += (tx - gem.x) * k;
      gem.y += (ty - gem.y) * k;
    };

    carry(lean.gem, lean.cell, 1);
    carry(lean.partner, lean.pcell, -1);
  }

  /**
   * Put back whatever the last lean borrowed.
   *
   * Travelled, not written. This is the answer to a gesture the player
   * abandoned — a finger lifted without a swipe, a drag that turned out to be
   * a tap — and a pair of stones arriving back in their sockets on a single
   * frame is the cut the lean exists to remove, played backwards.
   *
   * Safe to call at any time, which is why every path out of a touch does. A
   * swap, a fall or a shuffle taking the same stones somewhere else kills what
   * this starts on its own first frame — see animateSwap.
   */
  homeLean() {
    const lean = this.lean;
    if (!lean) return;
    this.lean = null;
    this.homeStone(lean.gem, lean.cell);
    this.homeStone(lean.partner, lean.pcell);
  }

  /**
   * One stone back onto the cell it was borrowed from, if it is still there.
   *
   * The cell is checked rather than trusted. A wave of obsidian, a reshuffle
   * or a cascade can land between the lean and the finger coming off it, and a
   * stone the model has since dealt somewhere else belongs to whatever put it
   * there — the last thing that stone needs is a tween pulling it back to
   * where it used to live.
   */
  homeStone(gem, cell) {
    if (!gem || !cell || gem.destroyed) return;
    if (this.grid[cell.r][cell.c] !== gem) return;
    const p = this.cellPos(cell.r, cell.c);
    // Already home, which is most calls: a tween over no distance is a frame
    // of stall and a killTweensOf nobody asked for.
    if (Math.abs(gem.x - p.x) < 0.5 && Math.abs(gem.y - p.y) < 0.5) return;
    killTweensOf(gem);
    tween(gem, { x: p.x, y: p.y }, LEAN_HOME, { ease: Ease.quadOut });
  }

  handleMove(e) {
    if (!this.drag || this.drag.fired || !this.inputEnabled) return;
    const p = e.getLocalPosition(this);
    if (this.onTouchMove) this.onTouchMove(p.x, p.y);
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    // The stones come with the finger from the first pixel, and the direction
    // the swipe commits to is the one they are already leaning in — see
    // leanTo. Read before the threshold below, because the whole point of it
    // is to answer the part of the gesture that has not fired yet.
    const dir = this.leanTo(dx, dy);
    const threshold = this.cell * SWIPE_RATIO;
    if (!dir) return;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    const target = {
      r: this.drag.start.r + dir.r,
      c: this.drag.start.c + dir.c,
    };
    this.drag.fired = true;
    const from = this.drag.start;
    this.drag = null;
    this.letGo();
    // The swipe is spent the moment it fires, so the hand comes off here rather
    // than at pointerup — which on a flick arrives long after the gems moved.
    if (this.onTouchEnd) this.onTouchEnd();
    this.clearSelection();
    if (this.inBounds(target)) this.attemptSwap(from, target);
  }

  handleUp(e) {
    const drag = this.drag;
    this.drag = null;
    this.letGo();
    // Every touch that did not already spend itself on a swipe reports its end
    // here, including one that never found a cell to begin with — a press on
    // the frame is still a press, and letGo is a no-op when the prop was never
    // taken. The director hangs the tutorial's re-arm off this being the
    // honest end of a touch rather than the end of a *successful* one.
    if (!drag || !drag.fired) {
      if (this.onTouchEnd) this.onTouchEnd();
    }
    if (!drag || drag.fired || !this.inputEnabled) return;

    // No swipe: fall back to tap-tap selection, which some players prefer.
    const p = e.getLocalPosition(this);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;

    if (!this.selected) {
      this.select(cell);
      return;
    }
    if (this.selected.r === cell.r && this.selected.c === cell.c) {
      this.clearSelection();
      return;
    }
    if (this.isAdjacent(this.selected, cell)) {
      const from = this.selected;
      this.clearSelection();
      this.attemptSwap(from, cell);
    } else {
      this.clearSelection();
      this.select(cell);
    }
  }

  select(cell) {
    this.selected = cell;
    sfx.select();
    const gem = this.grid[cell.r][cell.c];
    if (gem) tween(gem.glow, { alpha: 0.55 }, 0.12);
  }

  clearSelection() {
    if (!this.selected) return;
    const gem = this.grid[this.selected.r][this.selected.c];
    if (gem) tween(gem.glow, { alpha: 0 }, 0.15);
    this.selected = null;
  }

  inBounds(cell) {
    return cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS;
  }

  isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  /* ------------------------------------------------------------------ moves */

  /** Resolves with the swap the player (or autoplay) committed. */
  waitForMove() {
    this.inputEnabled = true;
    // A swipe that landed before this turn existed. See pendingMove.
    if (this.pendingMove) {
      const move = this.pendingMove;
      this.pendingMove = null;
      this.inputEnabled = false;
      return Promise.resolve(move);
    }
    return new Promise((resolve) => {
      this.moveResolver = resolve;
    });
  }

  /**
   * Take touches with no turn waiting on one — the pre-fight board.
   *
   * `waitForMove` is the same switch with a promise attached to it, and that
   * promise is the director's turn. This is for the frames before there is a
   * turn at all: the player can still pick a swap up and make it, and
   * `pendingMove` is where it waits for the fight to come and collect it.
   */
  armInput() {
    this.inputEnabled = true;
  }

  lockInput() {
    this.inputEnabled = false;
    this.drag = null;
    // The board can be taken away mid-touch — a doom cast, the end of the
    // fight — and the finger is not told about it. See letGo().
    this.letGo();
    this.clearSelection();
  }

  /**
   * Drop the pending waitForMove without resolving it.
   *
   * The player can now spend Arissa instead of swapping, so the turn is a race
   * between two inputs. Whichever loses has to stop listening, or the next
   * swap would resolve a turn that was already spent.
   */
  cancelWait() {
    this.moveResolver = null;
    this.lockInput();
  }

  async attemptSwap(a, b) {
    // Whatever the lesson was showing, the player is answering it now.
    this.cancelPreview();
    if (this.busy) return;

    // Encased gems do not budge. Same soft feedback as any other bad swap:
    // a nudge and the hand, never a buzzer.
    if (this.isLocked(a.r, a.c) || this.isLocked(b.r, b.c)) {
      this.nudgeLock(this.isLocked(a.r, a.c) ? a : b);
      if (this.onInvalid) this.onInvalid();
      return;
    }

    this.busy = true;
    this.inputEnabled = false;
    sfx.swap();

    const ga = this.grid[a.r][a.c];
    const gb = this.grid[b.r][b.c];
    // Told where the two stones are going, rather than left to work it out
    // from where they are standing. They are very often not standing on their
    // sockets — the finger has just leaned them a third of a cell towards each
    // other, and a lesson may still be gliding one of them home — and a swap
    // that reads its destinations off the pair's own positions inherits every
    // one of those offsets and leaves the board a few pixels crooked for the
    // rest of the run.
    const pa = this.cellPos(b.r, b.c);
    const pb = this.cellPos(a.r, a.c);
    await this.animateSwap(ga, gb, SWAP_TIME, pa, pb);
    this.swapModel(a, b);

    if (this.findMatches().length === 0) {
      // Soft failure: no red, no buzzer — just put it back and re-hint.
      this.swapModel(a, b);
      sfx.reject();
      await this.animateSwap(ga, gb, REVERT_TIME, pb, pa);
      this.shrug(ga, gb);
      this.busy = false;
      this.inputEnabled = true;
      if (this.onInvalid) this.onInvalid();
      return;
    }

    this.busy = false;
    const resolver = this.moveResolver;
    this.moveResolver = null;
    if (resolver) resolver({ a, b });
    // Nobody is listening yet — the swipe beat the turn to it. See pendingMove.
    else this.pendingMove = { a, b };
  }

  /* ------------------------------------------------------------- the lesson */

  /**
   * Trade two gems on screen without trading them in the model.
   *
   * This is what lets the opening tutorial show the move rather than describe
   * it: the stones the player is looking at actually travel, and the three in
   * a row they land in is the real board arrangement one swipe away — not an
   * illustration of one. Calling it a second time on the same pair slides them
   * home, which is what `home` is for.
   *
   * Deliberately outside claim(): a lesson that took the board would be a
   * tutorial the player has to sit through, and the whole point is that they
   * can swipe straight through it. Everything that does claim the board
   * cancels the preview on its way in.
   *
   * @returns {Promise<boolean>} whether it finished without being cancelled
   */
  async previewSwap(a, b, dur, home) {
    if (this.busy) return false;
    const ga = this.grid[a.r][a.c];
    const gb = this.grid[b.r][b.c];
    if (!ga || !gb) return false;
    if (this.isLocked(a.r, a.c) || this.isLocked(b.r, b.c)) return false;

    const token = ++this.previewToken;
    this.preview = { a, b };
    await this.animateSwap(ga, gb, dur === undefined ? 0.4 : dur);
    if (token !== this.previewToken) return false;
    if (home) this.preview = null;
    return true;
  }

  /**
   * Put the shown board back to the board the model is holding.
   *
   * Called by everything that is about to write the grid, and by the director
   * on the player's first touch. Cheap and safe to call when nothing is being
   * previewed, which is most of the time.
   */
  cancelPreview(glide) {
    this.previewToken++;
    if (!this.preview) return;
    this.preview = null;
    if (glide) this.glideGems();
    else this.snapGems();
  }

  /**
   * The same journey home, travelled rather than jumped.
   *
   * The lesson leaves two real stones standing on each other's cells, and the
   * player's first touch used to put them back by writing their positions —
   * two gems in the middle of the board changing place on one frame, at the
   * exact moment the player is looking at them, which is the single hardest
   * cut the board had. There is nothing to hurry: the stones are only ever a
   * cell from where they belong and the model already agrees with where they
   * are going, so they can be allowed to get there.
   *
   * Nothing has to be told this is running, and nothing is. Everything that
   * moves a stone — a swap, a fall, a shuffle, the finger — kills whatever was
   * writing the one it is about to take and travels to the cell the model
   * gives it, so a glide is either taken over cleanly or left alone to finish.
   * That invariant is what replaced the flag this used to raise, and the
   * board-wide snap every claim used to open with.
   */
  glideGems(dur) {
    const jobs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem) continue;
        killTweensOf(gem);
        const p = this.cellPos(r, c);
        // Already home. An eased tween over no distance is a frame of stall,
        // and twenty-three of the twenty-five stones are in this case.
        if (Math.abs(gem.x - p.x) < 0.5 && Math.abs(gem.y - p.y) < 0.5) {
          gem.x = p.x;
          gem.y = p.y;
          gem.rotation = 0;
          continue;
        }
        jobs.push(
          tween(
            gem,
            { x: p.x, y: p.y, rotation: 0 },
            dur === undefined ? PREVIEW_HOME : dur,
            { ease: Ease.quadInOut },
          ),
        );
      }
    }
    return Promise.all(jobs);
  }

  /** Every gem back on its own cell, killing whatever was moving it. */
  snapGems() {
    // Including the pair a finger is holding: their positions are about to be
    // written, so the tween that would have carried them back has nothing left
    // to carry. The finger is welcome to lean them again on its next move.
    this.lean = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem) continue;
        killTweensOf(gem);
        const p = this.cellPos(r, c);
        gem.x = p.x;
        gem.y = p.y;
        // Killed tweens stop where they stand, and a refused swap is a tilt on
        // its way back to zero — see shrug. Snapped with the position, or the
        // stone sits crooked in its socket for the rest of the run.
        gem.rotation = 0;
      }
    }
  }

  /**
   * What a swap would actually make: the run it completes, which end of it
   * travels into that run, and which cells were already sitting in it.
   *
   * The lesson needs all three separately — the pair to light first, the stone
   * to point at, and the line to join up afterwards — and none of them can be
   * read off the swap alone. Model-only: it swaps, looks, and swaps back.
   *
   * @returns {?{run:Array, from:object, to:object, rest:Array}}
   */
  matchShape(a, b) {
    this.swapModel(a, b);
    const run = this.findMatches();
    this.swapModel(a, b);
    if (run.length === 0) return null;

    const holds = (p) => run.some((cell) => cell.r === p.r && cell.c === p.c);
    const to = holds(a) ? a : holds(b) ? b : null;
    if (!to) return null;
    const from = to === a ? b : a;
    const rest = run.filter((cell) => !(cell.r === to.r && cell.c === to.c));
    if (rest.length === 0) return null;
    return { run, from, to, rest };
  }

  /**
   * The two stones of a refused swap, shrugging it off.
   *
   * A swap that made nothing already puts itself back, and putting itself back
   * is not an answer — it is the same animation as the swap, run in reverse, so
   * a player who mis-swiped watches four tenths of a second of movement that
   * says nothing about why. This is the "no": a tilt in opposite directions
   * that springs out, which is a pair of stones refusing each other and is over
   * before the hand is off the glass.
   *
   * Not awaited by its caller. The board is handed back on the same frame — the
   * refusal plays out over a board that is already live again, because the one
   * thing a soft failure must not cost is the next swipe.
   */
  shrug(ga, gb) {
    [ga, gb].forEach((gem, i) => {
      if (!gem) return;
      killTweensOf(gem);
      gem.rotation = i ? -0.19 : 0.19;
      tween(gem, { rotation: 0 }, 0.42, { ease: Ease.elasticOut });
    });
  }

  /** Tiny "this will not move" wobble on a block the player tried to drag. */
  nudgeLock(cell) {
    const lock = this.locks[cell.r] && this.locks[cell.r][cell.c];
    if (!lock) return;
    sfx.knock();
    killTweensOf(lock.slab);
    lock.slab.rotation = 0;
    tween(lock.slab, { rotation: 0.16 }, 0.06)
      .then(() => tween(lock.slab, { rotation: -0.16 }, 0.09))
      .then(() => tween(lock.slab, { rotation: 0 }, 0.09));
  }

  /** Play the hinted move on the player's behalf after a long idle. */
  autoPlay(hint) {
    if (!hint || this.busy) return;
    if (
      this.isLocked(hint.a.r, hint.a.c) ||
      this.isLocked(hint.b.r, hint.b.c)
    ) {
      return;
    }
    this.attemptSwap(hint.a, hint.b);
  }

  swapModel(a, b) {
    const tmp = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = tmp;
  }

  /**
   * Trade two stones on screen.
   *
   * This was two straight-line lerps, and a straight-line lerp is what a swap
   * looks like when nobody has been asked to like it. Three things on top of
   * it now, and all three are the same idea: a swipe is the one moment in the
   * fight the player's own hand is on, so it is the one animation that has to
   * answer back.
   *
   * The stones swell as they pass. Two tiles crossing at a constant size read
   * as a diagram of a swap; two that lift, pass and settle read as being
   * picked up — and the swell is what puts the pair in front of the twenty-three
   * stones they are moving between, without touching the display order.
   *
   * They arrive with a settle rather than stopping dead. `backOutSoft` carries
   * a tenth of `backOut`'s overshoot, which over the width of one cell is a few
   * pixels of bump into the socket — enough to feel, not enough to look like
   * the stone missed.
   *
   * And they land on exactly the cell they were sent to, which is why the
   * swell is two chained tweens back to 1 rather than a curve that overshoots:
   * `previewSwap` runs this to show the lesson's move and runs it again to put
   * it back, so anything left behind here accumulates.
   *
   * @param {object} ga the stone travelling to `pa`
   * @param {object} gb the stone travelling to `pb`
   * @param {number} dur seconds
   * @param {{x:number,y:number}} [pa] where `ga` is going; defaults to where
   *        `gb` is standing, which is the lesson's case — an on-socket pair
   *        trading places
   * @param {{x:number,y:number}} [pb] where `gb` is going
   */
  animateSwap(ga, gb, dur, pa, pb) {
    const to = pa || { x: gb.x, y: gb.y };
    const back = pb || { x: ga.x, y: ga.y };

    /**
     * One stone, on its way, off whatever was moving it before.
     *
     * The swap owns both of them from here: a lean the finger left behind, a
     * lesson gliding home, the tilt off a refusal a moment ago. Killed rather
     * than fought with, because two tweens on one position is the one thing in
     * here that reads as a dropped frame — and because the destination is a
     * cell rather than the other stone's position, the travel can start from
     * wherever the stone actually is and still land in its socket.
     *
     * The tilt comes home with it. A stone still carrying a shrug when the
     * next swipe picks it up used to keep that angle for the rest of the run,
     * since killing the shrug leaves it wherever it had sprung back to.
     */
    const travel = (gem, dest) => {
      killTweensOf(gem);
      return tween(gem, { x: dest.x, y: dest.y, rotation: 0 }, dur, {
        ease: Ease.backOutSoft,
      });
    };

    const carry = (gem) => {
      killTweensOf(gem.scale);
      return tween(gem.scale, { x: 1.16, y: 1.16 }, dur * 0.42, {
        ease: Ease.quadOut,
      }).then(() =>
        tween(gem.scale, { x: 1, y: 1 }, dur * 0.58, { ease: Ease.backOut }),
      );
    };

    return Promise.all([
      travel(ga, to),
      travel(gb, back),
      carry(ga),
      carry(gb),
    ]);
  }

  /* --------------------------------------------------------------- matching */

  /** @returns {Array<{r:number,c:number}>} every cell part of a run of 3+ */
  findMatches(grid) {
    const g = grid || this.grid;
    const seen = {};
    const out = [];

    const add = (r, c) => {
      const key = r * COLS + c;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ r, c });
    };

    // typeAt() reports -1 for encased cells, so obsidian breaks every run.
    const at = (r, c) => {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
      if (this.locks[r][c]) return -1;
      return g[r][c] ? g[r][c].type : -1;
    };

    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const t = at(r, c);
        const same = t >= 0 && t === at(r, c - 1);
        if (same) {
          run++;
        } else {
          if (run >= 3) for (let k = c - run; k < c; k++) add(r, k);
          run = 1;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const t = at(r, c);
        const same = t >= 0 && t === at(r - 1, c);
        if (same) {
          run++;
        } else {
          if (run >= 3) for (let k = r - run; k < r; k++) add(k, c);
          run = 1;
        }
      }
    }
    return out;
  }

  /**
   * Matchable element at a cell, or -1 for out of bounds, empty, or encased.
   * Obsidian returning -1 is what keeps trapped gems out of every run, hint
   * and cascade in one place.
   */
  typeAt(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    if (this.locks[r][c]) return -1;
    const gem = this.grid[r][c];
    return gem ? gem.type : -1;
  }

  /**
   * Best swap currently on the board, preferring the biggest clear.
   * Used for the hint hand and for autoplay, so the help is always honest.
   */
  findBestSwap(preferType) {
    let best = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const neighbours = [
          { r, c: c + 1 },
          { r: r + 1, c },
        ];
        if (this.isLocked(r, c)) continue;
        for (let i = 0; i < neighbours.length; i++) {
          const b = neighbours[i];
          if (!this.inBounds(b) || this.isLocked(b.r, b.c)) continue;
          const a = { r, c };
          this.swapModel(a, b);
          const cells = this.findMatches();
          const types = cells.map((cc) => this.typeAt(cc.r, cc.c));
          this.swapModel(a, b);
          if (cells.length === 0) continue;

          let score = cells.length;
          if (preferType !== undefined && types.indexOf(preferType) !== -1) {
            score += 10;
          }
          if (!best || score > best.score) best = { a, b, score };
        }
      }
    }
    return best;
  }

  /* -------------------------------------------------------------- resolving */

  /**
   * Something is writing the grid: a swap, a cascade, obsidian. See claim().
   *
   * An accessor rather than a plain field because letting go of the board is
   * an event other beats are waiting on, and they used to find out about it by
   * asking every fortieth of a second. See whenQuiet.
   */
  get busy() {
    return this.working;
  }

  set busy(v) {
    this.working = v;
    if (v || this.quiet.length === 0) return;
    const waiting = this.quiet;
    this.quiet = [];
    waiting.forEach((resolve) => resolve());
  }

  /**
   * Settles once nothing is writing the grid.
   *
   * For a reader rather than a writer: the boss scores the board before it aims
   * its lava, and a board halfway through a cascade is holding empty cells and
   * gems that are still falling — it would be scoring a position nobody is
   * looking at.
   */
  async whenQuiet() {
    // Answered on the frame the board lets go rather than on the next poll —
    // see the busy setter. A fortieth of a second of nothing is not long to
    // wait and the seam between two beats is a very visible place to wait it:
    // the boss's wave landing on top of a cascade that has just finished is
    // exactly this handover, and it used to have a gap in the middle of it.
    // The loop stands because a second claim can get in first.
    while (this.busy) await new Promise((resolve) => this.quiet.push(resolve));
  }

  /**
   * Settles once no finger is on the board — or after `cap` seconds, whichever
   * comes first.
   *
   * The boss lands its wave on its own clock and the player swipes on theirs,
   * so the two collide constantly: a block written into a cell somebody is
   * halfway through dragging out of costs them the move and never says why.
   * Waiting out the gesture is most of the difference between the fight
   * happening around the player and the fight happening to them.
   *
   * Bounded, because a thumb parked on the glass is not a reason for the boss
   * to stop swinging.
   */
  async handsOff(cap) {
    const until = now() + (cap === undefined ? 0.7 : cap);
    while (this.drag && now() < until) await delay(0.04);
  }

  /**
   * Run `job` with the grid to itself, after whatever holds it now lets go.
   *
   * `busy` used to cover the swap animation alone, and that was enough: the
   * player's move and the boss's answer could not overlap, because the director
   * awaited one before it started the other. The board is live through the
   * boss's turn now — so the cascade, the ult's wipe and the obsidian landing
   * all pass through here and take their turn instead of writing the grid over
   * each other.
   *
   * Not reentrant: nothing inside a job may claim the board again.
   */
  async claim(job) {
    await this.whenQuiet();
    // Nothing is placed on the way in. Every beat that runs from here moves
    // the stones it is going to move by killing whatever was writing them and
    // travelling to the cell the model hands it — see animateSwap, animateFalls
    // and slideShuffle — so a lesson still gliding home, or a pair the finger
    // has leaned, is taken over cleanly rather than snapped out from under the
    // one person watching it.
    this.busy = true;
    try {
      return await job();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Clear, drop, refill until the board is quiet.
   *
   * Whatever cascade falls out of this is the cascade the player earned. The
   * old signature took the combo length the storyboard wanted and had refill()
   * manufacture it; now the number is only ever counted, never arranged.
   *
   * @param {(step:number, cells:Array)=>void} onStep per-cascade callback
   * @returns {Promise<number>} cascade steps actually played
   */
  resolve(onStep) {
    return this.claim(async () => {
      let step = 0;
      for (;;) {
        const cells = this.findMatches();
        if (cells.length === 0) break;
        step++;
        // One voice for the step, tuned to the rung of the cascade it is on —
        // a sound per gem would be twelve of the same pop inside a second.
        sfx.match(step, cells.length, this.typeAt(cells[0].r, cells[0].c));
        if (onStep) onStep(step, cells);
        // Matches clear and neighbouring obsidian cracks in the same beat.
        await Promise.all([this.popCells(cells), this.breakLocksNear(cells)]);
        this.applyGravity();
        this.refill(step);
        await this.animateFalls();
        // No pause between the rungs. A cascade is one collapse that keeps
        // finding more to clear, and the frame of stillness that used to be
        // inserted between its steps is most of what made it read as a list of
        // them instead.
      }
      await this.ensurePlayable();
      return step;
    });
  }

  /**
   * Blow up a set of cells.
   *
   * The beat the whole genre is built on, so it is worth the four extra lines.
   *
   * It goes off from the middle outwards rather than in array order. `findMatches`
   * walks rows and then columns, so the old `i * 0.012` stagger fired an L-shaped
   * match as two separate sweeps meeting at the corner — the order the matcher
   * happened to find them in, which is not an order anything in the world would
   * break in. Delayed by distance from the run's own centre instead, a five in a
   * row detonates from the middle and an L goes off from the elbow, and both read
   * as one event with a place it started.
   *
   * The stone is thrown *past* full size on a hard overshoot and then collapses
   * on an accelerating curve, which is the difference between a gem popping and a
   * gem being turned off: `backOutHard` puts a visible flinch in the swell, and
   * `expoIn` spends the first half of the collapse barely moving and the second
   * half gone.
   *
   * The spin is the cheap part and does most of the work. A quarter turn either
   * way, picked per stone, means twelve stones clearing in a cascade are twelve
   * events rather than one effect played twelve times.
   */
  async popCells(cells) {
    // The middle of the run, in cells, so the stagger radiates from it.
    let mr = 0;
    let mc = 0;
    cells.forEach((cell) => {
      mr += cell.r;
      mc += cell.c;
    });
    mr /= cells.length;
    mc /= cells.length;

    const gone = [];
    cells.forEach((cell) => {
      const gem = this.grid[cell.r][cell.c];
      if (!gem) return;
      this.grid[cell.r][cell.c] = null;
      if (this.onPop) {
        this.onPop(this.x + gem.x, this.y + gem.y, gem.type);
      }

      // Whatever else was writing this stone's size — a press that has not
      // finished settling, a ripple from the step before — the pop owns it now.
      killTweensOf(gem.scale);

      const reach = Math.hypot(cell.r - mr, cell.c - mc);
      // Both directions, and never the same twice in a row down a line: the
      // sign comes off the cell's own parity rather than the RNG, so a five in
      // a row alternates instead of clumping.
      const spin = ((cell.r + cell.c) % 2 ? 1 : -1) * 0.55;

      gem.glow.alpha = 1;
      const swell = tween(gem.scale, { x: 1.42, y: 1.42 }, POP_SWELL, {
        delay: reach * 0.028,
        ease: Ease.backOutHard,
      });
      // What the board waits for: the swell, and as much of the collapse as it
      // takes for the stone to be out of the way. See POP_HANDOVER.
      gone.push(swell.then(() => delay(POP_COLLAPSE * POP_HANDOVER)));
      // Fired and then on nobody's clock. The last frames of a stone that is
      // already a speck are not something the collapse above it has to be held
      // up for, and holding it up for them is what put a beat of stillness in
      // the middle of every match.
      swell
        .then(() =>
          Promise.all([
            tween(gem.scale, { x: 0, y: 0 }, POP_COLLAPSE, {
              ease: Ease.expoIn,
            }),
            tween(gem, { rotation: spin }, POP_COLLAPSE, {
              ease: Ease.quadIn,
            }),
            // Held opaque for the first half and then gone: a stone that fades
            // out from the frame it started shrinking on is a stone that was
            // never there, and the shrink is the part worth watching.
            tween(gem, { alpha: 0 }, 0.09, { delay: 0.08 }),
          ]),
        )
        .then(() => this.recycle(gem));
    });
    this.ripple(cells);
    await Promise.all(gone);
  }

  /**
   * The stones that did *not* clear, flinching as the ones beside them go.
   *
   * The cheapest big idea in the pass. Everything else about a match happens to
   * the matched stones, so a clear reads as three tiles being deleted out of a
   * grid that never noticed — and a grid that never notices is a spreadsheet.
   * Five of their neighbours jolting a frame later is what turns it into
   * something that happened *on* the board: the run goes off, the shock runs
   * outwards through the stones around it, and it is over before the collapse
   * starts.
   *
   * Squashed along y and not along x, because the ripple's own direction is
   * outwards from the run and there is no cheap way to point it — a flinch
   * every stone answers the same way is read as the board flexing, which is
   * what it is.
   *
   * Nothing here is awaited and nothing may throw. Each punch re-checks that
   * the stone it was aimed at is still the stone in that cell when its delay
   * comes up, because between the two the run above it may have collapsed and
   * handed it somewhere else entirely.
   */
  ripple(cells) {
    // Two cells: the four stones sharing an edge with the run and the four
    // touching its corners, and nothing beyond them. Wider, the whole board
    // twitches at once and the run stops being the thing that caused it.
    const REACH = 2;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem || gem.destroyed) continue;
        // Encased stones do not flinch: the whole point of the obsidian is that
        // it is the one thing on the board that does not answer to anything.
        if (this.locks[r] && this.locks[r][c]) continue;

        let near = REACH;
        for (let i = 0; i < cells.length; i++) {
          const d = Math.hypot(cells[i].r - r, cells[i].c - c);
          if (d < near) near = d;
        }
        if (near >= REACH) continue;

        // Squared, so the stone against the run takes nearly all of it and the
        // one behind that takes a hint. A linear falloff spreads the same total
        // movement over eight tiles and reads as a wobble.
        const fall = 1 - near / REACH;
        const amount = 0.17 * fall * fall;
        if (amount < 0.012) continue;

        delay(near * 0.032).then(() => {
          if (this.destroyed || gem.destroyed) return;
          if (this.grid[r][c] !== gem) return;
          punch(gem, amount, 0.36, { axis: "y" });
        });
      }
    }
  }

  /**
   * Compact each column downward, remembering who has to fall.
   *
   * A column is not one shaft any more: obsidian can now sit anywhere, so each
   * column is a stack of independent segments separated by blocks, and each
   * segment compacts and refills inside itself.
   *
   * The old version assumed every block was bottom-anchored and kept one
   * "empty above here" mark per column. A block floating mid-column broke that
   * outright — the hole under it was never refilled and the board quietly lost
   * a cell. That assumption is what pinned the boss's lava to the bottom row,
   * so it had to go before the lava could be aimed anywhere interesting.
   */
  applyGravity() {
    this.falling = [];
    this.holes = [];
    for (let c = 0; c < COLS; c++) {
      let bottom = ROWS - 1;
      // r === -1 closes the last segment against the top of the board.
      for (let r = ROWS - 1; r >= -1; r--) {
        if (r >= 0 && !this.locks[r][c]) continue;
        this.compactSegment(c, r + 1, bottom);
        bottom = r - 1;
      }
    }
  }

  /** Settle one run of unlocked cells, rows `top`..`bottom` of column `c`. */
  compactSegment(c, top, bottom) {
    if (top > bottom) return;
    let write = bottom;
    for (let r = bottom; r >= top; r--) {
      const gem = this.grid[r][c];
      if (!gem) continue;
      if (write !== r) {
        this.grid[write][c] = gem;
        this.grid[r][c] = null;
        this.falling.push({ gem, r: write, c });
      }
      write--;
    }
    // rows top..write are empty; `low` is what they fall from.
    for (let r = write; r >= top; r--) this.holes.push({ r, c, low: write });
  }

  /**
   * Fill the holes.
   * @param {number} step which cascade step is being refilled — only read by
   *        the rigged-cascade path, which is off by default.
   */
  refill(step) {
    const fresh = [];

    (this.holes || []).forEach((hole) => {
      const { r, c } = hole;
      const type = this.safeType(r, c);
      const gem = this.obtainGem(type);
      const p = this.cellPos(r, c);
      gem.x = p.x;
      // Staged above its own segment, not above the board: a gem refilling
      // under a block falls out from behind the block rather than through it.
      gem.y = p.y - (hole.low - r + 1.4) * this.cell;
      gem.alpha = 1;
      this.grid[r][c] = gem;
      fresh.push({ gem, r, c });
      this.falling.push({ gem, r, c });
    });
    this.holes = [];

    // Off by default: the board no longer hands out the combo the script
    // wanted. Kept behind the flag because turning the creative back into a
    // guaranteed highlight reel is a one-line decision, not a rewrite.
    if (DIFFICULTY.rigCascades && step < 3) this.plantMatch(fresh);
  }

  /** A type that creates no accidental match at (r,c). */
  safeType(r, c) {
    const start = rndInt(GEM_TYPES);
    for (let i = 0; i < GEM_TYPES; i++) {
      const t = (start + i) % GEM_TYPES;
      if (this.typeAt(r, c - 1) === t && this.typeAt(r, c - 2) === t) continue;
      if (this.typeAt(r, c + 1) === t && this.typeAt(r, c + 2) === t) continue;
      if (this.typeAt(r, c - 1) === t && this.typeAt(r, c + 1) === t) continue;
      if (this.typeAt(r - 1, c) === t && this.typeAt(r - 2, c) === t) continue;
      if (this.typeAt(r + 1, c) === t && this.typeAt(r + 2, c) === t) continue;
      if (this.typeAt(r - 1, c) === t && this.typeAt(r + 1, c) === t) continue;
      return t;
    }
    return start;
  }

  /**
   * Turn three of the just-spawned gems into a guaranteed next match.
   * Clearing a horizontal run always refills three adjacent columns, and a
   * vertical run always refills three cells of one column, so one of the two
   * shapes below is always available.
   */
  plantMatch(fresh) {
    if (fresh.length < 3) return;
    const type = fresh[0].gem.type;

    // Prefer a horizontal triple on a shared row.
    const byRow = {};
    fresh.forEach((f) => {
      byRow[f.r] = byRow[f.r] || [];
      byRow[f.r].push(f);
    });
    const rows = Object.keys(byRow).sort(
      (a, b) => byRow[b].length - byRow[a].length,
    );
    for (let i = 0; i < rows.length; i++) {
      const list = byRow[rows[i]].sort((a, b) => a.c - b.c);
      for (let k = 0; k + 2 < list.length; k++) {
        if (list[k + 2].c - list[k].c === 2) {
          for (let j = k; j <= k + 2; j++) list[j].gem.setType(type);
          return;
        }
      }
    }

    // Otherwise a vertical triple inside one column.
    const byCol = {};
    fresh.forEach((f) => {
      byCol[f.c] = byCol[f.c] || [];
      byCol[f.c].push(f);
    });
    const cols = Object.keys(byCol);
    for (let i = 0; i < cols.length; i++) {
      const list = byCol[cols[i]].sort((a, b) => a.r - b.r);
      if (list.length >= 3) {
        for (let j = 0; j < 3; j++) list[j].gem.setType(type);
        return;
      }
    }

    // Last resort: extend an existing pair that touches a fresh gem.
    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i];
      const below = this.typeAt(f.r + 1, f.c);
      if (below >= 0 && below === this.typeAt(f.r + 2, f.c)) {
        f.gem.setType(below);
        return;
      }
    }
  }

  /** Drop everything that moved into place. */
  async animateFalls() {
    sfx.drop((this.falling || []).length);
    const jobs = (this.falling || []).map((f) => {
      const p = this.cellPos(f.r, f.c);
      const dist = Math.abs(f.gem.y - p.y) / this.cell;
      const dur = Math.min(0.46, 0.19 + dist * 0.058);
      // This fall owns the stone. The x used to be written flat on the frame
      // the drop started, which was harmless while nothing else could move a
      // stone sideways and is not any more: one the finger had leaned out of
      // its socket, or one still gliding home from a lesson, was put back on
      // its column in a single frame and then dropped. Carried on the fall's
      // own curve instead — gravity moves nothing sideways, so for nearly
      // every stone this is a tween over no distance at all.
      killTweensOf(f.gem);
      /**
       * How hard it lands, off how far it fell.
       *
       * The squash used to be one number for every stone in the column, which
       * is the one thing a landing must not be: a gem that slid down one cell
       * and a gem that fell the whole height of the board hit the floor with
       * exactly the same splat, and five of them landing identically is what
       * made a refill read as a list rather than as a collapse. Capped, because
       * past about four cells nothing gets flatter, it only gets sillier.
       */
      const weight = Math.min(1, 0.3 + dist * 0.2);

      /**
       * Drawn out by the fall, and drawn out *more* the longer it lasts.
       *
       * The stone accelerates — `quadIn` on the y — so the stretch is put on
       * the same curve rather than set once at the top: it leaves its cell at
       * its own size and is at full stretch on the frame it lands, which is the
       * frame the squash below takes over on. Set at the top instead and the
       * gem is at its thinnest while it is barely moving, which reads as a
       * stone that was already stretched and then happened to fall.
       */
      const stretch = 0.06 + 0.15 * weight;
      // Not written flat first. A stone that was mid-flinch when the collapse
      // reached it — a ripple off the run beside it, a press it had not finished
      // giving back — had its size set to 1 on the frame the fall started, which
      // is a pop on exactly the stones the eye is already following. The stretch
      // leaves from whatever size the stone actually is; both paths land on the
      // same value, so nothing accumulates.
      killTweensOf(f.gem.scale);
      tween(f.gem.scale, { x: 1 - stretch * 0.5, y: 1 + stretch }, dur, {
        ease: Ease.quadIn,
      });

      return tween(f.gem, { x: p.x, y: p.y, rotation: 0 }, dur, {
        ease: Ease.quadIn,
      }).then(() =>
        // Set on the frame of the landing and sprung back, rather than eased
        // into over sixty milliseconds — see punch in core/tween.js. Easing
        // into a squash is a stone breathing; arriving in one is a stone
        // hitting something.
        punch(f.gem, 0.2 * weight, 0.26 + 0.1 * weight, { axis: "x" }),
      );
    });
    this.falling = [];
    await Promise.all(jobs);
  }

  /** Wipe every gem of one element — the healer's ultimate. */
  async clearElement(type) {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.typeAt(r, c) === type) cells.push({ r, c });
      }
    }
    if (cells.length === 0) return 0;

    // The wipe and the cascade it sets off are claimed separately: resolve()
    // claims for itself, and a job may not claim twice.
    await this.claim(async () => {
      await this.popCells(cells);
      this.applyGravity();
      this.refill(0);
      await this.animateFalls();
    });
    // Whatever the wipe leaves behind still pays out.
    await this.resolve(null);
    return cells.length;
  }

  /**
   * The player must never face a dead board.
   *
   * The gems on the board are never rewritten to fix one. Nothing here calls
   * setType: the same gem objects, carrying the same elements, are dealt to
   * different cells and slide there. A stone that morphs into another element
   * under the player's thumb is the board lying about what it is holding, and
   * it is worse than the dead board it was solving — the player loses track of
   * a position they had already read.
   *
   * So this is a permutation, and only a permutation. Every arrangement it can
   * reach holds exactly the elements the board already had.
   *
   * What it is not allowed to be is a surprise. It takes the board out of the
   * player's hands for the best part of a second, and it used to do that with
   * no warning, as often as three times inside two of them — which is not a
   * mechanic anybody can learn to expect, it is a screen that occasionally
   * stops working. Three rules pace it now, and between them they are the
   * whole fix: it aims for SHUFFLE_TARGET rather than the bare floor, so the
   * board it hands back does not fall over again on the next block; a board
   * that still has a move waits SHUFFLE_GAP before it will fire a second time;
   * and it announces itself before it moves anything — see tellShuffle. The
   * boss holds up its end from the other side, in Director.worstCell, where it
   * is no longer allowed to bury the board under the floor in the first place.
   *
   * @returns {Promise<boolean>} whether a reshuffle was needed
   */
  async ensurePlayable() {
    const swaps = this.countSwaps();
    if (swaps >= MIN_SWAPS) return false;

    // A board with one move left on it is tight, not dead, and restocking it
    // is a courtesy rather than a rescue. The courtesy is what made the whole
    // mechanic unreadable: the boss's wave took the count under the floor, the
    // player's own cascade took it under again a beat later, and the screen
    // mixed itself three times while they were still holding a swipe they
    // never got to spend. So a courtesy waits its turn. A board with no move
    // at all never waits — there is nothing left to wait for.
    if (swaps > 0 && now() - this.lastShuffle < SHUFFLE_GAP) return false;

    const free = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.locks[r][c] && this.grid[r][c]) free.push({ r, c });
      }
    }
    if (free.length < 2) return false;

    const gems = free.map((p) => this.grid[p.r][p.c]);
    // The board as the player is reading it right now. The search deals over
    // the grid to score its candidates, so this is what it has to put back
    // before anything is allowed to be seen.
    const original = gems.slice();
    const deal = (order) =>
      free.forEach((p, i) => {
        this.grid[p.r][p.c] = order[i];
      });

    // Keep the best arrangement seen rather than the first one that clears the
    // floor. A board this boxed in by obsidian may have no perfect permutation
    // at all, and one legal move beats giving up and inventing gems — but the
    // opposite failure is the one that actually shipped: stopping the moment
    // MIN_SWAPS was met handed the board back balanced on the same edge it had
    // just fallen off. SHUFFLE_TARGET is where the search is happy to stop.
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = rndInt(i + 1);
        const g = gems[i];
        gems[i] = gems[j];
        gems[j] = g;
      }
      deal(gems);
      // An arrangement with a match already sitting on it would pay the player
      // for having run the board dry, so it does not count as solved.
      if (this.findMatches().length > 0) continue;
      const found = this.countSwaps();
      if (!best || found > best.swaps) {
        best = { order: gems.slice(), swaps: found };
      }
      if (found >= SHUFFLE_TARGET) break;
    }

    // Whatever the search tried, the player gets their own board back until
    // the tell has played over it.
    deal(original);
    // Nothing better than what they already had is not worth taking the board
    // away for. A silent no beats a mix that changes nothing.
    if (!best || best.swaps <= swaps) return false;

    // The mix is about to move every loose stone on the board; a preview of
    // two of them going somewhere else is not something to reconcile.
    this.cancelPreview();
    this.lastShuffle = now();
    sfx.shuffle();
    if (this.onShuffle) this.onShuffle();
    await this.tellShuffle(free);
    deal(best.order);
    await this.slideShuffle(free);
    await this.settleShuffle(free);
    return true;
  }

  /**
   * The half-beat before the stones move.
   *
   * The reshuffle used to have no first frame. The chime, the banner and the
   * gems sliding all landed together, so a swipe begun a moment earlier
   * finished on stones that were already somewhere else — and from the other
   * side of the glass that is not a mechanic, it is the game eating an input.
   *
   * So the board tenses first. Every loose gem draws in and lights up
   * together, the gesture in flight is let go where the player can watch it
   * happen rather than discover it afterwards, and only then does anything
   * move. A fifth of a second costs the run nothing and is long enough to be
   * felt before it is understood, which is the only way a beat this fast ever
   * gets read.
   */
  async tellShuffle(cells) {
    // Let the prop go the same way a real pointerup would, or the hand stays
    // clamped to a gem that is about to be somewhere else.
    if (this.drag && this.onTouchEnd) this.onTouchEnd();
    this.drag = null;
    this.clearSelection();
    await Promise.all(
      cells.map((p, i) => {
        const gem = this.grid[p.r][p.c];
        if (!gem) return Promise.resolve();
        // Nothing here kills a tween it did not start, except on the glow:
        // clearSelection above is fading one out this instant, and two live
        // tweens on one alpha is a gem that flickers instead of tensing.
        killTweensOf(gem.glow);
        tween(gem.glow, { alpha: 0.5 }, SHUFFLE_TELL);
        return tween(gem.scale, { x: 0.78, y: 0.78 }, SHUFFLE_TELL, {
          delay: (i % COLS) * 0.012,
          ease: Ease.quadIn,
        });
      }),
    );
  }

  /**
   * The stones land and take their size back.
   *
   * The closing bracket of the tell: the board is playable again, and it says
   * so in the same language it used to say it was about to change. Without it
   * the gems simply stay small and dim, and the player is left reading a board
   * that looks like it is still mid-something.
   */
  async settleShuffle(cells) {
    await Promise.all(
      cells.map((p) => {
        const gem = this.grid[p.r][p.c];
        if (!gem) return Promise.resolve();
        tween(gem.glow, { alpha: 0 }, SHUFFLE_SETTLE);
        return tween(gem.scale, { x: 1, y: 1 }, SHUFFLE_SETTLE, {
          ease: Ease.backOut,
        });
      }),
    );
  }

  /**
   * Carry the reshuffled gems to their new cells.
   *
   * A slide rather than a pop: the player has to be able to follow where their
   * elements went, which is the entire reason the shuffle moves stones instead
   * of rewriting them.
   */
  async slideShuffle(cells) {
    await Promise.all(
      cells.map((p, i) => {
        const gem = this.grid[p.r][p.c];
        if (!gem) return Promise.resolve();
        killTweensOf(gem);
        const to = this.cellPos(p.r, p.c);
        return tween(gem, { x: to.x, y: to.y }, 0.34, {
          delay: (i % 5) * 0.02,
          ease: Ease.quadInOut,
        });
      }),
    );
  }

  /* -------------------------------------------------------------- obsidian */

  /**
   * How many legal swaps the board currently offers.
   *
   * This is the player's freedom expressed as a number, and it is what the
   * boss aims its lava at — see Director.pickObsidian().
   */
  /**
   * Every legal swap on the board, strongest first.
   *
   * This is the player's list of options as the boss sees it — it picks one of
   * the top entries to bury each turn. Allocates, so the hot probing loop uses
   * countSwaps() instead.
   *
   * @returns {Array<{a:object, b:object, score:number}>}
   */
  listSwaps() {
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.isLocked(r, c)) continue;
        const around = [
          { r, c: c + 1 },
          { r: r + 1, c },
        ];
        for (let i = 0; i < around.length; i++) {
          const b = around[i];
          if (!this.inBounds(b) || this.isLocked(b.r, b.c)) continue;
          const a = { r, c };
          this.swapModel(a, b);
          const cells = this.findMatches();
          this.swapModel(a, b);
          if (cells.length > 0) out.push({ a, b, score: cells.length });
        }
      }
    }
    out.sort((x, y) => y.score - x.score);
    return out;
  }

  countSwaps() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.isLocked(r, c)) continue;
        const around = [
          { r, c: c + 1 },
          { r: r + 1, c },
        ];
        for (let i = 0; i < around.length; i++) {
          const b = around[i];
          if (!this.inBounds(b) || this.isLocked(b.r, b.c)) continue;
          const a = { r, c };
          this.swapModel(a, b);
          const hit = this.findMatches().length > 0;
          this.swapModel(a, b);
          if (hit) n++;
        }
      }
    }
    return n;
  }

  /**
   * Evaluate `fn` as if (r,c) were already encased, then put the board back.
   *
   * Purely a lookahead for the boss: nothing async may run inside `fn`, since
   * the placeholder sitting in `locks` is not a real ObsidianView.
   */
  probeLock(r, c, fn) {
    const prev = this.locks[r][c];
    this.locks[r][c] = PROBE;
    let out;
    try {
      out = fn();
    } finally {
      this.locks[r][c] = prev;
    }
    return out;
  }

  /**
   * Hold a cell as locked across several lookaheads.
   *
   * The boss picks its blocks one at a time and each pick has to see the board
   * the previous one left, so the placeholders have to outlive a single probe.
   * Every setProbe(true) owes a setProbe(false).
   */
  setProbe(r, c, on) {
    this.locks[r][c] = on ? PROBE : null;
  }

  /**
   * Encase a set of cells. Returns the cells that actually locked, so the
   * caller can aim the lava globs at them.
   *
   * Claimed, and therefore patient: the lava arrives on the boss's clock and the
   * player is swapping on their own, so a block that turned up in the middle of
   * a cascade would restack a board that was still falling.
   *
   * Two claims with an animation between them, rather than one around the whole
   * thing. A block is in `locks` the instant it is written, so the crust
   * hardening over it is only a picture and the player can go on swapping the
   * rest of the board through it. The restock afterwards moves gems, and that
   * has to have the board to itself.
   */
  async lockCells(cells) {
    // The wave waits out a swipe already in flight rather than landing on top
    // of it. See handsOff — bounded, so a parked thumb cannot stall the fight.
    await this.handsOff();
    // A block written over a gem the lesson has drawn somewhere else would
    // trap the wrong stone on screen.
    this.cancelPreview();
    const made = await this.claim(() => this.encase(cells));
    await Promise.all(made.map((m) => m.lock.form()));
    await this.claim(() => this.ensurePlayable());
    return made.map((m) => m.cell);
  }

  /** Write the blocks into the model and dim whatever they trap. */
  encase(cells) {
    // A stone the finger has dragged out of one of these cells is about to be
    // trapped in it. Put back first, or the block forms over the gap it left.
    this.homeLean();
    const made = [];
    cells.forEach((cell) => {
      if (!this.inBounds(cell) || this.isLocked(cell.r, cell.c)) return;
      const lock = new ObsidianView();
      lock.resize(this.cell);
      const p = this.cellPos(cell.r, cell.c);
      lock.x = p.x;
      lock.y = p.y;
      this.lockLayer.addChild(lock);
      this.locks[cell.r][cell.c] = lock;

      // Dim the gem underneath so the trap is obvious at a glance.
      const gem = this.grid[cell.r][cell.c];
      if (gem) {
        gem.glow.alpha = 0;
        tween(gem.sprite, { alpha: 0.35 }, 0.2);
      }
      made.push({ cell, lock });
    });
    if (made.length) sfx.obsidianForm(made.length);
    return made;
  }

  /** Every block orthogonally touching one of these cells cracks open. */
  async breakLocksNear(cells) {
    const hit = {};
    const targets = [];
    cells.forEach((cell) => {
      const around = [
        { r: cell.r - 1, c: cell.c },
        { r: cell.r + 1, c: cell.c },
        { r: cell.r, c: cell.c - 1 },
        { r: cell.r, c: cell.c + 1 },
      ];
      around.forEach((n) => {
        if (!this.isLocked(n.r, n.c)) return;
        const key = n.r * COLS + n.c;
        if (hit[key]) return;
        hit[key] = 1;
        targets.push(n);
      });
    });
    if (targets.length === 0) return 0;
    await this.releaseLocks(targets);
    return targets.length;
  }

  /** The healer's ultimate wipes the board clean of obsidian. */
  async clearAllObsidian() {
    const targets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.locks[r][c]) targets.push({ r, c });
      }
    }
    if (targets.length === 0) return 0;
    await this.releaseLocks(targets);
    return targets.length;
  }

  async releaseLocks(targets) {
    if (targets.length) sfx.obsidianBreak(targets.length);
    const jobs = targets.map((n, i) => {
      const lock = this.locks[n.r][n.c];
      if (!lock) return Promise.resolve();
      this.locks[n.r][n.c] = null;

      const gem = this.grid[n.r][n.c];
      if (gem) tween(gem.sprite, { alpha: 1 }, 0.25);
      if (this.onShatter) {
        this.onShatter(this.x + lock.x, this.y + lock.y);
      }
      return delay(i * 0.05)
        .then(() => lock.shatter())
        .then(() => lock.destroy({ children: true }));
    });
    await Promise.all(jobs);
  }

  /**
   * The board's frame: the blocks breathing, and the pair under the finger.
   *
   * Was updateLocks, when the blocks were the only thing in here that moved
   * on its own. The lean is the second — it is answering a pointer that fires
   * on its own schedule, and a chase that only advances when an event happens
   * stalls halfway home the moment a finger stops moving.
   */
  update(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lock = this.locks[r][c];
        if (lock) lock.update(dt);
      }
    }
    this.updateLean(dt);
  }

  /* ------------------------------------------------------------------- fx */

  /** Light up specific cells while the hint is nagging. */
  setHighlight(cells, on) {
    (cells || []).forEach((cell) => {
      const gem = this.grid[cell.r] && this.grid[cell.r][cell.c];
      if (gem) tween(gem.glow, { alpha: on ? 0.6 : 0 }, 0.25);
    });
  }

  dim(on) {
    tween(this.gemLayer, { alpha: on ? 0.45 : 1 }, 0.25);
  }

  /**
   * Board slides up into frame at the top of the creative.
   *
   * Takes its length from the caller — T.introIn, the one duration the whole
   * opening shares, so the board lands on the same frame as the boss, the party
   * and the HUD rather than a third of a second ahead of them. The overshoot is
   * kept: backOut over a longer span is a slower arrival, not a softer one.
   */
  async slideIn(layout, seconds) {
    const home = layout.board.y;
    this.y = layout.h + this.size * 0.2;
    this.alpha = 1;
    const d = seconds === undefined ? 0.55 : seconds;
    await tween(this, { y: home }, d, { ease: Ease.backOut });
  }
}
