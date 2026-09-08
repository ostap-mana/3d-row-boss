/**
 * ELEMENTAL SIEGE — playable ad entry point.
 *
 * Phone-first: no desktop layout, no keyboard, no network, and no audio until
 * the player touches the screen — see the audio section below. Boots, plays a
 * thirty second fight — T.hardCap, and every other number in config.js is
 * fitted to it — and hands the player to the store.
 */

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
import { reseed } from "./core/rng.js";
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
import { loadGemPopArt } from "./art/gempop.js";
import { HeroRow } from "./art/heroes.js";
import { Board } from "./game/board.js";
import { Director } from "./game/director.js";
import { Hud } from "./ui/hud.js";
import { Hand } from "./ui/hand.js";
import { Coach } from "./ui/coach.js";
import { Spotlight } from "./ui/spotlight.js";
import { EndCard } from "./ui/endcard.js";
import { FREEZE_LIFT, FREEZE_STEPS, OutcomeScreen } from "./ui/outcome.js";
import { StartPrompt } from "./ui/startprompt.js";
import { CutIn } from "./fx/cutin.js";
import { Vfx } from "./fx/vfx.js";
import { loadFonts } from "./ui/fonts.js";
import { ctaClick, signalReady } from "./net/cta.js";
import { mraidReport, watchSize, watchViewable } from "./net/mraid.js";
import {
  audioSleep,
  installAudioUnlock,
  onAudioOpen,
  setMuted,
} from "./audio/engine.js";
import { bed } from "./audio/sfx.js";
import { music } from "./audio/music.js";

/**
 * What boot spent, in milliseconds, for whoever asks — `__SIEGE__.timing`.
 *
 * Three numbers and one of them is the product: `ready` is how long a player
 * stares at a flat colour before the fight is on screen, and it is the only
 * figure on this page that a network's own bounce curve is measured against.
 * `deferred` is when the rest of the art finished arriving behind it, and the
 * gap between the two is the whole of what splitting the load bought. Kept
 * because it cannot be measured from here: the machine this is written on
 * decodes thirty megapixels in a blink and the phone it ships to does not.
 */
const timing = { essential: 0, ready: 0, deferred: 0 };

