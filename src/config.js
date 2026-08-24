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
   * Back to 0.075, from the 0.028 the gauntlet tuning took it down to, and the
   * reason is the clock rather than a change of heart about difficulty.
   *
   * At 0.028 a plain triple takes 8% off a boss that also armours up as it
   * falls (see `armor`), so a fight is twelve moves deep. A move costs about
   * three seconds to play out — the swap, the cascade, the volley, the boss
   * answering — and twelve of those is thirty-six seconds. The creative is
   * twenty. So the gauntlet was never a hard fight inside this runtime; it was
   * a fight that could not be finished inside it, and what a viewer actually
   * saw was a health bar that ended the ad two thirds full.
   *
   * At 0.075 a triple takes 22% through the armour and a four-run leading a
   * cascade ends it outright. Four or five moves is a dead boss, four or five
   * moves is what twenty seconds holds, and the bar is visibly moving in every
   * one of them. Difficulty in a creative this short is not how many moves it
   * takes; it is T.hardCap, which is the only opponent that never misses.
   */
  damagePerGem: 0.075,
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
   * five-run is a real strategy and it stays one — but twenty seconds in the
   * multiplier is already 1.24, and by the hard cap it is pinned at the ceiling
   * with the golem hitting for half again what it opened with. Thinking stops
   * being free.
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
   * Off. The board is a fixed, hand-authored layout and it stays that way: the
   * creative is a demo of one specific board, and re-dealing it on every boot
   * meant nobody ever saw the same fight twice — including the people reviewing
   * it. Turn back on together with a bare reseed() (see RUN_SEED) for a
   * different opening every run.
   */
  randomOpening: false,
};

