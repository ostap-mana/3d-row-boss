/**
 * The director owns the fight.
 *
 * It used to own a storyboard: boss health stepped down an authored ladder,
 * every accepted match advanced the story exactly one step, and the climax
 * landed on schedule no matter what the player did. None of that survives here.
 *
 * What replaced it:
 *   - damage is earned per gem, multiplied by how deep the cascade ran;
 *   - every match is a volley from the whole roster, not one hero picked by
 *     whichever colour came up — see partyVolley;
 *   - the boss answers every move, and every answer hits harder than the last;
 *   - it answers on its own track, alongside the player rather than in front of
 *     them: no attack of its own ever takes the board out of their hands;
 *   - heroes die, and every hero lost takes a share off every match that
 *     follows, so a bad run compounds instead of flatlining;
 *   - a doom clock runs the whole fight, and when it expires the boss lands one
 *     cataclysm on the entire party — and every one after it arrives sooner and
 *     hits harder than the one before;
 *   - the boss armours up as its health falls, so the last third of the bar is
 *     the expensive third and the fight ends on its hardest beat instead of its
 *     easiest.
 *
 * The creative can now be lost, and losing is the default outcome for anybody
 * clearing whichever match happens to be nearest. That is the point of it.
 */

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
  OBSIDIAN,
  ROWS,
  SCRIPTED_HINT,
  T,
  ULT_HEAL_FLOOR,
  ULT_HEAL_TO,
  WATER,
} from "../config.js";
import { MIN_SWAPS } from "./board.js";
import { delay, now, tween } from "../core/tween.js";
import { rndInt } from "../core/rng.js";
import * as sfx from "../audio/sfx.js";
import { music } from "../audio/music.js";

/**
 * How far below the best score a cell can be and still get picked.
 *
 * Wide enough that the wave lands somewhere different every run, tight enough
 * that it never throws a block into a corner nobody cared about.
 */
const OBSIDIAN_SLACK = 7;

/**
 * How many of the player's best moves the boss rolls between when it picks one
 * to bury. Two: your best idea and your second best, and you do not get to know
 * which one it is going to take.
 */
const OPTIONS_IN_PLAY = 2;

/**
 * The longest the hard cap will hold for an ending that had already started
 * when it fired.
 *
 * Both endings are bounded a long way under this — see win and lose, whose
 * every wait is a fixed delay or a capped bossSettled — so it is a stop rather
 * than a schedule: the number exists so nothing can hold the end card open
 * forever, not because anything is expected to reach it.
 */
const ENDING_GRACE = 4.0;

/**
 * How often the ult lesson looks up from what it is doing — see teachUlt.
 *
 * Its window is a fixed span of seconds, but the thing it is pointing at can
 * stop being worth pointing at inside that: the hero is spent, or the boss
 * knocks them down. Waiting the span out in one delay would leave a frame round
 * a card nobody can tap; a fifth of a second is shorter than one beat of the
 * demo and costs five reads of two fields.
 */
const ULT_TICK = 0.2;

export class Director {
  constructor(scene) {
    this.s = scene;
    this.ended = false;
    this.outcome = null;

    /** Real boss health, 1..0. Nothing authors this any more. */
    this.bossHp = 1;
    /**
     * What this fight has actually been paying per move, for the autoplay pace
     * guard to plan against — see autoDelay.
     *
     * Measured rather than assumed. Damage comes out of combo depth, run size,
     * how much of the party is still standing and how much armour is up, so what
     * a move is worth is a property of the fight in progress and not something
     * that can be read off DIFFICULTY.
     */
    this.movesPlayed = 0;
    this.damageDealt = 0;
    /** Boss turns taken — drives both the attack rotation and its ramp. */
    this.turn = 0;
    /**
     * Armour layers the boss has already put up — see DIFFICULTY.armor.
     *
     * Only ever climbs. Nothing in this fight heals the boss, so a bar knocked
     * past a threshold has passed it for good, and the counter exists purely so
     * the callout fires once per layer rather than once per cascade step.
     */
    this.phase = 0;
    /**
     * Game-clock reading at the first playable frame — see armDoom, which sets
     * it, and pace(), which is the only thing that reads it.
     *
     * Not now() at construction: construction is boot, and the fight does not
     * start until somebody touches the screen — the schedule pace() measures
     * against is the fight's, not the app's. The two used to be a couple of
     * seconds apart on top of that, because the intro was awaited before the
     * first turn; it is not any more (see intro), so what is left between them
     * is however long the creative sat there being looked at.
     */
    this.fightStart = 0;
    /** Cataclysms already landed. Each one is worse, and closer, than the last. */
    this.doomCount = 0;
    /** Tides already spent — each refills the party less. DIFFICULTY.healDecay. */
    this.healsUsed = 0;

    this.idleToken = 0;
    /**
     * The one hint the creative gives. `openingSpent` is the whole of its
     * lifetime rule: armed until the player touches the board, then never
     * again — not paused, not re-armed, gone. `openingLive` is whether the
     * hand is demonstrating right now, which is what refreshHint needs to know
     * before it re-points at a moved board.
     */
    this.openingToken = 0;
    this.openingSpent = false;
    this.openingLive = false;
    /**
     * Whether a lesson — either one — is on screen this instant.
     *
     * Read by refreshHint, which is the one caller that has to tell "the board
     * moved under a hint nobody is watching" from "the board moved under a hand
     * somebody is watching right now". The first waits its turn; the second is
     * re-aimed on the spot, because a player following a hand has already been
     * made to wait for it once.
     */
    this.lessonLive = false;
    /**
     * The other lesson — the frame round a charged hero and the hand tapping
     * it. See teachUlt.
     *
     * `ultLive` is whether it owns the screen, and while it does the board's
     * own hint stands down entirely: both are drawn by the same Coach and
     * pointed by the same Hand, and there is one of each. `ultTaught` is the
     * one-way door the first tap on any card shuts — the same rule the board
     * lesson keeps in `openingSpent` — and `ultShows` caps how many times it
     * may be put in front of somebody who keeps ignoring it.
     */
    this.ultToken = 0;
    this.ultLive = false;
    this.ultTaught = false;
    this.ultShows = 0;
    this.moveToken = 0;
    this.ultResolver = null;
    this.ultQueued = false;
    /** Which hero the pending ultimate belongs to — any of them can be spent. */
    this.ultHero = HEALER;
    /**
     * Raised by the tap that spends a hero, dropped once that ultimate has
     * finished resolving. While it is up the party cannot be hurt — see
     * strikeHeroes for what that is buying and what it deliberately does not
     * cover.
     */
    this.ultCasting = false;
    /**
     * The fight's clocks, held while an ultimate is being cast.
     *
     * `clockHeld` is how many seconds have been taken off the bill so far and
     * `clockHoldAt` is when the current hold started, or 0 for a clock that is
     * running. Everything the player is charged for by wall time — the
     * cataclysm's fuse and the boss's rage ramp — goes through elapsed()
     * rather than now(). See holdClock.
     */
    this.clockHeld = 0;
    this.clockHoldAt = 0;
    this.doomResolver = null;
    /** Pulls the player's turn out of the air when the fight is already over. */
    this.stopResolver = null;

    /** Tail of the boss's track, and how many beats are on it. See queueBoss. */
    this.bossTrack = null;
    this.bossQueued = 0;

    /**
     * Set by the first touch on the board. The game will not play a move for
     * anyone who has shown up — see armAutoPlay().
     */
    this.playerActed = false;

    /** Token for the boss's own clock — see armBossPress. */
    this.pressToken = 0;

    this.doomArmed = false;
    this.doomFiring = false;
    this.doomLeft = DOOM.seconds;
    this.doomTotal = DOOM.seconds;
    this.doomWarned = [];

    scene.debug = this;

    const { board, vfx, hud, hand } = scene;
    board.onPop = (x, y, type) => {
      // The sparks first and the painted mark over them. `pop` returns false
      // until its sheet exists, which is the whole of the fallback: the burst
      // is what a cleared gem always was and it is still what carries the beat.
      vfx.burst(x, y, GEM_COLORS[type], 5, 0.9);
      vfx.pop(x, y, GEM_COLORS[type], board.cell * 1.6);
    };
    board.onShatter = (x, y) => {
      vfx.burst(x, y, OBSIDIAN.seam, 10, 1.4);
      vfx.ring(x, y, OBSIDIAN.seamHot, 150, 6);
      scene.shake(7, 0.22);
    };
    board.onShuffle = () => {
      // Held for the whole tell-slide-settle beat rather than half of it: the
      // banner is the only thing on screen that names what is happening, and
      // one that clears while the stones are still moving explains nothing.
      hud.shout(COPY.shuffle, 0.75, { fill: 0xc9b6ff, from: 1.3 });
      // No refreshHint here on purpose: this fires before the stones have
      // moved, so the board it would solve is the one about to be thrown away.
      // dropObsidian and eruptObsidian re-point the hand after lockCells has
      // been all the way through ensurePlayable, which is the correct moment.
    };
    // A rejected swap gets no buzzer and no red flash: the nudge and the stones
    // coming back is the whole of the answer. The lesson is not put back on the
    // clock with it — a swap cannot bounce until the player has touched the
    // board, and the touch that let them try is what spent it.
    board.onInvalid = () => {
      this.restartIdle(true);
    };
    board.onInteract = () => {
      this.playerActed = true;
      // A finger on the glass ends the lesson, and ends it for good. It used
      // to only step aside: the rule was that comprehension is a move landing
      // rather than a touch, so a tap on nothing or a swap that bounced put
      // the hand back on its one second timer. The rule reads well and plays
      // badly — a first-timer's opening gesture is exactly a tap on nothing,
      // so the prop kept coming back over the board they were already trying
      // to play, between every fumbled swipe. See spendOpeningHint.
      this.spendOpeningHint();
      this.restartIdle();
    };

    /**
     * The player's own swipe wears the hand — when the prop is wired up at all.
     *
     * The board reports the touch in its own pixels and the hand lives beside it
     * in the world, so every point is offset by where the board is sitting —
     * the same conversion pointHand does for the demo.
     *
     * Letting go re-arms the idle rather than leaving the hand off: the timer
     * that would have brought it back was restarted by `onInteract` at the top
     * of the touch, and on a press that turns out to be a tap on nothing, that
     * is the only thing that ever asks for it again.
     *
     * With T.touchHand off the prop is not wired up at all. Gating it here
     * rather than inside Hand keeps the two jobs on separate switches: T.hints
     * decides whether anything ever points at a move, this decides whether the
     * hand rides a swipe the player is already making.
     */
    if (T.touchHand) {
      board.onTouchStart = (x, y) => {
        // The gem actually under the finger, so the prop riding the player's own
        // swipe is the colour of what they picked up. cellAt can answer null on
        // a press inside the board's frame and typeAt answers -1 for a cell the
        // boss has encased; setElement takes both and reaches for the neutral
        // hand, which is what a touch on nothing should look like anyway.
        const cell = board.cellAt(x, y);
        hand.setElement(cell ? board.typeAt(cell.r, cell.c) : -1);
        hand.grab(board.x + x, board.y + y);
      };
      board.onTouchMove = (x, y) => hand.dragTo(board.x + x, board.y + y);
    }
    board.onTouchEnd = () => {
      // A no-op unless T.touchHand put the prop on the finger to begin with.
      hand.letGo();
      // The lesson is not re-armed here either: onInteract spent it when this
      // touch began.
      this.restartIdle();
    };
  }

  /* ------------------------------------------------------------------ run */

  async run() {
    // Which of the two won matters now. The fight resolving is a fight that
    // reached its own ending; the clock resolving is a fight that did not, and
    // that one has an ending of its own to play — see `timeUp`.
    const fight = this.playFight();
    const capped = await Promise.race([
      fight.then(() => false),
      delay(T.hardCap).then(() => true),
    ]);
    if (capped && this.verdict()) {
      // The cap is a deadline on the fight, not on its ending. A boss who went
      // down at twenty-nine seconds has a death already playing, and cutting to
      // the card over it is the clock arguing with the fight it just watched.
      // Raced against ENDING_GRACE all the same.
      await Promise.race([fight, delay(ENDING_GRACE)]);
    } else if (capped) {
      await this.timeUp();
    }
    await this.finish();
  }

