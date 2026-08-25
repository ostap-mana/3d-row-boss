/**
 * Generate the spell and boss-attack clips on Replicate.
 *
 *   node tools/gen-spells.mjs                 # every clip that is not on disk
 *   node tools/gen-spells.mjs water lightning # just these
 *   node tools/gen-spells.mjs --force water   # regenerate one that already exists
 *   node tools/gen-spells.mjs --list          # ids and one-line summaries
 *
 * Writes `src/source/fx/clips/<id>.mp4`. Nothing in the build reads those: they
 * are the source page, the way `src/source/fx/fire.png` is, and
 * `tools/pack-spells.mjs` is what turns them into sheets the game can play.
 *
 * ## Why video and not another page of studies
 *
 * The fire ultimate came off a still: ten drawings laid loosely across a page,
 * cut by boxes read off it by eye — see the header of tools/pack-fire.mjs for
 * how much work that was, and it was work nobody was going to repeat seven more
 * times. A page of studies also has no clock in it. Every frame is its own
 * drawing, so a spark in frame 3 is nowhere near where it was in frame 2, and
 * what the sheet buys in painterly detail it gives back as a flicker.
 *
 * A clip is the opposite trade. The frames are already registered against each
 * other, already evenly spaced in time and already the same size, so the cut is
 * an fps and a time window rather than eighty numbers typed in by hand. What it
 * costs is resolution — 480p, and downsampled again on the way into the sheet —
 * and that is the right thing to spend here, because every one of these effects
 * is on screen for well under a second.
 *
 * ## What the prompts are shaped by
 *
 * Two hard requirements come from the far end of the pipeline, not from taste:
 *
 *   1. **Pure black ground.** The sheets are played with the `add` blend, the
 *      same as the fire one, which means the backdrop does not have to be cut
 *      away — it has to land on zero, and black does that for free. This is also
 *      why no prompt here asks for smoke, dust or ash: dark paint on a dark
 *      ground subtracts to nothing and is only bytes the sheet cannot show.
 *   2. **A gather and a release, centred, in one take.** Every mage sheet is cut
 *      in half: the first frames are the bolt in flight, the rest are it landing.
 *      The clip itself does not travel — the game moves the sprite along the
 *      path, exactly as `Vfx.fireball` already does — so what the prompt has to
 *      buy is the *swell*: a core that tightens and brightens and then lets go.
 *      A camera that drifts, or an effect that wanders out of the middle of
 *      frame, comes back as a bolt that lurches sideways on its own.
 *
 * The style line is the creative's own, read off `src/source/prompts.md`, minus
 * everything about white backgrounds — that convention belongs to the props that
 * go through `tools/cut-bg.mjs`, and here it would be exactly backwards.
 */

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/source/fx/clips");

/** The model, and the settings every call shares. */
const MODEL = "bytedance/seedance-1-lite";
const SETTINGS = {
  duration: 5,
  resolution: "480p",
  // Square, because a sheet cell is square-ish and 16:9 would spend a third of
  // every frame on black that the packer crops off again.
  aspect_ratio: "1:1",
  camera_fixed: true,
  fps: 24,
  seed: 7,
};

/**
 * Pasted into every prompt, front and back.
 *
 * The tail is longer than the effect it describes, and that is deliberate: a
 * text-to-video model left to itself will happily cut to a second angle, push
 * the camera in, or set the whole thing in a cave. Each clause below is one of
 * those failures, named so it does not happen.
 */
const STYLE =
  "painted 3D mobile-RPG game VFX, semi-realistic, high contrast, " +
  "a bright white-hot core with saturated colour thrown off it, " +
  "no flat cartoon shading";

const TECHNICAL =
  "The effect is isolated on a pure black background, nothing else in frame, " +
  "no floor, no room, no landscape, no character, no hands. " +
  "The effect stays centred in frame the whole time. " +
  "Single continuous shot, one fixed camera, no cuts, no shot changes, " +
  "no camera movement, no zoom, no push in, no orbit, no parallax, " +
  "no smoke, no dust, no haze, " +
  "no text, no letters, no numbers, no watermark, no logo, no UI.";

/**
 * The clips.
 *
 * Five mage ultimates and three boss attacks. The mages are the five that have
 * been throwing a plain tinted beam since the start — Ricklow's fire is not
 * here, because his is the one that was already painted and re-cutting it off a
 * 480p clip would be a downgrade with extra steps.
 *
 * The gather at the front of every mage prompt is load-bearing. It is the half
 * of the clip that becomes the bolt in flight, and if the model opens on a
 * detonation there is nothing left to fly.
 */
