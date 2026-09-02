/**
 * ELEMENTAL SIEGE — playable ad configuration.
 * Everything that a marketer or QA might want to retune lives here.
 */

/* ---------------------------------------------------------------- elements */

export const FIRE = 0;
export const WATER = 1;
export const NATURE = 2;
export const LIGHTNING = 3;
export const ARCANE = 4;
/**
 * Appended, never inserted: every element is an index into the colour tables
 * below, START_BOARD and the gem art, and HEALER is a hard-coded index into
 * HEROES. A sixth element is safe at the end; a sixth element in the middle
 * would silently repaint the whole roster.
 */
export const WIND = 5;

/**
 * Pale aqua rather than another blue: WIND sits next to WATER on the board and
 * the two have to be told apart at a glance on a phone, by colour alone, while
 * they are falling.
 */
export const GEM_COLORS = [
  0xff5a1f, 0x2fa8ff, 0x3fd16a, 0xffd22e, 0xa855f7, 0x8ceee2,
];
export const GEM_DARK = [
  0x8c2405, 0x0b4d85, 0x14663a, 0x8a6a00, 0x4c1d95, 0x11594f,
];
export const GEM_LIGHT = [
  0xffc08a, 0xb6e4ff, 0xb6f5c9, 0xfff2a8, 0xe6c9ff, 0xdafff8,
];

/** Z for zephyr — W was already spoken for by water. */
const KEY_TO_GEM = {
  F: FIRE,
  W: WATER,
  N: NATURE,
  L: LIGHTNING,
  A: ARCANE,
  Z: WIND,
};

/* -------------------------------------------------------------- board setup */

export const COLS = 5;
export const ROWS = 5;

/**
 * Hand-authored opening board (spec §5).
 * Swapping W(r2,c2) with F(r3,c2) makes row 2 read F F F Z A — a clean triple.
 * The layout contains no pre-existing match and, as before, no accidental
 * second option at all: the scripted swap is the only legal move on the board,
 * so the hint hand can never point at the second-best idea.
 *
 * Re-authored when WIND made it six colours — the old five-colour layout was
 * searched for the same properties and this one was picked to match them,
 * including the triple staying three cells wide. damageFor() clamps its size
 * bonus at five, so an opening that cleared six would take 60% of the boss in
 * one move and there would be no fight left to show.
 */
const START_BOARD_KEYS = ["FLWWL", "NZANN", "FFWZA", "ZNFLZ", "ZZAAN"];

export const START_BOARD = START_BOARD_KEYS.map((row) =>
  row.split("").map((k) => KEY_TO_GEM[k]),
);

/** The swap the tutorial hand points at on move 1: row/col pair. */
export const SCRIPTED_HINT = { a: { r: 2, c: 2 }, b: { r: 3, c: 2 } };

/**
 * Obsidian colours: cooled crust with the heat still trapped inside.
 * Kept a step lighter than the empty-cell background so a block never reads
 * as a hole in the board.
 */
export const OBSIDIAN = {
  rock: 0x36293f,
  edge: 0x60486e,
  seam: 0xff5a1f,
  seamHot: 0xffc247,
};

/* ---------------------------------------------------------------- the fight */

/**
 * Every knob that decides whether this is a fight or a cutscene.
 *
 * The creative used to author its own outcome: boss health stepped down a fixed
 * ladder per move, the board planted the cascade the script wanted, and heroes
 * could not die. None of that is true any more — damage is earned, the boss
 * earns its damage back, and the party can be wiped. Soften any of these to
 * walk it back towards the old unloseable version.
 */
