export const FIRE = 0;
export const WATER = 1;
export const NATURE = 2;
export const LIGHTNING = 3;
export const ARCANE = 4;
export const WIND = 5;

export const GEM_COLORS = [
  0xff5a1f, 0x2fa8ff, 0x3fd16a, 0xffd22e, 0xa855f7, 0x8ceee2,
];
export const GEM_DARK = [
  0x8c2405, 0x0b4d85, 0x14663a, 0x8a6a00, 0x4c1d95, 0x11594f,
];
export const GEM_LIGHT = [
  0xffc08a, 0xb6e4ff, 0xb6f5c9, 0xfff2a8, 0xe6c9ff, 0xdafff8,
];

const KEY_TO_GEM = {
  F: FIRE,
  W: WATER,
  N: NATURE,
  L: LIGHTNING,
  A: ARCANE,
  Z: WIND,
};

export const COLS = 5;
export const ROWS = 5;

const START_BOARD_KEYS = ["FLWWL", "NZANN", "FFWZA", "ZNFLZ", "ZZAAN"];

export const START_BOARD = START_BOARD_KEYS.map((row) =>
  row.split("").map((k) => KEY_TO_GEM[k]),
);

export const SCRIPTED_HINT = { a: { r: 2, c: 2 }, b: { r: 3, c: 2 } };

export const OBSIDIAN = {
  rock: 0x36293f,
  edge: 0x60486e,
  seam: 0xff5a1f,
  seamHot: 0xffc247,
};

export const SNAP = {
  on: false,
  times: 6,
  from: 0.08,
  over: 2,
  leave: 1,
  gap: 2.6,
  flight: 0.34,
};

export const DIFFICULTY = {
  damagePerGem: 0.09,
  comboMultiplier: [1, 1.2, 1.4, 1.6, 1.8],
  sizeBonus: { 4: 1.15, 5: 1.15 },
  downedPenalty: 0.45,

  volleyDelay: 0.06,
  volleyStagger: 0.05,
  assistImpact: 0.42,

  chargePerGem: 0.2,
  chargeStart: 0.16,

  randomOpeningHero: true,

  partyChargePerGem: 0.16,
  partyChargeStart: 0.06,
  ultDamage: 0.24,
  ultGemMultiplier: 0.9,
  ultGemFloor: 4,
  ultHideBite: 2.2,
  ultCostsTime: true,

  ultTimeRate: 0.5,

  curve: {
    enabled: true,
    seconds: 24,
    clockFloor: 0.5,
    clockLead: 0.25,
    steps: [
      {
        p: 0.0,
        attack: 0.412,
        resist: 1.0,
        ult: 1,
        obsidian: 1.9,
        hold: 8,
        crust: 0,
      },
      {
        p: 0.35,
        attack: 0.495,
        resist: 1.0,
        ult: 1,
        obsidian: 3.2,
        hold: 10,
        crust: 0.5,
      },
      {
        p: 0.5,
        attack: 0.605,
        resist: 1.0,
        ult: 1,
        obsidian: 3.8,
        hold: 11,
        crust: 1,
        name: "OBSIDIAN HIDE",
      },
      {
        p: 0.6,
        attack: 0.66,
        resist: 0.88,
        ult: 1,
        obsidian: 4.5,
        hold: 12,
        crust: 1.2,
      },
      {
        p: 0.75,
        attack: 0.743,
        resist: 0.88,
        ult: 1,
        obsidian: 4.5,
        hold: 12,
        crust: 1.4,
        name: "MOLTEN CORE",
      },
      {
        p: 0.88,
        attack: 0.88,
        resist: 0.8,
        ult: 1,
        obsidian: 5.7,
        hold: 13,
        crust: 1.7,
      },
      {
        p: 0.9,
        attack: 0.797,
        resist: 0.72,
        ult: 1,
        obsidian: 5.7,
        hold: 13,
        crust: 1.8,
      },
      {
        p: 1.0,
        attack: 0.66,
        resist: 0.72,
        ult: 1,
        obsidian: 5.7,
        hold: 13,
        crust: 1.8,
      },
    ],
  },

  obsidianBase: 4,
  obsidianGrowth: 1.5,
  obsidianMax: 9,
  obsidianMaxGrowth: 0.9,
  obsidianMaxCap: 13,

  bossRamp: 1.14,

  ragePerSecond: 0.005,
  rageMax: 1.18,

  armor: [
    { below: 0.15, mult: 0.52, name: "MOLTEN CORE" },
    { below: 0.35, mult: 0.66, name: "OBSIDIAN HIDE" },
    { below: 0.65, mult: 0.8, name: "HARDENED" },
  ],

  pace: {
    enabled: true,
    seconds: 27,
    bite: 3,
    floor: 0.12,
    ultFloor: 0.3,
    matches: [6, 7],
    matchBend: 0.6,
  },

  healDecay: 0.1,

  mend: {
    enabled: true,
    at: 0.44,
    floor: 0.17,
    gain: 0.15,
    least: 0.055,
    decay: 0.05,
    uses: 1,
    ceiling: 0.94,
    deadline: 24,
    cast: 1.15,
  },

  rigCascades: false,

  randomOpening: true,
};

