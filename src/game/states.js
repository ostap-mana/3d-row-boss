import {
  ARCANE,
  BOSS_ATTACKS,
  COLS,
  FIRE,
  GEM_COLORS,
  GEM_LIGHT,
  HERO_MAX_HP,
  LIGHTNING,
  NATURE,
  ROWS,
  WATER,
  WIND,
} from "../config.js";
import { clearStop, setTimeScale } from "../core/juice.js";
import { killTweensOf } from "../core/tween.js";
import { nextFrame } from "../core/idle.js";

const SLOW_FLOOR = 0.01;

const BUSY_CAP = 12000;

function attackArgs(kind) {
  return (d) => {
    const live = d.currentAttack();
    const base = BOSS_ATTACKS.find((a) => a.kind === kind);
    const attack = base
      ? { ...live, kind, targets: base.targets, shout: base.shout }
      : live;
    return [attack, d.pickObsidian(attack)];
  };
}

function openCell(d) {
  const board = d.s.board;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!board.isLocked(r, c)) return { r, c };
    }
  }
  return { r: 0, c: 0 };
}

const STATES = [
  { name: "boss.turn", group: "boss", fn: "bossTurn" },
  {
    name: "boss.volley",
    group: "boss",
    fn: "bossVolley",
    args: attackArgs("volley"),
  },
  {
    name: "boss.fissure",
    group: "boss",
    fn: "bossFissure",
    args: attackArgs("fissure"),
  },
  {
    name: "boss.smash",
    group: "boss",
    fn: "bossSmash",
    args: attackArgs("smash"),
  },
  { name: "boss.mend", group: "boss", fn: "bossMend" },
  {
    name: "boss.snap",
    group: "boss",
    fn: "bossSnap",
    args: (d) => [openCell(d)],
  },
  { name: "boss.doom", group: "boss", fn: "castDoom", args: () => [false] },
  {
    name: "boss.doom.lethal",
    group: "boss",
    fn: "castDoom",
    args: () => [true],
  },
  {
    name: "boss.strike",
    group: "boss",
    fn: "strikeHeroes",
    args: (d) => [d.currentAttack()],
  },
  {
    name: "boss.obsidian",
    group: "boss",
    fn: "dropObsidian",
    args: (d) => [attackArgs(d)[1], 0],
  },
  {
    name: "boss.erupt",
    group: "boss",
    fn: "eruptObsidian",
    args: (d) => [attackArgs(d)[1]],
  },
  { name: "boss.phase", group: "boss", fn: "checkPhase", tick: true },

  { name: "ult.cast", group: "ult", fn: "playUltimate" },
  { name: "ult.surge", group: "ult", fn: "surgeUlt", args: (d) => [d.ultHero] },
  { name: "ult.teach", group: "ult", fn: "teachUlt", args: (d) => [d.ultHero] },

  { name: "board.turn", group: "board", fn: "playerTurn" },
  { name: "board.resolve", group: "board", fn: "resolveMove" },
  { name: "board.autoplay", group: "board", fn: "autoPlay" },

  { name: "coach.idle", group: "coach", fn: "beginIdle" },
  { name: "coach.hint", group: "coach", fn: "refreshHint" },
  { name: "coach.hand", group: "coach", fn: "pointHand" },

  { name: "outcome.win", group: "outcome", fn: "win" },
  { name: "outcome.lose", group: "outcome", fn: "lose" },
  { name: "outcome.finish", group: "outcome", fn: "finish" },
];

const CARDS = [
  { name: "card.victory", group: "outcome", show: "victory" },
  { name: "card.defeat", group: "outcome", show: "defeat" },
];

const OWNED = new Set(STATES.map((s) => s.name));

const QUIET = [
  "vfx",
  "cutin",
  "ultSurge",
  "ultRim",
  "coach",
  "spotlight",
  "hand",
  "boss",
  "board",
  "heroRow",
  "hud",
];

