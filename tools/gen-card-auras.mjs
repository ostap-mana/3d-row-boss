import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, "src/source/cards/aura-workflows");

const HOST = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const SHOT =
  "filling the entire frame edge to edge, seen close up, " +
  "pure black background behind it, nothing else in the shot, " +
  "high contrast, bright white-hot core with a coloured bloom, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_EVEN =
  "extreme close-up macro texture, looking straight down at it from directly " +
  "above, filling the entire frame edge to edge and corner to corner, " +
  "uniform even density everywhere, no focal point, no subject, no centre, " +
  "no composition, equally bright in all four corners, " +
  "violent fast chaotic motion, everything churning at once, " +
  "pure black background behind it, nothing else in the shot, " +
  "high contrast, bright white-hot cores with a coloured bloom, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_FLOW =
  "extreme close-up, filling the entire frame edge to edge, " +
  "strong vertical flow, streaming fast along the frame, " +
  "high contrast, sharp bright white-hot strands with deep black gaps " +
  "between them, no haze, no smoke, no wash, " +
  "pure black background behind it, nothing else in the shot, " +
  "no subject, no horizon, no scenery, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_DENSE =
  "extreme close-up, filling the entire frame edge to edge, " +
  "dense and highly detailed, packed with fine detail everywhere, " +
  "strong vertical flow streaming along the frame, " +
  "fast violent motion, churning and flickering, " +
  "high contrast, bright white-hot cores against deep black, " +
  "pure black background behind it, nothing else in the shot, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const STYLE_BLOCK =
  "painted 3D mobile-RPG game art, semi-realistic, rich and ornate, " +
  "high contrast against a dark ground, no flat cartoon shading";

const SHOT_FLARE =
  `${STYLE_BLOCK}, ` +
  "seen side on, filling the frame from the bottom edge upward, " +
  "rooted along the bottom edge of the frame and reaching up, " +
  "clearly separated strands with deep black between them, " +
  "dense and white-hot at the base, thinning and fading out toward the top, " +
  "the top of the frame is empty black, " +
  "fast violent motion, lashing and flickering, " +
  "pure black background, nothing else in the shot, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_BURST =
  `${STYLE_BLOCK}, ` +
  "seen side on, filling the frame from the bottom edge upward, " +
  "rooted along the bottom edge of the frame, " +
  "one single burst: it erupts upward off the bottom edge, peaks, " +
  "then falls back and dissipates completely into black by the end, " +
  "clearly separated strands with deep black between them, " +
  "white-hot at the peak, " +
  "fast violent motion, " +
  "pure black background, nothing else in the shot, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const NEG =
  "text, letters, numbers, watermark, logo, signature, " +
  "person, face, character, creature, hands, animal, " +
  "scenery, landscape, horizon, room, floor, table, sky, candle, torch, " +
  "frame, border, rectangle, circle, ring, card, window, " +
  "white background, grey background, gradient background, " +
  "camera movement, zoom, pan, dolly, shaking, " +
  "blurry, low contrast, washed out, dim, static, still, frozen, motionless, " +
  "empty, sparse, mostly black, " +
  "vignette, dark corners, black corners, one bright side, one dark side, " +
  "gradient falloff, spotlight, focal point, subject, centred composition, " +
  "depth of field, bokeh, out of focus";

