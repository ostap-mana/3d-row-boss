/**
 * The fight's sounds, as the game itself makes them.
 *
 * sfx.js builds all forty-odd of them out of oscillators, and its header is the
 * argument for that: a phone speaker has nothing under 400 Hz, so weight is
 * carried in filtered noise; the board is tuned so a cascade is a phrase rather
 * than four pops. Everything in that argument still holds, and none of it is
 * why this file exists.
 *
 * This file exists because the creative is an ad for a specific game, and that
 * game has a sound. The boss's roar can be the roar the boss actually has. The
 * blade the heroes swing can be the blade. A player who has heard the game gets
 * the thing itself, and one who has not gets a fight that sounds made rather
 * than generated — and neither of those is something a sine wave gets to.
 *
 * What it costs, and why it is a sprite: thirty-three one-shots, cut to length,
 * concatenated into one 34-second mono MP3 with 120 ms of silence between them,
 * plus a seven-second loop of the game's own volcano ambience under the board.
 * 312 kB on disk, about 416 kB base64'd into the single inlined index.html.
 * One file rather than thirty-four because an MP3 spends a fixed toll on
 * priming and padding at each end, and thirty-four tolls on sounds this short
 * would cost more than the sounds; one decode rather than thirty-four is the
 * smaller half of the argument.
 *
 * The rules are the ones the rest of the audio runs on:
 *
 *   - Nothing is trusted. Every entry point returns whether it played, and
 *     every call site in sfx.js falls through to its synthesized version when
 *     the answer is no. A webview that will not decode an MP3 gets the whole
 *     original palette and nothing missing.
 *   - Nothing is unbounded. A five-step cascade with a six-hero volley behind
 *     it asks for dozens of one-shots inside a second, so the same voice cap
 *     the oscillators answer to applies here — see `play`, and the note there
 *     on why a dropped voice still reports success.
 *
 * The board keeps its tuning. A cascade still walks up a ladder: the same
 * sample is played back at a rung of RATE per step, so a four-step combo rises
 * the way it always did, and an element still shifts a hero's colour — see
 * ELEMENT_RATE. The pitches are the palette's, the sounds are the game's.
 */

import { AUDIO } from "../config.js";
import { audioBus, audioContext, onAudioOpen, onAudioReset } from "./engine.js";
import { loadAudio } from "./decode.js";
import spriteUrl from "../assets/audio/sfx.mp3";
import outcomeUrl from "../assets/audio/outcome.mp3";
import roomUrl from "../assets/audio/room.mp3";

/** Floor for every exponential ramp — the curve cannot reach or pass zero. */
const MIN = 0.0001;