const FX_ELEMENT = WATER;

const BRINK_HP = 420;
const NEAR_DEATH = 0.04;

function cardsOf(scene) {
  return (scene.heroRow && scene.heroRow.cards) || [];
}

function settle(list) {
  return Promise.all(list.map((v) => Promise.resolve(v).catch(() => null)));
}

function setBossHp(scene, value) {
  const d = scene.director;
  if (!d) return false;
  d.bossHp = Math.max(0, Math.min(1, value));
  scene.hud.setHp(d.bossHp, 0.35);
  d.checkPhase();
  return d.bossHp;
}

function setPartyHp(scene, hp) {
  return settle(
    cardsOf(scene).map((card) => (card.downed ? null : card.setHp(hp, 0.3))),
  );
}

function armUlts(scene) {
  let armed = 0;
  for (const card of cardsOf(scene)) if (card.addCharge(1)) armed++;
  return armed;
}

function armDoom(scene) {
  const d = scene.director;
  if (!d) return false;
  d.doomLeft = 0.01;
  d.doomArmed = true;
  return true;
}

async function finale(scene, engine, kind) {
  let d = scene.director;
  if (!d) return false;
  if (d.settled() && typeof scene.restart === "function") {
    scene.restart();
    await nextFrame();
    d = scene.director;
    if (!d) return false;
  }
  engine.halt({ freeze: false });
  engine.thaw();
  await (kind === "victory" ? d.win() : d.lose());
  return d.finish();
}

function heroStrike(scene, index, lead) {
  const { heroRow, boss, vfx } = scene;
  const card = heroRow && heroRow.cards[index];
  if (!card || !boss || !vfx) return false;
  const target = boss.impactPoint();
  const from = heroRow.cardPoint(index);
  const color = GEM_COLORS[card.hero.element];
  const power = lead ? 0.95 : 0.6;
  card.strike(!!lead);
  return vfx
    .beam(from, target, color, {
      thickness: lead ? 20 : 10,
      impact: power,
      travel: lead ? 0.16 : 0.2,
      element: card.hero.element,
    })
    .then(() => {
      boss.hit(power);
      scene.shake(lead ? 6 : 3, lead ? 0.24 : 0.14, {
        axis: { x: target.x - from.x, y: target.y - from.y },
      });
      return true;
    });
}

const HIT_ELEMENTS = [
  { el: FIRE, id: "fire", label: "ВОГОНЬ" },
  { el: WATER, id: "water", label: "ВОДА" },
  { el: NATURE, id: "earth", label: "ЗЕМЛЯ" },
  { el: WIND, id: "air", label: "ПОВІТРЯ" },
  { el: LIGHTNING, id: "light", label: "СВІТЛО" },
  { el: ARCANE, id: "dark", label: "ТЕМРЯВА" },
];

function elementHit(scene, el) {
  const { boss, vfx } = scene;
  if (!boss || !vfx) return false;
  const at = boss.impactPoint();
  vfx.impact(at, GEM_COLORS[el], 1.2, el);
  scene.shake(6, 0.22);
  return true;
}

function heroSpell(scene, index) {
  const { heroRow, boss, vfx } = scene;
  const card = heroRow && heroRow.cards[index];
  if (!card || !boss || !vfx) return false;
  const el = card.hero.element;
  const b = scene.layout.board;
  const origin = { x: b.x + b.size / 2, y: b.y + b.size / 2 };
  const target = boss.impactPoint();
  const color = GEM_COLORS[el];
  card.strike(true);
  return vfx
    .spell(el, origin, target, color, {
      size: 218,
      travel: 0.16,
      blast: 0.4,
      beam: { thickness: 30, impact: 1.4, element: el },
    })
    .then(() => {
      vfx.impact(target, color, 1.4, el);
      boss.hit(1.4);
      scene.shake(12, 0.28, {
        axis: { x: target.x - origin.x, y: target.y - origin.y },
      });
      return true;
    });
}

