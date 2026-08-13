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
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { rndInt } from "../core/rng.js";
import * as sfx from "../audio/sfx.js";

const GEM_TYPES = GEM_COLORS.length;
const SWIPE_RATIO = 0.34;

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
const MIN_SWAPS = 2;

/**
 * Alternating cell wash: a 5x5 still has to read as a grid.
 *
 * Light, where every version of this before it was dark. The basalt field was
 * bright where it cracked and the jewelled field was navy, so both could be
 * divided into cells by shading them — but the plaque's field is very nearly
 * black, and there is nothing left under it to take away. So the checker is put
 * in rather than taken out, in the rule's own gold so that the board reads as one
 * prop, and at an alpha that divides the cells without lighting them.
 */
const CELL_TINT = [0.07, 0.02];
const CELL_WASH = 0xe5ce8a;

export class Board extends Container {
  constructor() {
    super();

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
    /** Something is writing the grid: a swap, a cascade, obsidian. See claim(). */
    this.busy = false;

    /** Hooks the director subscribes to. */
    this.onPop = null;
    this.onInvalid = null;
    this.onInteract = null;
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

    this.build();
  }

  /* ------------------------------------------------------------ model init */

  /**
   * Deal the opening board.
   *
   * The hand-authored START_BOARD, every run — see DIFFICULTY.randomOpening.
   * It guarantees the tutorial swap is the most obvious move on screen, and it
   * guarantees the board a viewer sees is the board everybody else saw.
   *
   * The random path below is the opt-in. Its deal is rejected and retried until
   * it has no free match sitting on it and offers the same MIN_SWAPS the board
   * owes at every other moment, so the boss can take an option on turn one
   * without leaving the player stranded.
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
   * The frame is square and so is its opening, so it fills the box exactly and
   * the grid is simply what the rule leaves inside it. The scaling this used to
   * do unevenly, to square up a painted opening that was not, went with the
   * painting — see art/boardframe.js.
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

    fitBoardFrame(this.plate, (this.size - fw) / 2, (this.size - fh) / 2, fw);

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
        const inset = cell * 0.06;
        g.roundRect(
          this.originX + c * cell + inset,
          this.originY + r * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
          cell * 0.2,
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
  }

  handleMove(e) {
    if (!this.drag || this.drag.fired || !this.inputEnabled) return;
    const p = e.getLocalPosition(this);
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    const threshold = this.cell * SWIPE_RATIO;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    const dir =
      Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };
    const target = {
      r: this.drag.start.r + dir.r,
      c: this.drag.start.c + dir.c,
    };
    this.drag.fired = true;
    const from = this.drag.start;
    this.drag = null;
    this.clearSelection();
    if (this.inBounds(target)) this.attemptSwap(from, target);
  }

  handleUp(e) {
    const drag = this.drag;
    this.drag = null;
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
    return new Promise((resolve) => {
      this.moveResolver = resolve;
    });
  }

  lockInput() {
    this.inputEnabled = false;
    this.drag = null;
    this.clearSelection();
  }

  /**
   * Drop the pending waitForMove without resolving it.
   *
   * The player can now spend Nyx instead of swapping, so the turn is a race
   * between two inputs. Whichever loses has to stop listening, or the next
   * swap would resolve a turn that was already spent.
   */
  cancelWait() {
    this.moveResolver = null;
    this.lockInput();
  }

