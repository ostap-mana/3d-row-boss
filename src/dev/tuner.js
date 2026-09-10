import {
  BOSS_ATTACKS,
  DIFFICULTY,
  DOOM,
  T,
  ULT_PACE,
  WORLD_RATE,
} from "../config.js";
import { setWorldRate, worldRate } from "../core/juice.js";

const KEY = "siege.tuner";
const SAVE = "siege.tune";
const WIDE = "siege.tuner.wide";
const ID = "siege-tuner";

const ROOTS = { DIFFICULTY, DOOM, T, ULT_PACE };

const ULT_GEMS = 5;
const MOVE_GEMS = 3;
const BOSS_BASE =
  BOSS_ATTACKS.reduce((sum, a) => sum + (a.damage || 0), 0) /
  Math.max(1, BOSS_ATTACKS.length);

const INK = "#16151a";
const DIM = "#8b8780";
const AXIS = "#6d7f9c";
const HOT = "#ef6b3f";
const KILL = "#4f9668";

const clone = (v) => JSON.parse(JSON.stringify(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function store(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}

function asked() {
  try {
    const url = window.location.href.toLowerCase();
    if (/[?&#]tune\b/.test(url)) return true;
  } catch {}
  if (store(KEY) === "on") return true;
  try {
    return !!import.meta.env.DEV;
  } catch {
    return false;
  }
}

const steps = () => (DIFFICULTY.curve && DIFFICULTY.curve.steps) || [];
const span = () => (DIFFICULTY.curve && DIFFICULTY.curve.seconds) || 1;

function at(field, p) {
  const list = steps();
  if (!list.length) return 0;
  if (p <= list[0].p) return list[0][field];
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (p > b.p) continue;
    const a = list[i - 1];
    const width = b.p - a.p;
    const t = width > 0 ? (p - a.p) / width : 1;
    return a[field] + (b[field] - a[field]) * t;
  }
  return list[list.length - 1][field];
}

function rageAt(p) {
  const per = DIFFICULTY.ragePerSecond || 0;
  const cap = DIFFICULTY.rageMax === undefined ? Infinity : DIFFICULTY.rageMax;
  return Math.min(cap, 1 + p * span() * worldRate() * per);
}

function paceAt(hp, second) {
  const guard = DIFFICULTY.pace;
  if (!guard || !guard.enabled) return 1;
  const expected = Math.max(0, 1 - second / guard.seconds);
  if (expected <= 0 || hp >= expected) return 1;
  return Math.max(guard.floor, Math.pow(hp / expected, guard.bite));
}

const ultBase = () =>
  DIFFICULTY.ultDamage +
  ULT_GEMS * DIFFICULTY.damagePerGem * DIFFICULTY.ultGemMultiplier;

const hideAt = (resist) =>
  Math.pow(Math.max(0, resist), DIFFICULTY.ultHideBite);

const ultAt = (p) => ultBase() * hideAt(at("resist", p)) * at("ult", p);

const gemAt = (p) => MOVE_GEMS * DIFFICULTY.damagePerGem * at("resist", p);

const bossAt = (p) => BOSS_BASE * at("attack", p) * rageAt(p);

function simulate(samples) {
  const secs = span();
  const period = T.moveCost / Math.max(0.1, worldRate());
  const out = [];
  let hp = 1;
  let next = period;
  for (let i = 0; i <= samples; i++) {
    const second = (i / samples) * secs;
    let guard = 0;
    while (hp > 0 && next <= second && guard++ < 64) {
      const hit =
        MOVE_GEMS *
        DIFFICULTY.damagePerGem *
        at("resist", 1 - hp) *
        paceAt(hp, next);
      hp = Math.max(0, hp - hit);
      next += period;
    }
    out.push(hp);
  }
  return out;
}

const BANDS = [
  { to: 0.5, label: "SUPER EASY", fill: "#f8f7f5" },
  { to: 0.75, label: "MEDIUM", fill: "#eeedea" },
  { to: 1, label: "SUPER HARD", fill: "#e8e5e1" },
];

const RUNGS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

const bite = (p) => at("attack", p) / Math.max(1e-4, at("resist", p));

function opening() {
  const list = steps();
  return list.length ? Math.max(1e-4, bite(list[0].p)) : 1;
}

const indexAt = (p) => bite(p) / opening();

function indexInto(step, value) {
  const room = opening() * Math.max(1e-4, step.resist);
  step.attack = +clamp(value * room, 0, 12).toFixed(3);
}

function scaleFor(peak) {
  const unit = RUNGS.find((rung) => peak / rung <= 4) || 1000;
  return { unit, top: Math.max(unit, Math.ceil(peak / unit) * unit) };
}

const feltIndex = (attackP, resistP) =>
  at("attack", attackP) / Math.max(1e-4, at("resist", resistP)) / opening();

const CSS = `
#${ID}, #${ID} * { box-sizing: border-box; }
#${ID} {
  position: fixed; z-index: 2147483000; inset: auto 0 0 auto;
  font: 12px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: ${INK}; pointer-events: none;
}
#${ID} button, #${ID} input { font: inherit; }
#${ID} .t-icon {
  pointer-events: auto; position: fixed;
  right: max(10px, env(safe-area-inset-right, 0px));
  top: max(10px, env(safe-area-inset-top, 0px));
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: #fffdfb; color: ${HOT}; font-size: 21px; line-height: 1;
  border: 1px solid rgba(0,0,0,0.14); cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.3);
}
#${ID} .t-icon.on { color: #fff; background: ${HOT}; border-color: ${HOT}; }
#${ID} .t-panel {
  pointer-events: auto; position: fixed;
  right: max(8px, env(safe-area-inset-right, 0px));
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  top: calc(62px + max(8px, env(safe-area-inset-top, 0px)));
  width: min(430px, calc(100vw - 16px));
  display: none; flex-direction: column;
  background: #f7f6f4; border: 1px solid rgba(0,0,0,0.14);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 18px 46px rgba(0,0,0,0.4);
}
#${ID}.open .t-panel { display: flex; }
#${ID} .t-head {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 9px 12px; border-bottom: 1px solid #e6e3de; background: #fff;
}
#${ID} .t-head b {
  font: 600 11px/1.4 system-ui, sans-serif; letter-spacing: 0.12em; color: ${HOT};
}
#${ID} .t-head .t-sp { margin-left: auto; }
#${ID} .t-x {
  background: #fff; border: 1px solid #ddd9d3; color: #57535e;
  border-radius: 7px; padding: 4px 8px; cursor: pointer; font-size: 11px;
}
#${ID} .t-x:active { background: #f0ede9; }
#${ID} .t-live {
  flex: none; display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 0 6px; padding: 7px 12px; border-bottom: 1px solid #e6e3de; background: #fff;
}
#${ID} .t-live div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
#${ID} .t-live span { font-size: 9px; letter-spacing: 0.05em; color: ${DIM}; text-transform: uppercase; }
#${ID} .t-live b { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
#${ID} .t-body {
  flex: 1 1 auto; display: flex; flex-direction: column;
  overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
}
#${ID} .t-card {
  flex: 1 1 auto; display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e6e3de; border-radius: 10px;
  padding: 10px 10px 6px;
}
#${ID} .t-card b {
  display: block; flex: none; font: 600 13px/1.3 system-ui, sans-serif; color: ${INK};
}
#${ID} .t-card .t-sub { flex: none; font-size: 10px; color: #6f6b78; padding: 3px 0 2px; }
#${ID} .t-card .t-sub code {
  background: #f1eeea; color: #4a4650; border-radius: 4px; padding: 1px 5px;
}
#${ID} canvas {
  flex: 1 1 auto; width: 100%; min-height: 190px; display: block; touch-action: none;
}
#${ID} .t-card.t-open canvas { flex: none; height: 210px; }
#${ID} .t-more {
  flex: none; width: 100%; text-align: left; cursor: pointer; margin-top: 4px;
  padding: 7px 2px 3px; border: 0; border-top: 1px solid #eeebe6;
  background: none; color: ${AXIS}; font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase;
}
#${ID} .t-tab { flex: none; padding: 4px 0 2px; }
#${ID} .t-tab table { width: 100%; border-collapse: collapse; }
#${ID} .t-tab th {
  font: 400 9px/1.4 ui-monospace, Menlo, monospace; color: ${DIM};
  text-align: right; padding: 0 3px 4px; letter-spacing: 0.05em;
}
#${ID} .t-tab th:first-child { text-align: left; }
#${ID} .t-tab td { padding: 1px 2px; }
#${ID} .t-tab td:first-child { font-size: 9px; color: ${DIM}; white-space: nowrap; }
#${ID} .t-tab input {
  width: 100%; min-width: 0; padding: 5px 4px; text-align: right;
  background: #faf9f7; color: ${INK}; border: 1px solid #e2ded8;
  border-radius: 5px; font-variant-numeric: tabular-nums; -moz-appearance: textfield;
}
#${ID} .t-tab input::-webkit-outer-spin-button,
#${ID} .t-tab input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#${ID} .t-bar {
  flex: none; display: flex; gap: 6px; padding: 8px 12px;
  border-top: 1px solid #e6e3de; background: #fff;
}
#${ID} .t-bar button {
  flex: 1 1 auto; padding: 9px 6px; border-radius: 7px; cursor: pointer;
  background: #faf9f7; border: 1px solid #ddd9d3; color: ${INK};
  white-space: nowrap; font-size: 11px; letter-spacing: 0.04em;
}
#${ID} .t-bar button:active { background: #f0ede9; }
#${ID} .t-bar button.t-act { color: ${HOT}; border-color: ${HOT}; }
#${ID}.wide.open .t-icon { display: none; }
#${ID}.wide .t-panel {
  left: max(0px, env(safe-area-inset-left, 0px));
  right: max(0px, env(safe-area-inset-right, 0px));
  top: max(0px, env(safe-area-inset-top, 0px));
  bottom: max(0px, env(safe-area-inset-bottom, 0px));
  width: auto; border-radius: 0; box-shadow: none;
}
#${ID}.wide .t-head { padding: 12px 14px; }
#${ID}.wide .t-live { padding: 10px 14px; }
#${ID}.wide .t-live b { font-size: 14px; }
#${ID}.wide .t-body { padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); }
#${ID}.wide .t-card { padding: 12px 12px 6px; }
#${ID}.wide canvas { min-height: 300px; }
#${ID}.wide .t-card.t-open canvas { height: min(58vh, 520px); }
#${ID}.wide .t-tab input { padding: 8px 6px; }
#${ID}.wide .t-bar { padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 520px) {
  #${ID} .t-panel { left: max(8px, env(safe-area-inset-left, 0px)); width: auto; }
}
`;

function splitPath(path) {
  return path.split(".");
}

function holder(path) {
  const parts = splitPath(path);
  let node = ROOTS[parts[0]];
  for (let i = 1; i < parts.length - 1; i++) {
    if (node == null) return null;
    node = node[parts[i]];
  }
  return node == null ? null : { node, key: parts[parts.length - 1] };
}

function write(path, value) {
  const h = holder(path);
  if (h) h.node[h.key] = value;
}

function short(v) {
  if (typeof v !== "number") return String(v);
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  return v
    .toFixed(abs < 0.01 ? 4 : abs < 1 ? 3 : 2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function build(scene) {
  const baseline = {
    DIFFICULTY: clone(DIFFICULTY),
    DOOM: clone(DOOM),
    T: clone(T),
    ULT_PACE: clone(ULT_PACE),
    WORLD_RATE,
  };

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ID;
  root.innerHTML = `
    <button class="t-icon" type="button" aria-label="Складність" title="Складність">⚙</button>
    <div class="t-panel" role="dialog" aria-label="Крива складності">
      <div class="t-head">
        <b>КРИВА СКЛАДНОСТІ</b>
        <div class="t-sp"></div>
        <button class="t-x t-wide" type="button" data-act="wide" aria-label="На весь екран" title="На весь екран">⛶</button>
        <button class="t-x" type="button" data-act="hide">сховати</button>
        <button class="t-x" type="button" data-act="close">✕</button>
      </div>
      <div class="t-live"></div>
      <div class="t-body"></div>
      <div class="t-bar"></div>
    </div>`;
  document.body.appendChild(root);

  const icon = root.querySelector(".t-icon");
  const live = root.querySelector(".t-live");
  const body = root.querySelector(".t-body");
  const bar = root.querySelector(".t-bar");

  let sim = simulate(96);
  let grab = null;
  const binders = [];

  function saveDiff() {
    const diff = {};
    const walk = (base, now, path) => {
      Object.keys(base).forEach((k) => {
        const b = base[k];
        const n = now[k];
        if (b && typeof b === "object") {
          if (n && typeof n === "object") walk(b, n, path.concat(k));
          return;
        }
        if (b !== n) diff[path.concat(k).join(".")] = n;
      });
    };
    Object.keys(ROOTS).forEach((r) => walk(baseline[r], ROOTS[r], [r]));
    if (worldRate() !== baseline.WORLD_RATE) diff.WORLD_RATE = worldRate();
    const keys = Object.keys(diff);
    keep(SAVE, keys.length ? JSON.stringify(diff) : null);
    return diff;
  }

  function applyDiff(diff) {
    Object.keys(diff).forEach((path) => {
      if (path === "WORLD_RATE") setWorldRate(diff[path]);
      else write(path, diff[path]);
    });
  }

  function geom(cv, top) {
    const w = cv.clientWidth || 1;
    const h = cv.clientHeight || 1;
    const pad = { l: 32, r: 42, t: 26, b: 30 };
    const iw = Math.max(1, w - pad.l - pad.r);
    const ih = Math.max(1, h - pad.t - pad.b);
    return {
      w,
      h,
      pad,
      iw,
      ih,
      x: (p) => pad.l + p * iw,
      y: (v) => pad.t + (1 - clamp(v / top, 0, 1)) * ih,
      atX: (x) => clamp((x - pad.l) / iw, 0, 1),
      atY: (y) => Math.max(0, 1 - (y - pad.t) / ih) * top,
    };
  }

  function peakStep() {
    const list = steps();
    let best = 0;
    list.forEach((step, i) => {
      if (indexAt(step.p) > indexAt(list[best].p)) best = i;
    });
    return best;
  }

  const scaleNow = () => {
    const list = steps();
    return scaleFor(list.length ? indexAt(list[peakStep()].p) : 1);
  };

  function paint(cv) {
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const scale = scaleNow();
    const g = geom(cv, scale.top);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pw = Math.round(g.w * dpr);
    const ph = Math.round(g.h * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.font = "9px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "middle";

    ctx.fillStyle = DIM;
    ctx.textAlign = "left";
    ctx.fillText("×РАЗІВ ДО ВІДКРИТТЯ", g.pad.l + 2, g.pad.t - 14);

    let from = 0;
    BANDS.forEach((band) => {
      const a = g.x(from);
      const b = g.x(band.to);
      ctx.fillStyle = band.fill;
      ctx.fillRect(a, g.pad.t, b - a, g.ih);
      if (from > 0) {
        ctx.strokeStyle = "#d9d6d1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(a) + 0.5, g.pad.t);
        ctx.lineTo(Math.round(a) + 0.5, g.pad.t + g.ih);
        ctx.stroke();
      }
      ctx.fillStyle = "#a09c98";
      ctx.textAlign = "center";
      if (b - a > 56) ctx.fillText(band.label, (a + b) / 2, g.pad.t + 11);
      from = band.to;
    });

    ctx.strokeStyle = "#e6e3de";
    ctx.textAlign = "right";
    for (let v = 0; v <= scale.top; v += scale.unit) {
      const y = Math.round(g.y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(g.pad.l, y);
      ctx.lineTo(g.pad.l + g.iw, y);
      ctx.stroke();
      ctx.fillStyle = DIM;
      ctx.fillText(`×${v}`, g.pad.l - 5, y);
    }

    ctx.textAlign = "center";
    [0, 0.25, 0.5, 0.75, 1].forEach((p) => {
      ctx.fillStyle = AXIS;
      ctx.fillText(
        `${Math.round((1 - p) * 100)}%`,
        g.x(p),
        g.pad.t + g.ih + 10,
      );
    });
    ctx.fillStyle = "#a7a2ac";
    ctx.fillText(
      "HP БОСА, ЩО ЛИШИЛОСЯ",
      g.pad.l + g.iw / 2,
      g.pad.t + g.ih + 21,
    );

    const list = steps();

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.pad.l, g.pad.t, g.iw, g.ih);
    ctx.clip();

    ctx.textAlign = "left";
    ctx.fillStyle = "#a09c98";
    list.forEach((step) => {
      if (!step.name) return;
      ctx.fillText(step.name, g.x(step.p) + 4, g.pad.t + g.ih - 8);
    });

    const pts = [];
    for (let i = 0; i <= 110; i++) {
      const p = i / 110;
      pts.push([g.x(p), g.y(indexAt(p))]);
    }

    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = HOT;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    const d = scene.director;
    if (d) {
      try {
        const p = clamp(d.progress(), 0, 1);
        const x = Math.round(g.x(p)) + 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(22,21,26,0.42)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, g.pad.t);
        ctx.lineTo(x, g.pad.t + g.ih);
        ctx.stroke();
        ctx.setLineDash([]);
      } catch {}
    }

    const dead = sim.findIndex((hp) => hp <= 0);
    if (dead > 0) {
      ctx.fillStyle = KILL;
      ctx.textAlign = "left";
      ctx.fillText(
        `бос падає на ${Math.round((dead / (sim.length - 1)) * span())}с`,
        g.pad.l + 6,
        g.pad.t + 27,
      );
    }

    list.forEach((step, i) => {
      const x = g.x(step.p);
      const y = clamp(g.y(indexAt(step.p)), g.pad.t, g.pad.t + g.ih);
      const held = grab && grab.i === i;
      ctx.beginPath();
      ctx.arc(x, y, held ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = i ? HOT : "#fff";
      ctx.fill();
      ctx.strokeStyle = i ? "#fff" : HOT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();

    const mark = (i, tail) => {
      const step = list[i];
      if (!step) return;
      const value = indexAt(step.p);
      const y = clamp(g.y(value), g.pad.t + 6, g.pad.t + g.ih);
      const text = tail
        ? `×${value.toFixed(1)}`
        : `×${value.toFixed(1)} · ${Math.round((1 - step.p) * 100)}% HP`;
      ctx.textAlign = tail ? "left" : "center";
      const half = ctx.measureText(text).width / 2;
      const x = tail
        ? g.x(step.p) + 8
        : clamp(g.x(step.p), g.pad.l + half, g.pad.l + g.iw - half);
      const row = tail ? y : y - 11;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, row);
      ctx.fillStyle = HOT;
      ctx.fillText(text, x, row);
    };
    const lead = grab ? grab.i : peakStep();
    mark(lead, false);
    if (lead !== list.length - 1) mark(list.length - 1, true);
  }
  function drawAll() {
    sim = simulate(96);
    paint(cv);
    binders.forEach((fn) => fn());
  }

  function bind(cv) {
    const move = (e) => {
      if (!grab) return;
      const g = geom(cv, scaleNow().top);
      const box = cv.getBoundingClientRect();
      const list = steps();
      const step = list[grab.i];
      if (!step) return;
      if (grab.i < list.length - 1) {
        const lo = list[grab.i - 1].p + 0.02;
        const hi = list[grab.i + 1].p - 0.02;
        step.p = +clamp(g.atX(e.clientX - box.left), lo, hi).toFixed(3);
      }
      indexInto(step, g.atY(e.clientY - box.top));
      e.preventDefault();
      drawAll();
    };

    cv.addEventListener("pointerdown", (e) => {
      const g = geom(cv, scaleNow().top);
      const box = cv.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      let best = -1;
      let near = 36;
      steps().forEach((step, i) => {
        if (!i) return;
        const dist = Math.hypot(g.x(step.p) - x, g.y(indexAt(step.p)) - y);
        if (dist < near) {
          near = dist;
          best = i;
        }
      });
      if (best < 0) return;
      grab = { i: best };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
      drawAll();
    });
    cv.addEventListener("pointermove", move);
    const drop = () => {
      if (!grab) return;
      grab = null;
      saveDiff();
      drawAll();
    };
    cv.addEventListener("pointerup", drop);
    cv.addEventListener("pointercancel", drop);
  }
  function numbers() {
    const box = document.createElement("div");
    box.className = "t-tab";
    box.innerHTML = `<table><thead><tr><th></th><th>hp</th><th>×</th><th>attack</th><th>resist</th></tr></thead><tbody></tbody></table>`;
    const tbody = box.querySelector("tbody");

    steps().forEach((step, i) => {
      const tr = document.createElement("tr");
      const head = document.createElement("td");
      head.textContent = step.name || String(i + 1);
      tr.appendChild(head);

      const make = (get, set, stride) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.step = String(stride);
        const sync = () => {
          if (document.activeElement !== input) input.value = short(get());
        };
        input.addEventListener("change", () => {
          const v = parseFloat(input.value);
          if (Number.isFinite(v)) set(v);
          saveDiff();
          drawAll();
        });
        input.addEventListener("blur", sync);
        binders.push(sync);
        sync();
        td.appendChild(input);
        tr.appendChild(td);
      };

      const list = steps();
      make(
        () => Math.round((1 - list[i].p) * 100),
        (v) => {
          if (i === 0 || i === list.length - 1) return;
          const lo = list[i - 1].p + 0.02;
          const hi = list[i + 1].p - 0.02;
          list[i].p = +clamp(1 - v / 100, lo, hi).toFixed(3);
        },
        1,
      );
      make(
        () => +indexAt(list[i].p).toFixed(1),
        (v) => {
          if (i === 0) return;
          indexInto(list[i], v);
        },
        0.5,
      );
      make(
        () => list[i].attack,
        (v) => {
          list[i].attack = +clamp(v, 0, 12).toFixed(3);
        },
        0.01,
      );
      make(
        () => list[i].resist,
        (v) => {
          list[i].resist = +clamp(v, 0.01, 4).toFixed(3);
        },
        0.01,
      );
      tbody.appendChild(tr);
    });
    return box;
  }
  const card = document.createElement("div");
  card.className = "t-card";
  card.innerHTML = `
    <b>Індекс складності</b>
    <div class="t-sub"></div>
    <canvas></canvas>
    <button class="t-more" type="button"></button>`;
  body.appendChild(card);

  const sub = card.querySelector(".t-sub");
  const cv = card.querySelector("canvas");
  const more = card.querySelector(".t-more");

  let table = null;
  let opened = false;

  function render() {
    sub.textContent = "×разів відносно відкриття бою · ";
    const chip = document.createElement("code");
    chip.textContent = "curve.steps[].attack / resist";
    sub.appendChild(chip);
    card.classList.toggle("t-open", opened);
    more.textContent = `${opened ? "−" : "+"} ЧИСЛА · CURVE.STEPS[]`;
    if (table) table.remove();
    table = null;
    binders.length = 0;
    if (opened) {
      table = numbers();
      card.appendChild(table);
    }
    drawAll();
  }
  bind(cv);
  more.addEventListener("click", () => {
    opened = !opened;
    render();
  });

  function restore() {
    Object.keys(ROOTS).forEach((r) => {
      const copy = (b, d) => {
        Object.keys(b).forEach((k) => {
          if (b[k] && typeof b[k] === "object") copy(b[k], d[k]);
          else d[k] = b[k];
        });
      };
      copy(baseline[r], ROOTS[r]);
    });
    setWorldRate(baseline.WORLD_RATE);
    keep(SAVE, null);
    drawAll();
  }

  async function copyDiff() {
    const diff = saveDiff();
    const keys = Object.keys(diff).sort();
    const text = keys.length
      ? keys
          .map(
            (k) =>
              `${k.replace(/\.(\d+)(?=\.)/g, "[$1]")} = ${short(diff[k])};`,
          )
          .join("\n")
      : "// нічого не змінено";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {}
      area.remove();
    }
    return text;
  }

  const buttons = [
    { label: "СКИНУТИ", run: restore },
    {
      label: "ПЕРЕЗАПУСК",
      run: () => {
        if (typeof scene.restart === "function") scene.restart();
      },
    },
    {
      label: "КОПІЮВАТИ",
      run: async (el) => {
        const text = await copyDiff();
        const was = el.textContent;
        el.textContent = text.startsWith("//") ? "НІЧОГО" : "СКОПІЙОВАНО";
        el.classList.add("t-act");
        window.setTimeout(() => {
          el.textContent = was;
          el.classList.remove("t-act");
        }, 1200);
      },
    },
  ];
  buttons.forEach((b) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = b.label;
    el.addEventListener("click", () => b.run(el));
    bar.appendChild(el);
  });

  const READOUT = [
    { label: "hp боса", get: (d) => `${Math.round(d.bossHp * 100)}%` },
    { label: "секунда", get: (d) => `${(d.progress() * span()).toFixed(1)}с` },
    {
      label: "×індекс",
      get: (d) => `×${feltIndex(d.pressure(), d.wounds()).toFixed(1)}`,
    },
    { label: "бос", get: (d) => `${(100 * bossAt(d.pressure())).toFixed(1)}%` },
    { label: "камінь", get: (d) => `${(100 * gemAt(d.wounds())).toFixed(1)}%` },
    { label: "ульта", get: (d) => `${(100 * ultAt(d.wounds())).toFixed(1)}%` },
  ];
  const cells = READOUT.map((r) => {
    const el = document.createElement("div");
    el.innerHTML = `<span></span><b>—</b>`;
    el.querySelector("span").textContent = r.label;
    live.appendChild(el);
    return el.querySelector("b");
  });

  let last = 0;
  function tick(now) {
    window.requestAnimationFrame(tick);
    if (!root.classList.contains("open") || now - last < 150) return;
    last = now;
    const d = scene.director;
    READOUT.forEach((r, i) => {
      let text = "—";
      if (d) {
        try {
          text = r.get(d);
        } catch {
          text = "—";
        }
      }
      cells[i].textContent = text;
    });
    if (!grab) paint(cv);
  }
  window.requestAnimationFrame(tick);

  const wideBtn = root.querySelector(".t-wide");

  function wide(on) {
    const want = on === undefined ? !root.classList.contains("wide") : !!on;
    root.classList.toggle("wide", want);
    wideBtn.textContent = want ? "⤡" : "⛶";
    const label = want ? "Зменшити" : "На весь екран";
    wideBtn.title = label;
    wideBtn.setAttribute("aria-label", label);
    keep(WIDE, want ? "on" : null);
    drawAll();
    window.requestAnimationFrame(() => paint(cv));
  }

  root.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", () => {
      const act = el.dataset.act;
      if (act === "wide") wide();
      else if (act === "close") root.classList.remove("open");
      else show(false, true);
    });
  });
  icon.addEventListener("click", () => {
    root.classList.toggle("open");
    icon.classList.toggle("on", root.classList.contains("open"));
    if (root.classList.contains("open")) drawAll();
  });

  function show(on, persist) {
    const want = on === undefined ? root.style.display === "none" : !!on;
    root.style.display = want ? "" : "none";
    if (!want) root.classList.remove("open");
    if (persist) keep(KEY, want ? "on" : "off");
    return want;
  }

  const saved = store(SAVE);
  if (saved) {
    try {
      applyDiff(JSON.parse(saved));
    } catch {
      keep(SAVE, null);
    }
  }
  render();
  wide(store(WIDE) === "on");

  return show;
}

export function mountTuner(scene) {
  if (typeof document === "undefined") return () => false;

  let show = null;
  const ready = () => {
    if (!show && !document.getElementById(ID)) show = build(scene);
    return show;
  };
  const isOn = () => {
    const el = document.getElementById(ID);
    return !!el && el.style.display !== "none";
  };

  if (asked()) {
    const open = ready();
    if (open) open(true, false);
  }

  return (on) => {
    const want = on === undefined ? !isOn() : !!on;
    if (want) {
      const open = ready();
      if (open) open(true, true);
    } else if (show) {
      show(false, true);
    } else {
      keep(KEY, "off");
    }
    return want;
  };
}
