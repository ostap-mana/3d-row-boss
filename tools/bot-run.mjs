import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";

const USAGE = `
bot-run — play the built creative to the end, over and over, and write down
what happened.

  node tools/bot-run.mjs [options]

  Tuning a fight by eye does not work: a run is fifteen seconds long and the
  thing you need to see is a distribution, not a frame. This drives
  dist/km3.html in headless Chrome through the real input pipeline, plays
  whole games with the board's own findBestSwap, and logs boss health, moves,
  heroes standing, swaps available, obsidian, and what the pace guard is doing
  at every move.

  Two things matter and both are easy to get wrong:

  The tap that starts the game has to be a TRUSTED event —
  Input.dispatchTouchEvent over CDP, not dispatchEvent in the page. A
  synthetic PointerEvent leaves firstTouch() unresolved, so the fight never
  starts, the board still resolves swaps, and the run looks like a board that
  silently refuses to play.

  And it has to run on the real GPU. --use-angle=swiftshader gives 1.5 fps
  here, the game clock is capped per tick, and the whole fight then plays out
  at a tenth speed against a bot that moves on a wall clock. Plain
  --enable-gpu gives 117.

  --runs <n>      games to play. Default 5.
  --gap <ms>      how long the bot waits between moves, which is the whole
                  difficulty dial — it stands in for how fast a person plays.
                  Default 1600.
  --no-ults       never fire an ultimate, to see the fight without them.
  --file <path>   the creative to play. Default dist/km3.html.
  --out <path>    where to write the run log as JSON. Optional.

  node tools/bot-run.mjs --runs 8 --gap 2200
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const file = resolve(flag("file", join(ROOT, "dist/km3.html")));
if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}\nrun npm run build first\n`);
  process.exit(1);
}

const runs = Number(flag("runs", 5));
const gap = Number(flag("gap", 1600));
const useUlts = !args.includes("--no-ults");
const outPath = flag("out", null);

const PORT = 8140;
const DEBUG = 9340;

const html = readFileSync(file);
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
if (!CHROME) {
  process.stderr.write("no chrome found\n");
  process.exit(1);
}

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "bot-"))}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--window-size=430,932",
    "--hide-scrollbars",
    "--mute-audio",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
for (let i = 0; i < 120 && !page; i++) {
  try {
    const list = await (
      await fetch(`http://127.0.0.1:${DEBUG}/json/list`)
    ).json();
    page = list.find((t) => t.type === "page");
  } catch {}
  if (!page) await new Promise((r) => setTimeout(r, 200));
}
if (!page) {
  process.stderr.write("chrome never answered\n");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const waiting = new Map();
const thrown = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    thrown.push(
      msg.params.exceptionDetails.exception?.description ||
        msg.params.exceptionDetails.text,
    );
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 900000,
  });
  if (r.result?.exceptionDetails) {
    return { error: r.result.exceptionDetails.exception?.description };
  }
  return { value: r.result?.result?.value };
};

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 932,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if ((await evaluate("!!window.__SIEGE__")).value) break;
  await new Promise((r) => setTimeout(r, 200));
}

