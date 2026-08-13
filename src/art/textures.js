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
