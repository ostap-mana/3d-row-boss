import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { DIFFICULTY, DOOM, FONT, T } from "../config.js";
import { KNOBS, TOGGLES } from "./knobs.js";

const ROOTS = { DIFFICULTY, DOOM, T };

const SHEET = 0x0b0812;
const GOLD = 0xf5c65a;
const INK = 0xe8e0d2;
const DIM = 0x8b8274;
const CHIP = 0x241c33;
const CHIP_HOT = 0x6b3030;
const CHIP_LIVE = 0x1b4a1a;
const CHIP_OFF = 0x14111c;

const TABS = ["ГРА", "СТАНИ", "MODS", "READ"];

const MENU = 0;
const STATES_TAB = 1;
const MODS_TAB = 2;
const READ_TAB = 3;

const MENU_GROUPS = ["game", "attack", "spell", "outcome"];

const TONES = {
  "game.victory": CHIP_LIVE,
  "game.defeat": CHIP_HOT,
  "game.restart": CHIP_HOT,
};

const REFRESH = 0.25;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function readPath(path) {
  const parts = path.split(".");
  let at = ROOTS[parts[0]];
  for (let i = 1; i < parts.length && at !== undefined; i++) at = at[parts[i]];
  return at;
}

function writePath(path, value) {
  const parts = path.split(".");
  let at = ROOTS[parts[0]];
  for (let i = 1; i < parts.length - 1 && at !== undefined; i++) {
    at = at[parts[i]];
  }
  if (at === undefined) return false;
  at[parts[parts.length - 1]] = value;
  return true;
}

function expand(path) {
  if (!path.includes("*")) return readPath(path) === undefined ? [] : [path];
  const out = [];
  for (let i = 0; i < 64; i++) {
    const one = path.replace("*", String(i));
    if (readPath(one) === undefined) break;
    out.push(one);
  }
  return out;
}

function baseline() {
  const base = new Map();
  for (const knob of KNOBS) {
    for (const pattern of knob.paths) {
      for (const path of expand(pattern)) {
        const v = readPath(path);
        if (typeof v === "number") base.set(path, v);
      }
    }
  }
  return base;
}

function label(text, size, fill) {
  return new Text({
    text,
    style: {
      fontFamily: FONT,
      fontSize: size,
      fontWeight: "700",
      fill: fill === undefined ? INK : fill,
      letterSpacing: 0.4,
    },
  });
}

class Chip extends Container {
  constructor(text, size, onTap) {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);
    this.text = label(text, size);
    this.text.anchor.set(0.5);
    this.addChild(this.text);
    this.w = 0;
    this.h = 0;
    this.tone = CHIP;
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", (e) => {
      e.stopPropagation();
      onTap();
    });
  }

  paint(w, h, tone) {
    if (this.w === w && this.h === h && this.tone === tone) return;
    this.w = w;
    this.h = h;
    this.tone = tone;
    this.bg.clear();
    this.bg.roundRect(0, 0, w, h, Math.min(6, h * 0.3));
    this.bg.fill({ color: tone, alpha: 0.96 });
    this.bg.roundRect(0, 0, w, h, Math.min(6, h * 0.3));
    this.bg.stroke({ width: 1, color: GOLD, alpha: 0.28 });
    this.text.position.set(w / 2, h / 2);
    if (this.text.width > w - 6) {
      this.text.scale.set(Math.max(0.55, (w - 6) / this.text.width));
    } else this.text.scale.set(1);
    this.hitArea = new Rectangle(0, 0, w, h);
  }
}

class Slider extends Container {
  constructor(knob, onMove) {
    super();
    this.knob = knob;
    this.value = 1;
    this.name0 = label(knob.label, 11);
    this.value0 = label("×1.00", 11, GOLD);
    this.hint = label("", 10, DIM);
    this.track = new Graphics();
    this.addChild(this.track, this.name0, this.value0, this.hint);
    this.w = 0;
    this.eventMode = "static";
    this.cursor = "pointer";

    const grab = (e) => {
      e.stopPropagation();
      const local = this.toLocal(e.global);
      const t = clamp(local.x / Math.max(1, this.w), 0, 1);
      this.value = knob.min + t * (knob.max - knob.min);
      onMove(this);
    };
    this.on("pointerdown", (e) => {
      this.dragging = true;
      grab(e);
    });
    this.on("globalpointermove", (e) => {
      if (this.dragging) grab(e);
    });
    this.on("pointerup", () => {
      this.dragging = false;
    });
    this.on("pointerupoutside", () => {
      this.dragging = false;
    });
  }