const tapToStart = async () => {
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 215, y: 800 }],
  });
  await new Promise((r) => setTimeout(r, 60));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  for (let i = 0; i < 50; i++) {
    if (
      (
        await evaluate(
          "!!(__SIEGE__.director && __SIEGE__.director.fightStart)",
        )
      ).value
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

await evaluate(`window.__bot = async (gap, useUlts) => {
  const s = window.__SIEGE__;
  const d = s.director;
  const b = s.board;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const party = () => {
    const hp = s.heroRow.cards.map((c) => (c.downed ? 0 : Math.max(0, c.hp)));
    return { low: +Math.min(...hp).toFixed(3), sum: +(hp.reduce((a, b) => a + b, 0) / hp.length).toFixed(3) };
  };
  const locked = () => {
    let n = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (b.isLocked(r, c)) n++;
    return n;
  };
  const log = [];
  let guard = 0;
  let stalled = 0;
  let ults = 0;
  const t0 = d.elapsed();
  while (!d.settled() && guard++ < 200) {
    await b.whenQuiet();
    if (d.settled()) break;
    let kind = "swap";
    let fired = false;
    if (useUlts) {
      for (let i = 0; i < 6; i++) {
        if (d.canUlt && d.canUlt(i)) { d.onCardTap(i); fired = true; kind = "ult"; ults++; break; }
      }
    }
    if (!fired) {
      const best = b.findBestSwap();
      if (!best) { stalled++; await sleep(gap); if (stalled > 8) break; continue; }
      b.autoPlay(best);
    }
    await sleep(80);
    await b.whenQuiet();
    log.push({
      t: +(d.elapsed() - t0).toFixed(2), hp: +d.bossHp.toFixed(4),
      moves: d.movesPlayed, alive: s.heroRow.aliveCount(), swaps: b.countSwaps(),
      locks: locked(), pace: +d.pace().toFixed(3), armor: +d.armor().toFixed(3),
      low: party().low, party: party().sum, kind,
    });
    await sleep(gap);
  }
  const waitFrom = Date.now();
  while (!d.settled() && Date.now() - waitFrom < 12000) await sleep(200);
  return {
    outcome: d.outcome || d.verdict() || "none", killOn: d.killOn, ults, stalled,
    mends: d.mendsUsed, mendGiven: +d.mendGiven.toFixed(4),
    moves: d.movesPlayed, hp: +d.bossHp.toFixed(4), alive: s.heroRow.aliveCount(),
    low: party().low, party: party().sum, secs: +(d.elapsed() - t0).toFixed(2), log,
  };
}; true`);

const played = [];
for (let i = 0; i < runs; i++) {
  if (i > 0) {
    await evaluate("__SIEGE__.restart(); true");
    await new Promise((r) => setTimeout(r, 1600));
  }
  if (!(await tapToStart())) {
    process.stdout.write(`run ${i}  the fight never started\n`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 1200));
  const r = await evaluate(`__bot(${gap}, ${useUlts})`);
  if (r.error) {
    process.stdout.write(`run ${i}  ERROR ${r.error.slice(0, 160)}\n`);
    continue;
  }
  played.push(r.value);
  const v = r.value;
  process.stdout.write(
    `run ${i}  ${String(v.outcome).padEnd(8)} ${String(v.moves).padStart(2)}/${v.killOn} moves  ` +
      `${String(v.secs).padStart(6)}s  boss ${v.hp.toFixed(3)}  heroes ${v.alive}/6  ` +
      `party ${v.party.toFixed(2)} weakest ${v.low.toFixed(2)}  ` +
      `ults ${v.ults}  mends ${v.mends} (+${v.mendGiven.toFixed(3)})  stalls ${v.stalled}\n`,
  );
}

if (played.length) {
  const mean = (pick) =>
    played.reduce((a, r) => a + pick(r), 0) / played.length;
  const wins = played.filter((r) => r.outcome === "victory").length;
  const tally = () => {
    const bag = { swap: [], ult: [] };
    played.forEach((r) => {
      let prev = 1;
      let seen = 0;
      let owner = null;
      r.log.forEach((e) => {
        if (e.kind === "ult") owner = "ult";
        else if (e.moves > seen) owner = "swap";
        seen = e.moves;
        const drop = prev - e.hp;
        prev = e.hp;
        if (owner && drop > 0) {
          const list = bag[owner];
          if (
            e.kind === "ult" ||
            (owner === "swap" && e.kind === "swap" && drop > 0)
          )
            list.push(drop);
          else if (list.length) list[list.length - 1] += drop;
        }
      });
    });
    const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
    return { swap: avg(bag.swap), ult: avg(bag.ult), ults: bag.ult.length };
  };
  const took = tally();
  const swapBite = took.swap;
  const ultBite = took.ult;
  const hurt = played.filter((r) => r.alive < 6).length;
  const floored = played.filter((r) =>
    r.log.some((e) => e.pace <= 0.13),
  ).length;
  process.stdout.write(
    `\n${played.length} runs  ${wins} won  ${hurt} lost a hero  ` +
      `${floored} hit the pace floor\n` +
      `mean ${mean((r) => r.moves).toFixed(1)} moves  ` +
      `${mean((r) => r.secs).toFixed(1)}s  ` +
      `${mean((r) => r.ults).toFixed(1)} ults  ` +
      `${mean((r) => r.alive).toFixed(1)} heroes standing\n` +
      `party ends at ${mean((r) => r.party).toFixed(2)}, ` +
      `weakest hero at ${mean((r) => r.low).toFixed(2)}\n` +
      `a match takes ${(swapBite * 100).toFixed(1)}% off the boss, ` +
      `an ultimate ${(ultBite * 100).toFixed(1)}%` +
      `${swapBite > 0 ? ` — ${(ultBite / swapBite).toFixed(2)}x a match` : ""}\n`,
  );
}

if (outPath)
  writeFileSync(
    resolve(outPath),
    JSON.stringify({ gap, useUlts, runs: played }, null, 1),
  );
thrown
  .slice(-4)
  .forEach((l) => process.stdout.write(`page: ${String(l).slice(0, 160)}\n`));

ws.close();
chrome.kill();
server.close();
process.exit(0);