  /**
   * The clock ran out with the boss still standing.
   *
   * This used to be nothing at all: the race resolved, `finish` set the end
   * card, and a creative that had spent thirty seconds telling the player
   * a cataclysm was coming simply stopped one frame later. The one mechanic the
   * whole mode is built on had never fired, because with DOOM.seconds equal to
   * the runtime the clock can never reach zero inside it, and the ending was a
   * cut rather than an ending.
   *
   * So the deadline collects. The boss casts, the party goes down to a man, and
   * the card that follows says what happened. It is the same castDoom every
   * turn of the fight could have met — same shout, same roar, same rolling wave
   * down the row — with the damage taken off the ramp and set to lethal: this
   * one is not a beat the party can be healed through, it is the thing the timer
   * was counting to.
   *
   * The clock is driven to zero before the cast rather than left where the cap
   * caught it, because a strip reading five seconds under a cataclysm landing is
   * the creative disagreeing with itself in the last two seconds anybody watches.
   *
   * Runs after T.hardCap rather than inside it, so the deliverable is thirty
   * seconds of fight and then this. Everything in it is already bounded — see
   * bossSettled, which will wait 0.8s for an in-flight swing and no longer.
   */
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

  /**
   * The fight loop — the player's half of it.
   *
   * A while loop rather than the old fixed march through MOVE_KIND: the number
   * of moves is no longer decided in advance by anybody, and neither is who
   * walks away from it.
   *
   * It does not wait for the boss any more. The counterattack used to be awaited
   * right here, which meant a second and a half per move where the board was
   * dead in the player's hands and every swipe was thrown away — the boss
   * animating was the boss taking the turn away. It goes on its own track now
   * (see queueBoss) and this loop goes straight back to listening.
   */
  async playFight() {
    await this.intro();
    if (this.ended) return;
    this.armDoom();

    while (!this.ended) {
      // One place decides how this fight ends, and it reads a verdict claimed
      // where the damage actually landed rather than two independent polls that
      // could both come back true on the same frame. See claim.
      const called = this.verdict();
      if (called) return called === "victory" ? this.win() : this.lose();
      if (this.doomDue()) this.castDoomSoon();

      const action = await this.playerTurn();
      if (this.ended) return;

      // A move actually made — a swap that matched, or a hero spent. A player
      // who got here spent the lesson on the touch that started the move, so
      // this is ordinarily a no-op; it is kept for the one path that reaches a
      // move without a touch, which is T.autoPlay driving the board itself.
      if (action === "swap" || action === "ult") this.spendOpeningHint();

      // A boss beat ended the fight while the player was still holding their
      // move. The checks at the top of the loop are what act on it.
      if (action === "wiped") continue;
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
      // Back to the top rather than straight into win(): the cascade that just
      // resolved may have been running alongside a swing that emptied the row,
      // and the verdict up there is what says which of the two got there first.
      // It is also what stops a boss turn being queued into an ending.
      if (this.verdict()) continue;

      this.queueBoss(() => this.bossTurn());
    }
  }

  partyWiped() {
    return this.s.heroRow.aliveCount() === 0;
  }

  /**
   * Whether the fight has already been called.
   *
   * `ended` is the end card's flag and is only raised in `finish`, which is two
   * animations and several seconds after the fight is actually over. Every
   * clock still running in that window — the boss's track, the cascade the
   * player is holding, the cataclysm — has to stand down at the verdict rather
   * than at the card, or it goes on dealing damage into an ending that has
   * already been decided. Which is what it used to do: a swing in the air when
   * the boss went down landed anyway, and the party died inside its own
   * victory.
   */
  settled() {
    return this.ended || !!this.outcome;
  }

  /**
   * Call the fight, once.
   *
   * There is no draw in this mode, and the reason there looked like one is that
   * both endings were read at the top of the fight loop — long after both
   * conditions had become true. A boss swing and a cascade land on the same
   * frame often enough: the row emptied inside the same beat that took the last
   * of the boss's health, and whichever branch happened to be checked first
   * played its ending over a screen showing the other one.
   *
   * So the verdict is claimed at the point of damage, and the first claim is
   * final. Everything behind it reads `settled` and stops — including the half
   * of the fight that was about to win it.
   *
   * @param {"victory"|"defeat"} kind
   * @returns {boolean} whether this is the call that decided it
   */
  claim(kind) {
    if (this.outcome) return false;
    this.outcome = kind;
    // The clock is part of what has to stand down: a cataclysm queued on the
    // frame the boss died is the same bug wearing a different coat.
    this.doomArmed = false;
    return true;
  }

  /**
   * The verdict, for the paths that arrive without having gone through a hit —
   * the hard cap, a turn boundary, a wipe that landed between beats.
   *
   * Reads the claim first, so a fight that was already called stays called
   * whatever the board looks like by the time anybody asks.
   */
  verdict() {
    if (this.outcome) return this.outcome;
    if (this.bossHp <= 0) this.claim("victory");
    else if (this.partyWiped()) this.claim("defeat");
    return this.outcome;
  }

  /* ------------------------------------------------------------ escalation */

  /**
   * How far through the fight the player is, 0 to 1 — the x axis of
   * DIFFICULTY.curve.
   *
   * The clock, and not the boss's health, and that choice is the one thing here
   * worth arguing about, so here is the argument.
   *
   * Health is the obvious axis and it was the first one tried. It does not
   * work, and it fails for a measurable reason rather than a matter of taste:
   * damage in this game lands in lumps far bigger than a shelf. A five-cell
   * step is worth about a third of the boss's bar on its own — five gems at
   * DIFFICULTY.damagePerGem through sizeBonus 1.9 — a run is six or seven moves
   * end to end, and progress therefore arrives in jumps of 0.15 to 0.35.
   * Simulated on health, an ordinary fight went from a 0.89 swing at the first
   * boss turn to a 1.55 swing at the second: the whole middle of the staircase
   * was stepped over without ever being played. A shelf nobody stands on is not
   * a shelf, and a curve whose shelves all get skipped is the smooth
   * exponential it was written to replace, wearing a table.
   *
   * The clock advances at a fixed rate whatever the board does, so every shelf
   * is stood on for a known number of seconds by every player alike — which is
   * also what lets the widths in curve.steps be argued in boss swings instead
   * of in vibes. And the health bar is not left out of it: the pace guard holds
   * the bar to a straight line against this same schedule (DIFFICULTY.pace,
   * whose `seconds` is deliberately kept level with the curve's), so a player
   * standing on the second shelf is a player with roughly half a boss left. The
   * two readings agree — this is the one that is smooth.
   *
   * What it costs is the fast player's early kill: somebody who empties the bar
   * at fifteen seconds meets one announced wall instead of two. They won, well
   * inside a thirty second creative, which is not a case worth bending the
   * shape of the fight for.
   *
   * On elapsed() rather than now(), for the same reason rage() is: seconds
   * spent inside an ultimate are seconds nobody could have played in, and
   * charging for them would make spending a hero the one move in the fight that
   * escalated the boss. See holdClock.
   */
  progress() {
    const curve = DIFFICULTY.curve;
    const secs = curve && curve.seconds ? curve.seconds : 0;
    if (secs <= 0) return 0;
    const spent = Math.max(0, this.elapsed() - this.fightStart);
    return Math.max(0, Math.min(1, spent / secs));
  }

  /**
   * The other axis: how much of the boss is gone. Read by exactly one column of
   * the curve — `resist` — and here is why that column is special.
   *
   * Everything else on the staircase is the boss getting angrier, which is a
   * function of how long the fight has run. `resist` is the boss's hide, which
   * is a function of how chewed up the boss is, and reading it off the clock
   * turns out to be actively unfair rather than merely inaccurate.
   *
   * Measured, because it was written the other way first and the simulation
   * caught it: on the clock, a weak player's win rate fell from 92% to 59%,
   * every lost run a timeout. The reason is that the hide arrives on a schedule
   * they are not on. A player who has taken a third of the bar in twenty
   * seconds meets MOLTEN CORE's half-damage anyway, and spends the rest of the
   * creative watching a health bar that has stopped moving — which is the exact
   * "my best result was 1% of the boss's HP" the last round of feedback was
   * about, rebuilt out of new parts.
   *
   * On health it cannot happen by construction: armour is something the player
   * damaged the boss into putting up, so it is only ever met by somebody who
   * earned it. The pace guard is the piece that handles the opposite case — a
   * player running ahead of schedule — and it only ever bites when they are
   * ahead. Between them nothing punishes being behind.
   *
   * The lumpiness that ruled health out for the attack column does not matter
   * here. `resist` is sampled on every cascade step rather than once every four
   * seconds, and what the player reads off it is a rate, not a value — how fast
   * the bar is moving, integrated over the whole fight. Shelves in this column
   * do not need two equal samples in a row to land.
   */
  wounds() {
    return Math.max(0, Math.min(1, 1 - this.bossHp));
  }

  /**
   * Read one column of DIFFICULTY.curve at the fight's current progress,
   * interpolated between the keyframes either side of it.
   *
   * Linear and nothing cleverer on purpose: the table *is* the drawing, so two
   * keyframes with equal values have to come out as a dead-flat shelf and two
   * with different ones as a straight climb. Smoothing between them would round
   * the corners off the one feature the shape exists for — the moment the floor
   * drops.
   *
   * @param {string} field one of attack, resist, obsidian, hold
   * @param {number} p where to read it — progress() for every column except
   *   resist, which is read at wounds(). See both for why there are two axes.
   * @param {number} fallback returned when the curve is off or empty
   */
  curveAt(field, p, fallback) {
    const curve = DIFFICULTY.curve;
    if (!curve || !curve.enabled) return fallback;
    const steps = curve.steps || [];
    if (!steps.length) return fallback;

    // Before the first keyframe and after the last, the curve holds its ends
    // rather than extrapolating off them.
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

  /**
   * How many of DIFFICULTY.armor's layers the boss is currently wearing.
   *
   * The table is ordered deepest first, so this is just how many thresholds the
   * health bar has fallen under: 0 while the boss is above the shallowest one,
   * DIFFICULTY.armor.length once it is inside the last.
   */
  armorDepth() {
    const layers = DIFFICULTY.armor || [];
    let depth = 0;
    layers.forEach((layer) => {
      if (this.bossHp <= layer.below) depth++;
    });
    return depth;
  }

  /**
   * The fraction of any damage aimed at the boss that actually lands.
   *
   * This is the fight's progression curve, and it runs the opposite way to the
   * player's: the party gets weaker as heroes fall (HeroRow.partyPower) while
   * the boss gets tougher as its bar empties. The last stretch of health is the
   * expensive stretch — which is the one thing the old constant-rate bar could
   * never say, and the reason a match that felt decisive on move one is only a
   * chip on move seven.
   *
   * The `resist` column of DIFFICULTY.curve, so the hide thickens in the same
   * rise-and-shelf pattern as everything else: it ramps over the tenth of the
   * fight after an announced wall goes up, then holds dead flat until the next
   * one. What the player sees is a bar that slows sharply on the beat the boss
   * roared and then falls at a rate they can plan around — instead of one that
   * quietly changed gear at a health threshold they had no way to know about.
   * DIFFICULTY.armor is still here and still read when the curve is off.
   */
  armor() {
    const curve = DIFFICULTY.curve;
    if (curve && curve.enabled) return this.curveAt("resist", this.wounds(), 1);
    const layers = DIFFICULTY.armor || [];
    const depth = this.armorDepth();
    return depth === 0 ? 1 : layers[layers.length - depth].mult;
  }

  /**
   * How much of a hit the boss shrugs off for being ahead of the clock.
   *
   * This one is a pace guard and not a piece of fiction, so it is worth being
   * blunt about what it does: it reads how far the health bar is ahead of a
   * straight line from full at the first playable frame to empty at
   * DIFFICULTY.pace.seconds, and takes damage away from a player who is beating
   * that line. Nothing is ever given back — a player behind the line is not
   * helped, and `expected` past zero holds nothing at all, so the last stretch
   * before the deadline is fought at full strength.
   *
   * It exists because time-to-kill and damage-per-move are not the same dial
   * and only one of them was ever asked for. The fight is over in
   * moves x seconds-per-move, and seconds-per-move belongs to the player: the
   * author of this build swipes one every 1.9 seconds and finished in 15, an
   * ordinary player takes 3.2 and finishes in 24, off the exact same numbers.
   * Any damage figure that stretches the first one to 25 seconds needs twelve
   * moves, and twelve moves is thirty-eight seconds for the second one — a
   * fight nobody but the author can finish. That is not a number that exists;
   * it is two requirements pulling opposite ways, and this is the join.
   *
   * `bite` is how sharply it answers: the shortfall is raised to that power, so
   * a bar a tenth ahead of schedule is barely touched and one running at double
   * pace is roughly quartered. `floor` is the least that ever lands, and it is
   * a floor rather than a stop on purpose — a bar that freezes under a direct
   * hit reads as a broken game, where one that crawls reads as a boss digging
   * in. Set `enabled` false and the fight goes straight back to being decided
   * by DIFFICULTY.damagePerGem alone, which is a legitimate build to ship; it
   * is simply one that ends when the player is good rather than when the
   * creative is over.
   */
  pace() {
    const guard = DIFFICULTY.pace;
    if (!guard || !guard.enabled) return 1;
    // The one wall-clock reader deliberately left un-held during an ultimate —
    // see holdClock. Time only ever loosens this guard's grip, so taking the
    // cast's seconds off the bill here would be charging the player for it, not
    // sparing them: the fuse and the rage ramp are the two that bill.
    const expected = Math.max(0, 1 - (now() - this.fightStart) / guard.seconds);
    // Behind the line, or past the end of it: the boss holds nothing back.
    if (expected <= 0 || this.bossHp >= expected) return 1;
    return Math.max(guard.floor, Math.pow(this.bossHp / expected, guard.bite));
  }

  /**
   * Everything standing between one hit and the health bar: the hide the boss
   * has grown, and the grip it keeps on a player who is ahead of the clock.
   *
   * Every point of damage in the fight goes through here — the volley and the
   * ultimate both — because a route that skipped it would immediately become
   * the only move worth making.
   */
  resistance() {
    return this.armor() * this.pace();
  }

  /**
   * Announce a layer the boss just put up — once, on the hit that broke it.
   *
   * Armour the player cannot see is indistinguishable from a bug. A bar that
   * quietly starts falling slower reads as the game cheating unless something
   * on screen says otherwise, so the golem visibly enrages and the layer shouts
   * its own name at the moment it comes up.
   */
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
    this.s.vfx.flash(0xff2a06, 0.3, 0.4);
    this.s.hud.shout(layer, 0.55, { fill: 0xff8a3d, from: 2 });
  }

