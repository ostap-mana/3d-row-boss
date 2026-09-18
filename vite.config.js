import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const DELIVERABLE = "km3.html";

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
      writeFileSync(file, cleaned);
      writeFileSync(emitted, cleaned);
      const kb = (statSync(file).size / 1024).toFixed(1);
      this.info(`playable bundle: dist/${DELIVERABLE} — ${kb} kB`);
      this.info(`web root copy:   dist/index.html — same bytes`);
    },
  };
}

export default defineConfig({
  plugins: [viteSingleFile(), scrubVendorUrls()],
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