export const DIFFICULTY = {
  /**
   * Boss health taken by one gem cleared in the first step of a match.
   *
   * 0.044, and the reason is the clock rather than a change of heart about
   * difficulty. This number has been set three times by the same argument, in
   * both directions, and every time the run length is what moved it.
   *
   * Down first: at 0.028, where the gauntlet tuning had it, a fight was twelve
   * moves deep. A move costs about three seconds to play out — the swap, the
   * cascade, the volley, the boss answering — and twelve of those is
   * thirty-six seconds against a thirty second creative. That was never a hard
   * fight inside this runtime; it was a fight that could not be finished inside
   * it, and what a viewer actually saw was a health bar that ended the ad two
   * thirds full. That is the failure mode this number exists to stay clear of.
   *
   * Then 0.075, and then 0.058, both overshot the other way. Simulated over
   * hundreds of runs (see the fight sim in the tuning notes), 0.058 killed the
   * boss at 13.9 seconds for a player taking the best swap on the board and at
   * 17.9 for an ordinary one, and it won 98% of ordinary runs. Half the
   * creative was played out after the fight had already been decided, which is
   * the same "nothing left to watch" failure as the twelve-move version wearing
   * the opposite mask.
   *
   * 0.044 was the first correction and it did not go far enough: the bar still
   * emptied in five moves and the kill still landed at 18 seconds with the
   * board barely under pressure. This is the second pass, and it is the last
   * one this knob can carry alone — see the floor at the bottom of this note.
   *
   * At 0.040 a plain triple takes about 12% off a bare boss, a four-run leading
   * a cascade is a serious dent rather than a finish, and the kill lands on
   * move six — 21 seconds for a player taking the best swap every time, 24 for
   * an ordinary one, with about a third of ordinary runs now losing outright,
   * most of them to the clock. The fight fills the window instead of ending in
   * the middle of it, and the boss's last quarter is played against a doom
   * strip that is already red.
   *
   * It is deliberately paired with a trimmed sizeBonus and comboMultiplier
   * below rather than carrying the whole cut by itself. Damage per gem is the
   * beginner's number — it is all a plain triple ever earns — while the bonus
   * tables are the expert's, and the complaint being answered here was that the
   * fight is trivial for somebody who reads the board. Taking both together
   * slows the strong player by about two and a half seconds and the weak one
   * by under a second, which is the shape the complaint asked for.
   *
   * Difficulty in a creative this short is not how many moves it takes; it is
   * T.hardCap, which is the only opponent that never misses. What this number
   * decides is whether the fight fills the time that clock gives it. Under
   * about 0.034 the twelve-move problem starts coming back: measured with these
   * bonus tables, an ordinary player's win rate crosses under a coin flip
   * there — 51% at 0.034, 45% at 0.032 — and the ad starts ending on a health
   * bar nobody emptied. That is the floor, not this.
   */
  damagePerGem: 0.04,
  /**
   * Cascade payout by step. Last entry repeats.
   *
   * Still generous — cascades turn out to be rare on a 5x5 that refuses to
   * refill into a match, a simulated fight averaging a deepest combo of about
   * 1.3 — so this is the ceiling, not the bread and butter.
   *
   * Trimmed from 1.7/2.5/3.4/4.4 with the same argument as sizeBonus below: a
   * rare event paying quadruple is how a fight ends in four moves on the one
   * run where the board happens to fall right, and that run is exactly the one
   * that reads as "it beat itself". A second step is still worth half again a
   * first, which is plenty for a cascade to feel like the board paying out.
   */
  comboMultiplier: [1, 1.55, 2.1, 2.8, 3.5],
  /**
   * Payout for clearing more than three gems in one step.
   *
   * This is where reading the board actually pays. Without it a four-in-a-row
   * beats a triple by a third and nothing else, cascades are too rare to carry
   * the difference, and playing well stops being worth the seconds it costs —
   * which showed up as a flat win rate across every skill level.
   *
   * Pushed up once as the damage floor went down — when a triple no longer
   * threatens the boss on its own, the payout for finding the bigger shape is
   * the lever a good player has left, and it has to be worth the seconds that
   * hunting for it costs them on the doom clock.
   *
   * Then trimmed from 1.5/2.3, because that lever had become the whole fight.
   * Per gem *and* per shape, a five-cell step was paying nearly four times a
   * triple, so a single good read took a third off the boss and two of them
   * ended it — which is precisely the "wins itself" the retune was asked for.
   * At 1.35 and 1.9 a four-run is still worth about 1.8 triples and a five-run
   * about 3.2, so reading the board is still the best thing a player can do
   * with their seconds; it is simply no longer the only thing that matters.
   *
   * Do not take these to 1: that was measured, and it flattens the win rate
   * across every skill level, which is the same fight for a player who reads
   * the board and one who swipes at random.
   */
  sizeBonus: { 4: 1.35, 5: 1.9 },
  /**
   * What a hero still contributes once they are down.
   *
   * Every match is a volley from the whole roster now, so this is no longer a
   * penalty on one colour — it is the share of the party's damage that dies
   * with each hero. See HeroRow.partyPower.
   *
   * At 0.28 a single loss takes 12% off every match that follows and two losses
   * take a quarter, which is enough that a party down two is not coming back.
   * That is the intent: a fight you can lose slowly is not a hard fight, it is
   * a long one, and this creative does not have the runtime to be long.
   */
  downedPenalty: 0.28,

  /**
   * The volley.
   *
   * `volleyDelay` is the beat between the match landing and the party firing
   * behind it, `volleyStagger` the gap between one hero and the next — small
   * enough that five beams read as one salvo rather than a queue. Assists hit
   * at `assistImpact` of a full impact so the hero whose colour was actually
   * matched still visibly leads the charge.
   */
  volleyDelay: 0.06,
  volleyStagger: 0.05,
  assistImpact: 0.42,

  /**
   * Arissa's charge earned per water gem cleared, and where she starts.
   *
   * She no longer arrives half charged with a free heal already waiting. From
   * 0.16, one water triple leaves her at 0.76 and the second arms her — so the
   * tide costs two moves spent on the one colour the boss is actively burying
   * (see Director.worstCell, which scores water cells up), and the player has
   * to start paying for it before the first warning rather than after it.
   *
   * The opening stake came down from 0.2 with the rest of this pass: the first
   * tide now lands a move later than it used to, which is a move of the fight
   * spent unhealed rather than a move of it skipped.
   *
   * This is the most dangerous knob in the mode to touch downwards, and two
   * triples is a hard floor rather than a preference. The threshold is discrete
   * — the numbers only ever decide whether a colour has to be worked twice or
   * three times — and at three the simulated fight loses its ultimate entirely
   * in most runs: no cut-in, no tide, no cataclysm anybody was ready for. That
   * is not difficulty, it is a coin flip with the feature switched off.
   */
  chargePerGem: 0.2,
  /**
   * What the healer's bar is dealt at — and it is dealt full.
   *
   * A stake and not a rate: it moves where Arissa's first ultimate lands and
   * nothing else, because chargePerGem above is what the rest of the fight runs
   * on. Full, so that the creative can show the ultimate at all.
   *
   * The opening demo points at a hero only once that hero's bar is actually
   * full — see Director.showLesson, which is where the rule and the reasons for
   * it are written down. Dealt at the old 0.16 nobody is ever full on the start
   * screen, so the demo had a board half and no card half, and the one mechanic
   * that separates this game from every other match-three in the feed was never
   * demonstrated before the player had to decide whether to keep watching.
   *
   * What it costs the fight is Arissa's first tide arriving free rather than
   * two triples in. On a thirty second clock against a boss whose whole threat
   * is the doom timer, that is a head start and not a broken fight — and it is
   * the healer, so the head start is survival rather than damage. Put it back to
   * 0.16 and the balance is exactly what it was; the demo goes quiet with it.
   */
  chargeStart: 1,

  /**
   * The same, for the four heroes who are not the healer.
   *
   * Deliberately slower than Arissa's: their ultimates are pure damage, they are
   * not racing the doom clock, and at her rate every single match armed
   * somebody and the fight turned into a queue of cut-ins. At this rate one
   * colour has to be worked twice before its hero is spendable, so choosing
   * which one to feed is an actual decision.
   *
   * 0.16 off a 0.06 stake is the same two triples the old 0.18/0.1 asked for,
   * arriving a beat later. Do not take it under 0.15: the tally is discrete and
   * that is where two triples stops being enough — see chargePerGem.
   */
  partyChargePerGem: 0.16,
  partyChargeStart: 0.06,
  /**
   * Flat chunk the ultimate hits for, on top of per-gem for the water it eats.
   *
   * Down from 0.3 and 1.25. That pair made one tap worth about 45% of the boss
   * — nearly half a fight from a button the player did not have to aim — and it
   * was the single biggest reason a run ended before the clock got interesting.
   * 0.24 and 1.15 were still worth about a third of the bar for one tap. At 0.2
   * and 1.05 an ultimate is a quarter of it: the largest number anybody can put
   * on the screen in one beat, still the correct answer to a wall of obsidian
   * and still the thing worth building a run around — it simply no longer pays
   * for two of the six moves the run has room for.
   *
   * The floor here is the cut-in, not the arithmetic. Take the flat chunk much
   * under 0.15 and the ultimate stops being worth the two seconds its cut-in
   * costs on T.hardCap, at which point the correct play is never to cast the
   * feature the creative is selling.
   */
  ultDamage: 0.2,
  ultGemMultiplier: 1.05,

  /**
   * THE DIFFICULTY CURVE — the staircase the whole fight is hung on.
   *
   * The shape asked for, and not approximately: the keyframes below are traced
   * off src/difficult/image.png, pixel by pixel. The drawn line was pulled out
   * of the PNG as the topmost ink in each column, normalised against its own
   * extent, and resampled — so `p` is where a landmark sits along the drawing's
   * x axis and `attack` is its height mapped onto the range 0.45 to 2.9. The
   * landmarks it gave, at a glance:
   *
   *     y      0.09  0.18  0.36  0.41  0.74  0.77  1.00   (of the drawing)
   *     p      0.00  0.22  0.42  0.68  0.82  0.90  1.00
   *
   * Which reads as: a long, steadily steepening climb over the whole first
   * half, a dead flat shelf across the middle quarter, a near-vertical catch,
   * two seconds of held breath, and a last stroke straight up. Easy to start
   * with, and the trap sprung at about seventy percent.
   *
   * Worth being blunt about the two places the trace was overruled, both for
   * the same reason. The hand drifts upward across each shelf — 1.17 to 1.31
   * on the wide one — and a shelf that creeps is a shelf nobody can feel, so
   * both are flattened to their own average. Flat is plainly what the drawing
   * means; the drift is a pen, not an intention.
   *
   * That distinction is the point of this block, because a smooth exponential
   * is what was here before — `bossRamp` to the power of the turn, times a
   * per-second `rage` — and a curve with no shelves on it is a curve a player
   * never gets to stand on. Every move was worse than the last by a little,
   * which reads as the fight sliding away rather than as the fight getting
   * harder, and it is most of what the last round of feedback was about: "it's
   * too fast, you lose too fast", and a mechanic that "should work on a
   * subconscious level" being unreadable instead. A shelf is where reading
   * happens. The player meets a new level of pressure, survives two or three
   * moves at it, and *then* the floor drops again — and because the drop is
   * announced (see Director.checkPhase) they can feel it coming.
   *
   * `steps` is the drawing, keyframed. `p` is fight progress, and everything
   * else is linearly interpolated between neighbouring keyframes — so two
   * keyframes carrying the same values are a shelf, and two carrying different
   * ones are a rise. Retune the fight by moving these points; nothing else in
   * the mode needs to know the shape.
   *
   *   attack    everything the boss throws, multiplied. See currentAttack.
   *   resist    fraction of the player's damage that lands. See armor().
   *   obsidian  blocks laid per boss turn. See pickObsidian.
   *   hold      most blocks the board carries at once, out of 25.
   *   name      shouted the moment the fight crosses this keyframe, so a rise
   *             is a beat the player sees coming rather than a bar that
   *             quietly starts moving slower. Put it on the keyframe where a
   *             rise *begins* — the announcement is a warning, not a receipt.
   *
   * The x axis is two axes, and the split is worth knowing about before moving
   * anything: `attack`, `obsidian` and `hold` are read against the clock
   * (Director.progress) and `resist` against the boss's own health bar
   * (Director.wounds). Both of those notes carry the measurements that forced
   * it — briefly, the clock is the only axis smooth enough for shelves to be
   * stood on, and health is the only one that never punishes a player for being
   * behind. The pace guard below keeps the two roughly in step, so a keyframe's
   * `p` means about the same thing in either.
   *
   * Two announced rises and no more, and that ceiling is arithmetic rather than
   * taste. A shelf is only felt when two swings in a row land on it at equal
   * strength, the boss swings every T.bossPress — four seconds — and the
   * schedule is 26 of them. Six swings for the whole run, which is room for two
   * shelves and a wall however finely the line is traced, and it is what an
   * earlier three-rise draft of this table foundered on: it measured out at
   * 0.90, 0.90, 1.27, 1.60, 1.60, 2.71, consecutive swings never equal, a slide
   * wearing a staircase's clothes. DIFFICULTY.armor's third layer name goes
   * unused here for the same reason.
   *
   * Where the six swings land on the traced line — this is the fight, as the
   * player actually meets it:
   *
   *      4s   x0.61   rake      9% of a hero bar   the climb
   *      8s   x0.92   breath    8%                 the climb
   *     12s   x1.21   smash    33%                 the shelf
   *     16s   x1.26   smash    15%                 the shelf  <- equal pair
   *     20s   x2.02   rake     30%                 the catch
   *     24s   x2.33   breath   20%                 the breath
   *     28s   x2.90   smash    78%                 the last stroke
   *
   * The resist column is deliberately budgeted to cost the same total damage
   * as the flat `armor` table it replaces — integrated, both ask for about 1.32
   * bare boss bars — so this pass changes the *distribution* of the fight and
   * not its length. Simulated over 2000 runs per skill level, before and after,
   * win rates and kill times come out the same to within a rounding error: 92%
   * at 31.2s for a weak player, 100% at 26.5s for an ordinary one, 100% at
   * 23.2s for a strong one. What changed is what the boss's swings do across
   * those same seconds — from 1.00, 1.14, 1.30, 1.48, 1.69, a slide where every
   * swing is a little worse than the last, to 0.54, 0.73, 1.15, 1.25, 1.25 and
   * then the catch. Time-to-kill still belongs to `pace` below.
   *
   * Set `enabled` false and bossRamp/armor take the fight back, smooth curve
   * and all.
   */
  curve: {
    enabled: true,
    /**
     * The clock half of progress, in seconds. Kept level with pace.seconds:
     * they are two readings of the same schedule, and a curve that finished
     * before or after the pace guard's line would be pulling against it.
     */
    seconds: 26,
    steps: [
      /**
       * The origin, and deliberately the easiest moment in the fight by a wide
       * margin.
       *
       * bossPress is 4 seconds and it starts with the fight, so the first swing
       * lands on somebody who has made one match and may not yet have worked
       * out that this is a match-three at all. Whatever sits here is what the
       * game does to a player it has not finished teaching. The old curve
       * opened at a flat 1.0 and compounded from there, and the party was
       * already chewed before the mechanic had landed — which is most of what
       * "it's too fast, you lose too fast" was about.
       */
      { p: 0.0, attack: 0.45, resist: 1.0, obsidian: 2, hold: 6 },
      /**
       * The gentlest stretch of the climb, and the reason the first half of the
       * drawing is a slope rather than a step.
       *
       * Nothing is flat here and nothing is meant to be: difficulty rises the
       * whole way from the origin to the middle of the run, slowly at first and
       * then faster. That is the drawn line, and it is a better opening than the
       * shelf an earlier pass of this table put here — a fight that is *level*
       * for its first ten seconds has nothing to say in them, where a fight that
       * is gently, steadily getting worse is teaching the player that it will.
       */
      { p: 0.22, attack: 0.7, resist: 0.94, obsidian: 3, hold: 7 },
      /**
       * Top of the climb, and the start of the long flat middle.
       *
       * The slope steepens into this point — measured off the drawing, the rise
       * roughly doubles its gradient over the stretch above — so arriving here
       * feels like the fight finally showing its teeth, right before it stops.
       */
      { p: 0.42, attack: 1.25, resist: 0.8, obsidian: 4, hold: 9 },
      /**
       * THE SHELF — a quarter of the whole run, dead flat, and the widest
       * feature on the drawing.
       *
       * Second eleven to second eighteen: nothing gets worse. This is where a
       * match-three is actually learned, and where a player who has understood
       * it gets to look good at it — the same swing every four seconds, a board
       * that stops shrinking, the ultimates they have been charging all fight
       * finally worth their cut-in.
       *
       * Its width is not a taste call. A shelf is only felt when two swings in a
       * row land on it at equal strength — one swing at a new level is an event,
       * two is a level — the boss swings every T.bossPress, and the schedule is
       * 26 seconds. That is six swings for the whole run, and it is what caps
       * this table at two shelves and a wall however finely the line is traced.
       * Here the swings at 12s and 16s both land at about 1.25.
       *
       * Traced dead flat rather than at the hand's own slight drift (1.17 rising
       * to 1.31 across it). A shelf that creeps is a shelf nobody can feel, and
       * flat is plainly what the drawing means.
       */
      {
        p: 0.68,
        attack: 1.25,
        resist: 0.8,
        obsidian: 4,
        hold: 9,
        name: "OBSIDIAN HIDE",
      },
      /**
       * THE CATCH — and on the drawing it is the most violent thing on the
       * page, a near-vertical stroke out of the middle of a flat line.
       *
       * Damage nearly doubles and a fifth more of the player's own damage stops
       * landing, across three and a half seconds. The fight the player spent
       * seven seconds getting comfortable in turns out to have been the
       * tutorial. It is meant to be startling, which is exactly why the shelf
       * above is named: the wall announces itself the moment it starts going up
       * — see Director.checkPhase. A spike the player is warned about is
       * difficulty; the same spike unannounced is a bug report.
       */
      { p: 0.82, attack: 2.2, resist: 0.6, obsidian: 7, hold: 11 },
      /**
       * The second shelf, and barely a shelf — two seconds of held breath at
       * the top of the catch before the last stroke. Drawn short on purpose:
       * by now the player is quick, and the run is nearly out of clock.
       */
      {
        p: 0.9,
        attack: 2.2,
        resist: 0.6,
        obsidian: 7,
        hold: 11,
        name: "MOLTEN CORE",
      },
      /**
       * The last stroke of the drawing, and it goes straight up.
       *
       * The golem swings for about three quarters of a hero bar and shrugs off
       * half of everything aimed back at it, on a board down to a third of its
       * cells, with the doom strip already red. Every clock in the mode arrives
       * together here, which is the point — this is a climax, not a difficulty
       * setting.
       *
       * 0.5 resist is a floor rather than a preference. Under about half, a
       * player who earned the kill watches their damage stop mattering, and that
       * reads as the game cheating rather than as armour. What keeps this the
       * right side of that line is how little of the run it covers.
       */
      { p: 1.0, attack: 2.9, resist: 0.5, obsidian: 8, hold: 12 },
    ],
  },

  /**
   * Blocks laid per boss turn: base, plus this much more each turn.
   *
   * The curve-off path. With `curve.enabled` the wave and its ceiling come off
   * the staircase's `obsidian` and `hold` columns instead, so that the board
   * tightens on the same beat as everything else rather than on a schedule of
   * its own — a squeeze arriving between two announced rises is the one kind of
   * pressure the player has no way to read.
   *
   * The growth carries the squeeze rather than the base: an opening wave of
   * three still leaves the board readable for a first-timer, and 1.2 a turn
   * means the endgame is fought on a board the player is visibly running out
   * of. This costs tempo rather than health, which is the honest way to make a
   * match-3 harder — a smaller board is fewer options to read, not a hidden
   * multiplier on anything.
   */
  obsidianBase: 3,
  obsidianGrowth: 1.2,
  /**
   * Never hold more than this many cells at once, out of 25 — except that the
   * ceiling itself climbs, by obsidianMaxGrowth per boss turn, up to
   * obsidianMaxCap.
   *
   * A fixed ceiling is a promise that the board stops shrinking, and the whole
   * point of this pass is that it never does. Opening lower than the old flat
   * ten and ending higher means the first two turns still breathe while the
   * endgame is played on a third of a board, which is where the fight is meant
   * to be decided.
   *
   * 12 is the hard stop rather than 25: past that ensurePlayable() spends most
   * turns reshuffling a dozen gems in a corner, and a board that reshuffles
   * every move is random, not hard.
   */
  obsidianMax: 9,
  obsidianMaxGrowth: 0.9,
  obsidianMaxCap: 12,

  /**
   * Boss attack damage, multiplied by this to the power of the turn index.
   *
   * The curve-off path, and the smooth exponential `curve` above was written to
   * replace. Read the rest of this note as the argument for why a compounding
   * per-turn ramp is *a* difficulty curve — it is, and a defensible one — and
   * the note on `curve` for why it is the wrong one for a thirty second
   * creative: every move worse than the last by a little is a fight with
   * nowhere for the player to stand and learn.
   *
   * Not gentle any more. At 1.14 the golem's fifth swing lands nearly twice as
   * hard as its first and its eighth two and a half times, so a fight that runs
   * long does not merely stay dangerous — it accelerates away from the player.
   * The ramp and the doom clock are two clocks racing each other now, and that
   * is the design rather than an accident of tuning.
   *
   * It compounds with rage() below, which is why it is not steeper: at 1.24 the
   * two together took the sixth swing past a full hero bar and the fight ended
   * in a single unanswerable turn instead of an escalation anybody could read.
   *
   * The move up from 1.13 is a single notch on purpose. This one is a cliff:
   * simulated at 1.15 with the rest of this pass, the party wipe rate for an
   * ordinary player jumped from nothing to a fifth of all runs, because a fight
   * that now lasts a move and a half longer is also a fight that eats one more
   * swing off the top of the ramp. Longer already made the boss more dangerous;
   * this only makes sure the extra turns are felt.
   */
  bossRamp: 1.14,

  /**
   * Rage: everything the boss throws, multiplied by this much per second of
   * wall clock, capped at rageMax.
   *
   * bossRamp punishes taking many turns. This punishes taking a long time over
   * them, which is the thing a turn counter cannot see. Hunting the board for a
   * five-run is a real strategy and it stays one — but thirty seconds in
   * the multiplier is 1.36 and still climbing, with the golem hitting for a
   * third again what it opened with. rageMax sits above what a run can reach on
   * purpose: what the player is meant to feel is the climb, not a ceiling the
   * fight flattens out against. Thinking stops being free.
   *
   * Cut from 0.012/1.45 with the curve, and it had to be: a multiplier that
   * climbs every frame is the one thing that can flatten a shelf, and the
   * shelves are the whole shape now. It is not switched off, because it is
   * still the only thing that answers a player standing still inside a single
   * step of the staircase — but the seconds a stall costs are now mostly
   * charged by the curve itself, which walks forward on the clock when the
   * health bar will not (see curve.steps). At 0.005 and a 1.18 ceiling a shelf
   * drifts up about six percent across the three or four moves spent on it:
   * felt, and not a rise.
   */
  ragePerSecond: 0.005,
  rageMax: 1.18,

  /**
   * The boss's hide, thickening as its health drops.
   *
   * The curve-off path. With `curve.enabled` the hide is the staircase's
   * `resist` column, which is this idea kept and given shelves: the layers here
   * are three cliffs the bar falls off, where the curve ramps into each one
   * over a tenth of the fight and then holds. The total is budgeted to match —
   * both tables ask for about 1.32 bare boss bars — so what changed is where
   * the fight is expensive, not how expensive it is.
   *
   * Ordered deepest first: the first entry whose `below` the boss has
   * fallen under wins, and every point of damage from then on is multiplied by
   * `mult`. This is the progression the mode was missing. The bar does
   * not fall at a constant rate; it fights back harder the closer it gets to
   * empty, and the last fifteen percent costs two thirds again what the first
   * fifteen did.
   *
   * `name` is shouted the moment a layer breaks, because armour the
   * player cannot see is not difficulty, it is a bug report — see
   * Director.checkPhase.
   *
   * Thickened from 0.6/0.72/0.85, which asked for about 23% more total damage
   * than a bare boss; these ask for about 40%. The extra is deliberately loaded
   * onto the back half rather than spread evenly — the opening still has to
   * read as the player hitting hard, and what needed fixing was a bar that
   * emptied at the same speed all the way down and so had no last act at all.
   *
   * Deliberately survivable: the wall at the end has to be a climax, not a
   * brick. 0.52 on the last layer is the floor — anything under ~0.5 and a
   * player who earned the kill watches their damage stop mattering, which reads
   * as cheating rather than as armour.
   */
  armor: [
    { below: 0.15, mult: 0.52, name: "MOLTEN CORE" },
    { below: 0.35, mult: 0.66, name: "OBSIDIAN HIDE" },
    { below: 0.65, mult: 0.8, name: "HARDENED" },
  ],

  /**
   * The pace guard: how much of a hit the boss shrugs off for being behind on
   * the clock. Read and explained in full by Director.pace.
   *
   * `seconds` is the schedule the fight is held to — a straight line from a
   * full bar at the first playable frame to an empty one here. It is 26 rather
   * than the 25 that was asked for because damage lands in lumps: the killing
   * blow overshoots the line by most of a move, and measured over hundreds of
   * runs a 26 second schedule puts the kill at 24.9 seconds for a player
   * swiping every 1.8 seconds, 25.2 at 2.2 and 25.7 at 2.6 — the spread across
   * every pace a person actually plays at is under a second, which is the whole
   * point of holding a line rather than picking a damage number.
   *
   * That tight spread is also why the schedule survives a bad estimate of what
   * a beat costs. The guard reads the clock, so anything that makes the fight
   * slower — a longer cut-in, a deeper cascade — also advances the line and
   * releases the grip by exactly as much. Doubling the modelled cost of an
   * ultimate moved the measured kill by three tenths of a second.
   *
   * Keep it under T.hardCap by a clear margin. The schedule is a floor under
   * the fight's length, not a promise about it, and a schedule that runs to the
   * cap leaves the guard still biting when the deadline collects — which turns
   * every good run into a timeout.
   *
   * `bite` 2 is the mildest setting that holds the line; 1 lets a strong player
   * back to 21 seconds and above 2.5 buys almost nothing for a bar that visibly
   * stops moving. `floor` 0.18 is the least that ever lands.
   */
  pace: {
    enabled: true,
    seconds: 26,
    bite: 2,
    floor: 0.18,
  },

  /**
   * How much weaker Arissa's tide gets every time it is spent.
   *
   * The heal is the one thing in the fight that undoes damage already taken,
   * and a heal as good on its third cast as on its first is an unlimited supply
   * of second chances. Each cast tops the party up ten points lower than the
   * last — 60%, then 50%, then 40% — floored by ULT_HEAL_FLOOR: the tide buys
   * the run twice, and after that it is only buying a turn.
   */
  healDecay: 0.1,

  /**
   * Off: the board no longer rewrites refilled gems into the cascade the script
   * wanted. Turn back on and every move hits its scripted combo again.
   */
  rigCascades: false,

  /**
   * Deal a fresh opening board every run instead of the authored START_BOARD.
   *
   * On, and paired with the bare reseed() in main.js: every run opens on its
   * own arrangement. The deal is retried until it has no free match sitting on
   * it and offers the MIN_SWAPS the board owes at every other moment, so a
   * random opening is still a fair one. Turn off, together with a fixed
   * RUN_SEED, to go back to the one hand-authored demo board.
   */
  randomOpening: true,
};

