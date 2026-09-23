import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "video/masters/fx");

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

const BOSS_STYLE =
  "painted 3D mobile-RPG game VFX in the boss KOLTMOS's own colours, " +
  "semi-realistic, high contrast, a white-hot core with violet and magenta " +
  "light thrown off it, torn gold-bright edges and crimson embers, " +
  "no flat cartoon shading";

const TECHNICAL =
  "The effect is isolated on a pure black background, nothing else in frame, " +
  "no floor, no room, no landscape, no character, no hands. " +
  "The effect stays centred in frame the whole time. " +
  "Single continuous shot, one fixed camera, no cuts, no shot changes, " +
  "no camera movement, no zoom, no push in, no orbit, no parallax, " +
  "no smoke, no dust, no haze, " +
  "no text, no letters, no numbers, no watermark, no logo, no UI.";

const HIT_STYLE =
  "stylized mobile-RPG game VFX, an additive impact effect rendered over a " +
  "pure black screen, not photographic and not filmed footage: a blinding " +
  "white-hot core with saturated colour torn off it, crisp hard edges, deep " +
  "black between them, high contrast";

const HIT_TAIL =
  "The burst stays dead centre of frame and never reaches the edges, so the " +
  "corners stay pure black. One hit on one beat: it is widest and brightest on " +
  "the first instant, it does not gather or charge first, then it dies away " +
  "until the frame is completely black again. No second blast, no pulsing, no " +
  "haze, no smoke, no ground, no character, no text. Square frame, fixed " +
  "camera, static shot.";

const HITS = [
  {
    id: "hit-fire",
    what: "FIRE - hit",
    prompt:
      "One explosion of white-hot fire detonates dead centre of the black " +
      "frame: a near-white core with torn orange flame peeling outward in " +
      "thick ragged tongues, deep ember-red light dragging behind, bright " +
      "embers and molten flecks thrown out radially, then it burns down and " +
      "thins away.",
  },
  {
    id: "hit-water",
    what: "WATER - hit",
    prompt:
      "One burst of glowing azure water detonates dead centre of the black " +
      "frame: sheets of water thrown outward lit white from inside, pale " +
      "ice-blue foam and spray torn off their edges, deep blue light through " +
      "the body of the water, droplets and splinters of ice thrown out " +
      "radially, then it drains away.",
  },
  {
    id: "hit-nature",
    what: "NATURE - hit, the earth element",
    prompt:
      "One burst of emerald light detonates dead centre of the black frame: " +
      "splintered slabs of dark stone and torn bark thrown outward off a " +
      "white-hot core, whipping vines snapping open behind them, deep green " +
      "light burning in the cracks, glowing spores and torn leaves thrown out " +
      "radially, then it falls and dims.",
  },
  {
    id: "hit-wind",
    what: "WIND - hit, the air element",
    prompt:
      "One burst of cutting air detonates dead centre of the black frame: " +
      "hard bright edges of pale teal wind thrown outward in crossing blades, " +
      "near-white where they cross, one thin sharp ring of compressed air " +
      "racing out ahead of them, deep teal light behind, fine near-white motes " +
      "flicked out radially, then it thins away.",
  },
  {
    id: "hit-light",
    what: "LIGHTNING - hit, the light element",
    prompt:
      "One detonation of gold-white holy light dead centre of the black " +
      "frame: the core flashes pure white and straight hard blades of gold " +
      "light stab outward from it like rays with deep black between them, " +
      "fine forked gold arcs snapping off the core, deep amber light behind, " +
      "pale gold sparks thrown out radially, then the rays snap away.",
  },
  {
    id: "hit-dark",
    what: "ARCANE - hit, the dark element",
    prompt:
      "One detonation of violet void power dead centre of the black frame: a " +
      "blinding white core opening into a wide flat ring of violet light " +
      "racing outward, torn black tendrils of shadow whipping off the core " +
      "with it, deep indigo light smeared behind, pale lilac motes and shards " +
      "of magenta light thrown out radially, then the ring thins and winks out.",
  },
].map((hit) => ({ ...hit, style: HIT_STYLE, technical: HIT_TAIL }));

