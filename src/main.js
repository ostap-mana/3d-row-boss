/**
 * ELEMENTAL SIEGE — playable ad entry point.
 *
 * Phone-first: no desktop layout, no keyboard, no network, and no audio until
 * the player touches the screen — see the audio section below. Boots, plays a
 * fifteen second fight — T.hardCap, and every other number in config.js is
 * fitted to it — and hands the player to the store.
 */

import { Application, Container, Graphics } from "pixi.js";

import { RUN_SEED } from "./config.js";
import { computeLayout } from "./core/layout.js";
import { setApp } from "./core/context.js";
import { updateTweens } from "./core/tween.js";
import { reseed } from "./core/rng.js";
import { initGemTextures, loadGemArt } from "./art/gems.js";
import { Background, loadArena } from "./art/background.js";
import { loadCardPlates } from "./art/plates.js";
import { loadCardFrames } from "./art/cardframe.js";
import { loadBoardFrame } from "./art/boardframe.js";
import { loadCtaBanner } from "./art/ctabanner.js";
import { loadBrandArt } from "./art/brand.js";
import { loadHeroAvatars } from "./art/avatars.js";
import { loadHintHand } from "./art/hinthand.js";
import { loadHpBarArt } from "./art/hpbar.js";
import { loadCardBars } from "./art/cardbars.js";
import { Boss, loadBossArt } from "./art/boss.js";
import { loadBossCrest } from "./art/crest.js";
import { loadFireArt } from "./art/fire.js";
import { HeroRow } from "./art/heroes.js";
import { Board } from "./game/board.js";
import { Director } from "./game/director.js";
import { Hud } from "./ui/hud.js";
import { Hand } from "./ui/hand.js";
import { EndCard } from "./ui/endcard.js";
import { CutIn } from "./fx/cutin.js";
import { Vfx } from "./fx/vfx.js";
import { loadFonts } from "./ui/fonts.js";
import { ctaClick, signalReady } from "./net/cta.js";
import { audioSleep, setMuted, unlockAudio } from "./audio/engine.js";
import { bed } from "./audio/sfx.js";

