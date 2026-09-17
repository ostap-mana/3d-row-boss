import { Texture, CanvasSource } from "pixi.js";

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

let shockTex = null;
export function shockTexture() {
  if (shockTex) return shockTex;
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const mid = size / 2;

  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.7, "rgba(255,255,255,0)");
  g.addColorStop(0.8, "rgba(255,255,255,0.22)");
  g.addColorStop(0.89, "rgba(255,255,255,1)");
  g.addColorStop(0.95, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "destination-out";
  const steps = 168;
  const span = (Math.PI * 2) / steps;
  for (let i = 0; i < steps; i++) {
    const a = i * span;
    const n =
      Math.sin(a * 3 + 0.7) * 0.5 +
      Math.sin(a * 7 + 1.9) * 0.3 +
      Math.sin(a * 15 + 3.4) * 0.2;
    const bite = Math.max(0, n) * 0.6;
    if (bite <= 0.01) continue;
    ctx.beginPath();
    ctx.moveTo(mid, mid);
    ctx.arc(mid, mid, mid, a, a + span * 1.4);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0," + bite.toFixed(3) + ")";
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  shockTex = canvasTexture(c);
  return shockTex;
}

let sparkTex = null;
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

const rampCache = {};
export function rampTexture(key, stops) {
  if (rampCache[key]) return rampCache[key];
  const w = 256;
  const c = makeCanvas(w, 4);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, 0);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 4);
  rampCache[key] = canvasTexture(c);
  return rampCache[key];
}
