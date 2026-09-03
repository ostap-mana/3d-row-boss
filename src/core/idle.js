/**
 * Work that is allowed to take its time.
 *
 * Everything in this creative is inlined into one HTML file — see
 * vite.config.js — so there is no network here and nothing to wait on. What
 * there is instead is *decode*: every sprite arrives as a base64 data URI that
 * has to be turned into an `Image`, drawn into a canvas, and uploaded to the
 * GPU before anything can be drawn with it. That work is the whole of the gap
 * between the file being parsed and the fight being on screen.
 *
 * It is also thirty megapixels of it, which on a phone is a hundred and twenty
 * megabytes of RGBA moving through the main thread. Two thirds of that is art
 * for things that cannot possibly happen in the first seconds of a thirty
 * second fight: the twelve ult sheets need a hero to charge, the spell sheets
 * need a match, the boss's fire needs him to breathe. Loading them before the
 * first frame is paying the whole bill up front for a service most of which is
 * delivered later, and a playable that starts slowly is a playable nobody
 * finishes. See the deferred pass in main.js.
 *
 * So this file is the two things that pass needs, and nothing else: a way to
 * wait for the next frame, and a way to run a queue of jobs one frame at a
 * time. Both exist because the alternative — `Promise.all` over a dozen
 * decodes — is not slower, it is *lumpier*: `await Promise.all` yields to the
 * event loop for the decodes and then does every canvas draw and every texture
 * upload back to back in a single task, which is one stalled frame of a couple
 * of hundred milliseconds. Spread a job to a frame and the same total work is
 * a dozen frames each a little long, which is the difference between a hitch
 * the player sees and one they do not.
 */

/**
 * Resolve on the next animation frame.
 *
 * `requestAnimationFrame` rather than a timer, because the point is to land
 * *after* a paint rather than after a duration — a `setTimeout(0)` in a
 * backlogged task queue runs before the compositor ever gets a turn, which is
 * the whole thing this is trying to avoid. A document that is hidden does not
 * fire it at all, and that is correct as well: there is no frame to be late
 * for, and the work resumes with the tab.
 */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Run each job on its own frame, in order, and never reject.
 *
 * A job that throws is skipped and the queue carries on, because every one of
 * these is a piece of art with a documented fallback behind it — an ult sheet
 * that does not decode is a card with no border, not a broken run. The whole
 * point of loading this late is that the creative already works without any of
 * it; a queue that gave up halfway on a bad decode would be a worse guarantee
 * than the one each loader already makes for itself.
 *
 * @param {Array<() => unknown>} jobs thunks, run one per frame in order
 */
export async function paced(jobs) {
  for (const job of jobs) {
    await nextFrame();
    try {
      await job();
    } catch {
      /* the fallback for this piece of art stands; see the header */
    }
  }
}
