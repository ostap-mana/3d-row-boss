import { Container, Sprite } from "pixi.js";
import { softFieldTexture } from "./textures.js";

export const FRAME_ART = { w: 1000, h: 1000 };

const INSET = 0;

export const FRAME_OPENING = {
  x: INSET,
  y: INSET,
  w: FRAME_ART.w - INSET * 2,
  h: FRAME_ART.h - INSET * 2,
};

const FIELD = "rgba(9,6,17,0.92)";
const BLEED = 0.1;

export async function loadBoardFrame() {
  return null;
}

export function boardFrameSprite() {
  const c = new Container();
  c.field = new Sprite(
    softFieldTexture("board-field", FIELD, BLEED / (1 + BLEED * 2)),
  );
  c.addChild(c.field);
  return c;
}

export function fitBoardFrame(c, x, y, w, h) {
  const bx = w * BLEED;
  const by = h * BLEED;

  c.x = x;
  c.y = y;

  c.field.x = -bx;
  c.field.y = -by;
  c.field.setSize(w + bx * 2, h + by * 2);
}
