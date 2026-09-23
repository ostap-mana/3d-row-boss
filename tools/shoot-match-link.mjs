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
shoot-match-link — photograph the opening hint while the coach runs it.

  node tools/shoot-match-link.mjs [--out <dir>] [--shots 16] [--gap 350]
                                  [--rate 1] [--file dist/km5.html]

  Drives the built creative in a phone viewport, taps the start prompt and
  then takes plain screenshots while the coach shows the first swap: the
  rings on the matching gems, the beam joining them, the hand sliding one gem
  across. --rate slows the world so a single phase can be caught mid-way.
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
const file = resolve(flag("file", join(ROOT, "dist/km5.html")));
if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}\nrun npm run build first\n`);
  process.exit(1);
}
const outDir = resolve(flag("out", join(ROOT, "masters/hint/link-shots")));
const shots = Number(flag("shots", 16));
const gap = Number(flag("gap", 350));
const rate = Number(flag("rate", 1));
mkdirSync(outDir, { recursive: true });

const PORT = 8137;
const DEBUG = 9337;
const html = readFileSync(file);

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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "linkfx-"))}`,
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

for (let i = 0; i < 100; i++) {
  const live = await evaluate(
    "!!(window.__SIEGE__.coach && window.__SIEGE__.coach.visible && window.__SIEGE__.coach.alpha > 0.5)",
  );
  if (live) break;
  await sleep(100);
}
if (rate !== 1) await evaluate(`window.__SIEGE__.states.rate(${rate})`);

const BURST = 4;
let taken = 0;
for (let burst = 0; taken < shots && burst < shots; burst++) {
  for (let i = 0; i < 60; i++) {
    const bright = await evaluate(
      "!!(window.__SIEGE__.coach.visible && window.__SIEGE__.coach.alpha > 0.95)",
    );
    if (bright) break;
    await sleep(100);
  }
  for (let i = 0; i < BURST && taken < shots; i++) {
    taken++;
    await shoot(`link-${String(taken).padStart(2, "0")}`);
    await sleep(gap);
  }
}

const report = await evaluate(`(() => {
  const c = window.__SIEGE__.coach;
  const link = c && c.link;
  if (!link) return "no link";
  return JSON.stringify({
    rings: link.rings.length,
    beams: link.beams.length,
    ringSide: link.rings[0] ? Math.round(link.rings[0].side) : 0,
    beamHeight: link.beams[0] ? Math.round(link.beams[0].height) : 0,
    alpha: c.alpha,
  });
})()`);
console.log(`coach: ${report}`);

ws.close();
chrome.kill();
server.close();
console.log(`${shots} shots in ${outDir}`);
process.exit(0);