  paint(w, ui) {
    this.w = w;
    const line = 13 * ui;
    this.name0.style.fontSize = 11 * ui;
    this.value0.style.fontSize = 11 * ui;
    this.hint.style.fontSize = 10 * ui;
    this.name0.position.set(0, 0);
    this.value0.position.set(w - this.value0.width, 0);
    this.hint.position.set(0, line);
    const y = line * 2 + 4 * ui;
    const h = 5 * ui;
    const t =
      (this.value - this.knob.min) /
      Math.max(0.0001, this.knob.max - this.knob.min);
    this.track.clear();
    this.track.roundRect(0, y, w, h, h / 2);
    this.track.fill({ color: 0xffffff, alpha: 0.12 });
    this.track.roundRect(0, y, Math.max(h, w * t), h, h / 2);
    this.track.fill({ color: GOLD, alpha: 0.85 });
    this.track.circle(clamp(w * t, h, w - h), y + h / 2, h * 1.5);
    this.track.fill({ color: GOLD });
    this.box = y + h + 6 * ui;
    this.hitArea = new Rectangle(-6 * ui, 0, w + 12 * ui, this.box);
    return this.box;
  }

  say(text, value) {
    this.hint.text = text;
    this.value0.text = `×${value.toFixed(2)}`;
    this.value0.position.set(this.w - this.value0.width, 0);
  }
}

export class DevPanel extends Container {
  constructor(scene) {
    super();
    this.scene = scene;
    this.base = baseline();
    this.tab = 0;
    this.shut = false;
    this.scroll = 0;
    this.span = 0;
    this.since = 0;
    this.signature = "";

    this.eventMode = "static";
    this.sheet = new Graphics();
    this.addChild(this.sheet);
    this.on("pointerdown", (e) => e.stopPropagation());

    this.title = label("SIEGE", 11, GOLD);
    this.addChild(this.title);

    this.handle = new Chip("≡", 12, () => this.flip());
    this.addChild(this.handle);

    this.tabs = TABS.map((name, i) => new Chip(name, 10, () => this.pick(i)));
    for (const tab of this.tabs) this.addChild(tab);

    this.clip = new Container();
    this.clipMask = new Graphics();
    this.clip.mask = this.clipMask;
    this.addChild(this.clip, this.clipMask);

    this.reel = new Container();
    this.clip.addChild(this.reel);

    this.clip.eventMode = "static";
    this.clip.on("pointerdown", (e) => {
      this.drag = e.global.y;
      this.from = this.scroll;
    });
    this.clip.on("globalpointermove", (e) => {
      if (this.drag === undefined) return;
      this.scroll = this.from + (e.global.y - this.drag);
      this.apply();
    });
    const drop = () => {
      this.drag = undefined;
    };
    this.clip.on("pointerup", drop);
    this.clip.on("pointerupoutside", drop);

    this.stateChips = new Map();
    this.heads = [];
    this.sliders = [];
    this.toggles = [];
    this.readText = label("", 10, 0x9fd5b0);
    this.readText.style.wordWrap = true;
    this.reel.addChild(this.readText);

    this.control = [
      new Chip("HALT", 10, () => this.states().halt()),
      new Chip("RESUME", 10, () => this.states().resume()),
      new Chip("FREEZE", 10, () => this.states().freeze()),
      new Chip("THAW", 10, () => this.states().thaw()),
      new Chip("STEP", 10, () => this.states().step(1)),
      new Chip("STEP10", 10, () => this.states().step(10)),
    ];
    for (const chip of this.control) this.addChild(chip);

    this.rate = new Slider(
      { label: "Темп світу", hint: "", min: 0.05, max: 2 },
      (s) => {
        this.states().rate(s.value);
        s.say(`×${s.value.toFixed(2)} від реального часу`, s.value);
        this.layoutSelf();
      },
    );
    this.addChild(this.rate);

    this.buildMods();
  }

  states() {
    return this.scene.states;
  }

  flip() {
    this.shut = !this.shut;
    this.handle.text.text = this.shut ? "≡" : "×";
    this.layoutSelf();
  }

  show(on) {
    const want = on === undefined ? this.shut : !!on;
    if (this.shut !== !want) this.flip();
    return want;
  }

  pick(i) {
    this.tab = i;
    this.scroll = 0;
    this.layoutSelf();
  }

  buildMods() {
    for (const knob of KNOBS) {
      if (knob.paths.some((p) => p.startsWith("WORLD_RATE"))) continue;
      const slider = new Slider(knob, (s) => this.applyKnob(s));
      slider.say(this.reading(knob), 1);
      this.sliders.push(slider);
      this.reel.addChild(slider);
    }

    for (const flag of TOGGLES) {
      const chip = new Chip(this.flagText(flag), 10, () => {
        writePath(flag.path, !readPath(flag.path));
        chip.text.text = this.flagText(flag);
        chip.tone = null;
      });
      chip.flag = flag;
      this.toggles.push(chip);
      this.reel.addChild(chip);
    }

    this.reset = new Chip("СКИНУТИ MODS", 10, () => {
      for (const [path, from] of this.base) writePath(path, from);
      for (const slider of this.sliders) {
        slider.value = 1;
        slider.say(this.reading(slider.knob), 1);
      }
      this.layoutSelf();
    });
    this.reel.addChild(this.reset);
  }