async function boot() {
  const app = new Application();

  await app.init({
    background: "#05030a",
    resizeTo: window,
    antialias: true,
    // Capped for the sake of the iPhone SE class of device.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    powerPreference: "high-performance",
    // Pixi's console banner is the one thing that logs in a production build.
    hello: false,
  });

  setApp(app);
  // Fixed seed: the board is the same board every run — same opening deal, same
  // refills, same lava. Drop the argument to give every impression its own.
  reseed(RUN_SEED);

  // Decoded before the first frame: the two web fonts because every Text in
  // the game is built below and a Pixi text texture bakes whatever face was
  // available when it was made, the arena so it is never briefly a
  // gradient, the painted gems because the board bakes its textures below and
  // a late arrival would miss that, the board frame because the Board constructor
  // reads it to lay its grid out, the gem banner because the Hud picks it up as
  // it is built, the wordmark and the PLAY NOW plate and the store badges
  // because the EndCard does the same, the golem because the
  // Boss constructor either builds around the painting or falls back to the
  // drawn rig, the crest because the Hud only puts a badge on the bar if the
  // art for one arrived, the card plates and hero busts because each HeroCard does the
  // same, the card frames because each card picks one by element as it is
  // built, and the hint hand because the Hand is built with the scene and reads
  // it to know which of the two hands it is showing.
  // Every bitmap is inlined in this file, so these are decodes, not downloads.
  await Promise.all([
    loadFonts(),
    loadArena(),
    loadGemArt(),
    loadBoardFrame(),
    loadCtaBanner(),
    loadBrandArt(),
    loadBossArt(),
    loadBossCrest(),
    loadFireArt(),
    loadCardPlates(),
    loadCardFrames(),
    loadHeroAvatars(),
    loadHintHand(),
    loadHpBarArt(),
    loadCardBars(),
  ]);
  initGemTextures(app.renderer);

  const host = document.getElementById("pixi-container") || document.body;
  host.appendChild(app.canvas);

  /* ------------------------------------------------------------- scene */

  // Everything inside `world` shakes together; overlays sit outside it.
  const world = new Container();
  const overlay = new Container();
  app.stage.addChild(world, overlay);

  const bg = new Background();
  const bossLayer = new Container();
  const boss = new Boss();
  bossLayer.addChild(boss);

  // Clip the boss at the lava line so it genuinely climbs out of the pool.
  const lavaMask = new Graphics();
  bossLayer.mask = lavaMask;

  const board = new Board();
  const vfx = new Vfx();
  const hud = new Hud((source) => ctaClick(source));
  const hand = new Hand();
  const cutin = new CutIn();
  const endcard = new EndCard((source) => ctaClick(source));

  let director = null;
  const heroRow = new HeroRow((index) => {
    if (director) director.onCardTap(index);
  });

  world.addChild(bg, lavaMask, bossLayer, board, heroRow, vfx, hud, hand);
  overlay.addChild(cutin, endcard);

  /* ------------------------------------------------------------ layout */

  /**
   * The notch, the home indicator, and whatever else the device keeps for
   * itself, in CSS pixels.
   *
   * Measured off the probe in index.html rather than guessed, and re-measured on
   * every relayout: the insets are not constant, they swap axes on rotation and
   * a webview can report zero until it has settled.
   */
  function safeInsets() {
    const probe = document.getElementById("safe-probe");
    if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
    const cs = getComputedStyle(probe);
    const px = (v) => Math.max(0, parseFloat(v) || 0);
    return {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
  }

  let layout = computeLayout(app.screen.width, app.screen.height, safeInsets());

  const scene = {
    app,
    layout,
    bg,
    boss,
    board,
    heroRow,
    hud,
    hand,
    vfx,
    cutin,
    endcard,
    shake,
  };

  function relayout() {
    app.resize();
    layout = computeLayout(app.screen.width, app.screen.height, safeInsets());
    scene.layout = layout;

    bg.resize(layout);
    boss.resize(layout);
    board.resize(layout);
    heroRow.resize(layout);
    hud.resize(layout);
    hand.resize(layout);
    vfx.resize(layout);
    cutin.resize(layout);
    endcard.resize(layout);

    lavaMask.clear();
    lavaMask.rect(
      -layout.w,
      -layout.h,
      layout.w * 3,
      layout.h + layout.boss.floor,
    );
    lavaMask.fill({ color: 0xffffff });
  }

  relayout();

  let resizePending = false;
  const onResize = () => {
    if (resizePending) return;
    resizePending = true;
    // Mobile browsers report stale viewport sizes during rotation, so settle
    // on the next frame instead of trusting the first event.
    requestAnimationFrame(() => {
      resizePending = false;
      relayout();
    });
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  /* -------------------------------------------------------------- audio */

  /**
   * Sound starts on the first touch and not one frame earlier.
   *
   * Not a policy we work around — a policy we agree with. The boss is already
   * roaring by the time most impressions are looked at, and a creative that
   * makes noise at somebody who has not touched it yet has earned the mute it
   * gets. Whatever the intro plays into a suspended context is simply lost.
   *
   * Both events, because a webview may deliver one and not the other, and
   * neither is `once`: unlocking is idempotent and a wrapper that swallows the
   * first gesture must not cost the whole ad its audio.
   */
  const wake = () => {
    unlockAudio();
    bed.start();
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("touchend", wake);
  // An ad scrolled off screen goes quiet rather than playing to an empty room.
  document.addEventListener("visibilitychange", () =>
    audioSleep(document.hidden),
  );

  /* ------------------------------------------------------------- shake */

  let shakeAmount = 0;
  let shakeLeft = 0;
  let shakeTotal = 0;

  function shake(amount, duration) {
    shakeAmount = Math.max(shakeAmount, amount);
    shakeTotal = duration;
    shakeLeft = duration;
  }

  function updateShake(dt) {
    if (shakeLeft <= 0) {
      world.x = 0;
      world.y = 0;
      shakeAmount = 0;
      return;
    }
    shakeLeft -= dt;
    const k = Math.max(0, shakeLeft / shakeTotal);
    const a = shakeAmount * k;
    world.x = (Math.random() - 0.5) * a * 2;
    world.y = (Math.random() - 0.5) * a * 2;
  }

  /* -------------------------------------------------------------- loop */

  app.ticker.add((ticker) => {
    // Clamped so a backgrounded tab does not fast-forward the storyboard.
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    updateTweens(dt);
    // The doom clock runs on wall time, so the director needs the frame too.
    if (director) director.update(dt);
    bg.update(dt);
    boss.update(dt);
    board.updateLocks(dt);
    heroRow.update(dt);
    hud.update(dt);
    endcard.update(dt);
    updateShake(dt);
  });

  /* --------------------------------------------------------------- run */

  director = new Director(scene);
  scene.director = director;

  // QA handle: lets an automated pass drive real swaps and assert the combo
  // invariants from spec §5 without shipping any logging. `mute` is on it for
  // the networks that ask for a kill switch they can call.
  scene.mute = setMuted;
  window.__SIEGE__ = scene;

  signalReady();
  startWhenVisible(() => director.run());
}

/**
 * MRAID slots can load the creative long before it is on screen. Waiting for
 * viewability keeps the storyboard clock honest.
 */
function startWhenVisible(start) {
  const mraid = window.mraid;
  if (!mraid || typeof mraid.isViewable !== "function") {
    start();
    return;
  }
  try {
    if (mraid.isViewable()) {
      start();
      return;
    }
    const onViewable = (viewable) => {
      if (!viewable) return;
      mraid.removeEventListener("viewableChange", onViewable);
      start();
    };
    mraid.addEventListener("viewableChange", onViewable);
  } catch (e) {
    start();
  }
}

boot();
