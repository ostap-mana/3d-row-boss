import { Container, Sprite } from "pixi.js";
import { canvasTexture, glowTexture } from "./textures.js";
import { tween, Ease } from "../core/tween.js";
import frameUrl from "../assets/ui/boss-crest-frame.webp";
import plateUrl from "../assets/ui/boss-crest-plate.webp";
import faceUrl from "../assets/ui/boss-crest-face.webp";

const ASPECT = 268 / 430;

const FACE_ASPECT = 256 / 251;

const FACE_WIDE = 1.26;
const FACE_FOOT = 0.92;

const BORE = 0x1d1024;
const HALO = 0xb43cff;

let frameTex = null;
let plateTex = null;
let faceTex = null;

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

export async function loadBossCrest() {
  await Promise.all([
    decode(frameUrl)
      .then((t) => {
        frameTex = t;
      })
      .catch(() => {}),
    decode(plateUrl)
      .then((t) => {
        plateTex = t;
      })
      .catch(() => {}),
    decode(faceUrl)
      .then((t) => {
        faceTex = t;
      })
      .catch(() => {}),
  ]);
}

export function haveBossCrest() {
  return !!(frameTex || plateTex);
}

export class BossCrest extends Container {
  constructor() {
    super();

    this.plate = new Sprite(plateTex || glowTexture());
    this.plate.anchor.set(0.5);
    this.plate.tint = BORE;
    this.plate.visible = !!plateTex;
    this.addChild(this.plate);

    this.halo = new Sprite(glowTexture());
    this.halo.anchor.set(0.5);
    this.halo.blendMode = "add";
    this.halo.tint = HALO;
    this.halo.alpha = 0.6;
    this.addChild(this.halo);

    this.face = new Sprite(faceTex || glowTexture());
    this.face.anchor.set(0.5, 1);
    this.face.visible = !!faceTex;
    this.addChild(this.face);

    this.flash = new Sprite(faceTex || glowTexture());
    this.flash.anchor.set(0.5, 1);
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    this.flash.visible = !!faceTex;
    this.addChild(this.flash);

    this.frame = new Sprite(frameTex || glowTexture());
    this.frame.anchor.set(0.5);
    this.frame.visible = !!frameTex;
    this.addChild(this.frame);

    this.t = 0;
    this.h = 0;
  }

  resize(h) {
    this.h = h;
    const w = h * ASPECT;

    this.plate.setSize(w, h);
    this.frame.setSize(w, h);

    this.halo.setSize(w * 1.5, h * 0.95);

    const fw = w * FACE_WIDE;
    for (const s of [this.face, this.flash]) {
      s.setSize(fw, fw / FACE_ASPECT);
      s.y = -h / 2 + h * FACE_FOOT;
    }

    return w;
  }

  hit(power) {
    const p = power === undefined ? 1 : power;
    this.flash.alpha = Math.min(0.7, 0.42 * p);
    tween(this.flash, { alpha: 0 }, 0.34, { ease: Ease.quadOut });
    this.scale.set(1 + 0.06 * Math.min(1.5, p));
    tween(this.scale, { x: 1, y: 1 }, 0.4, { ease: Ease.elasticOut });
  }

  enrage() {
    this.plate.tint = 0x3a1020;
    this.halo.tint = 0xff2a6a;
  }

  update(dt) {
    this.t += dt;
    this.halo.alpha = 0.6 + Math.sin(this.t * 2.4) * 0.14;
  }
}
