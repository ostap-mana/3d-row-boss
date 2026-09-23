import { Container, Graphics } from "pixi.js";
import { GEM_LIGHT } from "../config.js";
import { tween, delay, killTweensOf } from "../core/tween.js";
import {
  hintArrowSprite,
  hintFrameSprite,
  hintMarksReady,
} from "../art/hintmarks.js";
import { READY_SCALE, READY_SWING } from "../art/heroes.js";
import { MatchLink } from "./matchlink.js";

const HOLD = 0.62;
const TRAVEL = 0.4;
const RETURN = 0.26;
const REST = 0.5;
const COLD_BEAT = 0.14;
const REST_ALPHA = 0.42;

const CARD_BEAT = 2.2;

const FRAME_SPAN = 0.88;

const ARROW_SPAN = 0.62;

const CARD_PAD = 0;

const CARD_HOLE_PAD = 0;

const CARD_BREATH = 0.4;

const CARD_READY = READY_SCALE * (1 + CARD_BREATH * READY_SWING);

const same = (a, b) => a.r === b.r && a.c === b.c;

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
      if (type < 0) return;
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

function litLines(cells, typeOf) {
  const key = (r, c) => `${r},${c}`;
  const set = new Set(cells.map((cell) => key(cell.r, cell.c)));
  const taken = new Set();
  const out = [];

  [
    [0, 1],
    [1, 0],
  ].forEach(([dr, dc]) => {
    cells.forEach((cell) => {
      const type = typeOf(cell.r, cell.c);
      if (type < 0) return;
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
      if (line.length < 2) return;
      if (line.some((p) => taken.has(key(p.r, p.c)))) return;
      line.forEach((p) => taken.add(key(p.r, p.c)));
      out.push({ cells: line, type });
    });
  });

  cells.forEach((cell) => {
    if (taken.has(key(cell.r, cell.c))) return;
    taken.add(key(cell.r, cell.c));
    out.push({ cells: [cell], type: typeOf(cell.r, cell.c) });
  });

  return out;
}

function swapRuns(board, shape) {
  const { from, to, run } = shape;
  const landed = (r, c) => {
    if (r === from.r && c === from.c) return board.typeAt(to.r, to.c);
    if (r === to.r && c === to.c) return board.typeAt(from.r, from.c);
    return board.typeAt(r, c);
  };
  return straightRuns(run, landed);
}

function lessonElement(board, shape, runs) {
  const runAt = (cell) =>
    runs.find((group) => group.cells.some((p) => same(p, cell)));
  const line = runAt(shape.from) || runAt(shape.to);
  return line ? line.type : board.typeAt(shape.from.r, shape.from.c);
}

export class Coach extends Container {
  constructor() {
    super();
    globalThis.__coach = this;

    this.marks = new Graphics();
    this.link = new MatchLink();
    this.kit = new Container();
    this.addChild(this.marks, this.link, this.kit);
    this.painted = null;
    this.last = null;
    this.cardAt = null;
    this.spot = null;
    this.focus = null;
    this.opening = false;

    this.alpha = 0;
    this.visible = false;
    this.token = 0;
  }

  useSpotlight(spot) {
    this.spot = spot;
  }

  resize() {
    if (!this.last) {
      this.clearMarks();
      return;
    }
    this.reaim();
    if (this.last.card) {
      this.drawCard(this.last.card, this.last.type);
      return;
    }
    this.draw(this.last.board, this.last.step);
  }

  stop() {
    this.token++;
    killTweensOf(this);
    this.last = null;
    this.clearMarks();
    this.alpha = 0;
    this.visible = false;
    this.focus = null;
    this.opening = false;
    if (this.spot) this.spot.hide();
  }

  update(dt) {
    this.link.update(dt);
  }

  clearMarks() {
    this.marks.clear();
    this.link.clear();
    if (!this.painted) return;
    this.painted.arrow.visible = false;
    this.painted.pool.forEach((list) =>
      list.forEach((f) => (f.visible = false)),
    );
    this.painted.used = [];
  }

