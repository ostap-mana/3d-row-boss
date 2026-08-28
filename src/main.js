/**
 * ELEMENTAL SIEGE — playable ad entry point.
 *
 * Phone-first: no desktop layout, no keyboard, no network, and no audio until
 * the player touches the screen — see the audio section below. Boots, plays a
 * thirty second fight — T.hardCap, and every other number in config.js is
 * fitted to it — and hands the player to the store.
 */

import { Application, Container, Graphics } from "pixi.js";

import { computeLayout } from "./core/layout.js";
import { setApp } from "./core/context.js";
import { updateTweens } from "./core/tween.js";
import { reseed } from "./core/rng.js";
import { initGemTextures, loadGemArt } from "./art/gems.js";
import { Background, loadArena } from "./art/background.js";
import { loadCardPlates } from "./art/plates.js";
import { loadCardFrames } from "./art/cardframe.js";
import { loadBoardFrame } from "./art/boardframe.js";
import { loadBrandArt } from "./art/brand.js";
import { loadHeroAvatars } from "./art/avatars.js";
import { loadHintHand } from "./art/hinthand.js";
import { loadHintMarks } from "./art/hintmarks.js";
import { loadHpBarArt } from "./art/hpbar.js";
import { loadCardBars } from "./art/cardbars.js";
import { Boss, loadBossArt } from "./art/boss.js";
import { loadBossCrest } from "./art/crest.js";
import { loadFireArt } from "./art/fire.js";
import { loadSpellArt } from "./art/spells.js";
import { loadGemPopArt } from "./art/gempop.js";
import { HeroRow } from "./art/heroes.js";
import { Board } from "./game/board.js";
import { Director } from "./game/director.js";
import { Hud } from "./ui/hud.js";
import { Hand } from "./ui/hand.js";
import { Coach } from "./ui/coach.js";
import { EndCard } from "./ui/endcard.js";
import { StartPrompt } from "./ui/startprompt.js";
import { CutIn } from "./fx/cutin.js";
import { Vfx } from "./fx/vfx.js";
import { loadFonts } from "./ui/fonts.js";
import { ctaClick, signalReady } from "./net/cta.js";
import {
  audioSleep,
  installAudioUnlock,
  onAudioOpen,
  setMuted,
} from "./audio/engine.js";
import { bed } from "./audio/sfx.js";
import { music } from "./audio/music.js";

