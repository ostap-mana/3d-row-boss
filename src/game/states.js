import { COLS, ROWS } from "../config.js";
import { clearStop, setTimeScale } from "../core/juice.js";
import { killTweensOf } from "../core/tween.js";

const SLOW_FLOOR = 0.01;

function attackArgs(d) {
  const attack = d.currentAttack();
  return [attack, d.pickObsidian(attack)];
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
  { name: "boss.rake", group: "boss", fn: "bossRake", args: attackArgs },
  { name: "boss.breath", group: "boss", fn: "bossBreath", args: attackArgs },
  { name: "boss.smash", group: "boss", fn: "bossSmash", args: attackArgs },
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

export function stateEngine(scene) {
  const live = new Map();
  const listeners = [];
  const wrapped = new WeakSet();
  let gen = 0;
  let frozen = false;
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
    const cards = (scene.heroRow && scene.heroRow.cards) || [];
    return cards.map((card, index) => ({
      name: `ult.hero${index}`,
      group: "ult",
      fn: "playUltimate",
      hero: index,
      label: card.hero ? card.hero.name : `hero ${index}`,
    }));
  }

  function catalogue() {
    const d = director();
    if (!d) return [];
    const own = STATES.concat(heroStates()).filter(
      (s) => typeof d[s.fn] === "function",
    );
    return own.concat(scene.outcome ? CARDS : []);
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
        frozen,
        rate,
      };
    },

    run(name, ...extra) {
      const d = director();
      const state = find(name);
      if (!d || !state) return Promise.reject(new Error(`no state ${name}`));
      instrument();
      tell("run", name);

      if (state.show) return Promise.resolve(scene.outcome.show(state.show));
      if (state.hero !== undefined) d.ultHero = state.hero;
      const args = extra.length ? extra : state.args ? state.args(d) : [];
      return Promise.resolve(d[state.fn](...args));
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
      scene.app.ticker.stop();
      tell("freeze", "world");
      return true;
    },

    thaw() {
      frozen = false;
      scene.app.ticker.start();
      tell("thaw", "world");
      return true;
    },

    step(frames) {
      const n = frames === undefined ? 1 : frames;
      for (let i = 0; i < n; i++) scene.app.ticker.update(performance.now());
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
