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

const REFUSE_GAP = 0.22;

const FOCUS_KEEP = 6;

function glowTo(gem, alpha, seconds) {
  if (!gem) return;
  killTweensOf(gem.glow);
  tween(gem.glow, { alpha }, seconds);
}

const SWAP_TIME = 0.22;
const REVERT_TIME = 0.2;

const PREVIEW_HOME = 0.18;

const LEAN_MAX = 0.3;

const LEAN_REFUSE = 0.1;

const LEAN_HOME = 0.14;

const LEAN_CHASE = 0.022;

const LEAN_HYST = 1.4;

const POP_SWELL = 0.1;
const POP_COLLAPSE = 0.17;

const CHARGE_HOLD = 0.12;
const CHARGE_LIFE = 0.32;

const POP_HANDOVER = 0.6;

const POOL_SPARE = 8;

const PROBE = { probe: true };

export const MIN_SWAPS = 2;

const SHUFFLE_TARGET = 4;

const SHUFFLE_GAP = 2.0;

const SHUFFLE_TELL = 0.22;
const SHUFFLE_SETTLE = 0.16;

const CELL_TINT = [0.07, 0.02];
const CELL_WASH = 0xe5ce8a;

export class Board extends Container {
  constructor() {
    super();
    globalThis.__board = this;

    this.plate = boardFrameSprite();
    if (this.plate) this.addChild(this.plate);

    this.frame = new Graphics();
    this.addChild(this.frame);

    this.field = new Container();
    this.addChild(this.field);

    this.gemLayer = new Container();
    this.field.addChild(this.gemLayer);

    this.lockLayer = new Container();
    this.field.addChild(this.lockLayer);

    this.fieldMask = new Graphics();
    this.addChild(this.fieldMask);
    this.field.mask = this.fieldMask;

    this.grid = [];
    this.locks = [];
    this.pool = [];
    this.cell = 64;
    this.size = 320;
    this.originX = 0;
    this.originY = 0;

    this.inputEnabled = false;
    this.moveResolver = null;
    this.pendingMove = null;
    this.quiet = [];
    this.busy = false;
    this.lastShuffle = -Infinity;
    this.preview = null;
    this.previewToken = 0;

    this.onCharge = null;
    this.onPop = null;
    this.onInvalid = null;
    this.onInteract = null;
    this.onTouchStart = null;
    this.onTouchMove = null;
    this.onTouchEnd = null;
    this.onShatter = null;
    this.onShuffle = null;
    this.onIntercept = null;

    this.eventMode = "static";
    this.hitArea = new Rectangle(0, 0, this.size, this.size);
    this.on("pointerdown", this.handleDown, this);
    this.on("pointermove", this.handleMove, this);
    this.on("pointerup", this.handleUp, this);
    this.on("pointerupoutside", this.handleUp, this);

    this.drag = null;
    this.selected = null;
    this.selectedGem = null;
    this.highlit = null;
    this.pressed = null;
    this.refusedAt = 0;
    this.lean = null;
    this.focus = [];

    this.build();
    this.prewarm();
  }

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
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) this.grid[r][c].setType(START_BOARD[r][c]);
    }
  }

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
    killTweensOf(gem.glow);
    gem.glow.alpha = 0;
    killTweensOf(gem.scale);
    this.forget(gem);
    this.pool.push(gem);
  }

  forget(gem) {
    if (this.selectedGem === gem) {
      this.selected = null;
      this.selectedGem = null;
    }
    if (this.highlit) this.highlit = this.highlit.filter((g) => g !== gem);
  }

  resize(layout) {
    this.size = layout.board.size;
    this.x = layout.board.x;
    this.y = layout.board.y;
    this.hitArea = new Rectangle(0, 0, this.size, this.size);

    this.fitFrame();
    this.drawFrame();

    this.preview = null;
    this.previewToken++;
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

  fitFrame() {
    if (!this.plate) {
      this.originX = 0;
      this.originY = 0;
      this.cell = this.size / COLS;
      return;
    }

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
        const inset = cell * 0.1;
        g.roundRect(
          this.originX + c * cell + inset,
          this.originY + r * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
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

  cellAt(x, y) {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((y - this.originY) / this.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  handleDown(e) {
    if (this.onInteract) this.onInteract();
    const p = e.getLocalPosition(this);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    if (!this.inputEnabled) {
      this.refuse();
      return;
    }
    this.drag = { start: cell, x: p.x, y: p.y, fired: false };
    this.noteFocus(cell);
    this.press(cell);
    if (this.onTouchStart) this.onTouchStart(p.x, p.y);
  }

  press(cell) {
    this.letGo();
    if (this.busy) {
      this.refuse();
      return;
    }
    if (this.locks[cell.r] && this.locks[cell.r][cell.c]) {
      this.refuse();
      return;
    }
    const gem = this.grid[cell.r][cell.c];
    if (!gem || gem.destroyed) return;
    sfx.select();
    this.pressed = gem;
    if (gem.parent) {
      gem.parent.setChildIndex(gem, gem.parent.children.length - 1);
    }
    killTweensOf(gem.scale);
    tween(gem.scale, { x: 1.1, y: 1.1 }, 0.1, { ease: Ease.backOutHard });
  }

  letGo() {
    this.homeLean();
    const gem = this.pressed;
    this.pressed = null;
    if (!gem || gem.destroyed) return;
    killTweensOf(gem.scale);
    tween(gem.scale, { x: 1, y: 1 }, 0.16, { ease: Ease.backOut });
  }

  refuse() {
    const t = now();
    if (this.refusedAt && t - this.refusedAt < REFUSE_GAP) return;
    this.refusedAt = t;
    sfx.knock();
  }

  leanTo(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < 1 && ay < 1) return null;

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
    if (!gem || this.busy) return dir;

    const to = { r: start.r + dir.r, c: start.c + dir.c };
    const open =
      this.inBounds(to) &&
      !this.isLocked(start.r, start.c) &&
      !this.isLocked(to.r, to.c);
    const partner = open ? this.grid[to.r][to.c] : null;

    if (!held || held.gem !== gem) {
      const at = this.cellPos(start.r, start.c);
      if (Math.hypot(gem.x - at.x, gem.y - at.y) > this.cell * 0.25) {
        return dir;
      }
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
      this.homeStone(lean.partner, lean.pcell);
      lean.partner = partner;
      lean.pcell = partner ? to : null;
      if (partner) {
        killTweensOf(partner);
        this.noteFocus(to);
      }
    }

    const reach = this.cell * (partner ? LEAN_MAX : LEAN_REFUSE);
    const raw = horiz ? dx : dy;
    lean.off = Math.max(-reach, Math.min(reach, raw));
    return dir;
  }

  noteFocus(cell) {
    if (!cell) return;
    this.focus = this.focus.filter((f) => f.r !== cell.r || f.c !== cell.c);
    this.focus.unshift({ r: cell.r, c: cell.c, at: now() });
    if (this.focus.length > FOCUS_KEEP) this.focus.length = FOCUS_KEEP;
  }

  focusedCells(within) {
    const cut = now() - within;
    return this.focus.filter((f) => f.at >= cut);
  }

  wouldMatch(a, b) {
    this.swapModel(a, b);
    const made = this.findMatches().length > 0;
    this.swapModel(a, b);
    return made;
  }

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

  homeLean() {
    const lean = this.lean;
    if (!lean) return;
    this.lean = null;
    this.homeStone(lean.gem, lean.cell);
    this.homeStone(lean.partner, lean.pcell);
  }

  homeStone(gem, cell) {
    if (!gem || !cell || gem.destroyed) return;
    if (this.grid[cell.r][cell.c] !== gem) return;
    const p = this.cellPos(cell.r, cell.c);
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
    if (this.onTouchEnd) this.onTouchEnd();
    this.clearSelection();
    if (this.inBounds(target)) this.attemptSwap(from, target);
    else this.refuse();
  }

  handleUp(e) {
    const drag = this.drag;
    this.drag = null;
    this.letGo();
    if (!drag || !drag.fired) {
      if (this.onTouchEnd) this.onTouchEnd();
    }
    if (!drag || drag.fired || !this.inputEnabled) return;

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
    this.clearSelection();
    this.selected = cell;
    this.selectedGem = this.grid[cell.r][cell.c];
    glowTo(this.selectedGem, 0.55, 0.12);
  }

  clearSelection() {
    if (!this.selected) return;
    const gem = this.selectedGem;
    this.selected = null;
    this.selectedGem = null;
    glowTo(gem, 0, 0.15);
  }

  inBounds(cell) {
    return cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS;
  }

  isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  waitForMove() {
    this.inputEnabled = true;
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

  armInput() {
    this.inputEnabled = true;
  }

  lockInput() {
    this.inputEnabled = false;
    this.drag = null;
    this.letGo();
    this.clearSelection();
  }

  cancelWait() {
    this.moveResolver = null;
    this.lockInput();
  }

  async attemptSwap(a, b) {
    this.cancelPreview();
    if (this.busy) return;

    if (this.isLocked(a.r, a.c) || this.isLocked(b.r, b.c)) {
      this.nudgeLock(this.isLocked(a.r, a.c) ? a : b);
      if (this.onInvalid) this.onInvalid();
      return;
    }

    if (this.onIntercept && this.wouldMatch(a, b)) {
      const taken = this.onIntercept(a, b);
      if (taken) {
        this.refuse();
        this.homeLean();
        this.shrug(this.grid[a.r][a.c], this.grid[b.r][b.c]);
        if (this.onInvalid) this.onInvalid();
        return;
      }
    }

    this.busy = true;
    this.inputEnabled = false;
    sfx.swap();

    const ga = this.grid[a.r][a.c];
    const gb = this.grid[b.r][b.c];
    const pa = this.cellPos(b.r, b.c);
    const pb = this.cellPos(a.r, a.c);
    await this.animateSwap(ga, gb, SWAP_TIME, pa, pb);
    this.swapModel(a, b);

    if (this.findMatches().length === 0) {
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
    else this.pendingMove = { a, b };
  }

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

  cancelPreview(glide) {
    this.previewToken++;
    if (!this.preview) return;
    this.preview = null;
    if (glide) this.glideGems();
    else this.snapGems();
  }

  glideGems(dur) {
    const jobs = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem) continue;
        killTweensOf(gem);
        const p = this.cellPos(r, c);
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

  snapGems() {
    this.lean = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem) continue;
        killTweensOf(gem);
        const p = this.cellPos(r, c);
        gem.x = p.x;
        gem.y = p.y;
        gem.rotation = 0;
      }
    }
  }

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

  shrug(ga, gb) {
    [ga, gb].forEach((gem, i) => {
      if (!gem) return;
      killTweensOf(gem);
      gem.rotation = i ? -0.19 : 0.19;
      tween(gem, { rotation: 0 }, 0.42, { ease: Ease.elasticOut });
    });
  }

  nudgeLock(cell) {
    const lock = this.locks[cell.r] && this.locks[cell.r][cell.c];
    if (!lock) return;
    this.refuse();
    killTweensOf(lock.slab);
    lock.slab.rotation = 0;
    tween(lock.slab, { rotation: 0.16 }, 0.06)
      .then(() => tween(lock.slab, { rotation: -0.16 }, 0.09))
      .then(() => tween(lock.slab, { rotation: 0 }, 0.09));
  }

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

  animateSwap(ga, gb, dur, pa, pb) {
    const to = pa || { x: gb.x, y: gb.y };
    const back = pb || { x: ga.x, y: ga.y };

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

  typeAt(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    if (this.locks[r][c]) return -1;
    const gem = this.grid[r][c];
    return gem ? gem.type : -1;
  }

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

  async whenQuiet() {
    while (this.busy) await new Promise((resolve) => this.quiet.push(resolve));
  }

  async handsOff(cap) {
    const until = now() + (cap === undefined ? 0.7 : cap);
    while (this.drag && now() < until) await delay(0.04);
  }

  async claim(job) {
    await this.whenQuiet();
    this.clearSelection();
    this.busy = true;
    try {
      return await job();
    } finally {
      this.busy = false;
    }
  }

  resolve(onStep) {
    return this.claim(async () => {
      let step = 0;
      for (;;) {
        const cells = this.findMatches();
        if (cells.length === 0) break;
        step++;
        sfx.match(step, cells.length, this.typeAt(cells[0].r, cells[0].c));
        await this.chargeCells(cells);
        if (onStep) onStep(step, cells);
        await Promise.all([this.popCells(cells), this.breakLocksNear(cells)]);
        this.applyGravity();
        this.refill(step);
        await this.animateFalls();
      }
      await this.ensurePlayable();
      return step;
    });
  }

  async chargeCells(cells) {
    cells.forEach((cell) => {
      const gem = this.grid[cell.r][cell.c];
      if (!gem || gem.destroyed) return;
      glowTo(gem, 1, CHARGE_HOLD);
      if (this.onCharge) {
        this.onCharge(this.x + gem.x, this.y + gem.y, gem.type, CHARGE_LIFE);
      }
    });
    await delay(CHARGE_HOLD);
  }

  async popCells(cells) {
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

      killTweensOf(gem.scale);

      const reach = Math.hypot(cell.r - mr, cell.c - mc);
      const spin = ((cell.r + cell.c) % 2 ? 1 : -1) * 0.55;

      gem.glow.alpha = 1;
      const swell = tween(gem.scale, { x: 1.42, y: 1.42 }, POP_SWELL, {
        delay: reach * 0.028,
        ease: Ease.backOutHard,
      });
      gone.push(swell.then(() => delay(POP_COLLAPSE * POP_HANDOVER)));
      swell
        .then(() =>
          Promise.all([
            tween(gem.scale, { x: 0, y: 0 }, POP_COLLAPSE, {
              ease: Ease.expoIn,
            }),
            tween(gem, { rotation: spin }, POP_COLLAPSE, {
              ease: Ease.quadIn,
            }),
            tween(gem, { alpha: 0 }, 0.09, { delay: 0.08 }),
          ]),
        )
        .then(() => this.recycle(gem));
    });
    this.ripple(cells);
    await Promise.all(gone);
  }

  ripple(cells) {
    const REACH = 2;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r][c];
        if (!gem || gem.destroyed) continue;
        if (this.locks[r] && this.locks[r][c]) continue;

        let near = REACH;
        for (let i = 0; i < cells.length; i++) {
          const d = Math.hypot(cells[i].r - r, cells[i].c - c);
          if (d < near) near = d;
        }
        if (near >= REACH) continue;

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

  flatten(r, amount, seconds) {
    for (let c = 0; c < COLS; c++) {
      const gem = this.grid[r] && this.grid[r][c];
      if (!gem || gem.destroyed) continue;
      if (this.locks[r] && this.locks[r][c]) continue;
      delay(Math.abs(c - (COLS - 1) / 2) * 0.014).then(() => {
        if (this.destroyed || gem.destroyed) return;
        if (this.grid[r][c] !== gem) return;
        punch(gem, -amount, seconds, { axis: "y" });
      });
    }
  }

  applyGravity() {
    this.falling = [];
    this.holes = [];
    for (let c = 0; c < COLS; c++) {
      let bottom = ROWS - 1;
      for (let r = ROWS - 1; r >= -1; r--) {
        if (r >= 0 && !this.locks[r][c]) continue;
        this.compactSegment(c, r + 1, bottom);
        bottom = r - 1;
      }
    }
  }

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
    for (let r = write; r >= top; r--) this.holes.push({ r, c, low: write });
  }

  refill(step) {
    const fresh = [];

    (this.holes || []).forEach((hole) => {
      const { r, c } = hole;
      const type = this.safeType(r, c);
      const gem = this.obtainGem(type);
      const p = this.cellPos(r, c);
      gem.x = p.x;
      gem.y = p.y - (hole.low - r + 1.4) * this.cell;
      gem.alpha = 1;
      this.grid[r][c] = gem;
      fresh.push({ gem, r, c });
      this.falling.push({ gem, r, c });
    });
    this.holes = [];

    if (DIFFICULTY.rigCascades && step < 3) this.plantMatch(fresh);
  }

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

  plantMatch(fresh) {
    if (fresh.length < 3) return;
    const type = fresh[0].gem.type;

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

    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i];
      const below = this.typeAt(f.r + 1, f.c);
      if (below >= 0 && below === this.typeAt(f.r + 2, f.c)) {
        f.gem.setType(below);
        return;
      }
    }
  }

  async animateFalls() {
    sfx.drop((this.falling || []).length);
    const jobs = (this.falling || []).map((f) => {
      const p = this.cellPos(f.r, f.c);
      const dist = Math.abs(f.gem.y - p.y) / this.cell;
      const dur = Math.min(0.46, 0.19 + dist * 0.058);
      killTweensOf(f.gem);
      const weight = Math.min(1, 0.3 + dist * 0.2);

      const stretch = 0.06 + 0.15 * weight;
      killTweensOf(f.gem.scale);
      tween(f.gem.scale, { x: 1 - stretch * 0.5, y: 1 + stretch }, dur, {
        ease: Ease.quadIn,
      });

      return tween(f.gem, { x: p.x, y: p.y, rotation: 0 }, dur, {
        ease: Ease.quadIn,
      }).then(() =>
        punch(f.gem, 0.2 * weight, 0.26 + 0.1 * weight, { axis: "x" }),
      );
    });
    this.falling = [];
    await Promise.all(jobs);
  }

  async clearElement(type) {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.typeAt(r, c) === type) cells.push({ r, c });
      }
    }
    if (cells.length === 0) return 0;

    await this.claim(async () => {
      await this.chargeCells(cells);
      await this.popCells(cells);
      this.applyGravity();
      this.refill(0);
      await this.animateFalls();
    });
    await this.resolve(null);
    return cells.length;
  }

  async ensurePlayable() {
    const swaps = this.countSwaps();
    if (swaps >= MIN_SWAPS) return false;

    if (swaps > 0 && now() - this.lastShuffle < SHUFFLE_GAP) return false;

    const free = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.locks[r][c] && this.grid[r][c]) free.push({ r, c });
      }
    }
    if (free.length < 2) return false;

    const gems = free.map((p) => this.grid[p.r][p.c]);
    const original = gems.slice();
    const deal = (order) =>
      free.forEach((p, i) => {
        this.grid[p.r][p.c] = order[i];
      });

    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = rndInt(i + 1);
        const g = gems[i];
        gems[i] = gems[j];
        gems[j] = g;
      }
      deal(gems);
      if (this.findMatches().length > 0) continue;
      const found = this.countSwaps();
      if (!best || found > best.swaps) {
        best = { order: gems.slice(), swaps: found };
      }
      if (found >= SHUFFLE_TARGET) break;
    }

    deal(original);
    if (!best || best.swaps <= swaps) return false;

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

  async tellShuffle(cells) {
    if (this.drag && this.onTouchEnd) this.onTouchEnd();
    this.drag = null;
    this.clearSelection();
    await Promise.all(
      cells.map((p, i) => {
        const gem = this.grid[p.r][p.c];
        if (!gem) return Promise.resolve();
        glowTo(gem, 0.5, SHUFFLE_TELL);
        return tween(gem.scale, { x: 0.78, y: 0.78 }, SHUFFLE_TELL, {
          delay: (i % COLS) * 0.012,
          ease: Ease.quadIn,
        });
      }),
    );
  }

  async settleShuffle(cells) {
    await Promise.all(
      cells.map((p) => {
        const gem = this.grid[p.r][p.c];
        if (!gem) return Promise.resolve();
        glowTo(gem, 0, SHUFFLE_SETTLE);
        return tween(gem.scale, { x: 1, y: 1 }, SHUFFLE_SETTLE, {
          ease: Ease.backOut,
        });
      }),
    );
  }

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
          if (cells.length > 0) out.push({ a, b, score: cells.length, cells });
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

  setProbe(r, c, on) {
    this.locks[r][c] = on ? PROBE : null;
  }

  async lockCells(cells, opts) {
    if (!(opts && opts.onto)) await this.handsOff();
    this.cancelPreview();
    const made = await this.claim(() => this.encase(cells));
    await Promise.all(made.map((m) => m.lock.form()));
    await this.claim(() => this.ensurePlayable());
    return made.map((m) => m.cell);
  }

  encase(cells) {
    this.homeLean();
    const made = [];
    cells.forEach((cell) => {
      if (!this.inBounds(cell) || this.isLocked(cell.r, cell.c)) return;
      const lock = new ObsidianView();
      lock.resize(this.cell);
      lock.setArmor(cell.crust || 0);
      const p = this.cellPos(cell.r, cell.c);
      lock.x = p.x;
      lock.y = p.y;
      this.lockLayer.addChild(lock);
      this.locks[cell.r][cell.c] = lock;

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

    const crusted = targets.filter((n) => this.armorAt(n.r, n.c) > 0);
    const broken = targets.filter((n) => this.armorAt(n.r, n.c) <= 0);
    this.chipLocks(crusted);
    await this.releaseLocks(broken);
    return broken.length;
  }

  armorAt(r, c) {
    if (!this.inBounds({ r, c })) return 0;
    const lock = this.locks[r][c];
    return lock && lock.armor ? lock.armor : 0;
  }

  chipLocks(targets) {
    if (!targets.length) return 0;
    sfx.obsidianChip(targets.length);
    targets.forEach((n) => {
      const lock = this.locks[n.r][n.c];
      if (lock && lock.chip) lock.chip();
    });
    return targets.length;
  }

  async clearAllObsidian() {
    const targets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.locks[r][c]) targets.push({ r, c });
      }
    }
    if (targets.length === 0) return 0;
    await this.releaseLocks(targets);
    await this.resolve(null);
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

  update(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lock = this.locks[r][c];
        if (lock) lock.update(dt);
      }
    }
    this.updateLean(dt);
  }

  setHighlight(cells, on) {
    (this.highlit || []).forEach((gem) => glowTo(gem, 0, 0.25));
    this.highlit = null;
    if (!on) return;
    this.highlit = (cells || [])
      .map((cell) => this.grid[cell.r] && this.grid[cell.r][cell.c])
      .filter(Boolean);
    this.highlit.forEach((gem) => glowTo(gem, 0.6, 0.25));
  }

  dim(on) {
    tween(this.gemLayer, { alpha: on ? 0.45 : 1 }, 0.25);
  }

  async slideIn(layout, seconds) {
    const home = layout.board.y;
    this.y = layout.h + this.size * 0.2;
    this.alpha = 1;
    const d = seconds === undefined ? 0.55 : seconds;
    await tween(this, { y: home }, d, { ease: Ease.backOut });
  }
}