export const ELEMENTS = [
  {
    id: "fire",
    color: 0xff5a1f,
    takes: [
      "a wall of roaring orange fire, flames rising and churning fast, tongues of flame flickering, white-hot at the base",
      "a storm of embers and cinders pouring upward, orange sparks showering through the dark, streaks of ember light",
      "molten lava flowing and folding, glowing orange cracks opening and closing across a dark crust",
      "a firestorm of red and gold flame twisting in a spiral, heat haze rippling through it",
      "a bed of white-hot burning coals seen from directly above, flames licking straight up toward the camera all across it, embers bursting off the whole surface",
      "a sheet of turbulent orange fire seen head on, dense tongues of flame folding over each other everywhere at once, white-hot cores throughout",
      "a tall vertical curtain of fire streaming upward fast, bright white-hot tongues of flame separated by deep black gaps",
      "vertical streaks of ember and flame racing upward, sharp bright sparks trailing long thin tails through black",
      "a towering wall of roaring fire, tall licks of orange flame streaming upward and churning over each other, showers of embers, white-hot at the cores",
      "a dense firestorm of flame and cinders rushing upward, thick tongues of red and gold fire folding through each other, sparks everywhere",
      "jagged spears of molten rock and orange flame driving upward, glowing lava cracks splitting open at their base, embers thrown off them",
      "one eruption of molten rock and fire bursting upward, a shower of embers blown out with it, then collapsing back into the dark",
    ],
  },
  {
    id: "water",
    color: 0x2fa8ff,
    takes: [
      "rushing cyan water in liquid ribbons, streams twisting and folding fast, white foam edges",
      "a breaking wave of deep blue water, white foam and spray bursting outward",
      "a curtain of rising bubbles in clear cyan water, caustic light rippling through it",
      "a whirlpool of blue water spinning fast, droplets flicking off it, white spray",
      "violent white-water rapids seen from directly above, foam and spray tearing in every direction across the whole surface",
      "a dense field of cyan water boiling and churning, white foam bursting everywhere at once, droplets flicking off in all directions",
      "a tall vertical curtain of cyan water pouring down fast, bright white foam ribbons separated by deep black gaps",
      "vertical jets of blue water racing past, sharp bright droplet streaks trailing long thin tails through black",
      "a towering wall of rushing cyan water, thick ribbons of it twisting and folding fast, white foam and spray tearing off everywhere",
      "a dense torrent of deep blue water pouring past, churning white-water and bursting foam, droplets flicking through it",
      "curling sheets of deep blue water peeling upward, white foam crests and spray tearing off their edges, frost motes drifting through them",
      "one wall of deep blue water bursting upward into a crown of white foam and spray, then falling back and draining away",
    ],
  },
  {
    id: "nature",
    color: 0x3fd16a,
    takes: [
      "emerald vines and leaves growing fast and curling over each other, green tendrils whipping",
      "a swarm of glowing green spores and fireflies drifting and swirling through the dark",
      "thorned branches sprouting fast, green blossom bursting open across them",
      "a storm of green leaves and petals whirling in a fast current",
      "a dense mat of emerald vines and leaves seen from directly above, tendrils whipping and coiling over each other everywhere at once",
      "a thick canopy of green foliage thrashing in a storm seen from directly above, glowing green sap veins pulsing through all of it",
      "tall vertical emerald vines shooting upward fast, bright green tendrils separated by deep black gaps",
      "vertical streaks of glowing green spores racing upward, sharp bright motes trailing long thin tails through black",
      "a dense thicket of emerald vines whipping and coiling upward fast, glowing green tendrils lashing over each other, leaves tearing past",
      "a towering surge of green growth rushing upward, thorned branches sprouting and blossom bursting open across them, glowing spores everywhere",
      "thorned emerald vines lashing upward and coiling over each other, torn leaves turning in the air between them, green light running in the stems",
      "one eruption of thorned vines bursting upward and unfurling, blossom torn open across them, then withering back down",
      "a few enormous woody thorned vines, thick as branches, driving upward far apart from each other, broad emerald leaves unfurling along them, wide black gaps between",
      "one eruption of a few enormous thorned vines whipping upward far apart, broad leaves unfurling, then withering back down into the dark",
    ],
  },
  {
    id: "lightning",
    color: 0xffd22e,
    takes: [
      "forked lightning bolts arcing and branching, electric yellow and white, striking fast",
      "crawling electric filaments and static discharge crackling over each other",
      "chains of plasma sparks bursting outward, yellow current racing through the dark",
      "a cage of flickering electricity, pale blue and yellow arcs striking in every direction",
      "a dense web of electric filaments crackling in every direction at once, branching yellow arcs snapping across the whole surface",
      "a sheet of plasma crawling with electric discharge everywhere at once, white-hot forks striking in every direction",
      "tall vertical lightning bolts striking down fast, bright white-hot forks separated by deep black gaps",
      "vertical filaments of electric current racing past, sharp bright arcs trailing long thin tails through black",
      "a dense storm of forked lightning striking and branching fast, white-hot arcs of electric yellow tearing through the dark, sparks scattering",
      "a towering cage of crackling electricity, chains of plasma racing past each other, glow-cored bolts snapping open",
      "hard-edged forked lightning striking upward and branching, white-hot cores, sparks scattering off every fork",
      "one strike of forked lightning bursting upward into a cage of white-hot arcs, then guttering out to nothing",
      "a few enormous jagged lightning bolts, thick white-hot channels with hard angular forks, striking upward far apart from each other, wide black gaps between",
      "one strike of a few enormous jagged bolts, thick white-hot channels forking upward far apart, then guttering out to nothing",
    ],
  },
  {
    id: "arcane",
    color: 0xa855f7,
    takes: [
      "rotating violet runic sigils and glyph rings, arcane symbols turning and glowing",
      "a violet nebula of magical energy coiling and curling, magenta light swirling through it",
      "violet crystal shards tumbling and orbiting, trailing streaks of light",
      "streams of violet magic dust spiralling fast, ribbons of glowing power winding through the dark",
      "a dense field of violet runic glyphs and sigils turning and flaring everywhere at once, arcane symbols packed edge to edge",
      "a boiling sheet of violet arcane energy, magenta filaments coiling and snapping in every direction at once",
      "a tall vertical curtain of violet runes and glyphs streaming upward fast, bright symbols separated by deep black gaps",
      "vertical ribbons of violet magic racing upward, sharp bright filaments trailing long thin tails through black",
      "a dense storm of violet arcane energy, glowing runic sigils turning through coiling magenta light, streaks of power tearing past",
      "a towering surge of violet magic rushing upward, ribbons of glowing dust spiralling fast, crystal shards tumbling and trailing light",
      "rings of violet runes opening upward with dark light collapsing inward through them, glyph shards tumbling and trailing light",
      "one ring of violet runes flaring open and collapsing inward in a rush of dark light, then gone",
    ],
  },
  {
    id: "wind",
    color: 0x8ceee2,
    takes: [
      "pale teal gusts of wind spiralling, streaking air currents rushing past",
      "feathers and petals caught in a fast spiral of air",
      "translucent mint ribbons of air whirling and folding over each other",
      "a vortex of pale light and rushing air spinning fast",
      "a dense field of pale teal air currents and mist curling in every direction at once, streaks of rushing wind everywhere",
      "a churning sheet of translucent mint vapour seen from directly above, ribbons of air folding over each other everywhere at once",
      "a tall vertical curtain of pale teal air streaming upward fast, bright streaks of wind separated by deep black gaps",
      "vertical jets of mint vapour racing past, sharp bright wisps trailing long thin tails through black",
      "a towering vortex of pale teal wind rushing upward, translucent mint ribbons of air whirling and folding over each other, streaking currents",
      "a dense gale of pale glowing air and driven mist racing past, feathers and petals caught whipping through the current",
      "long thin blades of pale teal air spiralling upward and cutting past each other, driven mist streaming between them",
      "one vortex of pale teal air bursting upward into blades of wind, then dispersing into nothing",
      "a few enormous crescent blades of pale teal air, thick and smooth, sweeping upward far apart from each other, wide black gaps between",
      "one gust throwing a few enormous crescent blades of pale air upward far apart, then dispersing into nothing",
    ],
  },
];

