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
   * 0.0625, and it is the second change of heart about difficulty rather than
   * the clock: the fight came back as still too hard and still too long to
   * grind out, so the boss was cut to four fifths of the health it had.
   * BOSS_MAX_HP came down with it, ten million to eight, and ultDamage went up
   * by the same quarter — a health cut has to be a cut against every source of
   * damage at once or it is really a nerf to whichever one was left behind. In
   * absolute terms nothing hits any harder than it did; the numbers floating
   * off the boss are the ones they always were, and the bar behind them is
   * shorter.
   *
   * Where the cut actually lands is worth knowing before anybody reads a win
   * rate off it: the pace guard clamps anybody ahead of schedule, so a player
   * who was already killing the boss at 42 seconds still kills it at 42. What
   * moves is the bracket the guard never touches, the one running behind the
   * schedule and taking full damage — a fight that ended at the cap with a
   * sliver left now ends a few seconds inside it. That is exactly the
   * complaint this answers, and it is why this knob rather than the clock.
   *
   * Every revision of this number before the last two was the clock instead —
   * T.hardCap moved and this followed it.
   *
   * Down first: at 0.028, where the gauntlet tuning had it, a fight was twelve
   * moves deep. A move costs about three and a half seconds to play out at the
   * world rate — see WORLD_RATE — the swap, the cascade, the volley, the boss
   * answering — and twelve of those is forty-two seconds against what was then
   * a thirty second creative. That was never a hard
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
   * board barely under pressure.
   *
   * 0.075 is where it stands, and it is set by a requirement rather than by a
   * win rate: the fight has to be finishable in five hits and six at the very
   * worst, counting a match and an ultimate alike as one hit. A plain triple
   * takes 22.5% off a bare boss, so four of them and a cast end it, and the
   * slowest line anybody can actually play — every match a bare triple and the
   * ultimate never spent — lands the kill on hit six at 19 seconds. Nothing
   * reaches seven.
   *
   * It is deliberately paired with a flattened sizeBonus and comboMultiplier
   * below rather than carrying that requirement by itself. Damage per gem is
   * the beginner's number — it is all a plain triple ever earns — while the
   * bonus tables are the expert's, and raising this one on its own put the
   * ceiling straight through the floor: with the tables as they were, a
   * five-cell step leading a cascade into an ultimate killed the boss in a
   * single hit. Raising the floor is this knob. Holding the ceiling down is
   * those two tables, and the pair of them is what makes the band 3 to 6
   * instead of 1 to 7.
   *
   * Difficulty in a creative this short is not how many moves it takes; it is
   * T.hardCap, which is the only opponent that never misses. What this number
   * decides is whether the fight fills the time that clock gives it. Under
   * about 0.034 the twelve-move problem starts coming back — an ordinary
   * player's win rate crossed under a coin flip there, 51% at 0.034 and 45% at
   * 0.032, and the ad starts ending on a health bar nobody emptied. Those two
   * readings were taken against the steeper bonus tables this pass replaced,
   * so treat them as the shape of the floor rather than as its current
   * altitude. Either way it is far below this.
   */
  damagePerGem: 0.075,
  /**
   * Cascade payout by step. Last entry repeats.
   *
   * Still generous — cascades turn out to be rare on a 5x5 that refuses to
   * refill into a match, a simulated fight averaging a deepest combo of about
   * 1.3 — so this is the ceiling, not the bread and butter.
   *
   * Trimmed twice, from 1.7/2.5/3.4/4.4 to 1.55/2.1/2.8/3.5 and now to this,
   * with the same argument as sizeBonus below: a rare event paying triple is
   * how a fight ends in one hit on the run where the board happens to fall
   * right, and that run is exactly the one that reads as "it beat itself". A
   * second step is worth a fifth more than a first now rather than half again —
   * enough that a cascade still reads as the board paying out, not enough to
   * skip three of the five hits the fight is specified to take. See
   * damagePerGem above for the specification.
   */
  comboMultiplier: [1, 1.2, 1.4, 1.6, 1.8],
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
   * Then trimmed from 1.5/2.3, and then from 1.35/1.9, because that lever had
   * become the whole fight. Per gem *and* per shape, a five-cell step was
   * paying nearly four times a triple, so a single good read took a third off
   * the boss and two of them ended it — which is precisely the "wins itself"
   * the retune was asked for.
   *
   * Both entries are the same number now, and that is the point rather than a
   * typo: the cell count already pays for the bigger shape, so this table only
   * has to say how much a shape is worth *per gem* on top of that. At 1.15 a
   * four-run comes to about 1.5 triples and a five-run to about 1.9, which
   * keeps reading the board the best thing a player can do with their seconds
   * while leaving the five-hit fight on damagePerGem above intact. The step
   * that was doing the damage was 1.9: it made a five-cell step worth 3.2
   * triples, and stacked with a cascade and an ultimate that is a one-hit kill.
   *
   * Do not take these to 1: that was measured, and it flattens the win rate
   * across every skill level, which is the same fight for a player who reads
   * the board and one who swipes at random.
   */
  sizeBonus: { 4: 1.15, 5: 1.15 },
  /**
   * What a hero still contributes once they are down.
   *
   * Every match is a volley from the whole roster now, so this is no longer a
   * penalty on one colour — it is the share of the party's damage that dies
   * with each hero. See HeroRow.partyPower.
   *
   * At 0.45 a single loss takes 9% off every match that follows and two losses
   * take under a fifth. It was 0.28 — 12% and a quarter — which was enough
   * that a party down two was not coming back, and that was the intent while
   * the fight was meant to be hard. It is not any more: the run that has
   * already lost two heroes is the run most likely to be watching the clock
   * collect, and grinding it down further is how a creative ends on a boss
   * nobody emptied. The party is still plainly worth keeping alive; it is no
   * longer a spiral.
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
   * What the opening hero's bar is dealt at.
   *
   * A stake and not a rate: it moves where the run's first ultimate lands and
   * nothing else, because chargePerGem above is what the rest of the fight runs
   * on.
   *
   * 0.16, which is a head start and not a free cast — asked for directly: there
   * is to be no ultimate waiting on the start screen. It was 1 for a while, a
   * full bar dealt before the first swipe, and the argument for that was the
   * demo rather than the balance: Director.showLesson points at a hero only
   * once that hero's bar is actually full, so at anything under a full stake
   * the opening demo has a board half and no card half, and the mechanic that
   * separates this game from every other match-three in the feed is not shown
   * before the player decides whether to keep watching.
   *
   * That cost is real and it is accepted. What survives it is the in-fight
   * lesson: `ultHints` fires off Director.chargeParty whenever a hero fills, up
   * to `ultHintShows` times, so the ultimate is still taught — a few seconds
   * later, to a player who is already playing, and off a bar they filled
   * themselves rather than one they were handed.
   *
   * Put it back to 1 for the old opening, and the free cast comes with it.
   */
  chargeStart: 0.16,

  /**
   * Whether the hero dealt that full bar is rolled, or is always the healer.
   *
   * It used to be Arissa every time, because chargeStart was written as the
   * healer's own stake — so every impression opened on the same face, the same
   * cut-in and the same tide, and the five other portraits this creative exists
   * to sell were never seen doing anything before the player decided. A roster
   * the opening cannot show is not a roster.
   *
   * Rolled off the run's seed rather than Math.random — see HeroRow, which
   * rolls it once when the row is built, and core/rng.js. Same seed, same
   * opener, so a pinned RUN_SEED still replays the identical fight.
   *
   * The healer is still in the hat, so a sixth of runs open exactly as they did
   * before and the other five open on damage. What that costs the fight is the
   * free heal: a head start on survival becomes a head start on the boss's bar.
   * Arissa's faster fill is untouched — see chargePerGem — so the tide is still
   * the first ultimate the fight *earns* whenever it is not the one it is dealt.
   *
   * Set false to put the old behaviour back.
   */
  randomOpeningHero: true,

  /**
   * The same, for everybody else — which is now two different sets of five.
   * The rate belongs to the five who are not the healer, as it always did; the
   * stake belongs to the five who did not win the opening roll, and that is a
   * different five in most runs. See randomOpeningHero.
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
   * 0.24 and 1.15 were still worth about a third of the bar for one tap. 0.2
   * and 0.9 is where the five-hit fight on damagePerGem puts it: a cast comes
   * to a little over half the bar, which is about two and a half matches, so
   * spending it is what turns a six-hit run into a five-hit one. Still the
   * largest number anybody can put on the screen in one beat, still the
   * correct answer to a wall of obsidian — it simply cannot be the fight on
   * its own, which at 0.3 and 1.25 it very nearly was.
   *
   * The floor here is the cut-in, not the arithmetic. Take the flat chunk much
   * under 0.15 and the ultimate stops being worth the two seconds its cut-in
   * costs on T.hardCap, at which point the correct play is never to cast the
   * feature the creative is selling.
   */
  ultDamage: 0.2,
  ultGemMultiplier: 0.9,
  /**
   * How much harder the boss's hide bites an ULTIMATE than it bites a match.
   *
   * An exponent on the hide rather than a discount off it: an ultimate is
   * resisted by `armor()` to the power of this. See Director.ultResistance.
   *
   * The brief this exists for is "the end has to be hard to grind down even
   * with ultimates — a cast should take a couple of percent off the bar there,
   * clearly under ten". That is a much deeper cut than it sounds, and the
   * obvious way to get it does not work. Getting an ultimate under 10% by
   * thickening the armour alone means thickening it for matches too, and
   * matches are what actually empty the bar:
   *
   *     ult worth 10%  ->  needs resist 0.24  ->  the boss dies at 37s
   *     ult worth  6%  ->  needs resist 0.15  ->  51s
   *     ult worth  3%  ->  needs resist 0.07  ->  87s
   *
   * ...against a 30 second hard cap, with the whole first three quarters
   * already given away unarmoured to pay for it. Every one of those is a boss
   * nobody can kill. The two requirements — a late ultimate worth a couple of
   * percent, and a fight winnable near the deadline — cannot both be met by one
   * armour number, because one number cannot say two things.
   *
   * So the ultimate gets its own curve through the same armour. `armor()` to
   * the power of `bite` is 1.0 at full health for any exponent, so an opening
   * ultimate is untouched and the fight's length is untouched with it — matches
   * still do all the grinding and `resist` still sets the clock. What collapses
   * is only the ultimate's late value — worked here against the bar and the
   * `resist` column as they stood before the 20% health cut and the curve
   * pass, where an opening cast was 41% of the bar:
   *
   *     bite    boss 100%   boss 25%   boss 10%   boss 5%   boss 0%
   *     1.6        41%         28%        8.8%      7.4%      6.0%
   *     2.0        41%         25%        6.0%      4.8%      3.7%
   *     2.4        41%         23%        4.1%      3.1%      2.3%
   *     2.9        41%         20%        2.5%      2.5%      2.5%
   *     3.2        41%         18%        1.9%      1.9%      1.9%
   *     a match    38%         30%         14%       14%       14%
   *
   * 2.2 is the setting and 2.9 was the one before it. 2.9 solved a brief that
   * has since been withdrawn — "under ten percent of boss health an ultimate
   * should take about 2.5% of the bar, not four" — and what replaced it is the
   * opposite instruction: the fight is to be easier and to stop taking so long
   * to play out. A cast worth 2.5% is the clearest single reason the last
   * quarter ground on, because it made the player's biggest button the wrong
   * thing to press in the one stretch of the run they most want to press it.
   *
   * So an ultimate opens as the biggest number in the fight at 58% of the bar,
   * is worth 40% through medium, and is worth 14% once the boss is inside its
   * last tenth — a quarter of what the same cast was worth twenty seconds
   * earlier, so the cards do still visibly weaken as the boss dies. It stays
   * at 14% rather than sliding further because `resist` is flat across that
   * last tenth; see the p: 0.9 keyframe in curve.steps, which exists for
   * exactly this.
   *
   * Both of those figures carry the `resist` that DIFFICULTY.curve raised in
   * the same pass, so the exponent is doing less of the work here than the
   * table above suggests and putting the exponent back on its own will not put
   * the old ending back.
   *
   * Note what this does to the middle of the fight, because it is a side effect
   * rather than a request: the exponent bends the whole curve, so a cast in the
   * medium zone came down from 28% to 20% along with everything else. That is
   * consistent with every version of this brief — the cards weaken as the boss
   * dies — but it was not separately asked for, and `resist` at p: 0.6/0.75 is
   * the lever if medium should be handed some of it back.
   *
   * WHAT THIS DOES TO THE PLAY, which turned out to be better than it first
   * measured, and the wrong reading is worth recording next to the right one.
   *
   * Past about 1.4 an ultimate is worth less than a good match in the last
   * quarter, so the cards stop being the answer to the wall and become the
   * thing worth having spent *before* it. A cut-in also costs about two seconds
   * of T.hardCap, and a cast worth a few percent of the bar does not buy two
   * seconds back.
   * Put together that reads like a trap: the time-optimal endgame play is not to
   * cast at all, which is an odd thing to build into an ad whose job is to sell
   * the ultimates.
   *
   * It is not a trap, it is a decision, and the difference shows up the moment
   * the simulation is allowed to play it properly. Two strategies, same table,
   * 2000 runs each — greedy casts whenever a bar fills, front-loading holds the
   * damage casts out of the last quarter and keeps the healer's:
   *
   *                greedy      front-loading
   *     weak         26%            4%
   *     ordinary     87%           35%
   *     strong       83%          100%
   *
   * Those brackets are from the 2.9 build and have not been re-run at 2.2.
   * What they are still good for is the fork itself — that this exponent makes
   * the endgame a decision that cuts differently by skill — and not for the
   * percentages, which describe a table that is no longer in the file.
   *
   * So there is no inversion and skill is not punished: a strong player who
   * front-loads goes from 83% to a clean 100%, and the 83% was the simulated
   * player casting badly rather than the table punishing them. What the numbers
   * actually describe is a real strategic fork that cuts differently by skill.
   * A player who can find five-cell steps has enough board damage to grind the
   * last quarter and should bank the cards early; a player who cannot needs
   * those casts in the endgame and is right to spend them there even at 6% a
   * time, which is why greedy is far better for the ordinary and weak brackets.
   * An endgame where the best play depends on how good you are is the most this
   * mode has ever asked of anybody.
   *
   * An earlier revision of this note called the 83% a flaw and pointed at
   * `resist` at p: 0.88 and p: 1.0 as the fix. That was wrong and those numbers
   * should not be touched for this reason — the measurement was of a strategy,
   * not of the table.
   *
   * What keeps a late cast from being an outright mistake even so is everything
   * an ultimate does that is not damage: it clears its whole colour off the
   * board, and the healer's clears every obsidian block, on a board carrying
   * eleven of them.
   *
   * Set 1 and an ultimate is resisted exactly like a match, which is where this
   * started before any of it was asked for.
   */
  ultHideBite: 2.2,
  /**
   * Whether the fight's clocks keep running while a skill's cut-in is on
   * screen. On: casting costs the player real seconds.
   *
   * Everything the fight bills by time goes through Director.elapsed — the
   * cataclysm's fuse, the boss's rage ramp, and the clock floor under
   * Director.pressure — and with this on, all three keep counting through the
   * two and a half seconds a cut-in owns the screen for. T.hardCap always
   * charged for them; now the rest of the mode agrees with it.
   *
   * This reverses a deliberate earlier decision, and the decision it reverses
   * was not wrong on its own terms — Director.holdClock still carries the
   * argument. A cut-in is the one stretch of the run the player is not playing:
   * the board is locked and there is no swap to find. Charging for it means the
   * one move that costs a full charge bar also hands the boss a tenth of its
   * fuse and leaves it hitting harder afterwards for having been cast at all.
   *
   * It is switched on because that is the point. A skill should be a decision
   * with a price, and in a thirty second creative the only currency anybody has
   * is the clock. Free casts made "should I spend this now" a question with one
   * answer.
   *
   * What it costs, measured over 2000 runs a bracket: about a point of win rate
   * (an ordinary player 84% to 83%, a strong one 86% to 85%) and a wipe rate
   * appearing where there was none — 2% for an expert, 6% for an ordinary
   * player front-loading.
   *
   * That is much less than it sounds like it should be, and the reason is worth
   * knowing before anybody tunes against this flag: T.hardCap was never held.
   * The deadline runs on the world clock and always charged for every cut-in,
   * so the seconds a cast costs the *run* were billed along.
   * What was exempt was only the three things routed through Director.elapsed —
   * the cataclysm's fuse, the boss's rage ramp, and the clock floor under
   * Director.pressure — and of those, rage is capped at 1.18 and the floor
   * almost never binds. So the fight arithmetic barely moves.
   *
   * The change that actually matters is the one on screen. The doom strip used
   * to freeze for the duration of a cut-in (Director.holdClock called
   * hud.holdDoom); now it keeps counting down behind the cast, in view, which
   * is what "time should be spent" looks like to somebody holding the phone.
   * The new wipes are the cataclysm arriving in runs where it previously ran out
   * of fight first.
   *
   * It also sharpens the strategic fork documented under ultHideBite: a late
   * cast costs seconds *and* lands for 6% of the bar, so banking skills for
   * before the wall gets better and spending them at it gets worse.
   *
   * Set false and the clocks stop for a cut-in again, which is the kinder build
   * and the one every note written before this flag existed describes.
   */
  ultCostsTime: true,

  /**
   * How fast the doom clock drains while an ultimate is casting.
   *
   * 0.5 — half speed, asked for directly, and it is the middle this pair of
   * settings never had. `ultCostsTime` above is a switch between billing the
   * player in full for a stretch they cannot play, and stopping the fuse dead
   * so a cast is free and the clock becomes somewhere to hide. Neither is what
   * a priced decision looks like. At 0.5 the cast still costs seconds; it costs
   * half of them.
   *
   * Read by Director.castRate, which multiplies it into doomRate beside the
   * DOOM.stretch curve — so it applies to the clock the player is shown and
   * nothing else. The world clock behind the pace guard and the rage ramp is
   * not touched, which means casting buys time against the deadline without
   * also slowing the boss down.
   *
   * 1 is the old behaviour with `ultCostsTime` true. Set `ultCostsTime` false
   * instead and this stops mattering — the clock is held rather than slowed.
   */
  ultTimeRate: 0.5,

  /**
   * THE DIFFICULTY CURVE — the staircase the whole fight is hung on.
   *
   * Three zones, cut on the boss's own health bar, and this is the spec in the
   * words it was given in: easy to take the boss down to half, medium from half
   * to a quarter, and the last quarter the hardest part of the fight. The whole
   * thing playing out inside the run — see T.hardCap, which is 32 seconds.
   *
   *     boss HP    100% ......... 50% ...... 25% ..... 0%
   *     zone         super easy     medium       hard
   *     attack      0.120 -> 0.330  0.58->0.64  1.05 -> 0.62
   *     resist      1.00 (none)      0.85       0.54 -> 0.52
   *     obsidian      1 -> 2         3            5
   *
   * `p` is how much of the boss's bar is gone, so 0.5 is the first zone
   * boundary and 0.75 the second. Everything else is linearly interpolated
   * between neighbouring keyframes — two keyframes carrying the same value are
   * a plateau, two carrying different ones are a ramp — so the zones have soft
   * shoulders rather than being three cliffs. Retune the fight by moving these
   * points; nothing else in the mode needs to know the shape.
   *
   *   attack    everything the boss throws, multiplied. See currentAttack.
   *   resist    fraction of the player's damage that lands. See armor().
   *   ult       the ultimate's own multiplier on top of that, so a cast can be
   *             shaped along the fight without moving what a match is worth.
   *             1 everywhere is the shape the fight shipped with — see
   *             ultResistance, which is where it is read.
   *   obsidian  blocks laid per boss turn. See pickObsidian.
   *   hold      most blocks the board carries at once, out of 25.
   *   name      shouted the moment the bar crosses this keyframe, so a zone
   *             change is a beat the player sees rather than a bar that
   *             quietly starts moving slower. Both names sit on a zone
   *             boundary, which is the whole of their job.
   *
   * THIS PASS — the fight came back as too hard and, in the same breath, as
   * taking too long to play out. Those are one complaint and not two, and the
   * arithmetic below is why: the last quarter of the bar used to cost more
   * damage to remove than the whole easy half, so every run spent its back
   * third watching a bar crawl behind a wall. The softening is spent almost
   * entirely there.
   *
   *   attack    down about a third at every keyframe, and the needle at
   *             p: 0.88 from 1.69 to 1.05 — the peak index falls from x27.4 to
   *             x16.2, so the wall is a little over half the wall it was.
   *   resist    0.78 -> 0.85 through medium and 0.38 -> 0.52 across the last
   *             tenth. This is the one that shortens the run: the bar takes
   *             1.21 bars of damage to empty where it took 1.35.
   *   obsidian  the endgame board carries nine blocks of twenty-five rather
   *             than twelve, so there is still somewhere to play at the wall.
   *
   * It landed on top of a separate 20% health cut — see damagePerGem and
   * BOSS_MAX_HP — and the two together take a fight of nine plain triples down
   * to six and a half. The clock came in with them: T.hardCap 45 -> 32,
   * WORLD_RATE 0.8 -> 1.0 so a move costs 2.8 seconds again rather than 3.5,
   * and pace.seconds 43 -> 22 so the guard stops holding the fight open to the
   * deadline.
   *
   * Two things are deliberately NOT on this axis, and both are about not
   * punishing a player who is behind:
   *
   *   - `resist` is read at Director.wounds — the bar, and nothing but the bar.
   *     Armour is something the player damaged the boss into putting up, so it
   *     is only ever met by somebody who earned it.
   *   - `attack`, `obsidian` and `hold` are read at Director.pressure, which is
   *     the bar with a clock floor under it and a clock ceiling over it. The
   *     spec above says what the fight does as the bar empties; it says nothing
   *     about a player who never empties it, nor about one who empties half of
   *     it in eight seconds. The floor stops the first from meeting no fight at
   *     all; the ceiling stops the second from meeting the last quarter before
   *     the roster could possibly answer it. Both only ever bite at the
   *     extremes, and the second one was put there by a measurement rather than
   *     an opinion — see pressure and curve.clockLead.
   *
   * What the three zones come to, computed off this table rather than
   * simulated. The rake is the *lightest* attack in the rotation, so read that
   * column as the floor under a boss turn rather than the worst it can do, and
   * the two damage columns are unguarded — the pace guard takes a further bite
   * out of anybody running ahead of schedule:
   *
   *   boss HP   zone         one rake      best match    ultimate
   *      100%   super easy   x1.0     2%   59% of boss   58% of boss
   *       75%   super easy   x1.6     3%   59%           58%
   *       50%   medium >>>   x2.8     5%   59%           58%   OBSIDIAN HIDE
   *       40%   medium       x5.7     9%   50%           40%
   *       25%   hard >>>     x6.3    10%   50%           40%   MOLTEN CORE
   *       12%   hard         x16.2   16%   32%           15%
   *       10%   hard         x15.2   14%   31%           14%
   *        0%   hard         x9.9     9%   31%           14%
   *
   * The index is `attack` over `resist` against that same ratio at the opening
   * keyframe: what a keyframe is worth measured against the opening swing. The
   * heaviest swing in the rotation, the smash, lands for 28% of a hero bar on
   * the needle and 17% at the kill, where before this pass those same two
   * swings were 46% and 22%.
   *
   * The last column is the other half of what the ending is for, and it moved
   * furthest. An ultimate used to be worth 3% of the bar in the last tenth: a
   * cut-in that costs two seconds of T.hardCap to remove a thirtieth of a
   * health bar is a button it is simply wrong to press, in a creative whose
   * whole job is to sell that button. At ultHideBite 2.2 against this `resist`
   * column it is worth 14% there — still a quarter of what the same cast was
   * worth while the boss was whole, so the cards do weaken as the boss dies,
   * but a late cast is an answer to the wall rather than a decoration on it.
   *
   * WHAT IS NOT MEASURED, and it is the thing to know before quoting anything
   * out of here. Every revision of this note up to the last carried win rates
   * by skill bracket off a 2000-run simulation of the fight — weak, ordinary,
   * strong and expert, greedy against front-loading. Those were measured
   * against the old table and none of them have been re-run against this one,
   * so they are gone rather than quietly reprinted beside numbers they do not
   * describe. What can be said from arithmetic alone: the bar needs 11% less
   * damage to empty, a plain triple is worth a quarter more of it, the hardest
   * swing in the run takes under a third off a hero instead of a half, and the
   * board at the wall has two more cells to play in. Every one of those moves
   * the fight the same way.
   *
   * The kill is expected to land well inside the run now rather than on its
   * last beat, and that is a change of intent rather than a side effect. It
   * used to be deliberate that the run was won close to the deadline with the
   * doom strip already red; what came back about that is that the creative
   * plays too long. See DIFFICULTY.pace, which holds a 22 second line now
   * against a 32 second cap.
   *
   * Where this leaves src/difficult/image.png, which the shape was originally
   * traced off pixel by pixel: honoured in form, overruled by the zone numbers
   * wherever the two disagree — "easy to fifty, medium to twenty-five, hard
   * after" is a harder statement than a hand-drawn line. The form is still the
   * drawing's: a long gentle climb, a steep catch, a near-flat shelf, a last
   * stroke up. This pass flattened that silhouette rather than redrawing it —
   * every keyframe came down by roughly the same share — so what disagrees
   * with the trace now is the scale and not the shape.
   *
   * Set `enabled` false and bossRamp/armor take the fight back, smooth
   * exponential and all.
   */
  curve: {
    enabled: true,
    /**
     * The schedule the clock floor is measured against, in seconds. Kept level
     * with pace.seconds: they are two readings of the same schedule, and a
     * floor that finished before or after the pace guard's line would be
     * pulling against it. Both followed the run the whole way up — 28 at a
     * thirty second cap, 31 at 33, 38 at 40, 43 at 45 — and then came off it
     * together: 22 against a 32 second cap, because the fight is no longer
     * meant to be held open to the deadline. See DIFFICULTY.pace.
     */
    seconds: 22,
    /**
     * How far up the curve a completely stalled run is dragged by the clock.
     *
     * The curve is specified against the boss's health bar and for anybody
     * damaging the boss that is all it is — see Director.pressure, which only
     * ever takes the larger of the two. This is the answer to the run the spec
     * does not cover: a player who never damages the boss meeting a golem that
     * swings at 0.154 for the whole run is not an easy fight, it is no fight,
     * and an ad that ends on a health bar nobody touched.
     *
     * 0.5 lands a stalled run on the medium boundary by the end of the
     * schedule — pressed, and nowhere near the last-quarter wall it has not
     * earned a single point of. It was 0.7, which put the same run in the
     * middle of medium; it came down with everything else in the easier pass,
     * and it had to, because the schedule it is measured against went from 43
     * seconds to 22 and a fraction of a shorter schedule arrives sooner. Set
     * 0 to switch the floor off and put the curve
     * purely on the bar.
     */
    clockFloor: 0.5,
    /**
     * ...and the ceiling: how far the boss's temper may run ahead of that same
     * schedule. Only `attack`, `obsidian` and `hold` are held by it — armour is
     * never capped, so damage always buys the tougher hide the instant it is
     * earned.
     *
     * This one was found by simulation rather than reasoned out, and the
     * measurement is worth keeping because it is counter-intuitive. On the bar
     * with no ceiling, strong players wiped on 24% of runs and weak players on
     * none: skill was the thing being punished. A player who reads the board
     * takes half the boss off in eight seconds and gets answered by a golem
     * swinging at three times its opening — at a point in the run where nobody
     * has two ultimates charged yet, because charge accrues with gems, gems
     * accrue with time, and no amount of skill buys time. Then the pace guard
     * refuses to let that lead become an early kill, so the whole reward for
     * playing well is twelve seconds parked at the wall.
     *
     * 0.25 is a quarter of the curve's worth of lead: generous enough that
     * playing well still visibly angers the boss sooner, tight enough that the
     * last quarter cannot arrive before the roster could plausibly answer it.
     * Set undefined to lift the cap and put temper purely on the bar.
     */
    clockLead: 0.25,
    steps: [
      /**
       * A full boss, and the easiest moment in the fight by a wide margin.
       *
       * bossPress is 4 seconds and it starts with the fight, so the first swing
       * lands on somebody who has made one match and may not yet have worked
       * out that this is a match-three at all. Whatever sits here is what the
       * game does to a player it has not finished teaching. At 0.12 the
       * opening rake is under two percent of a hero bar and a single obsidian
       * block sits on a board of twenty-five: the screen shaking is telling
       * the truth, and it is costing nothing at all.
       *
       * The old curve opened at a flat 1.0 and compounded from there, and the
       * party was already chewed before the mechanic had landed — which is most
       * of what "it's too fast, you lose too fast" was about.
       */
      { p: 0.0, attack: 0.12, resist: 1.0, ult: 1, obsidian: 1, hold: 5 },
      /**
       * Two thirds of a boss left, and still inside the easy zone.
       *
       * The zone is not flat, and that is on purpose: pressure creeps the whole
       * way across it rather than sitting level and then jumping. A fight that
       * is *level* for its first half has nothing to say in it, where a fight
       * gently and steadily getting worse is teaching the player that it will.
       * The creep is small enough that nothing here is what anybody would call
       * difficulty — the swings are still under a tenth of a hero bar.
       */
      { p: 0.35, attack: 0.22, resist: 1.0, ult: 1, obsidian: 2, hold: 6 },
      /**
       * HALF THE BOSS GONE — the first zone boundary, and the end of the easy
       * half.
       *
       * `resist` has been a flat 1.0 the whole way here, which is the strongest
       * single statement this table makes: for the first half of the fight the
       * boss has no armour at all and every point of damage the player earns
       * lands in full. That is what "super easy down to fifty percent" buys, and
       * it is why the player arrives at this line feeling unstoppable — which is
       * exactly the feeling the next keyframe is written to take away.
       *
       * Announced, because a bar that quietly starts falling slower reads as the
       * game cheating. See Director.checkPhase.
       */
      {
        p: 0.5,
        attack: 0.33,
        resist: 1.0,
        ult: 1,
        obsidian: 2,
        hold: 7,
        name: "OBSIDIAN HIDE",
      },
      /**
       * The shoulder into the medium zone — ten percent of the bar, and the
       * sharpest turn on the curve.
       *
       * The boss's damage nearly doubles and armour appears from nothing, so a
       * good match stops being worth three fifths of the bar and starts being
       * worth half of it. The fight the player spent half the run getting
       * comfortable in turns out to have been the tutorial. Steep on purpose:
       * a zone boundary the player cannot feel is not a boundary, and this one
       * is announced a beat before it by the keyframe above.
       */
      { p: 0.6, attack: 0.58, resist: 0.88, ult: 1, obsidian: 3, hold: 8 },
      /**
       * A QUARTER LEFT — the second boundary, and the end of medium.
       *
       * The zone behind this line is deliberately near-flat: 0.58 to 0.64
       * across fifteen percent of the bar. Medium has to be a place the player gets to
       * stand and play, not a ramp they slide down — it is where the roster gets
       * charged and where somebody who has understood the game gets to look good
       * at it, right before the part where looking good is not enough.
       */
      {
        p: 0.75,
        attack: 0.64,
        resist: 0.88,
        ult: 1,
        obsidian: 3,
        hold: 8,
        name: "MOLTEN CORE",
      },
      /**
       * THE LAST QUARTER — still the hardest part of the fight, and the part
       * this pass took the most out of.
       *
       * All three of the things that make a climax still land together here:
       * the golem's damage jumps, armour thickens, and the board tightens.
       * What changed is how far each of them goes.
       *
       * The wall used to be a needle at x27.4 on the index — the hardest swing
       * in the creative, 46% of a hero bar on a smash, against armour at 0.4
       * that left the board unable to finish the job and eleven obsidian
       * blocks on twenty-five cells leaving nowhere to answer from. That was
       * the shape the brief asked for, and it is also the shape the complaint
       * came back about: this quarter of the bar cost more damage to remove
       * than the entire easy half of the fight, which is a bar crawling
       * through the back third of every run.
       *
       * 1.05, 0.54 and five blocks a turn. The smash lands for 28% of a hero
       * bar rather than 46%, a five-cell step takes 32% off the boss rather
       * than 19%, and the board holds nine blocks rather than eleven. Against
       * x2.8 at the medium boundary this is still by a distance the hardest
       * thing in the creative — it simply no longer takes longer to play than
       * the rest of the fight put together.
       *
       * Raise `attack` here first if the wall stops reading as a wall; lower
       * `resist` if the ending stops being a grind at all. They are separate
       * complaints and these are separate knobs — see the note under
       * DIFFICULTY.ultHideBite, which is the third.
       */
      { p: 0.88, attack: 1.05, resist: 0.8, ult: 1, obsidian: 5, hold: 9 },
      /**
       * BOSS AT TEN PERCENT — and `resist` goes flat from here to the kill.
       *
       * The flat stretch is the whole point of this keyframe: below a tenth of
       * health, what a player's hit is worth stops moving. DIFFICULTY.
       * ultHideBite is an exponent on this number, so every wobble in it is
       * magnified in the one figure the player reads hardest — what their
       * biggest button is worth at the wall — and a `resist` still sliding
       * here would keep collapsing that figure through the last seconds of the
       * run.
       *
       * THE FALL. `attack` comes off the needle's 1.05 (x16.2) to 0.95 here
       * (x15.2) and then to the kill's 0.62 (x9.9): the golem comes off the
       * wall hard and then goes quietly, rather than sagging at a constant
       * rate from the moment it peaks. That shape is the one the revision
       * before this had; only its height moved.
       *
       * What flattening `resist` hands the board is small and it is the honest
       * cost of holding the ultimate still: a five-cell step lands for 31%
       * across the last tenth where a sliding hide would have taken it lower.
       */
      { p: 0.9, attack: 0.95, resist: 0.72, ult: 1, obsidian: 5, hold: 9 },
      /**
       * The killing blow.
       *
       * 3.40 once, then 3.17, 3.08, 2.74, 2.39, 2.17, 1.94, 0.82, and 0.62
       * now. Measured on the index the curve is read by — `attack` over
       * `resist` against that same ratio at the opening keyframe — the kill
       * lands at x9.9 where it landed at x14.0, and at x17.0, x19.0, x21.0,
       * x24.0 and x29.8 before that.
       *
       * A golem swinging softer as it dies is a deliberate reading and not the
       * fight giving up, and it is worth knowing which of the two you are
       * looking at before putting it back. The raw swing at the kill has been
       * under what the boss throws in the medium zone for several passes now:
       * the index says x9.9 against x6.3 back there and the index is not lying
       * — it is a ratio, and `resist` at 0.52 against 0.85 is most of what it
       * is measuring — but the number the player feels is the damage, and the
       * damage runs downhill from the medium zone to the end of the fight, 10%
       * of a hero bar per rake at 25% health and 9% at the kill.
       *
       * `attack` and not `resist` is what moved on this line every previous
       * time, and the difference is why: `resist` is how much of the player's
       * damage lands, so touching it moves the kill time and the length of the
       * creative with it, where `attack` is only ever how hard the boss hits
       * back. This pass is the first to move both, and it moved `resist`
       * deliberately — the length was the complaint.
       */
      { p: 1.0, attack: 0.62, resist: 0.72, ult: 1, obsidian: 5, hold: 9 },
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
   * full bar at the first playable frame to an empty one here. It runs a
   * little longer than the kill it is aiming at, because damage lands in lumps
   * and the killing blow overshoots the line by most of a move. Holding a line
   * rather than picking a damage number is what keeps the kill landing on
   * about the same second whatever speed the player swipes at: measured over
   * hundreds of runs, the spread across every pace a person actually plays at
   * came out under a second.
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
   * `bite` 2 and `floor` 0.5, loosened from 3 and 0.12, and the requirement
   * that tightened them has been withdrawn. That pair existed to hold the win
   * near the deadline for *everybody*: a simulated expert who emptied the bar
   * in 20.8 seconds was pulled back to 27.3, and every bracket landed between
   * 26 and 29 seconds against a thirty second cap. It worked, and what came
   * back about it is that the creative plays too long.
   *
   * So this is a floor under the fight's length again rather than a rail along
   * it. At 0.5 the least a hit can ever be scaled to is half of itself where
   * it used to be an eighth, and at bite 2 the grip closes gently instead of
   * clamping the moment a player edges ahead of the line. Somebody who reads
   * the board still cannot finish the run in eight seconds; they can finish it
   * in nineteen, which is the whole of what the change is for.
   *
   * 0.4 was tried first and it was still doing too much: it held a player
   * landing a cascade on every move to the same eight moves as one landing
   * bare triples, which is the guard flattening skill rather than floor-ing
   * the run. At 0.5 the same four brackets — bare triples, triples with a
   * cascade behind them, four-cell steps, five-cell steps — finish at 24.9,
   * 22.1, 19.3 and 10.9 seconds against a 32 second cap. Those are computed
   * off the damage table at a fixed move every 2.8 seconds and not simulated
   * against a real board, so read the spread rather than the figures.
   *
   * Do not read the looser grip as a difficulty knob in either direction. The
   * guard has never touched a player who is behind the line — it only ever
   * clamps somebody already winning faster than the schedule — so everything
   * it does is about the length of the creative and none of it is about how
   * hard the fight is. Below about 0.08 the bar reads as stuck rather than as
   * guarded, which is why the floor exists at all.
   */
  pace: {
    enabled: true,
    /**
     * 22, and this is the first time it has been retuned rather than dragged
     * along behind T.hardCap.
     *
     * It used to sit two seconds under the deadline, wherever the deadline
     * was: the run went 30 -> 33 -> 40 -> 45 and this went 28 -> 31 -> 38 ->
     * 43 to keep that distance, because the guard was supposed to still be
     * pulling when the deadline arrived. That is exactly what made every run
     * finish on its last beat, and it is what "it plays too long" was about.
     *
     * 22 against a 32 second cap is a schedule that finishes ten seconds
     * early on purpose. The fight is aimed at the middle of the run now, and
     * the ten seconds behind it are what a player who fumbles a swipe or
     * spends a beat reading the board has to spend.
     *
     * Real seconds, so Director.paceGrip converts the world clock back through
     * toReal before it reads this — see WORLD_RATE.
     */
    seconds: 22,
    bite: 2,
    floor: 0.7,
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
   * Twenty-seven, and this is the clock the player is *shown* rather than the
   * length of the run. T.hardCap is 32 and `stretch` below is what reconciles
   * the two: the strip is never wrong about how much of itself is left, it
   * simply drains slower than wall time over the last stretch, so twenty-seven
   * of its seconds take thirty-two of ours. This is the number on the CATACLYSM readout — see
   * Hud.setDoom — so it is also the largest figure the player ever reads there.
   *
   * The clock is armed the moment the intro is off the screen, so what the
   * strip has left when the cap collects is exactly what the intro cost — about
   * two seconds — and Director.timeUp drives that last sliver to zero itself
   * before the cataclysm lands.
   *
   * This was the length of the creative for as long as the two were the same
   * thing: 15, then 20, then 25, then 30. Then the run went to 33, 40 and 45
   * while the strip stayed at 30, because what was asked for was a clock that
   * reads less than the fight lasts. Then it was pulled back level and read 40
   * against a 45 second run, asked for directly off the readout rather than
   * off this file. The run has since been cut to 32 for playing too long — see
   * T.hardCap — and this came down to 27 with it, keeping the same five
   * seconds of `stretch` between the two.
   *
   * What that costs is the mechanic in the middle of the fight. The clock
   * cannot reach zero while there is still a fight to land a cataclysm in, so
   * `repeat` and everything under it only ever describe the one cast timeUp
   * makes. What does survive is the last few seconds of a run the deadline
   * collects: warnAt is 4 and 2 and panicAt is 3.5, all three of which a capped
   * run reaches, so the strip goes red and KOLTMOS IS CHARGING still gets said
   * on the way into it — and under the stretch those last 3.5 shown seconds are
   * 6.4 real ones, which is the ending getting room rather than being slowed.
   *
   * That is a deliberate choice and not a regression. It was 9 once, which is
   * three moves: it landed in the middle of the fight, after the player had
   * felt the bar move and before the kill, with room for exactly one repeat
   * behind it, so the deadline arrived once as a threat and once as proof it
   * was not a bluff. Put it back at 9 and the mechanic comes back with it.
   */
  seconds: 27,
  /**
   * The five seconds the player is given and not told about.
   *
   * The run is 32 seconds long (T.hardCap) and the countdown on screen is 27
   * (`seconds` above). The difference is not a lie the strip tells at any one
   * moment — the strip is never wrong about how much of *itself* is left — it
   * is a rate: the clock drains slower than wall time, so twenty-seven of its
   * seconds take thirty-two of ours. Nobody counts a countdown against a stopwatch;
   * what they feel is how long they had.
   *
   * `window` is the whole of the idea and it is the second thing this was
   * asked for: the stretch is confined to the last `window` seconds of the
   * countdown and there is none at all before them. Outside the window the
   * clock is wall time to the frame — seventeen true seconds — and inside it
   * the five are handed over. It was a smooth curve over the whole run first, and
   * the note it earned was that the extra time should land at the end and
   * nowhere else, which is what this is.
   *
   * The drain rate inside the window is
   *
   *     1 / (1 + k * u^shape)   with u running 0 -> 1 across the window
   *
   * and `k` is solved rather than tuned so the integral comes out at exactly
   * `extra` — see Director.doomRate, which is five lines and does that solve.
   * At u = 0 the rate is 1 whatever the shape, so the clock does not step as
   * it crosses into the window; it leans.
   *
   * What the player sees, and the strip prints whole seconds (see Hud.setDoom,
   * which is where the ceil is), so this is literally how long each digit is
   * on screen:
   *
   *     "11" holds 1.00s     the last digit before the window
   *     "10" holds 1.05s     where it would have held 1.00
   *      "5" holds 1.55s
   *      "1" holds 1.95s
   *
   * Fifteen real seconds for the last ten of the countdown, and the step
   * between one digit and the next is 0.10s the whole way down. That is the
   * softest lean any version of this has had, and it is deliberate: `window` at
   * twice `extra` puts k at 1, so the clock never runs slower than half of wall
   * time and no single digit sits there long enough to read as a freeze.
   *
   * The three knobs, in the order worth reaching for:
   *
   *   window  twice `extra` puts k at 1 and the floor at 0.50x, which is where
   *           it is. Equal to `extra` doubles k: the floor drops to 0.33x, the
   *           step per digit quadruples, and the gift concentrates on the last
   *           few numbers. Tighter than that stops being a reprieve and starts
   *           being a pause — 15 extra over a window of 10 once put "1" on
   *           screen for 3.85s. Wider eats into the honest part of the clock.
   *   shape   1 leans in linearly. 0 is a flat half-speed across the window and
   *           steps as it enters. Above 1 the window opens near true speed and
   *           the last digit takes almost all of it.
   *   extra   0 turns the whole mechanism off — the rate is 1, the clock is
   *           wall time again, and T.hardCap has to come back to 27 to match.
   *
   * What this does NOT touch is what the deadline means. The cataclysm still
   * lands when the strip reads zero, the warnings at DOOM.warnAt still fire on
   * the numbers the player sees, and the mix still leans on the shown clock —
   * so the panic at 3.5 now plays out over 6.4 real seconds, which is the
   * ending getting room rather than the ending being slower.
   */
  stretch: { extra: 5, window: 10, shape: 1 },
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
   *
   * 0.32, down from 0.4, which is one of the three places the 20% the creative
   * was asked to shed actually lands — see damagePerGem and `attack` under
   * DIFFICULTY.curve for the other two. The audience is players in their
   * thirties who do not play match-3 for a living, and what beats them is not
   * the puzzle, it is being punished for the seconds they spend reading the
   * board. Nothing about the clock moved for it.
   */
  damage: 0.32,
  /**
   * And every cataclysm after the first is multiplied by this again.
   *
   * 32%, then 38%, then 46%, then 55%. The first is survivable by a party that
   * has not been chewed on; the third is survivable only by one that was healed
   * in between, and the fourth takes all but a sliver. That escalating
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

export const BOSS_MAX_HP = 8000000;
export const BOSS_NAME = "KOLTMOS";

/* ------------------------------------------------------------------- timing */

/**
 * How fast the fight animates against wall time. 1 is real time, which is what
 * it is.
 *
 * It was 0.8 for one pass — a fifth slower — and that was the clock wearing an
 * animation knob: the run had been stretched to forty-five seconds and slowing
 * every beat by a fifth was how the fight was made to fill them. What came
 * back is that the creative plays too long, so the run was cut to 32 and this
 * went back to 1 in the same pass. A move costs 2.8 seconds again rather than
 * 3.5, which is the most direct thing in the file for how long a swap feels
 * like it takes.
 *
 * Everything the creative moves runs on the world clock — the cascade, the
 * boss, the cut-ins, every tween and every delay() — and this is the standing
 * rate that clock advances at, under the transient ult rates and hit-stop. See
 * core/juice.js.
 *
 * The doom clock is deliberately not on it. That one is a promise to the player
 * about how long they have, so main.js ticks the director on the real frame and
 * the countdown is wall time whatever this says. Which leaves the schedule: the
 * deadlines below are written in wall seconds but measured on the world clock,
 * so Director converts them through toWorld/toReal and the run is still exactly
 * T.hardCap seconds long. Change this number and the fight gets slower or
 * faster; the length of the creative does not move.
 */
export const WORLD_RATE = 1.0;

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
   * What it costs to miss is the largest number in the fight: an ultimate is
   * over half the boss's bar (see DIFFICULTY.ultDamage) and the healer's is
   * the only thing in the run that clears obsidian or picks the party up. A
   * creative that never shows it is selling five heroes and demonstrating none.
   */
  ultHints: true,
  /**
   * How long the shout is given before the lesson's hand arrives.
   *
   * The two beats have to arrive in this order or they are two things happening
   * at once: the shout names the hero on the frame the bar fills, and then the
   * hand taps the card it named.
   *
   * It was 0.5. Anything under about a second and the hand comes up underneath
   * the announcement — two props over the same card, which is the one
   * arrangement that reads as a bug. `ultShout` is 1.4, so the hero's name is
   * still on screen when the hand lands whatever this is set to inside that.
   */
  ultHintIn: 1.05,
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
   * off five colours, was a hand that would not leave the row alone.
   *
   * Five now, and the cap means something different than it did. It used to be
   * the only thing stopping the hand: the lesson fired once per hero filling and
   * then went quiet, so a player who looked away for those 3.2 seconds was never
   * told again. It now re-offers itself on `ultHintAgain` for as long as a
   * charged hero is still standing there untapped, and this is the ceiling on
   * that rather than a ration of chances. The run is 32 seconds and the free
   * opening cast is gone — see DIFFICULTY.chargeStart — so the first ultimate is
   * something the player has to be told about while they are already playing.
   *
   * Spent whether or not the offer was taken, and never reached at all by a
   * player who taps a card: the first tap on any of them ends the lesson for
   * the rest of the run. See Director.onCardTap.
   */
  ultHintShows: 5,
  /**
   * Quiet between one ult lesson coming off and the next going up, while a
   * charged hero is still sitting there untapped.
   *
   * The hand is a prop and it is shared with the board's lesson, so this is
   * also the board's turn: long enough that the two read as separate offers
   * rather than one hand flickering between the row and the grid, short enough
   * that somebody who missed the first pass has not moved on. Set 0 to go back
   * to a lesson that fires once per charge and never returns.
   */
  ultHintAgain: 2.2,
  /**
   * How long the READY shout holds — "TAP ARISSA", in the hero's own colour.
   *
   * 1.4, and it was 0.7 hard-coded inside Director.chargeParty. That was the
   * single clearest hole in the whole callout, and the note under `ultHints`
   * named it before this number existed: a player who has spent the run looking
   * at the board is told about a control they have never touched by a caption
   * that is gone before they look down.
   *
   * Fitted to the hand rather than picked: `ultHintIn` is 0.5, so at 1.4 the
   * words are still up when the hand lands on the card and the two read as one
   * sentence — the name says who, the hand says how.
   */
  ultShout: 1.4,
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
   * the whole run is thirty-two seconds, and a second of dead air is a
   * thirty-second of the ad spent watching nothing.
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
   * it moves every time T.hardCap does. It has now moved seven times: 5 when
   * the run was fifteen, 6.7 at twenty, 8.3 at twenty-five, 10 at thirty, 11
   * at thirty-three, 13.3 at forty, 15 at forty-five, and 10.7 now the run is
   * back down to thirty-two.
   */
  banner: 10.7,
  /**
   * Absolute cutoff — end card is forced no matter where the player is.
   *
   * Thirty-two seconds in wall time, and the player is shown twenty-seven —
   * see DOOM.stretch, which is the whole of that trick and the only reason
   * these two numbers are allowed to disagree. Everything else in this file is
   * fitted to this one rather than the other way round: `banner` so the store
   * button lands a third of the way in, finaleReserve so the death still gets
   * played, DIFFICULTY.damagePerGem so the boss can be dead before it, and
   * DIFFICULTY.pace.seconds so the fight is decided well inside it.
   *
   * Measured in wall seconds and not in world ones, which is a distinction this
   * number did not have to make until WORLD_RATE existed. Director.run races
   * this on the world clock, so it converts through toWorld first; at the rate
   * of 1 it went back to racing these 32 directly.
   *
   * DOWN FROM FORTY-FIVE, and this is the first time the number has ever moved
   * backwards. It went 15, 20, 25, 30, 33, 40, 45, and the last three of those
   * were asked for rather than needed — a fight balanced to end in five or six
   * moves was handed room for eleven. What came back is that the creative
   * plays too long, which is the same observation from the other side: room
   * nobody needs is time the viewer spends watching a fight that has already
   * been decided. The fight came down with it rather than being left to rattle
   * around in a shorter box — see DIFFICULTY.curve.
   *
   * Thirty-two, less about two and a half for the intro and the 3.5 of
   * finaleReserve, leaves twenty-six playable seconds. A move costs 2.8 of
   * them — see moveCost, and see WORLD_RATE, which came back to 1 in the same
   * pass so that a move stopped costing 3.5 — so the run holds nine moves
   * against a fight balanced to end in six or so. That is the slack this
   * number exists for: a player can lose a move or two to a fumbled swipe or
   * to reading the board and still finish comfortably.
   *
   * The floor to know about is at twenty. At fifteen the run held nine and a
   * half playable seconds and three moves, and the fight as balanced did not
   * fit inside it at all: playing well still ended with the boss standing,
   * which is not difficulty, it is a creative that stops before its own
   * climax. At twenty it held the fight exactly and no room for a mistake in
   * it — one fumbled swipe and the clock collected instead of the player.
   * Nobody is being given the fight; they are being given the time to lose a
   * move or two to it.
   *
   * This number is what the run is racing — see Director.run, where it is
   * literally the other half of a Promise.race — and it is also the fight
   * difficulty, because it is the one opponent that never misses.
   */
  hardCap: 32.0,
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
   * It was 2.8 and the argument for it was that there is one word on the card:
   * the scoreboard, the party row and the two buttons are gone, so a screen
   * held past the moment it has been understood is a screen the player is
   * waiting out.
   *
   * The fireworks are what bought the extra time back. They start once the
   * stamp and the tap line are standing rather than behind the flash — see
   * Outcome.show — so at 2.8 the display got under two seconds and read as a
   * few sparks rather than as a finale. This is the window they play in, and it
   * is the one thing on this card that is still worth watching after the word
   * has been read.
   */
  outcomeHold: 4.2,
  /**
   * Time held back for the death animation and the beat after it. The autoplay
   * pace guard treats this as untouchable so a hands-off viewer still sees the
   * boss explode instead of being cut off by the hard cap.
   *
   * Three and a half of the thirty. The collapse it was sized around is no
   * longer waited on — the verdict cuts in on the frame the boss dies, see
   * Director.win — so what this now reserves is the room for the killing move
   * itself to land inside the cap rather than be cut off by it.
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
export const STRIKE = {
  ceiling: 220,
  size: 190,
  travel: 0.3,
  bow: 74,
  streak: 3.4,
  streakSpeed: 5.5,
  trailGap: 16,
  trailLife: 0.32,
  muzzle: 74,
  muzzleLife: 0.2,
  muzzleSparks: 6,
  blast: 92,
  blastLife: 0.34,
  blastScale: 1.25,
  blastSparks: 9,
};

export const MATCH_FX = {
  on: true,
  charge: 0.075,
  chargeMote: 0.9,
  lanceLife: 0.3,
  lanceThick: 0.5,
  lanceOvershoot: 0.62,
  coreLife: 0.32,
  coreSize: 1.5,
  waveLife: 0.4,
  waveSpan: 1.5,
  waveFlat: 0.26,
  shards: 4,
  shardSpread: 0.5,
  shardReach: 1.15,
  emberLife: 0.7,
  bigRun: 4,
  shake: 4.5,
  hugeRun: 5,
  flashAlpha: 0.14,
};

export const LINK = {
  on: true,
  thick: 0.66,
  overshoot: 1.22,
  snap: 0.07,
  hold: 0.1,
  fade: 0.17,
  swell: 1.3,
  wobble: 0.07,
  nodeSize: 1.15,
  nodeLife: 0.3,
  nodeSwell: 1.35,
  nodeSpin: 0.5,
  arcFly: 0.24,
  arcTail: 0.13,
  arcThick: 0.44,
  arcBow: 0.22,
  knotSize: 0.8,
  splatSize: 1.6,
  splatLife: 0.28,
};

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

/**
 * The damage face: the figures that fly off a hit.
 *
 * Montserrat Bold Italic, out of the same Invokers Titan Legacy build the rest
 * of this creative's type comes from — so it is drawn from the game's own set of
 * faces rather than picked off a foundry to sit next to them. What the build
 * itself draws with it is not knowable from here; that much is a guess and is
 * not the argument.
 *
 * The argument is what it is for. Every other text here is a label, held level
 * and read at leisure; a damage number is the one piece of type that is a
 * consequence of something. It already lands squashed, springs into shape and
 * scatters a few degrees off upright, and a face that leans 11.3° by design is
 * that same idea drawn into the letterforms rather than tweened onto them. It is
 * also the only cut in that set that leans at all, which is what makes it the
 * obvious one to hand this job.
 *
 * The slant is in the outlines, so nothing asks for `fontStyle: "italic"` — see
 * ui/fonts.js for why that matters on a device that cannot decode the file.
 *
 * Hitzone sits directly behind it, which makes the fallback the previous design
 * rather than a degraded one: the digits print upright in the UI face at 900,
 * exactly as they did before this constant existed. The cut carries `A-Z`,
 * `0-9` and a little punctuation and no lower case — see README-montserrat.md
 * for the subset line that ships.
 */
export const FONT_DAMAGE =
  '"Montserrat It", "Hitzone", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

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
 * How fast an ultimate happens — every knob for the gap between the tap and the
 * blast, in one place.
 *
 * The complaint this answers is the simplest one a playable can get: "I tapped
 * it and nothing happened." Three separate things were putting time between the
 * tap and the cast, and only one of them was the cut-in everybody was proud of.
 *
 *   - `rush` is the big one. A tap on a charged hero used to be *queued* until
 *     the fight loop next came round to it, and if the board was mid-cascade
 *     that is a second and a half of gems falling with the player's finger
 *     already off the card. Nothing was broken and nothing looked broken; it
 *     simply did not answer. The whole world clock runs at this rate from the
 *     tap until the cast takes over — see core/juice.js setTimeScale — so the
 *     cascade in flight finishes in a few frames and the cut-in lands on the
 *     tap. 5 is fast enough that the remainder of a long cascade is gone inside
 *     a fifth of a second and slow enough that it reads as the board hurrying
 *     rather than as a dropped frame. It never touches the cataclysm fuse,
 *     which main.js ticks on real time: rushing an animation must not cost the
 *     player seconds.
 *
 *   - `cast` is the ultimate itself, at a rate rather than by re-timing thirty
 *     tweens across four files. The cut-in, the board wipe, the spell and the
 *     numbers all move together, which is the only way to speed a beat like
 *     this up without it coming apart — a cut-in trimmed on its own just gets
 *     out of step with the sound and the blast. 1.35 takes the cast from about
 *     two and a half seconds to under two and leaves every beat in it intact.
 *     Push it past about 1.6 and the hold on the hero's face stops being a hold.
 *
 *   - `tail` is the pause after the blast, for a cast with nothing behind it. A
 *     beat to let the biggest number in the run land, and no more than that. It
 *     is skipped outright the moment another hero is queued — see
 *     Director.castUltimate — so two ultimates back to back have nothing
 *     between them at all.
 *
 * See also ULT.burst.lead in art/heroes.js, which is the fourth: the card's own
 * flare used to hold the screen for 0.42s before the cut-in was allowed to take
 * it, and is now 0.
 */
export const ULT_PACE = {
  rush: 5,
  cast: 1.35,
  tail: 0.22,
};

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
