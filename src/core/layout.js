import { FRAME_ART, FRAME_OPENING } from "../art/boardframe.js";
import { LOGO_ART, PLAY_ART } from "../art/brand.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const BOSS_ART = { w: 560, h: 460 };

const GRID_RATIO =
  1 / Math.max(FRAME_ART.w / FRAME_OPENING.w, FRAME_ART.h / FRAME_OPENING.h);

const CARD = {
  aspect: 0.48,
  gap: 0.011,
  foot: 0.1,
  tall: { portrait: 0.165, landscape: 0.34 },
};

function cardBand(x, avail, count, maxH) {
  const inner = avail;
  const gap = inner * CARD.gap;
  let cardW = (inner - gap * (count - 1)) / count;
  let cardH = cardW / CARD.aspect;

  if (cardH > maxH) {
    cardH = maxH;
    cardW = cardH * CARD.aspect;
  }

  const w = cardW * count + gap * (count - 1);
  return { x: x + (avail - w) / 2, w, h: cardH, gap };
}

function gutter(w, ui) {
  return clamp(w * 0.042, 12, 28 * (ui || 1));
}

const BANNER_W = 124;
const BANNER_LOGO_W = 0.84;
const BANNER_LOGO_W_WIDE = 0.9;
const BANNER_GAP = 0.2;
const BANNER_BREATH = 1.045;

function bannerBox(ui, stacked) {
  const KNEE = 1.2;
  const scale = ui <= KNEE ? ui : KNEE + (ui - KNEE) * 0.55;
  const plateW = Math.max(100, BANNER_W * scale);
  const plateH = (plateW * PLAY_ART.h) / PLAY_ART.w;
  const logoW = plateW * (stacked ? BANNER_LOGO_W : BANNER_LOGO_W_WIDE);
  const logoH = (logoW * LOGO_ART.h) / LOGO_ART.w;
  const gap = plateH * BANNER_GAP;
  const content = stacked
    ? { w: plateW, h: logoH + gap + plateH }
    : { w: logoW + gap + plateW, h: Math.max(logoH, plateH) };
  return {
    w: content.w,
    h: content.h * BANNER_BREATH,
    stacked,
    plateW,
    plateH,
    logoW,
    logoH,
    gap,
  };
}

const STAGE = {
  short: 375,
  maxScale: 3.2,
  portrait: { min: 0.42, max: 0.58 },
  landscape: { min: 1.05, max: 2.4 },
};

const BOARD_BLEED = 0.1;

const COLUMN_SHARE = 1.05;

const CLOSE_KEEPOUT = 52;

function stageBox(w, h, portrait) {
  const range = portrait ? STAGE.portrait : STAGE.landscape;
  const view = w / h;
  const aspect = clamp(view, range.min, range.max);

  let sw = view > aspect ? h * aspect : w;
  let sh = view < aspect ? w / aspect : h;

  const cap = STAGE.short * STAGE.maxScale;
  const over = Math.min(sw, sh) / cap;
  if (over > 1) {
    sw /= over;
    sh /= over;
  }

  return {
    x: (w - sw) / 2,
    y: (h - sh) / 2,
    w: sw,
    h: sh,
    cx: w / 2,
    cy: h / 2,
    right: (w + sw) / 2,
    bottom: (h + sh) / 2,
  };
}

function safeStage(stage, safe) {
  const w = Math.max(stage.w * 0.5, stage.w - safe.left - safe.right);
  const h = Math.max(stage.h * 0.5, stage.h - safe.top - safe.bottom);
  const x = stage.x + safe.left;
  const y = stage.y + safe.top;
  return {
    x,
    y,
    w,
    h,
    cx: x + w / 2,
    cy: y + h / 2,
    right: x + w,
    bottom: y + h,
  };
}

function place(solved, stage, w, h) {
  const { x: dx, y: dy } = stage;
  const move = (r) => ({ ...r, x: r.x + dx, y: r.y + dy });

  return {
    ...solved,
    w,
    h,
    stage,
    safeBox: safeStage(stage, solved.safe),
    board: move(solved.board),
    banner: move(solved.banner),
    cards: move(solved.cards),
    hud: move(solved.hud),
    boss: { ...move(solved.boss), floor: solved.boss.floor + dy },
  };
}

export function computeLayout(w, h, safe, opts) {
  const device = safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const owned = !!(opts && opts.owned);
  const portrait = h >= w;
  const stage = stageBox(w, h, portrait);

  const inset = {
    top: Math.max(0, device.top - stage.y),
    right: Math.max(0, device.right - (w - stage.right)),
    bottom: Math.max(0, device.bottom - (h - stage.bottom)),
    left: Math.max(0, device.left - stage.x),
  };

  const keepout = owned ? 0 : Math.max(0, CLOSE_KEEPOUT - stage.y);

  const ui = clamp(
    Math.min(stage.w, stage.h) / STAGE.short,
    0.72,
    STAGE.maxScale,
  );

  const solved = portrait
    ? portraitLayout(stage.w, stage.h, ui, inset, keepout)
    : landscapeLayout(stage.w, stage.h, ui, inset, keepout);

  return place(solved, stage, w, h);
}