  /**
   * How many announced rises the fight has already crossed.
   *
   * Off the curve's named keyframes when the curve is on, off the armour table
   * when it is not, so `phase` counts the same thing either way: walls the
   * player has been told about, only ever climbing. Nothing in this fight walks
   * progress backwards — the health bar never refills and the clock never runs
   * back — but the counter is one-way regardless, because its job is to fire
   * each callout exactly once and not once per cascade step.
   */
  curveDepth() {
    const curve = DIFFICULTY.curve;
    if (!curve || !curve.enabled) return this.armorDepth();
    const p = this.progress();
    let depth = 0;
    (curve.steps || []).forEach((step) => {
      if (step.name && p >= step.p) depth++;
    });
    return depth;
  }

  /** The name of the `depth`th announced rise, or null if there isn't one. */
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

  /**
   * Everything the boss throws, multiplied by how long it has been throwing it.
   *
   * Wall clock rather than turns, because DIFFICULTY.bossRamp already charges
   * for taking many moves and this is the other half of the bill: a player who
   * spends eight seconds hunting the perfect swap pays for the eight seconds.
   * Capped by rageMax so a fight that somehow reaches the hard cap ends in a
   * wipe rather than in an arithmetic accident.
   *
   * On elapsed() rather than now(): the seconds inside an ultimate are seconds
   * nobody could have hunted a swap in, and charging for them made spending a
   * hero the one move in the fight that armed the boss. See holdClock.
   */
  rage() {
    const per = DIFFICULTY.ragePerSecond || 0;
    const cap =
      DIFFICULTY.rageMax === undefined ? Infinity : DIFFICULTY.rageMax;
    return Math.min(cap, 1 + this.elapsed() * per);
  }

  /**
   * How far the tide refills the party this time.
   *
   * Weaker with every cast, floored by ULT_HEAL_FLOOR. A heal as good on its
   * third use as its first is an unlimited supply of second chances, and a
   * fight with unlimited second chances has no ending worth watching.
   */
  healTo() {
    return Math.max(
      ULT_HEAL_FLOOR,
      ULT_HEAL_TO - this.healsUsed * (DIFFICULTY.healDecay || 0),
    );
  }

  /* ------------------------------------------------------------ boss track */

  /**
   * Put one boss beat — a counterattack, the cataclysm — on the boss's track.
   *
   * The track is the whole point of the split: it runs alongside the player
   * instead of in front of them, so the board stays live for every frame of it.
   * Beats are serialized against each other, because two attacks playing at once
   * is not a fight, it is a mess.
   *
   * Never more than one waiting behind the one in flight. A player fast enough
   * to finish two moves inside a single swing outruns the boss, and that is the
   * right answer — a queue that grew would land turn three's lava somewhere in
   * the middle of turn five, long after the board it was aimed at was gone.
   *
   * @returns {boolean} whether the beat was taken
   */
  queueBoss(job) {
    if (this.bossQueued >= 2 || this.settled()) return false;
    this.bossQueued++;
    this.bossTrack = (this.bossTrack || Promise.resolve())
      .then(() => (this.settled() ? undefined : job()))
      .catch(() => {})
      .then(() => {
        this.bossQueued--;
        // A swing that emptied the row has to reach the player's turn, which
        // is otherwise parked waiting for a swipe that will never come. Same
        // for any verdict claimed on this track: the turn it interrupts is a
        // turn nobody was ever going to take.
        if (this.settled() || this.partyWiped()) this.interrupt("wiped");
      });
    return true;
  }

  /**
   * Settles once the boss's track is empty — or after `cap` seconds, whichever
   * lands first. The finale is allowed to interrupt a swing; it is not allowed
   * to stand around waiting for one.
   */
  bossSettled(cap) {
    if (!this.bossTrack) return Promise.resolve();
    return Promise.race([this.bossTrack, delay(cap === undefined ? 0.8 : cap)]);
  }

  /** End the player's turn from outside it. */
  interrupt(action) {
    const resolve = this.stopResolver;
    this.stopResolver = null;
    if (resolve) resolve(action);
  }

  /* ---------------------------------------------------------------- intro */

  /**
   * The pose the creative holds until somebody touches the screen.
   *
   * Which is the fight, standing still. The golem is up in the ruins, the board
   * is dealt, the party is on its feet and the bar is full — the first frame
   * drawn is the game, and there is nothing in front of it and nothing missing
   * from it. Three things have stood here and two of them are gone: a gate
   * screen with the wordmark on it, then one line of type over an emptied
   * arena. Both were a frame spent on something that was not the game.
   *
   * Nothing in it advances. Every clock in the creative — the cataclysm, the
   * boss's own turn timer, the auto-hint, the CTA banner — is armed from
   * Director.run, and run is what the touch starts. What does move is the arena
   * itself: the braziers, the drifting embers, the light. So the frame is alive
   * without anything in the fight having happened, which is exactly the line
   * the do-not-autostart rule draws.
   *
   * Two things are held back rather than shown, because both would be lying:
   */
  armIntro() {
    const { boss, board, heroRow, hud } = this.s;

    // Unless the entrance is switched back on, in which case it wants the same
    // empty stage it always did. See T.entrance for why it is off, and note
    // that this is `visible` rather than a position: a rotation before the
    // touch runs the whole relayout, and that puts every one of these back
    // exactly where it belongs.
    if (T.entrance) {
      boss.visible = false;
      board.visible = false;
      heroRow.visible = false;
      hud.alpha = 0;
      // A board nobody can see is a board nobody can swipe, and a hand
      // pointing into an empty arena teaches nothing. Both come on when the
      // entrance puts the board on screen — see intro().
      board.lockInput();
      hud.hideDoom();
      return;
    }

    // The board is playable, and it is playable now.
    //
    // It used to be locked here — nothing was waiting on a move, so nothing
    // took one — which made the one line of type over it a gate after all.
    // A first-timer's opening gesture on a match-3 board is a swipe on the
    // board, and that swipe was thrown away: it started the fight, and then
    // they had to make it again. The caption asks to be touched and the board
    // is what they touch, so the board answers.
    //
    // Nothing autostarts because of this. The grid moves when a finger moves
    // it and not before, no clock is running and no sound is playing — the
    // rule is about the creative playing itself, and a board that sits still
    // until it is swiped is the player playing it. `armInput` takes the touch
    // with no turn behind it; Board.pendingMove is where the swap waits for
    // the fight to start and collect it, which is the same touch.
    board.armInput();

    // And the lesson, on the same clock it has always been on, from the frame
    // the creative is first looked at rather than from the frame after the
    // roar. The hand is the one thing on screen that says what the board is
    // for, and holding it behind the touch showed it to nobody who needed it —
    // whoever hesitated over the caption is exactly who it was written for.
    // Spent for good by the first finger on the glass, as it always was. See
    // spendOpeningHint.
    this.idleHint = this.currentHint();
    this.armOpeningHint();

    // The doom strip, which would otherwise sit over the fight reading
    // CATACLYSM against a clock that has not started counting. armDoom puts it
    // back on the frame it starts.
    hud.hideDoom();
  }

  async intro() {
    const { boss, board, heroRow, hud, vfx, shake, layout } = this.s;

    /**
     * Everything arrives on the same frame, and leaves on the same one.
     *
     * Spec §3 puts the whole opening in one beat — "Бос вилазить з лави, рев,
     * екран трясе. Дошка з'їжджає знизу", 0.0–1.2s. The rise used to be awaited
     * before any of the rest started, which spent the first second on an arena
     * with nothing in it but the boss, and made the board read as a second
     * event arriving after him instead of as part of the same shot.
     *
     * Starting them together fixed half of that and left the other half: they
     * all set off at zero and then finished in four instalments — the party at
     * 0.35, the HUD at 0.4, the board at 0.55, the boss four tenths behind the
     * last of them — so the shot still resolved as a queue, only a queue that
     * had started tidily. Four things landing one after another is four events,
     * whichever end of them is lined up.
     *
     * So all four are handed T.introIn and nothing else. One duration, four
     * curves: the boss eases up out of the pool, the board overshoots its rail,
     * the party lifts and fades, the HUD comes on flat — every one of them is
     * moving on the first frame of the shot and still moving on the last. There
     * is exactly one number behind the opening now, and it lives in config.js.
     */
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
      // The ground settles when they do: the shake decays linearly over its own
      // length, so given the same one it reaches zero on the frame the last
      // mover stops. It ran 0.6 and left three tenths of a still arena with the
      // boss still climbing through it.
      shake(6, T.introIn);

      await Promise.all([rising, entering]);
      // The board has arrived, so it can be played and the lesson has
      // something to point at. Off the touch for everyone else — see armIntro,
      // which is where this lives when the entrance is off, which it is.
      board.armInput();
      this.idleHint = this.currentHint();
      this.armOpeningHint();
    }

    // The flash, and with the entrance off it is the first frame of the whole
    // creative that moves. It used to punctuate the arrival — it sat at 0.55,
    // the frame the board came to rest on, and then moved onto the frame all
    // four movers landed on together. There is no arrival left to punctuate, so
    // what it punctuates now is the touch: the answer starts on the same frame
    // the finger lands, which is the one thing this beat has to get right.
    vfx.flash(0xff7a1a, 0.28, 0.45);

    // And the roar, on a screen that has been assembled since the first frame —
    // so the shake it carries reads against the board and the row rather than
    // against an empty arena, which is what it was written to do and never
    // quite got to.
    const roaring = boss.roar();
    shake(14, 0.5);