  flagText(flag) {
    return `${readPath(flag.path) ? "◼" : "◻"} ${flag.label}`;
  }

  reading(knob) {
    try {
      return knob.show(readPath);
    } catch {
      return knob.hint || "";
    }
  }

  applyKnob(slider) {
    const knob = slider.knob;
    const scale = knob.invert ? 1 / slider.value : slider.value;
    for (const pattern of knob.paths) {
      for (const path of expand(pattern)) {
        const from = this.base.get(path);
        if (typeof from !== "number") continue;
        writePath(path, Number((from * scale).toFixed(4)));
      }
    }
    slider.say(this.reading(knob), slider.value);
    this.layoutSelf();
  }

  syncStates() {
    const raw = this.states() ? this.states().list() : [];
    const order = [];
    for (const s of raw) if (!order.includes(s.group)) order.push(s.group);
    const list = [];
    for (const group of order) {
      for (const s of raw) if (s.group === group) list.push(s);
    }
    const signature = list.map((s) => s.name).join("|");
    if (signature === this.signature) return list;
    this.signature = signature;

    for (const chip of this.stateChips.values()) chip.destroy();
    this.stateChips.clear();
    for (const head of this.heads) head.destroy();
    this.heads = [];

    let group = null;
    for (const state of list) {
      if (this.stateChips.has(state.name)) continue;
      if (state.group !== group) {
        group = state.group;
        const head = label(group.toUpperCase(), 10, GOLD);
        head.headGroup = group;
        this.heads.push(head);
        this.reel.addChild(head);
      }
      const short = state.name.replace(`${state.group}.`, "");
      const chip = new Chip(state.label || short, 10, () => {
        if (this.states().busy()) return;
        const out = this.states().run(state.name);
        if (out && out.catch) out.catch(() => {});
      });
      chip.state = state;
      this.stateChips.set(state.name, chip);
      this.reel.addChild(chip);
    }
    return list;
  }

  resize(layout) {
    this.layout = layout;
    const s = layout.safeBox;
    const ui = clamp(layout.ui, 0.8, 1.6);
    this.ui = ui;

    if (layout.portrait) {
      this.box = {
        x: s.x,
        y: s.bottom - s.h * 0.58,
        w: s.w,
        h: s.h * 0.58,
      };
    } else {
      const w = Math.min(s.w * 0.3, 300 * ui);
      this.box = { x: s.right - w, y: s.y, w, h: s.h };
    }
    this.layoutSelf();
  }

  layoutSelf() {
    if (!this.box) return;
    const { x, y, w, h } = this.box;
    const ui = this.ui;
    const pad = 8 * ui;
    const head = 22 * ui;

    this.sheet.clear();
    this.handle.paint(head, head, CHIP);

    if (this.shut) {
      this.position.set(x + w - head - pad, y + pad);
      this.handle.position.set(0, 0);
      this.title.visible = false;
      for (const tab of this.tabs) tab.visible = false;
      this.clip.visible = false;
      this.clipMask.visible = false;
      for (const chip of this.control) chip.visible = false;
      this.rate.visible = false;
      return;
    }

    this.position.set(x, y);
    this.title.visible = true;
    this.clip.visible = true;
    this.clipMask.visible = true;

    this.sheet.rect(0, 0, w, h);
    this.sheet.fill({ color: SHEET, alpha: 0.92 });
    this.sheet.rect(0, 0, w, h);
    this.sheet.stroke({ width: 1, color: GOLD, alpha: 0.3 });
    this.hitArea = new Rectangle(0, 0, w, h);

    this.title.style.fontSize = 11 * ui;
    this.title.position.set(pad, pad);
    this.handle.position.set(w - head - pad, pad);

    let at = pad + head + 4 * ui;

    const cols = TABS.length;
    const gap = 4 * ui;
    const tabW = (w - pad * 2 - gap * (cols - 1)) / cols;
    this.tabs.forEach((tab, i) => {
      tab.visible = true;
      tab.paint(tabW, 18 * ui, i === this.tab ? CHIP_LIVE : CHIP);
      tab.position.set(pad + i * (tabW + gap), at);
    });
    at += 18 * ui + 6 * ui;

    const ctlW = (w - pad * 2 - gap * 2) / 3;
    this.control.forEach((chip, i) => {
      chip.visible = true;
      chip.paint(ctlW, 18 * ui, i === 0 ? CHIP_HOT : CHIP);
      chip.position.set(
        pad + (i % 3) * (ctlW + gap),
        at + Math.floor(i / 3) * (18 * ui + gap),
      );
    });
    at += (18 * ui + gap) * 2 + 2 * ui;

    this.rate.visible = true;
    this.rate.position.set(pad, at);
    at += this.rate.paint(w - pad * 2, ui) + 6 * ui;

    this.clip.position.set(pad, at);
    this.clipMask.clear();
    this.clipMask.rect(pad, at, w - pad * 2, h - at - pad);
    this.clipMask.fill({ color: 0xffffff });
    this.view = { w: w - pad * 2, h: h - at - pad };

    this.fill();
  }

