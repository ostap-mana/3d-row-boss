import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { loadAlphaClip } from "./alphavideo.js";
import victoryUrl from "../assets/outcome/victory-figure.webp";
import defeatUrl from "../assets/outcome/defeat-figure.webp";
import victoryClipUrl from "../assets/outcome/victory-figure.mp4";

const SHEETS = {
  victory: {
    url: victoryUrl,
    cols: 7,
    cellW: 300,
    cellH: 300,
    pad: 2,
    count: 28,
    fps: 7.5,
  },
  defeat: {
    url: defeatUrl,
    cols: 6,
    cellW: 300,
    cellH: 300,
    pad: 2,
    count: 24,
    fps: 7.4,
  },
};

const CLIPS = { victory: victoryClipUrl };

export const FIGURE_ASPECT = SHEETS.victory.cellW / SHEETS.victory.cellH;

export const FIGURE_CARRIES_STARS = true;

const frames = { victory: null, defeat: null };
const clips = { victory: null, defeat: null };
let loaded = false;
let clock = -1;

async function cut(sheet) {
  const img = new Image();
  img.src = sheet.url;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const source = canvasTexture(c).source;

  const out = [];
  for (let i = 0; i < sheet.count; i++) {
    out.push(
      new Texture({
        source,
        frame: new Rectangle(
          sheet.pad + (i % sheet.cols) * (sheet.cellW + sheet.pad),
          sheet.pad + Math.floor(i / sheet.cols) * (sheet.cellH + sheet.pad),
          sheet.cellW,
          sheet.cellH,
        ),
      }),
    );
  }
  return out;
}

export async function loadOutcomeFigures() {
  if (loaded) return frames;
  loaded = true;
  for (const key of ["victory", "defeat"]) {
    try {
      frames[key] = await cut(SHEETS[key]);
    } catch {
      frames[key] = null;
    }
    if (!CLIPS[key]) continue;
    try {
      clips[key] = await loadAlphaClip(CLIPS[key]);
    } catch {
      clips[key] = null;
    }
  }
  return frames;
}

export function figureTexture(defeat) {
  const key = defeat ? "defeat" : "victory";
  const set = frames[key];
  if (!set) return null;
  if (clock < 0) return set[0];
  const i = Math.floor(clock * SHEETS[key].fps);
  return set[i < set.length ? i : set.length - 1];
}

export function stepFigure(dt) {
  if (clock >= 0) clock += dt;
}

export function startFigure() {
  clock = 0;
}

export function stopFigure() {
  clock = -1;
}

export class FigureView extends Container {
  constructor() {
    super();
    this.eventMode = "none";
    this.sheet = new Sprite();
    this.sheet.anchor.set(0.5, 1);
    this.sheet.eventMode = "none";
    this.sheet.visible = false;
    this.addChild(this.sheet);
    this.clip = null;
    this.span = 0;
  }

  adopt() {
    for (const key of ["victory", "defeat"]) {
      const clip = clips[key];
      if (!clip || clip.parent) continue;
      clip.visible = false;
      this.addChild(clip);
    }
  }

  pick(defeat) {
    this.adopt();
    return clips[defeat ? "defeat" : "victory"] || null;
  }

  has(defeat) {
    return !!this.pick(defeat) || !!figureTexture(defeat);
  }

  fit(defeat, span) {
    this.span = span;
    const clip = this.pick(defeat);
    const texture = clip ? null : figureTexture(defeat);

    if (this.clip && this.clip !== clip) {
      this.clip.stop();
      this.clip.visible = false;
      this.clip = null;
    }

    this.sheet.visible = !clip && !!texture;
    if (texture) {
      if (this.sheet.texture !== texture) this.sheet.texture = texture;
      if (span > 0) this.sheet.setSize(span * FIGURE_ASPECT, span);
    }

    if (clip) {
      this.clip = clip;
      clip.visible = true;
      if (span > 0) clip.fit(span);
    }

    return !!clip || !!texture;
  }

  start(defeat) {
    startFigure();
    const clip = this.pick(defeat);
    if (clip) clip.play();
  }

  step(dt, defeat) {
    if (this.clip) return;
    stepFigure(dt);
    const frame = figureTexture(defeat);
    if (frame && this.sheet.texture !== frame) this.sheet.texture = frame;
  }

  reset() {
    stopFigure();
    if (this.clip) this.clip.rewind();
  }
}