async function boot() {
  // Before a single await. The first touch can land while the fonts and the
  // fourteen bitmaps below are still decoding, and on a phone that first touch
  // is the one that owns the sound for the rest of the session.
  installAudioUnlock();

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
  // No argument: every run rolls its own seed, so each impression gets its own
  // board — its own opening deal, its own refills, its own lava. Pass RUN_SEED
  // to pin a run down to a single reproducible board.
  reseed();

  // Decoded before the first frame: the two web fonts because every Text in
  // the game is built below and a Pixi text texture bakes whatever face was
  // available when it was made, the arena so it is never briefly a
  // gradient, the painted gems because the board bakes its textures below and
  // a late arrival would miss that, the board frame because the Board constructor
  // reads it to lay its grid out, the wordmark and the PLAY NOW plate and the
  // store badges because the Hud and the EndCard both pick them up as they are
  // built — the two CTA surfaces wear the same lockup now, so there is one set
  // of brand art between them and no gem banner any more, the golem because the
  // Boss constructor either builds around the painting or falls back to the
  // drawn rig, the crest because the Hud only puts a badge on the bar if the
  // art for one arrived, the card plates and hero busts because each HeroCard does the
  // same, the card frames because each card picks one by element as it is
  // built, and the hint hand because the Hand is built with the scene and reads
  // it to know which of the two hands it is showing, and the hint marks because
  // the Coach asks once per beat whether the painted set arrived and strokes its
  // own rings for the whole lesson if it has not.
  // Every bitmap is inlined in this file, so these are decodes, not downloads.
  await Promise.all([
    loadFonts(),
    loadArena(),
    loadGemArt(),
    loadBoardFrame(),
    loadBrandArt(),
    loadBossArt(),
    loadBossCrest(),
    loadFireArt(),
    loadSpellArt(),
    loadGemPopArt(),
    loadCardPlates(),
    loadCardFrames(),
    loadHeroAvatars(),
    loadHintHand(),
    loadHintMarks(),
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
  // Above the gems it draws on and below the hand that points at them.
  const coach = new Coach();
  const cutin = new CutIn();
  const endcard = new EndCard((source) => ctaClick(source));
  // The one line the creative shows before it is touched, over the fight rather
  // than in front of it — see ui/startprompt.js, and firstTouch below for what
  // actually takes the touch.
  const prompt = new StartPrompt();

  let director = null;
  const heroRow = new HeroRow((index) => {
    if (director) director.onCardTap(index);
  });

  world.addChild(
    bg,
    lavaMask,
    bossLayer,
    board,
    coach,
    heroRow,
    vfx,
    hud,
    hand,
  );
  overlay.addChild(cutin, endcard, prompt);

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
    coach,
    heroRow,
    hud,
    hand,
    vfx,
    cutin,
    endcard,
    prompt,
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
    coach.resize(layout);
    vfx.resize(layout);
    cutin.resize(layout);
    endcard.resize(layout);
    prompt.resize(layout);

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
   * gets. Whatever the intro asks for before that first touch is simply lost.
   *
   * The listening for that touch is installed at the top of boot rather than
   * here — see installAudioUnlock, and the note there on why a drag is the
   * hardest gesture in the world to hang an unlock on.
   */
  // The bed and the theme hang off the context actually opening rather than off
  // the gesture that opened it: resume() is a promise, and the handler that
  // called it is long gone by the time it settles. Both are subscriptions, not
  // one-shots — a context that had to be rebuilt starts them again.
  onAudioOpen(() => {
    bed.start();
    music.start();
  });
  // An ad scrolled off screen goes quiet rather than playing to an empty room.
  document.addEventListener("visibilitychange", () =>
    audioSleep(document.hidden),
  );

  /* ------------------------------------------------------------- shake */

  /** Starts the run without a finger — set by firstTouch, for __SIEGE__. */
  let begin = () => {};

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

  /* ------------------------------------------------------- the first touch */

  /**
   * The gesture the whole run hangs off, and the whole of how the
   * do-not-autostart rule is answered now.
   *
   * There was a screen here: a scrim over the arena, the wordmark, TAP TO
   * BEGIN, and the run behind a tap on it. It went because of what it cost —
   * a playable's first frame is the one moment it is guaranteed to be looked
   * at, and that one spent it on a title card. What the player saw first was
   * not the game.
   *
   * So the gate is a listener instead of a picture. The arena is assembled and
   * standing still from the first frame (see Director.armIntro), nothing in it
   * advances, and the first touch anywhere on the screen starts the fight. The
   * rule is kept exactly — nothing moves, no clock runs and no sound plays
   * until a person does something — and the screen it used to cost is back.
   *
   * On `window` in the capture phase rather than on a display object: an
   * invisible full-screen catcher in the overlay would be one more thing to
   * take down before the board underneath could be played, and would eat the
   * touch that took it down. Nothing here eats anything — Pixi routes the same
   * pointerdown to whatever is under it, which for the first frames is a board
   * that is deliberately not listening yet.
   *
   * `pointerdown` rather than a click, and `touchstart` and `mousedown`
   * beside it: a click is a press and a release, and on a board played by
   * dragging the release can land a whole swipe after the press. The two older
   * events are for the webviews that never got pointer events at all; whichever
   * arrives first wins and the rest are taken off.
   */
  function firstTouch() {
    const EVENTS = ["pointerdown", "touchstart", "mousedown"];
    return new Promise((resolve) => {
      const go = () => {
        EVENTS.forEach((type) => window.removeEventListener(type, go, true));
        resolve();
      };
      EVENTS.forEach((type) =>
        window.addEventListener(type, go, { capture: true, passive: true }),
      );
      // The one path in that is not a finger. See __SIEGE__ below.
      begin = go;
    });
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
    prompt.update(dt);
    updateShake(dt);
  });

  /* --------------------------------------------------------------- run */

  director = new Director(scene);
  scene.director = director;

  // QA handle: lets an automated pass drive real swaps and assert the combo
  // invariants from spec §5 without shipping any logging. `mute` is on it for
  // the networks that ask for a kill switch they can call. The run does not
  // start until something is touched, so a pass calls `__SIEGE__.begin()`
  // before it drives anything.
  scene.mute = setMuted;
  scene.begin = () => begin();
  window.__SIEGE__ = scene;

  // Nothing is held back and nothing is put in front: the first frame of the
  // creative is the fight, standing still, with one line of type over it asking
  // to be touched. See Director.armIntro and ui/startprompt.js.
  director.armIntro();

  signalReady();
  // And that is where it waits.
  //
  // Not on viewability, which is what used to release it — a slot reporting
  // itself viewable is not a person agreeing to be shown a monster, and every
  // network this ships to asks a playable not to start on its own. A touch is
  // both at once, so the viewability wait is gone rather than kept alongside:
  // it is the stricter of the two, and the thirty second clock now starts
  // on the same gesture the player starts the fight with.
  firstTouch().then(() => {
    prompt.dismiss();
    director.run();
  });
}

boot();