  inMenu(chip) {
    return MENU_GROUPS.includes(chip.state.group);
  }

  toneOf(state) {
    const held = this.states() ? this.states().busy() : "";
    if (held === state.name) return CHIP_LIVE;
    if (held) return CHIP_OFF;
    if (state.live) return CHIP_LIVE;
    return TONES[state.name] || CHIP;
  }

  fill() {
    const ui = this.ui;
    const w = this.view.w;
    const gap = 4 * ui;
    const rowH = 18 * ui;
    let at = 0;

    const menu = this.tab === MENU;
    const states = this.tab === STATES_TAB;
    const mods = this.tab === MODS_TAB;

    for (const chip of this.stateChips.values()) {
      chip.visible = states || (menu && this.inMenu(chip));
    }
    for (const head of this.heads) {
      head.visible = states || (menu && MENU_GROUPS.includes(head.headGroup));
    }
    for (const slider of this.sliders) slider.visible = mods;
    for (const chip of this.toggles) chip.visible = mods;
    if (this.reset) this.reset.visible = mods;
    this.readText.visible = this.tab === READ_TAB;

    if (menu || states) {
      const cols = menu ? 1 : 2;
      const rowSize = menu ? 26 * ui : rowH;
      const colW = (w - gap * (cols - 1)) / cols;
      let column = 0;
      let group = null;
      for (const [, chip] of this.stateChips) {
        if (!chip.visible) continue;
        if (chip.state.group !== group) {
          group = chip.state.group;
          if (column > 0) {
            at += rowSize + gap;
            column = 0;
          }
          const head = this.heads.find((n) => n.headGroup === group);
          if (head) {
            head.style.fontSize = 10 * ui;
            head.position.set(0, at);
            at += 14 * ui;
          }
        }
        chip.paint(colW, rowSize, this.toneOf(chip.state));
        chip.position.set(column * (colW + gap), at);
        column++;
        if (column >= cols) {
          at += rowSize + gap;
          column = 0;
        }
      }
      if (column > 0) at += rowSize + gap;
    }

    if (mods) {
      for (const slider of this.sliders) {
        slider.position.set(0, at);
        at += slider.paint(w, ui) + 4 * ui;
      }
      for (const chip of this.toggles) {
        chip.paint(w, rowH, CHIP);
        chip.position.set(0, at);
        at += rowH + gap;
      }
      this.reset.paint(w, rowH, CHIP_HOT);
      this.reset.position.set(0, at);
      at += rowH + gap;
    }

    if (this.tab === READ_TAB) {
      this.readText.style.fontSize = 10 * ui;
      this.readText.style.wordWrapWidth = w;
      this.readText.position.set(0, 0);
      at = this.readText.height;
    }

    this.span = at;
    this.apply();
  }

  apply() {
    const room = Math.min(0, this.view.h - this.span);
    this.scroll = clamp(this.scroll, room, 0);
    this.reel.position.set(0, this.scroll);
  }

  update(dt) {
    if (this.shut || !this.box) return;
    this.since += dt;
    if (this.since < REFRESH) return;
    this.since = 0;

    const before = this.signature;
    const list = this.syncStates();
    if (before !== this.signature) {
      this.fill();
      return;
    }

    if (this.tab === MENU || this.tab === STATES_TAB) {
      for (const state of list) {
        const chip = this.stateChips.get(state.name);
        if (chip && chip.visible)
          chip.paint(chip.w, chip.h, this.toneOf(state));
      }
    }

    if (this.tab === READ_TAB && this.states()) {
      const read = this.states().read();
      this.readText.text = Object.keys(read)
        .map((k) => `${k}: ${JSON.stringify(read[k])}`)
        .join("\n");
      this.span = this.readText.height;
      this.apply();
    }
  }
}

export function openPanel(scene) {
  const panel = new DevPanel(scene);
  panel.syncStates();
  scene.app.stage.addChild(panel);
  if (scene.layout) panel.resize(scene.layout);
  return panel;
}