/**
 * Where each one-shot sits in the sprite, and what it is worth in the mix.
 *
 * `at` is measured from the first sample of the first cut, *not* from the start
 * of the buffer: the sprite opens with 150 ms of digital silence, `play` adds
 * the head it finds at runtime, and counting that silence twice would put every
 * one of these 150 ms late. See findHead in decode.js for why the head is found
 * rather than assumed. `gain` carries over the level the same event
 * had when it was synthesized, so the palette balances the way it was tuned to;
 * `AUDIO.sfxSampleLevel` scales the lot. The comment on each line is the sound
 * it was lifted from, which is the only way back to the original.
 *
 * `bank` says which file a cut is measured into, and everything the last screen
 * makes a sound with carries one. They are the last sound the player hears and they were the two weakest
 * things in here — a menu tab for a win and a back button for a loss, borrowed
 * because they were already in the sprite — so they were re-cut from the game's
 * own victory stinger and its own braam, and re-cut assets do not fit in a file
 * whose thirty-three offsets were fixed the day it was encoded. They live in
 * outcome.mp3, built by tools/pack-outcome.mjs, which is also the only place
 * the argument for a second file is written down. Everything else about them is
 * unchanged: same table, same levels, same fallback when the decode fails.
 *
 * The two `*Vo` slices are the game's narrator saying which ending it was, and
 * they are separate cuts rather than part of the stingers so the gap between
 * the hit and the word is a number in sfx.js instead of a decision frozen into
 * an encode. Both fall back to nothing rather than to an oscillator — see
 * `outcomeVoice` in sfx.js for why a missing voice is silence and a missing
 * stinger is not.
 *
 * They are the two loudest gains in this table, and the pair is not level with
 * itself: 0.32 against 0.36. Every cut in both files is peak-normalized, so a
 * gain here is a peak and what the ear weighs is the RMS underneath it — and
 * these two sit over different stingers. `victory` is a musical hit with 14 dB
 * of crest and the word clears it by 1.5 dB at 0.32; `defeat` is a sustained
 * braam with 12, dense enough that the same 0.32 puts the word 0.2 dB *under*
 * it and the ear loses the one sound in the mix that carries meaning. 0.36 is
 * the gain that lands "Defeat" a decibel over its own stinger instead — close
 * enough to the win's 1.5 that the two endings weigh the same, and measured
 * rather than guessed. The bus compressor (-16 dB, 9:1, see engine.js) takes
 * the sum of either pair down about 10 dB, which is the ducking that makes a
 * voice read on top of a mix rather than beside it; neither pair clips.
 */