export const RUN_SEED = 0x2f6e2b1;

export const DOOM = {
  bury: { at: 0.22, every: 1.26, perTick: 5 },

  seconds: 30,
  stretch: { extra: 5, window: 10, shape: 1 },
  repeat: 5,
  repeatDecay: 0.78,
  repeatFloor: 3,
  damage: 0.32,
  damageRamp: 1.2,
  warnAt: [4, 2],
  panicAt: 3.5,
};

export const BOSS_MAX_HP = 8000000;
export const BOSS_NAME = "KOLTMOS";

export const WORLD_RATE = 0.91;

export const T = {
  hints: true,
  autoPlay: false,
  bossPress: 1.4,
  touchHand: false,
  introIn: 0.95,
  entrance: false,
  hint: 2.0,
  pulse: 4.5,
  openingHint: 0,
  ultHints: true,
  ultHintIn: 1.05,
  ultHint: 3.2,
  ultHintShows: 5,
  ultHintAgain: 2.2,
  ultShout: 1.4,
  ultAuto: 5,
  auto: 2.4,
  autoFloor: 0.35,
  banner: 11.7,
  hardCap: 35.0,
  outcomeHold: 4.2,
  finaleReserve: 3.85,
  moveCost: 3.08,
};

export const SPOTLIGHT = {
  on: true,
  dim: 0.72,
  dimInPlay: 0.42,
  color: 0x05030a,
  pad: 0,
  feather: 0.55,
  featherSteps: 1,
  corner: 0,
  fade: 0.28,
  travel: 0.34,
};

export const AUDIO = {
  on: true,
  master: 0.55,
  bed: true,
  bedLevel: 0.035,
  sfxSamples: true,
  sfxSampleLevel: 1.0,
  roomLoop: 7.0,
  music: true,
  musicLevel: 0.09,
  musicTracks: true,
  musicTrackLevel: 0.22,
  musicEndcard: true,
  overrideSilentSwitch: true,
  maxVoices: 18,
};

export const STORE_URL = {
  ios: "https://apps.apple.com/app/id6755186220",
  android:
    "https://play.google.com/store/apps/details?id=hitzone.anima.spirit.guardians",
};