const W = 384;
const H = 736;
const LENGTH = 25;
const STEPS = 30;
const CFG = 6.5;

function workflow({ id, positive, seed }) {
  return {
    1: {
      class_type: "UnetLoaderGGUF",
      inputs: { unet_name: "Wan2.2-TI2V-5B-Q5_K_M.gguf" },
    },
    2: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        type: "wan",
      },
    },
    3: {
      class_type: "VAELoader",
      inputs: { vae_name: "wan2.2_vae.safetensors" },
    },
    4: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: positive },
    },
    5: { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: NEG } },
    7: {
      class_type: "Wan22ImageToVideoLatent",
      inputs: {
        vae: ["3", 0],
        width: W,
        height: H,
        length: LENGTH,
        batch_size: 1,
      },
    },
    8: {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: 8.0 },
    },
    9: {
      class_type: "KSampler",
      inputs: {
        model: ["8", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["7", 0],
        seed,
        steps: STEPS,
        cfg: CFG,
        sampler_name: "uni_pc",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    10: {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["3", 0] },
    },
    11: {
      class_type: "SaveImage",
      inputs: { images: ["10", 0], filename_prefix: `aura/${id}/f` },
    },
  };
}

const seedOf = (s) =>
  [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1_000_000_007;

const shotFor = (i) =>
  i >= 10
    ? i % 2
      ? SHOT_BURST
      : SHOT_FLARE
    : i >= 8
      ? SHOT_DENSE
      : i >= 6
        ? SHOT_FLOW
        : i >= 4
          ? SHOT_EVEN
          : SHOT;

export function plan(only) {
  const jobs = [];
  for (const element of ELEMENTS) {
    element.takes.forEach((take, i) => {
      const id = `${element.id}-v${i + 1}`;
      if (only && only !== element.id && only !== id) return;
      jobs.push({
        id,
        seed: seedOf(`${element.id}${i + 1}`),
        positive: `${take}, ${shotFor(i)}`,
      });
    });
  }
  return jobs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

async function submit(graph) {
  const res = await fetch(`${HOST}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: "gen-card-auras" }),
  });
  const body = await res.json();
  if (!res.ok || !body.prompt_id) {
    throw new Error("submit failed: " + JSON.stringify(body).slice(0, 500));
  }
  return body.prompt_id;
}

const CONNECT_GRACE_MS = 300_000;
const JOB_TIMEOUT_MS = 900_000;

async function waitFor(graph, promptId) {
  const started = Date.now();
  let id = promptId;
  let downSince = 0;
  let restarted = false;

  for (;;) {
    if (Date.now() - started > JOB_TIMEOUT_MS) {
      throw new Error(`gave up after ${JOB_TIMEOUT_MS / 1000}s`);
    }
    await sleep(3000);

    let history;
    try {
      history = await (await fetch(`${HOST}/history/${id}`)).json();
    } catch {
      if (!downSince) {
        downSince = Date.now();
        console.log(`${stamp()}  server is down, waiting for it`);
      }
      if (Date.now() - downSince > CONNECT_GRACE_MS) {
        throw new Error("server never came back");
      }
      restarted = true;
      continue;
    }

    if (downSince) {
      console.log(`${stamp()}  server is back`);
      downSince = 0;
    }

    const entry = history[id];
    if (!entry) {
      if (restarted) {
        restarted = false;
        id = await submit(graph);
        console.log(`${stamp()}  re-queued as ${id}`);
      }
      continue;
    }
    const status = entry.status || {};
    if (status.completed) return;
    if (status.status_str === "error") {
      throw new Error(
        "run failed: " + JSON.stringify(status.messages).slice(0, 800),
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const want = args.filter((a) => !a.startsWith("--"));
  const jobs = want.length ? want.flatMap((w) => plan(w)) : plan("");
  const seen = new Set();
  const queue = jobs.filter((j) => !seen.has(j.id) && seen.add(j.id));

  mkdirSync(WORKFLOWS, { recursive: true });
  for (const job of queue) {
    writeFileSync(
      join(WORKFLOWS, `${job.id}.json`),
      JSON.stringify(workflow(job), null, 1),
    );
  }
  console.log(
    `${queue.length} workflow(s) -> ${WORKFLOWS.slice(ROOT.length + 1)}`,
  );

  if (!args.includes("--workflows")) {
    let n = 0;
    const failed = [];
    for (const job of queue) {
      const t0 = Date.now();
      const graph = workflow(job);
      try {
        await waitFor(graph, await submit(graph));
        console.log(
          `${stamp()}  [${++n}/${queue.length}] ${job.id}  ${((Date.now() - t0) / 1000).toFixed(0)}s`,
        );
      } catch (err) {
        failed.push(job.id);
        console.log(
          `${stamp()}  [${++n}/${queue.length}] ${job.id}  FAILED  ${err.message}`,
        );
      }
    }
    if (failed.length) {
      console.log(
        `
${failed.length} failed. retry:
  node tools/gen-card-auras.mjs ${failed.join(" ")}`,
      );
    }
    console.log("now: node tools/pack-card-auras.mjs");
  }
}