/**
 * The seed every run starts from.
 *
 * Fixed, and paired with randomOpening:false above: together they are what make
 * the board the same board every single time — the same opening deal, the same
 * refills dropping into the same cells, the same obsidian landing in the same
 * places. Pass undefined to reseed() in main.js to go back to a board nobody
 * can predict.
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
   * Fifteen, which is the length of the whole creative — so read what this now
   * is rather than what it says: the clock is a fifteen second countdown that
   * never reaches zero. T.hardCap is 15, the intro spends about two of them and
   * T.finaleReserve holds back 3.5, so there are about 9.5 playable seconds and
   * the label runs 15 down to 5 or so before the end card takes the screen.
   *
   * Kept equal to the run on purpose: the clock on screen was asked for as the
   * length of the creative, so when the creative moved the clock moved with it.
   *
   * Which means the cataclysm does not fire, and neither does anything hung off
   * it: no KOLTMOS IS CHARGING at warnAt[0], no BRACE at warnAt[1], no red
   * pulse under panicAt, no wipe, no WE HELD. The doom strip drains about three
   * quarters of its length and the run ends. Everything from `repeat` down is
   * still correct and still unreachable.
   *
   * That is a deliberate choice and not a regression — asked for as a twenty
   * second timer on screen, with the run left at twenty. It was 9, which is
   * three moves: it landed in the middle of the fight, after the player had felt
   * the bar move and before the kill, with room for exactly one repeat behind
   * it, so the deadline arrived once as a threat and once as proof it was not a
   * bluff. Put it back at 9 and the mechanic comes back with it.
   */
  seconds: 15,
  /**
   * Every cataclysm after the first — and each one arrives sooner than the one
   * before it, shortened by repeatDecay and floored at repeatFloor.
   *
   * A fixed repeat is a metronome, and a metronome is something a player
   * settles into. Five, then 3.9, then a flat 3 — and inside twenty seconds the
   * second is usually the last one the fight lives to see. The decay is kept
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
   * The idle hint — the hand demonstrating a swap on its own, and the gem
   * highlight that escalates out of it — off.
   *
   * It shipped at half a second of silence, which meant it came back after
   * every single settled cascade. On a board this small that is not a guide, it
   * is a gauntlet permanently in the way of the thing it is pointing at.
   *
   * Off means nothing points at a cell of its own accord and no gems light up
   * at `pulse`. The hand still rides the player's own swipe — that is
   * `touchHand` below, on its own switch, because a hand that follows a finger
   * already on the glass suggests nothing to anybody.
   *
   * Flip it back to true and the two delays below decide the pacing again.
   */
  hints: false,
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
   * 3.2 against moveCost's 2.8: a shade longer than a move takes to play out,
   * so a player mid-cascade is not interrupted by a swing they did not earn,
   * and short enough that the nine and a half playable seconds of a fifteen
   * second run hold three of them. Three beats does not wipe the party at
   * BOSS_ATTACKS damage — the cataclysm at the end does that, see
   * Director.timeUp — which is the shape wanted: the party is worn down for the
   * whole run and dropped at the end of it.
   *
   * The clock restarts on every player turn, so a swipe is always answered by
   * the swing it earned rather than by two of them at once.
   */
  bossPress: 3.2,
  /**
   * The hand under the player's own thumb — on.
   *
   * The same prop driven from the other end: it turns up where the finger lands
   * and rides the swipe out with it, so the gesture on screen is the gesture
   * being made. It never proposes a move, which is why it outlives `hints`
   * being off. See Hand.grab and the wiring in Director's constructor.
   */
  touchHand: true,
  /**
   * Idle before the hint hand appears, when `hints` is on.
   *
   * Every touch restarts this timer and so does every boss beat — see
   * Director.restartIdle and refreshHint — so at the half second it shipped at
   * the hand was effectively always on screen. Two and a bit is what it says it
   * is: something that turns up for a player who has actually stalled, on a
   * clock where stalling for four would be a fifth of the whole creative.
   */
  hint: 2.2,
  /** idle before the hand pulses harder and gems highlight */
  pulse: 4.5,
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
   * the whole run is twenty seconds, and a second of dead air is a twentieth of
   * the ad spent watching nothing.
   */
  autoFloor: 0.35,
  /**
   * Persistent INSTALL banner drops in at this point on the clock.
   *
   * A third of the way in: late enough that the opening is the fight and not a
   * store button, early enough that it is on screen for the two thirds of the
   * creative anybody is still watching.
   *
   * A third of fifteen rather than of twenty — this is a share of the run, and
   * it moved when the run did.
   */
  banner: 5.0,
  /**
   * Absolute cutoff — end card is forced no matter where the player is.
   *
   * Fifteen seconds, because that is the creative. Everything else in this file
   * is fitted to it rather than the other way round: DOOM.seconds so the clock
   * on screen is the length of the thing it is counting, finaleReserve so the
   * death still gets played, DIFFICULTY.damagePerGem so the boss can be dead
   * before it.
   *
   * That last one no longer holds and is the thing to know about this number.
   * It was twenty, and the damage curve was cut to it: at damagePerGem 0.075 a
   * dead boss is four or five moves, and moveCost puts a move at 2.8 seconds.
   * Fifteen, less about two for the intro and the 3.5 of finaleReserve, leaves
   * nine and a half playable seconds — three moves and a bit. So the fight as
   * balanced does not fit in the run any more, and a viewer playing it well can
   * still be cut off with the boss standing. Raising damagePerGem is what closes
   * that, and it is a balance decision rather than a timing one.
   *
   * This number is what the run is racing — see Director.run, where it is
   * literally the other half of a Promise.race — and it is also the fight
   * difficulty, because it is the one opponent that never misses.
   */
  hardCap: 15.0,
  /** beat after the boss dies before the end card */
  victoryHold: 1.4,
  /**
   * Time held back for the death animation and victory shout. The autoplay
   * pace guard treats this as untouchable so a hands-off viewer still sees the
   * boss explode instead of being cut off by the hard cap.
   *
   * Three and a half of the twenty, which is most of what the collapse and the
   * shout actually take. Trimming it further buys one more move and spends the
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
  tutorial: "MATCH TO ATTACK",
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
  cta: "PLAY NOW",
  banner: "INSTALL",
  lava: "LAVA SPREADS!",
  lavaHint: "BREAK IT",
  ultClear: "BOARD CLEARED!",
  breath: "LAVA BREATH!",
  smash: "MAGMA SLAM!",
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
 * Oswald, condensed, and the system stack behind it for a device that cannot
 * decode the file — see ui/fonts.js, which is where the bytes are and why they
 * were worth spending after a build that ran on the system stack alone.
 */
export const FONT =
  '"Oswald", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The display face: the boss's name, the hero's name on an ultimate, and the
 * end card's headline. Three places, all of them large, all of them a name
 * being announced — which is the whole argument for a second font. Anything
 * that is read rather than heard stays on FONT.
 */
export const FONT_TITLE = '"Cinzel", Georgia, "Times New Roman", serif';

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