export const COPY = {
  start: "CLICK TO START THE GAME",
  tutorial: "MATCH 3 TO ATTACK",
  tutorialHold: 1.6,
  ultReady: "TAP {hero}",
  ultSurge: "ULTIMATE READY",
  victory: "VICTORY",
  endTitle: "INVOKERS\nTITAN LEGACY",
  endSub: "COLLECT YOUR HEROES",
  cta: "PLAY NOW",
  retry: "RETRY",

  outcomeVictory: "VICTORY",
  outcomeDefeat: "DEFEAT",
  tapContinue: "TAP TO CONTINUE",

  lava: "LAVA SPREADS!",
  lavaHint: "BREAK IT",
  snap: "NOT THAT ONE!",
  ultClear: "BOARD CLEARED!",
  breath: "LAVA BREATH!",
  smash: "MAGMA SLAM!",
  rake: "CLAW RAKE!",
  eruption: "ERUPTION!",
  ultHeal: "TEAM HEALED!",
  mend: `${BOSS_NAME} MENDS!`,
  doomLabel: "CATACLYSM",
  doomWarn: `${BOSS_NAME} IS CHARGING!`,
  doomSoon: "BRACE!",
  doomCast: "CATACLYSM!",
  doomSurvived: "WE HELD!",
  down: "HERO DOWN!",
  shuffle: "NO MOVES — RESHUFFLE",
  defeat: "PARTY WIPED",
};

export const FONT =
  '"Hitzone", "Elan ITC Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const FONT_TITLE =
  '"Hitzone Med", "Hitzone", "Elan ITC Pro", Georgia, "Times New Roman", serif';

export const FONT_OUTCOME =
  '"Elan ITC Pro", "Hitzone Med", "Hitzone", Georgia, "Times New Roman", serif';

export const FONT_DAMAGE =
  '"Montserrat It", "Hitzone", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const HEROES = [
  { name: "RICKLOW", element: FIRE, skill: "MAGMA LANCE" },
  { name: "ARISSA", element: WATER, heal: true, skill: "ABYSSAL TIDE" },
  { name: "QUINNTO", element: NATURE, skill: "VERDANT WRATH" },
  { name: "SELISA", element: LIGHTNING, skill: "STORM VERDICT" },
  { name: "SILANTH", element: ARCANE, skill: "VOID ECLIPSE" },
  { name: "TARANIS", element: WIND, skill: "CYCLONE EDGE" },
];

export const HEALER = 1;

export const HERO_MAX_HP = 8000;

export const HERO_MAX_CHARGE = 120;

export const HERO_HP_FLOOR = 0;

export const HERO_CRITICAL = 0.42;

export const BOSS_ATTACKS = [
  {
    kind: "rake",
    targets: "lowest",
    damage: 0.15,
    splash: 0.045,
    shout: COPY.rake,
  },
  { kind: "breath", targets: "all", damage: 0.085, shout: COPY.breath },
  {
    kind: "smash",
    targets: "lowest",
    damage: 0.27,
    splash: 0.05,
    shout: COPY.smash,
  },
  {
    kind: "smash",
    targets: "all",
    damage: 0.11,
    obsidianBonus: 3,
    shout: COPY.eruption,
    from: 3,
  },
];

export const MEND_FX = {
  seconds: 1.15,
  peak: 0.68,
  green: 0x3fd16a,
  light: 0xb6f5c9,
  core: 0xfff2d0,
  sheet: 0.92,
  grow: -0.28,
  halo: 0.72,
  haloAlpha: 0.55,
  heart: 0.24,
  motes: 26,
  reach: 0.95,
  stagger: 0.42,
  rings: 2,
  ringAlpha: 0.5,
  ringFlat: 0.9,
};

export const BLAST = {
  tint: 0xffc08a,
  alpha: 0.5,
  scale: 0.6,
  from: 0.2,
  rise: 0.18,
  drop: 0.04,
};

export const JET = {
  tint: 0xffe0b0,
  alpha: 0.78,
  reach: 1.12,
  spread: 0.92,
  root: 0.04,
  lip: 0.42,
  open: 0.16,
  rate: 1.6,
  tail: 0.3,
};

export const SPARK = {
  hot: 0xfff0d0,
  streak: 2.4,
  fall: 1.9,
  hold: 0.45,
};

