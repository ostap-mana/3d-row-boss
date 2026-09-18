import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, "src/source/fx/clip-workflows");

const HOST = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const W = Number(process.env.FX_W || 384);
const H = Number(process.env.FX_H || 384);
const LENGTH = Number(process.env.FX_LEN || 21);
const STEPS = Number(process.env.FX_STEPS || 24);
const CFG = 6.5;

const LATENTS = "shock-lat";

const COMFY = resolve(
  process.env.COMFYUI_ROOT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI",
);

const STYLE =
  "painted 3D mobile-RPG game art, semi-realistic fantasy magic, " +
  "rich and ornate, high contrast against a dark ground, " +
  "no flat cartoon shading, no anime line art";

const COLOUR =
  "molten orange and ember red with a hot gold-white leading edge, " +
  "saturated luminous fire colour, translucent soft glow";

const SHOT_GROUND =
  "seen from above at a steep angle so the ring reads as a flat disc on the ground, " +
  "perfectly centred, " +
  "pure black background, nothing else in the shot, " +
  "nothing lit except the fire itself, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "one single beat: it expands once and clears once, no second ring, no repeat, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_CENTRE =
  "centred in the frame, filling the middle two thirds at its widest, " +
  "never touching the edges, " +
  "pure black background, nothing else in the shot, " +
  "nothing lit except the effect itself, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "one single beat: it bursts once and clears once, no second flash, no repeat, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_JET =
  "the jet enters at the very top edge of the frame and blasts straight down " +
  "to the bottom edge, filling the height of the frame, " +
  "narrow where it enters and flaring wider as it falls, centred left to right, " +
  "pure black background, nothing else in the shot, " +
  "nothing lit except the fire itself, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "one continuous stream, no cuts, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const SHOT_MASS =
  "the fire fills the whole frame edge to edge and is the only thing in it, " +
  "pure black behind it and between its tongues, " +
  "nothing lit except the fire itself, " +
  "no room, no stage, no scenery, no objects, no surface, nothing burning, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const NEGATIVE =
  "text, letters, numbers, watermark, logo, signature, " +
  "person, face, character, creature, monster, hands, animal, " +
  "plant, leaves, flowers, tree, grass, " +
  "scenery, landscape, horizon, room, floor tiles, table, sky, wall, mountain, " +
  "magic circle, rune circle, runes, glyphs, symbols, clock, target, crosshair, " +
  "thin outline, wireframe, vector circle, flat circle, hoop, tube, donut, " +
  "health bar, UI, interface, frame, border, card, window, " +
  "white background, grey background, gradient background, " +
  "camera movement, zoom, pan, dolly, shaking, " +
  "blurry, low contrast, washed out, dim, " +
  "static, still, frozen, motionless, " +
  "lens flare, bokeh, depth of field, out of focus, " +
  "multiple rings, concentric rings, repeating, looping, strobing";

