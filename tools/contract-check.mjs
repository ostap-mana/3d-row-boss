import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
contract-check — rehearse the PlayLab gate against the built file.

  node tools/contract-check.mjs [--file dist/km4.html]

  Loads the creative the way a wrapper does: subscribes through the bus before
  anything starts, drives start, pause, resume and setAudio, replaces openStore
  the way every network wrapper does, taps the rectangles the game reports, and
  presses the state keys the passport promises. Prints what the gate looks at —
  the funnel, the store route, the replay level, every request that tried to
  leave the file, and every error thrown.
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(ROOT, flag("file", "dist/km4.html"));
if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}\nrun npm run build first\n`);
  process.exit(1);
}

const PORT = 8143;
const DEBUG = 9343;
const html = readFileSync(file);
const served = [];

const server = createServer((req, res) => {
  served.push(req.url);
  if (req.url !== "/") {
    res.writeHead(404);
    res.end("");
    return;
  }
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "gate-"))}`,
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
  } catch {
    page = null;
  }
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
const requested = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    thrown.push(d.exception ? d.exception.description : d.text);
  }
  if (msg.method === "Network.requestWillBeSent") {
    requested.push(msg.params.request.url);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const value = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60000,
  });
  return r.result && r.result.result ? r.result.result.value : undefined;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 932,
  deviceScaleFactor: 2,
  mobile: true,
});

await send("Page.addScriptToEvaluateOnNewDocument", {
  source: [
    "window.__SEED = 123456789;",
    "window.__gate = { events: [], store: 0, steps: 0, subscribed: false, methods: [] };",
    "window.playdata = { step: function (dt) { window.__gate.steps++; return dt; } };",
    "(function poll() {",
    "  if (window.__PLAYABLE && !window.__gate.subscribed) {",
    "    window.__gate.subscribed = true;",
    "    window.__gate.methods = Object.keys(window.__PLAYABLE);",
    "    window.__PLAYABLE.on(function (name, data) {",
    "      window.__gate.events.push({ name: name, data: data || null });",
    "    });",
    "    window.__PLAYABLE.openStore = function () { window.__gate.store++; };",
    "    return;",
    "  }",
    "  setTimeout(poll, 5);",
    "}());",
  ].join("\n"),
});

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if (await value("!!window.__SIEGE__")) break;
  await wait(200);
}

const names =
  "JSON.stringify(window.__gate.events.map(function(e){return e.name}))";
const rects = "JSON.stringify(window.__PLAYABLE.ctaRects())";

const report = {};
report.bus = await value(
  "typeof window.__PLAYABLE === 'object' && typeof window.__PLAYABLE.on === 'function'",
);
report.methods = await value("JSON.stringify(window.__gate.methods)");
report.early = await value(
  "window.__gate.subscribed === true && window.__gate.events.length === 0",
);

await value("window.__PLAYABLE.start(); true");
await wait(1200);
report.afterStart = await value(names);

await value("window.__PLAYABLE.pause(); true");
report.paused = await value("__SIEGE__.app.ticker.started === false");
await value("window.__PLAYABLE.resume(); true");
report.resumed = await value("__SIEGE__.app.ticker.started === true");
await value(
  "window.__PLAYABLE.setAudio(false); window.__PLAYABLE.setAudio(true); true",
);

report.seed = await value("window.__SEED === 123456789");
report.state = await value(
  "JSON.stringify(typeof window.__STATE === 'function' ? window.__STATE() : null)",
);

await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 215, y: 800 }],
});
await wait(60);
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(2500);

report.steps = await value("window.__gate.steps > 0");

for (let i = 0; i < 60; i++) {
  const seen = JSON.parse((await value(rects)) || "[]");
  if (seen.some((r) => r.name === "store")) break;
  await wait(500);
}
report.playRects = await value(rects);

async function tapRect(name) {
  const list = JSON.parse((await value(rects)) || "[]");
  const r = list.find((e) => e.name === name);
  if (!r) return false;
  const point = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await wait(60);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(600);
  return true;
}

async function key(code, vk) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    code,
    key: code.slice(3).toLowerCase(),
    windowsVirtualKeyCode: vk,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    code,
    key: code.slice(3).toLowerCase(),
    windowsVirtualKeyCode: vk,
  });
}

await value(`(async function () {
  var b = __SIEGE__.board;
  for (var i = 0; i < 4; i++) {
    await b.whenQuiet();
    var best = b.findBestSwap();
    if (!best) break;
    b.autoPlay(best);
    await new Promise(function (r) { setTimeout(r, 900); });
  }
  return true;
}())`);
report.progressSeen = await value(
  "JSON.stringify(window.__gate.events.filter(function(e){return e.name==='progress'}).map(function(e){return e.data && e.data.value}))",
);

report.tappedHud = await tapRect("store");
report.storeAfterHud = await value("window.__gate.store");

await key("KeyV", 86);
await wait(4000);
report.afterVictory = await value(names);
report.endRects = await value(rects);

const endName = JSON.parse(report.endRects || "[]").some(
  (r) => r.name === "store-endcard",
)
  ? "store-endcard"
  : "store-outcome";
report.tappedEnd = await tapRect(endName);
report.storeTotal = await value("window.__gate.store");

await key("KeyR", 82);
await wait(2500);
await key("KeyD", 68);
await wait(3000);
report.afterRestart = await value(names);

const inline = (u) => u.startsWith("data:") || u.startsWith("blob:");
const outbound = requested.filter(
  (u) => !u.startsWith(`http://127.0.0.1:${PORT}/`) && !inline(u),
);
const extra = served.filter((u) => u !== "/");
const emits = JSON.parse(
  (await value(
    "JSON.stringify(window.__CREATIVE ? window.__CREATIVE.emits : [])",
  )) || "[]",
);
const fired = [...new Set(JSON.parse(report.afterRestart || "[]"))];
const undeclared = fired.filter((n) => !emits.includes(n));
const missing = emits.filter((n) => !fired.includes(n));

const lines = [
  ["bus present, on() callable", report.bus],
  ["subscribed before the first event", report.early],
  ["methods on the object", report.methods],
  ["events after start()", report.afterStart],
  ["pause stops the ticker", report.paused],
  ["resume restarts it", report.resumed],
  ["seed taken from window.__SEED", report.seed],
  ["playdata.step called", report.steps],
  ["__STATE()", report.state],
  ["ctaRects during play", report.playRects],
  ["progress values seen", report.progressSeen],
  ["hud store rect tapped", report.tappedHud],
  ["openStore after that tap", report.storeAfterHud],
  ["events after KeyV", report.afterVictory],
  ["ctaRects on the end screen", report.endRects],
  [`${endName} tapped`, report.tappedEnd],
  ["openStore calls total", report.storeTotal],
  ["events after KeyR", report.afterRestart],
  [
    "emitted but not declared",
    undeclared.length ? undeclared.join(", ") : "none",
  ],
  ["declared but never emitted", missing.length ? missing.join(", ") : "none"],
  [
    "requests that left the file",
    outbound.length ? outbound.join(", ") : "none",
  ],
  [
    "same-origin requests besides the page",
    extra.length ? extra.join(", ") : "none",
  ],
  ["errors thrown", thrown.length ? thrown.join(" | ") : "none"],
];

const clip = (v) => {
  const text = v === undefined ? "undefined" : String(v);
  return text.length > 240
    ? `${text.slice(0, 240)}… (${text.length} chars)`
    : text;
};

for (const [label, v] of lines) {
  process.stdout.write(`${String(label).padEnd(38)} ${clip(v)}\n`);
}

ws.close();
chrome.kill();
server.close();
process.exit(0);