  spotOn(board, cells, type) {
    if (!this.spot) return;
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

  reaim() {
    const spot = this.spot;
    const focus = this.focus;
    if (!spot || !focus) return;

    if (!this.opening) {
      spot.hide();
      return;
    }

    if (focus.card) {
      const box = this.cardBox(focus.card);
      if (!box) return;
      spot.aim(
        {
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          pad: (focus.card.cardW || 0) * CARD_HOLE_PAD,
        },
        this.opening,
      );
      return;
    }

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

  async cardBeat(id, card, hand, type) {
    this.last = null;
    this.clearMarks();
    hand.stop();

    const shade = card.hero ? card.hero.element : type;

    this.drawCard(card, shade);
    if (!this.cardAt) return;
    hand.setElement(shade);
    hand.tapLoop(this.cardAt);

    await tween(this, { alpha: 1 }, 0.2);
    if (id !== this.token) return;
    await delay(CARD_BEAT);
    if (id !== this.token) return;

    hand.stop();
    this.last = null;
    this.clearMarks();
    await tween(this, { alpha: REST_ALPHA }, 0.22);
  }

  async play(board, hand, shape, solve, cold = false, cardFor = null) {
    const id = ++this.token;
    this.visible = true;
    this.opening = !!cold;
    let live = shape;
    let open = cold;
    while (id === this.token) {
      while (board.busy) {
        await delay(0.12);
        if (id !== this.token) return;
      }

      const next =
        board.matchShape(live.to, live.from) || (solve ? solve() : null);
      if (!next) {
        this.stop();
        return;
      }
      if (!same(next.from, live.from) || !same(next.to, live.to)) {
        this.last = null;
        this.clearMarks();
        this.alpha = 0;
      }
      live = next;

      await this.lesson(id, board, hand, live, open);
      open = false;
      if (id !== this.token) return;

      const type = lessonElement(board, live, swapRuns(board, live));
      const card = cardFor && cardFor(type);
      if (card) {
        await this.cardBeat(id, card, hand, type);
        if (id !== this.token) return;
      }

      await delay(REST);
    }
  }

  async playCard(card, hand, type) {
    const id = ++this.token;
    this.visible = true;
    this.opening = false;
    hand.setElement(type);
    this.drawCard(card, type);
    hand.tapLoop(this.cardAt);

    await tween(this, { alpha: 1 }, 0.2);
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

  cardBox(card) {
    const w = card.cardW || 0;
    const h = card.cardH || 0;
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
      r: Math.min(cw, ch) * 0.18,
    };
  }

  drawCard(card, type) {
    this.last = { card, type };
    const box = this.cardBox(card);
    if (!box) return;

    if (this.cardAt) {
      this.cardAt.x = card.x;
      this.cardAt.y = card.y;
    } else {
      this.cardAt = { x: card.x, y: card.y };
    }

    this.focus = { card, type };
    this.reaim();
  }

  async lesson(id, board, hand, shape, cold = false) {
    const { from, to, run, rest } = shape;

    const target = swapRuns(board, shape);
    const type = lessonElement(board, shape, target);
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    this.spotOn(board, rest.concat([from, to], run), type);

    const show = (step) => this.draw(board, { type, color, ...step });

    show({ lit: rest, joined: target });
    if (cold) {
      killTweensOf(this);
      this.alpha = 1;
    } else {
      await tween(this, { alpha: 1 }, 0.2);
      if (id !== this.token) return;
    }
    await delay(cold ? COLD_BEAT : 0.28);
    if (id !== this.token) return;

    const lit = rest.some((cell) => same(cell, from))
      ? rest
      : rest.concat([from]);
    show({ lit, from, to, joined: target });
    await delay(cold ? COLD_BEAT : 0.34);
    if (id !== this.token) return;

    const a = board.cellPos(from.r, from.c);
    const b = board.cellPos(to.r, to.c);
    hand.setElement(type);
    const grip = await hand.reach(board.x + a.x, board.y + a.y);
    if (!grip || id !== this.token) return;

    if (
      board.busy ||
      board.isLocked(from.r, from.c) ||
      board.isLocked(to.r, to.c)
    ) {
      hand.leave(grip);
      return;
    }

    show({ lit: rest, joined: target });
    const [, moved] = await Promise.all([
      hand.slideTo(grip, board.x + b.x, board.y + b.y, TRAVEL),
      board.previewSwap(from, to, TRAVEL),
    ]);
    if (id !== this.token) return;
    if (!moved) {
      hand.leave(grip);
      return;
    }

    show({ lit: run, joined: target });

    hand.leave(grip);
    const home = board.previewSwap(from, to, RETURN, true);
    await home;
    if (id !== this.token) return;

    show({ lit: rest, joined: target });
    await delay(Math.max(0, HOLD - RETURN));
    if (id !== this.token) return;
    await tween(this, { alpha: REST_ALPHA }, 0.22);
  }

  draw(board, step) {
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

    const frame = (cells, type) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      cells.forEach((cell) => {
        const p = at(cell);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      });
      const el = type < 0 ? step.type : type;
      boxes.push({
        x: x0 - span / 2,
        y: y0 - span / 2,
        w: x1 - x0 + span,
        h: y1 - y0 + span,
        type: el,
        color: GEM_LIGHT[el] === undefined ? step.color : GEM_LIGHT[el],
      });
    };

    (joined || []).forEach((group) => frame(group.cells, group.type));

    const loose = (step.lit || []).filter((cell) => !inRun(cell));
    litLines(loose, (r, c) => board.typeAt(r, c)).forEach((group) =>
      frame(group.cells, group.type),
    );

    let arrow = null;
    if (step.from && step.to) {
      const p = at(step.from);
      const q = at(step.to);
      arrow = {
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
        rotation: Math.atan2(q.y - p.y, q.x - p.x),
        length: size * ARROW_SPAN,
      };
    }

    if (this.link.ready(step.type)) {
      this.marks.clear();
      this.link.show(board, this.linkMarks(board, step, joined, at));
      this.wearArrow(step.type, arrow);
      return;
    }

    this.paint(boxes, arrow, step.type, step.color, size);
  }

  linkMarks(board, step, joined, at) {
    const runs = joined || [];
    const typeIn = (cell) => {
      const group = runs.find((g) => g.cells.some((j) => same(j, cell)));
      if (group) return group.type;
      const own = board.typeAt(cell.r, cell.c);
      return own >= 0 ? own : step.type;
    };

    const lit = [];
    const seen = new Set();
    (step.lit || []).forEach((cell) => {
      const key = `${cell.r},${cell.c}`;
      if (seen.has(key)) return;
      seen.add(key);
      lit.push(cell);
    });
    const rings = lit.map((cell) => ({ cell, type: typeIn(cell) }));

    const beams = [];
    runs.forEach((group) => {
      const head = group.cells[0];
      const across = group.cells[1].r === head.r;
      const inline = lit.filter((cell) =>
        across ? cell.r === head.r : cell.c === head.c,
      );
      inline.sort((p, q) => (across ? p.c - q.c : p.r - q.r));
      for (let i = 1; i < inline.length; i++) {
        beams.push({
          from: at(inline[i - 1]),
          to: at(inline[i]),
          type: group.type,
        });
      }
    });

    return { rings, beams };
  }

  paint(boxes, arrow, type, color, size) {
    const ready =
      hintMarksReady(type) &&
      boxes.every((box) => box.type === undefined || hintMarksReady(box.type));
    if (ready) this.wear(type, boxes, arrow);
    else this.stroke(boxes, arrow, color, size);
  }

  kitFor(type) {
    if (!this.painted || this.painted.type !== type) {
      this.kit.removeChildren().forEach((child) => child.destroy());
      this.painted = null;
      const pointer = hintArrowSprite(type);
      if (!pointer) return null;
      this.painted = { type, pool: new Map(), used: [], arrow: pointer };
      this.kit.addChild(pointer);
    }
    const kit = this.painted;
    kit.used.forEach((frame) => (frame.visible = false));
    kit.used = [];
    return kit;
  }

  aim(kit, arrow) {
    this.kit.addChild(kit.arrow);
    kit.arrow.visible = !!arrow;
    if (!arrow) return;
    const scale = arrow.length / kit.arrow.texture.width;
    kit.arrow.scale.set(scale);
    kit.arrow.rotation = arrow.rotation;
    kit.arrow.x = arrow.x;
    kit.arrow.y = arrow.y;
  }

  wearArrow(type, arrow) {
    const kit = this.kitFor(type);
    if (kit) this.aim(kit, arrow);
  }

  wear(type, boxes, arrow) {
    this.marks.clear();

    const kit = this.kitFor(type);
    if (!kit) return;

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
      const k = Math.min(box.w, box.h) / frame.texture.width;
      frame.scale.set(k);
      frame.setSize(box.w / k, box.h / k);
      frame.x = box.x;
      frame.y = box.y;
      kit.used.push(frame);
    });

    this.aim(kit, arrow);
  }

  stroke(boxes, arrow, color, size) {
    const g = this.marks;
    const weight = Math.max(2, size * 0.042);
    const shadow = { width: weight * 1.9, color: 0x000000, alpha: 0.42 };

    this.clearMarks();

    boxes.forEach((box) => {
      const light = {
        width: weight,
        color: box.color === undefined ? color : box.color,
        alpha: 0.92,
      };
      const pad = shadow.width / 2;
      const w = box.w - pad * 2;
      const h = box.h - pad * 2;
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

    const ux = Math.cos(arrow.rotation);
    const uy = Math.sin(arrow.rotation);
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
    g.poly(dart, true);
    g.stroke({
      width: weight * 2.2,
      color: 0x000000,
      alpha: 0.5,
      join: "round",
    });
    g.poly(dart, true);
    g.fill({ color, alpha: 0.97 });
  }
}