export const FRONT = {
  alpha: 0.3,
  lip: 0.9,
  lead: 0.3,
  spin: 0.012,
  embers: 7,
};

export const BOOM = {
  tint: 0xffd9a8,
  alpha: 0.5,
  seconds: 0.5,
  scale: 0.92,
  from: 0.3,
  rise: 0.2,
};

export const HITP = {
  alpha: 0.72,
  seconds: 0.36,
  size: 260,
  from: 0.35,
  rise: 0.22,
};

export const SHARD = {
  alpha: 0.85,
  seconds: 0.4,
  scale: 1.9,
  from: 0.4,
  rise: 0.2,
};

export const IMPACT_FX = {
  flat: 0.62,
  streaks: 7,
};

export const ULT_PACE = {
  rush: 5,
  cast: 1.35,
  tail: 0.22,
};

export const ULT_RIM = {
  inset: 0.008,
  alpha: 1,
  rate: 1,
  in: 0.4,
  out: 0.28,
  swap: 0.3,
  breath: { rate: 2.3, depth: 0.26 },
  burstGrow: 1.08,
  burstDur: 0.9,
  burstTail: 0.5,
  stop: 0.55,
  flash: 0.3,
  flashDur: 0.4,
};

export const ULT_SURGE = {
  panel: {
    aspect: 0.66,
    tall: 0.3,
    tallWide: 0.44,
    minTall: 0.13,
    share: 0.26,
    gap: 0.72,
    bias: 0.07,
    round: 0.09,
    glow: 1.5,
    rate: 1.2,
    from: 1.16,
  },
  bloom: { wide: 1.5, tall: 0.46, alpha: 0.62 },
  streak: { wide: 1.45, thick: 0.34, alpha: 1, gap: 0.18, open: 0.26 },
  crown: {
    licks: 3,
    height: 1.1,
    narrow: 0.62,
    spread: 0.76,
    root: 0.22,
    fps: 15,
    alpha: 0.95,
  },
  kicker: { size: 0.44, gap: 0.36, spacing: 0.26 },
  head: { widthShare: 0.086, maxSize: 42, minSize: 18, spacing: 0.05 },
  climb: 0.12,
  from: 1.24,
  fadeIn: 0.14,
  settle: 0.3,
  hold: 0.58,
  fadeOut: 0.3,
  rise: 0.14,
};

export const ULT_CALL = {
  summon: {
    motes: 5,
    dur: 0.5,
    stagger: 0.05,
    head: 0.75,
    bow: 0.26,
    trail: 18,
    land: 3.4,
    thickness: 0.55,
    travel: 0.16,
    impact: 1.1,
  },
  beckon: {
    every: 1.9,
    urgentAfter: 4.5,
    urgentEvery: 1.1,
    urgentGrow: 1.25,
    shaft: { w: 2.1, h: 2.2, dur: 0.6, alpha: 0.4 },
    lick: { h: 1.65, dur: 0.5, rise: 0.7, alpha: 0.85 },
    ring: { size: 3.4, width: 6 },
    punch: 0.1,
    gain: 0.5,
  },
};

export const ULT_FX = {
  gather: 0.22,
  gatherSize: 0.3,
  gatherMotes: 18,
  gatherReach: 0.95,
  muzzle: 0.62,
  muzzleLife: 0.26,
  lanceLife: 0.32,
  lanceThick: 0.075,
  lanceCore: 0.2,
  trailGap: 22,
  trailSize: 0.26,
  boltSize: 0.3,
  boltLong: 0.95,
  boltSwell: 0.22,
  travel: 0.28,
  blastScale: 1.35,
  shockWidth: 12,
  shockReach: 1.5,
  shockLife: 0.44,
  sparks: 18,
  streamThick: 0.2,
  streamRush: 0.28,
  streamHold: 0.3,
  streamFps: 22,
  streamReach: 1.06,
};

export const ULT_HEAL_TO = 0.6;

export const ULT_HEAL_FLOOR = 0.32;