function partyVolley(scene) {
  const d = scene.director;
  const cards = cardsOf(scene);
  if (!d || !cards.length) return false;
  d.partyVolley(2, cards[0].hero.element);
  return true;
}

const SCENES = [
  {
    name: "game.victory",
    label: "ПЕРЕМОГА",
    act: (scene, engine) => finale(scene, engine, "victory"),
  },
  {
    name: "game.defeat",
    label: "ПОРАЗКА",
    act: (scene, engine) => finale(scene, engine, "defeat"),
  },
  {
    name: "game.restart",
    label: "З ПОЧАТКУ",
    act: (scene) => (scene.restart ? scene.restart() : false),
  },
  {
    name: "game.bossLow",
    label: "БОС ПРИ СМЕРТІ",
    act: (scene) => setBossHp(scene, NEAR_DEATH),
  },
  {
    name: "game.bossHalf",
    label: "БОС НАПОЛОВИНУ",
    act: (scene) => setBossHp(scene, 0.5),
  },
  {
    name: "game.bossFull",
    label: "БОС ЦІЛИЙ",
    act: (scene) => setBossHp(scene, 1),
  },
  {
    name: "game.partyBrink",
    label: "ГЕРОЇ НА ВОЛОСИНІ",
    act: (scene) => setPartyHp(scene, BRINK_HP),
  },
  {
    name: "game.partyWhole",
    label: "ГЕРОЇ ЦІЛІ",
    act: (scene) => scene.heroRow.healAll(HERO_MAX_HP),
  },
  {
    name: "game.ultsReady",
    label: "УЛЬТИ ГОТОВІ",
    act: (scene) => armUlts(scene),
  },
  {
    name: "game.doomNow",
    label: "DOOM ЗАРАЗ",
    act: (scene) => armDoom(scene),
  },
];

function fxCtx(scene) {
  const L = scene.layout;
  const b = L.board;
  const at = { x: b.x + b.size / 2, y: b.y + b.size / 2 };
  const top = { x: L.boss.x, y: Math.max(L.safeBox.y, L.boss.floor - b.size) };
  const el = FX_ELEMENT;
  return {
    at,
    top,
    el,
    color: GEM_COLORS[el],
    light: GEM_LIGHT[el],
    cell: b.cell,
    size: b.size,
  };
}

