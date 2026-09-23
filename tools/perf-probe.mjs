import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";

const USAGE = `
perf-probe — measure what a frame costs in the built creative.

  node tools/perf-probe.mjs [options]

  Drives the creative in headless Chrome on the real GPU at phone size and
  pixel density, plays it with the board's own findBestSwap, and samples
  requestAnimationFrame while counting WebGL calls per frame: draw calls,
  texture uploads, program switches. A CPU profile runs over the same window
  and is printed as self and inclusive time per function, so a hot update()
  or a text that re-rasterises every frame shows up by name. Build with
  "npx vite build --minify false --outDir dist-prof" first if you want
  readable names; the shipped bundle works too, just mangled.

  --file <path>   the creative to measure. Default dist/km3.html.
  --ms <n>        how long to sample the fight. Default 15000.
  --gap <ms>      pause between bot moves. Default 1200.
  --w/--h/--dpr   the emulated phone. Default 390x844 at 3.
  --idle          only measure the start screen.
  --nobot         sample the fight without playing.
  --profile <p>   also write the raw .cpuprofile JSON here.
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
const file = resolve(flag("file", join(ROOT, "dist/km3.html")));
const sampleMs = Number(flag("ms", 15000));
const gap = Number(flag("gap", 1200));
const dpr = Number(flag("dpr", 3));
const W = Number(flag("w", 390));
const H = Number(flag("h", 844));
const profileOut = flag("profile", null);
const idleOnly = args.includes("--idle");
const noBot = args.includes("--nobot");

if (!existsSync(file)) {
  process.stderr.write(`no such file: ${file}
run npm run build first
`);
  process.exit(1);
}
const html = readFileSync(file);
const PORT = 8600 + Math.floor(Math.random() * 300);
const DEBUG = 9600 + Math.floor(Math.random() * 300);
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(PORT, "127.0.0.1");

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
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "perf-"))}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    `--window-size=${W},${H}`,
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
const consoleLines = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled") {
    consoleLines.push(
      m.params.args.map((a) => a.value ?? a.description).join(" "),
    );
  }
  if (m.method === "Runtime.exceptionThrown") {
    consoleLines.push(
      "EXC " +
        (m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text),
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
    timeout: 240000,
  });
  if (r.result?.exceptionDetails) {
    return {
      error:
        r.result.exceptionDetails.exception?.description ||
        r.result.exceptionDetails.text,
    };
  }
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const C = { draws: 0, uploads: 0, uploadBytes: 0, programs: 0, fbos: 0, bufferData: 0, bufferBytes: 0, texBinds: 0, clears: 0 };
    window.__GL = C;
    const P = WebGL2RenderingContext.prototype;
    const wrap = (name, fn) => { const o = P[name]; if (!o) return; P[name] = function (...a) { fn(a); return o.apply(this, a); }; };
    wrap("drawElements", () => C.draws++);
    wrap("drawArrays", () => C.draws++);
    wrap("drawElementsInstanced", () => C.draws++);
    wrap("drawArraysInstanced", () => C.draws++);
    wrap("texImage2D", (a) => { C.uploads++; const s = a[a.length - 1]; if (s && s.width) C.uploadBytes += s.width * s.height * 4; else if (typeof a[3] === "number" && typeof a[4] === "number" && a.length > 6) C.uploadBytes += a[3] * a[4] * 4; });
    wrap("texSubImage2D", (a) => { C.uploads++; const s = a[a.length - 1]; if (s && s.width) C.uploadBytes += s.width * s.height * 4; else if (typeof a[4] === "number" && typeof a[5] === "number" && a.length > 7) C.uploadBytes += a[4] * a[5] * 4; });
    wrap("useProgram", () => C.programs++);
    wrap("bindFramebuffer", () => C.fbos++);
    wrap("bindTexture", () => C.texBinds++);
    wrap("clear", () => C.clears++);
    wrap("bufferData", (a) => { C.bufferData++; const d = a[1]; if (d && d.byteLength) C.bufferBytes += d.byteLength; else if (typeof d === "number") C.bufferBytes += d; });
    wrap("bufferSubData", (a) => { C.bufferData++; const d = a[2]; if (d && d.byteLength) C.bufferBytes += d.byteLength; });
    window.__snapGL = () => ({ ...C });
  })();`,
});
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: H,
  deviceScaleFactor: dpr,
  mobile: true,
});
await send("Performance.enable");
const navStart = Date.now();
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 250; i++) {
  if (await evaluate("!!window.__SIEGE__")) break;
  await sleep(100);
}
const bootMs = Date.now() - navStart;
await sleep(1500);
const boot = await evaluate(
  `JSON.stringify({ timing: __SIEGE__.timing, res: __SIEGE__.app.renderer.resolution, w: __SIEGE__.app.renderer.width, h: __SIEGE__.app.renderer.height, dpr: devicePixelRatio, ua: navigator.userAgent.slice(0,60) })`,
);

