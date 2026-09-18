export const KNOB_ROOTS = ["DIFFICULTY", "DOOM", "T"];

const pct = (v) => `${Math.round(v * 100)}%`;

export const KNOBS = [
  {
    key: "damage",
    label: "Шкода від матчу",
    hint: "як швидко падає бос",
    min: 0.4,
    max: 2.5,
    paths: ["DIFFICULTY.damagePerGem"],
    show: (get) => `${pct(get("DIFFICULTY.damagePerGem") * 3)} боса за матч-3`,
  },
  {
    key: "bossHit",
    label: "Сила боса",
    hint: "як боляче б'є",
    min: 0.3,
    max: 2,
    paths: ["DIFFICULTY.curve.steps.*.attack"],
    show: (get) =>
      `${pct(get("DIFFICULTY.curve.steps.0.attack"))} на старті бою`,
  },
  {
    key: "bossArmor",
    label: "Броня боса",
    hint: "більше — менше шкоди проходить",
    min: 0.5,
    max: 2,
    invert: true,
    paths: ["DIFFICULTY.curve.steps.*.resist"],
    show: (get) =>
      `проходить ${pct(get("DIFFICULTY.curve.steps.0.resist"))} шкоди`,
  },
  {
    key: "ultCharge",
    label: "Заряд ульти",
    hint: "як швидко ульта готова",
    min: 0.3,
    max: 3,
    paths: [
      "DIFFICULTY.chargePerGem",
      "DIFFICULTY.chargeStart",
      "DIFFICULTY.partyChargePerGem",
      "DIFFICULTY.partyChargeStart",
    ],
    show: (get) => {
      const per = get("DIFFICULTY.chargePerGem") * 3;
      const left = 1 - get("DIFFICULTY.chargeStart");
      return per > 0 ? `${Math.ceil(left / per)} ходи до ульти` : "ніколи";
    },
  },
  {
    key: "ultPower",
    label: "Сила ульти",
    hint: "скільки знімає одна ульта",
    min: 0.3,
    max: 3,
    paths: ["DIFFICULTY.ultDamage", "DIFFICULTY.ultGemMultiplier"],
    show: (get) =>
      `≈${pct(
        get("DIFFICULTY.ultDamage") +
          5 *
            get("DIFFICULTY.damagePerGem") *
            get("DIFFICULTY.ultGemMultiplier"),
      )} hp боса`,
  },
  {
    key: "stones",
    label: "Каміння на полі",
    hint: "скільки обсидіану сипле бос",
    min: 0,
    max: 2.5,
    paths: ["DIFFICULTY.curve.steps.*.obsidian", "DIFFICULTY.obsidianBase"],
    show: (get) =>
      `${get("DIFFICULTY.curve.steps.0.obsidian").toFixed(1)} каменя за хід`,
  },
  {
    key: "finisher",
    label: "Гарантія добивання",
    hint: "тримає кількість ходів до перемоги",
    min: 0,
    max: 3,
    paths: ["DIFFICULTY.pace.floor"],
    show: (get) => `удар не слабший за ${pct(get("DIFFICULTY.pace.floor"))}`,
  },
  {
    key: "doomHit",
    label: "Катаклізм: шкода",
    hint: "скільки знімає з героїв",
    min: 0.2,
    max: 2.5,
    paths: ["DOOM.damage"],
    show: (get) => `${pct(get("DOOM.damage"))} hp героїв`,
  },
  {
    key: "doomWhen",
    label: "Катаклізм: коли",
    hint: "секунда першого удару",
    min: 0.4,
    max: 2,
    paths: ["DOOM.seconds"],
    show: (get) => `${get("DOOM.seconds").toFixed(0)}с від старту`,
  },
  {
    key: "fightLength",
    label: "Ліміт бою",
    hint: "коли бій обривається",
    min: 0.6,
    max: 1.6,
    paths: ["T.hardCap"],
    show: (get) => `${get("T.hardCap").toFixed(1)}с максимум`,
  },
  {
    key: "worldRate",
    label: "Темп гри",
    hint: "швидкість усієї анімації",
    min: 0.7,
    max: 1.4,
    paths: ["WORLD_RATE"],
    show: (get) => `×${get("WORLD_RATE").toFixed(2)}`,
  },
];

export const TOGGLES = [
  { key: "curve", label: "Крива складності", path: "DIFFICULTY.curve.enabled" },
  { key: "pace", label: "Гарантія темпу", path: "DIFFICULTY.pace.enabled" },
  { key: "mend", label: "Лікування боса", path: "DIFFICULTY.mend.enabled" },
  { key: "auto", label: "Грати замість мене", path: "T.autoPlay" },
];

const round = (v) => Number(Number(v).toFixed(4));

function expand(path, read) {
  if (!path.includes("*")) return read(path) === undefined ? [] : [path];
  const out = [];
  for (let i = 0; i < 64; i++) {
    const one = path.replace("*", String(i));
    if (read(one) === undefined) break;
    out.push(one);
  }
  return out;
}

export function planEdits(state, read) {
  const edits = [];
  const knobs = (state && state.knobs) || {};
  const toggles = (state && state.toggles) || {};

  KNOBS.forEach((knob) => {
    let factor = Number(knobs[knob.key]);
    if (!Number.isFinite(factor) || factor < 0) factor = 1;
    if (knob.invert && factor <= 0) factor = knob.min || 1;
    const scale = knob.invert ? 1 / factor : factor;
    knob.paths.forEach((pattern) =>
      expand(pattern, read).forEach((path) => {
        const base = read(path);
        if (typeof base !== "number") return;
        edits.push({ path, base, value: round(base * scale) });
      }),
    );
  });

  TOGGLES.forEach((toggle) => {
    const want = toggles[toggle.key];
    if (want === undefined) return;
    const base = read(toggle.path);
    if (typeof base !== "boolean") return;
    edits.push({ path: toggle.path, base, value: !!want });
  });

  return edits;
}
