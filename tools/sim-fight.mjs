import { DIFFICULTY, T, WORLD_RATE } from "../src/config.js";

const steps = DIFFICULTY.curve.steps;
const at = (field, p) => {
  if (p <= steps[0].p) return steps[0][field];
  for (let i = 1; i < steps.length; i++) {
    const b = steps[i];
    if (p > b.p) continue;
    const a = steps[i - 1];
    const w = b.p - a.p;
    return a[field] + (b[field] - a[field]) * (w > 0 ? (p - a.p) / w : 1);
  }
  return steps[steps.length - 1][field];
};

const pace = (hp, second, moves, killOn) => {
  const g = DIFFICULTY.pace;
  if (!g || !g.enabled) return 1;
  const byClock = 1 - second / g.seconds;
  const held = Math.max(1, killOn - 1);
  const byMatch = Math.pow(Math.max(0, 1 - moves / held), g.matchBend || 1);
  const expected = Math.max(0, Math.min(byClock, byMatch));
  if (expected <= 0 || hp >= expected) return 1;
  return Math.max(g.floor, Math.pow(hp / expected, g.bite));
};

const ULT_CAST = 2.0 / WORLD_RATE;

function run({ cells, combo, ultAfter, killOn, cap = 12 }) {
  let hp = 1;
  let t = 2.5;
  let moves = 0;
  let ults = 0;
  const period = T.moveCost;
  const log = [];
  while (hp > 0 && moves < cap) {
    const size = DIFFICULTY.sizeBonus[Math.min(cells, 5)] || 1;
    const mult = DIFFICULTY.comboMultiplier[combo - 1];
    const armor = at("resist", 1 - hp);
    const hit =
      cells *
      DIFFICULTY.damagePerGem *
      mult *
      size *
      armor *
      pace(hp, t, moves, killOn);
    hp = Math.max(0, hp - hit);
    moves++;
    t += period;
    log.push(
      `  m${moves} -${(hit * 100).toFixed(0)}% -> ${(hp * 100).toFixed(0)}% @${t.toFixed(1)}s`,
    );
    if (hp <= 0) break;
    if (moves === ultAfter) {
      const a = at("resist", 1 - hp);
      const raw =
        DIFFICULTY.ultDamage +
        5 * DIFFICULTY.damagePerGem * DIFFICULTY.ultGemMultiplier;
      const grip = Math.max(
        pace(hp, t, moves, killOn),
        DIFFICULTY.pace.ultFloor || 0,
      );
      const u = raw * Math.pow(a, DIFFICULTY.ultHideBite) * grip;
      hp = Math.max(0, hp - u);
      ults++;
      t += ULT_CAST;
      log.push(
        `  ULT -${(u * 100).toFixed(0)}% -> ${(hp * 100).toFixed(0)}% @${t.toFixed(1)}s`,
      );
    }
  }
  return { hp, t, moves, ults, log };
}

const cases = [
  ["triples + 1 ult after m3 ", { cells: 3, combo: 1, ultAfter: 3 }],
  ["triples + 1 ult after m4 ", { cells: 3, combo: 1, ultAfter: 4 }],
  ["triple+cascade + ult m3  ", { cells: 3, combo: 2, ultAfter: 3 }],
  ["4-cell + ult m3          ", { cells: 4, combo: 1, ultAfter: 3 }],
  ["5-cell + ult m3          ", { cells: 5, combo: 1, ultAfter: 3 }],
  ["triples, no ult          ", { cells: 3, combo: 1, ultAfter: 0 }],
];

const verbose = process.argv.includes("-v");
for (const killOn of DIFFICULTY.pace.matches) {
  console.log(`rolled ${killOn} matches`);
  for (const [name, cfg] of cases) {
    const r = run({ ...cfg, killOn });
    console.log(
      " ",
      name,
      r.hp <= 0
        ? `WIN in ${r.moves} moves + ${r.ults} ult @${r.t.toFixed(1)}s`
        : `${r.moves} moves + ${r.ults} ult, boss still at ${(r.hp * 100).toFixed(0)}%`,
    );
    if (verbose) console.log(r.log.join("\n"));
  }
}
console.log(
  `\ndpg ${DIFFICULTY.damagePerGem} ultDmg ${DIFFICULTY.ultDamage} bite ${DIFFICULTY.ultHideBite}` +
    ` matches ${DIFFICULTY.pace.matches.join("|")} bend ${DIFFICULTY.pace.matchBend}` +
    ` release ${DIFFICULTY.pace.seconds}/${DIFFICULTY.pace.bite}/${DIFFICULTY.pace.floor}` +
    ` cap ${T.hardCap} move ${T.moveCost.toFixed(2)}s`,
);