const SAMPLER = `(async (ms, gap, bot) => {
  const scene = window.__SIEGE__;
  const d = scene.director;
  const b = scene.board;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = [];
  const gl0 = window.__snapGL();
  const glPer = [];
  let lastGl = gl0;
  let last = performance.now();
  const t0 = last;
  let running = true;
  const sampling = new Promise((done) => {
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      const g = window.__snapGL();
      glPer.push(g.draws - lastGl.draws);
      lastGl = g;
      if (now - t0 < ms) requestAnimationFrame(tick);
      else { running = false; done(); }
    };
    requestAnimationFrame(tick);
  });
  let moves = 0, ults = 0;
  if (bot) {
    (async () => {
      let guard = 0;
      while (running && !d.settled() && guard++ < 400) {
        await b.whenQuiet();
        if (!running || d.settled()) break;
        let fired = false;
        for (let i = 0; i < 6; i++) {
          if (d.canUlt && d.canUlt(i)) { d.onCardTap(i); fired = true; ults++; break; }
        }
        if (!fired) {
          const best = b.findBestSwap();
          if (!best) { await sleep(300); continue; }
          b.autoPlay(best); moves++;
        }
        await sleep(gap);
      }
    })();
  }
  await sampling;
  const gl1 = window.__snapGL();
  frames.shift();
  const sorted = frames.slice().sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const n = frames.length;
  const per = (k) => +((gl1[k] - gl0[k]) / n).toFixed(1);
  const glSorted = glPer.slice().sort((a, b) => a - b);
  return {
    frames: n,
    fps: +(1000 / mean).toFixed(1),
    meanMs: +mean.toFixed(2),
    p50: +pick(0.5).toFixed(2),
    p90: +pick(0.9).toFixed(2),
    p95: +pick(0.95).toFixed(2),
    p99: +pick(0.99).toFixed(2),
    worst: +sorted[sorted.length - 1].toFixed(2),
    janks24: frames.filter((f) => f > 24).length,
    janks40: frames.filter((f) => f > 40).length,
    moves, ults,
    settled: d.settled(), outcome: d.outcome, ended: d.ended,
    gl: { draws: per("draws"), drawsMax: glSorted[glSorted.length - 1], drawsP50: glSorted[Math.floor(glSorted.length / 2)], uploads: per("uploads"), uploadKB: +((gl1.uploadBytes - gl0.uploadBytes) / n / 1024).toFixed(1), programs: per("programs"), fbos: per("fbos"), texBinds: per("texBinds"), bufferData: per("bufferData"), bufferKB: +((gl1.bufferBytes - gl0.bufferBytes) / n / 1024).toFixed(1), clears: per("clears") },
  };
})`;

const metrics = async () => {
  const r = await send("Performance.getMetrics");
  const o = {};
  for (const m of r.result.metrics) o[m.name] = m.value;
  return o;
};

const idle = await evaluate(`${SAMPLER}(3000, 0, false)`);

let play = null;
let profile = null;
if (!idleOnly) {
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: W / 2, y: H / 2 }],
  });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(1500);
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 250 });
  const m0 = await metrics();
  await send("Profiler.start");
  const wall0 = performance.now();
  play = await evaluate(`${SAMPLER}(${sampleMs}, ${gap}, ${!noBot})`);
  const wall = performance.now() - wall0;
  const prof = await send("Profiler.stop");
  const m1 = await metrics();
  play.mainThread = {
    wallMs: Math.round(wall),
    taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    styleMs: Math.round(
      (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000,
    ),
    jsHeapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
    nodes: m1.Nodes,
  };
  profile = prof.result.profile;
  if (profileOut) writeFileSync(profileOut, JSON.stringify(profile));
}

process.stdout.write(`boot ${bootMs}ms ${boot}\n`);
process.stdout.write(`idle ${JSON.stringify(idle)}\n`);
if (play) process.stdout.write(`play ${JSON.stringify(play)}\n`);

if (profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfCount = new Map();
  for (const s of profile.samples)
    selfCount.set(s, (selfCount.get(s) || 0) + 1);
  const total = profile.samples.length;
  const dur = (profile.endTime - profile.startTime) / 1000;
  const per = dur / total;
  const key = (n) => {
    const f = n.callFrame;
    const u = (f.url || "").split("/").pop();
    return `${f.functionName || "(anon)"} ${u}:${f.lineNumber + 1}`;
  };
  const bySelf = new Map();
  for (const [nid, c] of selfCount) {
    const k = key(nodes.get(nid));
    bySelf.set(k, (bySelf.get(k) || 0) + c);
  }
  const parent = new Map();
  for (const n of profile.nodes)
    for (const c of n.children || []) parent.set(c, n.id);
  const totalCount = new Map();
  for (const [nid, c] of selfCount) {
    const seen = new Set();
    let cur = nid;
    while (cur != null) {
      const k = key(nodes.get(cur));
      if (!seen.has(k)) {
        totalCount.set(k, (totalCount.get(k) || 0) + c);
        seen.add(k);
      }
      cur = parent.get(cur);
    }
  }
  const fmt = (c) =>
    `${((c / total) * 100).toFixed(1).padStart(5)}% ${(c * per).toFixed(0).padStart(6)}ms`;
  process.stdout.write(
    `\nprofile ${dur.toFixed(0)}ms, ${total} samples\n--- self ---\n`,
  );
  [...bySelf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .forEach(([k, c]) => process.stdout.write(`${fmt(c)}  ${k}\n`));
  process.stdout.write(`--- total (inclusive) ---\n`);
  [...totalCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .forEach(([k, c]) => process.stdout.write(`${fmt(c)}  ${k}\n`));
}
if (consoleLines.length)
  process.stdout.write(`\nconsole:\n${consoleLines.slice(0, 30).join("\n")}\n`);

ws.close();
chrome.kill();
server.close();
