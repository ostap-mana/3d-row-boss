import { Container, Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { loadAlphaClip } from "./alphavideo.js";
import victoryStillUrl from "../assets/outcome/victory-figure.webp";
import defeatStillUrl from "../assets/outcome/defeat-figure.webp";
import victoryClipUrl from "../assets/outcome/victory-figure.mp4";
import defeatClipUrl from "../assets/outcome/defeat-figure.mp4";

const ART = {
  victory: { still: victoryStillUrl, clip: victoryClipUrl },
  defeat: { still: defeatStillUrl, clip: defeatClipUrl },
};

const SIDES = ["victory", "defeat"];

export const FIGURE_ASPECT = 1;

export const FIGURE_CARRIES_STARS = true;

const stills = { victory: null, defeat: null };
const clips = { victory: null, defeat: null };
let loaded = false;

async function decode(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

export async function loadOutcomeFigures() {
  if (loaded) return stills;
  loaded = true;
  for (const key of SIDES) {
    try {
      stills[key] = await decode(ART[key].still);
    } catch {
      stills[key] = null;
    }
    try {
      clips[key] = await loadAlphaClip(ART[key].clip);
    } catch {
      clips[key] = null;
    }
  }
  return stills;
}

const side = (defeat) => (defeat ? "defeat" : "victory");

function figureTexture(defeat) {
  return stills[side(defeat)];
}

export function rewindFigures() {
  for (const key of SIDES) {
    const clip = clips[key];
    if (clip) clip.rewind();
  }
}

const ROLL_GRACE = 600;

export class FigureView extends Container {
  constructor() {
    super();
    this.eventMode = "none";
    this.still = new Sprite();
    this.still.anchor.set(0.5, 1);
    this.still.eventMode = "none";
    this.still.visible = false;
    this.addChild(this.still);
    this.clip = null;
    this.span = 0;
    this.grounded = { victory: false, defeat: false };
    this.watch = 0;
  }

  adopt() {
    for (const key of SIDES) {
      const clip = clips[key];
      if (!clip || clip.parent === this) continue;
      clip.visible = false;
      this.addChild(clip);
    }
  }

  pick(defeat) {
    this.adopt();
    return clips[side(defeat)] || null;
  }

  has(defeat) {
    return !!this.pick(defeat) || !!figureTexture(defeat);
  }

  fit(defeat, span) {
    this.span = span;
    const clip = this.grounded[side(defeat)] ? null : this.pick(defeat);
    const texture = clip ? null : figureTexture(defeat);

    if (this.clip && this.clip !== clip) {
      this.clip.stop();
      this.clip.visible = false;
      this.clip = null;
    }

    this.still.visible = !clip && !!texture;
    if (texture) {
      if (this.still.texture !== texture) this.still.texture = texture;
      if (span > 0) this.still.setSize(span * FIGURE_ASPECT, span);
    }

    if (clip) {
      this.clip = clip;
      clip.visible = true;
      if (span > 0) clip.fit(span);
    }

    return !!clip || !!texture;
  }

  start(defeat) {
    const clip = this.clip;
    if (!clip) return;
    clip.play();

    const video = clip.video;
    const from = video.currentTime;
    clearTimeout(this.watch);
    this.watch = setTimeout(() => {
      if (this.clip !== clip) return;
      if (!video.paused && video.currentTime > from + 0.02) return;
      this.ground(defeat);
    }, ROLL_GRACE);
  }

  ground(defeat) {
    if (!figureTexture(defeat)) return;
    this.grounded[side(defeat)] = true;
    if (this.clip) {
      this.clip.stop();
      this.clip.visible = false;
      this.clip = null;
    }
    this.fit(defeat, this.span);
  }

  reset() {
    clearTimeout(this.watch);
    this.watch = 0;
    if (this.clip) this.clip.rewind();
  }
}
