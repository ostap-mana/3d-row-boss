import { DIFFICULTY, DOOM, T, WORLD_RATE } from "../config.js";
import { setWorldRate, worldRate } from "../core/juice.js";
import { KNOBS, TOGGLES, planEdits } from "./knobs.js";

const ID = "siege-balance";
const SAVE = "siege.balance";
const OPEN = "siege.balance.open";

const ROOTS = { DIFFICULTY, DOOM, T };

const INK = "#16151a";
const DIM = "#8b8780";
const HOT = "#2f7dd1";
const WARM = "#ef6b3f";

const clone = (v) => JSON.parse(JSON.stringify(v));

function store(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}

function asked() {
  try {
    if (/[?&#]balance\b/.test(window.location.href.toLowerCase())) return true;
  } catch {}
  if (store(OPEN) === "on") return true;
  try {
    return !!import.meta.env.DEV;
  } catch {
    return false;
  }
}

function dig(bag, path) {
  const parts = path.split(".");
  let node = bag;
  for (let i = 0; i < parts.length; i++) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[parts[i]];
  }
  return node;
}

const CSS = `
#${ID}, #${ID} * { box-sizing: border-box; }
#${ID} {
  position: fixed; inset: 0 auto auto 0; z-index: 2147482900;
  font: 12px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: ${INK}; pointer-events: none;
}
#${ID} button, #${ID} input { font: inherit; }
#${ID} .b-icon {
  pointer-events: auto; position: fixed;
  left: max(10px, env(safe-area-inset-left, 0px));
  top: max(10px, env(safe-area-inset-top, 0px));
  width: 44px; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  background: #fffdfb; color: ${HOT}; font-size: 21px; line-height: 1;
  border: 1px solid rgba(0,0,0,0.14); cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.3);
}
#${ID} .b-icon.on { color: #fff; background: ${HOT}; border-color: ${HOT}; }
#${ID} .b-panel {
  pointer-events: auto; position: fixed;
  left: max(8px, env(safe-area-inset-left, 0px));
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  top: calc(62px + max(8px, env(safe-area-inset-top, 0px)));
  width: min(360px, calc(100vw - 16px));
  display: none; flex-direction: column;
  background: #f7f6f4; border: 1px solid rgba(0,0,0,0.14);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 18px 46px rgba(0,0,0,0.4);
}
#${ID}.open .b-panel { display: flex; }
#${ID} .b-head {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 9px 12px; border-bottom: 1px solid #e6e3de; background: #fff;
}
#${ID} .b-head b {
  font: 600 11px/1.4 system-ui, sans-serif; letter-spacing: 0.12em; color: ${HOT};
}
#${ID} .b-head .b-sp { margin-left: auto; }
#${ID} .b-x {
  background: #fff; border: 1px solid #ddd9d3; color: #57535e;
  border-radius: 7px; padding: 4px 8px; cursor: pointer; font-size: 11px;
}
#${ID} .b-x:active { background: #f0ede9; }
#${ID} .b-live {
  flex: none; display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 0 6px; padding: 7px 12px; border-bottom: 1px solid #e6e3de; background: #fff;
}
#${ID} .b-live div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
#${ID} .b-live span { font-size: 9px; letter-spacing: 0.05em; color: ${DIM}; text-transform: uppercase; }
#${ID} .b-live b { font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
#${ID} .b-body {
  flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 6px 10px 10px;
}
#${ID} .b-row { padding: 7px 0 3px; border-bottom: 1px solid #eceae6; }
#${ID} .b-row:last-child { border-bottom: 0; }
#${ID} .b-top { display: flex; align-items: baseline; gap: 6px; }
#${ID} .b-top b { font: 600 12px/1.3 system-ui, sans-serif; cursor: pointer; }
#${ID} .b-top i { font-style: normal; font-size: 10px; color: ${DIM}; }
#${ID} .b-top u {
  margin-left: auto; text-decoration: none; font-size: 11px; color: ${WARM};
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
#${ID} .b-row.off u { color: ${DIM}; }
#${ID} input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 26px;
  background: transparent; margin: 0; touch-action: pan-y;
}
#${ID} input[type=range]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 3px; background: #ded9d2;
}
#${ID} input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; margin-top: -9px;
  width: 22px; height: 22px; border-radius: 50%;
  background: #fff; border: 2px solid ${HOT}; cursor: pointer;
}
#${ID} input[type=range]::-moz-range-track { height: 4px; border-radius: 3px; background: #ded9d2; }
#${ID} input[type=range]::-moz-range-thumb {
  width: 20px; height: 20px; border-radius: 50%;
  background: #fff; border: 2px solid ${HOT}; cursor: pointer;
}
#${ID} .b-flags { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 0 4px; }
#${ID} .b-flag {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  border: 1px solid #ddd9d3; border-radius: 8px; padding: 5px 8px;
  background: #fff; font: 500 11px/1.2 system-ui, sans-serif;
}
#${ID} .b-flag.on { border-color: ${HOT}; color: ${HOT}; background: #eef5fd; }
#${ID} .b-flag input { width: 14px; height: 14px; margin: 0; accent-color: ${HOT}; }
#${ID} .b-bar {
  flex: none; display: flex; gap: 6px; padding: 8px 10px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #e6e3de; background: #fff;
}
#${ID} .b-bar button {
  flex: 1 1 0; background: #fff; border: 1px solid #ddd9d3; color: #57535e;
  border-radius: 8px; padding: 9px 4px; cursor: pointer;
  font: 600 11px/1.2 system-ui, sans-serif; letter-spacing: 0.06em;
}
#${ID} .b-bar button:active { background: #f0ede9; }
#${ID} .b-bar .b-go { border-color: ${HOT}; color: ${HOT}; }
#${ID} .b-bar .b-done { background: ${HOT}; border-color: ${HOT}; color: #fff; }
#${ID} .b-bar .b-fail { background: ${WARM}; border-color: ${WARM}; color: #fff; }
`;

function build(scene) {
  const baseline = {
    DIFFICULTY: clone(DIFFICULTY),
    DOOM: clone(DOOM),
    T: clone(T),
    WORLD_RATE,
  };

  const readBase = (path) =>
    path === "WORLD_RATE" ? baseline.WORLD_RATE : dig(baseline, path);

  const readLive = (path) =>
    path === "WORLD_RATE" ? worldRate() : dig(ROOTS, path);

  function writeBase(path, value) {
    if (path === "WORLD_RATE") {
      baseline.WORLD_RATE = value;
      return;
    }
    const parts = path.split(".");
    const last = parts.pop();
    let node = baseline;
    for (const part of parts) {
      if (node === null || typeof node !== "object") return;
      node = node[part];
    }
    if (node && typeof node === "object") node[last] = value;
  }

  function writeLive(path, value) {
    if (path === "WORLD_RATE") {
      setWorldRate(value);
      return;
    }
    const parts = path.split(".");
    const last = parts.pop();
    let node = ROOTS;
    for (const part of parts) {
      if (node === null || typeof node !== "object") return;
      node = node[part];
    }
    if (node && typeof node === "object") node[last] = value;
  }

  let state = { knobs: {}, toggles: {} };
  try {
    const saved = JSON.parse(store(SAVE) || "null");
    if (saved && typeof saved === "object") {
      state = { knobs: saved.knobs || {}, toggles: saved.toggles || {} };
    }
  } catch {
    keep(SAVE, null);
  }

  TOGGLES.forEach((toggle) => {
    if (state.toggles[toggle.key] === undefined)
      state.toggles[toggle.key] = !!readBase(toggle.path);
  });

  function apply(persist) {
    planEdits(state, readBase).forEach((edit) =>
      writeLive(edit.path, edit.value),
    );
    if (persist) keep(SAVE, JSON.stringify(state));
  }

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ID;
  root.innerHTML = `
    <button class="b-icon" type="button" aria-label="Баланс" title="Баланс">⚖</button>
    <div class="b-panel" role="dialog" aria-label="Баланс гри">
      <div class="b-head">
        <b>БАЛАНС</b>
        <div class="b-sp"></div>
        <button class="b-x" type="button" data-act="hide">сховати</button>
      </div>
      <div class="b-live"></div>
      <div class="b-body"></div>
      <div class="b-bar"></div>
    </div>`;
  document.body.appendChild(root);

  const icon = root.querySelector(".b-icon");
  const live = root.querySelector(".b-live");
  const body = root.querySelector(".b-body");
  const bar = root.querySelector(".b-bar");

  const rows = KNOBS.map((knob) => {
    const row = document.createElement("div");
    row.className = "b-row";
    row.innerHTML = `
      <div class="b-top"><b></b><i></i><u></u></div>
      <input type="range" step="0.01">`;
    row.querySelector("b").textContent = knob.label;
    row.querySelector("i").textContent = knob.hint;
    const slider = row.querySelector("input");
    slider.min = String(knob.min);
    slider.max = String(knob.max);
    slider.setAttribute("aria-label", knob.label);
    slider.addEventListener("input", () => {
      state.knobs[knob.key] = Number(slider.value);
      apply(true);
      render();
    });
    row.querySelector("b").addEventListener("click", () => {
      state.knobs[knob.key] = 1;
      apply(true);
      render();
    });
    body.appendChild(row);
    return { knob, row, slider, value: row.querySelector("u") };
  });

  const flags = document.createElement("div");
  flags.className = "b-flags";
  body.appendChild(flags);

  const switches = TOGGLES.map((toggle) => {
    const label = document.createElement("label");
    label.className = "b-flag";
    label.innerHTML = `<input type="checkbox"><span></span>`;
    label.querySelector("span").textContent = toggle.label;
    const box = label.querySelector("input");
    box.addEventListener("change", () => {
      state.toggles[toggle.key] = box.checked;
      apply(true);
      render();
    });
    flags.appendChild(label);
    return { toggle, label, box };
  });

  function render() {
    rows.forEach((row) => {
      const factor = Number(state.knobs[row.knob.key]);
      const at = Number.isFinite(factor) && factor > 0 ? factor : 1;
      row.slider.value = String(at);
      row.row.classList.toggle("off", at === 1);
      let text = `×${at.toFixed(2)}`;
      try {
        text = `${row.knob.show(readLive)} · ×${at.toFixed(2)}`;
      } catch {}
      row.value.textContent = text;
    });
    switches.forEach((item) => {
      const on = !!state.toggles[item.toggle.key];
      item.box.checked = on;
      item.label.classList.toggle("on", on);
    });
  }

  function reset() {
    state = { knobs: {}, toggles: {} };
    TOGGLES.forEach((toggle) => {
      state.toggles[toggle.key] = !!readBase(toggle.path);
    });
    apply(false);
    keep(SAVE, null);
    render();
  }

  function asCode() {
    return planEdits(state, readBase)
      .filter((edit) => edit.value !== edit.base)
      .map(
        (edit) =>
          `${edit.path.replace(/\.(\d+)(?=\.)/g, "[$1]")} = ${edit.value};`,
      )
      .join("\n");
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    area.remove();
    return ok;
  }

  async function saveToCode() {
    const changed = planEdits(state, readBase).filter(
      (edit) => edit.value !== edit.base,
    );
    if (!changed.length) return { skipped: true };
    const sent = JSON.stringify(state);
    keep(SAVE, null);
    let res = null;
    let data = null;
    try {
      res = await fetch("/__balance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: sent,
      });
      data = await res.json();
    } catch (err) {
      keep(SAVE, sent);
      throw err;
    }
    if (!res.ok || data.error) {
      keep(SAVE, sent);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    changed.forEach((edit) => writeBase(edit.path, edit.value));
    state = { knobs: {}, toggles: {} };
    TOGGLES.forEach((toggle) => {
      state.toggles[toggle.key] = !!readBase(toggle.path);
    });
    render();
    return data;
  }

  const buttons = [
    { label: "СКИНУТИ", run: reset },
    {
      label: "ПЕРЕЗАПУСК",
      run: () => {
        if (typeof scene.restart === "function") scene.restart();
      },
    },
    {
      label: "ЗБЕРЕГТИ В КОД",
      cls: "b-go",
      run: async (el) => {
        const was = el.textContent;
        const flash = (text, cls) => {
          el.textContent = text;
          el.classList.add(cls);
          window.setTimeout(() => {
            el.textContent = was;
            el.classList.remove(cls);
          }, 1600);
        };
        el.textContent = "…";
        try {
          const done = await saveToCode();
          if (done.skipped) flash("НІЧОГО", "b-done");
          else flash(`ЗАПИСАНО ${done.count}`, "b-done");
        } catch {
          const code = asCode();
          const ok = await copy(code);
          flash(ok ? "СКОПІЙОВАНО" : "НЕ ВДАЛОСЬ", "b-fail");
        }
      },
    },
  ];

  buttons.forEach((b) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = b.label;
    if (b.cls) el.className = b.cls;
    el.addEventListener("click", () => b.run(el));
    bar.appendChild(el);
  });

  const READOUT = [
    { label: "hp боса", get: (d) => `${Math.round(d.bossHp * 100)}%` },
    { label: "хід", get: (d) => `${d.turn}` },
    {
      label: "секунда",
      get: (d) => `${Math.max(0, d.elapsed() - d.fightStart).toFixed(1)}с`,
    },
    {
      label: "герої",
      get: () => {
        const cards = (scene.heroRow && scene.heroRow.cards) || [];
        const alive = cards.filter((c) => !c.downed).length;
        return `${alive}/${cards.length || 0}`;
      },
    },
  ];

  const cells = READOUT.map((item) => {
    const el = document.createElement("div");
    el.innerHTML = `<span></span><b>—</b>`;
    el.querySelector("span").textContent = item.label;
    live.appendChild(el);
    return el.querySelector("b");
  });

  let last = 0;
  function tick(now) {
    window.requestAnimationFrame(tick);
    if (!root.classList.contains("open") || now - last < 200) return;
    last = now;
    const director = scene.director;
    READOUT.forEach((item, i) => {
      let text = "—";
      try {
        if (director) text = item.get(director);
      } catch {}
      if (cells[i].textContent !== text) cells[i].textContent = text;
    });
    rows.forEach((row) => {
      try {
        const at = Number(row.slider.value);
        row.value.textContent = `${row.knob.show(readLive)} · ×${at.toFixed(2)}`;
      } catch {}
    });
  }
  window.requestAnimationFrame(tick);

  root.querySelectorAll("[data-act]").forEach((el) =>
    el.addEventListener("click", () => {
      root.classList.remove("open");
      icon.classList.remove("on");
      keep(OPEN, "off");
    }),
  );

  icon.addEventListener("click", () => {
    const on = !root.classList.contains("open");
    root.classList.toggle("open", on);
    icon.classList.toggle("on", on);
    keep(OPEN, on ? "on" : "off");
    if (on) render();
  });

  apply(false);
  render();

  return (on) => {
    const want = on === undefined ? !root.classList.contains("open") : !!on;
    root.classList.toggle("open", want);
    icon.classList.toggle("on", want);
    if (want) render();
    return want;
  };
}

export function mountBalance(scene) {
  if (typeof document === "undefined") return () => false;

  let show = null;
  const ready = () => {
    if (!show && !document.getElementById(ID)) show = build(scene);
    return show;
  };

  if (asked()) {
    const open = ready();
    if (open && store(OPEN) !== "off") open(true);
  }

  return (on) => {
    const open = ready();
    return open ? open(on) : false;
  };
}
