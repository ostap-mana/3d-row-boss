import {
  busReport,
  hosted,
  say,
  sayOnce,
  started as busStarted,
  wireBus,
} from "./net/bus.js";
import { Application, Container, Graphics, Rectangle, Sprite } from "pixi.js";

import { computeLayout } from "./core/layout.js";
import {
  measureSafeInsets,
  measureViewport,
  resolutionFor,
  watchViewport,
} from "./core/viewport.js";
import { setApp } from "./core/context.js";
import { nextFrame } from "./core/idle.js";
import { updateTweens } from "./core/tween.js";
import {
  clearStop,
  hitStop,
  rumble,
  shakeDecay,
  warpDt,
} from "./core/juice.js";
import { reseed, runIndex, seed } from "./core/rng.js";
import { initGemTextures, loadGemArt } from "./art/gems.js";
import { Background, loadArena } from "./art/background.js";
import { loadCardPlates } from "./art/plates.js";
import { loadUltBorders } from "./art/ultborder.js";
import { loadBoardFrame } from "./art/boardframe.js";
import { loadBrandArt } from "./art/brand.js";
import { loadOutcomeUi } from "./art/outcomeui.js";
import { loadHeroAvatars } from "./art/avatars.js";
import { loadHintHand } from "./art/hinthand.js";
import { loadHintMarks } from "./art/hintmarks.js";
import { loadHpBarArt } from "./art/hpbar.js";
import { loadCardBars } from "./art/cardbars.js";
import { loadReadyCrowns } from "./art/readyfx.js";
import { Boss, loadBossArt } from "./art/boss.js";
import { loadBossCrest } from "./art/crest.js";
import { loadFireArt } from "./art/fire.js";
import { loadSpellArt } from "./art/spells.js";
import { loadStreamArt } from "./art/streams.js";
import { loadBoltArt } from "./art/bolts.js";
import { loadShardArt } from "./art/shards.js";
import { loadGemPopArt } from "./art/gempop.js";
import { loadGemChargeArt } from "./art/gemcharge.js";
import { loadOutcomeFigures, rewindFigures } from "./art/figures.js";
import { HeroRow } from "./art/heroes.js";
import { Board } from "./game/board.js";
import { Director } from "./game/director.js";
import { stateEngine } from "./game/states.js";
import { openPanel } from "./dev/panel.js";
import { Hud } from "./ui/hud.js";
import { Hand } from "./ui/hand.js";
import { Coach } from "./ui/coach.js";
import { Spotlight } from "./ui/spotlight.js";
import { EndCard } from "./ui/endcard.js";
import { FREEZE_LIFT, FREEZE_STEPS, OutcomeScreen } from "./ui/outcome.js";
import { StartPrompt } from "./ui/startprompt.js";
import { CutIn } from "./fx/cutin.js";
import { Vfx } from "./fx/vfx.js";
import { UltRim } from "./fx/ultrim.js";
import { UltSurge } from "./fx/ultsurge.js";
import { loadFonts } from "./ui/fonts.js";
import { ctaClick } from "./net/cta.js";
import { EV, eventLog, track, trackOnce } from "./net/analytics.js";
import { replayReport, stepDoor, tellState } from "./net/replay.js";
import {
  audioHeartbeat,
  audioSleep,
  installAudioUnlock,
  onAudioOpen,
  setMuted,
} from "./audio/engine.js";
import { bed } from "./audio/sfx.js";
import { music } from "./audio/music.js";

const timing = { essential: 0, ready: 0, deferred: 0 };