    // Not awaited. The roar is a second of monster, and a second of monster
    // that the fight waits behind is a second the board is dead in the
    // player's hands — the touch that started the run lands on a grid, the
    // grid says no, and the creative has answered its own invitation with a
    // wait. It plays over the top of the first turn instead: the shout and the
    // banner clock still hang off it finishing, because both of those are
    // talking about a fight that by then is already being played.
    roaring.then(() => {
      if (this.ended) return;
      // Banner clock starts once the player can actually act.
      this.startBannerTimer();
      hud.shout(COPY.tutorial, COPY.tutorialHold);
    });
  }

  startBannerTimer() {
    delay(T.banner).then(() => {
      if (!this.ended) this.s.hud.showBanner();
    });
  }

  /* ----------------------------------------------------------- the clock */

  /**
   * Stop the fight's clocks.
   *
   * An ultimate is the one stretch of the fight the player is not playing: the
   * board is locked, the cut-in owns the screen and there is no swap to be
   * found for two and a half seconds. A clock that kept counting through that
   * billed them for watching the thing they had just spent a full bar to earn
   * — the ultimate quietly cost a tenth of the cataclysm's fuse and left the
   * boss hitting harder afterwards for having been cast at all.
   *
   * So the fuse and the rage ramp are held, not just the damage. Nested holds
   * are ignored rather than counted: one cast can only stop the clock once.
   */
  holdClock() {
    if (this.clockHoldAt) return;
    this.clockHoldAt = now();
    // Stopping the count is not the same as looking stopped. The strip's sheen
    // and its panic throb run off the HUD's own frame clock, so without this
    // the fuse froze at a number while a highlight went on sweeping over it —
    // which is the clock still moving as far as anybody watching is concerned.
    this.s.hud.holdDoom(true);
  }

  /** Start them again, with the held stretch taken off the bill for good. */
  releaseClock() {
    if (!this.clockHoldAt) return;
    this.clockHeld += now() - this.clockHoldAt;
    this.clockHoldAt = 0;
    this.s.hud.holdDoom(false);
  }

  /**
   * Wall time the fight is allowed to charge the player for.
   *
   * The game clock minus every second spent inside an ultimate, including the
   * one currently running, so a reading taken mid-cast is the same reading it
   * would give on either side of it.
   */
  elapsed() {
    const holding = this.clockHoldAt ? now() - this.clockHoldAt : 0;
    return now() - this.clockHeld - holding;
  }

  /**
   * Raise or drop the cast shield.
   *
   * The clocks ride on the same flag as the party's immortality because both
   * protect the same thing — the window between the tap that commits the bar
   * and the last frame of the blast it pays for. Every path that drops the
   * shield goes through here, so the fight can never be left with a clock that
   * has stopped for an ultimate that finished.
   */
  setCasting(on) {
    this.ultCasting = on;
    if (on) this.holdClock();
    else this.releaseClock();
  }

  /** Start the countdown, the moment the player can actually act on it. */
  armDoom() {
    this.fightStart = now();
    this.doomArmed = true;
    this.doomLeft = DOOM.seconds;
    this.doomTotal = DOOM.seconds;
    this.doomWarned = [];
    this.s.hud.setDoom(this.doomLeft, this.doomTotal);
  }

  /**
   * Ticked from the main loop.
   *
   * The clock runs on wall time, not on turns: standing still thinking is the
   * expensive thing, which is exactly the pressure the mode is missing without
   * it. It is only *read* at turn boundaries, so a cataclysm never lands in the
   * middle of a cascade animation and steps on it.
   */
  update(dt) {
    if (!this.doomArmed || this.ended || this.doomFiring) return;

    // Held for an ultimate: the fuse stops where it is, the strip holds the
    // number it was showing, and the room stops tightening. See holdClock.
    if (this.clockHoldAt) return;

    // The staircase walks forward on the clock as well as on damage (see
    // progress), so a rise can come due on a frame where nothing was hit. Every
    // other caller of this is a damage path; without one here the player who is
    // losing — the one who most needs the warning — is the only one who never
    // gets it.
    this.checkPhase();

    if (this.doomLeft > 0) {
      this.doomLeft = Math.max(0, this.doomLeft - dt);
      this.s.hud.setDoom(this.doomLeft, this.doomTotal);
      // The room tightens with the clock — the one thing in the mix that says
      // something the screen has not already said.
      sfx.bed.setTension(1 - this.doomLeft / this.doomTotal);
      // Same number to the arrangement: the strings open up, the shaker comes
      // in and the mix leans forward. See music.setTension.
      music.setTension(1 - this.doomLeft / this.doomTotal);

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

    // Keeps ringing rather than firing once: the boss's track can be full at
    // the moment the clock runs out, and an expired clock that had already
    // spent its one notification would leave the cataclysm owed forever.
    if (this.doomLeft <= 0 && this.doomResolver) {
      const resolve = this.doomResolver;
      this.doomResolver = null;
      resolve("doom");
    }
  }

  doomDue() {
    return this.doomArmed && this.doomLeft <= 0 && !this.doomFiring;
  }

  /**
   * Hand the cataclysm to the boss's track.
   *
   * `doomFiring` is raised here rather than inside castDoom, and only if the
   * track took the beat: the clock stays at zero until the cataclysm has landed
   * and rearmed it, so without the flag the loop would queue a second one on
   * every pass through it.
   */
  castDoomSoon() {
    if (this.doomFiring) return;
    this.doomFiring = this.queueBoss(() => this.castDoom());
  }

  /**
   * The cataclysm.
   *
   * One hit, the whole party, big enough that a healthy roster survives it with
   * a sliver and a chewed-up one does not. Surviving restarts a much shorter
   * clock — the boss does not get tired, and the fight has to end.
   *
   * It used to open by taking the board away and dropping whatever swap the
   * player was in the middle of. It does not touch the board at all now: the
   * cataclysm is the loudest thing in the fight and it still does not get to be
   * the thing that stops the player playing.
   */
  async castDoom(lethal) {
    const { boss, hud, vfx, shake, layout } = this.s;

    sfx.doomCast();
    hud.shout(COPY.doomCast, 0.6, { fill: 0xff2f1a, from: 2.8 });
    boss.enrage();
    hud.enrage();
    shake(18, 0.5);
    await boss.roar();
    if (this.settled()) return;

    const impact = boss.impactPoint();
    vfx.shock(impact.x, impact.y, 0xff2a06, {
      size: layout.stage.w * 2.4,
      width: 18,
    });
    vfx.shock(impact.x, impact.y, 0xffd35a, {
      size: layout.stage.w * 1.4,
      width: 10,
      duration: 0.45,
    });
    vfx.flash(0xff2a06, 0.85, 0.7);
    shake(30, 0.9);

    const row = layout.cards;
    const rolling = vfx.wave(impact.y, row.y + row.h * 0.5, 0xff3a06, {
      thickness: row.h * 2.2,
      duration: 0.32,
    });

    await delay(0.2);
    if (this.settled()) return;

    const falling = this.strikeHeroes({
      targets: "all",
      // Every cataclysm after the first lands harder than the one before it —
      // except the one the clock itself casts, which is not a beat to be
      // survived. Past a full bar rather than exactly one, so a hero the tide
      // topped up on the way in goes down with everybody else. See timeUp.
      damage: lethal
        ? 1.2
        : DOOM.damage * Math.pow(DOOM.damageRamp || 1, this.doomCount),
      // ...and it is the one hit an ultimate in flight does not shield against,
      // for the same reason. timeUp goes straight to lose() whatever this cast
      // does, so a cataclysm that bounced off a shield would buy nothing but a
      // party dying on full bars.
      unstoppable: lethal,
    });
    await Promise.all([rolling, falling]);
    this.doomCount++;
    // The last hero went down, or the fight was called out from under the cast:
    // either way the clock has nothing left to count to.
    if (this.settled() || this.partyWiped()) {
      this.doomFiring = false;
      return;
    }

    // Held the line — and the reprieve is shorter every time, so surviving one
    // cataclysm buys strictly less than surviving the last one did. This is the
    // squeeze the whole mode ends on: eventually the fuse is shorter than the
    // time it takes to arm the tide, and the only way out is a dead boss.
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

  /* ----------------------------------------------------------- player turn */

  /**
   * Wait for the player to do something.
   *
   * Four ways out: they swap, they spend a charged hero, the clock beats them to
   * it, or the boss's track ends the fight under them. Whichever lands first,
   * the rest stop listening.
   *
   * @returns {Promise<"swap"|"ult"|"doom"|"wiped">}
   */
  async playerTurn() {
    const board = this.s.board;

    // A tap that arrived while the boss was mid-animation still counts.
    if (this.ultQueued && this.canUlt(this.ultHero)) {
      this.ultQueued = false;
      return "ult";
    }
    // Queued against a hero who is no longer spendable — they went down while
    // the boss was still animating. The ultimate is gone, and the shield the
    // tap raised goes with it rather than standing over a cast that will never
    // happen.
    this.ultQueued = false;
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
    return action;
  }

  /** Any charged hero who is still standing can be spent, not just Arissa. */
  canUlt(index) {
    const card = this.s.heroRow.cards[index];
    return !!card && card.ready && !card.downed;
  }

  /** Called by the hero row when a card is tapped. */
  onCardTap(index) {
    if (this.ended) return;
    this.playerActed = true;
    // A tap on a hero card is somebody playing, whether or not that card turned
    // out to be spendable, so it retires the lesson exactly as a touch on the
    // board does. See spendOpeningHint.
    this.spendOpeningHint();
    // And it ends the other lesson on the same rule and just as permanently:
    // whoever has tapped a card has found the row, which is the whole of what
    // teachUlt exists to tell them. Set before the card is checked for
    // spendability, exactly as the line above is — a tap on a hero who is not
    // charged is still somebody who knows the cards are there.
    this.ultTaught = true;
    this.endUltLesson();
    if (!this.canUlt(index)) {
      // That hero is not charged, or is down: no penalty, and nothing to say.
      this.restartIdle();
      return;
    }
    this.ultHero = index;
    // Immortal — and off the clock — from the tap, not from the first frame of
    // the cut-in. The two can be a whole cascade apart: a tap that lands
    // mid-resolve has no resolver to wake and is parked in ultQueued until the
    // next pass through playerTurn, and the boss's track is running for every
    // frame of that gap.
    // The player has committed the bar; the commitment is what is protected.
    this.setCasting(true);
    const resolve = this.ultResolver;
    this.ultResolver = null;
    if (resolve) resolve("ult");
    else this.ultQueued = true;
  }

  /* --------------------------------------------------------------- damage */

  /**
   * What one cascade step is worth.
   *
   * Per gem, so a four-in-a-row genuinely beats a three; times the cascade
   * multiplier, so setting up a chain is the difference between chipping the
   * boss and actually killing it; times how much of the party is still on its
   * feet, so the roster on screen is load-bearing rather than decorative; and
   * finally through the boss's hide, which thickens as its bar empties, so the
   * same match is worth measurably less at the end of the fight than it was at
   * the start of it.
   */
  damageFor(step, cells) {
    const { heroRow } = this.s;
    const table = DIFFICULTY.comboMultiplier;
    const combo = table[Math.min(step, table.length) - 1];
    // Cells cleared in this step, not the length of any one run: a five-cell
    // step is a five-cell step whether it came as a row of five or an L.
    const size = DIFFICULTY.sizeBonus[Math.min(cells.length, 5)] || 1;
    // The whole row swings at every match, so the backing is the party's, not
    // the matched colour's owner alone. See HeroRow.partyPower.
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

  /**
   * Which hero this step is billed to: whoever owns the colour that cleared the
   * most cells. A cascade step can land two runs of different colours at once,
   * and the hero who leads the volley should be the one who did the work.
   *
   * @returns {number} element index, or -1 if the step somehow cleared nothing
   */
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

  /**
   * Every gem cleared feeds the hero who owns its colour.
   *
   * All five charge now, off their own element, and this is the only way any
   * ultimate is earned. The healer fills faster than the rest — she is the one
   * the doom clock is aimed at.
   */
  chargeParty(cells) {
    const { board, heroRow, hud } = this.s;

    const counts = [];
    cells.forEach((cell) => {
      const type = board.typeAt(cell.r, cell.c);
      if (type >= 0) counts[type] = (counts[type] || 0) + 1;
    });

    heroRow.cards.forEach((card, index) => {
      const gems = counts[card.hero.element];
      if (!gems) return;
      if (!card.addCharge(gems * card.chargeRate())) return;
      hud.shout(COPY.ultReady.replace("{hero}", card.hero.name), 0.7, {
        fill: GEM_LIGHT[card.hero.element],
        from: 1.6,
      });
      // The shout names the hero; the lesson points at the card. Fired and not
      // awaited — this is the middle of a cascade, and nothing in a cascade
      // waits on a hand. See teachUlt, which does its own waiting.
      this.teachUlt(index);
    });
  }

  /**
   * The party answers the match.
   *
   * This is the whole point of the row being on screen. The match itself still
   * throws the first beam from the board — that is the "MATCH TO ATTACK" the
   * tutorial promises, and it carries the damage number — and then every hero
   * left standing fires their own element at the boss behind it, in their own
   * colour, one after another.
   *
   * The hero whose colour was actually matched leads: first off, thickest beam,
   * hardest impact. The rest are assists, thinner and softer, so five beams
   * read as a squad volley rather than five copies of one attack.
   *
   * Fired and forgotten, like the beam it follows: board.resolve does not await
   * its per-step callback, and the cascade must not wait on the light show.
   */
  partyVolley(step, lead) {
    const { boss, heroRow, vfx, shake } = this.s;
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
              shake(isLead ? 5 + step * 2 : 2.5, isLead ? 0.24 : 0.14);
            });
        },
      );
    });
  }

  /** Clear, cascade, and take off exactly what the player earned. */
  async resolveMove() {
    const { board, boss, hud, vfx, shake } = this.s;
    const before = this.bossHp;

    await board.resolve((step, cells) => {
      // The party is already gone: the rest of this cascade is gems falling on
      // a dead row, and it does not reach back and kill the boss. Whoever
      // landed first won outright — see claim.
      //
      // A cascade that is *winning* goes on playing. The bar is already empty
      // so the beams left in it cost nothing, and cutting a combo off halfway
      // is the one place this gate would be visible.
      if (this.ended || this.outcome === "defeat") return;

      const share = this.damageFor(step, cells);
      this.bossHp = Math.max(0, this.bossHp - share);
      // On the step that actually empties the bar, not at the next turn
      // boundary: this is what makes the boss's track stand down before the
      // swing it has in the air can land on anybody.
      if (this.bossHp <= 0) this.claim("victory");
      this.chargeParty(cells);

      const origin = this.centroid(cells);
      const target = boss.impactPoint();
      const lead = this.leadElement(cells);
      const color = GEM_COLORS[lead >= 0 ? lead : WATER];
      const power = 0.9 + step * 0.25;

      // The match lands, and the whole row swings in behind it.
      this.partyVolley(step, lead);

      vfx
        .beam(origin, target, color, {
          thickness: 18 + step * 6,
          impact: power,
          travel: 0.14,
        })
        .then(() => {
          if (this.ended) return;
          boss.hit(power);
          shake(6 + step * 3, 0.28);
          hud.damage(
            share * BOSS_MAX_HP,
            target.x,
            target.y - 20,
            step >= 3 ? 2 : step >= 2 ? 1 : 0,
          );
        });

      // The combo number is whatever the board actually did, counting up as it
      // goes. It is no longer decided before the player touched anything.
      if (step >= 2) {
        sfx.combo(step);
        hud.shout("COMBO x" + step, 0.5, { fill: 0xffe066, from: 1.8 });
      }

      hud.setHp(this.bossHp, 0.4);
      // Last thing in the step, so a layer breaking is the shout left standing
      // rather than one the combo counter steps on half a frame later.
      this.checkPhase();
    });

    // Not awaited: the bar settling is the last third of a second of the move,
    // and awaiting it here held the board shut for exactly that long before the
    // player was allowed to touch it again. The tween finishes on its own.
    hud.setHp(this.bossHp, 0.35);

    // Booked after the fact, and only for a move that actually paid: a swap
    // resolving into nothing would drag the running average towards zero and
    // convince the pace guard the boss needs a thousand more moves.
    const paid = before - this.bossHp;
    if (paid > 0.0001) {
      this.movesPlayed++;
      this.damageDealt += paid;
    }
  }

  /**
   * Boss health one move takes off, as this fight has been going.
   *
   * The opening guess is a plain triple at full strength — three gems at
   * DIFFICULTY.damagePerGem with no combo, no size bonus, a whole party and no
   * armour — because that is the cheapest move the board can pay out, and a
   * guard that opens optimistic would set the pace too slow to recover from.
   */
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

  /* ------------------------------------------------------- the boss turn */

  /**
   * This turn's attack, ramped by how long the fight has already run.
   *
   * The rotation is not fixed. An attack carrying `from` does not exist
   * until that turn index, and on the turn it unlocks it jumps straight to the
   * front of the queue — a two-beat rotation is learned in a single pass and
   * after that it is weather, so the unlock is what stops the boss becoming
   * predictable at exactly the point it is meant to be at its worst.
   *
   * Ramped off DIFFICULTY.curve's `attack` column — the staircase — times
   * rage() for the seconds spent standing still inside one of its steps.
   *
   * This is the drawn shape at its most legible, because a boss's damage is the
   * one number in the fight the player reads directly, off their own health
   * bars, every four seconds. On a shelf the swing lands for what the last one
   * landed for and the player learns what they can afford; on a rise it lands
   * for half again, on the beat after the golem roared the wall's name. The
   * exponential this replaced could only ever say "worse than last time", every
   * time, which is the same sentence often enough that it stops being heard.
   *
   * The opening step is under 1 on purpose: bossPress starts with the fight, so
   * the first swing arrives before the player has made a match. See
   * curve.steps.
   */
  currentAttack() {
    const pool = BOSS_ATTACKS.filter((a) => (a.from || 0) <= this.turn);
    const fresh = pool.filter((a) => a.from === this.turn);
    const base = fresh.length
      ? fresh[0]
      : pool[this.turn % pool.length] || BOSS_ATTACKS[0];
    const step = this.curveAt(
      "attack",
      this.progress(),
      Math.pow(DIFFICULTY.bossRamp, this.turn),
    );
    const ramp = step * this.rage();
    return {
      kind: base.kind,
      targets: base.targets,
      shout: base.shout,
      damage: base.damage * ramp,
      splash: (base.splash || 0) * ramp,
      obsidianBonus: base.obsidianBonus || 0,
    };
  }

  /**
   * Where this turn's obsidian lands — and it is aimed, not sprayed.
   *
   * One candidate per column: the lowest free cell in it. That keeps the
   * "everything below a block is also blocked" invariant true by construction
   * rather than by an author remembering it, and it caps any column at three
   * blocks. The board never holds more than this turn's ceiling at once — and
   * that ceiling climbs with the turn, so the pressure does not merely stay on,
   * it tightens, without the board ever quite becoming a wall.
   *
   * Within those rules the boss plays to hurt. Each candidate is scored by
   * what sealing it actually costs the player, and the blocks are placed one
   * at a time so every pick sees the damage the previous one did.
   */
  pickObsidian(attack) {
    const board = this.s.board;
    let held = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (board.isLocked(r, c)) held++;
    }

    // The wave this turn, plus whatever the attack itself brings with it: the
    // late unlock in BOSS_ATTACKS pays in board as well as in health.
    //
    // Off the curve's `obsidian` column, so the board tightens on the same rise
    // the boss's damage does and holds still on the same shelf. That matters
    // more here than anywhere: obsidian costs the player options, and options
    // arriving or leaving on a schedule of their own is the "half-glitch,
    // half-unreadable" complaint in its purest form — the screen gets harder to
    // read for no reason the player was given.
    const want =
      Math.round(
        this.curveAt(
          "obsidian",
          this.progress(),
          DIFFICULTY.obsidianBase + this.turn * DIFFICULTY.obsidianGrowth,
        ),
      ) + ((attack && attack.obsidianBonus) || 0);
    // The ceiling climbs with the fight too, so the endgame is played on a
    // genuinely smaller board rather than on the same one under pressure.
    const ceiling = Math.floor(
      Math.min(
        DIFFICULTY.obsidianMaxCap,
        this.curveAt(
          "hold",
          this.progress(),
          DIFFICULTY.obsidianMax +
            this.turn * (DIFFICULTY.obsidianMaxGrowth || 0),
        ),
      ),
    );
    const budget = Math.min(want, ceiling - held);
    if (budget <= 0) return [];

    const taken = [];
    try {
      // The headline block: one of the player's options, gone.
      const aimed = this.blockAnOption();
      if (aimed) {
        board.setProbe(aimed.r, aimed.c, true);
        taken.push(aimed);
      }
      // Whatever the wave has left over just squeezes the board.
      while (taken.length < budget) {
        const cell = this.worstCell();
        if (!cell) break;
        // Held as locked while the rest of the wave is chosen, so two blocks
        // never both aim at the same swap and waste each other.
        board.setProbe(cell.r, cell.c, true);
        taken.push(cell);
      }
    } finally {
      taken.forEach((p) => board.setProbe(p.r, p.c, false));
    }
    return taken;
  }

  /**
   * Bury one of the moves the player can actually see.
   *
   * The board guarantees at least two legal swaps at all times, and this takes
   * exactly one of them: it lists the player's options strongest first, rolls
   * between the top few, and drops a block on whichever cell kills the one it
   * rolled. Which of your ideas dies is not predictable, and there is always
   * another one left — that is the difference between pressure and a softlock.
   *
   * Always taking the single best option instead would be both crueller and
   * more boring: the player would learn that the obvious move is the one that
   * always gets taken, and simply stop looking for it.
   */
  blockAnOption() {
    const board = this.s.board;
    const swaps = board.listSwaps();
    // Never take the board under the floor it owes the player. It used to be
    // allowed down to a single move, which meant the boss itself was the thing
    // triggering most reshuffles: it buried an option, ensurePlayable found the
    // count short and mixed the board, and the player got a wave and a
    // scramble as one indistinguishable event. Leaving MIN_SWAPS standing
    // makes "he takes one of your ideas" the whole of what happens.
    if (swaps.length <= MIN_SWAPS) return null;

    const shortlist = swaps.slice(0, Math.min(OPTIONS_IN_PLAY, swaps.length));
    const target = shortlist[rndInt(shortlist.length)];

    // Either end of the swap kills it. Prefer the one that costs the player
    // more elsewhere, and never one that would leave the board with no move.
    const ends = [target.a, target.b];
    let best = null;
    ends.forEach((cell) => {
      const left = board.probeLock(cell.r, cell.c, () => board.countSwaps());
      if (left < MIN_SWAPS) return;
      const denied = swaps.length - left;
      if (!best || denied > best.denied) best = { cell, denied };
    });
    return best ? best.cell : null;
  }

  /**
   * The single most inconvenient cell on the board to seal right now.
   *
   * Aiming at the player's actual move is blockAnOption()'s job; this is the
   * rest of the wave, and it deliberately does not hunt options — two blocks
   * both eating a move would take the choice away entirely. It squeezes
   * instead: swaps denied is the player's freedom measured directly, water
   * starves the only ultimate in the fight, and the middle of the board is
   * where more matches run through.
   *
   * The pick is randomised across everything within reach of the top score. A
   * strict argmax on a scoring function this smooth lands in the same cells run
   * after run, which is exactly the "he always spits in the same place" the
   * aiming was supposed to fix.
   */
  worstCell() {
    const board = this.s.board;
    const before = board.countSwaps();
    const mid = (COLS - 1) / 2;
    const scored = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board.isLocked(r, c)) continue;
        const left = board.probeLock(r, c, () => board.countSwaps());
        // Never a cell that takes the board under its floor — the player is
        // owed MIN_SWAPS, and a squeeze that spends them is a squeeze that
        // hands the turn straight to the reshuffle. See blockAnOption.
        if (left < MIN_SWAPS) continue;
        const water = board.typeAt(r, c) === WATER ? 1 : 0;
        const central = 1 - Math.abs(c - mid) / (mid || 1);
        scored.push({
          r,
          c,
          score: (before - left) * 8 + water * 5 + central * 2,
        });
      }
    }
    if (scored.length === 0) return null;

    let top = scored[0].score;
    scored.forEach((s) => {
      if (s.score > top) top = s.score;
    });
    const shortlist = scored.filter((s) => s.score >= top - OBSIDIAN_SLACK);
    return shortlist[rndInt(shortlist.length)];
  }

  /**
   * The boss answers every player move.
   *
   * One action, two consequences: the same attack that burns the party also
   * lays the obsidian that shrinks the board. Playing them as two separate
   * beats cost three seconds of the player watching and doing nothing, which
   * is the most expensive thing a short creative can spend.
   *
   * Runs on the boss's track, so the player is very likely swapping through all
   * of it. That is why the aim waits for the board to stand still: the cells are
   * scored off the position the player is reading right now, not off whatever
   * was on screen when the swing started.
   */
  async bossTurn() {
    const attack = this.currentAttack();
    await this.s.board.whenQuiet();
    if (this.settled()) return;
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

  /**
   * Claw rake: the beast swipes, and three gashes come down the screen.
   *
   * The short beat on the track. Breath and slam are both a wind-up, a
   * travelling effect and a landing, and they take the better part of a second
   * and a half each — on a fourteen second playable window that is a tenth of
   * the run per swing, which is why there were only ever going to be four of
   * them. This one is a wind-up and a hit, it is over in about half of that,
   * and it is the one the fight can afford to repeat.
   *
   * `boss.rake()` returns the side the body actually travelled to, and the
   * claw marks are laid along it. That handshake is the whole point of the
   * beat: a swipe to the left with the marks torn to the right is two effects
   * playing at once, not one attack.
   */
  async bossRake(attack, cells) {
    const { boss, hud, vfx, shake, layout } = this.s;

    hud.shout(attack.shout || COPY.rake, 0.4, { fill: 0xff5a6e, from: 1.4 });
    const dir = await boss.rake();
    if (this.settled()) return;

    // On the beast rather than in front of it: the marks are what its own
    // claws opened, so they start where the claws are and the wave below is
    // what carries the hit down to the row.
    const at = boss.impactPoint();
    shake(16, 0.4);
    vfx.claw(at.x, at.y + layout.stage.h * 0.02, 0xff3a5a, {
      dir,
      len: layout.stage.w * 1.05,
      gap: layout.stage.h * 0.032,
    });
    // Painted slashes over the drawn ones, when the sheet is there. Laid on the
    // same point and the same side, so it is the marks getting hotter rather
    // than a second swipe arriving from somewhere else.
    vfx.bossSwing(
      "rake",
      { x: at.x, y: at.y + layout.stage.h * 0.03 },
      { size: layout.stage.w * 0.95, duration: 0.4, alpha: 0.85, grow: 0.16 },
    );
    vfx.flash(0xff2a3a, 0.16, 0.3);

    const spreading = this.dropObsidian(cells, 0.06);

    const row = layout.cards;
    await vfx.wave(at.y, row.y + row.h * 0.5, 0xff3a5a, {
      thickness: row.h * 1.1,
      duration: 0.2,
    });
    if (this.settled()) return;

    const falling = this.strikeHeroes(attack);
    shake(11, 0.32);
    await Promise.all([spreading, falling, delay(0.22)]);
  }

  /**
   * Lava breath: a cone of fire washes over the whole party, and the globs
   * that drip out of it on the way harden into obsidian on the board.
   */
  async bossBreath(attack, cells) {
    const { boss, hud, vfx, shake, layout } = this.s;

    // Inverted, unlike every other shout in the fight. This is the one printed
    // inside its own effect — the jet opens across the same band the callout
    // sits on — and light type with a dark rim needs something darker than
    // itself behind it. On a wall of fire there is nothing darker, which is how
    // "LAVA BREATH!" came to read as grey embossing on orange. Dark letters with
    // a hot rim hold against anything the jet does.
    hud.shout(attack.shout || COPY.breath, 0.4, {
      fill: 0x2a0803,
      stroke: 0xffc46a,
      from: 1.4,
    });
    await boss.lavaBreath(0.62);
    if (this.settled()) return;

    shake(10, 0.4);
    const row = layout.cards;
    const mouth = boss.mouthPoint();
    const onto = { x: row.x + row.w / 2, y: row.y + row.h * 0.45 };
    const flame = vfx.cone(mouth, onto, 0xff6a10, {
      hold: 0.5,
      // A shade under the row rather than exactly it: the tip carries a forward
      // bulge now — see paintCone — and at the full width that bulge put the
      // corner of the fire over the first column of gems.
      spread: row.w * 0.9,
      // Upright, the jet crosses the whole play field to reach the row. See
      // `heat` in vfx.cone: the fire gives way to the board, not the other way
      // round.
      heat: layout.portrait ? 0.48 : 1,
      mouth: 44 * layout.ui,
    });
    // The painted fire rides the middle of the jet the cone already draws, so
    // the detail lands where the player is looking rather than at either end of
    // a shape that is mostly travel.
    vfx.bossSwing(
      "breath",
      { x: (mouth.x + onto.x) / 2, y: (mouth.y + onto.y) / 2 },
      { size: row.w * 1.15, duration: 0.62, alpha: 0.9, grow: 0.3 },
    );
    const spreading = this.dropObsidian(cells, 0.1);

    // Let the fire actually arrive before anyone loses health.
    await delay(0.22);
    if (this.settled()) return;

    const falling = this.strikeHeroes(attack);
    shake(13, 0.45);
    vfx.flash(0xff5a1f, 0.2, 0.4);

    await Promise.all([flame, spreading, falling]);
  }

  /**
   * Magma slam: both fists into the floor. The shock rolls down the screen
   * into the hero row, and the board cracks open where it passes.
   */
  async bossSmash(attack, cells) {
    const { hud, boss, vfx, shake, layout } = this.s;

    hud.shout(attack.shout || COPY.smash, 0.4, { fill: 0xffb03d, from: 1.4 });
    await boss.smash();
    if (this.settled()) return;

    const impact = boss.fistPoint();
    shake(20, 0.55);
    vfx.shock(impact.x, impact.y, 0xff8a3d, {
      size: layout.stage.w * 1.6,
      width: 14,
    });
    vfx.shock(impact.x, impact.y, 0xffd35a, {
      size: layout.stage.w * 0.9,
      width: 8,
      duration: 0.4,
    });
    // Under both rings, at the fists. The rings are the shape of the blast and
    // the sheet is what is actually burning inside it.
    vfx.bossSwing("smash", impact, {
      size: layout.stage.w * 1.15,
      duration: 0.5,
      grow: 0.35,
    });
    vfx.flash(0xff2a06, 0.18, 0.35);

    // Obsidian erupts under the shock rather than being spat: the same block,
    // arriving from the attack the player just watched land.
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

  /** Globs arcing out of the flame onto the board. */
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

  /** Obsidian punched up through the board by the slam. */
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

  /**
   * Spread one attack across the party: flinch the cards, pop the numbers.
   *
   * The card owns the clamp, so the number shown is whatever the bar actually
   * lost — a hero already on the floor shows nothing rather than lying.
   *
   * Awaited by its callers now: with a health floor of zero the answer to
   * "is anybody still standing" is only correct once the bars have finished
   * draining, and the fight loop asks that question immediately afterwards.
   *
   * @returns {Promise<void>} settles when every bar has finished moving
   */
  strikeHeroes(attack) {
    const { heroRow, hud, vfx, layout } = this.s;
    // The fight is already called. A swing still in the air when the boss went
    // down does not get to take the party with it, and that is the whole of the
    // draw this mode does not have. See claim.
    if (this.settled()) return Promise.resolve();
    // An ultimate is in the air, and it is the one move in the fight sold as
    // the answer to exactly this. A swing landing inside its two seconds of
    // cut-in used to take the party with it — which then zeroed the ultimate's
    // own damage on the way past, because playUltimate reads the verdict before
    // it bills the boss. The player spent a full bar and watched the light show
    // pay out nothing into a fight it had already won.
    //
    // So the cast is immortal rather than merely favoured: the swing still
    // plays, its obsidian still lands on the board, and the health bars do not
    // move. The single exception is the clock's own cataclysm — see castDoom.
    if (this.ultCasting && !attack.unstoppable) return Promise.resolve();
    const targets = heroRow.resolveTargets(attack.targets);
    const solo = targets.length === 1;
    const jobs = [];
    let fell = 0;

    heroRow.cards.forEach((card, i) => {
      const direct = targets.indexOf(i) !== -1;
      const amount = direct ? attack.damage : attack.splash || 0;
      if (amount <= 0 || card.downed) return;

      const lost = card.lossFor(amount);
      if (card.hp - amount <= 0.001) fell++;
      // The single target of a slam lands first; everyone else ripples out.
      const wait = direct && solo ? 0 : 0.07 * i;
      jobs.push(card.hurt(amount, wait));
      if (lost <= 0) return;

      const at = heroRow.cardPoint(i);
      const lift = layout.cards.h * (i % 2 ? 0.42 : 0.06);
      const pop = () => {
        if (this.ended) return;
        vfx.impact({ x: card.x, y: card.y }, 0xff5a1f, direct ? 0.55 : 0.3);
        hud.damage(lost * HERO_MAX_HP, at.x, at.y - lift, direct ? 1 : 0, {
          sign: "-",
          fill: direct ? 0xff6b5a : 0xffb3a8,
        });
      };
      if (wait > 0) delay(wait).then(pop);
      else pop();
    });

    // Claimed here, on the frame the hit is committed, rather than once the
    // bars have finished draining. The drain is four tenths of a second of
    // tweening, and a cascade resolving inside it would otherwise take the last
    // of the boss's health after the party was already dead — two winners, one
    // fight. `fell` skips anyone already down, so this reads as "the attack
    // takes everybody still standing".
    if (fell > 0 && fell >= heroRow.aliveCount()) this.claim("defeat");

    // Announced once for the wave, not once per corpse — and not at all over a
    // wipe, which has an ending of its own to say.
    if (fell > 0 && !this.settled()) {
      delay(0.45).then(() => {
        if (this.ended || this.partyWiped()) return;
        hud.shout(COPY.down, 0.5, { fill: 0xff6b5a, from: 1.5 });
      });
    }

    return Promise.all(jobs);
  }

  /** The swap the hand demonstrates: scripted on the opener, solved after. */
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
    // Prefer Arissa's element: charging her is the whole strategy of the mode,
    // so the one piece of help the game still gives should teach that.
    return board.findBestSwap(WATER) || board.findBestSwap();
  }

  /**
   * Solve the board again for the hand.
   *
   * The lava lands in the middle of the player's turn now, and it lands on the
   * cells they are most likely to be looking at — the hand would otherwise go on
   * pointing at a swap that is under a block, or at gems the reshuffle moved.
   */
  refreshHint() {
    if (this.ended) return;
    // Nothing is re-aimed at the board while the ult lesson has the screen: it
    // would take the prop off a card mid-tap to point at a swap nobody is being
    // asked for yet. teachUlt hands the hint back when it is done.
    if (this.ultLive) return;
    // The opening hand is not on the idle timer and restartIdle will not touch
    // it, so it is the one that has to be re-aimed by hand.
    if (this.openingLive && !this.openingSpent) {
      this.retireLesson();
      this.pointOpeningHand();
      return;
    }
    if (!this.idleHint) return;
    // Straight back up if it was already up. A hint on screen when the lava
    // lands is a hand pointing at a cell that is now under a block, and the
    // player who was following it should not have to sit through another
    // `hint` of silence to be told where to look instead.
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

  /* -------------------------------------------------------------- the ult */

  /**
   * An ultimate — any of the five, earned, not scheduled.
   *
   * Each hero wipes their own colour off the board and bills the boss for every
   * gem of it, on top of a flat chunk. Arissa is still the one who matters most:
   * hers is the only heal in the fight and the only thing that clears obsidian,
   * which is what makes hunting water instead of whatever match is nearest the
   * actual skill here. The other four trade that for a straight burn.
   *
   * It deliberately does not hand the boss a turn: the player paid for it — and
   * for the same reason it cannot be killed out from under itself. The party is
   * immortal from the tap until the cast has resolved; `strikeHeroes` is where
   * that is enforced and why.
   */
  async playUltimate() {
    try {
      await this.castUltimate();
    } finally {
      // The one place the shield comes down. The cast below has four returns in
      // it — one for a card that is not there, three for a fight that ended
      // underneath it — and a shield left standing on any of those paths would
      // make the party immortal for the rest of the run, over a fight whose
      // clocks had stopped.
      this.setCasting(false);
    }
  }

  /** The cast itself. Split out only so `playUltimate` has one exit to guard. */
  async castUltimate() {
    const { board, boss, heroRow, hud, vfx, cutin, shake, layout } = this.s;
    const index = this.ultHero;
    const card = heroRow.cards[index];
    if (!card || card.downed) return;

    const element = card.hero.element;
    const healer = !!card.hero.heal;
    const color = GEM_COLORS[element];
    const light = GEM_LIGHT[element];

    board.lockInput();
    // Overlapped, not sequenced. The card's punch and its draining bar run on
    // under the cut-in, which used to wait a third of a second for them to
    // finish first — a pause between the tap and the payoff, in the one place
    // in the fight where the player has just been promised something loud.
    const spending = card.spend();
    // The card's own animation gets its moment before the cut takes the screen,
    // and how long that is is the card's to say: a hero whose element has a
    // burst sheet has an arc to show and the cut lands on its peak, everybody
    // else keeps the tenth of a second this always waited. See
    // HeroCard.flareLead and ULT in art/heroes.js.
    await delay(card.flareLead());
    await cutin.play(index);
    if (this.ended) return;

    // Underneath the cut-in's wash, which is still on screen: play() hands the
    // board back on the white rather than after it, so the swing, the sweep and
    // the kick are already running by the time the board is uncovered.
    card.strike(true);
    vfx.sweep(color);
    shake(14, 0.45);
    await spending;

    // Only the tide washes the board clean. Everybody else has to live with the
    // obsidian, which is what keeps her the ultimate worth saving for.
    const hadObsidian = healer && board.hasObsidian();
    const cleansing = hadObsidian
      ? board.clearAllObsidian()
      : Promise.resolve(0);
    if (hadObsidian) {
      hud.shout(COPY.ultClear, 0.5, { fill: light, from: 1.4 });
    }

    const cleared = await board.clearElement(element);
    // Through the hide like everything else. The ultimate is the biggest number
    // in the fight, and a big number that ignored the armour would be the one
    // move that made the entire progression irrelevant.
    const total =
      (DIFFICULTY.ultDamage +
        cleared * DIFFICULTY.damagePerGem * DIFFICULTY.ultGemMultiplier) *
      this.resistance();
    // Cast into a fight the boss has already won: the light show plays out,
    // the damage does not. Same rule the cascade runs on — see resolveMove.
    const dealt = this.outcome === "defeat" ? 0 : total;
    this.bossHp = Math.max(0, this.bossHp - dealt);
    if (this.bossHp <= 0) this.claim("victory");

    const target = boss.impactPoint();
    const origin = {
      x: layout.board.x + layout.board.size / 2,
      y: layout.board.y + layout.board.size * 0.2,
    };

    // One call for all six. `vfx.spell` looks every mage up by element and
    // plays their own sheet, and anyone whose sheet has not been packed yet
    // falls back — Ricklow to the painted fireball, everybody else to `beam`,
    // which is what all six of them threw before the sheets existed, tuned
    // exactly as it was.
    //
    // This used to branch on `element === "fire"`, comparing a hero's element
    // against a string when every element in config.js is an index. It was
    // never true, so the one painted ultimate in the build had never played:
    // Ricklow fell through to the same beam as everybody else.
    await vfx.spell(element, origin, target, color, {
      size: layout.board.size * 1.25,
      travel: 0.22,
      beam: { thickness: 64, impact: 2.6, travel: 0.2 },
    });
    if (this.ended) return;

    sfx.ultBlast(element);
    boss.hit(2);
    shake(22, 0.6);
    vfx.flash(light, 0.55, 0.55);
    hud.damage(dealt * BOSS_MAX_HP, target.x, target.y - 24, 2);
    hud.setHp(this.bossHp, 0.6);
    this.checkPhase();

    // The same tide that shatters the obsidian washes the burns off the party,
    // and picks up anyone who has already gone down.
    const hurt = heroRow.cards.some((c) => c.hp < 1 || c.downed);
    const healing = healer ? heroRow.healAll(this.healTo()) : Promise.resolve();
    if (healer) this.healsUsed++;
    if (healer && hurt && !hadObsidian) {
      hud.shout(COPY.ultHeal, 0.5, { fill: 0x9fffc4, from: 1.4 });
    }

    await Promise.all([cleansing, healing, delay(0.4)]);
  }

  /* -------------------------------------------------------- how it ends */

  async win() {
    const { boss, board, hud, vfx, shake } = this.s;
    this.claim("victory");
    board.lockInput();
    this.stopIdle();
    this.doomArmed = false;
    hud.hideDoom();
    // Let the swing already in the air land: a boss breathing fire on the way
    // down reads as a bug, and a capped wait cannot cost the ending its time.
    await this.bossSettled();

    shake(26, 0.8);
    const dying = boss.die();
    await delay(0.35);
    vfx.flash(0xffffff, 1, 0.7);
    await dying;
    if (this.ended) return;

    // No shout, and no stinger either. VICTORY belongs to the outcome card —
    // the frame the player actually stops on, where the word is stamped inside
    // the gold band and the horn plays with it; see ui/outcome.js. Called out
    // here as well it announced the win twice over, and the first of the two
    // went by on a callout already on its way out.
    //
    // The beat itself stays: `victoryHold` is the pause the collapse is given
    // before the card cuts in, and it was never the shout's own time.
    await delay(T.victoryHold);
  }

  /**
   * The party is down. The boss does not die, the screen does not celebrate,
   * and the end card says what happened — a "COLLECT YOUR HEROES" banner over
   * a wipe is the kind of thing a player notices and stops trusting.
   */
  async lose() {
    const { boss, board, hud, vfx, shake } = this.s;
    this.claim("defeat");
    board.lockInput();
    this.stopIdle();
    this.doomArmed = false;
    hud.hideDoom();
    await this.bossSettled();

    boss.enrage();
    hud.enrage();
    shake(20, 0.7);
    vfx.flash(0x3a0606, 0.7, 0.8);
    await boss.roar();
    if (this.ended) return;

    // Silent here for the same reason the win is — see above. The braam is the
    // card's, and the roar just above is what this beat sounds like.
    await hud.shout(COPY.defeat, 0.9, { fill: 0xff5a3a, from: 2.4 });
    await delay(0.5);
  }

  /* ---------------------------------------------------------- idle nagging */

  beginIdle(hint) {
    this.idleHint = hint;
    this.armAutoPlay();
    this.armBossPress();
    this.armOpeningHint();
    this.restartIdle();
  }

  /* ------------------------------------------------------- the one hint */

  /**
   * Arm the opening hint: the lesson on the first swap, before the first touch.
   *
   * Once, and only ever before the player has shown up. What takes over
   * afterwards is the auto-hint on `T.hint` — same lesson, same door in — so
   * this is not the last help anybody gets, it is the help that arrives without
   * being earned by stalling. See restartIdle and escalate.
   *
   * Armed from every player turn rather than once from the intro, and that is
   * deliberate. A turn can end without the player having touched anything —
   * the cataclysm collects, the boss's track wipes the party — and the
   * `stopIdle` that ends it takes the hand off the screen with everything
   * else. Re-arming here is what puts it back for a player who has still not
   * touched the board, and `openingSpent` is what guarantees it never comes
   * back for one who has.
   */
  armOpeningHint() {
    if (this.openingSpent || T.openingHint == null) return;
    // Already demonstrating, which is only ever the one armed before the touch
    // — every other caller gets here through a `stopIdle` that put the prop
    // away first. Re-arming over a live demo would restart it mid-sentence a
    // second into the fight, for a player who has been watching that exact
    // loop since before they touched anything.
    if (this.openingLive) return;
    const token = ++this.openingToken;
    // No wait at all, and taken synchronously rather than through a promise
    // that has already resolved: armIntro runs before the first frame is
    // rendered, so the lesson placed from here is in that frame — and the
    // first frame is the only one a playable is guaranteed to be looked at.
    // A microtask later is a frame later, and a frame later is after it.
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

  /**
   * Run the opening lesson on the swap the board is currently offering.
   *
   * The swap is solved fresh rather than remembered: the board it was armed
   * against is a second old by the time this runs, and on a bad second the
   * boss has dropped a block on the cell it was going to point at.
   *
   * `matchShape` is what makes this a lesson rather than a hint — it takes the
   * swap apart into the pair that is already lined up, the stone that has to
   * travel and the run the two of them make, which are the three things
   * ui/coach.js needs to say "three of these, in a line" without a word of
   * copy. If the board somehow offers a swap whose shape cannot be read, the
   * old behaviour is still underneath: hand, two lit gems, no lesson.
   */
  pointOpeningHand() {
    // A shade larger than the auto-hint's hand: this one is talking to
    // somebody who has not yet worked out that the board is a board.
    //
    // Cold, which is the second half of T.openingHint being zero: the first
    // pass comes up already lit and reads its two beats short, so the prop is
    // on the glass a third of a second in rather than a second and a third.
    // Nothing is being interrupted — there is no fight yet — and a lesson
    // fading up over an arena the player has only just laid eyes on is a
    // lesson that arrives after they have decided nothing is happening.
    this.openingLive = this.showLesson(1.15, true);
  }

  /**
   * Put the lesson on screen for whatever the board is offering right now.
   *
   * The one door in. The opening hint and the auto-hint used to be two paths
   * showing two different things — a lesson for the first, a hand sliding
   * between two cells for the second — so the help a stalled player got in the
   * middle of the fight was both the weaker of the two and unrecognisable as
   * the thing that had taught them the rule at the top of the run.
   *
   * The swap is solved here rather than handed in: whatever armed this is at
   * least a second old by the time it runs, and on a bad second the boss has
   * dropped a block on the cell it was going to point at.
   *
   * @param {number} urgency how large the hand stands — see Hand.setUrgency
   * @param {boolean=} cold whether the first pass skips its fade and reads its
   *   opening beats short — for the lesson that is on screen before anything
   *   else is. See Coach.play.
   * @returns {boolean} whether anything is now being shown
   */
  showLesson(urgency, cold) {
    const { hand, board, coach } = this.s;
    // The ult lesson owns the prop outright while it is up — one hand, one
    // Coach, and of the two moves on offer it is teaching the more valuable.
    if (this.ultLive) return false;
    const hint = this.currentHint();
    if (!hint) return false;

    this.idleHint = hint;
    if (this.highlighted) board.setHighlight(this.highlighted, false);
    this.highlighted = null;
    this.lessonLive = true;
    hand.setUrgency(urgency);

    // The lesson loops for as long as the player stalls, and it re-solves its
    // own swap when the board moves out from under the one it is teaching. It
    // is handed this rather than left to call currentHint itself so that the
    // answer lands back here too: `idleHint` is what autoPlay reaches for and
    // what the escalation lights up, and a coach that re-aimed privately would
    // leave both of those pointing at the swap before last.
    const solve = () => {
      const next = this.currentHint();
      if (next) {
        const fresh = board.matchShape(next.a, next.b);
        if (fresh) {
          this.idleHint = next;
          return fresh;
        }
      }
      // Nothing teachable on the board this instant, which in practice means a
      // reshuffle is in the air. The lesson is handed back to the clock rather
      // than simply stopped: restartIdle re-arms the chain, escalate waits the
      // board out, and the player gets the hint again a beat later instead of
      // never again for the rest of the run.
      this.lessonLive = false;
      this.openingLive = false;
      this.restartIdle();
      return null;
    };

    /**
     * The hero the demonstrated swap charges — but only once that hero's bar is
     * actually full.
     *
     * This used to answer with whoever wore the swap's colour, charged or not,
     * and only for the opening demo. What that put on the start screen was a
     * hand knocking on a card reading 7 / 120 — a hand on a control that does
     * nothing yet. A player who follows it taps, gets no ultimate, and has been
     * taught by the creative itself that the hand is not to be trusted; a player
     * who does not follow it has been shown a gesture with no consequence. Both
     * are worse than saying nothing, and the second half of the sentence — match
     * these, and *then* the hero lights up — was the half that never landed.
     *
     * So the gate is the charge bar and nothing else. `ready` is the flag
     * HeroCard.addCharge sets on the frame the bar reaches its maximum, which is
     * the same instant the card pops, says READY and the HUD shouts the hero's
     * name; `downed` takes out a hero who filled and was then knocked over,
     * because a hand on a corpse is the same broken promise one cell along. The
     * hand now only ever lands on a card that will fire if it is tapped.
     *
     * Which also takes the `cold` gate off it. It was standing in for this test
     * — before the fight nobody is charged, so before the fight was the only
     * time the answer was harmless — and now that the real condition is written
     * down, the opening demo and the in-play hint can both ask honestly. On the
     * start screen the party is dealt at DIFFICULTY.chargeStart and this answers
     * null every time, which is why the demo's card half is not seen there any
     * more. It is seen the moment somebody's bar fills instead.
     *
     * `ultTaught` is the one thing that shuts it up for good: whoever has tapped
     * a card has found the row, and teachUlt's whole job is done. See onCardTap,
     * which sets it on the first tap on any card, charged or not.
     *
     * Two answers and not one, in that order. The colour match is the better
     * sentence — match these, and *this* is the hero they charge — so it is
     * asked for first. But the demo does not choose which swap the board is
     * offering, and a run where the only charged hero is the healer while the
     * board keeps serving up fire would say nothing at all for the whole of it.
     * So the fallback is any charged hero: a weaker sentence, still a true one,
     * and still the only thing on screen pointing at the row. Both answers pass
     * the same test — the card will fire if it is tapped — which is the rule
     * this whole function exists to keep.
     */
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
    // A board whose swap cannot be taken apart into a pair and a traveller
    // still gets what this always did: hand, two lit gems, no lesson.
    this.pointHand();
    this.highlighted = [hint.a, hint.b];
    board.setHighlight(this.highlighted, true);
    return true;
  }

  /**
   * Take the lesson off the screen and give the board back to the model.
   *
   * Every path that ends a hint comes through here, because a lesson on screen
   * is three things at once — the marks, the prop, and real gems standing
   * somewhere the model does not think they are — and dropping any one of them
   * on its own leaves an outline floating over a board that has moved on.
   */
  retireLesson() {
    const { board, coach, hand } = this.s;
    this.lessonLive = false;
    if (coach) coach.stop();
    board.cancelPreview();
    // Back to its own size before anything else can pick the prop up: the demo
    // hand is shown a shade large on purpose and nothing else here is a demo.
    hand.setUrgency(1);
    hand.stop();
    if (this.highlighted) {
      board.setHighlight(this.highlighted, false);
      this.highlighted = null;
    }
  }

  /**
   * The player showed up. The hand comes off, and stays off.
   *
   * The only exit the lesson has, and it is a one-way door: `openingSpent` is
   * never cleared, so nothing below can put the prop back on screen for the
   * rest of the run. Driven off the first touch on the board rather than off
   * the first move that lands — see onInteract, which Board.handleDown fires
   * before it has even looked at whether input is enabled, so a tap during a
   * cascade retires the lesson exactly as a swipe does.
   */
  spendOpeningHint() {
    if (this.openingSpent) return;
    this.openingSpent = true;
    this.openingLive = false;
    this.openingToken++;
    this.retireLesson();
  }

  /* -------------------------------------------------------- the ult lesson */

  /**
   * Teach the ultimate: the frame round the hero who just charged, and the hand
   * tapping it.
   *
   * The creative teaches two moves and this is the second of them. The board
   * lesson says what a match is; nothing said what the row underneath it was
   * for — and the ultimate is both the largest number anybody can put on the
   * boss and the only thing a player can do that is not a swipe. What used to
   * carry it was the READY caption on the card and a shout that is gone in two
   * thirds of a second, over the head of somebody who has spent the whole run
   * looking at the board.
   *
   * So it is the same lesson aimed at the row — same painted frame, same hand,
   * same element colour — and it is bounded on every side, because a hand on
   * the cards is a hand pointing away from the fight:
   *
   *   - it waits T.ultHintIn, so the shout naming the hero lands first rather
   *     than being talked over by a prop arriving on top of it;
   *   - it holds the screen for T.ultHint and then gives the board hint its
   *     clock back — see endUltLesson, and the restartIdle under it;
   *   - it is offered at most T.ultHintShows times in a run;
   *   - and the first tap on any card ends it for good, exactly as the first
   *     touch on the board ends the other one. See onCardTap.
   *
   * Nothing here blocks input either: the card is live under the frame from the
   * first frame of the demo, and a player who taps straight through it gets
   * their ultimate and never sees the second tap.
   *
   * @param {number} index the hero who just charged
   */
  async teachUlt(index) {
    if (!T.ultHints || this.ultTaught || this.ended || this.ultLive) return;
    if (this.ultShows >= T.ultHintShows) return;
    const { heroRow, hand, coach } = this.s;
    const card = heroRow.cards[index];
    if (!card || !coach) return;

    this.ultShows++;
    const token = ++this.ultToken;
    // Live from here rather than from the first frame of the demo, and the
    // board's lesson comes off now rather than then. The two are on clocks that
    // cross — the board hint waits T.hint of a settled board, this waits
    // T.ultHintIn — so anything less would have them trading the hand between
    // them in front of the player. Every way out below goes through
    // endUltLesson, which is what gives the other one its clock back.
    this.ultLive = true;
    this.retireLesson();

    await delay(T.ultHintIn);
    if (token !== this.ultToken) return;
    // Half a second is long enough for the fight to move: the hero can be
    // knocked down by a boss beat that was already in the air, or spent by a
    // player who did not need telling.
    if (this.ended || this.ultTaught || !this.canUlt(index)) {
      this.endUltLesson();
      this.restartIdle();
      return;
    }

    // A shade larger than the board hint's hand, for the same reason the
    // opening lesson's is: this one is pointing away from the thing the player
    // has been looking at for the whole run.
    hand.setUrgency(1.15);
    coach.playCard(card, hand, card.hero.element);

    // Polled rather than waited out in one piece — see ULT_TICK.
    for (let left = T.ultHint; left > 0; left -= ULT_TICK) {
      await delay(ULT_TICK);
      if (token !== this.ultToken) return;
      if (this.ended || !this.canUlt(index)) break;
    }
    this.endUltLesson();
    // And the board gets its hint back, on the clock rather than in the same
    // frame: the player has just been shown something, and a swipe demo landing
    // where the tap demo left off is two lessons in one breath.
    this.restartIdle();
  }

  /**
   * Take the ult lesson off the screen.
   *
   * The token retires whatever pass of it is in flight — including one still
   * inside its opening wait — and retireLesson does the clearing, because the
   * marks and the prop are shared with the board's lesson and there is one
   * teardown for both. Deliberately does not re-arm the idle chain: the callers
   * disagree about what should happen next, and a tap that is about to spend an
   * ultimate does not want a hand over the board a frame later.
   */
  endUltLesson() {
    if (!this.ultLive) return;
    this.ultToken++;
    this.ultLive = false;
    this.retireLesson();
  }

  /**
   * The boss swings on his own clock, whether or not anybody has moved.
   *
   * Re-arms itself rather than firing once, because the case it exists for is
   * the one where nothing else will ever wake it: a viewer who never touches the
   * board leaves `playerTurn` parked on a swipe that is not coming, and one
   * beat of boss and then silence is barely better than silence. Every player
   * turn calls in here again and the token retires the previous chain, so the
   * clock is always measured from the last thing that actually happened.
   *
   * `queueBoss` is the only way on to the boss's track and it refuses at two
   * deep, so a slow swing cannot stack a queue of them behind it — the tick that
   * gets turned away simply loses that beat and the next one tries again.
   */
  armBossPress() {
    if (!T.bossPress) return;
    const token = ++this.pressToken;
    delay(T.bossPress).then(() => {
      if (token !== this.pressToken || this.settled()) return;
      this.queueBoss(() => this.bossTurn());
      this.armBossPress();
    });
  }

  /**
   * Play the move ourselves — but only for a viewer who has never touched the
   * screen, and only while T.autoPlay says so.
   *
   * `playerActed` is the whole difference between a creative that demos itself
   * to a passive impression and one that takes the board away from someone who
   * is playing it: the moment it is set, nothing here ever fires again and a
   * stalled player simply runs out of clock like anybody else.
   *
   * T.autoPlay is off, so nothing here fires for anybody. See the flag for what
   * a passive impression looks like as a result.
   */
  armAutoPlay() {
    if (!T.autoPlay || this.playerActed) return;
    const token = ++this.moveToken;
    delay(this.autoDelay()).then(() => {
      if (token !== this.moveToken || this.ended || this.playerActed) return;
      this.autoPlay();
    });
  }

  /**
   * Restart the hand nagging. Unlike the deadline above, this one *should*
   * reset on every touch — nobody wants a hand animating under their thumb.
   *
   * The single gate for the whole prop: every path that could put a hand or a
   * highlight on screen — the idle timer, a rejected swap, a boss beat landing
   * mid-turn — comes through here, so T.hints off here is T.hints off
   * everywhere. `idleHint` is still solved and still kept, because autoPlay
   * falls back to it for a viewer who never touches the screen.
   *
   * @param {boolean} immediate skip the initial silence (used after a bad swap)
   */
  restartIdle(immediate) {
    if (this.ended) return;
    // Everything below begins by taking the marks and the hand down, which is
    // the one thing that must not happen to a lesson that is mid-sentence on a
    // card. The chain is armed again by teachUlt on its way out.
    if (this.ultLive) return;
    const token = ++this.idleToken;
    // The opening lesson is not on this timer — it owns the prop outright
    // until the player touches the board — so it is the one thing here that is
    // not taken down. Everything else comes off now and comes back on the
    // clock, which is what makes a touch landing during a hint read as instant.
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

    // And then it waits on the board as well as on the clock. The lesson
    // slides the real stones — Board.previewSwap, which refuses outright while
    // a cascade or a wave of obsidian is in the air — so a hint that fired on
    // time onto a moving board would spend its first pass drawing outlines
    // over gems that are somewhere else and then quietly do nothing at all.
    while (board.busy) {
      await delay(0.12);
      if (token !== this.idleToken || this.ended) return;
    }

    // The opening lesson owns the prop outright while it is up, and it is
    // already showing this exact swap. Restarting it here would reset a demo
    // mid-sentence every time the two clocks crossed, which is the one thing a
    // loop like this must never look like. The idle chain is armed again by
    // the touch that spends the opening hint — see onInteract.
    if (this.openingLive && !this.openingSpent) return;

    if (!this.showLesson(1)) return;

    // Clamped: the two delays are independent knobs and nothing stops a
    // retune putting `pulse` under `hint`, which would otherwise light the
    // gems up in the same frame as the hand and skip the escalation entirely.
    await delay(Math.max(0, T.pulse - T.hint));
    if (token !== this.idleToken || this.ended) return;
    // The escalation is the one beat of this chain that outlives its own
    // lesson: showLesson refuses while the ult lesson is up, but a pass that
    // got past it a moment earlier is still holding this delay, and what it
    // does on the other side is grow the hand and light two gems. Both of
    // those would land on top of a demo pointing at a card.
    if (this.ultLive) return;
    hand.setUrgency(1.3);
    if (this.idleHint) {
      this.highlighted = [this.idleHint.a, this.idleHint.b];
      board.setHighlight(this.highlighted, true);
    }
  }

  /**
   * How long to wait before playing the move ourselves — passive viewers only.
   * Shrinks as the clock runs down so a hands-off impression still gets a whole
   * fight rather than a countdown and an end card.
   *
   * The divisor used to be the literal 4: spread what is left of the run over
   * four more moves. Four is not the number, and it never was a number this
   * file gets to hold an opinion about — DIFFICULTY.damagePerGem has moved four
   * times since, and every move changed how many moves the boss is actually
   * worth. A guard planning a fixed four of them paced the demo to a move every
   * seven seconds, which is the ceiling T.auto, which is what it would have
   * done with no guard at all.
   *
   * Measured, that is a health bar which moves twice in the whole creative and
   * stands perfectly still for the nine seconds in between. The bar was not
   * broken and neither was the drain; there was simply almost nothing happening
   * to it. A boss fight whose boss visibly loses no health is not selling a boss
   * fight.
   *
   * So the divisor is the number of moves the boss actually still needs, at what
   * this fight has been paying for one — see paidPerMove. It costs the passive
   * viewer nothing except the pauses, and it never fires for anybody who has
   * touched the screen, so nothing here can take a turn off a real player.
   */
  autoDelay() {
    const left = T.hardCap - T.finaleReserve - now();
    const moves = Math.max(1, Math.ceil(this.bossHp / this.paidPerMove()));
    const budget = left / moves - T.moveCost;
    return Math.max(T.autoFloor, Math.min(T.auto, budget));
  }

  pointHand() {
    const { hand, board } = this.s;
    if (!this.idleHint) return;
    const a = board.cellPos(this.idleHint.a.r, this.idleHint.a.c);
    const b = board.cellPos(this.idleHint.b.r, this.idleHint.b.c);
    // The hand takes the colour of the gem it is about to drag, which is the one
    // it starts on — the same end ui/coach.js reads its lesson's element off.
    hand.setElement(board.typeAt(this.idleHint.a.r, this.idleHint.a.c));
    hand.swipeLoop(
      { x: board.x + a.x, y: board.y + a.y },
      { x: board.x + b.x, y: board.y + b.y },
    );
  }

  /**
   * Retries rather than firing once: a stray tap can leave the board mid-swap
   * exactly when the deadline lands, and a single missed attempt would strand
   * the demo for the rest of the run.
   */
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
    // Only the pending chain, not the rule: armOpeningHint puts it back on the
    // next player turn if the player still has not moved. spendOpeningHint is
    // the one thing that ends it for good.
    this.openingToken++;
    this.openingLive = false;
    // The other lesson comes off with it. This is the end of a turn, and
    // whatever the turn ended for — a swap, an ultimate, the boss, the clock —
    // owns the hand from here.
    this.endUltLesson();
    this.retireLesson();
    this.idleHint = null;
  }

  /* --------------------------------------------------- the two last screens */

  /**
   * The verdict, then the store — in that order, and both from here.
   *
   * This used to be one screen. The fight ended, the music crossed over, and the
   * end card came up with a plaque stamped into the hole in the key art. What
   * that spent was the one beat the player had actually earned: the moment they
   * beat a boss, or a boss beat them, went by inside an advert.
   *
   * So there are two screens now. The outcome screen says what happened and
   * shows what the player did — see ui/outcome.js — and the end card that
   * follows it does what an end card is for, with the plaque left off because
   * the screen before it has already stamped one. Neither is new *content*: the
   * plaque, the party and the button were all in the bundle already; what is new
   * is that the verdict is no longer competing with the pitch for the same
   * screen.
   *
   * The rematch is the one path that stops here. RETRY on the outcome screen
   * rebuilds the whole cast on the spot — see main.js `restart` — so this run's
   * last act is to not show a card over the top of a fight that has already
   * started again.
   */
  async finish() {
    if (this.ended) return;
    this.ended = true;
    this.stopIdle();
    // The room goes out with the fight — a drone under a store button is a
    // drone nobody asked for. The music does not go out with it: it crosses to
    // the game's lobby theme under both screens, which is the one piece of sound
    // on them that is also the thing being sold. See music.endcard, and
    // AUDIO.musicEndcard for placements that want the ending quiet.
    sfx.bed.stop();
    music.endcard();
    this.doomArmed = false;
    this.s.hud.hideDoom();
    this.s.board.lockInput();
    this.s.hud.hideShout();
    // A beat before the photograph, and it is not a flourish: `hideShout` fades
    // the callout over 0.15s and the card's still is taken the instant `show` is
    // called, so without this the frozen frame has a half-transparent MATCH 3 TO
    // ATTACK welded across it. Measured against that fade, with a frame to
    // spare. It also reads as the breath between the last swing and the verdict.
    await delay(0.18);
    // Cut off by the hard cap with the boss still standing: that is a loss, and
    // calling it anything else would be the old lie in a new place.
    const outcome = this.outcome || (this.bossHp <= 0 ? "victory" : "defeat");

    // The verdict, over a frozen still of the fight that just ended. It takes a
    // tap or about three seconds, and there is no way off it but forward — see
    // ui/outcome.js, which has no buttons on it at all.
    await this.s.outcome.show(outcome);

    // `true`: the verdict has been stamped once already, and a card that stamps
    // it a second time is the creative telling the player something they read
    // three seconds ago. See EndCard.show.
    await this.s.endcard.show(outcome, true);
  }
}
