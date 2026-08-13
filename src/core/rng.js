/**
 * Seeded RNG.
 *
 * main.js boots it from the fixed RUN_SEED, so every impression plays back off
 * the same board: the same opening deal, the same refills and the same lava
 * landing in the same cells. That is deliberate — the creative demos one
 * authored board, and a board that re-rolled itself every boot meant nobody
 * ever saw the same fight twice.
 *
 * Call reseed() with no argument to hand every run its own board instead.
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