const SLICES = {
  /* --------------------------------------------------------------- board */
  select: { at: 0, dur: 0.09, gain: 0.1 }, // ui_click_tab
  swap: { at: 0.21, dur: 0.26, gain: 0.09 }, // SMN_SWRD_WHS_SML_1
  reject: { at: 0.59, dur: 0.19, gain: 0.12 }, // KNB_01
  match: { at: 0.9, dur: 0.42, gain: 0.16 }, // MGC_HIT_01
  drop: { at: 1.44, dur: 0.55, gain: 0.12 }, // Stones_1
  shuffle: { at: 2.11, dur: 0.7, gain: 0.1 }, // LootCoins_1
  obsForm: { at: 2.93, dur: 0.65, gain: 0.16 }, // FRZ
  obsBreak: { at: 3.7, dur: 0.55, gain: 0.16 }, // Bottle_1
  knock: { at: 4.37, dur: 0.34, gain: 0.13 }, // ML_1
  combo: { at: 4.83, dur: 0.42, gain: 0.14 }, // LootTake_2
  /* -------------------------------------------------------------- heroes */
  charged: { at: 5.37, dur: 0.8, gain: 0.12 }, // LootTakeMana
  strike: { at: 6.29, dur: 0.28, gain: 0.1 }, // BLD_01
  hurt: { at: 6.69, dur: 0.3, gain: 0.12 }, // ARM_02
  down: { at: 7.11, dur: 0.85, gain: 0.14 }, // MGC_IMPCT_1
  heal: { at: 8.08, dur: 1.1, gain: 0.1 }, // MGC_26
  cutin: { at: 9.3, dur: 1, gain: 0.18 }, // SMN_WH_BIG_1
  ult: { at: 10.42, dur: 1.6, gain: 0.3 }, // SMN_IMCPT_2
  /* ---------------------------------------------------------------- boss */
  rise: { at: 12.14, dur: 1.1, gain: 0.24 }, // MobSpawn
  roar: { at: 13.36, dur: 1.7, gain: 0.3 }, // VC_DRGN_SCRM_5
  spit: { at: 15.18, dur: 0.85, gain: 0.16 }, // VC_DRGN_ATT_1
  breath: { at: 16.15, dur: 1.2, gain: 0.14 }, // SMN_WH_FIRE
  smash: { at: 17.47, dur: 1.2, gain: 0.3 }, // SMN_IMCPT_1
  hit: { at: 18.79, dur: 0.5, gain: 0.14 }, // SMN_SWRD_IMPCT
  enrage: { at: 19.41, dur: 1.5, gain: 0.24 }, // VC_EVIL_LAUGH_1
  die: { at: 21.03, dur: 1.9, gain: 0.3 }, // VC_DRGN_DTH
  boom: { at: 23.05, dur: 1.4, gain: 0.26 }, // MGC_EXPL_1
  /* ------------------------------------------------------ clock and card */
  doomWarn: { at: 24.57, dur: 1, gain: 0.18 }, // ui_click_braam
  doomCast: { at: 25.69, dur: 1.8, gain: 0.26 }, // SMN_MGC_3
  victory: { bank: "outcome", at: 0, dur: 3.0, gain: 0.28 }, // DEMO_victory
  defeat: { bank: "outcome", at: 3.12, dur: 2.6, gain: 0.22 }, // ui_click_braam
  /* The narrator, over the two stingers above — see the note under `bank`. */
  victoryVo: { bank: "outcome", at: 5.84, dur: 1.2, gain: 0.32 }, // "Victory!"
  defeatVo: { bank: "outcome", at: 7.16, dur: 1, gain: 0.36 }, // "Defeat"
  /**
   * The store card assembling — see CARD_ARRIVAL in sfx.js.
   *
   * Nothing in this group is fired any more, and nothing is meant to be. The
   * card arrives on `endcard` below — the title sting, 1.6 seconds over the
   * whole assembly — and on nothing else: every part of it landing on a click
   * of its own was a second thing arriving inside the first, and the three
   * attempts at it are written up in ui/endcard.js where the sequence is.
   *
   * All six cuts are left in the file. They are cut, verified and already paid
   * for in about 4 kB of something that is inlined whole, so a card that wants
   * a sound per part again is a call site and a lookup table rather than a
   * re-encode of outcome.mp3 and a re-measure of every offset behind it. What
   * each was for is below, in the present tense, for whoever goes back.
   *
   * Four light rungs darkest to brightest and a clack for the plate, all five
   * the game's own UI. They climb on timbre rather than on playback rate, which
   * is what replaced them: every rung used to be the board's `select` click
   * resampled, and the top one was that 90 ms cut squeezed to 63.
   *
   * The four are no longer a ladder walked in order. `cardA` and `cardB` are
   * the two conditional lines', `cardC` is the store row's and `cardD` is the
   * logo landing at the end of the whoosh `banner` is cut from; the two parts
   * that carry the card — the plate and the rematch — have cuts of their own
   * below. See CARD_PARTS in sfx.js, which is where the mapping lives.
   *
   * Each opens 20 ms before the cut was laid down and runs 20 ms longer,
   * ending where it always did. That is not padding — it is the cut's own
   * pre-echo, which an MP3 encoder puts in front of an attack this sharp and
   * which a slice starting on the offset would play from the middle of. See
   * PRE in tools/pack-outcome.mjs, where the number is argued.
   *
   * Every level here is 5 dB over the 0.11 a UI click carries during a fight,
   * and the whole group moved together so the balance below is untouched. The
   * card is not the board: the lobby theme is under it at `musicTrackLevel` and
   * the title sting lands over the whole assembly, and a click tuned to be
   * heard against an empty board is heard against neither. What the lift buys
   * is each arrival reading as a part landing rather than as a tick somewhere
   * behind the music; what it costs is nothing, because nothing else is
   * competing for this screen.
   */
  cardA: { bank: "outcome", at: 8.26, dur: 0.13, gain: 0.2 }, // ui_click_add_2
  cardB: { bank: "outcome", at: 8.49, dur: 0.14, gain: 0.2 }, // ui_click_add_3
  cardC: { bank: "outcome", at: 8.73, dur: 0.14, gain: 0.2 }, // ui_click_add_1
  cardD: { bank: "outcome", at: 8.97, dur: 0.14, gain: 0.2 }, // ui_click_tab_add
  cardPlate: { bank: "outcome", at: 9.21, dur: 0.26, gain: 0.27 }, // ui_bottle
  /**
   * The plate's top and the rematch's tick — the two cuts the card grew when
   * the ladder became a part list. See CARD_PARTS in sfx.js for what they are
   * for, and pack-outcome.mjs for how they are cut; both gains are arithmetic
   * off the RMS of the cut, because a peak-normalized table cannot be balanced
   * by eye.
   *
   * `cardShine` sits over `cardPlate` rather than beside it. Both are
   * peak-normalized to -1.4 dBFS and their RMS is not the same — the clack is
   * -12.2 dB and the sheen -21.0, ten decibels of crest apart — so matching
   * their gains would put the sheen ten under the body and lose it. It sits a
   * ratio of 1.33 over the clack, which lands it 6 dB under the clack's own
   * contribution and 6 over a light click: a top on a button rather than a
   * second button.
   *
   * `cardBack` is 18 ms of tick where every other click here is 90 to 120, and
   * the ear weighs energy rather than peak: at a click's own gain it carries
   * 6 dB less than they do and disappears under the endcard theme. A ratio of
   * 1.33 over a click puts it about 3 dB under one — still the quietest arrival
   * on the card, which is what the rematch is meant to be, and still audible,
   * which it was not.
   *
   * Both ratios are what is tuned, not the absolute numbers: the group moved
   * 5 dB with the rungs above and these two moved with it.
   */
  cardShine: { bank: "outcome", at: 9.57, dur: 0.23, gain: 0.36 }, // ui_click_high
  cardBack: { bank: "outcome", at: 9.9, dur: 0.07, gain: 0.27 }, // ui_click_back_1
  banner: { at: 31.55, dur: 0.32, gain: 0.1 }, // ui_expand_in
  endcard: { at: 31.99, dur: 1.6, gain: 0.16 }, // SMN_TITLE
  /**
   * The tap that leaves for the store, and the loudest click in either file.
   *
   * Raised with the card's own arrivals for the same reason: it is the one
   * input the creative is built to collect, it is taken over the theme and the
   * sting, and at a fight click's 0.12 the player who committed heard less than
   * the player who tapped a gem.
   */
  cta: { at: 33.71, dur: 0.12, gain: 0.18 }, // ui_click_main
};

