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

let tideTex = null;
export function tideBodyTexture() {
  if (tideTex) return tideTex;
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");

  let seed = 1734;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const lump = (x, y, rx, ry, alpha) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(40,18,46,${alpha})`);
    g.addColorStop(0.62, `rgba(40,18,46,${alpha})`);
    g.addColorStop(1, "rgba(40,18,46,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * w + (rand() - 0.5) * 30;
    const y = h * (0.26 + rand() * 0.22);
    lump(x, y, 34 + rand() * 40, 26 + rand() * 30, 0.82 + rand() * 0.18);
  }
  for (let i = 0; i < 40; i++) {
    lump(
      rand() * w,
      h * (0.42 + rand() * 0.3),
      40 + rand() * 50,
      30 + rand() * 34,
      1,
    );
  }
  ctx.fillStyle = "rgba(40,18,46,1)";
  ctx.fillRect(0, h * 0.66, w, h * 0.34);

  ctx.globalCompositeOperation = "source-atop";
  const heat = ctx.createLinearGradient(0, 0, 0, h);
  heat.addColorStop(0, "rgba(30,12,36,1)");
  heat.addColorStop(0.42, "rgba(44,16,34,1)");
  heat.addColorStop(0.66, "rgba(96,26,22,1)");
  heat.addColorStop(0.84, "rgba(190,58,16,1)");
  heat.addColorStop(0.95, "rgba(250,124,34,1)");
  heat.addColorStop(1, "rgba(255,196,96,1)");
  ctx.fillStyle = heat;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 120; i++) {
    const y = h * (0.2 + rand() * 0.62);
    const rx = 8 + rand() * 30;
    ctx.fillStyle = `rgba(12,5,16,${0.2 + rand() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(
      rand() * w,
      y,
      rx,
      rx * (0.35 + rand() * 0.4),
      rand() * 3,
      0,
      7,
    );
    ctx.fill();
  }

  ctx.lineCap = "round";
  for (let i = 0; i < 84; i++) {
    let x = rand() * w;
    let y = h * (0.3 + rand() * 0.52);
    const len = 40 + rand() * 130;
    const hot = rand() < 0.35;
    ctx.strokeStyle = hot
      ? `rgba(255,214,130,${0.7 + rand() * 0.3})`
      : `rgba(255,112,36,${0.55 + rand() * 0.45})`;
    ctx.lineWidth = hot ? 1.4 + rand() * 1.6 : 2.2 + rand() * 3.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 28;
      y += len / 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "destination-in";
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.06, "rgba(0,0,0,1)");
  side.addColorStop(0.94, "rgba(0,0,0,1)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);

  tideTex = canvasTexture(c);
  return tideTex;
}