/**
 * The seed a pinned run starts from.
 *
 * Unused by default: main.js calls a bare reseed(), so every run rolls its own
 * seed and gets its own board — its own opening deal, its own refills, its own
 * obsidian. Pass this to reseed() in main.js when a run has to be reproducible
 * — a bug worth replaying, or a recording where everyone must see the same
 * fight — and set randomOpening:false above to pin the opening deal with it.
 */
export const RUN_SEED = 0x2f6e2b1;

/**
 * The doom clock.
 *
 * The boss is not waiting politely for the player to finish. It is charging one
 * cataclysm the whole fight, and when the clock runs out it lands on the entire
 * party at once. This — not a move counter — is what makes the fight urgent:
 * every second spent hunting for a better match is a second off the timer.
 */
export const DOOM = {
  /**
   * Seconds from the first playable frame to the first cataclysm.
   *
   * Thirty, which is the length of the whole creative — so read what this now
   * is rather than what it says: a thirty second countdown that runs out at the
   * end of the run and nowhere before it. T.hardCap is 30 and the clock is
   * armed the moment the intro is off the screen, so what the strip has left
   * when the cap collects is exactly what the intro cost — about two seconds —
   * and Director.timeUp drives that last sliver to zero itself before the
   * cataclysm lands.
   *
   * Kept equal to the run on purpose: the clock on screen was asked for as the
   * length of the creative, so when the creative moved the clock moved with it
   * — which has now happened three times, in both directions, and this number
   * went with it every time: 15, then 20, then 25, now 30.
   *
   * What that costs is the mechanic in the middle of the fight. The clock
   * cannot reach zero while there is still a fight to land a cataclysm in, so
   * `repeat` and everything under it only ever describe the one cast timeUp
   * makes. What does survive is the last few seconds of a run the deadline
   * collects: warnAt is 4 and 2 and panicAt is 3.5, all three of which a capped
   * run reaches, so the strip goes red and KOLTMOS IS CHARGING still gets said
   * on the way into it.
   *
   * That is a deliberate choice and not a regression — the timer on screen was
   * asked for as the length of the creative, whatever that length is. It was 9,
   * which is three moves: it landed in the middle of the fight, after the player
   * had felt the bar move and before the kill, with room for exactly one repeat
   * behind it, so the deadline arrived once as a threat and once as proof it was
   * not a bluff. Put it back at 9 and the mechanic comes back with it.
   */
  seconds: 30,
  /**
   * Every cataclysm after the first — and each one arrives sooner than the one
   * before it, shortened by repeatDecay and floored at repeatFloor.
   *
   * A fixed repeat is a metronome, and a metronome is something a player
   * settles into. Five, then 3.9, then a flat 3 — and inside thirty
   * seconds the second is usually the last one the fight lives to see. The decay is kept
   * anyway: it is what makes the first repeat feel like the deadline closing
   * rather than the same beat again, and a player who stalls does meet the
   * third.
   */
  repeat: 5,
  repeatDecay: 0.78,
  repeatFloor: 3,
  /**
   * Fraction of HERO_MAX_HP the cataclysm takes off every hero. Set against
   * ULT_HEAL_TO: a freshly healed party lives on a sliver, a chewed-up one
   * does not live at all.
   */
  damage: 0.4,
  /**
   * And every cataclysm after the first is multiplied by this again.
   *
   * 40%, then 48%, then 58%, then 69%. The first is survivable by a party that
   * has not been chewed on; the third is survivable only by one that was healed
   * in between, and the fourth is not survivable at all. That escalating
   * deadline is the spine of the whole mode — it is what stops a careful player
   * simply outlasting the fight, and it is why the tide's decay matters.
   *
   * Kept well under a full bar on purpose. At 0.9 the cataclysm did not kill
   * heroes, it killed the party, all six at once and always on the same beat:
   * the fight had one failure mode and no attrition at all. Heroes should fall
   * one at a time, to the slam that singles out the weakest, and the cataclysm
   * should be the thing that makes them weak.
   */
  damageRamp: 1.2,
  /** Seconds remaining at which the boss shouts a warning. */
  warnAt: [4, 2],
  /** Below this the clock turns red and pulses. */
  panicAt: 3.5,
};

