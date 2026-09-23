import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
gen-boss-fx — KOLTMOS's own beats, generated on the local ComfyUI.

  node tools/gen-boss-fx.mjs --list
  node tools/gen-boss-fx.mjs --print erupt-v1
  node tools/gen-boss-fx.mjs erupt-v1 doom-v1 roar-v1
  node tools/gen-boss-fx.mjs --from masters/hint/fire-attack.png magma-i2v
  node tools/gen-boss-fx.mjs --decode
  node tools/gen-boss-fx.mjs --clip
  node tools/pack-spells.mjs --contact --start 0 --span 1.3 erupt-v1

Sampling writes a latent per take, decoding turns it into PNG frames and --clip
lays those frames into video/masters/fx so pack-spells.mjs can cut the sheet.
`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, "masters/fx/boss-workflows");
const CLIPS = join(ROOT, "video/masters/fx");

const HOST = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const W = Number(process.env.BOSS_W || 384);
const H = Number(process.env.BOSS_H || 384);
const LENGTH = Number(process.env.BOSS_LEN || 21);
const STEPS = Number(process.env.BOSS_STEPS || 24);
const CFG = Number(process.env.BOSS_CFG || 6.5);
const FPS = Number(process.env.BOSS_FPS || 16);

const LATENTS = "boss-lat";
const FRAMES = "bossfx";

const COMFY = resolve(
  process.env.COMFYUI_ROOT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI",
);

const START = (() => {
  const at = process.argv.indexOf("--from");
  if (at < 0 || !process.argv[at + 1]) return "";
  const src = resolve(ROOT, process.argv[at + 1]);
  const name = "bossfx-start-" + basename(src);
  copyFileSync(src, join(COMFY, "input", name));
  return name;
})();

const STYLE =
  "painted 3D mobile-RPG game VFX, semi-realistic, high contrast, " +
  "a white-hot core with violet and magenta light thrown off it, " +
  "torn gold-bright edges and crimson embers, " +
  "no flat cartoon shading, no anime line art";

const TECHNICAL =
  "the effect is isolated on a pure black background, nothing else in frame, " +
  "no floor, no ground, no room, no landscape, no character, no hands, " +
  "nothing lit except the effect itself, " +
  "the frame is completely black on the first frame and completely black again " +
  "on the last frame, " +
  "locked-off static camera, no camera movement, no zoom, no push in, no orbit, " +
  "no parallax, no cuts, " +
  "no text, no letters, no numbers, no watermark, no logo, no interface";

const BEAT =
  "exactly one hit in the whole clip, on one beat: it reaches its widest and " +
  "brightest early, holds for a moment, then burns down and dies away until the " +
  "frame is completely black again, " +
  "no gathering first, no second blast, no aftershock, no pulsing, no repeat";

const NEGATIVE =
  "orange fire, red fire, campfire, bonfire, " +
  "gathering first, charging up, winding up, second explosion, aftershock, " +
  "pulsing, looping, strobing, slow motion, " +
  "smoke, dust, haze, fog, mist, bright corners, glow at the edge of frame, " +
  "ground, floor, horizon, wall, room, landscape, sky, " +
  "person, face, character, creature, body, hands, weapon, prop, " +
  "magic circle, rune circle, runes, glyphs, symbols, " +
  "health bar, UI, interface, frame, border, card, window, " +
  "text, letters, numbers, watermark, logo, signature, " +
  "white background, grey background, gradient background, vignette, " +
  "camera movement, zoom, pan, dolly, shaking, " +
  "photorealistic, photographic, filmed footage, cinematic, " +
  "blurry, low contrast, washed out, dim, soft bloom, lens flare, " +
  "depth of field, bokeh, out of focus, static, still, frozen";

const PLAIN =
  "painted game explosion vfx, violet and magenta fire with a white hot core " +
  "and gold sparks, isolated on a pure black background, nothing else in frame, " +
  "static locked camera";

const PLAIN_NEGATIVE =
  "candle, pencil, stick, vase, torch, lamp, object, toy, " +
  "person, face, hands, creature, monster, " +
  "room, floor, ground, wall, sky, landscape, table, " +
  "text, letters, watermark, logo, ui, interface, " +
  "camera movement, zoom, pan, " +
  "grey background, white background, gradient background, " +
  "blurry, washed out, low contrast, dim, rainbow, green, cyan, teal";

const SHORT_TAKES = [
  {
    id: "erupt-v3",
    positive:
      "a row of tall violet flames bursts straight upward out of a glowing " +
      "magenta crack, white hot at the base, gold sparks flying up, " +
      "the flames rise, flare, and burn out to black",
  },
  {
    id: "doom-v3",
    positive:
      "a huge explosion of violet fire fills the middle of the frame, a white " +
      "hot core with a thin ring of white light racing outward, magenta flame " +
      "and gold sparks, it flares once and burns out to black",
  },
  {
    id: "rake-v3",
    positive:
      "three long claw slashes of violet light slash across the frame all at " +
      "once, white hot cores, magenta torn edges, gold sparks flying off them, " +
      "they flash bright and fade out to black",
  },
  {
    id: "roar-v3",
    positive:
      "a wide ring of violet shockwave light races outward from the middle of " +
      "the frame, a thin white rim with magenta fire trailing behind it, " +
      "it expands, thins, and disappears into black",
  },
  {
    id: "breath-v3",
    positive:
      "a stream of violet fire sprays toward the camera and opens into a wide " +
      "cone of flame, white hot throat, magenta tongues and gold sparks, " +
      "it roars once and burns out to black",
  },
];

const START_TAKES = [
  {
    id: "magma-i2v",
    positive:
      "the explosion in the frame keeps blowing outward and then burns down: " +
      "the molten shards and rock chunks fly apart and tumble away, the flame " +
      "spikes stretch, tear into separate islands and thin out, the white hot " +
      "core dims through gold to deep red, the last embers drift and wink out, " +
      "and the frame ends completely black, " +
      "pure black background, nothing else in frame, static locked camera",
  },
  {
    id: "magma-i2v-b",
    positive:
      "the burst opens wider for an instant, throwing its molten chunks and " +
      "torn flame outward, then loses its heat and collapses: the fire breaks " +
      "into drifting embers, the glowing rocks go dark, and the frame ends " +
      "completely black, " +
      "pure black background, nothing else in frame, static locked camera",
  },
];

const TAKES = [
  {
    id: "erupt-v1",
    positive:
      "a ridge of violet fire erupts straight upward all at once along one " +
      "jagged seam of magenta light that runs the full width of the frame, " +
      "the column in the middle the tallest and the ones to either side " +
      "shorter, so the whole row reads as one single ridge of fire and never " +
      "as separate flames taking turns, " +
      "white-hot where the columns leave the seam, crimson embers and gold " +
      "cinders riding up through them, " +
      "the ridge reaches its full height and its brightest early, holds, then " +
      "falls back and burns out from the top down until the frame is black",
  },
  {
    id: "erupt-v2",
    positive:
      "a low wide wall of violet and magenta fire blows upward together out of " +
      "one burning white-hot line across the lower middle of the frame, " +
      "torn tongues of flame leaning out to the left and to the right as they " +
      "rise and tearing into ragged islands of fire, " +
      "gold cinders and crimson sparks thrown up through the wall, the line " +
      "underneath burning magenta the whole time, " +
      "the wall reaches full height and full brightness early, holds, then " +
      "sinks back and burns out until the frame is completely black",
  },
  {
    id: "doom-v1",
    positive:
      "a single point of white light in the centre of the frame swells for an " +
      "instant and detonates into one enormous nova of violet and magenta fire " +
      "that floods the entire frame, " +
      "a hard thin ring of white-hot light racing outward ahead of it, torn " +
      "crimson flame and gold cinders dragging behind, the centre burning out " +
      "to near white at the peak, " +
      "then the whole thing collapses inward and burns down, the ring thinning " +
      "away past the edges, the last cinders going dark, until the frame is " +
      "completely black again",
  },
  {
    id: "doom-v2",
    positive:
      "one enormous detonation of violet fire fills the frame from a white-hot " +
      "heart, long torn spears of magenta light firing outward in every " +
      "direction ahead of the flame, a thin white shock ring blowing out " +
      "through them and past the edges of the frame, " +
      "crimson embers and gold cinders flung out behind the spears, " +
      "it blooms to its widest and brightest at once, holds for an instant, " +
      "then the spears retract, the fire tears apart and burns down, and the " +
      "frame goes completely black",
  },
  {
    id: "rake-v1",
    positive:
      "three parallel gashes of violet light tear diagonally across the frame " +
      "from the upper right down to the lower left, and all three open on the " +
      "very same frame together as one single strike, none of them lagging " +
      "behind another, " +
      "each gash is a tapered wound of white-hot light widest about a third of " +
      "the way along and coming to a fine point at both ends, its torn edges " +
      "ragged with small hooks and splinters, magenta fire burning along them " +
      "and crimson embers thrown off, " +
      "the middle gash is the longest and burns the hardest, the two beside it " +
      "shorter and parallel, " +
      "they flare to their brightest the instant they finish opening, hold, " +
      "then burn down and fade from the tips inward until the frame is black",
  },
  {
    id: "rake-v2",
    positive:
      "one hooked claw of violet fire rips across the frame in a single stroke, " +
      "three torn parallel streaks of white-hot light opening together at once, " +
      "curved and tapering, thickest in the middle of their length, their edges " +
      "shredded and throwing gold sparks and crimson embers outward, " +
      "a faint magenta heat glow left in the air behind all three, " +
      "the streaks flare at their widest and brightest early, hold an instant, " +
      "then burn down from both ends inward until the frame is completely black",
  },
  {
    id: "breath-v1",
    positive:
      "a jet of violet fire with a white-hot throat pours straight toward the " +
      "camera from the far side of the frame and opens out into one wide " +
      "roaring cone that fills the frame, " +
      "magenta embers and gold flecks streaming forward through it, the flame " +
      "torn and ragged along its edges, " +
      "it reaches its widest and brightest early, holds for a moment, then guts " +
      "out from the throat forward, the last embers riding away from the camera " +
      "until the frame is completely black",
  },
  {
    id: "breath-v2",
    positive:
      "a torrent of violet and magenta flame blasts from the far side of the " +
      "frame straight at the camera, a blinding white-hot core running down the " +
      "middle of it and torn crimson tongues peeling off its sides, " +
      "thick and liquid like poured molten light rather than a thin gas flame, " +
      "gold sparks and burning droplets flung forward off its edges, " +
      "it surges once at full force, holds, then loses pressure, thins and " +
      "breaks into drifting embers until the frame is completely black",
  },
  {
    id: "roar-v1",
    positive:
      "two rings of violet shockwave light blow outward from the centre of the " +
      "frame one after the other, each a thin torn hoop of white-hot light with " +
      "magenta fire smeared behind it, growing fast and thinning as it goes, " +
      "gold cinders shaken loose and blown outward with them, " +
      "the rings are brightest as they leave and are gone past the edges of the " +
      "frame, and the light at the centre sinks away to nothing until the frame " +
      "is completely black, " +
      "no fireball at the centre, no explosion at the centre, nothing left behind",
  },
];

const seedOf = (s) =>
  [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1_000_000_007;

export function plan(only) {
  const want = only && only.length ? only : null;
  const all = [
    ...TAKES.map((t) => ({ ...t, plain: false })),
    ...SHORT_TAKES.map((t) => ({ ...t, plain: true })),
    ...START_TAKES.map((t) => ({ ...t, plain: true })),
  ];
  return all
    .filter((t) => !want || want.includes(t.id))
    .map((t) => ({
      id: t.id,
      seed: seedOf(t.id),
      plain: t.plain,
      positive: t.plain
        ? `${t.positive}, ${PLAIN}`
        : `${t.positive}, ${STYLE}, ${TECHNICAL}, ${BEAT}`,
    }));
}

export function sampleGraph({ id, positive, seed, plain }) {
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
      inputs: { clip: ["2", 0], text: plain ? PLAIN_NEGATIVE : NEGATIVE },
    },
    ...(START
      ? { 11: { class_type: "LoadImage", inputs: { image: START } } }
      : {}),
    7: {
      class_type: "Wan22ImageToVideoLatent",
      inputs: {
        vae: ["3", 0],
        width: W,
        height: H,
        length: LENGTH,
        batch_size: 1,
        ...(START ? { start_image: ["11", 0] } : {}),
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
      inputs: { images: ["3", 0], filename_prefix: `${FRAMES}/${id}/f` },
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);
const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

async function submit(graph) {
  const res = await fetch(`${HOST}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: "gen-boss-fx" }),
  });
  const body = await res.json();
  if (!res.ok || !body.prompt_id) {
    throw new Error("submit failed: " + JSON.stringify(body).slice(0, 800));
  }
  return body.prompt_id;
}

