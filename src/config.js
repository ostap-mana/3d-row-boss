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
   * 0.058, and the reason is the clock rather than a change of heart about
   * difficulty. This number has been set twice by the same argument, once in
   * each direction, and both times the run length is what moved it.
   *
   * Down first: at 0.028, where the gauntlet tuning had it, a plain triple
   * takes 8% off a boss that also armours up as it falls (see `armor`), so a
   * fight is twelve moves deep. A move costs about three seconds to play out —
   * the swap, the cascade, the volley, the boss answering — and twelve of those
   * is thirty-six seconds against a thirty second creative. That was never a
   * hard fight inside this runtime; it was a fight that could not be finished
   * inside it, and what a viewer actually saw was a health bar that ended the
   * ad two thirds full. That is the failure mode this number exists to stay
   * clear of, and it is what took it up to 0.075.
   *
   * Then 0.075 overshot the other way once the run grew to thirty. A triple
   * took 22% through the armour, a four-run leading a cascade ended the fight
   * outright, and four moves killed a boss inside a window that holds eight —
   * the bar fell off a cliff and the back third of the creative had nothing
   * left in it to watch.
   *
   * At 0.058 a triple takes about 17%, the same four-run is a serious dent
   * rather than a finish, and the kill lands around move six: still two moves
   * of slack against the clock for a player who fumbles one, and all six of
   * them have something at stake. Anything under about 0.05 and the twelve-move
   * problem starts coming back — that is the floor, not this.
   *
   * Difficulty in a creative this short is not how many moves it takes; it is
   * T.hardCap, which is the only opponent that never misses. What this number
   * decides is whether the fight fills the time that clock gives it.
   */
  damagePerGem: 0.058,
  /**
   * Cascade payout by step. Last entry repeats.
   *
   * Generous, but cascades turn out to be rare on a 5x5 that refuses to refill
   * into a match — a simulated fight averages a deepest combo of about 1.3 —
   * so this is the ceiling, not the bread and butter.
   */
  comboMultiplier: [1, 1.7, 2.5, 3.4, 4.4],
  /**
   * Payout for clearing more than three gems in one step.
   *
   * This is where reading the board actually pays. Without it a four-in-a-row
   * beats a triple by a third and nothing else, cascades are too rare to carry
   * the difference, and playing well stops being worth the seconds it costs —
   * which showed up as a flat win rate across every skill level.
   *
   * Pushed up again as the damage floor went down. When a triple no longer
   * threatens the boss on its own, the payout for finding the bigger shape is
   * the only lever a good player has left, and it has to be worth the seconds
   * that hunting for it costs them on the doom clock.
   */
  sizeBonus: { 4: 1.5, 5: 2.3 },
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
   * 0.2, one water triple leaves her at 0.86 and the second arms her — so the
   * tide costs two moves spent on the one colour the boss is actively burying
   * (see Director.worstCell, which scores water cells up), and the player has
   * to start paying for it before the first warning rather than after it.
   *
   * This is the most dangerous knob in the mode to touch downwards. Below this
   * the first cataclysm lands on a party that never had a way to be ready for
   * it, and that is not difficulty, it is a coin flip.
   */
  chargePerGem: 0.22,
  chargeStart: 0.2,

  /**
   * The same, for the four heroes who are not the healer.
   *
   * Deliberately slower than Arissa's: their ultimates are pure damage, they are
   * not racing the doom clock, and at her rate every single match armed
   * somebody and the fight turned into a queue of cut-ins. At this rate one
   * colour has to be worked twice before its hero is spendable, so choosing
   * which one to feed is an actual decision.
   */
  partyChargePerGem: 0.18,
  partyChargeStart: 0.1,
  /** Flat chunk the ultimate hits for, on top of per-gem for the water it eats. */
  ultDamage: 0.3,
  ultGemMultiplier: 1.25,

  /** Blocks laid per boss turn: base, plus this much more each turn. */
  obsidianBase: 3,
  obsidianGrowth: 1,
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
  obsidianMax: 8,
  obsidianMaxGrowth: 0.9,
  obsidianMaxCap: 12,

  /**
   * Boss attack damage, multiplied by this to the power of the turn index.
   *
   * Not gentle any more. At 1.13 the golem's fifth swing lands nearly twice as
   * hard as its first and its eighth two and a half times, so a fight that runs
   * long does not merely stay dangerous — it accelerates away from the player.
   * The ramp and the doom clock are two clocks racing each other now, and that
   * is the design rather than an accident of tuning.
   *
   * It compounds with rage() below, which is why it is not steeper: at 1.24 the
   * two together took the sixth swing past a full hero bar and the fight ended
   * in a single unanswerable turn instead of an escalation anybody could read.
   */
  bossRamp: 1.13,

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
   */
  ragePerSecond: 0.012,
  rageMax: 1.45,

  /**
   * The boss's hide, thickening as its health drops.
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
   * Together these ask for about 23% more total damage than a bare boss.
   * Deliberately survivable: the wall at the end has to be a climax, not a
   * brick. Anything under ~0.5 on the last layer and a player who earned the
   * kill watches their damage stop mattering, which reads as cheating.
   */
  armor: [
    { below: 0.15, mult: 0.6, name: "MOLTEN CORE" },
    { below: 0.35, mult: 0.72, name: "OBSIDIAN HIDE" },
    { below: 0.65, mult: 0.85, name: "HARDENED" },
  ],

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
   * A second, against an intro that ends around two and a playable window of
   * about nineteen and a half. Late enough not to talk over the MATCH TO
   * ATTACK shout, early enough that hesitating is not most of the run.
   */
  openingHint: 1.0,
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
  /** beat after the boss dies before the end card */
  victoryHold: 1.4,
  /**
   * Time held back for the death animation and victory shout. The autoplay
   * pace guard treats this as untouchable so a hands-off viewer still sees the
   * boss explode instead of being cut off by the hard cap.
   *
   * Three and a half of the thirty, which is most of what the collapse and
   * the shout actually take. Trimming it further buys one more move and spends the
   * only moment in the creative that is pure payoff to get it.
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
   * which is the one session type that ignores the switch.
   *
   * Off by default, because a playback session also stops whatever the player
   * was listening to, and an ad that kills a podcast to sell a match-3 has
   * bought itself a worse impression than a silent one. Turn it on only for
   * placements where the sound is the point.
   */
  overrideSilentSwitch: false,
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
   */
  {
    kind: "rake",
    targets: "lowest",
    damage: 0.14,
    splash: 0.04,
    shout: COPY.rake,
  },
  { kind: "breath", targets: "all", damage: 0.085, shout: COPY.breath },
  {
    kind: "smash",
    targets: "lowest",
    damage: 0.26,
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