const TAKES = [
  {
    id: "shock-v1",
    shot: "ground",
    positive:
      "a single ground shockwave blasts outward from a point of impact, " +
      "a torn ragged ring of fire and dust that starts as a tight bright knot " +
      "at the centre and rips outward across the ground, " +
      "its leading edge a hot gold-white rim of flame with molten orange " +
      "billowing behind it and dark embers and grit thrown up along the way, " +
      "the ring is thick, uneven and broken, never a clean geometric circle, " +
      "as it widens it thins and tears apart, the flame dies down to embers, " +
      "the embers wink out one by one and the frame is black again",
  },
  {
    id: "shock-v2",
    shot: "ground",
    positive:
      "an explosive blast wave races outward along the ground away from a " +
      "single impact point in the middle of the frame, " +
      "a churning wall of molten orange fire with a searing white-hot front " +
      "edge, chunks of glowing debris and sparks tumbling outward ahead of it, " +
      "the wave is ragged and asymmetric, thicker in some places than others, " +
      "it expands fast at first then slows, dims, breaks into drifting embers " +
      "and burnt-out smoke that fades, leaving the frame completely black",
  },
  {
    id: "shock-v3",
    shot: "ground",
    positive:
      "a hammer blow lands and a crown of fire erupts outward across the ground, " +
      "seen from above, " +
      "the impact flashes gold-white at the centre then throws torn tongues of " +
      "flame outward in every direction, molten orange licks curling up from " +
      "the expanding edge, sparks and glowing shards flung ahead of it, " +
      "the crown stretches thinner as it grows, breaks into separate tongues, " +
      "collapses into scattered embers and goes out, " +
      "the frame ending completely black",
  },
  {
    id: "hit-v1",
    shot: "centre",
    positive:
      "a single hard impact detonates in the centre of the frame, " +
      "a compact white-hot core flashing open and throwing a short ragged " +
      "crown of orange fire outward in every direction, " +
      "torn spikes of flame and bright sparks flung out on the first frames, " +
      "the crown is uneven, some tongues longer than others, never a smooth " +
      "circle, " +
      "it snaps outward fast, then the tongues thin, curl back and break into " +
      "sparks that wink out one by one, the core going last, " +
      "the frame ending completely black",
  },
  {
    id: "comet-v1",
    shot: "jet",
    positive:
      "a burning meteor falls straight down the frame trailing fire, " +
      "a dense white-hot head at the leading edge with a long ragged tail of " +
      "orange flame and black smoke streaming up behind it, " +
      "burning fragments peeling off the tail and falling away, " +
      "the trail is thick and turbulent near the head and thins as it goes up, " +
      "it falls at full speed the whole way, the tail guttering and breaking " +
      "into embers that fade, " +
      "the frame ending completely black",
  },
  {
    id: "shatter-v1",
    shot: "centre",
    positive:
      "a slab of black volcanic rock bursts apart in the centre of the frame, " +
      "splitting along glowing molten seams that flare white-hot an instant " +
      "before it goes, " +
      "jagged dark shards thrown outward in every direction with orange lava " +
      "light burning along their broken edges, " +
      "a short puff of dark grit and sparks behind them, " +
      "the shards tumble outward and fall away, the molten glow cools from " +
      "white through orange to nothing, " +
      "the frame ending completely black",
  },
  {
    id: "ultburst-v1",
    shot: "centre",
    positive:
      "a huge magical detonation blooms in the centre of the frame, " +
      "a blinding white core opening into a dense radial burst of energy with " +
      "long tapered spears of light firing outward in every direction, " +
      "layered petals of fire and arcane light behind the spears, glowing " +
      "shards and motes thrown out ahead of them, " +
      "it explodes to full width, holds for an instant at its brightest, then " +
      "the spears retract and dissolve, the petals thin and tear apart, the " +
      "motes drift out and fade, " +
      "the frame ending completely black",
  },
  {
    id: "breath-v1",
    shot: "jet",
    positive:
      "a monster breathes a torrent of lava straight down the frame, " +
      "a dense roaring stream of molten fire pouring from the top edge and " +
      "widening into a battering fan of flame at the bottom, " +
      "a searing gold-white core running down the middle with deep orange and " +
      "ember red tongues peeling off its sides, " +
      "thick and liquid, like poured molten rock rather than a thin gas flame, " +
      "sparks and glowing droplets flung off the edges as it falls, " +
      "the stream surges once at full force then thins, breaks into falling " +
      "embers and dies out, leaving the frame completely black",
  },
  {
    id: "breath-v2",
    shot: "jet",
    positive:
      "a heavy jet of fire blasts downward through the frame from top to bottom, " +
      "narrow and white-hot where it enters, flaring into a wide churning cone " +
      "of molten orange flame lower down, " +
      "the flame is made of twisting braided tongues that roll over each other " +
      "as they fall, with darker ember red at the outer edges, " +
      "burning droplets and sparks trailing off the flare, " +
      "it roars at full width, then loses pressure, narrows, gutters out into " +
      "drifting embers and the frame goes completely black",
  },
  {
    id: "breath-v3",
    shot: "jet",
    positive:
      "a continuous column of dragonfire falls down the middle of the frame, " +
      "entering tight at the top and spreading into a broad hammer of flame at " +
      "the bottom, " +
      "a blinding white-gold spine at its centre wrapped in rolling orange fire " +
      "and dark smoky ember red along its outer skin, " +
      "chunks of burning material and bright sparks torn away and thrown " +
      "sideways by the blast, " +
      "the column holds at full power, then weakens, splits into falling " +
      "streaks of fire, and fades to a completely black frame",
  },
  {
    id: "breath-v4",
    shot: "mass",
    positive:
      "a churning mass of molten fire, dense braided tongues of flame rolling " +
      "and folding over each other, " +
      "a searing white-gold heart at its thickest with deep orange and ember " +
      "red thinning away at its edges, " +
      "burning droplets and bright sparks torn off it and thrown clear, " +
      "it swells to full brightness, roars there, then thins, tears apart and " +
      "gutters out into drifting embers, leaving the frame completely black",
  },
  {
    id: "breath-v5",
    shot: "mass",
    positive:
      "a roaring body of dragonfire, thick liquid flame like poured molten rock, " +
      "rolling tongues curling over one another with a blinding gold-white core " +
      "burning through the middle and dark ember red smoke at the outer skin, " +
      "chunks of burning material and sparks flung off it, " +
      "it surges once at full force, holds, then loses pressure, breaks into " +
      "falling streaks of fire and fades to a completely black frame",
  },
];

