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
 * below, START_BOARD and the gem art, and NYX is a hard-coded index into
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
   * At 0.05 a plain triple took 15% and the bar barely moved to the eye: a
   * fifteen-hundredth of the arena's width per gem, under a chevron whose empty
   * channel was almost invisible. 0.075 puts a triple at 22% and a four-run at
   * 44%, so every match visibly bites — and the fight is over in five or six
   * matches instead of seven, which is the trade. Drop it back to stretch the
   * creative out again.
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
   */
  sizeBonus: { 4: 1.45, 5: 2.0 },
  /**
   * What a hero still contributes once they are down.
   *
   * Every match is a volley from the whole roster now, so this is no longer a
   * penalty on one colour — it is the share of the party's damage that dies
   * with each hero. See HeroRow.partyPower.
   */
  downedPenalty: 0.45,

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
   * Nyx charge earned per water gem cleared, and where she starts.
   *
   * Tuned so a single water match arms her, because with a twelve second doom
   * clock the player only gets about three moves before the first cataclysm and
   * her heal is the only way to live through one. At two thirds of this rate
   * the simulated ultimate fired in one fight out of ten and the fight was
   * unwinnable: 14% of runs survived, against 50-64% now.
   */
  chargePerGem: 0.3,
  chargeStart: 0.5,

  /**
   * The same, for the four heroes who are not the healer.
   *
   * Deliberately slower than Nyx's: their ultimates are pure damage, they are
   * not racing the doom clock, and at Nyx's rate every single match armed
   * somebody and the fight turned into a queue of cut-ins. At this rate one
   * colour has to be worked twice before its hero is spendable, so choosing
   * which one to feed is an actual decision.
   */
  partyChargePerGem: 0.22,
  partyChargeStart: 0.1,
  /** Flat chunk the ultimate hits for, on top of per-gem for the water it eats. */
  ultDamage: 0.2,
  ultGemMultiplier: 1.4,

  /** Blocks laid per boss turn: base, plus this much more each turn. */
  obsidianBase: 2,
  obsidianGrowth: 0.5,
  /** Never hold more than this many cells at once, out of 25. */
  obsidianMax: 10,

  /**
   * Boss attack damage, multiplied by this to the power of the turn index.
   *
   * Gentle, because the doom clock now supplies the urgency. At 1.2 the ramp
   * and the cataclysm were two clocks racing each other and the fight was over
   * before either had a story to tell.
   */
  bossRamp: 1.1,

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
   * Twenty is five or six moves — enough that killing the boss before the clock
   * lands is genuinely on the table, not just surviving it. The fight still
   * wants Nyx held back for the timer, but she is no longer the only way out.
   *
   * This is the number that decides the whole mode's difficulty. It is also the
   * one bounded by T.hardCap: the cataclysm and the card after it need room
   * inside the creative's runtime, which is why the cap moved with it.
   */
  seconds: 20,
  /** Every cataclysm after the first. The boss does not get tired. */
  repeat: 8,
  /**
   * Fraction of HERO_MAX_HP the cataclysm takes off every hero. Set against
   * ULT_HEAL_TO: a freshly healed party lives on a sliver, a chewed-up one
   * does not live at all.
   */
  damage: 0.85,
  /** Seconds remaining at which the boss shouts a warning. */
  warnAt: [7, 3],
  /** Below this the clock turns red and pulses. */
  panicAt: 5,
};

export const BOSS_MAX_HP = 10000000;
export const BOSS_NAME = "MAGMAROTH";

/* ------------------------------------------------------------------- timing */