const CONNECT_GRACE_MS = 300_000;
const JOB_TIMEOUT_MS = 1_800_000;

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
  if (!existsSync(from)) return [];
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

function clipOf(id) {
  const dir = join(COMFY, "output", FRAMES, id);
  if (!existsSync(dir)) {
    console.log(`${stamp()}  ${id}  no frames on disk, skipped`);
    return;
  }
  const pngs = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  if (!pngs.length) {
    console.log(`${stamp()}  ${id}  no frames on disk, skipped`);
    return;
  }

  mkdirSync(CLIPS, { recursive: true });
  const dest = join(CLIPS, `${id}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-framerate",
      String(FPS),
      "-start_number",
      pngs[0].replace(/\D+/g, "").replace(/^0+/, "") || "0",
      "-i",
      join(dir, "f_%05d_.png"),
      "-c:v",
      "libx264",
      "-crf",
      "12",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
      dest,
    ],
    { stdio: "inherit" },
  );
  console.log(
    `out  ${rel(dest)}  ${pngs.length} frames, ${(pngs.length / FPS).toFixed(2)}s`,
  );
  return pngs.length / FPS;
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
        `${stamp()}  [${++n}/${queue.length}] ${label} ${job.id}  ${(
          (Date.now() - t0) /
          1000
        ).toFixed(0)}s`,
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
  const named = args.filter((a) => !a.startsWith("--"));

  if (args.includes("--help")) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (args.includes("--list")) {
    for (const t of plan()) console.log(t.id);
    process.exit(0);
  }

  if (args.includes("--print")) {
    for (const job of plan(named)) {
      console.log(`--- ${job.id}  seed ${job.seed}\n${job.positive}\n`);
    }
    process.exit(0);
  }

  const queue = plan(named);
  if (!queue.length) {
    console.error(`nothing matches: ${named.join(", ")}`);
    process.exit(1);
  }

  if (args.includes("--clip")) {
    const spans = queue
      .map((job) => [job.id, clipOf(job.id)])
      .filter((s) => s[1]);
    if (spans.length) {
      const span = Math.max(...spans.map((s) => s[1]));
      console.log(
        `\nnow: node tools/pack-spells.mjs --contact --start 0 --span ${span.toFixed(
          2,
        )} ${spans.map((s) => s[0]).join(" ")}`,
      );
    }
  } else if (args.includes("--decode")) {
    const staged = stageLatents(queue.map((j) => j.id));
    console.log(`${staged.length} latent(s) staged for decode\n`);
    const failed = await run(staged, decodeGraph, "decode");
    if (failed.length) {
      console.log(
        `\n${failed.length} failed. retry:\n  node tools/gen-boss-fx.mjs --decode ${failed.join(" ")}`,
      );
    }
    console.log("\nthen:\n  node tools/gen-boss-fx.mjs --clip");
  } else {
    mkdirSync(WORKFLOWS, { recursive: true });
    for (const job of queue) {
      writeFileSync(
        join(WORKFLOWS, `${job.id}.json`),
        JSON.stringify(sampleGraph(job), null, 1),
      );
    }
    console.log(`${queue.length} workflow(s) -> ${rel(WORKFLOWS)}\n`);

    if (!args.includes("--workflows")) {
      const failed = await run(queue, sampleGraph, "sample");
      if (failed.length) {
        console.log(
          `\n${failed.length} failed. retry:\n  node tools/gen-boss-fx.mjs ${failed.join(" ")}`,
        );
      }
      console.log("\nthen:\n  node tools/gen-boss-fx.mjs --decode");
    }
  }
}
