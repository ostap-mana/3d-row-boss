/**
 * Generate the animated card auras on the ComfyUI running on this machine.
 *
 *   node tools/gen-card-auras.mjs                    # every take of every element
 *   node tools/gen-card-auras.mjs fire               # one element's takes
 *   node tools/gen-card-auras.mjs fire-v5 water-v5   # one round, named take by take
 *   node tools/gen-card-auras.mjs --workflows        # write the JSON, submit nothing
 *
 * Writes twenty-five PNG frames per variant into ComfyUI's own output folder,
 * under `aura/<element>-v<N>/`. `tools/pack-card-auras.mjs` is what turns those
 * into anything the game could use — this file's whole job is the clips.
 *
 * Six elements, several takes each, one clip at a time. About 75 seconds a clip
 * on an RTX 5060 laptop. One at a time on purpose:
 * the queue would take all twenty-four at once, but this is a 5B model, a
 * 6.7 GB text encoder and a 1.4 GB VAE taking turns through 8 GB of VRAM, and
 * the only thing overlapping them buys is a chance to be OOM-killed halfway.
 *
 * ## What these clips are
 *
 * **Textures, not auras.** Each one is a frame-filling sheet of one element
 * moving — fire churning, water rushing, lightning arcing — on black, with no
 * card, no border and no rectangle anywhere in the prompt. The card shape is
 * put on afterwards by the packer, which multiplies the clip through a mask cut
 * from the game's own aura still.
 *
 * That split is the fourth thing tried and the first that works. The three
 * before it are written down here because each fails in a way that looks like
 * it is nearly working, and because each one costs half an hour to rediscover:
 *
 *   **Text to video, "a glowing card border"** — a neon circuit board, filling
 *   the frame edge to edge. Ask for a ring of fire instead and it draws a ring
 *   of fire that runs off the side of the shot. Nothing lines up with a card,
 *   which is the one thing this asset cannot get wrong.
 *
 *   **Image to video off the game's own rim** — the rectangle cut out of
 *   src/source/cards/aura-sheet.png and tinted per element, handed to the model
 *   as frame one. Geometry perfect, motion nil: the clauses asking for a
 *   seamless loop and for identical first and last frames are asking for a
 *   still. Dropping them, naming the material twice ("the fire churns", not
 *   "the light churns") and pushing cfg to 6.5 finally got flame — hanging in a
 *   curtain across the top half of the card, because fire rises and a model
 *   that knows that will not put an equal amount of it along the bottom edge.
 *
 *   **A two-pass ignition** — run each element once, keep a lit frame, seed the
 *   takes from that so no clip opens cold — gave six dead clips. Handed a rim
 *   and told the light is already alight, the model has nothing left to resolve
 *   and dims it: from a cold seed Wan builds, from a hot one it decays.
 *
 * The mask makes all four of those somebody else's problem. The rectangle is
 * exact because it is the shipped asset, the four sides are even because the
 * mask is even, and the model is left doing the one thing it is good at, which
 * is a lot of moving fire.
 *
 * What the mask does *not* fix is where in the frame the fire is, and that is
 * what the second round of takes is about. A mask is even; a texture is not, and
 * a border cut out of a texture that is bright along the bottom is a border
 * bright along the bottom. See `SHOT_EVEN` for the shot that argues the
 * composition out of the clip, and `shotFor` for which takes are on it.
 *
 * ## Model and settings
 *
 * Wan 2.2 TI2V-5B at Q5_K_M, through ComfyUI-GGUF, with umt5-xxl and the 2.2
 * VAE. The weights are not in this repo and are not small: see
 * `src/source/prompts.md` for where they live and what `extra_model_paths.yaml`
 * has to say to find them.
 *
 * 384x736 because that is what the packer's mask is, and that is the rim box of
 * aura-sheet.png plus pack-card-aura.mjs's own 64px pad. The model's native
 * shot is 704x1280 and neither the card nor an 8 GB laptop wants it — this
 * renders about 200 points wide in the game. 25 frames because the VAE
 * compresses time by four and wants 4n+1.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, "src/source/cards/aura-workflows");

/** Where ComfyUI is listening. Override for a ComfyUI on another port. */
const HOST = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

/* --------------------------------------------------------------- the prompt */

/**
 * What every texture clip has to be, whatever it is made of.
 *
 * The camera clauses are the animation technical block out of
 * src/source/prompts.md. The background is black rather than the white that
 * block asks for, because the packer multiplies: anything that is not the
 * effect has to be zero going in. No loop clauses — they cost motion and buy
 * nothing, because the loop is made afterwards by ping-ponging frames.
 */