async function boot() {
  const bootStart = performance.now();
  const since = () => Math.round(performance.now() - bootStart);

  // Before a single await. The first touch can land while the fonts and the
  // fourteen bitmaps below are still decoding, and on a phone that first touch
  // is the one that owns the sound for the rest of the session.
  installAudioUnlock();

  const app = new Application();

  // Measured before the renderer is built, so the first frame is already the
  // right size on the right device rather than a phone-sized canvas that
  // corrects itself once a resize event turns up. See core/viewport.js — and
  // note there is no `resizeTo`: this file drives every resize, because Pixi's
  // own plugin only knows how to read `window.innerWidth`, which is the number
  // that is wrong on a phone.
  const first = measureViewport();

  await app.init({
    background: "#05030a",
    width: first.w,
    height: first.h,
    antialias: true,
    resolution: resolutionFor(first.w, first.h),
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
  //
  // What is *not* here is the other two thirds of the pixels — see loadRest()
  // at the foot of this file. The rule for which list a loader belongs in is
  // whether anything built below reads it as it is constructed: everything in
  // this one is grabbed at construction and a late arrival would be missed, and
  // everything in the other is asked for at the moment it is used and takes null
  // for an answer.
  await Promise.all([
    loadFonts(),
    loadArena(),
    loadGemArt(),
    loadBoardFrame(),
    loadBrandArt(),
    // The title band and the hairline the outcome card is framed with — the
    // game's own two sprites, see art/outcomeui.js. Decoded here rather than
    // when the fight ends because the card is built with the scene below and
    // reads both as it goes up, and because a verdict that arrives a frame after
    // the screen it belongs on is a verdict nobody sees land.
    loadOutcomeUi(),
    loadBossArt(),
    loadBossCrest(),
    loadGemPopArt(),
    loadCardPlates(),
    loadHeroAvatars(),
    loadHintHand(),
    loadHintMarks(),
    loadHpBarArt(),
    loadCardBars(),
    // Sixty-seven kilobytes and a megapixel and a half — six flipbooks, one
    // per element — and the only ones decoded here rather than in loadRest():
    // a hero can be dealt already charged, so the fire on his caption is art
    // the opening frame can need. See art/readyfx.js.
    loadReadyCrowns(),
  ]);
  timing.essential = since();
  initGemTextures(app.renderer);

  const host = document.getElementById("pixi-container") || document.body;
  host.appendChild(app.canvas);

  /* ------------------------------------------------------------- scene */

  // Everything inside `world` shakes together; overlays sit outside it.
  const world = new Container();
  const overlay = new Container();
  /**
   * The safe area, drawn.
   *
   * Off, always, until somebody asks for it — `__SIEGE__.safeZones(true)` in a
   * console, or on a phone over USB. It is here because a cutout is the one
   * thing in this layout that cannot be checked on the machine it is written
   * on: a desktop browser reports zero insets whatever it is told, a simulator
   * reports the right ones and paints its own notch over the answer, and the
   * device that actually has one is behind a cable with no inspector on it. So
   * the numbers the layout solved with are drawn as lines on the screen they
   * were solved for, and a row of hero cards on the wrong side of one is
   * visible from across the room.
   *
   * Above the overlay layer rather than inside the world, so it is over the end
   * card and the outcome band too — those are the two screens the insets were
   * being ignored on. See safeStage in core/layout.js.
   */
  const guides = new Graphics();
  guides.visible = false;
  guides.eventMode = "none";
  app.stage.addChild(world, overlay, guides);

  // Clip the boss at the lava line so it genuinely climbs out of the pool.
  // Outlives every rebuild — it is a shape, not a piece of the fight.
  const lavaMask = new Graphics();

  let director = null;

  /**
   * The cast of the fight, and the one handle everything in this file holds it
   * by.
   *
   * It used to be a dozen consts up here and a `scene` object built out of them
   * further down. The object is now the only copy: `relayout` and the ticker
   * read the board and the boss and the hud through it rather than through
   * bindings of their own, which is what lets `restart` throw the whole cast
   * away and build a second one without a single stale reference left pointing
   * at the first. The object's identity never changes, so the director's
   * `this.s` and the `__SIEGE__` handle both stay good across a rebuild.
   */
  const scene = { app, layout: null, shake, hitStop };

  /**
   * Build the fight — every time it is played.
   *
   * Called once at boot and once per RETRY. Nothing here is reset: the whole
   * cast is constructed from scratch, which is the only way to be sure the
   * second run is a second run rather than the first one with its numbers
   * pushed back. Boss health, hero health, ult charge, the doom clock, the
   * lesson's one-way doors, the obsidian on the board — all of it is state
   * spread across ten objects, and there is no reset() in the world that is
   * easier to keep honest than `new`.
   *
   * The old cast is removed rather than destroyed. Whatever the finished run
   * left in flight — a tween, an awaited delay, a promise nobody resolved —
   * lands on an orphan that is no longer drawn and no longer ticked, which is
   * silent. Destroying them instead would hand those same landings a corpse to
   * write to; the tween engine drops tweens on destroyed targets (see
   * core/tween.js) but the async chains in the director have no such guard.
   */
  function buildScene() {
    // Before the removal: a mask is an effect held by the thing it masks, and
    // leaving the old layer holding this one while the new layer takes it is
    // how a mask ends up belonging to a container nobody renders.
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
    // Above the gems it draws on — and above the hero row as well, because the
    // ult lesson puts its frame round a card. Below the hand that points at both.
    const coach = new Coach();
    // The dark the lesson is lit against — see ui/spotlight.js. Handed to the
    // coach rather than driven from here: the coach is what knows which cells a
    // pass is about, and it re-solves them every time the board moves under it.
    const spotlight = new Spotlight();
    coach.useSpotlight(spotlight);
    const cutin = new CutIn();
    /**
     * The fight's own verdict, and the screen the run ends on.
     *
     * Ahead of the end card in every sense: it is shown first — see
     * Director.finish — and it is added under it here, so the card's own fade-in
     * crosses over the top of it rather than cutting to it. See ui/outcome.js.
     *
     * All it is given is a way to photograph the fight, because that is all it
     * needs: it has no buttons on it, and leaving it is what its `show`
     * resolving means. A loss gets its rematch from the end card a beat later.
     */
    const outcome = new OutcomeScreen(freezeFight);
    // Two ways off this card: the store, and back into the fight. The second is
    // only offered on a wipe — see ui/endcard.js — and it is the only tap in the
    // creative that does not lead to a store page.
    const endcard = new EndCard(
      (source) => ctaClick(source),
      () => restart(),
    );
    // The one line the creative shows before it is touched, over the fight rather
    // than in front of it — see ui/startprompt.js, and firstTouch below for what
    // actually takes the touch.
    const prompt = new StartPrompt();

    const heroRow = new HeroRow((index) => {
      if (director) director.onCardTap(index);
    });

    // The scrim goes over the whole composition and the lesson goes over the
    // scrim. That order is the point of it: what dims is the arena, the board,
    // the party AND the chrome — the boss bar and the doom clock are as much of
    // what a first-timer is trying to read at once as the gems are — while the
    // marks, the prop and the cells they are about stay at full brightness. Put
    // it under the hud instead and the brightest thing on a dimmed screen is the
    // one surface the lesson is not talking about.
    //
    // Inside `world`, not the overlay, so it shakes with the board it is holed
    // over. See ui/spotlight.js.
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
    overlay.addChild(cutin, outcome, endcard, prompt);

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
      cutin,
      outcome,
      endcard,
      prompt,
    });
  }

  buildScene();

  /* ------------------------------------------------------------ layout */

  /**
   * Whether the whole screen is ours, with nobody drawing a close button over
   * the top of it.
   *
   * Three things have to be true at once, and the layout only spends the corner
   * it holds for that button when all three are.
   *
   * Fullscreen, because that is the one state in which the browser's own chrome
   * is gone as well and the corner is genuinely empty. Top-level, because a
   * frame inside a container never owns anything — and goFullscreen refuses to
   * ask in one, so this is belt and braces on a decision made there. And no
   * MRAID or DAPI object, because those are the two ways a network says "this
   * document is an ad and I am the app around it": a webview creative can be
   * the top-level document and still have a native close button painted over it
   * by the SDK, which no web API will ever tell us about.
   *
   * Read on every relayout rather than latched, because fullscreen is left as
   * well as entered — a back gesture, an Escape — and the corner has to come
   * back when it is.
   */
  function ownsScreen() {
    try {
      if (window.top !== window) return false;
      if (window.mraid || window.dapi) return false;
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    } catch {
      // A cross-origin `window.top` read throws, and a throw here means we are
      // in somebody else's page — which is the answer.
      return false;
    }
  }

  /**
   * The notch, the home indicator, and whatever else the device keeps for
   * itself, in CSS pixels.
   *
   * Measured off the probe in index.html rather than guessed — see
   * measureSafeInsets in core/viewport.js, which also maps the reading onto the
   * box we actually draw in. Handed straight through by the watcher on every
   * change; this path is for the one call that happens before the watcher is
   * built, and for a relayout that was asked for by something other than a
   * viewport change.
   */
  function safeInsets() {
    return measureSafeInsets(view);
  }

  /**
   * The box everything is solved in: the CSS pixels the host is pinned to.
   *
   * Not `app.screen`, which is the renderer's own idea of the same thing and is
   * a hair off it whenever the pixel ratio is fractional — the buffer is rounded
   * to whole device pixels and the screen is that rounded buffer divided by the
   * ratio again, so a 744 point tablet at 1.76x reports 744.2. Two tenths of a
   * point changes nothing anybody can see, but it is the renderer's rounding
   * error and it has no business being in the composition. See core/viewport.js.
   */
  let view = { w: first.w, h: first.h };
  let layout = computeLayout(view.w, view.h, safeInsets(), {
    owned: ownsScreen(),
  });

  /**
   * @param {{w:number,h:number,resolution:number}} [size] the measurement to
   *   lay out for. Omitted only by the first call below, which lays out for
   *   whatever the renderer was built with.
   */
  function relayout(size) {
    // Resolution and size in the one call, because they change together — a
    // window dragged onto a second monitor changes the ratio without changing a
    // single CSS pixel, and a rotation changes both — and because passing the
    // ratio here is what keeps it to one `resolutionChange` rather than the two
    // that setting the property separately would emit. `autoDensity` writes the
    // canvas' CSS box back to match, which is the box viewport.js has just
    // pinned the host to, so the two agree at every step rather than at rest.
    if (size) {
      app.renderer.resize(size.w, size.h, size.resolution);
      view = { w: size.w, h: size.h };
    }
    // The watcher's own reading, taken in the same frame as the size it came
    // with: the two move together on a rotation and on a fullscreen transition,
    // and a second measurement here would be a second, later answer to the same
    // question. See apply() in core/viewport.js.
    const safe = (size && size.safe) || safeInsets();
    layout = computeLayout(view.w, view.h, safe, { owned: ownsScreen() });
    scene.layout = layout;

    // Through `scene` and not through bindings of its own: the cast is rebuilt
    // on a RETRY and this has to lay out whichever one is currently on stage.
    scene.bg.resize(layout);
    scene.boss.resize(layout);
    scene.board.resize(layout);
    scene.heroRow.resize(layout);
    scene.hud.resize(layout);
    scene.hand.resize(layout);
    // Before the coach, which re-aims the hole off its own cells on the way
    // through — see Coach.resize — and needs the scrim already measured for the
    // screen it is going to be cut into.
    scene.spotlight.resize(layout);
    scene.coach.resize(layout);
    scene.vfx.resize(layout);
    scene.cutin.resize(layout);
    scene.outcome.resize(layout);
    scene.endcard.resize(layout);
    scene.prompt.resize(layout);

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

  /**
   * The guides, redrawn for whatever the layout just solved. See `guides`.
   *
   * Three boxes and the regions inside them: the window in grey, the stage the
   * composition is held to in amber, the safe box everything free-standing is
   * laid out in green, and then each region the solver returned so a collision
   * can be read off the screen rather than inferred from one. Nothing is drawn
   * at all while it is off, which is what makes it free to leave in.
   */
  function drawGuides() {
    guides.clear();
    if (!guides.visible) return;

    const line = (r, color, width) => {
      guides.rect(r.x, r.y, r.w, r.h);
      guides.stroke({ width, color, alpha: 0.9, alignment: 0.5 });
    };

    line({ x: 0, y: 0, w: layout.w, h: layout.h }, 0x8899aa, 1);
    line(layout.stage, 0xffaa22, 1.5);
    // The one that matters: past this line is a notch, a home indicator or a
    // gesture bar, and anything drawn over it is the bug this is looking for.
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

  // Every resize the device can produce, funnelled through one measurement.
  //
  // This was a `resize` and an `orientationchange` listener with a one-frame
  // delay on them, which covers a desktop window being dragged and misses a
  // URL bar retracting, a webview being resized by its host, a foldable being
  // opened, a tablet entering split view, and the last three quarters of a
  // rotation. The watcher fires for all of them and keeps firing until the size
  // it is given stops changing. See core/viewport.js.
  //
  // It calls back once during construction, which is the call that pins the
  // host and lays out for the settled size — so the relayout() above is only
  // ever laying out for the size the renderer was built with.
  const viewport = watchViewport(host, relayout);

  /**
   * And the same signal from the container, which does not always reach the
   * page as one.
   *
   * Every listener the watcher above installs is a page-level event. An SDK
   * that resizes the ad's frame natively — which is the whole reason MRAID has
   * a `sizeChange` at all — can change what the creative is being drawn into
   * without any of them firing, and a rotation on such a container would leave
   * the fight laid out for the orientation it left. See net/mraid.js.
   *
   * `refresh` and not a resize of its own: it starts the same settle loop
   * every other signal starts, so a container that announces the change and a
   * device that reports it arrive at one measurement rather than two.
   */
  watchSize(() => viewport.refresh());

  /**
   * And one more for fullscreen, on top of the settle the watcher starts for it.
   *
   * Entering fullscreen changes what the layout is *allowed* to use without
   * necessarily changing anything the watcher measures — the close button's
   * corner comes back to us the moment nobody else can draw in it, and on a
   * phone that can happen at exactly the same width, height, ratio and set of
   * insets. The watcher calls back only when its measurement moves, so the
   * transition is given a relayout of its own. See ownsScreen and CLOSE_KEEPOUT.
   */
  ["fullscreenchange", "webkitfullscreenchange"].forEach((type) =>
    document.addEventListener(type, () => relayout(), { passive: true }),
  );

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
  /**
   * The same thing again, from the container that does not use the document to
   * say it.
   *
   * Inside an ad SDK's webview the document is very often not hidden while the
   * ad is scrolled off a feed or the app is in the background — see
   * net/mraid.js. So the fight was played out to nobody and lost on their
   * behalf, and the first thing they saw on coming back was a defeat card for
   * a fight they never had.
   *
   * The clock is held rather than the audio alone, and holding it is the whole
   * point: the ticker is what drives the tweens, the cascade and the thirty
   * second doom clock, so stopping it parks the fight on the frame it was on
   * and starts it again from there. Only ever on the container's own word — a
   * start-up reading of `isViewable` is a guess, and an SDK that guesses wrong
   * once and never corrects itself would leave a creative frozen on its first
   * frame forever.
   */
  watchViewable((seen, live) => {
    audioSleep(!seen);
    if (!live) return;
    if (seen) app.ticker.start();
    else app.ticker.stop();
  });

  /* -------------------------------------------------------------- freeze */

  /**
   * A photograph of the fight, as it stands this instant.
   *
   * The outcome card is the frozen frame, blurred, with one word over it — see
   * ui/outcome.js — and this is the frozen frame. It lives here because it is
   * the only thing in the creative that needs both the renderer and the world
   * container, and both belong to this file.
   *
   * Halved FREEZE_STEPS times and then doubled FREEZE_LIFT times back up, and
   * that is how the blur is done: a pyramid, built out of one-off render
   * textures, with no shader passes and no per-frame cost at all. The way down
   * is the blur and the way back up is what stops it looking like a smashed
   * screenshot — see FREEZE_LIFT in ui/outcome.js, and the note there on why
   * there is no BlurFilter here.
   *
   * `world` and not `app.stage`, *and* the overlay taken off screen for the one
   * call: the overlay is where the card itself lives, along with the cut-in and
   * the start prompt, and a photograph with any of those in it is a photograph
   * of the wrong thing. Naming `world` as the target ought to be enough on its
   * own and measurably is not — a still taken during an ultimate came back with
   * the cut-in's frame across it — so the overlay is hidden rather than trusted
   * to be excluded. It goes back on the same synchronous line, so nothing is
   * ever drawn without it.
   *
   * Never throws. A renderer that will not hand over a render texture — an
   * ancient webview, a context that was lost a frame ago — gets a card with no
   * still behind it, which is the scrim and the band, and still says what
   * happened.
   *
   * @returns {import("pixi.js").Texture|null}
   */
  function freezeFight() {
    const made = [];
    const shown = overlay.visible;

    /**
     * One rung of the pyramid: the picture drawn at w by h and photographed
     * again. Used going down and coming back up — the pass is the same either
     * way, only the size it is handed differs.
     *
     * The scaled sprite goes in a container, and the container is what gets
     * photographed. That indirection is the whole of this working.
     *
     * A Sprite's own transform is not part of its local bounds, so a sprite
     * scaled to half size still measures a full texture, and generating from it
     * either re-renders it at full size or — with an explicit half-size `frame`
     * — crops the top-left quarter and throws the rest away. Three passes of
     * that is not a blur, it is a zoom: the first attempt at this came back as
     * the boss's corner badge stretched across the screen.
     *
     * A container's local bounds *do* include its children's transforms, so
     * this measures exactly w by h and needs no frame at all.
     */
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
      // The photograph itself, at the size it was taken.
      overlay.visible = false;
      let texture = app.renderer.generateTexture({
        target: world,
        frame: new Rectangle(0, 0, view.w, view.h),
        /**
         * The renderer's own resolution, so the still is the frame and not a
         * picture of it.
         *
         * This was pinned to 1, and the reason it was pinned is gone. It read:
         * left to the renderer's resolution the still comes out twice as big on
         * a retina phone as on a cheap one, so the blur — which is nothing but
         * how far it is upscaled again — would be half as strong on the sharper
         * screen. True, and it was the right pin while FREEZE_STEPS was 3.
         *
         * With the pyramid off, that pin is the only blur left on the card, and
         * it is one nobody chose: a still taken at one device pixel per CSS
         * pixel and drawn over a window rendered at two is a 2x bilinear stretch
         * with no downsample under it. On a DPR-1 device it was sharp; on every
         * phone this ships to it was soft, and soft by a different amount at
         * each ratio — the opposite of what the pin was for.
         *
         * At the renderer's resolution the texture is texel-for-pixel with the
         * frame it was taken from and there is no stretch at all. It costs a
         * full-screen texture at DPR instead of at 1 — the size of the
         * framebuffer, held for the life of the card.
         *
         * Put the 1 back with FREEZE_STEPS, not on its own: a pyramid wants a
         * pinned base so the blur is the same everywhere, and this wants the
         * renderer's when there is no pyramid.
         */
        resolution: app.renderer.resolution,
        antialias: false,
        textureSourceOptions: { scaleMode: "linear" },
      });
      overlay.visible = shown;
      made.push(texture);

      // Down first, halving FREEZE_STEPS times. Each pass draws the level above
      // it at half size, so every pixel of the result is the average of four of
      // the one before — a box pyramid, which is what makes this a blur rather
      // than a badly resampled screenshot. See FREEZE_STEPS.
      //
      // The size at the top of each rung is kept, so the way back up lands on
      // exactly the sizes the way down came off. Rounding to whole pixels twice
      // against two different divisions is how a picture ends up a pixel wider
      // than the thing it is supposed to line up with.
      const rungs = [];
      let w = view.w;
      let h = view.h;
      for (let i = 0; i < FREEZE_STEPS; i++) {
        rungs.push([w, h]);
        w = Math.max(2, Math.round(w / 2));
        h = Math.max(2, Math.round(h / 2));
        texture = resample(texture, w, h);
      }

      // And back up, FREEZE_LIFT of those halvings undone. Nothing is recovered
      // by this — the detail went at the bottom of the pyramid and is not coming
      // back — but each doubling is another tent filter over a picture that has
      // already had one, and that is the difference between a blur and a grid of
      // eighth-size squares with creases between them. See FREEZE_LIFT.
      const lift = Math.max(0, Math.min(FREEZE_LIFT, rungs.length));
      for (let i = 0; i < lift; i++) {
        const [rw, rh] = rungs[rungs.length - 1 - i];
        texture = resample(texture, rw, rh);
      }

      // Every level but the last is scaffolding: the card holds one texture and
      // the rest are render targets nobody will read again.
      made.slice(0, -1).forEach((t) => t.destroy(true));
      return texture;
    } catch {
      overlay.visible = shown;
      made.forEach((t) => {
        try {
          t.destroy(true);
        } catch {
          /* a texture that failed to build has nothing to free */
        }
      });
      return null;
    }
  }

  /* ------------------------------------------------------------- shake */

  /** Starts the run without a finger — set by firstTouch, for __SIEGE__. */
  let begin = () => {};

  /**
   * Rattle the camera.
   *
   * Translation, and nothing else. There was a version of this that rolled the
   * frame and pushed it in as well, and it went: a composition that tips and
   * zooms on every landing is a composition that never sits still, and a
   * layout whose edges move against the screen is the whole of what reads as
   * the picture swimming. So the world is moved and never deformed — `world.x`
   * and `world.y`, the same two numbers this file has always written, which is
   * also what keeps freezeFight's photograph square to the screen.
   *
   * Everything the shake gained is in *how* those two numbers move: a noise
   * with a body to it instead of a per-frame coin toss, a decay that arrives
   * at nothing flat, a direction taken off the blow that caused it, and an
   * amplitude measured in the layout's own scale rather than in raw points.
   *
   * @param {number} amount peak displacement in reference points — a 375 point
   *        phone's points, multiplied by `layout.ui` on the way in, so one call
   *        site reads the same on a phone and on a full-screen desktop
   * @param {number} duration seconds
   * @param {object} [opts] `axis` {x,y}: the direction the blow travelled, which
   *        the shake is then thrown mostly along rather than every way at once.
   *        `freq` scales the rumble's rate — under 1 for pressure that hums (a
   *        jet, a floor giving way), over 1 for something that snaps.
   */
  let shakeAmount = 0;
  let shakeLeft = 0;
  let shakeTotal = 0;
  /**
   * Seconds the noise has been running, and it never resets.
   *
   * Continuous across overlapping shakes on purpose: the rumble is sampled from
   * this, and restarting it at every call would put the frame back through the
   * same opening excursion each time — six landings in a cascade all kicking
   * the screen the same way, which reads as a pulse rather than as chaos.
   */
  let shakeT = 0;
  /** Unit vector the blow came down, or null for a shake with no direction. */
  let shakeAxis = null;
  /** Rate multiplier on the rumble — see rumble in core/juice.js. */
  let shakeFreq = 1;

  function shake(amount, duration, opts) {
    const o = opts || {};

    /**
     * Authored against the reference phone, drawn on whatever this turns out
     * to be.
     *
     * Every call site in the director names a displacement in points, and every
     * one of them was tuned on a 375 point screen where twenty points is a
     * twentieth of the width. Full-bleed on a 1920 point desktop — which is
     * what core/layout.js now lays out for — that same twenty points is a
     * hundredth, and a shake nobody can see is a shake that is not there. So
     * the amplitude is scaled by the one number that says how big this screen
     * is against the one it was drawn for.
     */
    const scaled = amount * (layout ? layout.ui : 1);

    // The loudest of whatever is overlapping decides the character, so a heavy
    // blow is never diluted by the taps landing beside it.
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
    // Never cut a shake short: a long rumble with a short tap inside it is the
    // rumble, and the old version handed the tap's duration to the amplitude of
    // the rumble and snapped the frame back mid-excursion.
    shakeLeft = Math.max(shakeLeft, duration);
    shakeTotal = Math.max(shakeTotal, shakeLeft);
  }

  /**
   * Runs on real time, not on the world clock — see core/juice.js.
   *
   * Which is the point of having both: a blow lands, the world freezes for
   * sixty milliseconds with the beam still in the air and the shards still
   * hanging, and the camera goes on rattling around all of it. Slowing the
   * shake down with everything else would throw away the one frame the freeze
   * exists to let the player look at.
   */
  function updateShake(dt) {
    if (shakeLeft <= 0) {
      // Guarded rather than written every frame: at rest this is the identity
      // transform, and an idle creative has no business touching the world's
      // position sixty times a second.
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
      // Thrown down the blow's own line, with a third of that loose across it:
      // a claw that came in from the left knocks the frame left, and a shake
      // that is purely one-dimensional reads as a slide rather than as a hit.
      const along = ox;
      const across = oy * 0.32;
      ox = shakeAxis.x * along - shakeAxis.y * across;
      oy = shakeAxis.y * along + shakeAxis.x * across;
    }

    world.x = ox * a;
    world.y = oy * a;
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
   * touch that took it down. Nothing here eats anything — passive, capturing,
   * and it stops nothing, so Pixi routes the very same pointerdown on to
   * whatever is under it. Which is the point: the board is listening from the
   * first frame (see Director.armIntro), so a first gesture that is a swipe on
   * the board starts the fight and makes the move, rather than starting the
   * fight and being thrown away.
   *
   * And a press is not yet the gesture — see firstTouch, which watches one from
   * the press to whatever it turns into. A finger resting on the glass while
   * the ad slides past, or a graze the system takes back as a scroll, is a
   * `pointerdown` like any other, and starting on that is a creative that
   * begins without anybody having asked it to. What starts the fight is a press
   * that is lifted or a press that is dragged into a swipe. `touchstart` and
   * `mousedown` are beside the pointer events for the webviews that never got
   * them, and whichever family finishes the gesture first wins.
   */
  /**
   * Take the whole screen, when taking it is ours to take.
   *
   * The composition is laid out for whatever box it is given and it fills that
   * box — see core/layout.js — so this is not about making the game fit. It is
   * about the box: a browser hands the page a window with a URL bar, a tab
   * strip and a taskbar around it, and on a desktop that is a third of the
   * screen spent on furniture around a fight.
   *
   * Two guards, and the first one is the one that matters.
   *
   * `window.top === window` — only when the creative is the page, never when it
   * is a frame inside somebody else's. Every ad network draws its own close
   * button over the creative and draws it in the host document; a frame that
   * puts itself fullscreen paints over that button, and a playable a person
   * cannot close is a playable that gets the whole account pulled. So in a
   * container this does nothing at all, on purpose, and the layout there was
   * already filling the frame it was given.
   *
   * And it is asked for once, inside the gesture. Fullscreen is gated on user
   * activation in every engine, so it cannot be requested at boot; it is
   * requested on the same touch that starts the fight, and if the engine says
   * no — iOS Safari says no for anything that is not a video, an embedded
   * webview says no, a permissions policy says no — nothing is reported and
   * nothing is retried. The fight has already started underneath it.
   *
   * The third guard is byFinger, and it is why this is no longer asked for on a
   * desktop: see below.
   */
  function goFullscreen() {
    try {
      if (window.top !== window) return;
      if (document.fullscreenElement || document.webkitFullscreenElement)
        return;
      const el = document.documentElement;
      const ask = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!ask) return;
      // `navigationUI` is a hint and not every engine takes it; the call is the
      // same call with or without it.
      const done = ask.call(el, { navigationUI: "hide" });
      // A rejected promise with no handler is an unhandled rejection, and a
      // creative must never throw — not even into the console.
      if (done && done.catch) done.catch(() => {});
    } catch {
      /* a browser that will not go fullscreen is a browser in a window */
    }
  }

  /**
   * Whether the gesture that started the fight was made with a finger.
   *
   * What the whole screen is worth depends entirely on the answer. On a phone
   * the furniture round the page is a URL bar that eats a tenth of the screen
   * and slides about while the board is being played, and taking the screen is
   * a straight win. On a desktop it is somebody's browser window: they have
   * other tabs, a second monitor, a video call on the other half of the screen
   * — and a page that throws itself into fullscreen the instant it is clicked,
   * with no button and no warning, is a page that has taken over the machine.
   * It also traps them: leaving is a keystroke nobody was told about.
   *
   * Read off the gesture rather than sniffed off the device, because the
   * gesture is the thing that actually answers the question. A touchscreen
   * laptop is a desktop until somebody taps it, and then it is not.
   *
   * `touchstart` is a finger by definition, `mousedown` never is, and
   * `pointerdown` says so itself — anything that is not a mouse is a finger or
   * a pen, and both of those are somebody holding the screen. No event at all
   * means nobody touched anything: that is `__SIEGE__.begin()`, which has
   * `__SIEGE__.fullscreen()` beside it for a pass that does want the screen.
   */
  function byFinger(e) {
    if (!e) return false;
    if (e.type === "touchstart") return true;
    if (e.type === "mousedown") return false;
    return e.pointerType !== "mouse";
  }

  /**
   * The gesture, watched from the press to whatever it turns into.
   *
   * A bare `pointerdown` used to be the whole of this, and the whole of what
   * was wrong with it: a press is not yet an interaction. A finger resting on
   * the glass while the ad slides up a feed is a press, and so is the graze the
   * system takes back a frame later as a scroll, an edge-swipe or a pull on the
   * notification shade. Every one of those arrives on this window as a
   * `pointerdown` like any other, and every one of them used to spend the
   * flash, the roar and the first second of the thirty on somebody who had not
   * decided to play anything. From the outside that is a creative that starts
   * on its own, which is the one thing the rule this function exists for
   * forbids.
   *
   * So a press only nominates itself, and the end of the gesture is what
   * decides:
   *
   *   - lifted — a tap, however long it took. Somebody put a finger on the
   *     screen and took it off again, and there is no reading of that which is
   *     not an answer to the line in the middle of it.
   *   - dragged past DRAG — a swipe, which on this screen is a move on the
   *     board. Taken the moment it passes the threshold rather than on the
   *     release, because the release of a swipe lands a whole gesture later and
   *     the fight has to be running underneath the swap it is about to collect.
   *     See Board.pendingMove and Director.armIntro.
   *   - cancelled — the system took the touch away to do something else with
   *     it. It was never a gesture on this creative, and it starts nothing.
   *
   * An untrusted event is dropped before any of that. A wrapper poking a
   * synthetic tap into the frame to check the creative is clickable is not a
   * player, and this rule is about a person.
   *
   * `pointer*` first with `touch*` and `mouse*` beside it, for the webviews
   * that never got pointer events at all: one press arms the candidate, every
   * duplicate of it is dropped by `from`, and whichever family finishes the
   * gesture first wins.
   */
  function firstTouch() {
    const DOWN = ["pointerdown", "touchstart", "mousedown"];
    const MOVE = ["pointermove", "touchmove", "mousemove"];
    const UP = ["pointerup", "touchend", "mouseup"];
    const CANCEL = ["pointercancel", "touchcancel"];
    const ALL = [...DOWN, ...MOVE, ...UP, ...CANCEL];
    /**
     * How far a press has to travel before it is read as a swipe, in CSS
     * pixels. The board's own swipe threshold is larger and this is not trying
     * to be it — all this has to clear is the wobble of a finger holding still.
     */
    const DRAG = 10;

    return new Promise((resolve) => {
      /** The live press: where it started, and whether a finger made it. */
      let from = null;
      let done = false;

      // A touch carries its point in a list and a mouse carries it on itself;
      // `changedTouches` is the one that is still populated on a touchend.
      const at = (e) => {
        const list = e.changedTouches || e.touches;
        const p = list && list.length ? list[0] : e;
        return { x: p.clientX || 0, y: p.clientY || 0 };
      };

      const commit = (finger) => {
        if (done) return;
        done = true;
        ALL.forEach((type) => window.removeEventListener(type, route, true));
        // Inside the handler and not in the `then` below: this is the frame the
        // gesture is live on, and the promise's continuation is a microtask
        // later — which most engines still honour and one or another of them
        // will not. A drag commits on a move rather than on a press, which
        // grants no activation of its own; the press it started with is still
        // inside its own window, and that is what this is spending.
        if (finger) goFullscreen();
        resolve();
      };

      const route = (e) => {
        // Not a person. See the header.
        if (e.isTrusted === false) return;
        if (DOWN.includes(e.type)) {
          // One press at a time. The same finger arrives here as a
          // `pointerdown` and again as a `touchstart`, and the second of those
          // is the first one over again rather than a second gesture.
          if (!from) from = { ...at(e), finger: byFinger(e) };
          return;
        }
        // Everything below is the end of a gesture, and there is no gesture.
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
      // The one path in that is not a finger. See __SIEGE__ below.
      begin = () => commit(false);
    });
  }

  /** Retires the listener a previous run armed, so a rematch arms exactly one. */
  let dropLessonExit = () => {};

  /**
   * How long after arming a press is still the press that armed it, in ms.
   *
   * A tap arrives as `touchstart`, `touchend`, and then — for anything still
   * listening for a mouse — a synthesised `mousedown` a few milliseconds behind
   * both. That third event is the same finger over again rather than a second
   * press, and without this it would take the lesson down before the board it
   * is drawn on had rendered a frame.
   */
  const EXIT_GRACE = 400;

  /**
   * The lesson comes off on the next press, wherever on the screen it lands.
   *
   * Director.spendOpeningHint is the one door out of the opening lesson and
   * everything that walked through it was a touch *on the board* —
   * Board.handleDown fires onInteract, and nothing outside the grid fires
   * anything. Which is correct for the hint itself and wrong for the scrim
   * underneath it: the dark is over the whole screen, so a player who answers
   * it by pressing the golem, a hero card, or the space beside the board has
   * made a gesture at a thing that is covering everything and watched nothing
   * happen.
   *
   * On a cold boot this is not armed at all, because the press that ends the
   * lesson is the press that starts the fight and that one is spent by hand —
   * see the firstTouch continuation at the bottom of this file. This is for the
   * rematch, which has no start gesture of its own: RETRY is the press, the run
   * is going by the time restart returns, and what is wanted is the press after
   * it. Hence EXIT_GRACE.
   *
   * Down events only, and untrusted ones dropped, for the same reasons
   * firstTouch has both: the up half of a press is not a new gesture, and a
   * wrapper's synthetic tap is not a person answering a hint.
   */
  function armLessonExit() {
    dropLessonExit();
    const DOWN = ["pointerdown", "touchstart", "mousedown"];
    const armed = performance.now();
    const press = (e) => {
      if (e.isTrusted === false) return;
      if (performance.now() - armed < EXIT_GRACE) return;
      dropLessonExit();
      // Read off the live `director` and not off a captured one: a rematch
      // builds a new one, and this is armed again beside it.
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

  /* -------------------------------------------------------------- loop */

  app.ticker.add((ticker) => {
    // Clamped so a backgrounded tab does not fast-forward the storyboard.
    const real = Math.min(ticker.deltaMS / 1000, 0.05);
    /**
     * The world's own clock, which is the real one except for the fraction of a
     * second after something lands. See core/juice.js.
     *
     * Two clocks rather than one because two things in here are not allowed to
     * be slowed down. The doom clock is a promise to the player about how long
     * they have and it is kept in seconds, so the director is ticked on real
     * time; and the camera shake is the thing the freeze exists to show off, so
     * it is ticked on real time as well.
     */
    const dt = warpDt(real);
    updateTweens(dt);
    // The doom clock runs on wall time, so the director needs the frame too.
    if (director) director.update(real);
    // Read off `scene` rather than off consts, so a rebuilt cast is the one
    // being ticked and the run before it stops moving the moment it is replaced.
    scene.bg.update(dt);
    scene.boss.update(dt);
    scene.board.update(dt);
    scene.heroRow.update(dt);
    scene.hud.update(dt);
    scene.spotlight.update(dt);
    scene.outcome.update(dt);
    scene.endcard.update(dt);
    scene.prompt.update(dt);
    updateShake(real);
  });

  /* ----------------------------------------------------------- the rematch */

  /**
   * RETRY, from the defeat card — a whole new fight, in place.
   *
   * A reload would be the short way to write this and it is the wrong one. The
   * creative ships as a single inlined HTML file (see vite-plugin-singlefile),
   * and half the networks it runs on hand that file to a webview by writing it
   * into a frame rather than by giving the frame a URL. `location.reload()` in
   * one of those reloads whatever the frame was *navigated* to, which is
   * nothing, and the retry button becomes a button that blanks the ad. So the
   * scene is rebuilt instead: same document, same renderer, same decoded
   * bitmaps, new everything else. See buildScene.
   *
   * The run starts immediately rather than behind the caption. The rule the
   * start prompt exists for is that the creative must not play itself, and the
   * tap on RETRY is exactly the gesture that rule asks for — making somebody
   * who just asked for another fight ask a second time is a gate, not a policy.
   * The caption buildScene puts back is hidden rather than dismissed — see
   * StartPrompt.hide, and note that a fade there would flash it over the roar.
   *
   * The sound comes back with it: `finish` stopped the lava bed and crossed the
   * music over to the lobby cut for the card, and both belong to the card that
   * is now gone.
   */
  function restart() {
    // Whatever the last frame of the old fight was holding, let go of it: a
    // rematch that opens on a frame still thrown off centre by the blow that
    // ended the first one is a rematch that opens crooked.
    clearStop();
    shakeLeft = 0;
    shakeTotal = 0;
    shakeAmount = 0;
    shakeAxis = null;
    shakeFreq = 1;
    world.x = 0;
    world.y = 0;

    // A new board for a new run. The Board constructor deals its grid out of
    // the RNG, so this has to land before buildScene and not after it.
    reseed();
    buildScene();
    // A freshly built caption is a visible one, and this run does not want it.
    scene.prompt.hide();
    relayout();

    bed.start();
    music.start();

    director = new Director(scene);
    scene.director = director;
    director.armIntro();
    // A rematch deals a new board and arms the lesson again, so the way out of
    // it is armed again too. RETRY is this run's start gesture and it is
    // already spent, so what takes the dark off here is the press after it —
    // see armLessonExit, which is the whole reason that helper exists.
    armLessonExit();
    director.run();
  }

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
  // For a QA pass driving the creative without a finger: the first touch is
  // where this normally happens, and `begin()` is not a touch. See goFullscreen.
  scene.fullscreen = goFullscreen;
  /**
   * Show the layout's own working — the insets it measured and the boxes it
   * solved. `__SIEGE__.safeZones()` toggles, `safeZones(true)` forces it on.
   * Hands back the insets it is currently drawing, which is the number worth
   * reading off a device on its own. See `guides` and drawGuides.
   */
  scene.safeZones = (on) => {
    guides.visible = on === undefined ? !guides.visible : !!on;
    drawGuides();
    return { ...layout.safe, shown: guides.visible };
  };
  scene.timing = timing;
  // What the wrapper is saying, for a pass reading it off a real device. See
  // mraidReport — undefined everywhere the creative is not inside a container.
  scene.mraid = mraidReport;
  window.__SIEGE__ = scene;

  // Nothing is held back and nothing is put in front: the first frame of the
  // creative is the fight, standing still, with one line of type over it asking
  // to be touched. See Director.armIntro and ui/startprompt.js.
  director.armIntro();

  /**
   * The art the first frame does not need, decoded once the first frame is up.
   *
   * Thirty megapixels used to go through the main thread before anything was
   * drawn — a hundred and twenty megabytes of RGBA, on a phone, between the file
   * being parsed and the golem being on screen. Sixteen of those thirty are the
   * twelve ult border sheets, and none of it can be wanted in the first seconds
   * of the fight: a hero has to charge before a border can play, a match has to
   * land before a spell can be thrown, and the boss has to reach for his fire.
   *
   * The reason this is safe is *when* it runs, not that it runs late. It runs in
   * the window between the first frame and the player's first touch, which is
   * dead time by construction: nothing moves until `firstTouch` resolves, the
   * doom clock has not started, and the board is standing still under a caption
   * asking to be tapped. And it runs a sheet to a frame rather than all of them
   * to one task, so even a player who taps instantly gets long frames rather
   * than a stall. See core/idle.js.
   *
   * Not awaited, and every loader in it is written to be missable: the pieces
   * that grab their art at construction are all in the list above, and these
   * three are asked for at the moment they are used — `spellFrames` and
   * `fireFrames` each answer null and each has a fallback behind it. The ult
   * sheets are the one exception, because a card builds its border sprite in its
   * constructor, so the row is told to pick them up. See HeroCard.adoptUltArt.
   *
   * The hint marks used to be in here too. They came out because the lesson does
   * not wait for this window — the opening hint is on the creative's very first
   * frame, cold, and the marks were the *last* decode in this list, behind the
   * ult sheets — so the one pass every impression is guaranteed to see was the
   * one pass drawn in the fallback: stroked rings and a plain white dart, on a
   * board whose every other mark comes in the element's colour. The painted set
   * is twelve small files, so it is now awaited with the hand it points beside.
   */
  async function loadRest() {
    // Two frames rather than one: the first gets us past the frame this task is
    // already inside, and the second past the render that frame schedules — so
    // the first decode lands after the composition has actually been painted
    // rather than in the middle of painting it.
    await nextFrame();
    await nextFrame();

    // Heaviest first. Each of these paces itself internally, so the order is
    // about which fallback is retired soonest rather than about the frame
    // budget — and the border is both the biggest and the one with a hand-off
    // at the end of it.
    try {
      await loadUltBorders();
      // Both ends of the tap's hand-off: the six cards, and the panel the
      // cut-in throws up in their place. Each is a card that built its border
      // sprite before the sheets existed.
      scene.heroRow.adoptUltArt();
      scene.cutin.adoptUltArt();
    } catch {
      /* every card keeps the border it was built without */
    }
    for (const load of [loadSpellArt, loadFireArt]) {
      try {
        await load();
      } catch {
        /* that effect keeps the fallback it already draws */
      }
    }
    timing.deferred = since();
  }

  // Fired, not awaited: boot is done, and this is what happens in the quiet
  // after it.
  // Stamped on the frame after boot returns, which is the first one the
  // composition is actually painted on — the number a bounce curve is measured
  // against, rather than the moment the last decode resolved.
  nextFrame().then(() => {
    timing.ready = since();
  });

  loadRest();

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
    scene.prompt.dismiss();
    // The dark goes with the caption, on the very gesture that starts the
    // fight. The scrim is laid over the whole screen, so a press anywhere on
    // the glass *is* a press on it — asking for a second one would be asking
    // the player to answer the same dark twice. What is left after this is the
    // lesson's own marks on their own clock: the hand comes back over the board
    // with the idle hint, without a screen of dark behind it.
    director.spendOpeningHint();
    director.run();
  });
}

boot();
