/**
 * Procedural textures.
 *
 * Nothing here ships as bytes: every texture is painted into a canvas at boot,
 * which keeps the bundle free of base64 blobs and stays crisp at any DPI.
 */

import { Texture, CanvasSource } from "pixi.js";

/**
 * Wrap a canvas as a texture. Exported because the painted gems re-pad their
 * bitmaps through a canvas before baking, and they want the same sampling.
 */
export function canvasTexture(canvas) {
  return new Texture({
    source: new CanvasSource({ resource: canvas, scaleMode: "linear" }),
  });
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

let glowTex = null;
/** White radial glow, meant to be tinted and drawn with the `add` blend. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.55, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTex = canvasTexture(c);
  return glowTex;
}

let sparkTex = null;
/** Tight little spark used by every particle burst. */
export function sparkTexture() {
  if (sparkTex) return sparkTex;
  const size = 64;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sparkTex = canvasTexture(c);
  return sparkTex;
}

let beamTex = null;
/** Horizontal beam core: opaque middle, feathered top and bottom. */
export function beamTexture() {
  if (beamTex) return beamTex;
  const w = 8;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(0.65, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  beamTex = canvasTexture(c);
  return beamTex;
}

let sheenTex = null;
/**
 * Horizontal specular band: nothing, a bright core, nothing.
 *
 * What travels along the boss's health bar and the doom strip under it — see
 * ui/hud.js. Drawn on its side, unlike beamTexture, because a gauge is swept
 * along its length and the ramp has to run the same way.
 *
 * Two shoulders rather than one ramp each side. A single linear falloff reads as
 * a wide grey smear at the alpha a highlight can afford; the shoulders keep the
 * core tight and let the tails go almost to nothing, which is what makes it look
 * like light on a surface instead of a pale rectangle sliding about.
 */
export function sheenTexture() {
  if (sheenTex) return sheenTex;
  const w = 128;
  const h = 8;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.4, "rgba(255,255,255,0.22)");
  g.addColorStop(0.5, "rgba(255,255,255,0.9)");
  g.addColorStop(0.6, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  sheenTex = canvasTexture(c);
  return sheenTex;
}

const fieldCache = {};
/**
 * A rectangle of one colour whose every edge feathers out to nothing.
 *
 * What the board stands on now that it has no frame — see art/boardframe.js. The
 * gems need something dark behind them, because half the arena is a bright sky
 * and a pale wind gem on it is a pale gem on a pale cloud. What they must not
 * have is an edge, because an edge is a frame, and the frame is what was taken
 * away.
 *
 * So the field is drawn with no edge at all: opaque through the middle, and out
 * of the last `edge` of each side it falls to zero. Stretched behind the grid
 * with the feather hanging past it, the darkness under the gems is flat and the
 * boundary is nowhere — the arena simply gets deeper where the board is.
 *
 * Built by multiplying two feathers rather than drawing a shape. `destination-in`
 * keeps what is already on the canvas in proportion to the alpha of what is
 * painted over it, so a horizontal ramp and then a vertical one leave every
 * pixel holding the product of the two — which is the corner falloff for free,
 * and no per-pixel loop to write.
 *
 * @param {string} key cache key
 * @param {string} color css colour, alpha included
 * @param {number} edge feathered fraction of each side, 0..0.5
 */
export function softFieldTexture(key, color, edge) {
  if (fieldCache[key]) return fieldCache[key];
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  const feather = (x1, y1) => {
    const g = ctx.createLinearGradient(0, 0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(edge, "rgba(0,0,0,1)");
    g.addColorStop(1 - edge, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    return g;
  };

  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = feather(size, 0);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = feather(0, size);
  ctx.fillRect(0, 0, size, size);

  fieldCache[key] = canvasTexture(c);
  return fieldCache[key];
}

const gradientCache = {};
/**
 * Vertical multi-stop gradient, stretched to fill whatever it is put behind.
 * @param {Array<[number, string]>} stops offset + css colour
 */
export function gradientTexture(key, stops) {
  if (gradientCache[key]) return gradientCache[key];
  const h = 256;
  const c = makeCanvas(4, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, h);
  gradientCache[key] = canvasTexture(c);
  return gradientCache[key];
}
