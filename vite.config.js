import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const DELIVERABLE = "km3.html";

const EMITS = [
  "displayed",
  "started",
  "progress",
  "failed",
  "retry",
  "solved",
  "endcard",
  "cta",
];

function short(text, n) {
  return createHash("sha256").update(text).digest("hex").slice(0, n);
}

function storeUrls() {
  const config = readFileSync(
    resolve(import.meta.dirname, "src/config.js"),
    "utf8",
  );
  const block = config.match(/STORE_URL\s*=\s*\{([\s\S]*?)\}/);
  const pick = (key) => {
    const m =
      block && block[1].match(new RegExp(`${key}:\\s*\\n?\\s*"([^"]+)"`));
    return m ? m[1] : "";
  };
  return { ios: pick("ios"), android: pick("android") };
}

function passport() {
  return {
    id: "elemental-siege",
    title: "Elemental Siege",
    orientation: "portrait",
    emits: EMITS,
    hooks: {
      start: "sdk|auto",
      seed: "__SEED",
      step: "playdata.step",
      state: "__STATE",
      states: { victory: "KeyV", defeat: "KeyD", restart: "KeyR" },
    },
    cta: {
      ...storeUrls(),
      targets: [
        { where: "started", rect: "store" },
        { where: "solved", rect: "store-outcome" },
        { where: "endcard", rect: "store-endcard" },
      ],
    },
  };
}

function commit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "nogit";
  }
}

function stampInto(html, at) {
  const tuneHash = short(
    readFileSync(resolve(import.meta.dirname, "src/config.js"), "utf8"),
    4,
  );
  const creative = `window.__CREATIVE=${JSON.stringify(passport())};`;
  const withPassport = html.replace(
    /window\.__CREATIVE=\{[\s\S]*?\};/,
    creative,
  );
  const neutral = withPassport.replace(
    /window\.__BUILD=\{[\s\S]*?\};/,
    "window.__BUILD=PENDING;",
  );
  const build = {
    buildId: short(neutral, 12),
    commit: commit(),
    tuneHash,
    at,
  };
  return {
    html: neutral.replace(
      "window.__BUILD=PENDING;",
      `window.__BUILD=${JSON.stringify(build)};`,
    ),
    build,
  };
}

function scrubVendorUrls() {
  return {
    name: "scrub-vendor-urls",
    closeBundle() {
      const emitted = resolve(import.meta.dirname, "dist/index.html");
      const file = resolve(import.meta.dirname, "dist", DELIVERABLE);
      let html;
      try {
        html = readFileSync(emitted, "utf8");
      } catch {
        return;
      }
      const cleaned = html
        .replace(/https?:\/\/www\.pixijs\.com\//g, "")
        .replace(/globalThis\.console\.log\(/g, "(()=>{})(");
      const stamped = stampInto(cleaned, new Date().toISOString());
      writeFileSync(file, stamped.html);
      writeFileSync(emitted, stamped.html);
      const kb = (statSync(file).size / 1024).toFixed(1);
      this.info(`playable bundle: dist/${DELIVERABLE} — ${kb} kB`);
      this.info(`web root copy:   dist/index.html — same bytes`);
      this.info(
        `build stamp: ${stamped.build.buildId} · ${stamped.build.commit} · tune ${stamped.build.tuneHash}`,
      );
    },
  };
}

const PIXI_LIB = resolve(import.meta.dirname, "node_modules/pixi.js/lib");

export default defineConfig({
  plugins: [viteSingleFile(), scrubVendorUrls()],
  resolve: {
    alias: [
      { find: /^pixi-lib\/(.*)$/, replacement: `${PIXI_LIB}/$1` },
      {
        find: /^pixi\.js$/,
        replacement: resolve(import.meta.dirname, "src/core/pixi-lite.js"),
      },
      {
        find: /^\.\.\/rendering\/renderers\/autoDetectRenderer\.mjs$/,
        replacement: resolve(import.meta.dirname, "src/core/webgl-only.js"),
      },
    ],
  },
  server: {
    port: 8080,
    host: true,
    open: true,
  },
  publicDir: false,
  build: {
    target: "es2017",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    minify: "terser",
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 3 },
    },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 8000,
  },
});