const SPELLS = [
  {
    id: "water",
    what: "ARISSA - ABYSSAL TIDE - mage ultimate",
    prompt:
      "A sphere of glowing deep blue water and pale ice turns in place and " +
      "draws inward, its core brightening to white, ribbons of water winding " +
      "around it; then it bursts open into a wide crown of foaming water and " +
      "shattered ice shards thrown outward, the light going out as they fall.",
  },
  {
    id: "nature",
    what: "QUINNTO - VERDANT WRATH - mage ultimate",
    prompt:
      "A knot of glowing emerald green energy and thorned vines coils tighter " +
      "in place, its core brightening to white, leaves turning around it; " +
      "then it bursts open into a wide spray of green light, torn leaves and " +
      "splintered thorns thrown outward, the light going out as they fall.",
  },
  {
    id: "lightning",
    what: "SELISA - STORM VERDICT - mage ultimate",
    prompt:
      "A ball of crackling white and violet blue lightning gathers in place, " +
      "arcs whipping around it, the core brightening to white; then it " +
      "detonates into a wide star of forked lightning bolts striking outward " +
      "in every direction, the light going out as they snap away.",
  },
  {
    id: "wind",
    what: "TARANIS - CYCLONE EDGE - mage ultimate",
    prompt:
      "A spinning vortex of pale cyan white wind tightens in place, thin " +
      "blades of cutting air circling it, its core brightening to white; then " +
      "it bursts open into a wide ring of slicing wind streaks thrown " +
      "outward, the light going out as they thin away.",
  },
  {
    id: "arcane",
    what: "SILANTH - VOID ECLIPSE - mage ultimate",
    prompt:
      "A sphere of violet purple arcane energy collapses inward in place, " +
      "broken glowing runes circling it, its core brightening to white; then " +
      "it detonates into a wide burst of violet light and shattered rune " +
      "shards thrown outward, the light going out as they fall.",
  },
  {
    id: "breath",
    what: "MAGMAROTH - LAVA BREATH - boss attack",
    prompt:
      "A jet of molten orange lava fire pours straight toward the camera from " +
      "the far side of frame, opening out into a wide roaring cone of flame " +
      "that fills the frame, embers streaming forward through it, then " +
      "guttering out.",
  },
  {
    id: "slam",
    what: "MAGMAROTH - MAGMA SLAM - boss attack",
    prompt:
      "A hammer blow lands in the centre of frame and a shockwave of molten " +
      "orange rock and white hot sparks bursts outward from it in a low wide " +
      "ring, cracks of lava light racing out underneath, the ring thinning " +
      "and dimming as it goes.",
  },
  {
    id: "claw",
    what: "MAGMAROTH - CLAW RAKE - boss attack",
    prompt:
      "Three parallel claw slashes of white hot molten fire tear across the " +
      "frame diagonally one after another, each one flaring bright along its " +
      "length and throwing sparks off its edge, then burning down and fading.",
  },
];

/* ---------------------------------------------------------------- plumbing */

/** Repo-relative, forward slashes, for the log lines. */
const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error("REPLICATE_API_TOKEN is not set.");
  process.exit(1);
}

const auth = { Authorization: "Bearer " + TOKEN };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one prompt to a finished video URL.
 *
 * `Prefer: wait` gets the whole thing back in one request when the model is
 * warm, which it usually is; the poll below is what covers a cold start.
 */
async function generate(spell) {
  const res = await fetch(
    "https://api.replicate.com/v1/models/" + MODEL + "/predictions",
    {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify({
        input: {
          ...SETTINGS,
          prompt: STYLE + ". " + spell.prompt + " " + TECHNICAL,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error("create failed " + res.status + ": " + (await res.text()));
  }

  let job = await res.json();
  while (job.status === "starting" || job.status === "processing") {
    await sleep(3000);
    const poll = await fetch(job.urls.get, { headers: auth });
    job = await poll.json();
  }
  if (job.status !== "succeeded") {
    throw new Error(job.status + ": " + (job.error || "no error given"));
  }
  return typeof job.output === "string" ? job.output : job.output[0];
}

async function download(url, file) {
  const res = await fetch(url, { headers: auth });
  if (!res.ok) throw new Error("download failed " + res.status);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/* -------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const named = args.filter((a) => !a.startsWith("--"));

if (flags.has("--list")) {
  for (const s of SPELLS) console.log("  " + s.id.padEnd(10) + s.what);
  process.exit(0);
}

const unknown = named.filter((n) => !SPELLS.some((s) => s.id === n));
if (unknown.length) {
  console.error("unknown id: " + unknown.join(", ") + "  (try --list)");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const wanted = named.length
  ? SPELLS.filter((s) => named.includes(s.id))
  : SPELLS;

console.log(
  "model  " +
    MODEL +
    "  " +
    SETTINGS.resolution +
    " " +
    SETTINGS.aspect_ratio +
    " " +
    SETTINGS.duration +
    "s\n",
);

// One at a time. src/source/prompts.md learned this the hard way on the stills:
// three in parallel and two come back as `Request was throttled`.
for (const spell of wanted) {
  const file = join(OUT_DIR, spell.id + ".mp4");
  if (existsSync(file) && !flags.has("--force")) {
    console.log("skip " + spell.id.padEnd(10) + "already at " + rel(file));
    continue;
  }
  process.stdout.write("gen  " + spell.id.padEnd(10) + spell.what + " ... ");
  const started = Date.now();
  try {
    const url = await generate(spell);
    await download(url, file);
    const kb = (statSync(file).size / 1024).toFixed(0);
    console.log(
      ((Date.now() - started) / 1000).toFixed(0) + "s  " + kb + " kB",
    );
  } catch (err) {
    console.log("FAILED\n     " + err.message);
  }
}
