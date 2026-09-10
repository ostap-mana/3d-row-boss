import { Container, Graphics, Sprite } from "pixi.js";
import { beamTexture, glowTexture, sparkTexture } from "../art/textures.js";
import { tween, tweenValue, delay, Ease } from "../core/tween.js";
import { rndRange } from "../core/rng.js";
import {
  SPELL_ASPECT,
  SPELL_BY_ELEMENT,
  SPELL_TRAVEL_LAST,
  spellFrames,
} from "../art/spells.js";
import { STRIKE } from "../config.js";

const HOT = 0xffffff;

function roomIn(vfx) {
  return vfx.roomLeft ? vfx.roomLeft() : STRIKE.ceiling;
}

function arcAt(from, to, bow, p) {
  const nx = -(to.y - from.y);
  const ny = to.x - from.x;
  const len = Math.hypot(nx, ny) || 1;
  const swell = Math.sin(p * Math.PI) * bow;
  return {
    x: from.x + (to.x - from.x) * p + (nx / len) * swell,
    y: from.y + (to.y - from.y) * p + (ny / len) * swell,
  };
}

function muzzle(vfx, from, to, color, power) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);

  const flare = new Sprite(glowTexture());
  flare.anchor.set(0.5);
  flare.blendMode = "add";
  flare.tint = color;
  flare.x = from.x;
  flare.y = from.y;
  flare.rotation = ang;
  const w = STRIKE.muzzle * power;
  flare.setSize(w * 1.5, w);
  vfx.field.addChild(flare);
  const base = { x: flare.scale.x, y: flare.scale.y };
  tweenValue(0, 1, STRIKE.muzzleLife, (p) => {
    if (flare.destroyed) return;
    const k = 0.4 + p * 1.5;
    flare.scale.set(base.x * k, base.y * k);
    flare.alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
  }).then(() => flare.destroy());

  const lip = new Graphics();
  lip.circle(0, 0, 50);
  lip.stroke({ width: 5, color: HOT, alpha: 1 });
  lip.x = from.x;
  lip.y = from.y;
  lip.rotation = ang;
  lip.blendMode = "add";
  lip.scale.set(0.06, 0.06);
  vfx.field.addChild(lip);
  const reach = (STRIKE.muzzle * power * 1.1) / 50;
  tween(lip.scale, { x: reach, y: reach * 0.42 }, STRIKE.muzzleLife * 1.4, {
    ease: Ease.expoOut,
  });
  tween(lip, { alpha: 0 }, STRIKE.muzzleLife * 1.4).then(() => lip.destroy());

  const n = Math.min(roomIn(vfx), STRIKE.muzzleSparks);
  for (let i = 0; i < n; i++) {
    const s = new Sprite(sparkTexture());
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 3 === 0 ? HOT : color;
    const size = rndRange(6, 15) * power;
    s.setSize(size, size);
    s.x = from.x;
    s.y = from.y;
    vfx.field.addChild(s);
    const out = ang + rndRange(-0.9, 0.9);
    const dist = rndRange(18, 54) * power;
    tween(
      s,
      { x: from.x + Math.cos(out) * dist, y: from.y + Math.sin(out) * dist },
      0.3,
      { ease: Ease.quadOut },
    );
    tween(s.scale, { x: 0, y: 0 }, 0.3, { ease: Ease.quadIn }).then(() =>
      s.destroy(),
    );
  }
}

function trailMote(vfx, x, y, color, size, life) {
  if (roomIn(vfx) <= 0) return;
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.blendMode = "add";
  s.tint = color;
  s.x = x;
  s.y = y;
  s.setSize(size, size);
  vfx.field.addChild(s);
  const base = { x: s.scale.x, y: s.scale.y };
  tweenValue(0, 1, life, (p) => {
    if (s.destroyed) return;
    const k = 1 - p * 0.85;
    s.scale.set(base.x * k, base.y * k);
    s.alpha = (1 - p) * 0.8;
  }).then(() => s.destroy());
}

