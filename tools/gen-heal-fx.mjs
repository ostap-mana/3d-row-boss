import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, "src/source/fx/heal-workflows");

const HOST = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const W = 512;
const H = 512;
const LENGTH = 33;
const STEPS = 30;
const CFG = 6.5;

const LATENTS = "heal-lat";

const COMFY = resolve(
  process.env.COMFYUI_ROOT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI",
);

const STYLE =
  "painted 3D mobile-RPG game art, semi-realistic fantasy magic, " +
  "rich and ornate, high contrast against a dark ground, " +
  "no flat cartoon shading, no anime line art";

const COLOUR =
  "golden-green emerald healing energy with a warm gold-white core, " +
  "saturated luminous green, translucent soft glow";

const SHOT =
  "centred in the frame, filling the middle two thirds at its widest, " +
  "never touching the edges, " +
  "pure black background, nothing else in the shot, " +
  "nothing lit except the healing energy itself, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "one single beat: it gathers once, peaks once and clears once, " +
  "no second pulse, no repeat, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

const NEGATIVE =
  "text, letters, numbers, watermark, logo, signature, " +
  "person, face, character, creature, monster, hands, animal, " +
  "plant, leaves, flowers, tree, grass, vines, " +
  "water, liquid, splash, fire, flame, lava, molten, embers, smoke, " +
  "red, orange, blue, purple, pink, " +
  "scenery, landscape, horizon, room, floor, ground, table, sky, wall, " +
  "magic circle, rune circle, runes, glyphs, symbols, heart, cross, plus sign, " +
  "health bar, UI, interface, frame, border, card, window, " +
  "white background, grey background, gradient background, " +
  "camera movement, zoom, pan, dolly, shaking, " +
  "blurry, low contrast, washed out, dim, " +
  "static, still, frozen, motionless, " +
  "depth of field, bokeh, out of focus, " +
  "multiple bursts, repeating, looping, strobing";

const TAKES = [
  {
    id: "heal-v1",
    positive:
      "a single small concentrated core of light forms in the centre, " +
      "soft golden-green energy gathers into it out of the dark and opens " +
      "into a luminous circular aura, " +
      "thin translucent ribbons of magic spiral upward around the centre " +
      "carrying small glowing particles and fine sparks, " +
      "the ribbons tighten inward as they rise and converge on the core, " +
      "the core flares to a warm gold-white maximum and pushes one soft clean " +
      "pulse outward through the aura, " +
      "then the aura expands gently outward and thins, the ribbons unwind and " +
      "dissolve from the outside in, the particles drift upward and fade, " +
      "the core goes last and the frame is black again",
  },
  {
    id: "heal-v2",
    positive:
      "several wide translucent emerald ribbons of magic spiral upward around " +
      "a bright gold-white core in the centre, poured bands of light rather " +
      "than drawn lines, turning in one controlled direction, never tangling, " +
      "the ribbons rise and tighten inward onto the core while glowing motes " +
      "and fine sparks ride up with them, " +
      "the core swells to its brightest and one clean soft pulse runs outward " +
      "through them, " +
      "then the ribbons unwind, thin out and dissolve from the outside in, " +
      "the motes rise out of frame and fade, and the frame is black again",
  },
  {
    id: "heal-v3",
    positive:
      "a small point of warm gold-white light blooms in the centre into a " +
      "wide luminous emerald aura, brightest at the middle and translucent at " +
      "the edge, " +
      "fine golden-green sparks and glowing motes stream upward around it, " +
      "the aura brightens smoothly to a strong clean burst with a gold-white " +
      "heart, one soft ring of light opening outward through it, " +
      "then it keeps expanding gently, thinning as it goes, the motes rise " +
      "upward and fade one by one, and the frame empties to black",
  },
  {
    id: "mend-v1",
    positive:
      "loose golden-green motes and fine sparks drift in from the edges of " +
      "the frame toward the centre, gathering and speeding up as they come, " +
      "they draw themselves into thin translucent emerald ribbons that spiral " +
      "inward and downward, wrapping tighter around a point in the middle " +
      "until a warm gold-white core lights inside them, " +
      "the core takes one single deep pulse, swelling and settling rather than " +
      "bursting, the light never throwing outward past the ribbons, " +
      "then everything collapses into it, the ribbons are pulled in and " +
      "swallowed, the last motes chase them down, the core dims out from the " +
      "edge to the middle and the frame is black again, " +
      "the whole effect moves inward and downward from start to finish",
  },
  {
    id: "mend-v2",
    positive:
      "streams of golden-green light are pulled in from every edge of the " +
      "frame toward a single point in the centre, converging fast, " +
      "they wind into a tightening emerald spiral that closes on itself, " +
      "a warm gold-white core igniting at the middle as the spiral shuts, " +
      "the core swells once, deep and heavy, without bursting outward, " +
      "then the spiral is sucked into it and the core dims from its edge " +
      "inward until the frame is completely black",
  },
  {
    id: "mend-v3",
    positive:
      "scattered emerald motes hang in the dark and then fall inward toward " +
      "the centre of the frame, accelerating as they go, " +
      "thin threads of golden-green light stretch behind them and braid into " +
      "a descending spiral, " +
      "a warm gold-white core lights where they meet and pulses once, slow " +
      "and contained, the glow staying tight around it, " +
      "then the threads are drawn in and swallowed, the last motes drop into " +
      "the core, and the light shrinks to a point and goes out",
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
      inputs: { images: ["3", 0], filename_prefix: `heal/${id}/f` },
    },
  };
}

const seedOf = (s) =>
  [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1_000_000_007;

export function plan(only) {
  return TAKES.filter((t) => !only || t.id === only).map((t) => ({
    id: t.id,
    seed: seedOf(t.id),
    positive: `${t.positive}, ${STYLE}, ${COLOUR}, ${SHOT}`,
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);

async function submit(graph) {
  const res = await fetch(`${HOST}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: "gen-heal-fx" }),
  });
  const body = await res.json();
  if (!res.ok || !body.prompt_id) {
    throw new Error("submit failed: " + JSON.stringify(body).slice(0, 800));
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

function stageLatents(ids) {
  const from = join(COMFY, "output", LATENTS);
  const to = join(COMFY, "input");
  mkdirSync(to, { recursive: true });

  const staged = [];
  for (const id of ids) {
    const hit = readdirSync(from)
      .filter((f) => f.startsWith(`${id}_`) && f.endsWith(".latent"))
      .sort()
      .pop();
    if (!hit) {
      console.log(`${stamp()}  ${id}  no latent on disk, skipped`);
      continue;
    }
    const name = `${id}.latent`;
    copyFileSync(join(from, hit), join(to, name));
    staged.push({ id, latent: name });
  }
  return staged;
}

async function run(queue, build, label) {
  let n = 0;
  const failed = [];
  for (const job of queue) {
    const t0 = Date.now();
    const graph = build(job);
    try {
      await waitFor(graph, await submit(graph));
      console.log(
        `${stamp()}  [${++n}/${queue.length}] ${label} ${job.id}  ${((Date.now() - t0) / 1000).toFixed(0)}s`,
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
        `\n${failed.length} failed. retry:\n  node tools/gen-heal-fx.mjs --decode ${failed.join(" ")}`,
      );
    }
    console.log("now: node tools/pack-heal-fx.mjs");
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
          `\n${failed.length} failed. retry:\n  node tools/gen-heal-fx.mjs ${failed.join(" ")}`,
        );
      }
      console.log(
        "\nrestart ComfyUI so no GGUF weights are resident, then:\n  node tools/gen-heal-fx.mjs --decode",
      );
    }
  }
}
