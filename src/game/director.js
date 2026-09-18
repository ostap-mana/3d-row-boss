import {
  BOSS_ATTACKS,
  BOSS_MAX_HP,
  COLS,
  COPY,
  DIFFICULTY,
  DOOM,
  GEM_COLORS,
  GEM_LIGHT,
  HERO_MAX_HP,
  HEALER,
  MEND_FX,
  OBSIDIAN,
  ROWS,
  SCRIPTED_HINT,
  SNAP,
  T,
  ULT_CALL,
  ULT_RIM,
  ULT_HEAL_FLOOR,
  ULT_HEAL_TO,
  ULT_PACE,
  WATER,
} from "../config.js";
import { MIN_SWAPS } from "./board.js";
import { clearStop, setTimeScale, worldRate } from "../core/juice.js";
import { delay, now, tween } from "../core/tween.js";
import { pick, rnd, rndInt } from "../core/rng.js";
import * as sfx from "../audio/sfx.js";
import { music } from "../audio/music.js";
import { EV, track, trackOnce } from "../net/analytics.js";

const toWorld = (realSeconds) => realSeconds * worldRate();
const toReal = (worldSeconds) => worldSeconds / worldRate();

const rollKillMatch = () => {
  const rolled = DIFFICULTY.pace && DIFFICULTY.pace.matches;
  return rolled && rolled.length ? pick(rolled) : Infinity;
};

const OBSIDIAN_SLACK = 2;

const OPTIONS_IN_PLAY = 2;

const AIM_BITE = 0.95;

const AIM_MEMORY = 5.5;

const RANK_DEPTH = 10;

const MOVE_READ = { taught: 12, bigRun: 4, nearThumb: 5, middle: 3, water: 4 };

const ENDING_GRACE = 4.0;

const ULT_TICK = 0.2;

export class Director {
  constructor(scene) {
    this.s = scene;
    this.ended = false;
    this.outcome = null;

    this.bossHp = 1;
    this.killOn = rollKillMatch();
    this.movesPlayed = 0;
    this.damageDealt = 0;
    this.turn = 0;
    this.phase = 0;
    this.fightStart = 0;
    this.doomCount = 0;
    this.healsUsed = 0;
    this.mendsUsed = 0;
    this.mendGiven = 0;
    this.lastMend = 0;

    this.idleToken = 0;
    this.openingToken = 0;
    this.openingSpent = false;
    this.openingLive = false;
    this.lessonLive = false;
    this.ultToken = 0;
    this.ultLive = false;
    this.beckonAt = ULT_CALL.beckon.every;
    this.ultTaught = false;
    this.ultShows = 0;
    this.moveToken = 0;
    this.ultResolver = null;
    this.ultQueue = [];
    this.ultChainResolver = null;
    this.ultHero = HEALER;
    this.ultCasting = false;
    this.ultInFlight = false;
    this.ultRate = 1;
    this.clockHeld = 0;
    this.clockHoldAt = 0;
    this.doomResolver = null;
    this.stopResolver = null;

    this.bossTrack = null;
    this.bossQueued = 0;

    this.playerActed = false;

    this.pressToken = 0;

    this.snaps = [];
    this.snapAt = undefined;
    this.snapping = false;

    this.doomArmed = false;
    this.doomFiring = false;
    this.doomLeft = DOOM.seconds;
    this.doomTotal = DOOM.seconds;
    this.buryWait = 0;
    this.burying = false;
    this.doomWarned = [];

    scene.debug = this;

    const { board, vfx, hud, hand } = scene;
    board.onCharge = (x, y, type, life) => {
      vfx.charge(x, y, GEM_COLORS[type], board.cell * 1.5, life);
    };
    board.onPop = (x, y, type) => {
      vfx.burst(x, y, GEM_COLORS[type], 5, 0.9);
      vfx.pop(x, y, GEM_COLORS[type], board.cell * 1.6);
    };
    board.onShatter = (x, y) => {
      vfx.burst(x, y, OBSIDIAN.seam, 10, 1.4);
      if (!vfx.shatter(x, y, board.cell * 1.3, OBSIDIAN.seamHot)) {
        vfx.ring(x, y, OBSIDIAN.seamHot, 150, 6);
      }
      scene.shake(7, 0.22);
    };
    board.onShuffle = () => {
      hud.shout(COPY.shuffle, 0.75, { fill: 0xc9b6ff, from: 1.3 });
    };
    board.onInvalid = () => {
      this.restartIdle(true);
    };
    board.onIntercept = (a, b) => this.interceptSwap(a, b);
    board.onInteract = () => {
      this.playerActed = true;
      this.spendOpeningHint();
      this.restartIdle();
    };

    if (T.touchHand) {
      board.onTouchStart = (x, y) => {
        const cell = board.cellAt(x, y);
        hand.setElement(cell ? board.typeAt(cell.r, cell.c) : -1);
        hand.grab(board.x + x, board.y + y);
      };
      board.onTouchMove = (x, y) => hand.dragTo(board.x + x, board.y + y);
    }
    board.onTouchEnd = () => {
      hand.letGo();
      this.restartIdle();
    };
  }

  async run() {
    const fight = this.playFight();
    const capped = await Promise.race([
      fight.then(() => false),
      delay(toWorld(T.hardCap)).then(() => true),
    ]);
    if (capped && this.verdict()) {
      await Promise.race([fight, delay(ENDING_GRACE)]);
    } else if (capped) {
      await this.timeUp();
    }
    await this.finish();
  }

  async timeUp() {
    if (this.settled()) return;
    const { board, hud } = this.s;
    board.lockInput();
    this.stopIdle();
    this.doomArmed = false;
    this.doomLeft = 0;
    hud.setDoom(0, this.doomTotal);
    await this.bossSettled();
    if (this.ended) return;
    this.doomFiring = false;
    await this.castDoom(true);
    if (this.ended) return;
    await this.lose();
  }

  async playFight() {
    await this.intro();
    if (this.ended) return;
    this.armDoom();

    while (!this.ended) {
      this.setUltRate(1);

      const called = this.verdict();
      if (called) return called === "victory" ? this.win() : this.lose();
      if (this.doomDue()) this.castDoomSoon();

      const action = await this.playerTurn();
      if (this.ended) return;

      if (action === "swap" || action === "ult") {
        trackOnce(EV.firstSwap, { action });
        this.spendOpeningHint();
      }

      if (action === "wiped" || action === "buried") continue;
      if (action === "doom") {
        this.castDoomSoon();
        continue;
      }
      if (action === "ult") {
        await this.playUltimate();
        continue;
      }

      await this.resolveMove();
      if (this.ended) return;
      if (this.verdict()) continue;

      this.queueBoss(() => this.bossTurn());
    }
  }

  partyWiped() {
    return this.s.heroRow.aliveCount() === 0;
  }