const SHOT =
  "filling the entire frame edge to edge, seen close up, " +
  "pure black background behind it, nothing else in the shot, " +
  "high contrast, bright white-hot core with a coloured bloom, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

/**
 * The same shot with the composition argued out of it, used by takes 5 and up.
 *
 * The first four takes of every element came back lit on one side — fire along
 * the bottom, water in a band across the middle, lightning in streaks down the
 * right — and the mask cannot fix that. A static rectangle multiplied by a
 * texture whose energy sits in one region gives a border lit in one region;
 * what comes out reads as a smudge on one edge rather than as a border on fire.
 *
 * The cause is that the model composes. Asked for a wall of flame it paints a
 * wall of flame, which means a hot base, a cooler top and a subject somewhere —
 * a picture, and a picture has somewhere to look. A border has nowhere to look:
 * all four sides are equally on screen, so every square inch of the clip has to
 * carry the same amount of effect.
 *
 * Two clauses do most of that work. **Looking straight down** takes gravity out
 * of the shot — coals seen from above have no up for the flame to rise toward,
 * so the model stops putting the hot half at the bottom. **No focal point**,
 * spelled out several ways, is what stops it composing a subject at all.
 *
 * The motion clauses are here for the other half of the baseline's problem.
 * Twelve of these twenty-five frames are played at 7 fps, which stretches one
 * second of source over nearly two — so a clip that merely drifts arrives as a
 * still with a shimmer. It has to be violent at the source to read as alive on
 * a card.
 */
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

/**
 * The shot for the ribbon packer, used by takes 7 and up, and it asks for the
 * opposite of `SHOT_EVEN`.
 *
 * `SHOT_EVEN` spends its whole length fighting the model's instinct to compose,
 * because the packer it was written for reads the clip at the pixel it is
 * painting: position in the frame *is* position on the card, so a hot bottom is
 * a hot bottom edge. `tools/pack-card-auras.mjs --ribbon` breaks that link. It
 * unrolls the band around the card into a strip and reads the clip along it, so
 * where a thing is in the frame no longer says where it is on the card — the
 * geometry guarantees the four sides are equal, and no prompt has to.
 *
 * Which frees the prompt to ask for what the model is *good* at, and to ask for
 * the two things the ribbon actually eats:
 *
 *   **Vertical flow.** The strip is the clip stood on end, so the clip's up is
 *   the direction of travel around the card. A curtain of flame streaming
 *   upward is not a bias to be argued away any more, it is the asset: it
 *   arrives as flame running round the border.
 *
 *   **Contrast.** The ribbon takes native pixels rather than an average, and it
 *   lifts them less than the other styles do. Whatever separation there is
 *   between a bright strand and the black beside it is what reaches the card,
 *   so the prompt asks for deep black gaps in as many words as it can.
 */
const SHOT_FLOW =
  "extreme close-up, filling the entire frame edge to edge, " +
  "strong vertical flow, streaming fast along the frame, " +
  "high contrast, sharp bright white-hot strands with deep black gaps " +
  "between them, no haze, no smoke, no wash, " +
  "pure black background behind it, nothing else in the shot, " +
  "no subject, no horizon, no scenery, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

/**
 * The shot the ribbon actually wants, used by takes 9 and up.
 *
 * `SHOT_FLOW` was the first attempt at a ribbon shot and it is a lesson in
 * asking for too much. Reasoning that the ribbon lifts native pixels and so
 * eats contrast, it asked for "sharp bright strands with deep black gaps
 * between them, no haze, no smoke, no wash" — and got exactly that: clips that
 * are mostly nothing. Fire came back as a smooth vertical gradient and water as
 * a pale sheet, a third the file size of the takes before them, and on the card
 * both read as a glossy plastic tube with a highlight sliding along it. Clean,
 * even, and not on fire.
 *
 * What the ribbon wants turned out to be what the *first* four takes of every
 * element already were: dense, hazy, detailed material, shot as a picture. Their
 * one-sided lighting was never a property of the material, it was a property of
 * the packer that read them, and the ribbon does not read them that way. So the
 * best lightning on the card is `lightning-v1`, generated before any of this
 * and judged unusable at the time.
 *
 * This block is therefore the original shot plus the two things the ribbon can
 * genuinely use, and nothing subtracted:
 *
 *   **Density**, asked for directly, because the strip is a slice a few dozen
 *   columns wide and a sparse clip has nothing in it to slice.
 *
 *   **Vertical flow**, because the strip is the clip stood on end and the
 *   clip's up is travel around the card.
 *
 * Nothing here forbids haze or smoke. Haze is what a flame looks like.
 */
