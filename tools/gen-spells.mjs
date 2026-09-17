import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/source/fx/clips");

const MODEL = "bytedance/seedance-1-lite";
const SETTINGS = {
  duration: 5,
  resolution: "480p",
  aspect_ratio: "1:1",
  camera_fixed: true,
  fps: 24,
  seed: 7,
};

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
      "Three parallel claw slashes tear diagonally across the frame " +
      "from the upper right down to the lower left, and all three open " +
      "at the very same instant, together, in one single beat: one " +
      "strike, not three. They arrive on the same frame, none of them " +
      "lagging behind another, never one after another, never three " +
      "separate attacks. It reads as one hand going through because of " +
      "how each gash tears, not because of any delay between them. Each " +
      "slash opens from nothing and rips " +
      "along its own length: a tapered gash, widest about a third of " +
      "the way along and coming to a fine point at both ends, its edges " +
      "ragged and torn with small hooks and splinters coming off them, " +
      "never a smooth stripe, never a rounded bar, never a straight " +
      "line. The middle slash is the longest and cuts the deepest, the " +
      "two outside it are shorter and sit parallel to it and evenly " +
      "spaced. Each gash is a hot crimson red wound with a thin " +
      "white-hot core burning down the middle of its length, throwing " +
      "small sparks and flecks of molten light off its torn edges, and " +
      "a faint red heat glow sits behind all three as if the air itself " +
      "had been opened. They flare to their brightest the instant they " +
      "finish opening, hold for a moment, then burn down and fade from " +
      "the tips inward until the frame is completely black again. There " +
      "is exactly one swipe in the whole clip, landing on one beat: no " +
      "second strike, no repeat, no further set of slashes after it, " +
      "and it is finished well before the clip ends.",
  },
];

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
