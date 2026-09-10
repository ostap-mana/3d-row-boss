import { DIFFICULTY, DOOM, T, ULT_PACE, WORLD_RATE } from "../config.js";
import { setWorldRate, worldRate } from "../core/juice.js";

const KEY = "siege.tuner";
const SAVE = "siege.tune";
const ID = "siege-tuner";

const ROOTS = { DIFFICULTY, DOOM, T, ULT_PACE };

const clone = (v) => JSON.parse(JSON.stringify(v));

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

const SPEC = [
  {
    group: "Гравець",
    rows: [
      {
        path: "DIFFICULTY.damagePerGem",
        label: "Урон за камінь",
        min: 0.005,
        max: 0.2,
        step: 0.005,
      },
      {
        path: "DIFFICULTY.sizeBonus.4",
        label: "Бонус за 4 клітини",
        min: 1,
        max: 3,
        step: 0.05,
      },
      {
        path: "DIFFICULTY.sizeBonus.5",
        label: "Бонус за 5 клітин",
        min: 1,
        max: 3,
        step: 0.05,
      },
      {
        path: "DIFFICULTY.downedPenalty",
        label: "Внесок збитого героя",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.assistImpact",
        label: "Сила асиста",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.healDecay",
        label: "Спад хілу за каст",
        min: 0,
        max: 0.5,
        step: 0.01,
      },
    ],
    table: {
      label: "Множник каскаду",
      base: "DIFFICULTY.comboMultiplier",
      head: ["1", "2", "3", "4", "5"],
      cols: [0, 1, 2, 3, 4].map((i) => ({ path: String(i), step: 0.05 })),
      rows: 1,
      flat: true,
    },
  },
  {
    group: "Ультімейт",
    rows: [
      {
        path: "DIFFICULTY.ultDamage",
        label: "Плаский урон ульти",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.ultGemMultiplier",
        label: "Множник за камені ульти",
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        path: "DIFFICULTY.ultHideBite",
        label: "Броня в степені (ultHideBite)",
        min: 0.5,
        max: 6,
        step: 0.1,
      },
      {
        path: "DIFFICULTY.chargePerGem",
        label: "Заряд за камінь",
        min: 0.02,
        max: 0.6,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.chargeStart",
        label: "Стартовий заряд лідера",
        min: 0,
        max: 1,
        step: 0.01,
        hold: true,
      },
      {
        path: "DIFFICULTY.partyChargePerGem",
        label: "Заряд партії за камінь",
        min: 0.02,
        max: 0.6,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.partyChargeStart",
        label: "Стартовий заряд партії",
        min: 0,
        max: 1,
        step: 0.01,
        hold: true,
      },
      {
        path: "DIFFICULTY.ultTimeRate",
        label: "Швидкість часу в касті",
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      {
        path: "ULT_PACE.rush",
        label: "Ульт: розгін",
        min: 1,
        max: 12,
        step: 0.5,
      },
      {
        path: "ULT_PACE.cast",
        label: "Ульт: каст",
        min: 0.4,
        max: 3,
        step: 0.05,
      },
      {
        path: "ULT_PACE.tail",
        label: "Ульт: хвіст",
        min: 0,
        max: 1,
        step: 0.02,
      },
    ],
    flags: [{ path: "DIFFICULTY.ultCostsTime", label: "Ульта коштує часу" }],
  },
  {
    group: "Крива",
    rows: [
      {
        path: "DIFFICULTY.curve.seconds",
        label: "Довжина кривої, с",
        min: 10,
        max: 90,
        step: 1,
      },
      {
        path: "DIFFICULTY.curve.clockFloor",
        label: "Підлога тиску (× годинник)",
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: "DIFFICULTY.curve.clockLead",
        label: "Відрив уперед (clockLead)",
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
    flags: [{ path: "DIFFICULTY.curve.enabled", label: "Крива увімкнена" }],
    table: {
      label: "Keyframe-и кривої",
      base: "DIFFICULTY.curve.steps",
      head: ["тиск", "attack", "resist", "обсид.", "стеля"],
      cols: [
        { path: "p", step: 0.01 },
        { path: "attack", step: 0.02 },
        { path: "resist", step: 0.02 },
        { path: "obsidian", step: 1 },
        { path: "hold", step: 1 },
      ],
      names: true,
    },
  },
  {
    group: "Броня і темп",
    rows: [
      {
        path: "DIFFICULTY.pace.seconds",
        label: "Розпис сторожа, с",
        min: 10,
        max: 90,
        step: 1,
      },
      {
        path: "DIFFICULTY.pace.bite",
        label: "Хват сторожа (степінь)",
        min: 0.5,
        max: 6,
        step: 0.1,
      },
      {
        path: "DIFFICULTY.pace.floor",
        label: "Підлога сторожа",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.ragePerSecond",
        label: "Лють за секунду",
        min: 0,
        max: 0.05,
        step: 0.001,
      },
      {
        path: "DIFFICULTY.rageMax",
        label: "Стеля люті",
        min: 1,
        max: 3,
        step: 0.01,
      },
      {
        path: "DIFFICULTY.bossRamp",
        label: "Ramp боса за хід",
        min: 1,
        max: 1.8,
        step: 0.01,
      },
    ],
    flags: [
      { path: "DIFFICULTY.pace.enabled", label: "Сторож темпу увімкнений" },
    ],
    table: {
      label: "Шари броні (крива вимкнена)",
      base: "DIFFICULTY.armor",
      head: ["нижче", "множник"],
      cols: [
        { path: "below", step: 0.01 },
        { path: "mult", step: 0.02 },
      ],
      names: true,
    },
  },
  {
    group: "Обсидіан",
    rows: [
      {
        path: "DIFFICULTY.obsidianBase",
        label: "База за хід",
        min: 0,
        max: 12,
        step: 1,
      },
      {
        path: "DIFFICULTY.obsidianGrowth",
        label: "Приріст за хід",
        min: 0,
        max: 3,
        step: 0.1,
      },
      {
        path: "DIFFICULTY.obsidianMax",
        label: "Стеля на дошці",
        min: 1,
        max: 25,
        step: 1,
      },
      {
        path: "DIFFICULTY.obsidianMaxGrowth",
        label: "Приріст стелі",
        min: 0,
        max: 3,
        step: 0.1,
      },
      {
        path: "DIFFICULTY.obsidianMaxCap",
        label: "Жорстка стеля",
        min: 1,
        max: 25,
        step: 1,
      },
    ],
  },
  {
    group: "Годинник",
    rows: [
      {
        path: "DOOM.seconds",
        label: "Показаних секунд",
        min: 10,
        max: 120,
        step: 1,
        hold: true,
      },
      {
        path: "DOOM.stretch.extra",
        label: "Додати реальних секунд",
        min: 0,
        max: 20,
        step: 1,
      },
      {
        path: "DOOM.stretch.window",
        label: "Вікно розтягу, с",
        min: 1,
        max: 30,
        step: 1,
      },
      {
        path: "DOOM.stretch.shape",
        label: "Форма розтягу",
        min: 0.2,
        max: 4,
        step: 0.1,
      },
      {
        path: "DOOM.damage",
        label: "Урон катаклізму",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "DOOM.damageRamp",
        label: "Ramp катаклізму",
        min: 1,
        max: 2,
        step: 0.05,
      },
      {
        path: "DOOM.repeat",
        label: "Перша пауза, с",
        min: 1,
        max: 15,
        step: 0.5,
      },
      {
        path: "DOOM.repeatDecay",
        label: "Спад паузи",
        min: 0.3,
        max: 1,
        step: 0.02,
      },
      {
        path: "DOOM.repeatFloor",
        label: "Підлога паузи, с",
        min: 0.5,
        max: 10,
        step: 0.5,
      },
      {
        path: "DOOM.panicAt",
        label: "Паніка на, с",
        min: 0,
        max: 12,
        step: 0.5,
      },
      {
        path: "T.hardCap",
        label: "Хардкап рану, с",
        min: 10,
        max: 120,
        step: 1,
      },
      {
        path: "T.bossPress",
        label: "Пауза між ходами боса, с",
        min: 0.5,
        max: 10,
        step: 0.1,
      },
      {
        path: "T.moveCost",
        label: "Ціна ходу, с",
        min: 0.5,
        max: 8,
        step: 0.1,
      },
      {
        path: "WORLD_RATE",
        label: "Швидкість світу",
        min: 0.3,
        max: 2,
        step: 0.05,
        world: true,
      },
    ],
  },
  {
    group: "Ран",
    rows: [
      {
        path: "T.auto",
        label: "Автоплей: пауза, с",
        min: 0.5,
        max: 6,
        step: 0.1,
      },
      {
        path: "T.autoFloor",
        label: "Автоплей: підлога, с",
        min: 0.05,
        max: 2,
        step: 0.05,
      },
    ],
    flags: [
      { path: "T.autoPlay", label: "Автоплей" },
      { path: "T.hints", label: "Підказки" },
      { path: "T.ultHints", label: "Підказки ульти" },
      { path: "DIFFICULTY.rigCascades", label: "Підіграні каскади" },
      { path: "DIFFICULTY.randomOpening", label: "Випадкове відкриття" },
      {
        path: "DIFFICULTY.randomOpeningHero",
        label: "Випадковий перший герой",
      },
    ],
  },
];

const PRESETS = [
  {
    name: "Легко",
    attack: 0.7,
    gem: 1.3,
    doom: 0.7,
    obsidian: 0.7,
    bite: 0.6,
    rage: 0.5,
  },
  {
    name: "Стандарт",
    attack: 1,
    gem: 1,
    doom: 1,
    obsidian: 1,
    bite: 1,
    rage: 1,
  },
  {
    name: "Важко",
    attack: 1.3,
    gem: 0.85,
    doom: 1.25,
    obsidian: 1.25,
    bite: 1.2,
    rage: 1.3,
  },
  {
    name: "Пекло",
    attack: 1.8,
    gem: 0.6,
    doom: 1.6,
    obsidian: 1.6,
    bite: 1.5,
    rage: 1.8,
  },
];

const CSS = `
#${ID}, #${ID} * { box-sizing: border-box; }
#${ID} {
  position: fixed; z-index: 2147483000; inset: auto 0 0 auto;
  font: 12px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: #e8e4f0; pointer-events: none;
}
#${ID} button, #${ID} input, #${ID} select { font: inherit; }
#${ID} .t-icon {
  pointer-events: auto; position: fixed;
  right: max(10px, env(safe-area-inset-right, 0px));
  top: max(10px, env(safe-area-inset-top, 0px));
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(12,9,20,0.86); color: #ffb08a; font-size: 21px; line-height: 1;
  border: 1px solid rgba(255,176,138,0.42); cursor: pointer;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
#${ID} .t-icon:active { background: rgba(30,20,44,0.94); }
#${ID} .t-icon.on { color: #0d0a14; background: #ffb08a; border-color: #ffb08a; }
#${ID} .t-panel {
  pointer-events: auto; position: fixed;
  right: max(8px, env(safe-area-inset-right, 0px));
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  top: calc(62px + max(8px, env(safe-area-inset-top, 0px)));
  width: min(360px, calc(100vw - 16px));
  display: none; flex-direction: column;
  background: rgba(10,7,16,0.95); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px; overflow: hidden;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 16px 44px rgba(0,0,0,0.55);
}
#${ID}.open .t-panel { display: flex; }
#${ID} .t-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,176,138,0.07); flex: none;
}
#${ID} .t-head b { font-size: 11px; letter-spacing: 0.1em; color: #ffb08a; font-weight: 600; }
#${ID} .t-head .t-sp { margin-left: auto; }
#${ID} .t-x {
  background: none; border: 1px solid rgba(255,255,255,0.16); color: #cfc8dc;
  border-radius: 7px; padding: 4px 8px; cursor: pointer;
}
#${ID} .t-x:active { background: rgba(255,255,255,0.1); }
#${ID} .t-live {
  flex: none; display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1px 0; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
}
#${ID} .t-live div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
#${ID} .t-live span { font-size: 9px; letter-spacing: 0.06em; color: #8d85a0; text-transform: uppercase; }
#${ID} .t-live b { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
#${ID} .t-bar {
  flex: none; display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
#${ID} .t-bar button {
  flex: 1 1 auto; padding: 7px 6px; border-radius: 7px; cursor: pointer;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.13);
  color: #e8e4f0; white-space: nowrap;
}
#${ID} .t-bar button:active { background: rgba(255,176,138,0.24); }
#${ID} .t-bar button.t-act { color: #ffb08a; border-color: rgba(255,176,138,0.5); }
#${ID} .t-body {
  flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain;
  touch-action: pan-y; -webkit-overflow-scrolling: touch;
  padding: 4px 10px calc(12px + env(safe-area-inset-bottom, 0px));
}
#${ID} .t-grp { margin: 10px 0 2px; }
#${ID} .t-grp > summary {
  list-style: none; cursor: pointer; padding: 6px 0;
  font-size: 10px; letter-spacing: 0.13em; text-transform: uppercase; color: #ffb08a;
  border-bottom: 1px solid rgba(255,176,138,0.22);
}
#${ID} .t-grp > summary::-webkit-details-marker { display: none; }
#${ID} .t-grp > summary::before { content: "▸ "; }
#${ID} .t-grp[open] > summary::before { content: "▾ "; }
#${ID} .t-row { padding: 7px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
#${ID} .t-lab { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
#${ID} .t-lab i { font-style: normal; color: #cfc8dc; flex: 1 1 auto; min-width: 0; }
#${ID} .t-lab u { text-decoration: none; color: #ffb08a; font-size: 10px; }
#${ID} .t-in { display: flex; align-items: center; gap: 8px; }
#${ID} input[type=range] {
  flex: 1 1 auto; min-width: 0; height: 26px; margin: 0;
  accent-color: #ffb08a; background: none;
}
#${ID} input[type=number] {
  flex: 0 0 66px; width: 66px; padding: 4px 5px; text-align: right;
  background: rgba(255,255,255,0.06); color: #e8e4f0;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
  font-variant-numeric: tabular-nums; -moz-appearance: textfield;
}
#${ID} input[type=number]::-webkit-outer-spin-button,
#${ID} input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#${ID} .t-row.t-off input[type=number] { border-color: rgba(255,176,138,0.6); }
#${ID} .t-flag {
  display: flex; align-items: center; gap: 9px; padding: 7px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer;
}
#${ID} .t-flag input { width: 17px; height: 17px; margin: 0; accent-color: #ffb08a; }
#${ID} .t-tab { margin: 9px 0 2px; }
#${ID} .t-tab > div { font-size: 10px; letter-spacing: 0.08em; color: #8d85a0; margin-bottom: 5px; text-transform: uppercase; }
#${ID} .t-tab table { width: 100%; border-collapse: collapse; }
#${ID} .t-tab th {
  font-size: 9px; font-weight: 400; color: #8d85a0; text-align: right;
  padding: 0 3px 4px; letter-spacing: 0.05em;
}
#${ID} .t-tab th:first-child { text-align: left; }
#${ID} .t-tab td { padding: 1px 2px; }
#${ID} .t-tab td:first-child { font-size: 9px; color: #8d85a0; white-space: nowrap; padding-right: 4px; }
#${ID} .t-tab input {
  width: 100%; min-width: 0; padding: 4px 4px; text-align: right;
  background: rgba(255,255,255,0.06); color: #e8e4f0;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 5px;
  font-variant-numeric: tabular-nums; -moz-appearance: textfield;
}
#${ID} .t-tab input::-webkit-outer-spin-button,
#${ID} .t-tab input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#${ID} .t-note { color: #8d85a0; padding: 10px 0 4px; }
#${ID} .t-note code { color: #ffb08a; }
@media (max-width: 520px) {
  #${ID} .t-panel {
    left: max(8px, env(safe-area-inset-left, 0px)); width: auto;
  }
  #${ID} .t-live { grid-template-columns: repeat(3, 1fr); }
}
@media (prefers-reduced-motion: reduce) { #${ID} * { transition: none !important; } }
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

function read(path) {
  const h = holder(path);
  return h ? h.node[h.key] : undefined;
}

function write(path, value) {
  const h = holder(path);
  if (h) h.node[h.key] = value;
}

function num(el, fallback) {
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
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
    <div class="t-panel" role="dialog" aria-label="Параметри складності">
      <div class="t-head">
        <b>СКЛАДНІСТЬ</b>
        <div class="t-sp"></div>
        <button class="t-x" type="button" data-act="hide">сховати</button>
        <button class="t-x" type="button" data-act="close">✕</button>
      </div>
      <div class="t-live"></div>
      <div class="t-bar"></div>
      <div class="t-body"></div>
    </div>`;
  document.body.appendChild(root);

  const icon = root.querySelector(".t-icon");
  const live = root.querySelector(".t-live");
  const bar = root.querySelector(".t-bar");
  const body = root.querySelector(".t-body");

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

  function refresh() {
    binders.forEach((fn) => fn());
  }

  function touched(path) {
    if (path === "WORLD_RATE") return worldRate() !== baseline.WORLD_RATE;
    const parts = splitPath(path);
    let base = baseline[parts[0]];
    for (let i = 1; i < parts.length && base != null; i++)
      base = base[parts[i]];
    return read(path) !== base;
  }

  function slider(row) {
    const el = document.createElement("div");
    el.className = "t-row";
    el.innerHTML = `
      <div class="t-lab"><i></i><u></u></div>
      <div class="t-in">
        <input type="range" min="${row.min}" max="${row.max}" step="${row.step}">
        <input type="number" step="${row.step}">
      </div>`;
    const label = el.querySelector("i");
    const badge = el.querySelector("u");
    const range = el.querySelector("input[type=range]");
    const field = el.querySelector("input[type=number]");
    label.textContent = row.label;
    badge.textContent = row.hold ? "⟲" : "";
    badge.title = row.hold ? "потрібен перезапуск рану" : "";

    const get = () => (row.world ? worldRate() : read(row.path));
    const set = (v) => {
      const clamped = Math.min(row.max, Math.max(row.min, v));
      if (row.world) setWorldRate(clamped);
      else write(row.path, clamped);
      saveDiff();
      sync();
    };

    function sync() {
      const v = get();
      range.value = String(v);
      if (document.activeElement !== field) field.value = short(v);
      el.classList.toggle("t-off", touched(row.path));
    }

    range.addEventListener("input", () => set(num(range, get())));
    field.addEventListener("change", () => set(num(field, get())));
    field.addEventListener("blur", sync);
    binders.push(sync);
    sync();
    return el;
  }

  function flag(row) {
    const el = document.createElement("label");
    el.className = "t-flag";
    el.innerHTML = `<input type="checkbox"><span></span>`;
    const box = el.querySelector("input");
    el.querySelector("span").textContent = row.label;
    const sync = () => {
      box.checked = !!read(row.path);
    };
    box.addEventListener("change", () => {
      write(row.path, box.checked);
      saveDiff();
    });
    binders.push(sync);
    sync();
    return el;
  }

  function table(spec) {
    const el = document.createElement("div");
    el.className = "t-tab";
    const arr = read(spec.base) || [];
    const rows = spec.flat ? [arr] : arr;
    const head = spec.names
      ? `<th></th>${spec.head.map((h) => `<th>${h}</th>`).join("")}`
      : spec.head.map((h) => `<th>${h}</th>`).join("");
    el.innerHTML = `<div>${spec.label}</div><table><thead><tr>${head}</tr></thead><tbody></tbody></table>`;
    const tbody = el.querySelector("tbody");

    rows.forEach((entry, ri) => {
      const tr = document.createElement("tr");
      if (spec.names) {
        const td = document.createElement("td");
        td.textContent = entry && entry.name ? entry.name : String(ri + 1);
        tr.appendChild(td);
      }
      spec.cols.forEach((col) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.step = String(col.step);
        const path = spec.flat
          ? `${spec.base}.${col.path}`
          : `${spec.base}.${ri}.${col.path}`;
        const sync = () => {
          if (document.activeElement !== input) input.value = short(read(path));
        };
        input.addEventListener("change", () => {
          const v = num(input, read(path));
          write(path, v);
          saveDiff();
          sync();
        });
        input.addEventListener("blur", sync);
        binders.push(sync);
        sync();
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return el;
  }

  SPEC.forEach((group, gi) => {
    const box = document.createElement("details");
    box.className = "t-grp";
    if (gi === 0) box.open = true;
    const sum = document.createElement("summary");
    sum.textContent = group.group;
    box.appendChild(sum);
    (group.rows || []).forEach((row) => box.appendChild(slider(row)));
    (group.flags || []).forEach((row) => box.appendChild(flag(row)));
    if (group.table) box.appendChild(table(group.table));
    body.appendChild(box);
  });

  const note = document.createElement("div");
  note.className = "t-note";
  note.innerHTML =
    "⟲ — читається на старті рану, тому потрібен ПЕРЕЗАПУСК. Решта діє одразу, під пальцем. " +
    "Зміни лежать у localStorage і живуть після перезавантаження; <code>СКИНУТИ</code> прибирає їх.";
  body.appendChild(note);

  function preset(p) {
    applyDiff({});
    Object.keys(ROOTS).forEach((r) => {
      const src = baseline[r];
      const dst = ROOTS[r];
      const copy = (b, d) => {
        Object.keys(b).forEach((k) => {
          if (b[k] && typeof b[k] === "object") copy(b[k], d[k]);
          else d[k] = b[k];
        });
      };
      copy(src, dst);
    });
    setWorldRate(baseline.WORLD_RATE);

    DIFFICULTY.curve.steps.forEach((step, i) => {
      step.attack = +(
        baseline.DIFFICULTY.curve.steps[i].attack * p.attack
      ).toFixed(4);
      step.obsidian = Math.max(
        0,
        Math.round(baseline.DIFFICULTY.curve.steps[i].obsidian * p.obsidian),
      );
      step.hold = Math.max(
        1,
        Math.round(baseline.DIFFICULTY.curve.steps[i].hold * p.obsidian),
      );
    });
    DIFFICULTY.damagePerGem = +(
      baseline.DIFFICULTY.damagePerGem * p.gem
    ).toFixed(4);
    DIFFICULTY.pace.bite = +(baseline.DIFFICULTY.pace.bite * p.bite).toFixed(3);
    DIFFICULTY.ragePerSecond = +(
      baseline.DIFFICULTY.ragePerSecond * p.rage
    ).toFixed(5);
    DOOM.damage = +(baseline.DOOM.damage * p.doom).toFixed(4);
    DOOM.repeat = +(baseline.DOOM.repeat / Math.max(0.3, p.doom)).toFixed(2);
    saveDiff();
    refresh();
  }

  function reset() {
    keep(SAVE, null);
    preset(PRESETS[1]);
    keep(SAVE, null);
    refresh();
  }

  async function copyDiff() {
    const diff = saveDiff();
    const keys = Object.keys(diff).sort();
    const text = keys.length
      ? keys.map((k) => `${k} = ${diff[k]};`).join("\n")
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
    ...PRESETS.map((p) => ({ label: p.name, run: () => preset(p) })),
    { label: "СКИНУТИ", run: reset },
    {
      label: "ПЕРЕЗАПУСК",
      run: () => {
        if (typeof scene.restart === "function") scene.restart();
      },
    },
    {
      label: "КОПІЮВАТИ ДІФ",
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
    { label: "HP боса", get: (d) => `${Math.round(d.bossHp * 100)}%` },
    { label: "тиск", get: (d) => `${Math.round(d.pressure() * 100)}%` },
    { label: "годинник", get: (d) => `${Math.round(d.progress() * 100)}%` },
    {
      label: "attack",
      get: (d) => `×${d.curveAt("attack", d.pressure(), 1).toFixed(2)}`,
    },
    { label: "броня", get: (d) => `${Math.round(d.armor() * 100)}%` },
    { label: "темп", get: (d) => `${Math.round(d.pace() * 100)}%` },
    { label: "лють", get: (d) => `×${d.rage().toFixed(3)}` },
    { label: "хід", get: (d) => String(d.turn) },
    { label: "смужка", get: (d) => `${d.doomLeft.toFixed(1)}с` },
    { label: "ульта", get: (d) => `${Math.round(d.ultResistance() * 100)}%` },
    {
      label: "обсидіан",
      get: (d) => String(d.curveAt("obsidian", d.pressure(), 0).toFixed(1)),
    },
    { label: "світ", get: () => `×${worldRate().toFixed(2)}` },
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
    if (!root.classList.contains("open") || now - last < 140) return;
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
  }
  window.requestAnimationFrame(tick);

  root.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.act === "close") root.classList.remove("open");
      else show(false, true);
    });
  });
  icon.addEventListener("click", () => {
    root.classList.toggle("open");
    icon.classList.toggle("on", root.classList.contains("open"));
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
      refresh();
    } catch {
      keep(SAVE, null);
    }
  }

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
