import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const file = resolve(join(ROOT, "dist/km3.html"));
if (!existsSync(file)) {
  process.stderr.write("run npm run build first\n");
  process.exit(1);
}

const PORT = 8147;
const DEBUG = 9347;

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
].find((p) => existsSync(p));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "aud-"))}`,
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
    timeout: 300000,
  });
  if (r.result?.exceptionDetails) {
    return { error: r.result.exceptionDetails.exception?.description };
  }
  return { value: r.result?.result?.value };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");

const HOOK = `
(() => {
  const L = { starts: [], targets: [] };
  window.__AUD = L;
  const t0 = performance.now();
  const BS = AudioBufferSourceNode.prototype;
  const realStart = BS.start;
  BS.start = function (when, offset, duration) {
    try {
      L.starts.push({
        t: +(performance.now() - t0).toFixed(0),
        dur: this.buffer ? +this.buffer.duration.toFixed(3) : -1,
        off: offset === undefined ? -1 : +offset.toFixed(4),
        len: duration === undefined ? -1 : +duration.toFixed(4),
        loop: !!this.loop,
      });
    } catch (e) {}
    return realStart.apply(this, arguments);
  };
  const realTarget = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (target, when, tc) {
    try {
      L.targets.push({
        t: +(performance.now() - t0).toFixed(0),
        v: +Number(target).toFixed(5),
        tc: +Number(tc).toFixed(3),
      });
    } catch (e) {}
    return realTarget.apply(this, arguments);
  };
  L.mark = (name) => L.starts.push({ t: +(performance.now() - t0).toFixed(0), mark: name });
})();
`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 932,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if ((await evaluate("!!window.__SIEGE__")).value) break;
  await sleep(200);
}

const tap = async (x = 215, y = 800) => {
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await sleep(60);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

await tap();
for (let i = 0; i < 50; i++) {
  if (
    (await evaluate("!!(__SIEGE__.director && __SIEGE__.director.fightStart)"))
      .value
  )
    break;
  await sleep(200);
}

const mark = (label) => evaluate(`__AUD.mark(${JSON.stringify(label)})`);

await evaluate(`window.__play = async (gap) => {
  const s = window.__SIEGE__;
  const d = s.director;
  const b = s.board;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let guard = 0;
  let stalled = 0;
  while (!d.settled() && guard++ < 200) {
    await b.whenQuiet();
    if (d.settled()) break;
    let fired = false;
    for (let i = 0; i < 6; i++) {
      if (d.canUlt && d.canUlt(i)) { d.onCardTap(i); fired = true; break; }
    }
    if (!fired) {
      const best = b.findBestSwap();
      if (!best) { stalled++; await sleep(gap); if (stalled > 8) break; continue; }
      b.autoPlay(best);
    }
    await sleep(80);
    await b.whenQuiet();
    await sleep(gap);
  }
  const from = Date.now();
  while (!d.settled() && Date.now() - from < 12000) await sleep(200);
  return d.outcome || (d.verdict && d.verdict()) || "none";
}; true`);

for (let run = 0; run < 2; run++) {
  if (run > 0) {
    await mark(`restart ${run}`);
    await evaluate("__SIEGE__.restart(); true");
    await sleep(1600);
    await tap();
    for (let i = 0; i < 50; i++) {
      if (
        (
          await evaluate(
            "!!(__SIEGE__.director && __SIEGE__.director.fightStart)",
          )
        ).value
      )
        break;
      await sleep(200);
    }
    await sleep(1200);
  }
  await mark(`run ${run}`);
  const r = await evaluate("__play(900)");
  await mark(`settled ${run} -> ${r.value || r.error}`);
  await sleep(2500);
  await mark(`dismiss ${run}`);
  for (let i = 0; i < 4; i++) {
    await tap(215, 700);
    await sleep(1400);
  }
  await sleep(4000);
}

await mark("end");

const out = (await evaluate("JSON.stringify(window.__AUD)")).value;
console.log(out);
if (thrown.length) console.error("THROWN " + thrown.join(" | "));
ws.close();
chrome.kill();
server.close();
process.exit(0);