const SPELLS = [
  ...HITS,
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
    what: "KOLTMOS - LAVA BREATH - boss attack",
    style: BOSS_STYLE,
    prompt:
      "A jet of violet fire with a white-hot throat pours straight toward the " +
      "camera from the far side of frame and opens out into one wide roaring " +
      "cone that fills the frame, magenta embers and gold flecks streaming " +
      "forward through it, the flame torn and ragged along its edges. It " +
      "reaches its widest and brightest early, holds for a moment, then guts " +
      "out from the throat forward, the last embers riding away from the " +
      "camera until the frame is completely black again. One single breath on " +
      "one beat: no second jet, no pulsing, no repeat, and it is finished " +
      "well before the clip ends.",
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
  {
    id: "erupt",
    what: "KOLTMOS - ERUPTION - boss attack, the whole party",
    style: BOSS_STYLE,
    prompt:
      "The ground across the full width of frame splits open along one " +
      "jagged crack and columns of violet fire erupt straight upward through " +
      "it, all of them rising together on one beat, the middle column the " +
      "tallest and the ones to either side shorter, so the row reads as one " +
      "ridge of fire and not as separate flames taking turns. Slabs of black " +
      "obsidian and white-hot sparks are thrown up with the columns, magenta " +
      "light burning in the crack underneath them. The eruption reaches its " +
      "full height and its brightest early, holds for a moment, then falls " +
      "back and burns out from the top down until the frame is completely " +
      "black again. Exactly one eruption: no second wave, no rolling line of " +
      "further bursts, and it is finished well before the clip ends.",
  },
  {
    id: "doom",
    what: "KOLTMOS - CATACLYSM - boss ultimate",
    style: BOSS_STYLE,
    prompt:
      "A single point of white light in the centre of frame swells for an " +
      "instant and detonates into one enormous nova of violet and magenta " +
      "fire that floods the entire frame, a hard thin ring of white-hot light " +
      "racing outward ahead of it, torn crimson flame and gold cinders " +
      "dragging behind, the centre burning out to near white at the peak. " +
      "Then the whole thing collapses inward and burns down, the ring thinning " +
      "away past the edges, the last cinders going dark, until the frame is " +
      "completely black again. Exactly one detonation on one beat: no second " +
      "blast, no aftershock, no repeat, and it is finished well before the " +
      "clip ends.",
  },
  {
    id: "mend",
    what: "KOLTMOS - MENDS - boss heal",
    prompt:
      "A ring of emerald green light draws itself low in the centre of frame " +
      "and rises as one slow column of green and pale gold motes, thin " +
      "ribbons of light winding upward around it, its core brightening to " +
      "white as it goes. The column reaches its brightest, holds, then thins " +
      "and drifts apart, the motes going out one by one as they rise, until " +
      "the frame is completely black again. It is a calm rising mend and not " +
      "an attack: no burst, no explosion, no shockwave, no debris, one single " +
      "rise, and it is finished well before the clip ends.",
  },
  {
    id: "roar",
    what: "KOLTMOS - ENRAGE ROAR - the beat before CATACLYSM",
    style: BOSS_STYLE,
    prompt:
      "Two or three rings of violet shockwave light blow outward from the " +
      "centre of frame one after another, each one a thin torn hoop of " +
      "white-hot light with magenta fire smeared behind it, growing fast and " +
      "thinning as it goes, dust of gold cinders shaken loose and blown " +
      "outward with them. The rings are brightest as they leave and are gone " +
      "past the edges of frame, and the light at the centre sinks away to " +
      "nothing until the frame is completely black again. No fireball, no " +
      "explosion at the centre, no debris left behind, and it is finished " +
      "well before the clip ends.",
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
        input: { ...SETTINGS, prompt: compose(spell) },
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

const compose = (spell) =>
  (spell.style || STYLE) +
  ". " +
  spell.prompt +
  " " +
  (spell.technical || TECHNICAL);

if (flags.has("--print")) {
  const wanted = named.length
    ? SPELLS.filter((s) => named.includes(s.id))
    : SPELLS;
  console.log(
    "settings  " +
      SETTINGS.resolution +
      "  " +
      SETTINGS.aspect_ratio +
      "  " +
      SETTINGS.duration +
      "s  " +
      SETTINGS.fps +
      "fps  fixed camera\n",
  );
  for (const spell of wanted) {
    console.log("--- " + spell.id + "  " + spell.what + "\n");
    console.log(compose(spell) + "\n");
  }
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