function landing(vfx, at, color, power, incoming) {
  const flash = new Sprite(glowTexture());
  flash.anchor.set(0.5);
  flash.blendMode = "add";
  flash.tint = HOT;
  flash.x = at.x;
  flash.y = at.y;
  const w = STRIKE.blast * power;
  flash.setSize(w, w);
  vfx.field.addChild(flash);
  const base = { x: flash.scale.x, y: flash.scale.y };
  tweenValue(0, 1, STRIKE.blastLife, (p) => {
    if (flash.destroyed) return;
    const k = 0.5 + p * 1.4;
    flash.scale.set(base.x * k, base.y * k);
    flash.alpha = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
  }).then(() => flash.destroy());

  const ring = new Graphics();
  ring.circle(0, 0, 50);
  ring.stroke({ width: Math.max(3, 9 * power), color, alpha: 1 });
  ring.x = at.x;
  ring.y = at.y;
  ring.blendMode = "add";
  ring.scale.set(0.2);
  vfx.field.addChild(ring);
  const reach = (STRIKE.blast * power * 0.95) / 50;
  tween(ring.scale, { x: reach, y: reach }, STRIKE.blastLife * 1.2, {
    ease: Ease.expoOut,
  });
  tween(ring, { alpha: 0 }, STRIKE.blastLife * 1.2).then(() => ring.destroy());

  const n = Math.min(roomIn(vfx), Math.round(STRIKE.blastSparks * power));
  for (let i = 0; i < n; i++) {
    const s = new Sprite(sparkTexture());
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i % 4 === 0 ? HOT : color;
    const size = rndRange(8, 22) * power;
    s.setSize(size, size);
    s.x = at.x;
    s.y = at.y;
    vfx.field.addChild(s);
    const out = incoming + Math.PI + rndRange(-1.25, 1.25);
    const dist = rndRange(30, 110) * power;
    tween(
      s,
      { x: at.x + Math.cos(out) * dist, y: at.y + Math.sin(out) * dist },
      0.42,
      { ease: Ease.quadOut },
    );
    tween(s.scale, { x: 0, y: 0 }, 0.42, { ease: Ease.quadIn }).then(() =>
      s.destroy(),
    );
  }
}

export async function heroStrike(vfx, from, to, element, color, opts) {
  const o = opts || {};
  const power = o.power === undefined ? 1 : o.power;
  const travel = o.travel === undefined ? STRIKE.travel : o.travel;
  const size = (o.size === undefined ? STRIKE.size : o.size) * power;
  const bow = o.bow === undefined ? 0 : o.bow;

  muzzle(vfx, from, to, color, power);

  const frames = spellFrames(SPELL_BY_ELEMENT[element]);
  const head = new Container();
  head.x = from.x;
  head.y = from.y;
  vfx.field.addChild(head);

  const streak = new Sprite(beamTexture());
  streak.anchor.set(1, 0.5);
  streak.blendMode = "add";
  streak.tint = color;
  streak.alpha = 0.95;
  streak.setSize(size * STRIKE.streak, size * 0.5);
  head.addChild(streak);

  const glow = new Sprite(glowTexture());
  glow.anchor.set(0.5);
  glow.blendMode = "add";
  glow.tint = color;
  glow.alpha = 0.75;
  glow.setSize(size * 1.1, size * 1.1);
  head.addChild(glow);

  const core = new Sprite(frames ? frames[0] : sparkTexture());
  core.anchor.set(0.5);
  core.blendMode = "add";
  if (!frames) core.tint = HOT;
  core.setSize(size, frames ? size / SPELL_ASPECT : size);
  head.addChild(core);

  let last = { x: from.x, y: from.y };
  let drop = 0;

  await tweenValue(0, 1, travel, (p) => {
    if (head.destroyed) return;
    const e = Ease.quadIn(p) * 0.35 + p * 0.65;
    const at = arcAt(from, to, bow, e);
    const dx = at.x - last.x;
    const dy = at.y - last.y;
    const step = Math.hypot(dx, dy);
    if (step > 0.01) head.rotation = Math.atan2(dy, dx);
    head.x = at.x;
    head.y = at.y;

    const k = 0.55 + e * 0.6;
    if (frames) {
      const i = Math.floor(e * (SPELL_TRAVEL_LAST + 1));
      core.texture = frames[Math.min(SPELL_TRAVEL_LAST, i)];
      core.setSize(size * k, (size * k) / SPELL_ASPECT);
    } else {
      core.setSize(size * k, size * k);
    }
    core.rotation = -head.rotation;

    streak.setSize(
      Math.min(size * STRIKE.streak, step * STRIKE.streakSpeed + size * 0.5),
      size * 0.5 * (0.7 + e * 0.5),
    );

    drop += step;
    if (drop >= STRIKE.trailGap) {
      drop = 0;
      trailMote(
        vfx,
        at.x + rndRange(-4, 4),
        at.y + rndRange(-4, 4),
        color,
        size * rndRange(0.3, 0.55),
        STRIKE.trailLife,
      );
    }
    last = at;
  });

  const incoming = head.rotation;
  if (!head.destroyed) head.destroy({ children: true });

  landing(vfx, to, color, power, incoming);

  if (frames) {
    const s = new Sprite(frames[SPELL_TRAVEL_LAST + 1]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.x = to.x;
    s.y = to.y;
    vfx.field.addChild(s);
    const first = SPELL_TRAVEL_LAST + 1;
    const n = frames.length - first;
    tweenValue(0, 1, STRIKE.blastLife * 1.3, (p) => {
      if (s.destroyed) return;
      const w = size * STRIKE.blastScale * (1 + p * 0.4);
      s.texture = frames[first + Math.min(n - 1, Math.floor(p * n))];
      s.setSize(w, w / SPELL_ASPECT);
      s.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    }).then(() => s.destroy());
  }

  await delay(0);
}
