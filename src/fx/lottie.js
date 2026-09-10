import { Container, Graphics, GraphicsContext, Matrix } from "pixi.js";

const DEG = Math.PI / 180;
const ARC_SAMPLES = 24;

const curves = new Map();
const paths = new WeakMap();

function curve(x1, y1, x2, y2) {
  const name = `${x1},${y1},${x2},${y2}`;
  const known = curves.get(name);
  if (known) return known;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const solved =
    x1 === y1 && x2 === y2
      ? (p) => p
      : (p) => {
          let t = p;
          for (let i = 0; i < 8; i++) {
            const slope = (3 * ax * t + 2 * bx) * t + cx;
            if (Math.abs(slope) < 1e-6) break;
            const off = ((ax * t + bx) * t + cx) * t - p;
            if (Math.abs(off) < 1e-6) break;
            t -= off / slope;
          }
          return ((ay * t + by) * t + cy) * t;
        };

  curves.set(name, solved);
  return solved;
}

const axis = (v, i) => (Array.isArray(v) ? (i < v.length ? v[i] : v[0]) : v);

const easeAt = (key, i, p) =>
  curve(
    axis(key.o.x, i),
    axis(key.o.y, i),
    axis(key.i.x, i),
    axis(key.i.y, i),
  )(p);

function pathOf(key, end) {
  const known = paths.get(key);
  if (known) return known;

  const [sx, sy] = key.s;
  const [ex, ey] = end;
  const ax = sx + key.to[0];
  const ay = sy + key.to[1];
  const bx = ex + key.ti[0];
  const by = ey + key.ti[1];
  const pts = [];
  const lens = [0];

  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const t = i / ARC_SAMPLES;
    const u = 1 - t;
    const x =
      u * u * u * sx + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * ex;
    const y =
      u * u * u * sy + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * ey;
    pts.push(x, y);
    if (i > 0) {
      lens.push(
        lens[i - 1] + Math.hypot(x - pts[i * 2 - 2], y - pts[i * 2 - 1]),
      );
    }
  }

  const built = { pts, lens };
  paths.set(key, built);
  return built;
}

function alongPath(key, end, t) {
  const { pts, lens } = pathOf(key, end);
  const total = lens[lens.length - 1];
  if (total === 0) return [pts[0], pts[1]];

  const want = total * t;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < want) i++;
  const run = lens[i] - lens[i - 1];
  const f = run > 0 ? (want - lens[i - 1]) / run : 0;
  return [
    pts[i * 2 - 2] + (pts[i * 2] - pts[i * 2 - 2]) * f,
    pts[i * 2 - 1] + (pts[i * 2 + 1] - pts[i * 2 - 1]) * f,
  ];
}

function between(key, end, p) {
  if (key.h === 1) return key.s;
  if (key.to && key.ti && key.s.length > 1) {
    return alongPath(key, end, easeAt(key, 0, p));
  }
  const out = [];
  for (let i = 0; i < key.s.length; i++) {
    out.push(key.s[i] + (end[i] - key.s[i]) * easeAt(key, i, p));
  }
  return out;
}

function valueAt(prop, frame) {
  if (prop.a !== 1) return prop.k;

  const keys = prop.k;
  if (keys.length === 1 || frame <= keys[0].t) return keys[0].s;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const next = keys[i + 1];
    if (frame >= next.t) continue;
    const end = key.e === undefined ? next.s : key.e;
    const span = next.t - key.t;
    return between(key, end, span > 0 ? (frame - key.t) / span : 1);
  }

  const last = keys[keys.length - 2];
  return last.e === undefined ? last.s : last.e;
}

function scalarAt(prop, frame) {
  const v = valueAt(prop, frame);
  return Array.isArray(v) ? v[0] : v;
}

function pointAt(prop, frame) {
  const v = valueAt(prop, frame);
  return Array.isArray(v) ? v : [v, v];
}

const channel = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

const colorAt = (prop, frame) => {
  const c = valueAt(prop, frame);
  return (channel(c[0]) << 16) | (channel(c[1]) << 8) | channel(c[2]);
};

function place(node, tr, frame) {
  const [px, py] = pointAt(tr.p, frame);
  const [ax, ay] = pointAt(tr.a, frame);
  const [sx, sy] = pointAt(tr.s, frame);
  node.position.set(px, py);
  node.pivot.set(ax, ay);
  node.scale.set(sx / 100, sy / 100);
  node.rotation = scalarAt(tr.r, frame) * DEG;
  if (tr.o) node.alpha = scalarAt(tr.o, frame) / 100;
}

class ShapeGroup {
  constructor(data) {
    this.rect = null;
    this.fill = null;
    this.line = null;
    this.tr = null;
    for (const item of data.it) {
      if (item.ty === "rc") this.rect = item;
      else if (item.ty === "fl") this.fill = item;
      else if (item.ty === "st") this.line = item;
      else if (item.ty === "tr") this.tr = item;
    }
    this.context = new GraphicsContext();
    this.stamp = "";
  }