const FX = [
  { n: "rise", g: "boss", a: () => [0.6] },
  { n: "roar", g: "boss" },
  { n: "spit", g: "boss" },
  { n: "smash", g: "boss" },
  { n: "hurl", g: "boss", a: () => [1] },
  { n: "mend", g: "boss", a: () => [0.9] },
  { n: "hit", g: "boss", a: () => [0.8] },
  { n: "spawnAsh", g: "boss", a: () => [14, 1] },
  { n: "blast", g: "boss", a: (c) => [c.top, 16, 1, 0.7] },
  { n: "dust", g: "boss", a: () => [12, 1] },
  { n: "enrage", g: "boss" },
  { n: "die", g: "boss" },

  { n: "burst", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color, 24, 1] },
  { n: "pop", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color, c.cell] },
  { n: "charge", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color, c.cell, 0.8] },
  { n: "ring", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color, c.cell * 2, 4] },
  { n: "blastWave", g: "vfx", a: (c) => [c.at.x, c.at.y, c.size * 0.6] },
  { n: "shockRing", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color] },
  { n: "shatter", g: "vfx", a: (c) => [c.at.x, c.at.y, c.cell, c.color] },
  { n: "ember", g: "vfx", a: (c) => [c.at.x, c.at.y, c.cell, c.color] },
  { n: "beam", g: "vfx", a: (c) => [c.top, c.at, c.color] },
  { n: "stream", g: "vfx", a: (c) => [c.el, c.top, c.at, c.color] },
  { n: "fireball", g: "vfx", a: (c) => [c.top, c.at, c.color] },
  { n: "spell", g: "vfx", a: (c) => [c.el, c.top, c.at, c.color] },
  { n: "ultCast", g: "vfx", a: (c) => [c.el, c.top, c.at, c.color, c.light] },
  { n: "boom", g: "vfx", a: (c) => [c.at, c.size * 0.5] },
  {
    n: "ultGather",
    g: "vfx",
    a: (c) => [c.at, c.color, c.light, c.size * 0.4],
  },
  { n: "ultMuzzle", g: "vfx", a: (c) => [c.top, c.at, c.color, c.cell] },
  { n: "ultLance", g: "vfx", a: (c) => [c.top, c.at, c.color, c.cell] },
  {
    n: "ultShock",
    g: "vfx",
    a: (c) => [c.at, c.top, c.color, c.light, c.cell * 2],
  },
  {
    n: "ultBeckon",
    g: "vfx",
    a: (c) => [c.at, c.el, c.color, c.light, c.cell * 2, c.cell * 2, true],
  },
  { n: "bossSwing", g: "vfx", a: (c) => ["fissure", c.at] },
  { n: "mend", g: "vfx", a: (c) => [c.at] },
  {
    n: "mendMotes",
    g: "vfx",
    a: (c) => [c.at, c.cell * 2, c.color, c.light, 0.8],
  },
  { n: "mendCinch", g: "vfx", a: (c) => [c.at, c.cell * 2, c.color, 0.8] },
  { n: "impact", g: "vfx", a: (c) => [c.at, c.color, 1, c.el] },
  { n: "hitPlate", g: "vfx", a: (c) => [c.at, c.color, 1, 0, c.el] },
  { n: "lick", g: "vfx", a: (c) => [c.at, c.color, 1, 0] },
  { n: "flash", g: "vfx", a: (c) => [c.color, 0.35, 0.4] },
  { n: "lob", g: "vfx", a: (c) => [c.top, c.at, c.color] },
  { n: "cone", g: "vfx", a: (c) => [c.top, c.at, c.color] },
  { n: "shock", g: "vfx", a: (c) => [c.at.x, c.at.y, c.color] },
  { n: "wave", g: "vfx", a: (c) => [c.top.y, c.at.y, c.color] },
  { n: "sweep", g: "vfx", a: (c) => [c.color] },

  { n: "enrage", g: "hud" },
  { n: "doomPanic", g: "hud" },
  { n: "showBanner", g: "hud" },
  { n: "shout", g: "hud", a: () => ["TEST SHOUT", 0.8] },
  { n: "damage", g: "hud", a: (c) => [999, c.at.x, c.at.y, 1] },
  { n: "hideShout", g: "hud", a: () => [false] },
  { n: "hideDoom", g: "hud" },

  { n: "play", g: "surge", layer: "ultSurge", a: () => [1] },
  { n: "hide", g: "surge", layer: "ultSurge", a: () => [false] },
  { n: "burnCrown", g: "surge", layer: "ultSurge", a: () => [1] },
  { n: "burnEdge", g: "surge", layer: "ultSurge", a: () => [1] },

  { n: "arm", g: "rim", layer: "ultRim", a: (c) => [c.el] },
  { n: "burst", g: "rim", layer: "ultRim" },
  { n: "disarm", g: "rim", layer: "ultRim" },

  { n: "play", g: "cutin", a: () => [1] },

  { n: "grab", g: "hand", a: (c) => [c.at.x, c.at.y] },
  { n: "letGo", g: "hand" },
  { n: "reach", g: "hand", a: (c) => [c.at.x, c.at.y] },
  { n: "tapLoop", g: "hand", a: (c) => [c.at] },
  { n: "press", g: "hand" },
  { n: "release", g: "hand" },
  { n: "stop", g: "hand" },

  { n: "hide", g: "spotlight" },

  { n: "healAll", g: "party", layer: "heroRow", a: () => [8000] },
  { n: "introIn", g: "party", layer: "heroRow", a: () => [0.35] },

  { n: "strike", g: "card", each: true, a: (c) => [c.el] },
  { n: "hurt", g: "card", each: true, a: () => [600] },
  { n: "heal", g: "card", each: true, a: () => [8000] },
  { n: "down", g: "card", each: true },
  { n: "revive", g: "card", each: true },
  { n: "beckon", g: "card", each: true, a: () => [1] },
  { n: "flareReady", g: "card", each: true },
  { n: "flareUlt", g: "card", each: true },
  { n: "flareLead", g: "card", each: true },
  { n: "lightUlt", g: "card", each: true },
  { n: "dimUlt", g: "card", each: true, a: () => [0.3] },
  { n: "splashElement", g: "card", each: true },
  { n: "throwRune", g: "card", each: true },
  { n: "washElement", g: "card", each: true },
  { n: "sweepComet", g: "card", each: true, a: () => [1] },
];