  async attemptSwap(a, b) {
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
    await this.animateSwap(ga, gb, 0.15);
    this.swapModel(a, b);

    if (this.findMatches().length === 0) {
      // Soft failure: no red, no buzzer — just put it back and re-hint.
      this.swapModel(a, b);
      sfx.reject();
      await this.animateSwap(ga, gb, 0.13);
      this.busy = false;
      this.inputEnabled = true;
      if (this.onInvalid) this.onInvalid();
      return;
    }

    this.busy = false;
    const resolver = this.moveResolver;
    this.moveResolver = null;
    if (resolver) resolver({ a, b });
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

  animateSwap(ga, gb, dur) {
    const ax = ga.x;
    const ay = ga.y;
    return Promise.all([
      tween(ga, { x: gb.x, y: gb.y }, dur, { ease: Ease.quadInOut }),
      tween(gb, { x: ax, y: ay }, dur, { ease: Ease.quadInOut }),
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
   * Settles once nothing is writing the grid.
   *
   * For a reader rather than a writer: the boss scores the board before it aims
   * its lava, and a board halfway through a cascade is holding empty cells and
   * gems that are still falling — it would be scoring a position nobody is
   * looking at.
   */
  async whenQuiet() {
    while (this.busy) await delay(0.04);
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
        await delay(0.02);
      }
      await this.ensurePlayable();
      return step;
    });
  }

  /** Blow up a set of cells. */
  async popCells(cells) {
    const jobs = cells.map((cell, i) => {
      const gem = this.grid[cell.r][cell.c];
      if (!gem) return Promise.resolve();
      this.grid[cell.r][cell.c] = null;
      if (this.onPop) {
        this.onPop(this.x + gem.x, this.y + gem.y, gem.type);
      }
      gem.glow.alpha = 0.8;
      return tween(gem.scale, { x: 1.35, y: 1.35 }, 0.09, {
        delay: i * 0.012,
      })
        .then(() =>
          Promise.all([
            tween(gem.scale, { x: 0, y: 0 }, 0.16, { ease: Ease.backIn }),
            tween(gem, { alpha: 0 }, 0.16),
          ]),
        )
        .then(() => this.recycle(gem));
    });
    await Promise.all(jobs);
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
      const dur = Math.min(0.42, 0.15 + dist * 0.055);
      f.gem.x = p.x;
      return tween(f.gem, { y: p.y }, dur, { ease: Ease.quadIn }).then(() =>
        tween(f.gem.scale, { y: 0.86, x: 1.12 }, 0.06).then(() =>
          tween(f.gem.scale, { y: 1, x: 1 }, 0.14, { ease: Ease.backOut }),
        ),
      );
    });
    this.falling = [];
    await Promise.all(jobs);
  }

  /** Wipe every gem of one element — the Nyx ultimate. */
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
   * @returns {Promise<boolean>} whether a reshuffle was needed
   */
  async ensurePlayable() {
    if (this.countSwaps() >= MIN_SWAPS) return false;

    const free = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.locks[r][c] && this.grid[r][c]) free.push({ r, c });
      }
    }
    if (free.length < 2) return false;

    const gems = free.map((p) => this.grid[p.r][p.c]);
    const deal = (order) =>
      free.forEach((p, i) => {
        this.grid[p.r][p.c] = order[i];
      });

    // Keep the best arrangement seen rather than the last one tried: a board
    // this boxed in by obsidian may have no perfect permutation at all, and
    // one legal move beats giving up and inventing gems.
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
      const swaps = this.countSwaps();
      if (swaps >= MIN_SWAPS) {
        best = gems.slice();
        break;
      }
      if (!best || swaps > best.swaps) {
        const snapshot = gems.slice();
        snapshot.swaps = swaps;
        best = snapshot;
      }
    }
    if (best) deal(best);

    sfx.shuffle();
    if (this.onShuffle) this.onShuffle();
    await this.slideShuffle(free);
    return true;
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
    const made = await this.claim(() => this.encase(cells));
    await Promise.all(made.map((m) => m.lock.form()));
    await this.claim(() => this.ensurePlayable());
    return made.map((m) => m.cell);
  }

  /** Write the blocks into the model and dim whatever they trap. */
  encase(cells) {
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

  /** The Nyx ultimate wipes the board clean of obsidian. */
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

  updateLocks(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lock = this.locks[r][c];
        if (lock) lock.update(dt);
      }
    }
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

  /** Board slides up into frame at the top of the creative. */
  async slideIn(layout) {
    const home = layout.board.y;
    this.y = layout.h + this.size * 0.2;
    this.alpha = 1;
    await tween(this, { y: home }, 0.55, { ease: Ease.backOut });
  }
}