const SHOT_DENSE =
  "extreme close-up, filling the entire frame edge to edge, " +
  "dense and highly detailed, packed with fine detail everywhere, " +
  "strong vertical flow streaming along the frame, " +
  "fast violent motion, churning and flickering, " +
  "high contrast, bright white-hot cores against deep black, " +
  "pure black background behind it, nothing else in the shot, " +
  "locked-off static camera, no camera movement, no zoom, no pan, no parallax, " +
  "no text, no letters, no numbers, no watermark, no logo";

/**
 * The creative's own art direction, off `src/source/prompts.md`'s style block.
 *
 * Trimmed to the clauses a bare effect can use: the surface and inlay clauses
 * describe props, and there is no prop in these clips. What is left is the
 * register — painted, semi-realistic, high contrast on a dark ground — which is
 * what stops a flame arriving as flat cartoon shading beside a hero bust that
 * was rendered against this same paragraph.
 */
const STYLE_BLOCK =
  "painted 3D mobile-RPG game art, semi-realistic, rich and ornate, " +
  "high contrast against a dark ground, no flat cartoon shading";

/**
 * The shot for `pack-card-auras.mjs --flare`, used by takes 11 and up, and the
 * first block here written against a *known* mapping rather than a guess at one.
 *
 * Flare lays the clip upright on the band around the card: the bottom edge of
 * the frame is the card's own border line and the top edge is as far out as the
 * effect ever reaches. So the clip is not a texture any more, it is an
 * elevation — what the effect looks like standing off an edge, seen side on.
 * Every clause below falls out of that:
 *
 *   **Rooted along the bottom, reaching up into black.** Bright at the bottom
 *   is bright at the border; empty at the top is an effect that fades out
 *   rather than stopping at the edge of the file.
 *
 *   **Clearly separated strands.** One lap round the card is 384 pixels of clip
 *   stretched over 1740 of rim, four and a half times, so whatever separation
 *   the clip has arrives four and a half times wider. Strands a couple of dozen
 *   pixels apart land as about a dozen distinct licks round the card; a solid
 *   sheet lands as a solid collar, which is what `fire-v9` did.
 *
 * Nothing here forbids haze — see `SHOT_DENSE` for what that costs.
 */
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

/**
 * The same elevation with an arc through it, for the sheet the game plays once
 * on the tap that spends an ultimate. Takes 12, 14, and so on — see `shotFor`.
 *
 * A loop and a burst are the same asset packed twice and they are not the same
 * clip. `art/ultborder.js` ping-pongs a loop for as long as a card is charged,
 * so what that needs is motion which never resolves; it plays a burst straight
 * through and clamps, so what that needs is a beginning, a peak and an end. Ask
 * a loop clip to be a burst and the tap flares to whatever frame twelve happens
 * to be and stops there.
 *
 * Which is why the clip is told how to spend its length, in those words. Wan
 * gives about a second, `pack-card-auras.mjs` keeps twelve frames evenly across
 * it, and the runtime clamps on the last one — so the last frame has to be
 * *over*, or the border is left lit after the burst has played.
 */
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

/**
 * `frame`, `border`, `rectangle`, `ring` and `card` are in here on purpose.
 *
 * This prompt wants a texture and nothing else. Any rectangle the model draws
 * of its own accord is a second border that will not line up with the mask, and
 * two rectangles on one card is the one failure that reads as a bug rather than
 * as a style.
 */
const NEG =
  "text, letters, numbers, watermark, logo, signature, " +
  "person, face, character, creature, hands, animal, " +
  "scenery, landscape, horizon, room, floor, table, sky, candle, torch, " +
  "frame, border, rectangle, circle, ring, card, window, " +
  "white background, grey background, gradient background, " +
  "camera movement, zoom, pan, dolly, shaking, " +
  "blurry, low contrast, washed out, dim, static, still, frozen, motionless, " +
  "empty, sparse, mostly black, " +
  // Against the one-sided lighting the first four takes all came back with.
  // See SHOT_EVEN: a border has no dark side to spare, so anything that names
  // a bright half or a dark half is worth spending negative tokens on.
  "vignette, dark corners, black corners, one bright side, one dark side, " +
  "gradient falloff, spotlight, focal point, subject, centred composition, " +
  "depth of field, bokeh, out of focus";