export const T = {
  /**
   * Idle before the hint hand appears.
   *
   * Four times longer than the old value on purpose: a hand that arrives after
   * eight tenths of a second is not a hint, it is the game solving the board in
   * front of someone who was still reading it.
   */
  hint: 3.0,
  /** idle before the hand pulses harder and gems highlight */
  pulse: 7.0,
  /**
   * Idle before the game plays the move itself — and it only ever does that
   * for a viewer who has not touched the screen once. See Director.armAutoPlay.
   */
  auto: 10.0,
  /** persistent INSTALL banner drops in at this point on the clock */
  banner: 12.0,
  /**
   * Absolute cutoff — end card is forced no matter where the player is.
   *
   * Has to outlast the intro plus the doom clock plus the cataclysm, or the
   * fight gets guillotined before its own climax. With DOOM.seconds at 20 the
   * first cataclysm lands around the 25 second mark, and a party that survives
   * it earns a second one eight seconds later — this leaves room for that one
   * to resolve into a card instead of being cut off mid-animation.
   */
  hardCap: 38.0,
  /** beat after the boss dies before the end card */
  victoryHold: 2.2,
  /**
   * Time held back for the death animation and victory shout. The autoplay
   * pace guard treats this as untouchable so a hands-off viewer still sees the
   * boss explode instead of being cut off by the hard cap.
   */
  finaleReserve: 5.0,
  /**
   * Rough cost of playing out one move, used by the same pace guard.
   * Covers the cascade and the boss turn that follows the swap — the boss
   * turn lays its obsidian inside the same beat it attacks, so this stayed
   * cheap even after the counterattacks went in.
   */
  moveCost: 2.8,
};

/* --------------------------------------------------------------- store URLs */

export const STORE_URL = {
  ios: "https://apps.apple.com/app/id0000000000",
  android: "https://play.google.com/store/apps/details?id=com.studio.siege",
};

/* -------------------------------------------------------------------- copy */

export const COPY = {
  tutorial: "MATCH TO ATTACK",
  /** `{hero}` is filled in with whoever just charged. */
  ultReady: "TAP {hero}",
  victory: "VICTORY",
  endTitle: "ELEMENTAL\nSIEGE",
  endSub: "COLLECT YOUR HEROES",
  cta: "PLAY NOW",
  banner: "INSTALL",
  lava: "LAVA SPREADS!",
  lavaHint: "BREAK IT",
  ultClear: "BOARD CLEARED!",
  breath: "LAVA BREATH!",
  smash: "MAGMA SLAM!",
  ultHeal: "TEAM HEALED!",
  /* the fight can now be lost, and it says so out loud */
  doomLabel: "CATACLYSM",
  doomWarn: "MAGMAROTH IS CHARGING!",
  doomSoon: "BRACE!",
  doomCast: "CATACLYSM!",
  doomSurvived: "WE HELD!",
  down: "HERO DOWN!",
  shuffle: "NO MOVES — RESHUFFLE",
  defeat: "PARTY WIPED",
  defeatTitle: "MAGMAROTH\nWINS",
  defeatSub: "BUILD A STRONGER SQUAD",
  defeatCta: "TRY AGAIN",
};

/** System stack only — a web font would be bytes we cannot spare. */
export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
  { name: "EMBRA", element: FIRE, skill: "MAGMA LANCE" },
  { name: "NYX", element: WATER, heal: true, skill: "ABYSSAL TIDE" },
  { name: "THORNE", element: NATURE, skill: "VERDANT WRATH" },
  { name: "VOLT", element: LIGHTNING, skill: "STORM VERDICT" },
  { name: "MYST", element: ARCANE, skill: "VOID ECLIPSE" },
  // Sixth card, and last on purpose: NYX is an index into this array.
  { name: "SYLPH", element: WIND, skill: "CYCLONE EDGE" },
];

/** Index into HEROES of the healer — the only ultimate that is not just damage. */
export const NYX = 1;

/* ------------------------------------------------ the boss hits back */

/** Hero health. Simulated now, not authored: these numbers decide the fight. */
export const HERO_MAX_HP = 8000;

/**
 * Floor under every hit. At 0 heroes really fall and the party can be wiped,
 * which is the whole point of the mode — raise it back to 0.12 and the old
 * unloseable creative comes straight back.
 */
export const HERO_HP_FLOOR = 0;

/** Below this fraction the card blinks red. */
export const HERO_CRITICAL = 0.35;

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
  { kind: "breath", targets: "all", damage: 0.15, shout: COPY.breath },
  {
    kind: "smash",
    targets: "lowest",
    damage: 0.38,
    splash: 0.1,
    shout: COPY.smash,
  },
];

/**
 * How far Nyx's tide refills the party. Deliberately not a full heal any more:
 * the ultimate has to be worth building towards without erasing every mistake
 * that came before it.
 */
export const ULT_HEAL_TO = 0.65;