export const BOSS_MAX_HP = 10000000;
export const BOSS_NAME = "KOLTMOS";

/* ------------------------------------------------------------------- timing */

export const T = {
  /**
   * The auto-hint — the lesson putting itself back up for a player who stalled.
   *
   * On, and what it shows is the opening lesson rather than the bare swipe loop
   * this flag used to mean: the pair that is already lined up lights, the stone
   * that would complete the run gets an arrow, the hand carries it across, and
   * the three light as one. See ui/coach.js and Director.showLesson, which is
   * the single door both the opening hint and this one now come through — they
   * were two code paths showing two different things, which meant the help a
   * stalled player got mid-fight was the weaker of the two and did not look
   * like the thing that had taught them the rule thirty seconds earlier.
   *
   * It was off, for a reason that was real: it shipped at half a second of
   * silence, so it came back after every settled cascade and was a gauntlet
   * permanently in the way of the thing it was pointing at. What fixes that is
   * what it waits for, not switching the help off — `hint` below is two
   * seconds of a settled board with nobody touching it, the escalation waits
   * for `pulse`, the swap is solved again at the moment of showing rather than
   * remembered from when it was armed, and any touch takes the whole thing off
   * screen inside a frame.
   *
   * The hand still never rides the player's own finger — that is `touchHand`
   * below, on its own switch, and still off.
   */
  hints: true,
  /**
   * The game swapping gems for the player — off.
   *
   * This is the one that made three-in-a-rows on its own: it solved the board
   * and played the best swap for a viewer who had never touched the screen. See
   * Director.armAutoPlay, which is the only path in and is gated here.
   *
   * Off, and `bossPress` below is why it can be. The two used to be the same
   * decision because the boss only ever swung after a player turn, so switching
   * the demo off took the beams, the damage numbers and every boss beat with it
   * and left a board sitting still until T.hardCap collected. The boss has his
   * own clock now. Nobody touches the board unless a person does; the fight is
   * still a fight to watch.
   */
  autoPlay: false,
  /**
   * Seconds of nobody touching the board before the boss takes a turn anyway,
   * and again every this many after that. See Director.armBossPress.
   *
   * The boss's turn was hung off the player's: swipe, resolve, boss swings. That
   * is right for somebody playing and wrong for somebody watching, because it
   * makes the whole monster a function of the board. He has a rotation of his
   * own — BOSS_ATTACKS, and `turn` walks it whoever moved last — so all this
   * does is let it advance on time instead of on permission.
   *
   * 4 against moveCost's 2.8: comfortably longer than a move takes to play out,
   * so a player mid-cascade is not interrupted by a swing they did not earn,
   * and short enough that the twenty-four and a half playable seconds of a
   * thirty second run hold six of them.
   *
   * Six, where a twenty second run held four, and the two extra are not free:
   * the rotation aims at whoever is closest to falling, so a run that goes the
   * full distance now drops a hero or two on the way. Left as it is on purpose.
   * A fight cut to end in four or five moves is over before the sixth beat is
   * ever played, so the only player who meets those two is the one who is not
   * killing the boss — which is precisely who the pressure is for. It is still
   * not a wipe: partyWiped wants all six down, and the cataclysm at the end is
   * what does that. See Director.timeUp.
   *
   * A share of the run rather than a fixed beat, which is why it moved when
   * the run did: 3.2 held six inside twenty-five, and 4 holds six inside
   * thirty. Left at 3.2 the longer run would have handed the golem two extra
   * swings nobody asked for. Shorten the run and this comes back down with it.
   *
   * The clock restarts on every player turn, so a swipe is always answered by
   * the swing it earned rather than by two of them at once.
   */
  bossPress: 4.0,
  /**
   * The hand under the player's own thumb — off.
   *
   * The same prop driven from the other end: it turned up where the finger
   * landed and rode the swipe out with it, so the gesture on screen was the
   * gesture being made. Which is a lovely idea and wrong on a phone. The finger
   * is already there — it is the one thing on the glass that needs no
   * illustrating — and what the prop actually did was put a painted gauntlet
   * over the three cells the player was trying to look at, on every swipe, for
   * the whole run. The hand is a teaching aid, and it is finished teaching the
   * moment somebody touches the board.
   *
   * So the prop now has exactly one appearance in the creative: the opening
   * lesson, before the first touch. See `openingHint` below, and
   * Director.spendOpeningHint for the moment it is put away for good.
   *
   * Flip it back on and Hand.grab/dragTo/letGo are wired up again in Director's
   * constructor; nothing else has to change.
   */
  touchHand: false,
  /**
   * The opening entrance — one duration for every piece of it.
   *
   * The intro is one shot, not four, and this is the number that makes it one.
   * The boss climbing out of the pool, the board sliding up off the bottom of
   * the screen, the party fading up into the row and the HUD coming on all
   * start on the same frame and all land on the same frame, because all four
   * are handed this and nothing else. See Director.intro, which is the only
   * place it is read — Boss.rise, Board.slideIn and HeroRow.introIn each take
   * it as an argument rather than reaching for it, so there is exactly one
   * number to move.
   *
   * They used to run 0.95 / 0.55 / 0.35 / 0.4, which started together and then
   * finished in four separate instalments: the HUD arrived, then the party,
   * then the board, then a quarter of a second later the boss — an assembly
   * queue where a single arrival was wanted. Each still keeps its own curve, so
   * the board still overshoots and the boss still eases out; what they no
   * longer keep is their own clock.
   *
   * 0.95, which is what the rise was: the slowest mover set the length of the
   * shot before and still does, so the intro costs the run exactly what it
   * always cost — about two seconds of T.hardCap, which is what every other
   * number in this file is fitted around.
   */
  introIn: 0.95,
  /**
   * The entrance itself — off.
   *
   * `introIn` above is its length and stays correct; this is whether it is
   * played at all, and it is not. There is nothing left for it to bring on:
   * the arena is assembled from the first frame drawn, so the four movers would
   * be taking a screen the player is already looking at, throwing it away and
   * putting it back the instant they touched it.
   *
   * That is a consequence of losing the screen in front of it rather than a
   * change of mind about the shot. The entrance was written to arrive into
   * something — first an empty arena behind a gate, then an empty arena with a
   * line of type on it — and both of those were asked for and then taken out
   * again, in that order, because a playable's first frame is the one moment it
   * is guaranteed to be looked at and neither of them spent it on the game.
   * With nothing in front, an arena held empty for the entrance to fill is the
   * same mistake a third time: a creative showing anything other than itself.
   *
   * So the fight is simply there, and the touch is answered by the fight
   * starting rather than by the screen assembling — the flash, the roar and the
   * shake, which were always the part of the opening that had the monster in
   * it. See Director.armIntro and Director.intro, which is the only reader of
   * this, and Boss.rise, Board.slideIn and HeroRow.introIn, which are all still
   * here and all still correct.
   *
   * Flip it back to true and the opening shot comes back exactly as it was.
   */
  entrance: false,
  /**
   * Idle before the auto-hint puts the lesson back up.
   *
   * Every touch restarts this timer, so does every boss beat, and so does the
   * turn itself — see Director.beginIdle, restartIdle and refreshHint — so at
   * the half second it shipped at the hand was effectively always on screen.
   * Two is what it says it is: something that turns up for a player who has
   * actually stalled, on a clock where stalling for four would be a fifth of
   * the whole creative.
   *
   * Measured from a board that has stopped moving, not from the last event:
   * Director.escalate holds the lesson back while a cascade or a wave of
   * obsidian is still in the air, because the marks are placed from cell
   * positions and mid-cascade the gems are not on their cells.
   */
  hint: 2.0,
  /**
   * Idle before the hint stops suggesting and starts insisting: the hand goes
   * up a size and the two gems it is pointing at light under it.
   *
   * Two and a half seconds after the lesson began, which is about one full pass
   * of it — so the escalation lands on somebody who has watched the whole
   * thing once and still not moved, rather than on top of the first showing.
   */
  pulse: 4.5,
  /**
   * Idle before the opening hint — the first of the two, and the shorter wait.
   *
   * `hints` above is the auto-hint: the same lesson, on the same board, put
   * back up any time somebody stalls for `hint` seconds. This is the one that
   * runs before anybody has touched anything, and it is on a wait of its own
   * because the two are answering different questions — this one is for a
   * player who does not yet know the board is a board, so it does not make
   * them earn it by stalling for two full seconds first.
   *
   * Spent on the first touch and never armed again — see
   * Director.spendOpeningHint. Somebody who swipes inside the first second
   * never sees it at all, which is exactly the intent: it is for the player
   * who hesitates, and it is over the moment they stop hesitating.
   *
   * On the first *touch*, and this file has always said so — the director used
   * to spend it on the first move that landed instead, and put the hand back
   * on this timer after any touch that did not produce one. A first-timer's
   * opening gesture is a tap on nothing or a swap that bounces, so in practice
   * the prop kept returning over the board between fumbled swipes, which is
   * how a single demonstration turned into a gauntlet that would not take no
   * for an answer. One showing is all it owes anybody.
   *
   * Zero: it is on screen from the first frame, before the player has had a
   * moment to wonder what the grid is for. It waited a second, which sounds
   * like nothing and is a twentieth of the whole creative — the impression
   * that is looked at for two and scrolled past saw a still arena with no
   * instruction in it at all, which is the one case this hint exists for.
   * There is nothing left for it to talk over either: the MATCH TO ATTACK
   * shout goes up on the touch, and the touch is what takes the hint away.
   *
   * Any number of seconds holds it back again; null turns it off outright.
   */
  openingHint: 0,
  /**
   * The ult lesson — the frame round a charged hero card and the hand tapping
   * it. See Director.teachUlt and Coach.playCard.
   *
   * On, and it is the second half of what this creative teaches. `hints` above
   * teaches the board; nothing taught the row underneath it. A hero fills, the
   * card grows and glows and puts up READY, the HUD shouts TAP ARISSA for two
   * thirds of a second — and a player who has spent the whole run looking at
   * the board is told about a control they have never touched by a caption that
   * is gone before they look down.
   *
   * What it costs to miss is the largest number in the fight: an ultimate is a
   * quarter of the boss's bar (see DIFFICULTY.ultDamage) and the healer's is
   * the only thing in the run that clears obsidian or picks the party up. A
   * creative that never shows it is selling five heroes and demonstrating none.
   */
  ultHints: true,
  /**
   * How long the READY shout is given before the lesson arrives.
   *
   * The shout goes up the instant the bar fills and holds for 0.7 — see
   * Director.chargeParty. This lands inside that, so the hand turns up while
   * the hero's name is still on screen and the two read as one sentence rather
   * than as two announcements a second apart.
   */
  ultHintIn: 0.5,
  /**
   * How long the lesson holds the prop before handing it back to the board.
   *
   * Long enough for two full taps and the beat between them, and no longer: a
   * hand parked on a card points away from the board for as long as it is up,
   * and the player still has a fight to play. Somebody who ignores it and keeps
   * matching gets one more go when the next hero charges — see `ultHintShows`.
   */
  ultHint: 3.2,
  /**
   * How many times the ult lesson may be offered in one run.
   *
   * Twice. Once is a demonstration that can be missed while the boss is
   * roaring; three times, on a thirty second clock with five heroes charging
   * off five colours, is a hand that will not leave the row alone.
   *
   * Spent whether or not the offer was taken, and never reached at all by a
   * player who taps a card: the first tap on any of them ends the lesson for
   * the rest of the run. See Director.onCardTap.
   */
  ultHintShows: 2,
  /**
   * Idle before the game plays the move itself — and it only ever did that for a
   * viewer who had not touched the screen once. See Director.armAutoPlay.
   *
   * Unreachable while `autoPlay` above is false, and kept for when it is not.
   */
  auto: 2.4,
  /**
   * Floor under the autoplay delay, once the pace guard has worked out how many
   * moves the boss still owes — see Director.autoDelay.
   *
   * A third of a second of nothing on top of T.moveCost, which is the move
   * playing itself out, so the fastest the demo ever goes is a move every three
   * and a bit seconds. It only reaches that when the boss is deep enough that
   * the run cannot afford anything slower. It is a pace, not a stampede — but
   * the whole run is thirty seconds, and a second of dead air is a thirtieth
   * of the ad spent watching nothing.
   */
  autoFloor: 0.35,
  /**
   * The persistent CTA lockup drops in at this point on the clock.
   *
   * The wordmark over the PLAY NOW plate — the end card's own two pieces at HUD
   * size, see `banner` in core/layout.js. It said INSTALL on gem-banner art
   * until the two CTA surfaces were made one lockup, and it is not going back:
   * the one persistent surface in the fight should name the game rather than
   * the chore, and it should be the thing the player is being walked towards.
   *
   * A third of the way in: late enough that the opening is the fight and not a
   * store button, early enough that it is on screen for the two thirds of the
   * creative anybody is still watching.
   *
   * A third of the run and nothing else — a share rather than a duration, so
   * it moves every time T.hardCap does. It has now moved three times: 5 when
   * the run was fifteen, 6.7 at twenty, 8.3 at twenty-five, 10 at thirty.
   */
  banner: 10.0,
  /**
   * Absolute cutoff — end card is forced no matter where the player is.
   *
   * Thirty seconds, because that is the creative. Everything else in this
   * file is fitted to it rather than the other way round: DOOM.seconds so the
   * clock on screen is the length of the thing it is counting, `banner` so the
   * store button lands a third of the way in, finaleReserve so the death still
   * gets played, DIFFICULTY.damagePerGem so the boss can be dead before it.
   *
   * That last one is the thing to know about this number. The damage curve is
   * cut to a dead boss in four or five moves, and moveCost puts a move at 2.8
   * seconds. Thirty, less about two for the intro and the 3.5 of
   * finaleReserve, leaves twenty-four and a half playable seconds — eight
   * moves, against a fight balanced to end in five.
   *
   * That gap is the whole reason the number has climbed three times. At fifteen the
   * run held nine and a half playable seconds and three moves, and the fight as
   * balanced did not fit inside it at all: playing well still ended with the
   * boss standing, which is not difficulty, it is a creative that stops before
   * its own climax. At twenty it held five and a bit, which is the fight
   * exactly and no room for a mistake in it — one fumbled swipe and the clock
   * collected instead of the player. Twenty-five was the first number with
   * slack in it, and thirty is that with a beat spare: a player who reads the
   * board kills the boss with two or three moves in hand, and one who spends
   * the opening working out what a match even is — reads the line, watches the
   * coach show it once, fumbles a swipe — can still get there. Nobody is being
   * given the fight; they are being given the time to lose a move or two to it.
   *
   * This number is what the run is racing — see Director.run, where it is
   * literally the other half of a Promise.race — and it is also the fight
   * difficulty, because it is the one opponent that never misses.
   */
  hardCap: 30.0,
  /** beat after the boss dies before the outcome screen */
  victoryHold: 1.4,
  /**
   * How long the outcome screen holds itself up before moving on, in seconds.
   *
   * Measured from the moment its last control lands rather than from the moment
   * it arrives — see OutcomeScreen.show — so it is five seconds of a screen
   * standing still, not five seconds of one assembling itself.
   *
   * It exists for the impressions nobody touches, which is a large share of
   * them. A card with no way off it but a tap is a creative that ends on the
   * verdict rather than at the store, and the whole point of giving the verdict
   * a card of its own was to earn the one that follows it, not to replace it.
   *
   * Under three, because there is one word on it. The card used to be a
   * scoreboard and this number used to be five; with the statistics, the party
   * row and the two buttons gone there is nothing left to read, and a screen
   * held past the moment it has been understood is a screen the player is
   * waiting out. Long enough to land the flash, the stamp and the line asking
   * for a tap, and not a beat longer.
   */
  outcomeHold: 2.8,
  /**
   * Time held back for the death animation and the beat after it. The autoplay
   * pace guard treats this as untouchable so a hands-off viewer still sees the
   * boss explode instead of being cut off by the hard cap.
   *
   * Three and a half of the thirty, which is most of what the collapse and
   * `victoryHold` actually take. Trimming it further buys one more move and
   * spends the only moment in the creative that is pure payoff to get it.
   */
  finaleReserve: 3.5,
  /**
   * Rough cost of playing out one move, used by the same pace guard.
   * Covers the cascade and the boss turn that follows the swap — the boss
   * turn lays its obsidian inside the same beat it attacks, so this stayed
   * cheap even after the counterattacks went in.
   */
  moveCost: 2.8,
};

