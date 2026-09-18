import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "masters/sprites");

const ENDPOINT = (id) =>
  `https://api.pixellab.ai/mcp/characters/${id}/spritesheet`;

const CHARACTERS = {
  fire: "88ecdff5-4d82-4543-aec0-8e0ad7935632",
  water: "4b456349-111c-42ff-9aab-c7ad474854a3",
  nature: "2c53dfe4-7357-497b-a55f-58824e310923",
  lightning: "8a8c0afa-b994-4096-b544-36c6eff9394b",
  arcane: "b0ac32e7-5670-49b0-bb52-0d8f7b2ac80c",
  wind: "50bc6617-47ba-477f-9677-04fba24d9732",
};

const EOCD = 0x06054b50;
const CEN = 0x02014b50;

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + size);

    if (method === 0) files[name] = Buffer.from(raw);
    else if (method === 8) files[name] = inflateRawSync(raw);
    else throw new Error(`${name}: unsupported compression ${method}`);

    p += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

const force = process.argv.includes("--force");
mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;

for (const [name, id] of Object.entries(CHARACTERS)) {
  const png = join(OUT_DIR, `${name}-ultimate.png`);
  const meta = join(OUT_DIR, `${name}-ultimate.json`);

  if (!force && existsSync(png) && existsSync(meta)) {
    console.log(`  ${name.padEnd(9)} already on disk`);
    continue;
  }

  const res = await fetch(ENDPOINT(id));
  if (!res.ok) {
    const why = res.status === 423 ? "still generating" : `HTTP ${res.status}`;
    console.log(`  ${name.padEnd(9)} ${why}`);
    failed++;
    continue;
  }

  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const sheet = Object.keys(files).find((f) => f.endsWith(".png"));
  const layout = Object.keys(files).find((f) => f.endsWith(".json"));
  if (!sheet || !layout) {
    console.log(`  ${name.padEnd(9)} export has no png/json pair`);
    failed++;
    continue;
  }

  writeFileSync(png, files[sheet]);
  writeFileSync(meta, files[layout]);
  const kb = (files[sheet].length / 1024).toFixed(1);
  console.log(`  ${name.padEnd(9)} ${sheet}  ${kb} kB`);
}

if (failed) {
  console.log(`\n${failed} hero(es) not fetched.`);
  process.exit(1);
}