  boardSealed() {
    const board = this.s.board;
    if (!board || !board.locks) return false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!board.isLocked(r, c)) return false;
      }
    }
    return true;
  }

  settled() {
    return this.ended || !!this.outcome;
  }

  claim(kind) {
    if (this.outcome) return false;
    this.outcome = kind;
    this.doomArmed = false;
    return true;
  }

  verdict() {
    if (this.outcome) return this.outcome;
    if (this.bossHp <= 0) this.claim("victory");
    else if (this.partyWiped() || this.boardSealed()) this.claim("defeat");
    return this.outcome;
  }

  progress() {
    const curve = DIFFICULTY.curve;
    const secs = curve && curve.seconds ? curve.seconds : 0;
    if (secs <= 0) return 0;
    const spent = toReal(Math.max(0, this.elapsed() - this.fightStart));
    return Math.max(0, Math.min(1, spent / secs));
  }

  wounds() {
    return Math.max(0, Math.min(1, 1 - this.bossHp));
  }

  pressure() {
    const curve = DIFFICULTY.curve;
    const hurt = this.wounds();
    if (!curve || !curve.seconds) return hurt;
    const clock = this.progress();
    const lead = curve.clockLead;
    const held = lead === undefined ? hurt : Math.min(hurt, clock + lead);
    return Math.max(held, clock * (curve.clockFloor || 0));
  }

  curveAt(field, p, fallback) {
    const curve = DIFFICULTY.curve;
    if (!curve || !curve.enabled) return fallback;
    const steps = curve.steps || [];
    if (!steps.length) return fallback;

    if (p <= steps[0].p) return steps[0][field];
    for (let i = 1; i < steps.length; i++) {
      const b = steps[i];
      if (p > b.p) continue;
      const a = steps[i - 1];
      const span = b.p - a.p;
      const t = span > 0 ? (p - a.p) / span : 1;
      return a[field] + (b[field] - a[field]) * t;
    }
    return steps[steps.length - 1][field];
  }

  armorDepth() {
    const layers = DIFFICULTY.armor || [];
    let depth = 0;
    layers.forEach((layer) => {
      if (this.bossHp <= layer.below) depth++;
    });
    return depth;
  }

  armor() {
    const curve = DIFFICULTY.curve;
    if (curve && curve.enabled) return this.curveAt("resist", this.wounds(), 1);
    const layers = DIFFICULTY.armor || [];
    const depth = this.armorDepth();
    return depth === 0 ? 1 : layers[layers.length - depth].mult;
  }

  expectedHp() {
    const guard = DIFFICULTY.pace;
    if (!guard || !guard.enabled) return 1;
    const byClock = 1 - toReal(now() - this.fightStart) / guard.seconds;
    const held = Math.max(1, this.killOn - 1);
    const byMatch = Math.pow(
      Math.max(0, 1 - this.movesPlayed / held),
      guard.matchBend || 1,
    );
    return Math.max(0, Math.min(byClock, byMatch));
  }

  pace() {
    const guard = DIFFICULTY.pace;
    if (!guard || !guard.enabled) return 1;
    const expected = this.expectedHp();
    if (expected <= 0 || this.bossHp >= expected) return 1;
    return Math.max(guard.floor, Math.pow(this.bossHp / expected, guard.bite));
  }

  resistance() {
    return this.armor() * this.pace();
  }

  ultResistance() {
    const bite = DIFFICULTY.ultHideBite;
    const hide = this.armor();
    const shaped = this.curveAt("ult", this.wounds(), 1);
    const guard = DIFFICULTY.pace;
    const grip = Math.max(this.pace(), (guard && guard.ultFloor) || 0);
    return (bite === undefined ? hide : Math.pow(hide, bite)) * grip * shaped;
  }

  checkPhase() {
    const depth = this.curveDepth();
    if (this.settled() || depth <= this.phase) return;
    this.phase = depth;

    const layer = this.phaseName(depth);
    if (!layer) return;
    sfx.bossEnrage();
    this.s.boss.enrage();
    this.s.hud.enrage();
    this.s.shake(16, 0.45);
    this.s.hitStop(0.5, 0.11);
    this.s.vfx.flash(0xff2a06, 0.3, 0.4);
    this.s.hud.shout(layer, 0.55, { fill: 0xff8a3d, from: 2 });
  }

  curveDepth() {
    const curve = DIFFICULTY.curve;
    if (!curve || !curve.enabled) return this.armorDepth();
    const p = this.pressure();
    let depth = 0;
    (curve.steps || []).forEach((step) => {
      if (step.name && p >= step.p) depth++;
    });
    return depth;
  }

  phaseName(depth) {
    const curve = DIFFICULTY.curve;
    if (curve && curve.enabled) {
      const named = (curve.steps || []).filter((step) => step.name);
      const step = named[depth - 1];
      return step ? step.name : null;
    }
    const layers = DIFFICULTY.armor || [];
    const layer = layers[layers.length - depth];
    return layer ? layer.name : null;
  }

  rage() {
    const per = DIFFICULTY.ragePerSecond || 0;
    const cap =
      DIFFICULTY.rageMax === undefined ? Infinity : DIFFICULTY.rageMax;
    return Math.min(cap, 1 + this.elapsed() * per);
  }

  healTo() {
    return Math.max(
      ULT_HEAL_FLOOR,
      ULT_HEAL_TO - this.healsUsed * (DIFFICULTY.healDecay || 0),
    );
  }

  mendDue() {
    const cfg = DIFFICULTY.mend;
    if (!cfg || !cfg.enabled || this.settled()) return false;
    if (this.mendsUsed >= (cfg.uses || 0)) return false;
    const gate = cfg.at - this.mendsUsed * (cfg.atStep || 0);
    const floor = cfg.floor - this.mendsUsed * (cfg.floorStep || 0);
    if (this.bossHp > gate || this.bossHp < floor) return false;
    if (this.doomFiring || this.doomDue()) return false;
    if (this.lastMend && toReal(now() - this.lastMend) < (cfg.gap || 0))
      return false;
    return toReal(now() - this.fightStart) < cfg.deadline;
  }

  mendTo() {
    const cfg = DIFFICULTY.mend;
    const want = Math.max(
      cfg.least,
      cfg.gain - this.mendsUsed * (cfg.decay || 0),
    );
    const roof = Math.max(
      this.bossHp + cfg.least,
      this.expectedHp() * cfg.ceiling,
    );
    return Math.min(1, roof, this.bossHp + want);
  }

  queueBoss(job) {
    if (this.bossQueued >= 2 || this.settled()) return false;
    this.bossQueued++;
    this.bossTrack = (this.bossTrack || Promise.resolve())
      .then(() => (this.settled() ? undefined : job()))
      .catch(() => {})
      .then(() => {
        this.bossQueued--;
        if (this.settled() || this.partyWiped()) this.interrupt("wiped");
      });
    return true;
  }

  bossSettled(cap) {
    if (!this.bossTrack) return Promise.resolve();
    return Promise.race([this.bossTrack, delay(cap === undefined ? 0.8 : cap)]);
  }

  interrupt(action) {
    const resolve = this.stopResolver;
    this.stopResolver = null;
    if (resolve) resolve(action);
  }

  armIntro() {
    const { boss, board, heroRow, hud } = this.s;

    if (T.entrance) {
      boss.visible = false;
      board.visible = false;
      heroRow.visible = false;
      hud.alpha = 0;
      board.lockInput();
      hud.hideDoom();
      return;
    }

    board.armInput();

    this.idleHint = this.currentHint();
    this.armOpeningHint();

    hud.hideDoom();
  }

  async intro() {
    const { boss, board, heroRow, hud, vfx, shake, layout } = this.s;

    if (T.entrance) {
      boss.visible = true;
      board.visible = true;
      heroRow.visible = true;
      hud.alpha = 0;

      const rising = boss.rise(T.introIn);
      const entering = Promise.all([
        board.slideIn(layout, T.introIn),
        heroRow.introIn(T.introIn),
        tween(hud, { alpha: 1 }, T.introIn),
      ]);
      shake(6, T.introIn);

      await Promise.all([rising, entering]);
      board.armInput();
      this.idleHint = this.currentHint();
      this.armOpeningHint();
    }

    vfx.flash(0xff7a1a, 0.28, 0.45);

    const roaring = boss.roar();
    shake(14, 0.5);

    roaring.then(() => {
      if (this.ended) return;
      this.startBannerTimer();
      hud.shout(COPY.tutorial, COPY.tutorialHold);
    });
  }

  startBannerTimer() {
    delay(toWorld(T.banner)).then(() => {
      if (!this.ended) this.s.hud.showBanner();
    });
  }

  holdClock() {
    if (DIFFICULTY.ultCostsTime) return;
    if (this.clockHoldAt) return;
    this.clockHoldAt = now();
    this.s.hud.holdDoom(true);
  }

  releaseClock() {
    if (!this.clockHoldAt) return;
    this.clockHeld += now() - this.clockHoldAt;
    this.clockHoldAt = 0;
    this.s.hud.holdDoom(false);
  }

  elapsed() {
    const holding = this.clockHoldAt ? now() - this.clockHoldAt : 0;
    return now() - this.clockHeld - holding;
  }

  setCasting(on) {
    this.ultCasting = on;
    if (on && this.s.ultSurge) this.s.ultSurge.hide();
    if (on) this.holdClock();
    else this.releaseClock();
  }

  setUltRate(rate) {
    if (this.ultRate === rate) return;
    this.ultRate = rate;
    if (rate > 1) clearStop();
    setTimeScale(rate);
  }

  rushForUlt() {
    this.setUltRate(ULT_PACE.rush);
  }

  armDoom() {
    this.fightStart = now();
    this.doomArmed = true;
    this.doomLeft = DOOM.seconds;
    this.doomTotal = DOOM.seconds;
    this.doomWarned = [];
    this.dealSnaps();
    this.s.hud.setDoom(this.doomLeft, this.doomTotal);
  }

  dealSnaps() {
    const times = (SNAP && SNAP.times) || 0;
    this.snaps = [];
    this.snapAt = undefined;
    if (!times) return;
    const last = 1 - ((DOOM.bury && DOOM.bury.at) || 0);
    const open = Math.max(0, last - SNAP.from);
    if (open <= 0) return;
    const window = open / times;
    for (let i = 0; i < times; i++) {
      this.snaps.push(SNAP.from + (i + rnd()) * window);
    }
  }

  update(dt) {
    this.callUlt(dt);
    if (!this.doomArmed || this.ended || this.doomFiring) return;

    if (this.clockHoldAt) return;

    this.checkPhase();

    if (this.doomLeft > 0) {
      this.doomLeft = Math.max(0, this.doomLeft - dt * this.doomRate());
      this.s.hud.setDoom(this.doomLeft, this.doomTotal);
      sfx.bed.setTension(1 - this.doomLeft / this.doomTotal);
      music.setTension(1 - this.doomLeft / this.doomTotal);

      this.buryTick(dt);

      for (let i = 0; i < DOOM.warnAt.length; i++) {
        const at = DOOM.warnAt[i];
        if (this.doomLeft > at || this.doomWarned.indexOf(at) !== -1) continue;
        this.doomWarned.push(at);
        sfx.doomWarn(i);
        this.s.hud.shout(i === 0 ? COPY.doomWarn : COPY.doomSoon, 0.5, {
          fill: 0xff8a3d,
          from: 1.5,
        });
      }
    }

    if (this.doomLeft <= 0 && this.doomResolver) {
      const resolve = this.doomResolver;
      this.doomResolver = null;
      resolve("doom");
    }
  }

  doomRate() {
    return this.stretchRate() * this.castRate();
  }

  castRate() {
    if (!this.ultCasting) return 1;
    const r = DIFFICULTY.ultTimeRate;
    return r > 0 && r <= 1 ? r : 1;
  }

  stretchRate() {
    const { extra, window, shape } = DOOM.stretch || {};
    if (!extra || !window || this.doomLeft > window) return 1;
    const u = Math.max(0, Math.min(1, 1 - this.doomLeft / window));
    const k = (extra * (shape + 1)) / window;
    return 1 / (1 + k * Math.pow(u, shape));
  }

  doomDue() {
    return this.doomArmed && this.doomLeft <= 0 && !this.doomFiring;
  }

  castDoomSoon() {
    if (this.doomFiring) return;
    this.doomFiring = this.queueBoss(() => this.castDoom());
  }

  async castDoom(lethal) {
    const { boss, hud, vfx, shake, hitStop, layout } = this.s;

    sfx.doomCast();
    hud.shout(COPY.doomCast, 0.6, { fill: 0xff2f1a, from: 2.8 });
    boss.enrage();
    hud.enrage();
    shake(18, 0.5, { freq: 0.5 });
    await boss.roar();
    if (this.settled()) return;

    const impact = boss.impactPoint();
    vfx.shock(impact.x, impact.y, 0xff2a06, {
      size: layout.stage.w * 2.4,
      width: 18,
    });
    vfx.shock(impact.x, impact.y, 0xffd35a, {
      size: layout.stage.w * 0.5,
      width: 8,
      duration: 0.38,
      painted: false,
    });
    vfx.flash(0xff2a06, 0.85, 0.7);
    shake(30, 0.9);
    hitStop(0.92, 0.18);

    const row = layout.cards;
    const rolling = vfx.wave(impact.y, row.y + row.h * 0.5, 0xff3a06, {
      thickness: row.h * 2.2,
      duration: 0.32,
    });

    await delay(0.2);
    if (this.settled()) return;

    const falling = this.strikeHeroes({
      targets: "all",
      damage: lethal
        ? 1.2
        : DOOM.damage * Math.pow(DOOM.damageRamp || 1, this.doomCount),
      unstoppable: lethal,
    });
    await Promise.all([rolling, falling]);
    this.doomCount++;
    if (this.settled() || this.partyWiped()) {
      this.doomFiring = false;
      return;
    }

    hud.shout(COPY.doomSurvived, 0.55, { fill: 0x9fffc4, from: 1.5 });
    const fuse = Math.max(
      DOOM.repeatFloor || 0,
      DOOM.repeat * Math.pow(DOOM.repeatDecay || 1, this.doomCount - 1),
    );
    this.doomLeft = fuse;
    this.doomTotal = fuse;
    this.doomWarned = [];
    this.s.hud.setDoom(this.doomLeft, this.doomTotal);
    this.doomFiring = false;
    await delay(0.3);
  }

  async playerTurn() {
    const board = this.s.board;

    if (this.takeQueuedUlt()) return "ult";
    this.setCasting(false);

    const hint = this.currentHint();
    const swap = board.waitForMove().then(() => "swap");
    const ult = new Promise((resolve) => {
      this.ultResolver = resolve;
    });
    const doom = new Promise((resolve) => {
      this.doomResolver = resolve;
    });
    const stopped = new Promise((resolve) => {
      this.stopResolver = resolve;
    });

    this.beginIdle(hint);
    const action = await Promise.race([swap, ult, doom, stopped]);
    this.ultResolver = null;
    this.doomResolver = null;
    this.stopResolver = null;
    this.stopIdle();
    if (action !== "swap") board.cancelWait();
    if (action === "ult" && !this.takeQueuedUlt()) return "wiped";
    return action;
  }

  takeQueuedUlt() {
    while (this.ultQueue.length) {
      const next = this.ultQueue.shift();
      if (!this.canUlt(next)) continue;
      this.ultHero = next;
      this.setCasting(true);
      this.setUltRate(1);
      return true;
    }
    this.setUltRate(1);
    return false;
  }

  canUlt(index) {
    const card = this.s.heroRow.cards[index];
    return !!card && card.ready && !card.downed;
  }

  onCardTap(index) {
    if (this.ended) return;
    this.playerActed = true;
    this.spendOpeningHint();
    this.ultTaught = true;
    this.endUltLesson();
    if (!this.canUlt(index)) {
      this.restartIdle();
      return;
    }
    this.ultQueue.push(index);
    this.setCasting(true);
    const resolve = this.ultResolver;
    this.ultResolver = null;
    if (resolve) {
      resolve("ult");
      return;
    }
    if (this.ultChainResolver) {
      const chain = this.ultChainResolver;
      this.ultChainResolver = null;
      chain();
      return;
    }
    if (!this.ultInFlight) this.rushForUlt();
  }

  damageFor(step, cells) {
    const { heroRow } = this.s;
    const table = DIFFICULTY.comboMultiplier;
    const combo = table[Math.min(step, table.length) - 1];
    const size = DIFFICULTY.sizeBonus[Math.min(cells.length, 5)] || 1;
    const party = heroRow.partyPower();
    return (
      cells.length *
      DIFFICULTY.damagePerGem *
      combo *
      size *
      party *
      this.resistance()
    );
  }

  leadElement(cells) {
    const board = this.s.board;
    const tally = [];
    let best = -1;
    cells.forEach((cell) => {
      const type = board.typeAt(cell.r, cell.c);
      if (type < 0) return;
      tally[type] = (tally[type] || 0) + 1;
      if (best < 0 || tally[type] > tally[best]) best = type;
    });
    return best;
  }

  chargeParty(cells) {
    const { board, heroRow, hud, vfx } = this.s;

    const counts = [];
    const spots = [];
    cells.forEach((cell) => {
      const type = board.typeAt(cell.r, cell.c);
      if (type < 0) return;
      counts[type] = (counts[type] || 0) + 1;
      const p = board.cellPos(cell.r, cell.c);
      (spots[type] || (spots[type] = [])).push({
        x: board.x + p.x,
        y: board.y + p.y,
      });
    });

    heroRow.cards.forEach((card, index) => {
      const gems = counts[card.hero.element];
      if (!gems) return;
      if (!card.addCharge(gems * card.chargeRate())) return;
      vfx.ultSummon(
        spots[card.hero.element] || [],
        { x: card.x, y: card.y },
        GEM_COLORS[card.hero.element],
        GEM_LIGHT[card.hero.element],
        card.cardW || 0,
        board.cell,
      );
      if (!this.surgeUlt(index)) {
        hud.shout(COPY.ultReady.replace("{hero}", card.hero.name), T.ultShout, {
          fill: GEM_LIGHT[card.hero.element],
          from: 1.6,
        });
      }
      this.teachUlt(index);
    });
  }

  partyVolley(step, lead) {
    const { boss, heroRow, vfx, shake, hitStop } = this.s;
    const target = boss.impactPoint();

    heroRow.strikeOrder(lead).forEach((index, slot) => {
      const card = heroRow.cards[index];
      const isLead = card.hero.element === lead;
      const power = isLead ? 0.75 + step * 0.2 : DIFFICULTY.assistImpact;

      delay(DIFFICULTY.volleyDelay + slot * DIFFICULTY.volleyStagger).then(
        () => {
          if (this.ended || card.downed) return;
          card.strike(isLead);

          const from = heroRow.cardPoint(index);
          vfx
            .beam(from, target, GEM_COLORS[card.hero.element], {
              thickness: isLead ? 16 + step * 5 : 8 + step * 2,
              impact: power,
              travel: isLead ? 0.16 : 0.2,
            })
            .then(() => {
              if (this.ended) return;
              boss.hit(isLead ? power : power * 0.6);
              shake(isLead ? 5 + step * 2 : 2.5, isLead ? 0.24 : 0.14, {
                axis: { x: target.x - from.x, y: target.y - from.y },
                freq: isLead ? 1 : 1.4,
              });
              if (isLead) hitStop(0.22);
            });
        },
      );
    });
  }

  async resolveMove() {
    const { board, boss, hud, vfx, shake, hitStop } = this.s;
    const before = this.bossHp;
    const mended = this.mendGiven;

    await board.resolve((step, cells) => {
      if (this.ended || this.outcome === "defeat") return;

      const share = this.damageFor(step, cells);
      this.bossHp = Math.max(0, this.bossHp - share);
      if (this.bossHp <= 0) this.claim("victory");
      this.chargeParty(cells);

      const origin = this.centroid(cells);
      const target = boss.impactPoint();
      const lead = this.leadElement(cells);
      const color = GEM_COLORS[lead >= 0 ? lead : WATER];
      const power = 0.9 + step * 0.25;

      this.partyVolley(step, lead);

      vfx
        .spell(lead >= 0 ? lead : WATER, origin, target, color, {
          size: 150 + step * 34,
          travel: 0.16,
          blast: 0.4,
          beam: { thickness: 18 + step * 6, impact: power },
        })
        .then(() => {
          if (!this.ended) vfx.impact(target, color, power);
          return undefined;
        })
        .then(() => {
          if (this.ended) return;
          boss.hit(power);
          hitStop(0.3 + Math.min(0.45, step * 0.15));
          shake(6 + step * 3, 0.28, {
            axis: { x: target.x - origin.x, y: target.y - origin.y },
          });
          hud.damage(
            share * BOSS_MAX_HP,
            target.x,
            target.y - 20,
            step >= 3 ? 2 : step >= 2 ? 1 : 0,
          );
        });

      if (step >= 2) {
        sfx.combo(step);
        hud.shout("COMBO x" + step, 0.44 + Math.min(0.24, step * 0.05), {
          fill: step >= 4 ? 0xffa02a : 0xffe066,
          from: Math.min(2.6, 1.6 + step * 0.26),
        });
      }

      hud.setHp(this.bossHp, 0.4);
      this.checkPhase();
    });

    hud.setHp(this.bossHp, 0.35);

    const paid = before - this.bossHp + (this.mendGiven - mended);
    if (paid > 0.0001) {
      this.movesPlayed++;
      this.damageDealt += paid;
    }
  }

  paidPerMove() {
    if (!this.movesPlayed) return 3 * DIFFICULTY.damagePerGem;
    return this.damageDealt / this.movesPlayed;
  }

  centroid(cells) {
    const { board } = this.s;
    let x = 0;
    let y = 0;
    cells.forEach((c) => {
      const p = board.cellPos(c.r, c.c);
      x += p.x;
      y += p.y;
    });
    return {
      x: board.x + x / cells.length,
      y: board.y + y / cells.length,
    };
  }

  currentAttack() {
    const pool = BOSS_ATTACKS.filter((a) => (a.from || 0) <= this.turn);
    const fresh = pool.filter((a) => a.from === this.turn);
    const base = fresh.length
      ? fresh[0]
      : pool[this.turn % pool.length] || BOSS_ATTACKS[0];
    const step = this.curveAt("attack", this.pressure(), 1);
    const ramp = step * Math.pow(DIFFICULTY.bossRamp, this.turn) * this.rage();
    return {
      kind: base.kind,
      targets: base.targets,
      shout: base.shout,
      damage: base.damage * ramp,
      splash: (base.splash || 0) * ramp,
      obsidianBonus: base.obsidianBonus || 0,
    };
  }

  pickObsidian(attack) {
    const board = this.s.board;
    let held = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (board.isLocked(r, c)) held++;
    }

    const want =
      Math.round(
        this.curveAt(
          "obsidian",
          this.pressure(),
          DIFFICULTY.obsidianBase + this.turn * DIFFICULTY.obsidianGrowth,
        ),
      ) + ((attack && attack.obsidianBonus) || 0);
    const ceiling = Math.floor(
      Math.min(
        DIFFICULTY.obsidianMaxCap,
        this.curveAt(
          "hold",
          this.pressure(),
          DIFFICULTY.obsidianMax +
            this.turn * (DIFFICULTY.obsidianMaxGrowth || 0),
        ),
      ),
    );
    const budget = Math.min(want, ceiling - held);
    if (budget <= 0) return [];

    const taken = [];
    try {
      while (taken.length < budget) {
        const aimed = this.blockAnOption();
        if (!aimed) break;
        board.setProbe(aimed.r, aimed.c, true);
        taken.push(aimed);
      }
      while (taken.length < budget) {
        const cell = this.worstCell();
        if (!cell) break;
        board.setProbe(cell.r, cell.c, true);
        taken.push(cell);
      }
    } finally {
      taken.forEach((p) => board.setProbe(p.r, p.c, false));
    }
    return taken.map((cell) => ({ ...cell, crust: this.crustLayers() }));
  }

  interceptSwap(a, b) {
    if (!this.snapDue()) return null;
    const board = this.s.board;
    if (this.snapHeld() >= this.snapCeiling() + SNAP.over) return null;

    let best = null;
    [b, a].forEach((c) => {
      const left = board.probeLock(c.r, c.c, () => board.countSwaps());
      if (left < SNAP.leave) return;
      if (!best || left > best.left) best = { cell: c, left };
    });
    if (!best) return null;
    const cell = best.cell;

    this.snapAt = now();
    this.snaps.shift();
    this.snapping = true;
    this.bossSnap(cell)
      .catch(() => {})
      .then(() => {
        this.snapping = false;
      });
    return cell;
  }

  snapDue() {
    if (!SNAP.on || this.ended || this.settled()) return false;
    if (!this.doomArmed || !this.snaps || !this.snaps.length) return false;
    if (!(this.doomTotal > 0)) return false;
    if (1 - this.doomLeft / this.doomTotal < this.snaps[0]) return false;
    if (this.ultLive || this.ultInFlight) return false;
    if (this.openingLive && !this.openingSpent) return false;
    const board = this.s.board;
    if (!board || board.busy) return false;
    if (this.snapping) return false;
    return (
      now() - (this.snapAt === undefined ? -SNAP.gap : this.snapAt) >= SNAP.gap
    );
  }

  async bossSnap(cell) {
    const { board, boss, hud, vfx, shake } = this.s;

    hud.shout(COPY.snap, 0.3, { fill: 0xff5a6e, from: 1.2 });
    const thrown = this.bossQueued === 0 ? boss.spit() : null;
    const p = board.cellPos(cell.r, cell.c);
    await vfx.lob(
      boss.mouthPoint(),
      { x: board.x + p.x, y: board.y + p.y },
      0xff6a10,
      { duration: SNAP.flight, size: board.cell * 0.9 },
    );
    if (this.settled()) return;
    shake(8, 0.2);
    await board.lockCells([{ ...cell, crust: this.crustLayers() }], {
      onto: true,
    });
    if (thrown) await thrown;
    this.refreshHint();
  }

  snapHeld() {
    const board = this.s.board;
    let held = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (board.isLocked(r, c)) held++;
    }
    return held;
  }

  snapCeiling() {
    return Math.floor(
      Math.min(
        DIFFICULTY.obsidianMaxCap,
        this.curveAt(
          "hold",
          this.pressure(),
          DIFFICULTY.obsidianMax +
            this.turn * (DIFFICULTY.obsidianMaxGrowth || 0),
        ),
      ),
    );
  }

  burialDue() {
    const cfg = DOOM.bury;
    if (!cfg || !this.doomArmed || this.ended) return false;
    if (!(this.doomTotal > 0) || this.doomLeft <= 0) return false;
    return this.doomLeft / this.doomTotal <= cfg.at;
  }

  buryTick(dt) {
    if (!this.burialDue() || this.burying) return;
    const board = this.s.board;
    if (!board || board.busy) return;
    this.buryWait -= dt;
    if (this.buryWait > 0) return;
    this.buryWait = DOOM.bury.every;
    const cells = this.pickBurial(DOOM.bury.perTick);
    if (!cells.length) return;
    this.burying = true;
    const done = () => {
      this.burying = false;
      if (this.boardSealed() && this.claim("defeat")) this.interrupt("buried");
    };
    board.lockCells(cells).then(done, done);
  }

  pickBurial(n) {
    const board = this.s.board;
    const taken = [];
    try {
      while (taken.length < n) {
        const cell = this.worstCell(true);
        if (!cell) break;
        board.setProbe(cell.r, cell.c, true);
        taken.push(cell);
      }
    } finally {
      taken.forEach((p) => board.setProbe(p.r, p.c, false));
    }
    return taken.map((cell) => ({ ...cell, crust: this.crustLayers() }));
  }

  crustLayers() {
    const want = this.curveAt("crust", this.pressure(), 0);
    if (!(want > 0)) return 0;
    const whole = Math.floor(want);
    return whole + (rnd() < want - whole ? 1 : 0);
  }

  taughtSwap() {
    const live = this.idleHint;
    if (live && this.swapMakesMatch(live.a, live.b)) return live;
    return this.currentHint();
  }

  blockAnOption() {
    const board = this.s.board;
    const swaps = board.listSwaps();
    const focus = board.focusedCells(AIM_MEMORY);
    const reached = (cell) =>
      focus.some((f) => f.r === cell.r && f.c === cell.c) ? 1 : 0;
    if (swaps.length <= MIN_SWAPS) return null;

    const taught = this.taughtSwap();
    const lastReach = board.focusedCells(Infinity)[0] || null;
    const isSameCell = (x, y) => !!x && !!y && x.r === y.r && x.c === y.c;
    const isTaught = (swap) =>
      !!taught &&
      ((isSameCell(taught.a, swap.a) && isSameCell(taught.b, swap.b)) ||
        (isSameCell(taught.a, swap.b) && isSameCell(taught.b, swap.a)));

    const pool = swaps.slice(0, RANK_DEPTH);
    swaps.slice(RANK_DEPTH).forEach((swap) => {
      if (reached(swap.a) || reached(swap.b) || isTaught(swap)) pool.push(swap);
    });

    const midR = (ROWS - 1) / 2;
    const midC = (COLS - 1) / 2;
    const central = (cell) =>
      1 -
      (Math.abs(cell.r - midR) / (midR || 1) +
        Math.abs(cell.c - midC) / (midC || 1)) /
        2;

    const span = ROWS + COLS - 2;
    const readsAs = (swap) => {
      let read = isTaught(swap) ? MOVE_READ.taught : 0;
      read += Math.max(0, swap.score - 3) * MOVE_READ.bigRun;
      if (lastReach) {
        let walk = span;
        [...swap.cells, swap.a, swap.b].forEach((cell) => {
          const step =
            Math.abs(cell.r - lastReach.r) + Math.abs(cell.c - lastReach.c);
          if (step < walk) walk = step;
        });
        read += (1 - walk / span) * MOVE_READ.nearThumb;
      }
      let middle = 0;
      swap.cells.forEach((cell) => {
        middle = Math.max(middle, central(cell));
      });
      read += middle * MOVE_READ.middle;
      const blue = swap.cells.filter(
        (cell) => board.typeAt(cell.r, cell.c) === WATER,
      ).length;
      if (blue >= 2) read += MOVE_READ.water;
      return read;
    };

    const ranked = [];
    pool.forEach((swap) => {
      const offered = {};
      const candidates = [];
      const offer = (cell, meets) => {
        const key = cell.r * COLS + cell.c;
        if (offered[key]) return;
        offered[key] = 1;
        candidates.push({ cell, meets });
      };
      swap.cells.forEach((cell) => offer(cell, 1));
      offer(swap.a, 0);
      offer(swap.b, 0);

      let best = null;
      candidates.forEach(({ cell, meets }) => {
        const left = board.probeLock(cell.r, cell.c, () => board.countSwaps());
        if (left < MIN_SWAPS) return;
        const denied = swaps.length - left;
        const seen = reached(cell);
        const water = board.typeAt(cell.r, cell.c) === WATER ? 1 : 0;
        const cost = denied * 6 + central(cell) * 6 + water * 3;
        const better =
          !best ||
          seen > best.seen ||
          (seen === best.seen &&
            (meets > best.meets || (meets === best.meets && cost > best.cost)));
        if (better) best = { cell, denied, seen, meets, cost };
      });
      if (best) {
        const watched = Math.max(best.seen, reached(swap.a), reached(swap.b));
        ranked.push({ ...best, watched, reads: readsAs(swap) });
      }
    });
    if (ranked.length === 0) return null;
    ranked.sort(
      (x, y) => y.watched - x.watched || y.reads - x.reads || y.cost - x.cost,
    );

    const shortlist = ranked.slice(0, Math.min(OPTIONS_IN_PLAY, ranked.length));
    const target =
      shortlist[0].watched || shortlist.length < 2 || rnd() < AIM_BITE
        ? shortlist[0]
        : shortlist[rndInt(shortlist.length - 1) + 1];
    return target.cell;
  }

  worstCell(bury) {
    const board = this.s.board;
    const before = board.countSwaps();
    const mid = (COLS - 1) / 2;
    const midRow = (ROWS - 1) / 2;
    const scored = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board.isLocked(r, c)) continue;
        const left = board.probeLock(r, c, () => board.countSwaps());
        if (!bury && left < MIN_SWAPS) continue;
        const water = board.typeAt(r, c) === WATER ? 1 : 0;
        const central =
          1 -
          (Math.abs(r - midRow) / (midRow || 1) +
            Math.abs(c - mid) / (mid || 1)) /
            2;
        scored.push({
          r,
          c,
          denied: before - left,
          score: water * 5 + central * 2,
        });
      }
    }
    if (scored.length === 0) return null;

    let bite = 0;
    scored.forEach((s) => {
      if (s.denied > bite) bite = s.denied;
    });
    if (!bury && bite === 0) return null;
    const biting = scored.filter((s) => s.denied === bite);

    let top = biting[0].score;
    biting.forEach((s) => {
      if (s.score > top) top = s.score;
    });
    const shortlist = biting.filter((s) => s.score >= top - OBSIDIAN_SLACK);
    return shortlist[rndInt(shortlist.length)];
  }

  async bossTurn() {
    const attack = this.currentAttack();
    await this.s.board.whenQuiet();
    if (this.settled()) return;

    if (this.mendDue()) {
      await this.bossMend();
      this.turn++;
      return;
    }

    const cells = this.pickObsidian(attack);

    if (attack.kind === "rake") {
      await this.bossRake(attack, cells);
    } else if (attack.kind === "smash") {
      await this.bossSmash(attack, cells);
    } else {
      await this.bossBreath(attack, cells);
    }
    this.turn++;
  }

  async bossRake(attack, cells) {
    const { boss, hud, vfx, shake, hitStop, layout } = this.s;

    hud.shout(attack.shout || COPY.rake, 0.4, { fill: 0xff5a6e, from: 1.4 });
    const dir = await boss.rake();
    if (this.settled()) return;

    const at = boss.impactPoint();
    const clawY = layout.board.y + layout.board.size * 0.75;
    shake(16, 0.4, { axis: { x: dir, y: 0.3 }, freq: 1.15 });
    hitStop(0.6, 0.1);
    vfx.claw(at.x, clawY, 0xff3a5a, {
      dir,
      len: layout.stage.w * 1.34,
      gap: layout.stage.h * 0.032,
    });
    vfx.flash(0xff2a3a, 0.16, 0.3);

    const spreading = this.dropObsidian(cells, 0.06);

    const row = layout.cards;
    await vfx.wave(clawY, row.y + row.h * 0.5, 0xff3a5a, {
      thickness: row.h * 1.1,
      duration: 0.2,
    });
    if (this.settled()) return;

    const falling = this.strikeHeroes(attack);
    shake(11, 0.32);
    await Promise.all([spreading, falling, delay(0.22)]);
  }

  async bossBreath(attack, cells) {
    const { boss, hud, vfx, shake, layout } = this.s;

    hud.shout(attack.shout || COPY.breath, 0.4, { from: 1.4 });
    await boss.lavaBreath(0.62);
    if (this.settled()) return;

    shake(10, 0.5, { freq: 0.45 });
    const row = layout.cards;
    const mouth = boss.mouthPoint();
    const onto = { x: row.x + row.w / 2, y: row.y + row.h * 0.45 };
    const shape = {
      hold: 0.5,
      spread: row.w * 0.9,
      heat: layout.portrait ? 0.48 : 1,
      mouth: 44 * layout.ui,
    };
    const flame =
      vfx.jet(mouth, onto, shape) || vfx.cone(mouth, onto, 0xff6a10, shape);
    vfx.bossSwing(
      "breath",
      { x: (mouth.x + onto.x) / 2, y: (mouth.y + onto.y) / 2 },
      { size: row.w * 1.15, duration: 0.62, alpha: 0.9, grow: 0.3 },
    );
    const spreading = this.dropObsidian(cells, 0.1);

    await delay(0.22);
    if (this.settled()) return;

    const falling = this.strikeHeroes(attack);
    shake(13, 0.45);
    vfx.flash(0xff5a1f, 0.2, 0.4);

    await Promise.all([flame, spreading, falling]);
  }

  async bossSmash(attack, cells) {
    const { hud, boss, vfx, shake, hitStop, layout } = this.s;

    hud.shout(attack.shout || COPY.smash, 0.4, { fill: 0xffb03d, from: 1.4 });
    await boss.smash();
    if (this.settled()) return;

    const impact = boss.fistPoint();
    shake(20, 0.55, { axis: { x: 0, y: 1 }, freq: 1.2 });
    hitStop(0.7, 0.12);
    vfx.shock(impact.x, impact.y, 0xff8a3d, {
      size: layout.stage.w * 1.6,
      width: 14,
    });
    vfx.shock(impact.x, impact.y, 0xffd35a, {
      size: layout.stage.w * 0.34,
      width: 6,
      duration: 0.3,
      painted: false,
    });
    vfx.bossSwing("smash", impact, {
      size: layout.stage.w * 1.15,
      duration: 0.5,
      grow: 0.35,
    });
    vfx.flash(0xff2a06, 0.18, 0.35);

    const spreading = this.eruptObsidian(cells);

    const row = layout.cards;
    await vfx.wave(impact.y, row.y + row.h * 0.5, 0xff6a10, {
      thickness: row.h * 1.5,
      duration: 0.26,
    });
    if (this.settled()) return;

    const falling = this.strikeHeroes(attack);
    shake(15, 0.4);
    await Promise.all([spreading, falling, delay(0.32)]);
  }

  async bossMend() {
    const { boss, hud, vfx, shake, layout } = this.s;
    const cfg = DIFFICULTY.mend;
    const before = this.bossHp;
    const to = this.mendTo();
    if (to <= before + 0.001) return;

    this.mendsUsed++;
    this.lastMend = now();
    track(EV.bossMend, { hp: Math.round(before * 100), gain: to - before });
    hud.shout(COPY.mend, 0.5, { fill: MEND_FX.light, from: 1.5 });

    const at = boss.impactPoint();
    const casting = boss.mend(cfg.cast);
    vfx.mend(at, {
      size: layout.stage.w * 0.66,
      duration: cfg.cast,
    });

    await delay(cfg.cast * MEND_FX.peak);
    if (this.settled()) {
      await casting;
      return;
    }

    const held = this.bossHp;
    if (held <= 0) {
      await casting;
      return;
    }

    this.bossHp = Math.min(1, held + (to - before));
    this.mendGiven += this.bossHp - held;
    hud.setHp(this.bossHp, 0.62);
    hud.damage((this.bossHp - held) * BOSS_MAX_HP, at.x, at.y - 24, 1, {
      sign: "+",
      fill: MEND_FX.light,
    });
    vfx.flash(MEND_FX.green, 0.14, 0.38);
    shake(7, 0.3);

    await casting;
  }

  async dropObsidian(cells, wait) {
    const { board, boss, vfx } = this.s;
    if (cells.length === 0) return;

    const from = boss.mouthPoint();
    await Promise.all(
      cells.map((cell, i) => {
        const p = board.cellPos(cell.r, cell.c);
        return vfx.lob(from, { x: board.x + p.x, y: board.y + p.y }, 0xff6a10, {
          delay: (wait || 0) + i * 0.08,
          duration: 0.42,
          size: board.cell * 0.9,
        });
      }),
    );
    if (this.settled()) return;
    await board.lockCells(cells);
    this.refreshHint();
  }

  async eruptObsidian(cells) {
    const { board, vfx } = this.s;
    if (cells.length === 0) return;

    cells.forEach((cell) => {
      const p = board.cellPos(cell.r, cell.c);
      vfx.ring(board.x + p.x, board.y + p.y, OBSIDIAN.seamHot, 170, 7);
      vfx.burst(board.x + p.x, board.y + p.y, OBSIDIAN.seam, 8, 1.2);
    });
    await board.lockCells(cells);
    this.refreshHint();
  }

  strikeHeroes(attack) {
    const { heroRow, hud, vfx, layout, hitStop } = this.s;
    if (this.settled()) return Promise.resolve();
    if (this.ultCasting && !attack.unstoppable) return Promise.resolve();
    const targets = heroRow.resolveTargets(attack.targets);
    const solo = targets.length === 1;
    const jobs = [];
    let fell = 0;
    let held = false;

    heroRow.cards.forEach((card, i) => {
      const direct = targets.indexOf(i) !== -1;
      const amount = direct ? attack.damage : attack.splash || 0;
      if (amount <= 0 || card.downed) return;

      const lost = card.lossFor(amount);
      if (card.hp - amount <= 0.001) fell++;
      const wait = direct && solo ? 0 : 0.07 * i;
      jobs.push(card.hurt(amount, wait));
      if (lost <= 0) return;

      const at = heroRow.cardPoint(i);
      const lift = layout.cards.h * (i % 2 ? 0.42 : 0.06);
      const pop = () => {
        if (this.ended) return;
        if (!held) {
          held = true;
          hitStop(direct ? (solo ? 0.55 : 0.42) : 0.24);
        }
        vfx.impact({ x: card.x, y: card.y }, 0xff5a1f, direct ? 0.55 : 0.3);
        hud.damage(lost * HERO_MAX_HP, at.x, at.y - lift, direct ? 1 : 0, {
          sign: "-",
          fill: direct ? 0xff6b5a : 0xffb3a8,
        });
      };
      if (wait > 0) delay(wait).then(pop);
      else pop();
    });

    if (fell > 0 && fell >= heroRow.aliveCount()) this.claim("defeat");

    if (fell > 0 && !this.settled()) {
      delay(0.45).then(() => {
        if (this.ended || this.partyWiped()) return;
        hud.shout(COPY.down, 0.5, { fill: 0xff6b5a, from: 1.5 });
      });
    }

    return Promise.all(jobs);
  }

  currentHint() {
    const { board } = this.s;
    if (this.turn === 0 && !this.playerActed) {
      const a = SCRIPTED_HINT.a;
      const b = SCRIPTED_HINT.b;
      if (
        board.typeAt(a.r, a.c) >= 0 &&
        board.typeAt(b.r, b.c) >= 0 &&
        this.swapMakesMatch(a, b)
      ) {
        return { a, b };
      }
    }
    return board.findBestSwap(WATER) || board.findBestSwap();
  }

  refreshHint() {
    if (this.ended) return;
    if (this.ultLive) return;
    if (this.openingLive && !this.openingSpent) {
      this.retireLesson();
      this.pointOpeningHand();
      return;
    }
    if (!this.idleHint) return;
    const live = this.lessonLive;
    this.idleHint = this.currentHint();
    this.restartIdle(live);
  }

  swapMakesMatch(a, b) {
    const { board } = this.s;
    board.swapModel(a, b);
    const ok = board.findMatches().length > 0;
    board.swapModel(a, b);
    return ok;
  }

  async playUltimate() {
    this.ultInFlight = true;
    this.setUltRate(ULT_PACE.cast);
    try {
      await this.castUltimate();
    } finally {
      this.setCasting(false);
      this.ultInFlight = false;
      this.setUltRate(1);
    }
  }

  async castUltimate() {
    const { board, boss, heroRow, hud, vfx, cutin, shake, hitStop, layout } =
      this.s;
    const index = this.ultHero;
    const card = heroRow.cards[index];
    if (!card || card.downed) return;

    const element = card.hero.element;
    const healer = !!card.hero.heal;
    track(EV.ultimate, { hero: index, element, healer });
    const color = GEM_COLORS[element];
    const light = GEM_LIGHT[element];

    board.lockInput();
    const spending = card.spend();
    await delay(card.flareLead());
    await cutin.play(index);
    if (this.ended) return;

    card.strike(true);
    vfx.sweep(color);
    shake(14, 0.45);
    await spending;

    const hadObsidian = healer && board.hasObsidian();
    const cleansing = hadObsidian
      ? board.clearAllObsidian()
      : Promise.resolve(0);
    if (hadObsidian) {
      hud.shout(COPY.ultClear, 0.5, { fill: light, from: 1.4 });
    }

    const cleared = await board.clearElement(element);
    const billed = Math.max(cleared, DIFFICULTY.ultGemFloor || 0);
    const total =
      (DIFFICULTY.ultDamage +
        billed * DIFFICULTY.damagePerGem * DIFFICULTY.ultGemMultiplier) *
      this.ultResistance();
    const dealt = this.outcome === "defeat" ? 0 : total;
    this.bossHp = Math.max(0, this.bossHp - dealt);
    if (this.bossHp <= 0) this.claim("victory");

    const target = boss.impactPoint();
    const origin = heroRow.cardPoint(index);

    await vfx.ultCast(element, origin, target, color, light, {
      size: layout.board.size * 1.25,
      beam: { thickness: 64, impact: 2.6, travel: 0.22 },
    });
    if (this.ended) return;

    sfx.ultBlast(element);
    boss.hit(2);
    shake(22, 0.6, {
      axis: { x: target.x - origin.x, y: target.y - origin.y },
    });
    hitStop(0.85, 0.15);
    vfx.flash(light, 0.55, 0.55);
    hud.damage(dealt * BOSS_MAX_HP, target.x, target.y - 24, 2);
    hud.setHp(this.bossHp, 0.6);
    this.checkPhase();

    const hurt = heroRow.cards.some((c) => c.hp < 1 || c.downed);
    const healing = healer ? heroRow.healAll(this.healTo()) : Promise.resolve();
    if (healer) this.healsUsed++;
    if (healer && hurt && !hadObsidian) {
      hud.shout(COPY.ultHeal, 0.5, { fill: 0x9fffc4, from: 1.4 });
    }

    const chained = this.ultQueue.length
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.ultChainResolver = resolve;
        });
    await Promise.race([
      Promise.all([cleansing, healing, delay(ULT_PACE.tail)]),
      chained,
    ]);
    this.ultChainResolver = null;
  }

  async win() {
    const { boss, board, hud } = this.s;
    this.claim("victory");
    board.lockInput();
    this.stopIdle();
    this.doomArmed = false;
    hud.hideDoom();
    boss.die().catch(() => {});
  }

  async lose() {
    const { boss, board, hud } = this.s;
    this.claim("defeat");
    board.lockInput();
    this.stopIdle();
    this.doomArmed = false;
    hud.hideDoom();
    boss.enrage();
    hud.enrage();
    boss.roar().catch(() => {});
  }

  beginIdle(hint) {
    this.idleHint = hint;
    this.armAutoPlay();
    this.armBossPress();
    this.armOpeningHint();
    this.restartIdle();
  }

  armOpeningHint() {
    if (this.openingSpent || T.openingHint == null) return;
    if (this.openingLive) return;
    const token = ++this.openingToken;
    if (T.openingHint <= 0) {
      this.pointOpeningHand();
      return;
    }
    delay(T.openingHint).then(() => {
      if (token !== this.openingToken || this.ended || this.openingSpent) {
        return;
      }
      this.pointOpeningHand();
    });
  }

  pointOpeningHand() {
    this.openingLive = this.showLesson(1.15, true);
  }

  showLesson(urgency, cold) {
    const { hand, board, coach } = this.s;
    if (this.ultLive) return false;
    const hint = this.currentHint();
    if (!hint) return false;

    this.idleHint = hint;
    if (this.highlighted) board.setHighlight(this.highlighted, false);
    this.highlighted = null;
    this.lessonLive = true;
    hand.setUrgency(urgency);

    const solve = () => {
      const next = this.currentHint();
      if (next) {
        const fresh = board.matchShape(next.a, next.b);
        if (fresh) {
          this.idleHint = next;
          return fresh;
        }
      }
      this.lessonLive = false;
      this.openingLive = false;
      this.restartIdle();
      return null;
    };

    const ready = (card) => card.ready && !card.downed;
    const cardFor = this.ultTaught
      ? null
      : (type) => {
          const cards = this.s.heroRow.cards;
          return (
            cards.find((card) => card.hero.element === type && ready(card)) ||
            cards.find(ready) ||
            null
          );
        };

    const shape = coach && board.matchShape(hint.a, hint.b);
    if (shape) {
      coach.play(board, hand, shape, solve, cold, cardFor);
      return true;
    }
    this.pointHand();
    this.highlighted = [hint.a, hint.b];
    board.setHighlight(this.highlighted, true);
    return true;
  }

  retireLesson() {
    const { board, coach, hand } = this.s;
    this.lessonLive = false;
    if (coach) coach.stop();
    board.cancelPreview(true);
    hand.setUrgency(1);
    hand.stop();
    if (this.highlighted) {
      board.setHighlight(this.highlighted, false);
      this.highlighted = null;
    }
  }

  spendOpeningHint() {
    if (this.openingSpent) return;
    this.openingSpent = true;
    this.openingLive = false;
    this.openingToken++;
    this.retireLesson();
  }

  surgeUlt(index) {
    const { heroRow, hud, ultSurge } = this.s;
    if (!ultSurge || this.ended || this.ultLive || this.ultCasting)
      return false;
    const online = heroRow.cards.filter((c) => c.ready && !c.downed).length;
    if (online !== 1) return false;
    hud.hideShout();
    ultSurge.play(index);
    return true;
  }

  callUlt(dt) {
    const { heroRow, vfx, ultRim } = this.s;
    const cfg = ULT_CALL.beckon;

    const lead = this.ended || this.ultCasting ? -1 : heroRow.leadCharged();
    if (ultRim) {
      if (lead < 0) ultRim.disarm();
      else if (ultRim.arm(heroRow.cards[lead].hero.element)) {
        const element = heroRow.cards[lead].hero.element;
        this.s.hitStop(ULT_RIM.stop);
        vfx.flash(GEM_LIGHT[element], ULT_RIM.flash, ULT_RIM.flashDur);
      }
    }

    if (lead >= 0 && this.autoDue(lead)) {
      this.autoUlt(lead);
      return;
    }

    const index = this.ultLive || this.ultQueue.length ? -1 : lead;
    if (index < 0) {
      this.beckonAt = cfg.every;
      return;
    }

    this.beckonAt -= dt;
    if (this.beckonAt > 0) return;

    const card = heroRow.cards[index];
    const urgent = card.readyFor >= cfg.urgentAfter;
    this.beckonAt = urgent ? cfg.urgentEvery : cfg.every;

    const element = card.hero.element;
    vfx.ultBeckon(
      { x: card.x, y: card.y },
      element,
      GEM_COLORS[element],
      GEM_LIGHT[element],
      card.cardW || 0,
      card.cardH || 0,
      urgent,
    );
    card.beckon(cfg.punch * (urgent ? 1.5 : 1));
    sfx.ultCall(element, cfg.gain * (urgent ? 1.6 : 1));
  }

  autoDue(index) {
    if (!T.ultAuto || this.ultInFlight || this.ultQueue.length) return false;
    const card = this.s.heroRow.cards[index];
    return !!card && card.readyFor >= T.ultAuto;
  }

  autoUlt(index) {
    if (!this.canUlt(index)) return;
    this.endUltLesson();
    this.ultQueue.push(index);
    this.setCasting(true);
    const resolve = this.ultResolver;
    this.ultResolver = null;
    if (resolve) {
      resolve("ult");
      return;
    }
    if (this.ultChainResolver) {
      const chain = this.ultChainResolver;
      this.ultChainResolver = null;
      chain();
      return;
    }
    this.rushForUlt();
  }

  async teachUlt(index) {
    if (!T.ultHints || this.ultTaught || this.ended || this.ultLive) return;
    if (this.ultShows >= T.ultHintShows) return;
    const { heroRow, hand, coach } = this.s;
    const card = heroRow.cards[index];
    if (!card || !coach) return;

    this.ultShows++;
    const token = ++this.ultToken;
    this.ultLive = true;
    this.retireLesson();

    await delay(T.ultHintIn);
    if (token !== this.ultToken) return;
    if (this.ended || this.ultTaught || !this.canUlt(index)) {
      this.endUltLesson();
      this.restartIdle();
      return;
    }

    hand.setUrgency(1.15);
    coach.playCard(card, hand, card.hero.element);

    for (let left = T.ultHint; left > 0; left -= ULT_TICK) {
      await delay(ULT_TICK);
      if (token !== this.ultToken) return;
      if (this.ended || !this.canUlt(index)) break;
    }
    this.endUltLesson();
    this.restartIdle();
    this.reofferUlt(index);
  }

  async reofferUlt(index) {
    if (!T.ultHintAgain || this.ultTaught || this.ended) return;
    if (this.ultShows >= T.ultHintShows) return;
    const token = this.ultToken;
    await delay(T.ultHintAgain);
    if (token !== this.ultToken || this.ultTaught || this.ended) return;
    if (this.ultLive || !this.canUlt(index)) return;
    this.teachUlt(index);
  }

  endUltLesson() {
    if (!this.ultLive) return;
    this.ultToken++;
    this.ultLive = false;
    this.retireLesson();
  }

  armBossPress() {
    if (!T.bossPress) return;
    const token = ++this.pressToken;
    delay(T.bossPress).then(() => {
      if (token !== this.pressToken || this.settled()) return;
      this.queueBoss(() => this.bossTurn());
      this.armBossPress();
    });
  }

  armAutoPlay() {
    if (!T.autoPlay || this.playerActed) return;
    const token = ++this.moveToken;
    delay(this.autoDelay()).then(() => {
      if (token !== this.moveToken || this.ended || this.playerActed) return;
      this.autoPlay();
    });
  }

  restartIdle(immediate) {
    if (this.ended) return;
    if (this.ultLive) return;
    const token = ++this.idleToken;
    if (!this.openingLive) this.retireLesson();
    if (!T.hints || !this.idleHint) return;
    this.escalate(token, immediate);
  }

  async escalate(token, immediate) {
    const { hand, board } = this.s;

    if (!immediate) {
      await delay(T.hint);
      if (token !== this.idleToken || this.ended) return;
    }

    while (board.busy) {
      await delay(0.12);
      if (token !== this.idleToken || this.ended) return;
    }

    if (this.openingLive && !this.openingSpent) return;

    if (!this.showLesson(1)) return;

    await delay(Math.max(0, T.pulse - T.hint));
    if (token !== this.idleToken || this.ended) return;
    if (this.ultLive) return;
    hand.setUrgency(1.3);
    if (this.idleHint) {
      this.highlighted = [this.idleHint.a, this.idleHint.b];
      board.setHighlight(this.highlighted, true);
    }
  }

  autoDelay() {
    const left = T.hardCap - T.finaleReserve - toReal(now());
    const moves = Math.max(1, Math.ceil(this.bossHp / this.paidPerMove()));
    const budget = left / moves - T.moveCost;
    return toWorld(Math.max(T.autoFloor, Math.min(T.auto, budget)));
  }

  pointHand() {
    const { hand, board } = this.s;
    if (!this.idleHint) return;
    const a = board.cellPos(this.idleHint.a.r, this.idleHint.a.c);
    const b = board.cellPos(this.idleHint.b.r, this.idleHint.b.c);
    hand.setElement(board.typeAt(this.idleHint.a.r, this.idleHint.a.c));
    hand.swipeLoop(
      { x: board.x + a.x, y: board.y + a.y },
      { x: board.x + b.x, y: board.y + b.y },
    );
  }

  async autoPlay() {
    const token = this.moveToken;
    const board = this.s.board;
    for (let attempt = 0; attempt < 24; attempt++) {
      if (this.ended || token !== this.moveToken || this.playerActed) return;
      if (!board.busy) {
        const hint = board.findBestSwap() || this.idleHint;
        if (hint) {
          board.autoPlay(hint);
          return;
        }
      }
      await delay(0.25);
    }
  }

  stopIdle() {
    this.idleToken++;
    this.moveToken++;
    this.pressToken++;
    this.openingToken++;
    this.openingLive = false;
    this.endUltLesson();
    this.retireLesson();
    this.idleHint = null;
  }

  async finish() {
    if (this.ended) return;
    this.ended = true;
    this.stopIdle();
    this.setUltRate(1);
    sfx.bed.stop();
    music.endcard();
    this.doomArmed = false;
    this.s.hud.hideDoom();
    this.s.board.lockInput();
    this.s.hud.hideShout(true);
    if (this.s.ultSurge) this.s.ultSurge.hide(true);
    const outcome = this.outcome || (this.bossHp <= 0 ? "victory" : "defeat");
    track(EV.end, {
      outcome,
      seconds: Math.round(this.elapsed() - this.fightStart),
      bossHp: Math.max(0, Math.round(this.bossHp)),
    });

    const terminal = this.s.outcome.terminalFor(outcome);

    await this.s.outcome.show(outcome);

    if (terminal) return;
  }
}
