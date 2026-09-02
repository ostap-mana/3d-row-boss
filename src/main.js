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
  measureViewport,
  resolutionFor,
  watchViewport,
} from "./core/viewport.js";
import { setApp } from "./core/context.js";
import { updateTweens } from "./core/tween.js";
import { reseed } from "./core/rng.js";
import { initGemTextures, loadGemArt } from "./art/gems.js";
import { Background, loadArena } from "./art/background.js";
import { loadCardPlates } from "./art/plates.js";
import { loadCardFrame } from "./art/cardframe.js";
import { loadUltBorders } from "./art/ultborder.js";
import { loadBoardFrame } from "./art/boardframe.js";
import { loadBrandArt } from "./art/brand.js";
import { loadOutcomeUi } from "./art/outcomeui.js";
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
import { Spotlight } from "./ui/spotlight.js";
import { EndCard } from "./ui/endcard.js";
import { FREEZE_STEPS, OutcomeScreen } from "./ui/outcome.js";
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
    loadFireArt(),
    loadSpellArt(),
    loadGemPopArt(),
    loadCardPlates(),
    loadCardFrame(),
    // The animated border a charged card wears. Here rather than lazily on the
    // first hero to fill, because that hero fills mid-fight: six sheets decoding
    // while the board is cascading is a hitch on the one beat that has to land.
    loadUltBorders(),
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
  const scene = { app, layout: null, shake };

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
  let layout = computeLayout(view.w, view.h, safeInsets());

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
    layout = computeLayout(view.w, view.h, safeInsets());
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
  watchViewport(host, relayout);

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

  /* -------------------------------------------------------------- freeze */

  /**
   * A photograph of the fight, as it stands this instant.
   *
   * The outcome card is the frozen frame, blurred, with one word over it — see
   * ui/outcome.js — and this is the frozen frame. It lives here because it is
   * the only thing in the creative that needs both the renderer and the world
   * container, and both belong to this file.
   *
   * Halved FREEZE_STEPS times rather than taken at full size, and that is how
   * the blur is done: a forty-nine pixel wide still drawn back across a phone is
   * a gaussian blur that costs four one-off textures and no shader passes at
   * all. See the note in ui/outcome.js on why there is no BlurFilter here.
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
    try {
      // The photograph itself, at the size it was taken.
      overlay.visible = false;
      let texture = app.renderer.generateTexture({
        target: world,
        frame: new Rectangle(0, 0, view.w, view.h),
        // One device pixel per CSS pixel, and the same on every pass below.
        // Left to the renderer's own resolution the still would come out twice
        // as big on a retina phone as on a cheap one, and the blur — which is
        // nothing but how far this is upscaled again — would be half as strong
        // on the device with the sharper screen. Pinned, every phone gets the
        // same picture.
        resolution: 1,
        antialias: false,
        textureSourceOptions: { scaleMode: "linear" },
      });
      overlay.visible = shown;
      made.push(texture);

      // And then halved, FREEZE_STEPS times. Each pass draws the level above it
      // at half size, so every pixel of the result is the average of four of the
      // one before — a box pyramid, which is what makes this a blur rather than
      // a badly resampled screenshot. See FREEZE_STEPS.
      let w = view.w;
      let h = view.h;
      for (let i = 0; i < FREEZE_STEPS; i++) {
        w = Math.max(2, Math.round(w / 2));
        h = Math.max(2, Math.round(h / 2));

        /**
         * The scaled sprite goes in a container, and the container is what gets
         * photographed. That indirection is the whole of this loop working.
         *
         * A Sprite's own transform is not part of its local bounds, so a sprite
         * scaled to half size still measures a full texture, and generating from
         * it either re-renders it at full size or — with an explicit half-size
         * `frame` — crops the top-left quarter and throws the rest away. Three
         * passes of that is not a blur, it is a zoom: the first attempt at this
         * came back as the boss's corner badge stretched across the screen.
         *
         * A container's local bounds *do* include its children's transforms, so
         * this measures exactly w by h and needs no frame at all.
         */
        const holder = new Container();
        const step = new Sprite(texture);
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
        texture = next;
      }

      // Every level but the last is scaffolding: the card holds one texture and
      // the other three are render targets nobody will read again.
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
   * touch that took it down. Nothing here eats anything — passive, capturing,
   * and it stops nothing, so Pixi routes the very same pointerdown on to
   * whatever is under it. Which is the point: the board is listening from the
   * first frame (see Director.armIntro), so a first gesture that is a swipe on
   * the board starts the fight and makes the move, rather than starting the
   * fight and being thrown away.
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
    // Read off `scene` rather than off consts, so a rebuilt cast is the one
    // being ticked and the run before it stops moving the moment it is replaced.
    scene.bg.update(dt);
    scene.boss.update(dt);
    scene.board.updateLocks(dt);
    scene.heroRow.update(dt);
    scene.hud.update(dt);
    scene.spotlight.update(dt);
    scene.outcome.update(dt);
    scene.endcard.update(dt);
    scene.prompt.update(dt);
    updateShake(dt);
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
    scene.prompt.dismiss();
    director.run();
  });
}

boot();