async function boot() {
  const bootStart = performance.now();
  const since = () => Math.round(performance.now() - bootStart);

  track(EV.load);

  installAudioUnlock();

  const app = new Application();

  const first = measureViewport();

  await app.init({
    background: "#05030a",
    width: first.w,
    height: first.h,
    antialias: true,
    resolution: resolutionFor(first.w, first.h),
    autoDensity: true,
    powerPreference: "high-performance",
    hello: false,
  });

  setApp(app);
  reseed();

  await Promise.all([
    loadFonts(),
    loadArena(),
    loadGemArt(),
    loadBoardFrame(),
    loadBrandArt(),
    loadOutcomeUi(),
    loadBossArt(),
    loadBossCrest(),
    loadGemPopArt(),
    loadGemChargeArt(),
    loadCardPlates(),
    loadHeroAvatars(),
    loadHintHand(),
    loadHintMarks(),
    loadHpBarArt(),
    loadCardBars(),
    loadReadyCrowns(),
  ]);
  timing.essential = since();
  initGemTextures(app.renderer);

  const host = document.getElementById("pixi-container") || document.body;
  host.appendChild(app.canvas);

  const world = new Container();
  const overlay = new Container();
  const guides = new Graphics();
  guides.visible = false;
  guides.eventMode = "none";
  app.stage.addChild(world, overlay, guides);

  const lavaMask = new Graphics();

  let director = null;

  const scene = { app, layout: null, shake, hitStop };

  function buildScene() {
    if (scene.bossLayer) scene.bossLayer.mask = null;
    world.removeChildren();
    overlay.removeChildren();

    const bg = new Background();
    const bossLayer = new Container();
    const boss = new Boss();
    bossLayer.addChild(boss);
    bossLayer.mask = lavaMask;

    const board = new Board();
    const vfx = new Vfx();
    const hud = new Hud((source) => ctaClick(source));
    const hand = new Hand();
    const coach = new Coach();
    const spotlight = new Spotlight();
    coach.useSpotlight(spotlight);
    const ultRim = new UltRim();
    const ultSurge = new UltSurge();
    const cutin = new CutIn();
    const outcome = new OutcomeScreen(
      freezeFight,
      () => restart(),
      (source) => ctaClick(source),
    );
    const endcard = new EndCard(
      (source) => ctaClick(source),
      () => restart(),
    );
    const prompt = new StartPrompt();

    const heroRow = new HeroRow((index) => {
      if (director) director.onCardTap(index);
    });

    world.addChild(
      bg,
      lavaMask,
      bossLayer,
      board,
      heroRow,
      vfx,
      hud,
      spotlight,
      coach,
      hand,
    );
    overlay.addChild(ultRim, ultSurge, cutin, outcome, endcard, prompt);
    hud.onShout = () => ultSurge.hide();

    Object.assign(scene, {
      bg,
      bossLayer,
      boss,
      board,
      coach,
      heroRow,
      hud,
      hand,
      spotlight,
      vfx,
      ultRim,
      ultSurge,
      cutin,
      outcome,
      endcard,
      prompt,
    });
  }

  buildScene();

  function ownsScreen() {
    try {
      if (window.top !== window) return false;
      if (hosted()) return false;
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    } catch {
      return false;
    }
  }

  function safeInsets() {
    return measureSafeInsets(view);
  }

  let view = { w: first.w, h: first.h };
  let layout = computeLayout(view.w, view.h, safeInsets(), {
    owned: ownsScreen(),
  });

  function relayout(size) {
    if (size) {
      app.renderer.resize(size.w, size.h, size.resolution);
      view = { w: size.w, h: size.h };
    }
    const safe = (size && size.safe) || safeInsets();
    layout = computeLayout(view.w, view.h, safe, { owned: ownsScreen() });
    scene.layout = layout;

    scene.bg.resize(layout);
    scene.boss.resize(layout);
    scene.board.resize(layout);
    scene.heroRow.resize(layout);
    scene.hud.resize(layout);
    scene.hand.resize(layout);
    scene.spotlight.resize(layout);
    scene.coach.resize(layout);
    scene.vfx.resize(layout);
    scene.ultRim.resize(layout);
    scene.ultSurge.resize(layout);
    scene.cutin.resize(layout);
    scene.outcome.resize(layout);
    scene.endcard.resize(layout);
    scene.prompt.resize(layout);
    if (scene.panel) scene.panel.resize(layout);

    lavaMask.clear();
    lavaMask.rect(
      -layout.w,
      -layout.h,
      layout.w * 3,
      layout.h + layout.boss.floor,
    );
    lavaMask.fill({ color: 0xffffff });

    drawGuides();
  }

  function drawGuides() {
    guides.clear();
    if (!guides.visible) return;

    const line = (r, color, width) => {
      guides.rect(r.x, r.y, r.w, r.h);
      guides.stroke({ width, color, alpha: 0.9, alignment: 0.5 });
    };

    line({ x: 0, y: 0, w: layout.w, h: layout.h }, 0x8899aa, 1);
    line(layout.stage, 0xffaa22, 1.5);
    line(layout.safeBox, 0x22ff88, 2);

    line(layout.hud, 0x44ccff, 1);
    line(layout.cards, 0xff44aa, 1);
    line(
      {
        x: layout.board.x,
        y: layout.board.y,
        w: layout.board.size,
        h: layout.board.size,
      },
      0xffffff,
      1,
    );
    line(
      {
        x: layout.banner.x - layout.banner.w / 2,
        y: layout.banner.y - layout.banner.h / 2,
        w: layout.banner.w,
        h: layout.banner.h,
      },
      0xffee44,
      1,
    );
  }

  relayout();

  watchViewport(host, relayout);

  ["fullscreenchange", "webkitfullscreenchange"].forEach((type) =>
    document.addEventListener(type, () => relayout(), { passive: true }),
  );

  onAudioOpen(() => {
    bed.start();
    music.start();
  });
  document.addEventListener("visibilitychange", () =>
    audioSleep(document.hidden),
  );
  window.addEventListener("pagehide", () => audioSleep(true));
  window.addEventListener("pageshow", () => audioSleep(document.hidden));

  const TEXT_NUDGE = 0.001;

  function repaintText(node) {
    if (typeof node.text === "string" && node.style) {
      node.style.padding = (node.style.padding || 0) + TEXT_NUDGE;
    }
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) repaintText(kids[i]);
  }

  app.canvas.addEventListener(
    "webglcontextlost",
    () => {
      app.ticker.stop();
      audioSleep(true);
    },
    false,
  );
  app.canvas.addEventListener(
    "webglcontextrestored",
    () => {
      repaintText(app.stage);
      relayout();
      audioSleep(false);
      app.ticker.start();
    },
    false,
  );

  function freezeFight() {
    const made = [];
    const shown = overlay.visible;
    const quiet = [
      scene.vfx,
      scene.hand,
      scene.coach,
      scene.spotlight,
      scene.hud && scene.hud.callout,
      scene.hud && scene.hud.numbers,
    ].filter(Boolean);
    const quietWas = quiet.map((el) => el.visible);
    const restore = () => {
      quiet.forEach((el, i) => {
        el.visible = quietWas[i];
      });
    };

    const resample = (from, w, h) => {
      const holder = new Container();
      const step = new Sprite(from);
      step.setSize(w, h);
      holder.addChild(step);

      const next = app.renderer.generateTexture({
        target: holder,
        resolution: 1,
        antialias: false,
        textureSourceOptions: { scaleMode: "linear" },
      });
      holder.destroy({ children: true });
      made.push(next);
      return next;
    };

    try {
      overlay.visible = false;
      quiet.forEach((el) => {
        el.visible = false;
      });
      let texture = app.renderer.generateTexture({
        target: world,
        frame: new Rectangle(0, 0, view.w, view.h),
        resolution: app.renderer.resolution,
        antialias: false,
        textureSourceOptions: { scaleMode: "linear" },
      });
      overlay.visible = shown;
      restore();
      made.push(texture);

      const rungs = [];
      let w = view.w;
      let h = view.h;
      for (let i = 0; i < FREEZE_STEPS; i++) {
        rungs.push([w, h]);
        w = Math.max(2, Math.round(w / 2));
        h = Math.max(2, Math.round(h / 2));
        texture = resample(texture, w, h);
      }

      const lift = Math.max(0, Math.min(FREEZE_LIFT, rungs.length));
      for (let i = 0; i < lift; i++) {
        const [rw, rh] = rungs[rungs.length - 1 - i];
        texture = resample(texture, rw, rh);
      }

      made.slice(0, -1).forEach((t) => t.destroy(true));
      return texture;
    } catch {
      overlay.visible = shown;
      restore();
      made.forEach((t) => {
        try {
          t.destroy(true);
        } catch {}
      });
      return null;
    }
  }

  let begin = () => {};

  let shakeAmount = 0;
  let shakeLeft = 0;
  let shakeTotal = 0;
  let shakeT = 0;
  let shakeAxis = null;
  let shakeFreq = 1;

  function shake(amount, duration, opts) {
    const o = opts || {};

    const scaled = amount * (layout ? layout.ui : 1);

    if (scaled >= shakeAmount) {
      shakeFreq = o.freq === undefined ? 1 : o.freq;
      if (o.axis) {
        const len = Math.hypot(o.axis.x, o.axis.y);
        shakeAxis =
          len > 0.001 ? { x: o.axis.x / len, y: o.axis.y / len } : null;
      } else {
        shakeAxis = null;
      }
    }
    shakeAmount = Math.max(shakeAmount, scaled);
    shakeLeft = Math.max(shakeLeft, duration);
    shakeTotal = Math.max(shakeTotal, shakeLeft);
  }

  function updateShake(dt) {
    if (shakeLeft <= 0) {
      if (shakeAmount !== 0) {
        world.x = 0;
        world.y = 0;
        shakeAmount = 0;
        shakeAxis = null;
        shakeFreq = 1;
      }
      return;
    }

    shakeLeft -= dt;
    shakeT += dt;
    const k = shakeLeft > 0 ? shakeLeft / shakeTotal : 0;
    const a = shakeAmount * shakeDecay(k);

    let ox = rumble(shakeT, 0, shakeFreq);
    let oy = rumble(shakeT, 1, shakeFreq);
    if (shakeAxis) {
      const along = ox;
      const across = oy * 0.32;
      ox = shakeAxis.x * along - shakeAxis.y * across;
      oy = shakeAxis.y * along + shakeAxis.x * across;
    }

    world.x = ox * a;
    world.y = oy * a;
  }

  function goFullscreen() {
    try {
      if (window.top !== window) return;
      if (document.fullscreenElement || document.webkitFullscreenElement)
        return;
      const el = document.documentElement;
      const ask = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!ask) return;
      const done = ask.call(el, { navigationUI: "hide" });
      if (done && done.catch) done.catch(() => {});
    } catch {}
  }

  function byFinger(e) {
    if (!e) return false;
    if (e.type === "touchstart") return true;
    if (e.type === "mousedown") return false;
    return e.pointerType !== "mouse";
  }

  function firstTouch() {
    const DOWN = ["pointerdown", "touchstart", "mousedown"];
    const MOVE = ["pointermove", "touchmove", "mousemove"];
    const UP = ["pointerup", "touchend", "mouseup"];
    const CANCEL = ["pointercancel", "touchcancel"];
    const ALL = [...DOWN, ...MOVE, ...UP, ...CANCEL];
    const DRAG = 10;

    return new Promise((resolve) => {
      let from = null;
      let done = false;

      const at = (e) => {
        const list = e.changedTouches || e.touches;
        const p = list && list.length ? list[0] : e;
        return { x: p.clientX || 0, y: p.clientY || 0 };
      };

      const commit = (finger) => {
        if (done) return;
        done = true;
        ALL.forEach((type) => window.removeEventListener(type, route, true));
        if (finger) goFullscreen();
        resolve();
      };

      const route = (e) => {
        if (e.isTrusted === false) return;
        if (DOWN.includes(e.type)) {
          if (!from) from = { ...at(e), finger: byFinger(e) };
          return;
        }
        if (!from) return;
        if (CANCEL.includes(e.type)) {
          from = null;
          return;
        }
        if (MOVE.includes(e.type)) {
          const p = at(e);
          if (Math.hypot(p.x - from.x, p.y - from.y) >= DRAG) {
            commit(from.finger);
          }
          return;
        }
        commit(from.finger);
      };

      ALL.forEach((type) =>
        window.addEventListener(type, route, { capture: true, passive: true }),
      );
      begin = () => commit(false);
    });
  }

  let dropLessonExit = () => {};

  const EXIT_GRACE = 400;

  function armLessonExit() {
    dropLessonExit();
    const DOWN = ["pointerdown", "touchstart", "mousedown"];
    const armed = performance.now();
    const press = (e) => {
      if (e.isTrusted === false) return;
      if (performance.now() - armed < EXIT_GRACE) return;
      dropLessonExit();
      if (director) director.spendOpeningHint();
    };
    dropLessonExit = () => {
      DOWN.forEach((type) => window.removeEventListener(type, press, true));
      dropLessonExit = () => {};
    };
    DOWN.forEach((type) =>
      window.addEventListener(type, press, { capture: true, passive: true }),
    );
  }

  let told = null;
  let toldProgress = -1;

  function reportFunnel() {
    if (!director || !busStarted()) return;
    const step = Math.floor(director.wounds() * 20) / 20;
    if (step > 0 && step > toldProgress) {
      toldProgress = step;
      say("progress", { value: step });
    }
    const outcome = director.outcome;
    if (outcome && outcome !== told) {
      told = outcome;
      say(outcome === "victory" ? "solved" : "failed");
    }
    if (director.ended) sayOnce("endcard");
  }

  app.ticker.add((ticker) => {
    audioHeartbeat();
    const stepped = stepDoor(Math.min(ticker.deltaMS / 1000, 0.05));
    if (stepped == null) return;
    const real = stepped;
    if (scene.panel) scene.panel.update(real);
    if (scene.states && scene.states.held()) return;
    const dt = warpDt(real);
    updateTweens(dt);
    if (director) director.update(real);
    scene.bg.update(dt);
    scene.boss.update(dt);
    scene.board.update(dt);
    scene.heroRow.update(dt);
    scene.ultRim.update(dt);
    scene.hud.update(dt);
    scene.spotlight.update(dt);
    scene.outcome.update(dt);
    scene.endcard.update(dt);
    scene.prompt.update(dt);
    updateShake(real);
    reportFunnel();
  });

  function restart() {
    track(EV.retry);
    say("retry");
    rewindFigures();
    told = null;
    clearStop();
    shakeLeft = 0;
    shakeTotal = 0;
    shakeAmount = 0;
    shakeAxis = null;
    shakeFreq = 1;
    world.x = 0;
    world.y = 0;

    reseed();
    buildScene();
    scene.prompt.hide();
    relayout();

    bed.start();
    music.start();

    director = new Director(scene);
    scene.director = director;
    scene.states.attach();
    director.armIntro();
    armLessonExit();
    director.run();
  }

  director = new Director(scene);
  scene.director = director;
  scene.states = stateEngine(scene);
  scene.states.attach();

  function ensurePanel() {
    if (scene.panel) return scene.panel;
    try {
      scene.panel = openPanel(scene);
      scene.panel.show(false);
      if (layout) scene.panel.resize(layout);
    } catch {
      scene.panel = null;
    }
    return scene.panel;
  }

  function toggleMenu(on) {
    return nextFrame().then(() => {
      const panel = ensurePanel();
      return panel ? panel.show(on) : false;
    });
  }

  const query = new URLSearchParams(location.search);
  if (query.has("panel") || query.has("menu")) toggleMenu(true);

  const MENU_TAPS = 3;
  const MENU_WINDOW = 1200;
  const MENU_CORNER = 64;

  let cornerTaps = [];

  function cornerTap(e) {
    if (e.isTrusted === false) return;
    const list = e.changedTouches || e.touches;
    const p = list && list.length ? list[0] : e;
    const box = app.canvas.getBoundingClientRect();
    const reach = MENU_CORNER * (layout ? layout.ui : 1);
    if ((p.clientX || 0) - box.left > reach) {
      cornerTaps = [];
      return;
    }
    if ((p.clientY || 0) - box.top > reach) {
      cornerTaps = [];
      return;
    }
    const now = performance.now();
    cornerTaps = cornerTaps.filter((at) => now - at < MENU_WINDOW);
    cornerTaps.push(now);
    if (cornerTaps.length < MENU_TAPS) return;
    cornerTaps = [];
    toggleMenu();
  }

  window.addEventListener(
    window.PointerEvent ? "pointerdown" : "touchstart",
    cornerTap,
    { capture: true, passive: true },
  );

  scene.mute = setMuted;
  scene.menu = (on) => toggleMenu(on);
  scene.begin = () => begin();
  scene.fullscreen = goFullscreen;
  scene.safeZones = (on) => {
    guides.visible = on === undefined ? !guides.visible : !!on;
    drawGuides();
    return { ...layout.safe, shown: guides.visible };
  };
  scene.timing = timing;
  scene.events = eventLog;
  scene.bus = busReport;
  scene.replay = replayReport;
  scene.restart = () => restart();
  function onScreen(node) {
    let n = node;
    while (n) {
      if (!n.visible || n.alpha <= 0.01) return false;
      n = n.parent;
    }
    return true;
  }

  function rectOf(name, node) {
    if (!node || !onScreen(node)) return null;
    try {
      const bounds = node.getBounds();
      const r = bounds.rectangle || bounds;
      if (!(r.width > 0) || !(r.height > 0)) return null;
      return { name, x: r.x, y: r.y, w: r.width, h: r.height };
    } catch {
      return null;
    }
  }

  function ctaRects() {
    const out = [];
    const add = (r) => {
      if (r) out.push(r);
    };
    add(rectOf("store", scene.hud && scene.hud.banner));
    if (scene.outcome && !scene.outcome.defeat) {
      add(rectOf("store-outcome", scene.outcome.retry));
    }
    add(rectOf("store-endcard", scene.endcard && scene.endcard.button));
    return out;
  }

  wireBus({
    start() {
      track(EV.view, { live: true });
      app.ticker.start();
      audioSleep(false);
    },
    pause() {
      track(EV.hide, { live: true });
      app.ticker.stop();
      audioSleep(true);
    },
    resume() {
      track(EV.view, { live: true });
      app.ticker.start();
      audioSleep(false);
    },
    audio(on) {
      setMuted(!on);
    },
    rects: ctaRects,
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyM") {
      toggleMenu();
      return;
    }
    if (e.code === "KeyR") {
      restart();
      return;
    }
    if (!director || director.settled()) return;
    if (e.code === "KeyV") director.claim("victory");
    else if (e.code === "KeyD") director.claim("defeat");
    else return;
    director.finish();
  });

  tellState(() => ({
    seed: seed(),
    run: runIndex(),
    t: director ? director.elapsed() : 0,
    mode: director
      ? director.outcome || (director.ended ? "ended" : "fight")
      : "boot",
    bossHp: director ? director.bossHp : 1,
    moves: director ? director.movesPlayed : 0,
    heroes: scene.heroRow ? scene.heroRow.aliveCount() : 0,
    swaps: scene.board ? scene.board.countSwaps() : 0,
  }));

  window.__SIEGE__ = scene;

  director.armIntro();

  async function loadRest() {
    await nextFrame();
    await nextFrame();

    try {
      await loadUltBorders();
      scene.heroRow.adoptUltArt();
      scene.cutin.adoptUltArt();
    } catch {}
    for (const load of [
      loadSpellArt,
      loadStreamArt,
      loadBoltArt,
      loadShardArt,
      loadFireArt,
      loadOutcomeFigures,
    ]) {
      try {
        await load();
      } catch {}
    }
    timing.deferred = since();
  }

  nextFrame().then(() => {
    timing.ready = since();
    trackOnce(EV.ready, { ms: timing.ready });
  });

  loadRest();

  firstTouch().then(() => {
    trackOnce(EV.start);
    scene.prompt.dismiss();
    director.spendOpeningHint();
    director.run();
  });
}

boot();