export function sampleGraph({ id, positive, seed }) {
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
    5: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: NEGATIVE },
    },
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
      class_type: "SaveLatent",
      inputs: { samples: ["9", 0], filename_prefix: `${LATENTS}/${id}` },
    },
  };
}

export function decodeGraph({ id, latent }) {
  return {
    1: { class_type: "LoadLatent", inputs: { latent } },
    2: {
      class_type: "VAELoader",
      inputs: { vae_name: "wan2.2_vae.safetensors" },
    },
    3: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["1", 0],
        vae: ["2", 0],
        tile_size: 256,
        overlap: 64,
        temporal_size: 12,
        temporal_overlap: 4,
      },
    },
    4: {
      class_type: "SaveImage",
      inputs: { images: ["3", 0], filename_prefix: `fxclip/${id}/f` },
    },
  };
}

const seedOf = (s) =>
  [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1_000_000_007;

export function plan(only) {
  return TAKES.filter((t) => !only || t.id === only).map((t) => ({
    id: t.id,
    seed: seedOf(t.id),
    positive: `${t.positive}, ${STYLE}, ${COLOUR}, ${
      t.shot === "mass"
        ? SHOT_MASS
        : t.shot === "jet"
          ? SHOT_JET
          : t.shot === "centre"
            ? SHOT_CENTRE
            : SHOT_GROUND
    }`,
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

async function post(path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function waitFor(id) {
  for (let i = 0; i < 6000; i++) {
    await sleep(2000);
    let res;
    try {
      res = await fetch(`${HOST}/history/${id}`);
    } catch {
      throw new Error("server never came back");
    }
    if (!res.ok) continue;
    const hist = await res.json();
    const entry = hist[id];
    if (!entry) continue;
    const status = entry.status || {};
    if (status.status_str === "error") throw new Error("workflow error");
    if (status.completed) return entry;
  }
  throw new Error("timed out");
}

function stageLatents(ids) {
  const dir = join(COMFY, "output", LATENTS);
  const input = join(COMFY, "input", LATENTS);
  mkdirSync(input, { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith(".latent"));
  const out = [];
  for (const id of ids) {
    const hit = files
      .filter((f) => f.startsWith(id + "_"))
      .sort()
      .pop();
    if (!hit) continue;
    copyFileSync(join(dir, hit), join(input, hit));
    out.push({ id, latent: `${LATENTS}/${hit}` });
  }
  return out;
}

async function run(queue, graphOf, label) {
  const failed = [];
  let n = 0;
  for (const job of queue) {
    const began = Date.now();
    try {
      const { prompt_id } = await post("/prompt", { prompt: graphOf(job) });
      await waitFor(prompt_id);
      const secs = Math.round((Date.now() - began) / 1000);
      console.log(
        `${stamp()}  [${++n}/${queue.length}] ${label} ${job.id}  ${secs}s`,
      );
    } catch (err) {
      failed.push(job.id);
      console.log(
        `${stamp()}  [${++n}/${queue.length}] ${label} ${job.id}  FAILED  ${err.message}`,
      );
    }
  }
  return failed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const want = args.filter((a) => !a.startsWith("--"));
  const queue = want.length ? want.flatMap((w) => plan(w)) : plan("");

  if (args.includes("--decode")) {
    const staged = stageLatents(queue.map((j) => j.id));
    console.log(`${staged.length} latent(s) staged for decode\n`);
    const failed = await run(staged, decodeGraph, "decode");
    if (failed.length) {
      console.log(
        `\n${failed.length} failed. retry:\n  node tools/gen-fx-clips.mjs --decode ${failed.join(" ")}`,
      );
    }
  } else {
    mkdirSync(WORKFLOWS, { recursive: true });
    for (const job of queue) {
      writeFileSync(
        join(WORKFLOWS, `${job.id}.json`),
        JSON.stringify(sampleGraph(job), null, 1),
      );
    }
    console.log(
      `${queue.length} workflow(s) -> ${WORKFLOWS.slice(ROOT.length + 1)}`,
    );

    if (!args.includes("--workflows")) {
      const failed = await run(queue, sampleGraph, "sample");
      if (failed.length) {
        console.log(
          `\n${failed.length} failed. retry:\n  node tools/gen-fx-clips.mjs ${failed.join(" ")}`,
        );
      }
      console.log("\nthen:\n  node tools/gen-fx-clips.mjs --decode");
    }
  }
}