/* --------------------------------------------------------------- spotlight */

/**
 * The scrim behind the lesson: the screen goes dark everywhere except the
 * cells the hand is pointing at.
 *
 * The creative already taught the move — the frames, the arrow, the stone that
 * travels, the hand that drags it (see ui/coach.js and ui/hand.js). What none
 * of that could do is say *where to look*. A first-timer meeting a five by five
 * board, a golem, a doom clock and six hero cards inside one second has four
 * competing bright things on screen and a pair of outlined gems somewhere among
 * them; the marks were correct and nobody found them.
 *
 * So the rest of the screen is taken away for as long as the lesson is up. A
 * hole is cut over the pair being taught, everything outside it is dimmed, and
 * the one lit thing left is the thing the hand is on. See ui/spotlight.js.
 *
 * `on: false` turns it off outright and the lesson goes back to what it was.
 *
 * ## The dark stays, the ring does not
 *
 * What the argument above does not account for is the *shape* it was drawn in.
 * The hole was cornered at half its own height, which makes a stadium: on a run
 * of three cells that is a pill, on one cell a circle, and either of them laid
 * over a grid of round gems reads as a bubble sitting on the board rather than
 * as light falling on it. Round it was struck a rim in the lesson's colour, and
 * on a board that is already mostly dark that pale arc was the loudest thing on
 * screen — a line belonging to nothing, cutting across the gems it was pointing
 * at. Moved onto a hero card for the demo's second half, it did the same to the
 * row.
 *
 * So the dim stays and both of those are gone: no rim at all, and the hole
 * cornered at `corner` below, which is a soft-edged rounded rectangle around
 * the cells being taught. What the player sees is the rest of the screen
 * falling away, which is the whole of what this was for.
 */