/**
 * The six, in config.js's order, each with the GEM_COLORS entry the packer
 * paints it in and the four takes that are its variants.
 *
 * The colour is here rather than imported because this file has to run with no
 * bundler and config.js is an ES module full of game state; the packer holds
 * the same six and the two are checked against each other by eye, which is what
 * `--workflows` is for.
 */
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

/* ------------------------------------------------------------- the workflow */

const W = 384;
const H = 736;
const LENGTH = 25;
const STEPS = 30;
/** 6.5 rather than the usual 5: below about 6 the model ignores "churns". */
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
    // The TI2V latent node with no start_image is this model's text-to-video.
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

/** Seeded off the name, so re-running one clip reproduces it exactly. */
const seedOf = (s) =>
  [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1_000_000_007;

/**
 * Which shot block a take is shot on, by its position in the array.
 *
 * A take keeps the block it was judged on forever: 1-4 the original composed
 * shot, 5-6 `SHOT_EVEN`, 7-8 `SHOT_FLOW`, 9-10 `SHOT_DENSE`, and 11 up
 * alternating — `SHOT_FLARE` on the odd take, `SHOT_BURST` on the even one, so
 * an element's loop and the burst that goes with it are v11 and v12, and a
 * round of both is one command.
 * Split by index
 * rather than by a flag on each take because a block belongs to a *round* of
 * judging rather than to a material — and because a re-run has to reproduce the
 * clips a shipped pick was made out of, which it cannot do if an old take
 * silently moves onto a new block.
 *
 * Which packer a round was aimed at is the thing to keep straight here. 1-6 are
 * for the frame-filling composite, where the prompt has to carry the even
 * lighting; 7 up are for `--ribbon`, where the geometry carries it. A take is
 * not better or worse than another round's, it is cut for a different tool —
 * with the one exception that 7-8 are cut for nothing, and `SHOT_DENSE` says
 * why.
 */
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

/**
 * @param {string} only an element (`fire`, all its takes) or one take
 *   (`fire-v5`). Empty for everything.
 */
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

/* ---------------------------------------------------------------- the queue */

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

/**
 * Poll rather than listen on the websocket.
 *
 * comfy-cli's own stream carries no per-step events for this verb, so there is
 * nothing to watch that three seconds of latency loses, and /history is the one
 * endpoint that answers the same way whether the job is queued, running, or was
 * finished before this loop started.
 */
/**
 * How long a dead server is waited out before the clip is given up on, and how
 * long any one clip may take.
 *
 * The server does die. ComfyUI-GGUF's `ops.py` takes an access violation inside
 * `partially_unload` — the VAE asking for room at the end of a run is what
 * triggers it — and an access violation is not an exception, it is the process
 * gone. Launching with `--disable-smart-memory` keeps ComfyUI off that path by
 * unloading models whole instead of partially, which is why this batch is run
 * that way; this grace is the second line, for the crash nobody predicted.
 *
 * Twelve clips is a quarter of an hour of GPU, and the old behaviour was to
 * throw on the first failed `fetch` and lose the eleven that had not run yet.
 */
const CONNECT_GRACE_MS = 300_000;
const JOB_TIMEOUT_MS = 900_000;

/**
 * Poll rather than listen on the websocket, and outlive a server restart.
 *
 * ComfyUI's history does not survive its process, so a restart is not just a
 * gap in the polling: the prompt id stops existing and no amount of further
 * polling will ever resolve it. That is what `resubmit` is for — once the
 * server answers again, a job it has never heard of is submitted afresh rather
 * than waited on forever.
 *
 * @param {object} graph the workflow, kept so the clip can be re-queued.
 */
async function waitFor(graph, promptId) {
  const started = Date.now();
  let id = promptId;
  let downSince = 0;
  /** Set once the server has been seen to restart under this job. */
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
      // Connection refused: the server is down or coming back up. Neither is
      // this clip's fault, so wait it out rather than taking the batch down.
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
      // Unknown to a server that *is* answering, after it went away: the run
      // died with the process and its history went with it. Queue it again.
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

/* Guarded, because pack-card-auras.mjs imports ELEMENTS from here and an
   unguarded body would have importing this file queue twenty-four clips. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  // Several selectors, because a round of judging is one take across all six
  // elements rather than one element's every take, and queueing that as six
  // separate runs reloads 8 GB of weights six times over.
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
      // Per clip, because one clip that cannot be made is not a reason to skip
      // the ones after it. What failed is printed again at the end, as a
      // command line that retries exactly those.
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
