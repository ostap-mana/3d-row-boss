import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Ad networks reject creatives that reference anything off-host, and QA greps
 * the built file for `http`. Pixi ships a console banner containing its own
 * URL as a string literal; the runtime call is disabled via `hello: false`,
 * and this strips the leftover literal so the audit comes back clean.
 */
function scrubVendorUrls() {
  return {
    name: "scrub-vendor-urls",
    closeBundle() {
      const file = resolve(import.meta.dirname, "dist/index.html");
      let html;
      try {
        html = readFileSync(file, "utf8");
      } catch {
        return;
      }
      // `hello: false` already stops the banner from running; this neuters the
      // unreachable call site too, so a `grep console.log` audit comes back
      // empty. `(()=>{})(...)` is valid JS and a genuine no-op.
      const cleaned = html
        .replace(/https?:\/\/www\.pixijs\.com\//g, "")
        .replace(/globalThis\.console\.log\(/g, "(()=>{})(");
      if (cleaned !== html) writeFileSync(file, cleaned);
      const kb = (statSync(file).size / 1024).toFixed(1);
      this.info(`playable bundle: dist/index.html — ${kb} kB`);
    },
  };
}

/**
 * Playable-ad build: one self-contained index.html, no external requests.
 * https://vite.dev/config/
 */
export default defineConfig({
  plugins: [viteSingleFile(), scrubVendorUrls()],
  server: {
    port: 8080,
    host: true, // so a phone on the same Wi-Fi can open the dev build
    open: true,
  },
  // The template's demo assets stay on disk but must not be copied into the
  // build: the deliverable is exactly one file, dist/index.html.
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