/**
 * The cascade ladder, as playback rates.
 *
 * The same rungs LADDER in sfx.js walks, expressed as ratios instead of
 * frequencies, because a sample has a pitch already and all we can do is move
 * it. Pentatonic, and it tops out for the same reason: past the sixth step a
 * clear resampled any further is a chirp rather than a note.
 */
const RATE = [1.0, 1.12, 1.26, 1.5, 1.68, 2.0, 2.24];

/**
 * A rate per element, so a hero's attack still sounds like their colour.
 *
 * Narrower than the octave-and-a-half between the ELEMENT notes in sfx.js.
 * Detuning an oscillator that far is free; resampling a recorded blade that far
 * turns it into a different object, and the whole point of the file is that it
 * is the game's blade. A minor third across the six is enough to tell them
 * apart without any of them stopping being the thing they were.
 */
const ELEMENT_RATE = [0.86, 1.06, 0.94, 1.18, 1.0, 1.3];

let sprite = null;
/** The two endings, in a file of their own — see `bank` in SLICES. */
let outcome = null;
let roomAudio = null;
/**
 * Audio-clock times the one-shots in the air are due to finish.
 *
 * The same budget the oscillators answer to and, while it was a plain count
 * that only ever came down inside `onended`, the same bug — see the note on
 * `live` in engine.js. It bit harder here than there. A one-shot is started
 * with an explicit duration and left to finish on its own, which is the exact
 * shape of source some webviews never fire `onended` for; and `play` reports a
 * dropped voice as *handled*, so sfx.js does not fall through to its
 * synthesized twin. A leaked budget on this side is not a thinner mix, it is a
 * creative that goes quiet partway through the fight and stays quiet.
 *
 * Deadlines rather than a tally, collected on the next allocation. Every slice
 * has a length and a rate, so when it ends is known when it starts.
 */