export const SPOTLIGHT = {
  on: true,
  /**
   * How dark the world goes outside the hole, for the opening lesson — the one
   * that runs before the creative has been touched.
   *
   * Deep, because at that moment there is nothing to be looked at except the
   * lesson: no clock is running, the boss has not moved, and every point of
   * attention the scrim takes away from the arena it hands to the one gesture
   * the player has to make. Not opaque — the fight stays legible through it,
   * which is the whole reason the arena is on screen in the first frame at all.
   */
  dim: 0.72,
  /**
   * And the same scrim during the fight, for the auto-hint that turns up when
   * somebody stalls mid-run.
   *
   * Much lighter, and that is not timidity. By then the player is reading the
   * boss's health, the doom clock and their own party as well as the board, and
   * a hint that blacks all three out to point at two gems is not helping them
   * play — it is interrupting them. Enough to pull the eye, not enough to hide
   * the fight it is a hint about.
   */
  dimInPlay: 0.42,
  /*
   * Unreachable as it stands, and kept rather than deleted.
   *
   * The scrim is now the opening lesson's alone — see Coach.reaim, which puts it
   * away for every hint after that one — so nothing asks for the shallow dim any
   * more. The number is left here, and the code path under it in ui/spotlight.js
   * with it, because the thing that changed is one `if` in the coach: bringing
   * the in-play scrim back is deleting that guard, and it should find its own
   * depth still written down when it does.
   */
  /** The colour the screen is taken down to — the same night the app clears to. */
  color: 0x05030a,
  /**
   * Clearance between the cells being taught and the edge of the hole, as a
   * fraction of a board cell.
   *
   * None. The box the board lesson hands in is already the *frames* it is about
   * to draw — Coach.reaim grows the bounding box of the taught cells by
   * FRAME_SPAN, half a cell each way — so a hole cut on it stops exactly where
   * the brackets stop, and the light has the shape of the marks in it and no
   * other. There is still air between the light and the gems themselves, and it
   * is the air the frames were given: a disc is 0.86 of a cell inside a frame of
   * FRAME_SPAN, which is a hair over it.
   *
   * This stood at 0.22, on the argument that a hole cut exactly on the gems
   * reads as a rectangle somebody drew on the board while a little air round
   * them reads as a light on them. What that missed is what the air is measured
   * against. A fifth of a cell on every side of a two-by-three run is a lit
   * margin about a third the size of the thing inside it, most of it over gems
   * the lesson is *not* teaching — so the rectangle it was trying not to draw
   * got drawn anyway, just bigger, and with four unrelated gems half in it. Cut
   * on the marks, the lit shape is the taught cells and the eye has nothing
   * else in the light to account for.
   *
   * Only the board lesson reads this now: the hero card brings a clearance of
   * its own, because a card is not a cell — see CARD_HOLE_PAD in ui/coach.js.
   */
  pad: 0,
  /**
   * How far the edge of the hole is smeared out, in cells, and in how many
   * steps.
   *
   * One step, which is to say no smear at all: the light is one rectangle with
   * an edge on it.
   *
   * This stood at four, on the argument that a hard edge on a scrim reads as a
   * cut-out and the bands would composite into a curve nobody could see the
   * seams of. On the screen they were plainly four: four rounded rectangles
   * nested inside one another round a single hero card, each a visibly
   * different shade, which is not a falloff — it is four lights arguing about
   * where the one light ends. The whole point of the scrim is that there is
   * exactly one place for the eye to go, and a border made of four concentric
   * outlines is four more things to look at than the card inside it.
   *
   * `feather` is left at its span because it costs nothing and is what a
   * smoother falloff would be measured in: raising `featherSteps` well past
   * four — twenty or so — is the other way out of the banding, where the seams
   * go below what the eye resolves instead of the edge going hard. One is the
   * cheaper answer and the one that reads as a light on a card, so it is the one
   * that is set.
   */
  feather: 0.55,
  featherSteps: 1,
  /**
   * The hole's corner, in cells. Zero: the light is a plain rectangle.
   *
   * A fixed radius and not a fraction of the box, which is what stopped it
   * being a stadium — cornered at half its own height, a run of three cells
   * came out a pill and a single gem a circle. At a fifth of a cell it was a
   * rounded rectangle instead, and rounded was still wrong: the board is a
   * grid, the cells being taught are a rectangle of it, and a corner radius on
   * the light is a shape the board does not have. Square, the hole reads as
   * *these cells* and nothing else.
   *
   * And it is now every hole's corner, the hero card's included. The card hands
   * in a radius of its own — it has one, and the light used to trace it — but
   * what that bought was the one shape on screen the argument above rejects
   * everywhere else, wrapped round the one thing the lesson is pointing at. A
   * light is square here whatever it is lighting. See Coach.reaim, which is
   * where the card's own corner is dropped on the way to the scrim, and
   * Coach.cardBox, which still carries it for the drawn fallback frame.
   *
   * Dropped, and not sent in as a zero: a radius that arrives is grown by `pad`
   * on its way through Spotlight.aim, so a zero handed in comes out a fifth of a
   * cell. This number is the one that is reached by saying nothing.
   */
  corner: 0,
  /** How long the scrim takes to arrive, and to move when the lesson re-aims. */
  fade: 0.28,
  travel: 0.34,
};

/* ------------------------------------------------------------------- audio */

/**
 * Sound, all of it synthesized at runtime — see src/audio/engine.js.
 *
 * Nothing is ever heard before the first touch, whatever these say: the browser
 * suspends a context that was not opened by a gesture, and the creative does not
 * fight that. `on: false` is the switch for a placement that forbids audio
 * outright; it costs nothing at runtime beyond a handful of early returns.
 */