const BOSS_OVERLAP = 0.07;

const BOSS_DEEP = 0.34;

const BOSS_MIN = 0.12;

const BOSS_TALL = 0.2;

const BOSS_LIFT = 3;

function portraitLayout(w, h, ui, safe, keepout) {
  const pad = 10 * ui;
  const gut = gutter(w, ui);

  const barH = clamp(h * 0.018, 12, 26 * ui);
  const nameH = 16 * ui;
  const hudY = safe.top + pad * 0.9 + nameH;
  const doomH = Math.max(3, barH * 0.32);
  const chromeBottom = hudY + barH + 3 * ui + doomH;

  const chromeW = w - safe.left - safe.right - gut * 2;
  const band = cardBand(safe.left + gut, chromeW, 6, h * CARD.tall.portrait);
  const row = { y: h - safe.bottom - band.h * (1 + CARD.foot) };

  const plate = bannerBox(ui, false);
  const bannerY = chromeBottom + 3 * ui + plate.h / 2;
  const bandBottom = bannerY + plate.h / 2 + pad * 0.6;

  const bossTop = bandBottom;
  const room =
    (row.y - pad * 0.8 - bossTop - h * BOSS_MIN) / (1 - BOSS_OVERLAP);
  const fieldW = w - safe.left - safe.right;
  const size = Math.min(fieldW, room);
  const cell = (size * GRID_RATIO) / 5;
  const boardY = row.y - pad * 0.8 - size;
  const boardX = safe.left + (fieldW - size) / 2;

  const sink = clamp(
    (bossTop + h * BOSS_TALL - boardY) / size,
    BOSS_OVERLAP,
    BOSS_DEEP,
  );
  const bossFloor = boardY + size * sink;
  const bossH = bossFloor - bossTop;
  const bossScale = Math.min((fieldW * 0.92) / BOSS_ART.w, bossH / BOSS_ART.h);

  return {
    w,
    h,
    ui,
    portrait: true,
    safe,
    board: { x: boardX, y: boardY, size, cell },
    banner: {
      ...plate,
      x: safe.left + gut + chromeW / 2,
      y: bannerY,
    },
    boss: {
      x: safe.left + fieldW / 2,
      y: bossTop + bossH * 0.52 - BOSS_LIFT * ui,
      scale: bossScale,
      floor: bossFloor,
    },
    cards: { ...band, y: row.y },
    hud: {
      x: safe.left + gut,
      y: hudY,
      w: chromeW,
      h: barH,
    },
  };
}

function landscapeLayout(w, h, ui, safe, keepout) {
  const pad = 9 * ui;
  const gut = gutter(h, ui);

  const barH = clamp(h * 0.032, 10, 22 * ui);
  const nameH = 15 * ui;
  const hudY = safe.top + pad * 0.8 + nameH;
  const chromeBottom = hudY + barH + 3 * ui + Math.max(3, barH * 0.32);

  const plate = bannerBox(ui, false);
  const bannerY = Math.max(chromeBottom + 3 * ui, keepout) + plate.h / 2;
  const bandBottom = bannerY + plate.h / 2 + pad * 0.6;

  const leftEdge = safe.left + gut;
  const inner = w - safe.right - gut - leftEdge;
  const room = h - safe.bottom - bandBottom - pad * 1.4;
  const size = Math.min(room / (1 + BOARD_BLEED), inner * 0.47);
  const cell = (size * GRID_RATIO) / 5;

  const split = pad * 2;
  const leftW = Math.min(inner - size - split, size * COLUMN_SHARE);
  const bandX = leftEdge + (inner - (leftW + split + size)) / 2;
  const boardX = bandX + leftW + split;
  const boardY = bandBottom + (h - safe.bottom - bandBottom - size) / 2;
  const rightEdge = boardX + size;

  const band = cardBand(bandX, leftW, 6, h * CARD.tall.landscape);
  const row = { y: h - safe.bottom - band.h * (1 + CARD.foot) };

  const bossTop = chromeBottom;
  const bossH = row.y - bossTop - pad;
  const bossScale = Math.min((leftW * 0.98) / BOSS_ART.w, bossH / BOSS_ART.h);

  return {
    w,
    h,
    ui,
    portrait: false,
    safe,
    board: { x: boardX, y: boardY, size, cell },
    boss: {
      x: bandX + leftW / 2,
      y: bossTop + bossH * 0.55 - BOSS_LIFT * ui,
      scale: bossScale,
      floor: bossTop + bossH,
    },
    cards: { ...band, y: row.y },
    banner: {
      ...plate,
      x: rightEdge - plate.w / 2,
      y: bannerY,
    },
    hud: {
      x: bandX,
      y: hudY,
      w: leftW,
      h: barH,
    },
  };
}
