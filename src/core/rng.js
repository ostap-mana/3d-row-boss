/**
 * Seeded RNG.
 *
 * main.js calls a bare reseed(), so every impression rolls its own seed and
 * plays its own board: its own opening deal, its own refills, its own lava.
 *
 * Pass RUN_SEED (or any fixed number) to reseed() to pin a run down instead —
 * every boot then replays the identical fight, which is what you want for
 * reproducing a bug or capturing a recording.
 */

let state = 0x2f6e2b1;

export function reseed(seed) {
  const s = seed === undefined ? randomSeed() : seed;
  state = s >>> 0 || 1;
}

/** A seed nobody chose — the clock, stirred so nearby boots do not correlate. */
function randomSeed() {
  const t = Date.now() >>> 0;
  const r = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (t ^ ((r << 7) | (r >>> 25))) >>> 0;
}

/** xorshift32 — small, fast, good enough for picking gem colours. */
export function rnd() {
  state ^= state << 13;
  state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5;
  state >>>= 0;
  return state / 4294967296;
}

export function rndInt(n) {
  return Math.floor(rnd() * n) % n;
}

export function rndRange(a, b) {
  return a + rnd() * (b - a);
}

export function pick(arr) {
  return arr[rndInt(arr.length)];
}
