import { Container } from "pixi.js";
import { MATCH_LINK } from "../config.js";
import { tween, killTweensOf } from "../core/tween.js";
import {
  RING_AT,
  linkSprite,
  matchLinkReady,
  ringSprite,
  slideLink,
} from "../art/matchlink.js";

const TAU = Math.PI * 2;

const cellKey = (cell) => `${cell.r},${cell.c}`;

export class MatchLink extends Container {
  constructor() {
    super();
    this.beamLayer = new Container();
    this.ringLayer = new Container();
    this.addChild(this.beamLayer, this.ringLayer);
    this.pool = {
      ring: new Map(),
      hot: new Map(),
      halo: new Map(),
      beam: new Map(),
      core: new Map(),
    };
    this.rings = [];
    this.beams = [];
    this.lit = new Set();
    this.board = null;
    this.clock = 0;
  }

  ready(type) {
    return matchLinkReady(type);
  }

  clear() {
    this.rings.forEach((ring) =>
      ring.parts.forEach((part) => (part.sprite.visible = false)),
    );
    this.beams.forEach((beam) => {
      beam.sprite.visible = false;
      beam.core.visible = false;
    });
    this.rings = [];
    this.beams = [];
    this.lit.forEach((gem) => this.bloom(gem, 0));
    this.lit.clear();
    this.board = null;
  }

  bloom(gem, alpha) {
    if (!gem || gem.destroyed || !MATCH_LINK.bloom) return;
    killTweensOf(gem.glow);
    tween(gem.glow, { alpha }, 0.25);
  }

  grab(kind, type, counters, make) {
    const key = `${kind}:${type}`;
    const n = counters.get(key) || 0;
    counters.set(key, n + 1);
    let free = this.pool[kind].get(type);
    if (!free) this.pool[kind].set(type, (free = []));
    if (!free[n]) {
      const made = make(type);
      if (!made) return null;
      free[n] = made;
      const onRing = kind === "ring" || kind === "hot" || kind === "halo";
      (onRing ? this.ringLayer : this.beamLayer).addChild(made);
    }
    free[n].visible = true;
    return free[n];
  }

  gemAt(board, cell) {
    const home = board.grid[cell.r] && board.grid[cell.r][cell.c];
    const swap = board.preview;
    if (!swap) return home;
    const isA = swap.a.r === cell.r && swap.a.c === cell.c;
    const isB = swap.b.r === cell.r && swap.b.c === cell.c;
    if (!isA && !isB) return home;
    const other = isA ? swap.b : swap.a;
    const partner = board.grid[other.r] && board.grid[other.r][other.c];
    if (!partner) return home;
    if (!home) return partner;
    const p = board.cellPos(cell.r, cell.c);
    const near = (gem) => Math.hypot(gem.x - p.x, gem.y - p.y);
    return near(partner) < near(home) ? partner : home;
  }

  show(board, marks) {
    const keep = new Set();
    const counters = new Map();
    const previous = this.lit;

    this.rings.forEach((ring) =>
      ring.parts.forEach((part) => (part.sprite.visible = false)),
    );
    this.beams.forEach((beam) => {
      beam.sprite.visible = false;
      beam.core.visible = false;
    });
    this.rings = [];
    this.beams = [];
    this.board = board;

    const gemR = board.cell * MATCH_LINK.gem;
    const ringR = gemR * MATCH_LINK.ring;
    const side = ringR / RING_AT;

    const seen = new Set();
    marks.rings.forEach((mark, i) => {
      const key = cellKey(mark.cell);
      if (seen.has(key)) return;
      seen.add(key);
      const gem = this.gemAt(board, mark.cell);
      const parts = [
        { kind: "halo", grow: MATCH_LINK.halo, alpha: MATCH_LINK.haloAlpha },
        { kind: "ring", grow: 1, alpha: MATCH_LINK.ringAlpha },
        { kind: "hot", grow: 1, alpha: MATCH_LINK.hot },
      ]
        .map((part) => ({
          ...part,
          sprite: this.grab(part.kind, mark.type, counters, ringSprite),
        }))
        .filter((part) => part.sprite && part.alpha > 0);
      if (!parts.length) return;
      const p = board.cellPos(mark.cell.r, mark.cell.c);
      this.rings.push({
        parts,
        gem,
        at: { x: board.x + p.x, y: board.y + p.y },
        side,
        phase: (i * TAU) / 7,
        turn: i % 2 ? 1 : -1,
      });
      if (gem) {
        keep.add(gem);
        if (!previous.has(gem)) this.bloom(gem, MATCH_LINK.bloom);
      }
    });

    previous.forEach((gem) => {
      if (!keep.has(gem)) this.bloom(gem, 0);
    });
    this.lit = keep;

    const inset = ringR * MATCH_LINK.inset;
    const height = ringR * MATCH_LINK.beam;
    marks.beams.forEach((mark, i) => {
      const dx = mark.to.x - mark.from.x;
      const dy = mark.to.y - mark.from.y;
      const len = Math.hypot(dx, dy);
      const span = len - inset * 2;
      if (span <= 1) return;
      const sprite = this.grab("beam", mark.type, counters, linkSprite);
      const core = this.grab("core", mark.type, counters, linkSprite);
      if (!sprite || !core) return;
      const ux = dx / len;
      const uy = dy / len;
      const x = mark.from.x + ux * inset;
      const y = mark.from.y + uy * inset;
      const rotation = Math.atan2(dy, dx);
      [sprite, core].forEach((s) => {
        s.x = x;
        s.y = y;
        s.rotation = rotation;
      });
      sprite.setSize(span, height);
      sprite.tint = 0xffffff;
      core.setSize(span, height * MATCH_LINK.core);
      core.tint = 0xffffff;
      const strip = sprite.texture.frame.width;
      this.beams.push({
        sprite,
        core,
        span,
        height,
        phase: (i * TAU) / 5,
        speed: (MATCH_LINK.flow * ringR * strip) / span,
      });
    });

    this.update(0);
  }

  update(dt) {
    this.clock += dt;
    const t = (this.clock / MATCH_LINK.pulse) * TAU;
    const breathe = MATCH_LINK.breathe;

    this.rings.forEach((ring) => {
      const gem = ring.gem;
      const live = gem && !gem.destroyed && this.board;
      const x = live ? this.board.x + gem.x : ring.at.x;
      const y = live ? this.board.y + gem.y : ring.at.y;
      const wave = 0.5 + 0.5 * Math.sin(t + ring.phase);
      const grow = 1 + MATCH_LINK.swell * wave;
      const rotation = ring.turn * MATCH_LINK.spin * this.clock;
      ring.parts.forEach((part) => {
        const s = part.sprite;
        s.x = x;
        s.y = y;
        s.alpha = part.alpha * (1 - breathe * (1 - wave));
        const side = ring.side * grow * part.grow;
        s.setSize(side, side);
        s.rotation = part.kind === "halo" ? -rotation : rotation;
      });
    });

    this.beams.forEach((beam) => {
      const wave = 0.5 + 0.5 * Math.sin(t + beam.phase + Math.PI / 2);
      beam.sprite.alpha = MATCH_LINK.beamAlpha * (1 - breathe * (1 - wave));
      beam.core.alpha = MATCH_LINK.coreAlpha * (0.7 + 0.3 * wave);
      const travelled = beam.speed * this.clock;
      slideLink(beam.sprite, -travelled);
      slideLink(beam.core, -travelled * 1.6);
    });
  }
}