  redraw(frame) {
    if (!this.rect) return;

    const [w, h] = pointAt(this.rect.s, frame);
    const [x, y] = pointAt(this.rect.p, frame);
    const round = scalarAt(this.rect.r, frame);
    const fill = this.fill ? colorAt(this.fill.c, frame) : 0;
    const fillAlpha = this.fill ? scalarAt(this.fill.o, frame) / 100 : 0;
    const width = this.line ? scalarAt(this.line.w, frame) : 0;
    const line = this.line ? colorAt(this.line.c, frame) : 0;
    const lineAlpha = this.line ? scalarAt(this.line.o, frame) / 100 : 0;

    const stamp = `${w} ${h} ${x} ${y} ${round} ${fill} ${fillAlpha} ${width} ${line} ${lineAlpha}`;
    if (stamp === this.stamp) return;
    this.stamp = stamp;

    this.context.clear();
    const rw = Math.abs(w);
    const rh = Math.abs(h);
    if (rw === 0 || rh === 0) return;

    this.context.roundRect(
      x - rw / 2,
      y - rh / 2,
      rw,
      rh,
      Math.min(round, rw / 2, rh / 2),
    );
    if (this.fill) this.context.fill({ color: fill, alpha: fillAlpha });
    if (width > 0) {
      this.context.stroke({ color: line, width, alpha: lineAlpha });
    }
  }

  attach(parent) {
    const node = new Container();
    node.eventMode = "none";
    node.addChild(new Graphics(this.context));
    parent.addChild(node);
    return node;
  }
}

class LottieLayer {
  constructor(data) {
    this.data = data;
    this.view = new Container();
    this.view.eventMode = "none";
    this.groups = data.shapes
      .filter((item) => item.ty === "gr")
      .map((item) => new ShapeGroup(item));

    this.repeater = data.shapes.find((item) => item.ty === "rp") || null;
    this.step = new Matrix();
    this.stack = new Matrix();

    const copies = this.repeater ? Math.round(this.repeater.c.k) : 1;
    this.copies = [];
    for (let i = 0; i < copies; i++) {
      const view = new Container();
      view.eventMode = "none";
      this.view.addChild(view);
      this.copies.push({
        view,
        nodes: this.groups.map((group) => group.attach(view)),
      });
    }
  }

  seek(frame) {
    const { data, view } = this;
    const live = frame >= data.ip && frame < data.op;
    view.visible = live;
    if (!live) return;

    place(view, data.ks, frame);
    this.groups.forEach((group) => group.redraw(frame));

    const rp = this.repeater;
    const last = Math.max(1, this.copies.length - 1);
    let head = 1;
    let tail = 1;

    if (rp) {
      const [px, py] = pointAt(rp.tr.p, frame);
      const [ax, ay] = pointAt(rp.tr.a, frame);
      const [sx, sy] = pointAt(rp.tr.s, frame);
      this.step
        .identity()
        .translate(-ax, -ay)
        .scale(sx / 100, sy / 100)
        .rotate(scalarAt(rp.tr.r, frame) * DEG)
        .translate(px, py);

      this.stack.identity();
      const skip = Math.round(scalarAt(rp.o, frame));
      for (let i = 0; i < skip; i++) this.stack.append(this.step);

      head = scalarAt(rp.tr.so, frame) / 100;
      tail = scalarAt(rp.tr.eo, frame) / 100;
    }

    this.copies.forEach((copy, i) => {
      if (rp) {
        copy.view.setFromMatrix(this.stack);
        copy.view.alpha = head + (tail - head) * (i / last);
        this.stack.append(this.step);
      }
      copy.nodes.forEach((node, g) => place(node, this.groups[g].tr, frame));
    });
  }
}

export class LottieClip extends Container {
  constructor(data) {
    super();
    this.eventMode = "none";
    this.data = data;
    this.span = data.op - data.ip;
    this.frame = data.ip;
    this.playing = false;
    this.looping = false;
    this.visible = false;

    this.stage = new Container();
    this.stage.eventMode = "none";
    this.addChild(this.stage);

    this.layers = data.layers.map((layer) => new LottieLayer(layer));
    for (let i = this.layers.length - 1; i >= 0; i--) {
      this.stage.addChild(this.layers[i].view);
    }
    this.seek(this.frame);
  }

  fit(w, h, spread, drop) {
    const { data, stage } = this;
    const scale = Math.min(w, h) / (data.w * spread);
    stage.scale.set(scale);
    stage.position.set(
      (w - data.w * scale) / 2,
      h * drop - (data.h * scale) / 2,
    );
  }

  play(looping) {
    this.looping = looping === true;
    this.frame = this.data.ip;
    this.playing = true;
    this.visible = true;
    this.seek(this.frame);
  }

  stop() {
    this.playing = false;
  }

  clear() {
    this.playing = false;
    this.visible = false;
    this.frame = this.data.ip;
  }

  update(dt) {
    if (!this.playing) return;
    this.frame += dt * this.data.fr;
    if (this.frame >= this.data.op) {
      if (!this.looping) {
        this.clear();
        return;
      }
      this.frame = this.data.ip + ((this.frame - this.data.ip) % this.span);
    }
    this.seek(this.frame);
  }

  seek(frame) {
    this.layers.forEach((layer) => layer.seek(frame));
  }
}
