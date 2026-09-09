const PREFIX = "applovin:";

const TRACKERS = Object.freeze({
  ad_load: "start",
  ad_ready: "impression",
  ad_view: "viewable",
  game_start: "engagement",
  first_swap: "interaction",
  ultimate_cast: "ultimate",
  game_end: "complete",
  endcard_shown: "endcard",
  retry: "replay",
  cta_click: "click-tracker",
});

const spent = new Set();
const fired = [];

function meta(name) {
  try {
    const el = document.querySelector(`meta[name="${PREFIX}${name}"]`);
    const v = el && el.getAttribute("content");
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

function substituted(v) {
  if (v === "") return false;
  if (v.startsWith("{{") && v.endsWith("}}")) return false;
  return /^https?:\/\//i.test(v);
}

function bust(url) {
  const n = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  return url.replace(/\{\{CACHEBUSTER\}\}|\[CACHEBUSTER\]|\[timestamp\]/gi, n);
}

export function clickUrl(storeUrl) {
  const macro = meta("click");
  if (!substituted(macro)) return storeUrl;
  const prefixed = macro.endsWith("=") || macro.endsWith("?");
  return prefixed ? macro + encodeURIComponent(storeUrl) : macro;
}

export function firePixel(event) {
  const name = TRACKERS[event];
  if (!name || spent.has(name)) return false;
  const url = meta(name);
  if (!substituted(url)) return false;
  spent.add(name);
  try {
    const beacon = new Image();
    beacon.decoding = "async";
    beacon.src = bust(url);
    fired.push(name);
    return true;
  } catch {
    return false;
  }
}

export function tagReport() {
  const click = meta("click");
  const out = {
    click: { raw: click, live: substituted(click) },
    trackers: {},
    fired: fired.slice(),
  };
  for (const event of Object.keys(TRACKERS)) {
    const name = TRACKERS[event];
    const raw = meta(name);
    out.trackers[name] = {
      event,
      raw,
      live: substituted(raw),
      spent: spent.has(name),
    };
  }
  return out;
}
