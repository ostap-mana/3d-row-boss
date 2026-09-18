import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";

const USAGE = `
clip-perf — measure what the outcome clip costs while it plays.

  node tools/clip-perf.mjs [options]

  The endcard figure is a 512x1024 h264 stack decoded into a pixi VideoSource
  and drawn through a mesh shader. Two things can make it stutter and they
  need separating: how hard the frame is to decode, and how often the frame is
  pushed to the GPU. This drives the real creative to its outcome card and
  samples requestAnimationFrame while the clip runs, so the number is the one
  the player actually sees.

  --side <which>  victory or defeat. Default victory. Neither is forced onto
                  the screen: victory is played out with the board's own
                  findBestSwap, defeat is what you get by letting the doom
                  clock run down, so the card is measured with the fight
                  already over, the way a player meets it. Forcing
                  outcome.show() mid-fight leaves the whole fight running
                  underneath and charges its cost to the clip — it read as
                  51 janks where the real card has 5. Allow 20-40s of play
                  before sampling starts.
  --ms <n>        how long to sample once the clip is playing. Default 2500.
  --file <path>   the creative to measure. Default dist/km4.html.
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
const file = resolve(flag("file", join(ROOT, "dist/km4.html")));
const side = flag("side", "victory");
const sampleMs = Number(flag("ms", 2500));
if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}\nrun npm run build first\n`);
  process.exit(1);
}

const html = readFileSync(file);
const PORT = 8731 + Math.floor(Math.random() * 200);
const DEBUG = 9731 + Math.floor(Math.random() * 200);
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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "clipperf-"))}`,
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

await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 932,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if (await evaluate("!!window.__SIEGE__")) break;
  await new Promise((r) => setTimeout(r, 200));
}

await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 215, y: 466 }],
});
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

for (let i = 0; i < 120; i++) {
  const ready = await evaluate(
    `!!(window.__SIEGE__ && window.__SIEGE__.outcome)`,
  );
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}

const report = await evaluate(`(async () => {
  const scene = window.__SIEGE__;
  const seen = new Set();
  const hunt = (node, depth) => {
    if (!node || depth > 8 || seen.has(node)) return null;
    seen.add(node);
    if (node.video && typeof node.video.play === "function") return node.video;
    for (const k of ["figure", "clip", "mesh", "view"]) {
      const hit = hunt(node[k], depth + 1);
      if (hit) return hit;
    }
    for (const kid of node.children || []) {
      const hit = hunt(kid, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = scene.director;
  const b = scene.board;
  if (${JSON.stringify(side)} === "victory") {
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
        if (!best) { stalled++; await sleep(300); if (stalled > 8) break; continue; }
        b.autoPlay(best);
      }
      await sleep(80);
      await b.whenQuiet();
      await sleep(340);
    }
  }
  let arrived = false;
  for (let i = 0; i < 400; i++) {
    if (scene.outcome.visible) { arrived = true; break; }
    await sleep(250);
  }
  if (!arrived) return { arrived: false };
  await sleep(600);
  const reached = scene.outcome.defeat ? "defeat" : "victory";
  const live = hunt(scene.outcome, 0);
  const diag = {
    figureVisible: !!(scene.outcome.figure && scene.outcome.figure.visible),
    hasClip: !!(scene.outcome.figure && scene.outcome.figure.clip),
    clipCtor: scene.outcome.figure && scene.outcome.figure.clip
      ? scene.outcome.figure.clip.constructor.name : null,
  };
  const frames = [];
  let last = performance.now();
  const t0 = last;
  await new Promise((done) => {
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      if (now - t0 < ${sampleMs}) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  frames.shift();
  const sorted = frames.slice().sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const q = live && live.getVideoPlaybackQuality ? live.getVideoPlaybackQuality() : null;
  return {
    arrived: true,
    reached,
    frames: frames.length,
    fps: +(1000 / mean).toFixed(1),
    meanMs: +mean.toFixed(2),
    p50: +pick(0.5).toFixed(2),
    p95: +pick(0.95).toFixed(2),
    worst: +sorted[sorted.length - 1].toFixed(2),
    janks: frames.filter((f) => f > 24).length,
    videoW: live ? live.videoWidth : null,
    videoH: live ? live.videoHeight : null,
    decoded: q ? q.totalVideoFrames : null,
    dropped: q ? q.droppedVideoFrames : null,
    diag,
  };
})()`);

if (!report.arrived) {
  process.stderr.write(`the ${side} card never came up
`);
  ws.close();
  chrome.kill();
  server.close();
  process.exit(1);
}

if (report.reached !== side) {
  process.stdout.write(
    `asked for ${side}, the run ended in ${report.reached} — measuring that instead
`,
  );
}

process.stdout.write(
  `${report.reached}  ${report.videoW}x${report.videoH}\n` +
    `  ${report.fps} fps over ${report.frames} frames  mean ${report.meanMs}ms\n` +
    `  p50 ${report.p50}ms  p95 ${report.p95}ms  worst ${report.worst}ms\n` +
    `  janks over 24ms: ${report.janks}\n` +
    `  video frames decoded ${report.decoded}, dropped ${report.dropped}\n`,
);

ws.close();
chrome.kill();
server.close();