export const AUDIO = {
  on: true,
  /**
   * Master level.
   *
   * Deliberately shy of the ceiling. Playables are watched at whatever volume
   * the last thing the player opened set, and a creative that arrives louder
   * than the app it interrupted gets muted for the rest of the session.
   */
  master: 0.55,
  /** The lava room tone under the fight. */
  bed: true,
  bedLevel: 0.035,
  /**
   * Play the game's own recordings rather than the synthesized palette.
   *
   * See audio/samples.js. Thirty-three one-shots lifted out of the game — the
   * boss's roar, the blade, the match clear, the victory horn — in one sprite,
   * plus the game's volcano ambience on a loop under the board, for about
   * 416 kB base64'd into the single inlined file.
   *
   * Turning it off plays audio/sfx.js exactly as it always played, and so does
   * a webview that will not decode an MP3: every event falls through to its
   * synthesized version on its own. This switch is for the mix, not for
   * compatibility — nothing goes missing either way.
   */
  sfxSamples: true,
  /**
   * Master for the recorded one-shots, over the level each already carries.
   *
   * Each slice in samples.js keeps the gain its synthesized twin was tuned to,
   * so the palette balances against itself the way it did; this is the one
   * number that moves all thirty-three against the music and the room.
   */
  sfxSampleLevel: 1.0,
  /**
   * Seconds of room inside room.mp3, past the silence it opens with.
   *
   * The loop is crossfaded into itself at exactly this length. It is the cut,
   * not a measurement — changing the asset means changing this. See tracks.js,
   * where the two music cuts carry the same number for the same reason.
   */
  roomLoop: 7.0,
  /**
   * The theme over it — see audio/music.js, which plays it rather than loads it.
   *
   * Level set against the bed and the palette rather than picked: at 0.09 the
   * horn line is audible under a five-step cascade and the kick is felt under
   * the boss's fists, and neither one is competing with them. Music that wins
   * that fight is music that ate the feedback the player's own taps are made of.
   * Turn `music` off for placements that want the room and the hits alone.
   */
  music: true,
  musicLevel: 0.09,
  /**
   * Prefer the game's own score over the written theme.
   *
   * See audio/tracks.js. Two cuts out of the game itself — sixteen bars of the
   * battle track under the fight, twelve of the lobby theme under the end card
   * — for about 416 kB base64'd into the single inlined file, against the five
   * megabytes the spec allows. Turn it off and audio/music.js plays the
   * synthesized theme it always did, at no cost but the unreferenced asset.
   *
   * Off is also what a device that cannot decode an MP3 gets, without anybody
   * setting it: the fallback is automatic and this switch is for the mix, not
   * for compatibility.
   */
  musicTracks: true,
  /**
   * Level for the recorded cuts — the one number to turn if the mix is wrong.
   *
   * Higher than `musicLevel` and not comparable to it. That one scales a synth
   * whose voices peak near full scale on every note; this scales a mastered
   * stereo mix whose RMS is a fraction of its peaks, so the same number would
   * put the recording far under the fight. Set against the bed and the palette
   * the way `musicLevel` was: loud enough to be recognisably the game's music,
   * quiet enough that a five-step cascade still lands on top of it.
   */
  musicTrackLevel: 0.22,
  /**
   * The lobby theme under the end card.
   *
   * The card is a store pitch, and the game's own menu music is what the store
   * is selling. Off leaves the card to the sting in sfx.js and nothing else,
   * which is what it had before the score went in — see `music.endcard`.
   */
  musicEndcard: true,
  /**
   * Play through the iOS ring/silent switch.
   *
   * Web Audio with no media element behind it runs in an ambient session, and
   * an ambient session is silenced by the hardware switch — not by the volume
   * keys, so a player in silent mode presses volume-up at a mute creative and
   * gets nowhere. Turning this on asks iOS 16.4+ for a `playback` session,
   * which is the one session type that ignores the switch. It is asked for
   * from inside the first gesture and before the context is constructed — see
   * `session` in audio/engine.js, where the ordering is the part that matters.
   *
   * On, and it is a trade rather than a free win. A playback session also
   * stops whatever the player was listening to, and an ad that kills a podcast
   * to sell a match-3 has bought itself a worse impression than a silent one.
   * It is on anyway because the alternative turned out to be worse in
   * practice: silent-switch iPhones are a large share of impressions, the
   * report from the floor was volume-up doing nothing at a mute creative —
   * which is the switch's exact signature — and this creative's feedback is
   * carried almost entirely by its sound. Set it back to false for placements
   * where interrupting the player's own audio is the bigger cost.
   *
   * Covers every iPhone that can run this creative at all, by two different
   * routes: `navigator.audioSession` on iOS 16.4 and up, and a media element
   * playing silence on the versions below it, which is what tells iOS the page
   * is playing media rather than making ambient noise. The floor under both is
   * Pixi's — v8 needs WebGL2, so iOS 15 is the oldest phone that renders the
   * fight in the first place. Android and the desktop have no silent switch
   * and are left alone by both halves. See audio/session.js.
   */
  overrideSilentSwitch: true,
  /**
   * Voices allowed in the air at once.
   *
   * A five-step cascade with a six-hero volley behind it can ask for forty
   * inside a second. Past this the extras are dropped rather than queued — a
   * late sound is worse than a missing one, and the cheap phones this creative
   * targets start dropping frames long before they run out of oscillators.
   */
  maxVoices: 18,
};

/* --------------------------------------------------------------- store URLs */

/**
 * Where a tap goes.
 *
 * Three destinations rather than two, because the end card wears three badges
 * and each one is a promise about where it leads — see BADGE_STORE below, and
 * net/cta.js, which does the routing.
 *
 * Locale-free on purpose. `apps.apple.com/app/id…` and the bare Play `details`
 * URL both redirect into the storefront the device is already signed in to; a
 * `/us/` or an `&hl=en` in here sends a player in Warsaw to a listing they
 * cannot install from.
 *
 *   ios      Invokers: Titan Legacy, HitZone Inc. Matched to the Android build by
 *            bundle id rather than by title — both stores carry it as
 *            `hitzone.anima.spirit.guardians` — because the game has been renamed
 *            once already and the name is the one field that does not hold still.
 *   android  the same build on Play. The package still says what the game shipped
 *            under; the listing is live under the new name.
 *   pc       the game's own site, which is where the PC and Mac launcher is handed
 *            out. Deliberately not the installer: that download is a signed CDN
 *            URL with an expiry stamped into it, and a creative that runs for a
 *            quarter would start handing out a dead link partway through.
 */
export const STORE_URL = {
  ios: "https://apps.apple.com/app/id6755186220",
  android:
    "https://play.google.com/store/apps/details?id=hitzone.anima.spirit.guardians",
  pc: "https://invokers.com/",
};

/**
 * Which of the three each badge on the end card asks for, keyed by the badge ids
 * in art/brand.js.
 *
 * Anything not in here — the PLAY NOW plate, a tap on the card itself — has no
 * store of its own to ask for and gets the one the device belongs to. That is
 * the whole difference between the plate and the badges: the plate says play,
 * and the badges each say where.
 */
export const BADGE_STORE = {
  appstore: "ios",
  googleplay: "android",
  pcmac: "pc",
};

/* -------------------------------------------------------------------- copy */

export const COPY = {
  /**
   * The line over the fight before anybody has touched the creative.
   *
   * A caption, not a screen. There was a title card here once — scrim,
   * wordmark, this line under it — and then this line over an arena held empty
   * behind it; both are gone and what is behind it now is the game itself. See
   * ui/startprompt.js.
   *
   * Says GAME, and the word is not filler: this is shown inside somebody
   * else's app, where a line reading START could as easily be about the thing
   * they were already doing. It also deliberately avoids PLAY, which is the
   * store button on every other surface in the creative — see `cta` below.
   */
  start: "CLICK TO START THE GAME",
  /**
   * The opening line, and it names the rule now rather than assuming it.
   *
   * "MATCH TO ATTACK" is an instruction to somebody who already knows what a
   * match is. Plenty of the people this is shown to have never played one, and
   * they get thirty seconds to work it out with a golem roaring at them.
   * The number is the whole of the difference: it is the one word that turns a
   * verb nobody has a definition for into a thing to count. The rest of the
   * teaching is done in pictures — see ui/coach.js.
   */
  tutorial: "MATCH 3 TO ATTACK",
  /**
   * How long the opening line is held, in seconds.
   *
   * Its own number rather than the 0.6 default, and longer than any other
   * shout in the fight. Every other callout names something the player has
   * just watched happen — a combo, a layer breaking, lava landing — so it only
   * has to label a picture they already have. This one arrives before the
   * player has any picture at all and is the only sentence in the whole run
   * that says what the game is. 1.6 puts it comfortably clear of the boss's
   * first attack callout, which is the next thing that overwrites it.
   */
  tutorialHold: 1.6,
  /** `{hero}` is filled in with whoever just charged. */
  ultReady: "TAP {hero}",
  victory: "VICTORY",
  /**
   * The end card wears the painted wordmark — see art/brand.js — and this is
   * only ever read by a device that could not decode it. It says what the
   * wordmark says, or the fallback would be selling a different game.
   */
  endTitle: "INVOKERS\nTITAN LEGACY",
  endSub: "COLLECT YOUR HEROES",
  /**
   * Read by a device that could not decode the plate, and by nothing else.
   *
   * Both CTA surfaces wear the same painted plate now — the end card's and the
   * one the HUD carries through the fight — and PLAY NOW is baked into the art
   * on each. There is no second word: the HUD banner used to say INSTALL, which
   * spent the only persistent surface in the fight naming a chore instead of
   * the game.
   */
  cta: "PLAY NOW",
  /**
   * The second button on the defeat card, and the only surface in the whole
   * creative that does not point at the store.
   *
   * It exists because a wipe is the one ending a player can disagree with. The
   * card's own argument — see the `defeatTitle` note below — is that nothing on
   * it discusses the result; this does not discuss it either, it just offers the
   * fight back. Somebody who wants another thirty seconds is somebody still
   * playing, and a card that answers "no, install it" to that has spent the one
   * moment the player was asking for the game rather than being sold it.
   *
   * Only on a loss. A win has nothing to try again.
   */
  retry: "RETRY",

  /* ----------------------------------------------------- the outcome card */

  /**
   * The verdict, on the card that is only the verdict — see ui/outcome.js.
   *
   * Its own two keys rather than `victory` and `defeat` above, and the split is
   * not tidiness. Those two are *shouts*: fired over the arena while the fight
   * is still resolving, and `defeat` says PARTY WIPED because that is what the
   * player just watched happen to six cards. The card is not narrating a moment,
   * it is naming a result, and the word for that result is DEFEAT. One key doing
   * both jobs would have to pick one, and every argument for either is an
   * argument against the other.
   *
   * `victory` no longer has a shout to be the wording for — a win says the word
   * once, here, on the card; see Director.win — and it stays because the end
   * card's stood-down outcome line is still built from it.
   *
   * These are drawn as type rather than as art, the way the game draws them: the
   * band they sit in is the painted part and the word inside it is localised
   * text. See art/outcomeui.js.
   */
  outcomeVictory: "VICTORY",
  outcomeDefeat: "DEFEAT",
  /**
   * The one instruction the card carries, and the whole of its interface.
   *
   * TAP and not CLICK, and not PLAY: PLAY is the store button on every other
   * surface in the creative — see `cta` — and a card where it means "go on"
   * against a card where it means "install" teaches the player to distrust the
   * one control the whole thing is selling.
   */
  tapContinue: "TAP TO CONTINUE",

  lava: "LAVA SPREADS!",
  lavaHint: "BREAK IT",
  ultClear: "BOARD CLEARED!",
  breath: "LAVA BREATH!",
  smash: "MAGMA SLAM!",
  /** The swing the beast opens on, and the only one it repeats. */
  rake: "CLAW RAKE!",
  /** The third swing — it does not exist until the boss has earned it. */
  eruption: "ERUPTION!",
  ultHeal: "TEAM HEALED!",
  /* the fight can now be lost, and it says so out loud */
  doomLabel: "CATACLYSM",
  doomWarn: `${BOSS_NAME} IS CHARGING!`,
  doomSoon: "BRACE!",
  doomCast: "CATACLYSM!",
  doomSurvived: "WE HELD!",
  down: "HERO DOWN!",
  shuffle: "NO MOVES — RESHUFFLE",
  defeat: "PARTY WIPED",
  /**
   * No `defeatTitle`, no `defeatSub`, and no `defeatCta`.
   *
   * The end card used to carry two lines about having lost — "MAGMAROTH WINS"
   * over the wordmark and "BUILD A STRONGER SQUAD" under it. They are gone, and
   * with them the last difference between the two cards: whatever happened in
   * the fight, the card is the wordmark, the painting, the plate and the badges,
   * and nothing on it discusses the result.
   *
   * The fight still says it out loud while it is happening — `defeat` above is
   * shouted over the wipe. What the pitch does not do any more is open by
   * telling somebody they lost.
   *
   * The CTA never had a key either: it is a painted plate with PLAY NOW on it, so
   * a key that changed the wording would change nothing on screen, and a knob
   * that does nothing is worse here than no knob at all.
   */
};