const live = [];

let roomNodes = null;
/** Quantized tension, so a per-frame call is not a per-frame ramp. */
let roomTension = -1;

if (AUDIO.sfxSamples) {
  loadAudio(spriteUrl).then((got) => {
    sprite = got;
  });
  // Its own decode, and a failed one costs exactly the two endings: `play`
  // reports a missing bank the way it reports a missing sprite, and sfx.js
  // falls through to the arpeggios it has always had behind them.
  loadAudio(outcomeUrl).then((got) => {
    outcome = got;
  });
  if (AUDIO.bed) {
    loadAudio(roomUrl).then((got) => {
      roomAudio = got;
    });
  }
}

// The nodes belonged to a context that is closed, and so did every `onended`
// that was going to bring the voice count back down. Both go together.
onAudioReset(() => {
  live.length = 0;
  roomNodes = null;
  roomTension = -1;
});

/** Let go of every one-shot whose time is up, whether or not it said so. */
function reap(c) {
  if (!live.length) return;
  const t = c.currentTime;
  let kept = 0;
  for (let i = 0; i < live.length; i++) {
    if (live[i] > t) live[kept++] = live[i];
  }
  live.length = kept;
}

export const samples = {
  /** Whether this file is allowed to try at all. */
  enabled() {
    return !!AUDIO.sfxSamples;
  },

  /** Whether the sprite is decoded and a one-shot would actually be heard. */
  ready() {
    return !!sprite;
  },

  /**
   * Fire one cut out of the sprite.
   *
   * @param {string} name a key of SLICES
   * @param {object} [o] `rate` to move it on the ladder, `gain` as a multiplier
   *   on the slice's own level, `delay` in seconds to stagger it behind others
   * @returns {boolean} whether the caller can consider it handled. False means
   *   the sample is genuinely unavailable and the synthesized version in sfx.js
   *   should play instead.
   */
  play(name, o) {
    const s = SLICES[name];
    if (!AUDIO.sfxSamples || !s) return false;
    // Which file this cut was measured into. A bank that has not decoded is
    // the same answer as a sprite that has not: not handled, so the caller
    // synthesizes it.
    const bank = s.bank === "outcome" ? outcome : sprite;
    if (!bank) return false;
    const c = audioContext();
    const out = audioBus();
    if (!c || !out) return false;
    // Over budget is a dropped sound, not a synthesized one: the cascade that
    // blew the cap would blow it twice as fast if every drop fell through to an
    // oscillator, and a late sound is worse than a missing one either way.
    // Which only holds while the budget is honest about what is still
    // playing — see `live`, and `reap`, which is what makes a blown cap a
    // cascade's worth of silence rather than the rest of the session's.
    reap(c);
    if (live.length >= AUDIO.maxVoices) return true;

    const opts = o || {};
    const gain = c.createGain();
    gain.gain.value =
      s.gain * (opts.gain === undefined ? 1 : opts.gain) * AUDIO.sfxSampleLevel;
    gain.connect(out);

    const src = c.createBufferSource();
    src.buffer = bank.buffer;
    if (opts.rate) src.playbackRate.value = opts.rate;
    src.connect(gain);
    const at = c.currentTime + (opts.delay || 0);
    try {
      // `duration` is measured in the buffer rather than in real time, so a cut
      // played fast is short and one played slow is long — and neither of them
      // can run past its own slice into the next one's silence.
      src.start(at, bank.head + s.at, s.dur);
    } catch (e) {
      return false;
    }
    // Buffer seconds over the rate they are read at, which is when the cut
    // actually stops rather than how long the slice is: a clear on the top rung
    // of the cascade ladder plays at 2.24x and holds its slot for less than
    // half as long as the same clear on the bottom one.
    const until = at + s.dur / (opts.rate || 1) + 0.05;
    live.push(until);
    src.onended = () => {
      // By value rather than by identity: two voices due at the same instant
      // are interchangeable to a budget that only counts them.
      const i = live.indexOf(until);
      if (i >= 0) live.splice(i, 1);
    };
    return true;
  },

  /** Both rungs, so sfx.js does not have to know how a ladder is spelled. */
  rate(step) {
    return RATE[Math.max(0, Math.min(RATE.length - 1, step | 0))];
  },

  elementRate(element) {
    return ELEMENT_RATE[element] || ELEMENT_RATE[0];
  },

  /**
   * The lava under everything — the game's own volcano, on a loop.
   *
   * Same job as the synthesized bed in sfx.js and the same levels, but the
   * filter sweep is not the same sweep: that one opens a lowpass from 240 Hz
   * because what is behind it is two saws and a band of noise, and this one
   * would be mud at 240. The recording already has its own top; the sweep opens
   * it from 500 Hz to 2.6 kHz, which is the same gesture on a source that
   * starts an octave higher.
   */
  room: {
    start() {
      if (!AUDIO.bed || !AUDIO.sfxSamples || roomNodes || !roomAudio)
        return false;
      const c = audioContext();
      const out = audioBus();
      if (!c || !out) return false;

      const gain = c.createGain();
      gain.gain.value = MIN;
      gain.connect(out);
      const cut = c.createBiquadFilter();
      cut.type = "lowpass";
      cut.frequency.value = 500;
      cut.Q.value = 0.7;
      cut.connect(gain);

      const src = c.createBufferSource();
      src.buffer = roomAudio.buffer;
      src.loop = true;
      src.loopStart = roomAudio.head;
      src.loopEnd = Math.min(
        roomAudio.head + AUDIO.roomLoop,
        roomAudio.buffer.duration,
      );
      src.connect(cut);
      try {
        src.start(c.currentTime + 0.02, roomAudio.head);
      } catch (e) {
        return false;
      }

      roomNodes = { src, gain, cut };
      roomTension = -1;
      gain.gain.setTargetAtTime(AUDIO.bedLevel, c.currentTime, 1.2);
      return true;
    },

    playing() {
      return !!roomNodes;
    },

    /**
     * @param {number} v 0 at the top of the clock, 1 when it is about to land
     */
    setTension(v) {
      if (!roomNodes) return;
      const t = Math.max(0, Math.min(1, v || 0));
      const step = Math.round(t * 12);
      if (step === roomTension) return;
      roomTension = step;
      const c = audioContext();
      if (!c) return;
      const at = c.currentTime;
      roomNodes.cut.frequency.setTargetAtTime(500 + t * 2100, at, 0.6);
      roomNodes.gain.gain.setTargetAtTime(
        AUDIO.bedLevel * (1 + t * 1.4),
        at,
        0.6,
      );
    },

    stop() {
      if (!roomNodes) return;
      const c = audioContext();
      if (!c) return;
      // Faded, and the source is left to run under it: a room that stops on a
      // frame boundary is a click at the exact moment the fight ends.
      roomNodes.gain.gain.setTargetAtTime(MIN, c.currentTime, 0.5);
    },
  },
};

// Registered below the export rather than beside the reset hook above, because
// this one reaches into `samples` and onAudioOpen runs its callback inline if
// the context is already open. It never is at module load — a context is not
// built before the first gesture — but a hook that would explode if that ever
// changed is not worth the four lines it saves.
onAudioOpen(() => {
  // The room is the one thing here that has to *begin* rather than be fired,
  // and a rebuilt context is a room that stopped. Start it again, on the same
  // terms sfx.js starts it on.
  if (AUDIO.bed && AUDIO.sfxSamples && !roomNodes) samples.room.start();
});
