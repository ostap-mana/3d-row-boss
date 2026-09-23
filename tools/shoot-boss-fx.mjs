import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";

const USAGE = `
shoot-boss-fx — photograph every boss beat where it actually lands.

  node tools/shoot-boss-fx.mjs [--beats volley,smash,bolt,boulder,rider,tide,fissure,doom,roar]
                               [--out <dir>] [--shots 6] [--rate 0.35]
                               [--file dist/km5.html]

  A plate that survives its contact sheet can still vanish on the board: the
  vfx field sits under the boss and under the gems. This drives the built
  creative in a phone viewport, slows the world down, fires one beat at a time
  and saves plain screenshots of each.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const file = resolve(flag("file", join(ROOT, "dist/km5.html")));
const outDir = resolve(flag("out", join(ROOT, "masters/fx/boss-shots")));
const shots = Number(flag("shots", 6));
const rate = Number(flag("rate", 0.35));
const beats = flag("beats", "volley,smash,fissure,doom,roar").split(",");
const gap = Number(flag("gap", 400));

if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}\nrun npm run build first\n`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const html = readFileSync(file);
const PORT = 8931 + Math.floor(Math.random() * 200);
const DEBUG = 9931 + Math.floor(Math.random() * 200);
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
}).listen(PORT);

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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "bossfx-"))}`,
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page = null;
for (let i = 0; i < 120 && !page; i++) {
  try {
    const list = await (
      await fetch(`http://127.0.0.1:${DEBUG}/json/list`)
    ).json();
    page = list.find((t) => t.type === "page");
  } catch {}
  if (!page) await sleep(200);
}
if (!page) {
  process.stderr.write("chrome never answered\n");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
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
    timeout: 120000,
  });
  return r.result?.result?.value;
};
const shoot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  const data = r.result?.data;
  if (!data) return false;
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return true;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 932,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if (await evaluate("!!window.__SIEGE__")) break;
  await sleep(200);
}

await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 215, y: 466 }],
});
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

for (let i = 0; i < 200; i++) {
  const ready = await evaluate(
    "!!(window.__SIEGE__ && window.__SIEGE__.director && window.__SIEGE__.states)",
  );
  if (ready) break;
  await sleep(200);
}

await sleep(9000);
await evaluate(`(() => {
  const s = window.__SIEGE__;
  s.states.halt({ freeze: false });
  s.states.rate(${rate});
  return true;
})()`);
await sleep(600);

const STATE = {
  volley: "boss.volley",
  smash: "boss.smash",
  bolt: "boss.bolt",
  boulder: "boss.boulder",
  rider: "boss.rider",
  tide: "boss.tide",
  fissure: "boss.fissure",
  doom: "boss.doom",
  roar: "boss.doom",
};

const TURN = { fissure: 3, bolt: 2, boulder: 3, rider: 4, tide: 5 };

const PLATES = args.includes("--plates");

for (const beat of beats) {
  if (PLATES) {
    await evaluate(`(() => {
      const s = window.__SIEGE__;
      s.states.halt({ freeze: false });
      s.states.rate(${rate});
      s.director.bossPlate("${beat}");
      return true;
    })()`);
    for (let i = 0; i < shots; i++) {
      await sleep(gap);
      await shoot(`${beat}-${String(i + 1).padStart(2, "0")}`);
    }
    console.log(`plate ${beat}  ${shots} frames`);
    await sleep(700);
    continue;
  }

  const state = STATE[beat];
  if (!state) {
    console.log(`skip ${beat}: no state for it`);
    continue;
  }
  await evaluate(`(() => {
    const s = window.__SIEGE__;
    s.states.rate(${rate});
    s.director.turn = ${TURN[beat] || 0};
    s.states.run("${state}");
    return true;
  })()`);

  for (let i = 0; i < shots; i++) {
    await sleep(gap);
    await shoot(`${beat}-${String(i + 1).padStart(2, "0")}`);
  }
  console.log(`shot ${beat}  ${shots} frames`);
  await sleep(1200);
  await evaluate(`window.__SIEGE__.states.halt({ freeze: false })`);
  await sleep(400);
}

ws.close();
chrome.kill();
server.close();
console.log(`\nshots in ${outDir}`);
process.exit(0);
