/**
 * Ultimate cut-in — for whichever hero the player just spent.
 *
 * The single most important beat in the creative: this is where the player is
 * told "the heroes are the power", so it gets the full anime treatment. It used
 * to be Nyx's alone, baked into the constructor; now every card can be tapped,
 * so the portrait, the name, the skill and every colour on screen are swapped
 * by setHero() before the slam.
 */

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { FONT, GEM_COLORS, GEM_LIGHT, HEROES, NYX } from "../config.js";
import { heroPortrait } from "../art/heroes.js";
import { glowTexture } from "../art/textures.js";
import { tween, delay, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";

export class CutIn extends Container {
  constructor() {
    super();
    this.visible = false;

    /** Whose cut-in this currently is. Nyx until somebody taps another card. */
    this.index = NYX;

    this.dim = new Graphics();
    this.addChild(this.dim);

    this.lines = new Graphics();
    this.addChild(this.lines);

    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[HEROES[NYX].element];
    this.addChild(this.glow);

    this.portrait = new Sprite(heroPortrait(NYX));
    this.portrait.anchor.set(0.5);
    this.addChild(this.portrait);

    this.plate = new Graphics();
    this.addChild(this.plate);

    this.name = new Text({
      text: HEROES[NYX].name,
      style: {
        fontFamily: FONT,
        fontSize: 44,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 4,
      },
    });
    this.name.anchor.set(0, 0.5);
    this.addChild(this.name);

    this.skill = new Text({
      text: HEROES[NYX].skill,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: GEM_LIGHT[HEROES[NYX].element],
        letterSpacing: 2.4,
      },
    });
    this.skill.anchor.set(0, 0.5);
    this.addChild(this.skill);

    this.layout = null;
  }

  /**
   * Point the whole cut-in at one hero.
   *
   * Everything colour-carrying is rebuilt here rather than in the constructor,
   * including the speed lines and the name plate — those are drawn in resize(),
   * so this re-runs it once the hero has changed.
   */
  setHero(index) {
    const hero = HEROES[index];
    if (!hero) return;

    const changed = this.index !== index;
    this.index = index;
    if (!changed) return;

    this.portrait.texture = heroPortrait(index);
    this.glow.tint = GEM_COLORS[hero.element];
    this.name.text = hero.name;
    this.skill.text = hero.skill;
    this.skill.style.fill = GEM_LIGHT[hero.element];
    if (this.layout) this.resize(this.layout);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;
    const el = HEROES[this.index].element;

    this.dim.clear();
    this.dim.rect(0, 0, w, h);
    this.dim.fill({ color: 0x05030c });

    // Diagonal speed lines behind the portrait
    this.lines.clear();
    for (let i = -6; i < 26; i++) {
      const x = (w / 12) * i;
      const wdt = i % 3 === 0 ? w * 0.03 : w * 0.012;
      this.lines.poly([
        x,
        -h * 0.2,
        x + wdt,
        -h * 0.2,
        x - h * 0.5,
        h * 1.2,
        x - h * 0.5 - wdt,
        h * 1.2,
      ]);
      this.lines.fill({
        color: i % 2 ? GEM_COLORS[el] : 0xffffff,
        alpha: i % 3 === 0 ? 0.16 : 0.07,
      });
    }

    const size = Math.min(h * 0.52, w * 0.72);
    this.portrait.setSize(size, size);
    this.portrait.x = layout.portrait ? w * 0.34 : w * 0.28;
    this.portrait.y = h * 0.46;

    this.glow.setSize(size * 1.9, size * 1.9);
    this.glow.x = this.portrait.x;
    this.glow.y = this.portrait.y;

    const fs = Math.max(22, Math.min(w * 0.11, 54 * layout.ui));
    this.name.style.fontSize = fs;
    this.skill.style.fontSize = fs * 0.42;

    const textX = layout.portrait ? w * 0.14 : w * 0.5;
    this.name.x = textX;
    this.name.y = h * (layout.portrait ? 0.72 : 0.44);
    this.skill.x = textX;
    this.skill.y = this.name.y + fs * 0.78;

    this.plate.clear();
    this.plate.poly([
      textX - fs * 0.5,
      this.name.y - fs * 0.62,
      w,
      this.name.y - fs * 0.62,
      w,
      this.skill.y + fs * 0.42,
      textX - fs * 0.78,
      this.skill.y + fs * 0.42,
    ]);
    this.plate.fill({ color: 0x0a1c33, alpha: 0.85 });
    this.plate.poly([
      textX - fs * 0.5,
      this.name.y - fs * 0.62,
      textX - fs * 0.32,
      this.name.y - fs * 0.62,
      textX - fs * 0.6,
      this.skill.y + fs * 0.42,
      textX - fs * 0.78,
      this.skill.y + fs * 0.42,
    ]);
    this.plate.fill({ color: GEM_LIGHT[el] });
  }

  /** Slam in, hold, slide out. */
  async play(index) {
    if (index !== undefined) this.setHero(index);
    const { w } = this.layout;
    this.visible = true;
    this.alpha = 1;
    sfx.ultCutin(HEROES[this.index].element);

    this.dim.alpha = 0;
    this.lines.alpha = 0;
    this.portrait.alpha = 0;
    this.glow.alpha = 0;

    const homeX = this.portrait.x;
    const textHome = this.name.x;

    this.portrait.x = homeX - w * 0.45;
    this.name.x = textHome + w * 0.5;
    this.skill.x = textHome + w * 0.7;
    this.plate.x = w;

    await Promise.all([
      tween(this.dim, { alpha: 0.82 }, 0.16),
      tween(this.lines, { alpha: 1 }, 0.2),
      tween(this.portrait, { alpha: 1 }, 0.14),
      tween(this.portrait, { x: homeX }, 0.32, { ease: Ease.expoOut }),
      tween(this.glow, { alpha: 0.7 }, 0.3),
      tween(this.plate, { x: 0 }, 0.28, { ease: Ease.expoOut }),
      tween(this.name, { x: textHome }, 0.34, { ease: Ease.expoOut }),
      tween(this.skill, { x: textHome }, 0.4, { ease: Ease.expoOut }),
    ]);

    // Lines drift while the portrait holds
    tween(this.lines, { x: -w * 0.12 }, 0.55, { ease: Ease.quadOut });
    await delay(0.42);

    await Promise.all([
      tween(this.dim, { alpha: 0 }, 0.28),
      tween(this.lines, { alpha: 0 }, 0.22),
      tween(this.portrait, { alpha: 0 }, 0.26),
      tween(this.portrait, { x: homeX + w * 0.2 }, 0.3),
      tween(this.glow, { alpha: 0 }, 0.26),
      tween(this.plate, { alpha: 0 }, 0.24),
      tween(this.name, { alpha: 0 }, 0.24),
      tween(this.skill, { alpha: 0 }, 0.24),
    ]);

    this.visible = false;
    this.lines.x = 0;
    this.plate.alpha = 1;
    this.name.alpha = 1;
    this.skill.alpha = 1;
  }
}
