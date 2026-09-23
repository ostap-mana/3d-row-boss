import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(ROOT, "video/masters/fx");

const FRAMES = join(
  process.env.COMFYUI_OUTPUT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/output",
  "heal",
);

const FPS = Number(process.env.HEAL_FPS || 16);

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

if (!existsSync(FRAMES)) {
  console.error(
    "no frames at " + FRAMES + " — run tools/gen-heal-fx.mjs first.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const named = args.filter((a) => !a.startsWith("--"));

const onDisk = readdirSync(FRAMES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((id) =>
    readdirSync(join(FRAMES, id)).some((f) => f.endsWith(".png")),
  );

const unknown = named.filter((n) => !onDisk.includes(n));
if (unknown.length) {
  console.error(
    "no frames for: " +
      unknown.join(", ") +
      "\n  on disk: " +
      (onDisk.join(", ") || "(nothing)"),
  );
  process.exit(1);
}

const wanted = named.length ? named : onDisk;
if (!wanted.length) {
  console.error("no frame folders under " + FRAMES);
  process.exit(1);
}

mkdirSync(CLIPS, { recursive: true });
console.log("clip   " + FPS + " fps\n");

for (const id of wanted) {
  const dir = join(FRAMES, id);
  const pngs = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  const dest = join(CLIPS, id + ".mp4");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-framerate",
      String(FPS),
      "-start_number",
      pngs[0].replace(/\D+/g, "").replace(/^0+/, "") || "0",
      "-i",
      join(dir, "f_%05d_.png"),
      "-c:v",
      "libx264",
      "-crf",
      "12",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
      dest,
    ],
    { stdio: "inherit" },
  );

  const secs = pngs.length / FPS;
  console.log(
    "out  " +
      rel(dest) +
      "  " +
      pngs.length +
      " frames, " +
      secs.toFixed(2) +
      "s, " +
      (statSync(dest).size / 1024).toFixed(0) +
      " KB",
  );
}

console.log("\nnow: node tools/pack-spells.mjs " + wanted.join(" "));