const FX_LAYER = {
  boss: "boss",
  vfx: "vfx",
  hud: "hud",
  cutin: "cutin",
  hand: "hand",
  spotlight: "spotlight",
  card: "heroRow",
  party: "heroRow",
};

export function stateEngine(scene) {
  const live = new Map();
  const listeners = [];
  const wrapped = new WeakSet();
  let gen = 0;
  let frozen = false;
  let stepping = 0;
  let busyName = "";
  let busyUntil = 0;
  let rate = 1;

  const director = () => scene.director;

  function tell(event, name, extra) {
    const entry = { event, name, at: Math.round(performance.now()) };
    if (extra) Object.assign(entry, extra);
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](entry);
      } catch {
        continue;
      }
    }
  }

  function heroStates() {
    const cards = cardsOf(scene);
    return cards.map((card, index) => ({
      name: `ult.hero${index}`,
      group: "ult",
      fn: "playUltimate",
      hero: index,
      label: card.hero ? card.hero.name : `hero ${index}`,
    }));
  }

  function attackStates() {
    const cards = cardsOf(scene);
    if (!cards.length || !scene.boss || !scene.vfx) return [];
    const named = (card, index) =>
      card.hero ? card.hero.name : `hero ${index}`;
    const strikes = cards.map((card, index) => ({
      name: `attack.hero${index}`,
      group: "attack",
      label: named(card, index),
      act: (s) => heroStrike(s, index, true),
    }));
    const spells = cards.map((card, index) => ({
      name: `spell.hero${index}`,
      group: "spell",
      label: named(card, index),
      act: (s) => heroSpell(s, index),
    }));
    return [
      {
        name: "attack.volley",
        group: "attack",
        label: "ЗАЛП ПАРТІЇ",
        act: (s) => partyVolley(s),
      },
    ]
      .concat(strikes)
      .concat(spells);
  }

  function hitStates() {
    if (!scene.boss || !scene.vfx) return [];
    return HIT_ELEMENTS.map(({ el, id, label }) => ({
      name: `hit.${id}`,
      group: "hit",
      label,
      act: (s) => elementHit(s, el),
    }));
  }

  function hold(name, out) {
    busyName = name;
    busyUntil = performance.now() + BUSY_CAP;
    tell("busy", name);
    const free = () => {
      if (busyName !== name) return;
      busyName = "";
      busyUntil = 0;
      tell("free", name);
    };
    Promise.resolve(out).then(free, free);
    return out;
  }
  function fire(state, extra) {
    const fx = state.fx;
    const host = scene[state.host];
    if (!host) return false;
    const ctx = fxCtx(scene);
    const args = extra && extra.length ? extra : fx.a ? fx.a(ctx) : [];
    if (!fx.each) return host[fx.n](...args);
    const out = [];
    for (const card of host.cards || []) {
      try {
        out.push(card[fx.n](...args));
      } catch {
        continue;
      }
    }
    return Promise.all(out.map((v) => Promise.resolve(v).catch(() => null)));
  }

  function fxStates() {
    const out = [];
    for (const fx of FX) {
      const key = fx.layer || FX_LAYER[fx.g];
      const host = scene[key];
      if (!host) continue;
      if (fx.each) {
        const cards = host.cards || [];
        if (!cards.length || typeof cards[0][fx.n] !== "function") continue;
      } else if (typeof host[fx.n] !== "function") continue;
      const plain = `${fx.g}.${fx.n}`;
      out.push({
        name: OWNED.has(plain) ? `${fx.g}.fx.${fx.n}` : plain,
        group: fx.g,
        fx,
        host: key,
      });
    }
    return out;
  }
  function catalogue() {
    const d = director();
    if (!d) return fxStates();
    const own = STATES.concat(heroStates()).filter(
      (s) => typeof d[s.fn] === "function",
    );
    return SCENES.map((s) => ({ ...s, group: "game" }))
      .concat(attackStates())
      .concat(hitStates())
      .concat(own)
      .concat(scene.outcome ? CARDS : [])
      .concat(fxStates());
  }

  function find(name) {
    return catalogue().find((s) => s.name === name) || null;
  }

  function instrument() {
    const d = director();
    if (!d || wrapped.has(d)) return;
    wrapped.add(d);

    const seen = new Set();
    for (const state of STATES.concat(heroStates())) {
      const fn = state.fn;
      if (state.tick || seen.has(fn) || typeof d[fn] !== "function") continue;
      seen.add(fn);

      const real = d[fn];
      d[fn] = function (...args) {
        const mark = ++gen;
        const count = (live.get(fn) || 0) + 1;
        live.set(fn, count);
        tell("enter", fn, { gen: mark });

        const done = () => {
          const left = (live.get(fn) || 1) - 1;
          if (left > 0) live.set(fn, left);
          else live.delete(fn);
          tell("exit", fn, { gen: mark });
        };

        let out;
        try {
          out = real.apply(this, args);
        } catch (e) {
          done();
          throw e;
        }
        if (out && typeof out.then === "function") {
          return out.then(
            (v) => {
              done();
              return v;
            },
            (e) => {
              done();
              throw e;
            },
          );
        }
        done();
        return out;
      };
    }
  }

  function quiet() {
    for (const key of QUIET) {
      const target = scene[key];
      if (!target) continue;
      try {
        killTweensOf(target);
        if (target.scale) killTweensOf(target.scale);
      } catch {
        continue;
      }
    }
  }

  function release(d) {
    const keys = [
      "ultResolver",
      "ultChainResolver",
      "doomResolver",
      "stopResolver",
    ];
    for (const key of keys) {
      const fn = d[key];
      if (typeof fn !== "function") continue;
      d[key] = null;
      try {
        fn("stopped");
      } catch {
        continue;
      }
    }
  }

  const engine = {
    list() {
      const d = director();
      const running = new Set(live.keys());
      return catalogue().map((s) => ({
        name: s.name,
        group: s.group,
        live: running.has(s.fn),
        ready: !!d && !d.settled(),
        label: s.label,
      }));
    },

    groups() {
      const out = {};
      for (const s of engine.list()) {
        out[s.group] = out[s.group] || [];
        out[s.group].push(s.name);
      }
      return out;
    },

    running() {
      return Array.from(live.keys());
    },

    read() {
      const d = director();
      if (!d) return { ready: false };
      const row = scene.heroRow;
      return {
        outcome: d.outcome,
        ended: d.ended,
        settled: d.settled(),
        phase: d.phase,
        phaseName: d.phaseName(d.phase),
        turn: d.turn,
        bossHp: +d.bossHp.toFixed(3),
        bossPercent: Math.round(d.bossHp * 100),
        moves: d.movesPlayed,
        damage: Math.round(d.damageDealt),
        pressure: +d.pressure().toFixed(3),
        heroesAlive: row ? row.aliveCount() : -1,
        casting: d.ultCasting,
        ultInFlight: d.ultInFlight,
        ultQueue: d.ultQueue.length,
        snapping: d.snapping,
        burying: d.burying,
        doomArmed: d.doomArmed,
        doomFiring: d.doomFiring,
        doomLeft: +d.doomLeft.toFixed(2),
        bossQueued: d.bossQueued,
        clockHeld: d.clockHeld,
        running: engine.running(),
        busy: engine.busy(),
        frozen,
        rate,
      };
    },

    run(name, ...extra) {
      const d = director();
      const state = find(name);
      if (!state) return Promise.reject(new Error(`no state ${name}`));
      if (!d && !state.fx) {
        return Promise.reject(new Error(`no state ${name}`));
      }
      const held = engine.busy();
      if (held) return Promise.reject(new Error(`busy with ${held}`));
      instrument();
      tell("run", name);

      if (state.act) {
        return hold(name, Promise.resolve(state.act(scene, engine, extra)));
      }
      if (state.fx) {
        return hold(name, Promise.resolve(fire(state, extra)));
      }
      if (state.show) {
        return hold(name, Promise.resolve(scene.outcome.show(state.show)));
      }
      if (state.hero !== undefined) d.ultHero = state.hero;
      const args = extra.length ? extra : state.args ? state.args(d) : [];
      return hold(name, Promise.resolve(d[state.fn](...args)));
    },

    busy() {
      if (!busyName) return "";
      if (performance.now() > busyUntil) {
        busyName = "";
        return "";
      }
      return busyName;
    },

    free() {
      const was = busyName;
      busyName = "";
      busyUntil = 0;
      if (was) tell("free", was);
      return was;
    },

    stop(name) {
      const d = director();
      const state = find(name);
      if (!d || !state) return false;
      gen++;
      tell("stop", name);
      live.delete(state.fn);
      quiet();
      try {
        d.interrupt("stopped");
      } catch {
        return true;
      }
      return true;
    },

    halt(opts) {
      const d = director();
      const hold = !(opts && opts.freeze === false);
      tell("halt", "all");
      engine.free();
      live.clear();
      quiet();
      clearStop();
      if (!d) return false;
      gen++;
      d.stopIdle();
      d.doomArmed = false;
      d.snapping = false;
      d.burying = false;
      d.ultQueue.length = 0;
      release(d);
      try {
        d.interrupt("stopped");
        d.setUltRate(1);
        d.setCasting(false);
        scene.board.lockInput();
        scene.hud.hideDoom();
        scene.hud.hideShout(true);
        if (scene.ultSurge) scene.ultSurge.hide(true);
      } catch {
        if (hold) engine.freeze();
        return true;
      }
      if (hold) engine.freeze();
      return true;
    },

    resume() {
      engine.thaw();
      try {
        scene.board.armInput();
      } catch {
        return true;
      }
      tell("resume", "all");
      return true;
    },

    freeze() {
      frozen = true;
      stepping = 0;
      tell("freeze", "world");
      return true;
    },

    thaw() {
      frozen = false;
      stepping = 0;
      tell("thaw", "world");
      return true;
    },

    held() {
      if (stepping > 0) {
        stepping--;
        return false;
      }
      return frozen;
    },

    step(frames) {
      const n = frames === undefined ? 1 : frames;
      frozen = true;
      stepping += n;
      tell("step", String(n));
      return n;
    },

    rate(v) {
      if (v === undefined) return rate;
      rate = v > SLOW_FLOOR ? v : SLOW_FLOOR;
      setTimeScale(rate);
      tell("rate", String(rate));
      return rate;
    },

    on(fn) {
      if (typeof fn === "function") listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    attach() {
      instrument();
      return engine;
    },
  };

  return engine;
}