/**
 * The UI face: everything the game labels rather than announces.
 *
 * Hitzone first, which is the type the Invokers Titan Legacy build sets its own
 * interface in — so every label here is now the same face the player meets in
 * the game itself, rather than a layout wearing whatever the device had. Elan
 * ITC Pro sits behind it, still briefed and still without bytes in this repo,
 * and the system stack behind that for a device that cannot decode a file at
 * all. See ui/fonts.js, where the head of this list ships as bytes.
 */
export const FONT =
  '"Hitzone", "Elan ITC Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The display face: the boss's name, the hero's name on an ultimate, and the
 * end card's headline. Three places, all of them large, all of them a name
 * being announced — which is the whole argument for a second font. Anything
 * that is read rather than heard stays on FONT.
 *
 * Hitzone Med is the game's own answer to the same question: the cut its build
 * keeps for the titles it draws on gold, and a heavier cut of the face FONT is
 * set in rather than a different design. So the distinction between the two
 * constants is no longer a difference in kind of type but one of weight and
 * size — which is the point of asking for one family everywhere, and why plain
 * Hitzone sits directly underneath as the fallback rather than a serif.
 */
export const FONT_TITLE =
  '"Hitzone Med", "Hitzone", "Elan ITC Pro", Georgia, "Times New Roman", serif';

/**
 * The verdict's face: the one word on the outcome card, and nowhere else.
 *
 * VICTORY and DEFEAT ask for Elan ITC Pro ahead of Hitzone rather than behind
 * it — the only two words in this creative that do. That card is a held frame
 * with a single word laid across it, which is the one place in the game where a
 * serif's modelling is large enough to read as drawing rather than as noise,
 * and the one place a face that is not the game's own interface type cannot be
 * mistaken for a label.
 *
 * Elan is licensed and has no bytes in this repo, so until a cut is dropped into
 * assets/fonts/ this list resolves to its second name and the card draws in
 * Hitzone Med exactly as it did before — the fallback is the previous design,
 * not a degraded one. See ui/fonts.js, which loads whatever is on disk, and
 * assets/fonts/README-elan.md for what to buy and how to name it.
 */
export const FONT_OUTCOME =
  '"Elan ITC Pro", "Hitzone Med", "Hitzone", Georgia, "Times New Roman", serif';

/* ------------------------------------------------------------------ heroes */

/**
 * The roster — all five of it.
 *
 * None of these are set dressing any more. Every hero swings on every match,
 * every hero charges off their own colour, and every hero has an ultimate the
 * player can spend. `heal` marks the one whose ultimate also picks the party
 * up; `skill` is the name the cut-in shouts.
 */
export const HEROES = [
  { name: "RICKLOW", element: FIRE, skill: "MAGMA LANCE" },
  { name: "ARISSA", element: WATER, heal: true, skill: "ABYSSAL TIDE" },
  { name: "QUINNTO", element: NATURE, skill: "VERDANT WRATH" },
  { name: "SELISA", element: LIGHTNING, skill: "STORM VERDICT" },
  { name: "SILANTH", element: ARCANE, skill: "VOID ECLIPSE" },
  // Sixth card, and last on purpose: HEALER is an index into this array.
  { name: "TARANIS", element: WIND, skill: "CYCLONE EDGE" },
];

/**
 * Index into HEROES of the healer — the only ultimate that is not just damage.
 *
 * Named for the job rather than for whoever is doing it. It was `NYX`, which
 * meant every rename of the roster was also a rename across four files, and a
 * constant that lies about which card it points at is worse than a dull one.
 */
export const HEALER = 1;

/* ------------------------------------------------ the boss hits back */

/** Hero health. Simulated now, not authored: these numbers decide the fight. */
export const HERO_MAX_HP = 8000;

/**
 * What a full charge is called on the card.
 *
 * Presentation and nothing else. The charge itself is a fraction from 0 to 1 —
 * every rule in DIFFICULTY is written in those terms and none of them read this
 * — but a gauge with numbers on it has to say a number, and "0.44" is not what a
 * party-management screen says. 120 is the figure the mockup was drawn with, and
 * at DIFFICULTY.chargePerGem it makes a matched gem worth a round 26.
 */
export const HERO_MAX_CHARGE = 120;

/**
 * Floor under every hit. At 0 heroes really fall and the party can be wiped,
 * which is the whole point of the mode — raise it back to 0.12 and the old
 * unloseable creative comes straight back.
 */
export const HERO_HP_FLOOR = 0;

/** Below this fraction the card blinks red. */
export const HERO_CRITICAL = 0.42;

/**
 * The counterattack rotation. The boss cycles it, and every pass hits harder
 * by DIFFICULTY.bossRamp — so the longer the fight runs, the worse it gets.
 *
 *   kind     "breath" — cone of fire over the whole party
 *            "smash"  — both fists into the floor, one hero takes the brunt
 *   targets  "all", "lowest" (the hero closest to falling), or explicit indices
 *   damage   fraction of HERO_MAX_HP taken by a target
 *   splash   fraction taken by everyone else (smash only)
 *
 * "lowest" rather than a fixed target: a golem that finishes off the wounded is
 * both nastier and more honest than one that politely spreads its damage, and
 * it is what makes a single bad move actually cost a hero.
 */
export const BOSS_ATTACKS = [
  /**
   * The rake, and it is first for a reason that is about the creative and not
   * about the fight.
   *
   * `bossPress` is 4 seconds against roughly twenty-four playable ones, so this
   * rotation gets all four entries played in a run and the first of them is the
   * only one everybody sees. Whatever sits at index 0 is what a boss *is* to a
   * viewer who scrolls past at eight seconds — and the note this was written
   * for is exactly that: the beast reads as scenery, the screen shakes and
   * nothing on it swung. So the run opens on the one beat where the monster
   * visibly comes at the player.
   *
   * Single target, and lighter than the slam. It is played most often, it is
   * the shortest beat on the track, and it is the one the run opens on before
   * anybody has made a match — a party chewed up by the opening swing is a
   * party that meets ERUPTION on turn three with nothing left.
   *
   * 0.15 rather than 0.14, and the slam 0.27 rather than 0.26. Both are one
   * notch and no more. The fight got a move and a half longer everywhere else
   * in this pass, which already hands the golem an extra swing off the top of
   * DIFFICULTY.bossRamp; the numbers here only have to make sure the party
   * arrives at the last two moves visibly chewed rather than untouched. Pushed
   * a full step further — 0.16 and 0.28 together with a 1.15 ramp — the
   * simulated wipe rate for a weak player went past three runs in four, which
   * is the "you lose too fast" the previous round of feedback was about.
   */
  {
    kind: "rake",
    targets: "lowest",
    damage: 0.15,
    splash: 0.045,
    shout: COPY.rake,
  },
  { kind: "breath", targets: "all", damage: 0.085, shout: COPY.breath },
  {
    kind: "smash",
    targets: "lowest",
    damage: 0.27,
    splash: 0.05,
    shout: COPY.smash,
  },
  /**
   * The third swing — and it does not exist until the boss's third turn.
   *
   * A two-beat rotation is learned in one pass and after that it is weather.
   * This one arrives exactly when the player believes they have the pattern:
   * everybody takes real damage, and `obsidianBonus` puts two extra
   * blocks on the board on top of the turn's usual wave, so the turn that hurts
   * most is also the turn that costs the most room to answer it.
   *
   * `from` is the turn index it unlocks on, and a swing that has just
   * come off cooldown jumps the queue — see Director.currentAttack.
   */
  {
    kind: "smash",
    targets: "all",
    damage: 0.11,
    obsidianBonus: 2,
    shout: COPY.eruption,
    from: 3,
  },
];

/**
 * How far Arissa's tide refills the party. Deliberately not a full heal any more:
 * the ultimate has to be worth building towards without erasing every mistake
 * that came before it.
 */
export const ULT_HEAL_TO = 0.6;

/**
 * How far DIFFICULTY.healDecay is allowed to grind that down across a fight.
 *
 * A third of a health bar is still worth casting for — it is one more boss
 * swing lived through — and it is not worth building a whole run around.
 * Drawing that line is the entire job of the floor.
 */
export const ULT_HEAL_FLOOR = 0.32;
