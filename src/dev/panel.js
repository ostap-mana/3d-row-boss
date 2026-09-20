import { DIFFICULTY, DOOM, T } from "../config.js";
import { KNOBS, TOGGLES } from "./knobs.js";

const ROOTS = { DIFFICULTY, DOOM, T };

const CSS = `
#siege-panel{position:fixed;top:0;right:0;z-index:2147483000;width:308px;
max-height:100dvh;overflow:auto;background:rgba(10,8,18,.93);color:#e8e0d2;
font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;border-left:1px solid #f5c65a44;
-webkit-user-select:none;user-select:none;touch-action:auto}
#siege-panel *{box-sizing:border-box}
#siege-panel.shut{width:auto;max-height:none;overflow:visible;border:0;background:none}
#siege-panel.shut .body{display:none}
#siege-panel .top{display:flex;align-items:center;gap:6px;padding:6px 8px;
position:sticky;top:0;background:rgba(10,8,18,.98);border-bottom:1px solid #f5c65a33}
#siege-panel .top b{color:#f5c65a;letter-spacing:.14em;font-weight:700;flex:1}
#siege-panel .body{padding:0 8px 10px}
#siege-panel h4{color:#f5c65a;letter-spacing:.14em;font-size:10px;font-weight:700;
margin:10px 0 5px;padding-top:8px;border-top:1px solid #ffffff14}
#siege-panel button{font:inherit;color:#e8e0d2;background:#241c33;border:1px solid #ffffff1f;
border-radius:4px;padding:4px 6px;cursor:pointer}
#siege-panel button:hover{background:#33264a;border-color:#f5c65a66}
#siege-panel button.live{background:#1b4a1a;border-color:#27752f;color:#dffcd8}
#siege-panel button.hot{background:#6b3030;border-color:#c74343;color:#ffe2dd}
#siege-panel .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
#siege-panel .row{display:flex;gap:4px;align-items:center;margin:4px 0}
#siege-panel .row label{flex:1;color:#bdb3a4}
#siege-panel input[type=range]{width:100%;accent-color:#f5c65a;height:16px}
#siege-panel .knob{margin:7px 0}
#siege-panel .knob .head{display:flex;gap:6px;align-items:baseline}
#siege-panel .knob .head span{flex:1}
#siege-panel .knob .head i{color:#f5c65a;font-style:normal}
#siege-panel .knob small{color:#8b8274;display:block}
#siege-panel pre{margin:0;white-space:pre-wrap;word-break:break-word;color:#9fd5b0;font-size:10px}
`;

function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (key === "on") {
        for (const name of Object.keys(attrs.on)) {
          node.addEventListener(name, attrs.on[name]);
        }
      } else if (key === "text") node.textContent = attrs.text;
      else node.setAttribute(key, attrs[key]);
    }
  }
  for (const kid of kids || []) if (kid) node.appendChild(kid);
  return node;
}

function readPath(path) {
  const parts = path.split(".");
  let at = ROOTS[parts[0]];
  for (let i = 1; i < parts.length && at !== undefined; i++) at = at[parts[i]];
  return at;
}

function writePath(path, value) {
  const parts = path.split(".");
  let at = ROOTS[parts[0]];
  for (let i = 1; i < parts.length - 1 && at !== undefined; i++) {
    at = at[parts[i]];
  }
  if (at === undefined) return false;
  at[parts[parts.length - 1]] = value;
  return true;
}

function expand(path) {
  if (!path.includes("*")) return readPath(path) === undefined ? [] : [path];
  const out = [];
  for (let i = 0; i < 64; i++) {
    const one = path.replace("*", String(i));
    if (readPath(one) === undefined) break;
    out.push(one);
  }
  return out;
}

function baseline() {
  const base = new Map();
  for (const knob of KNOBS) {
    for (const pattern of knob.paths) {
      for (const path of expand(pattern)) {
        const v = readPath(path);
        if (typeof v === "number") base.set(path, v);
      }
    }
  }
  return base;
}

export function openPanel(scene) {
  if (document.getElementById("siege-panel")) return null;

  const base = baseline();
  const factors = new Map();
  const shown = new Map();

  const style = el("style", { text: CSS });
  document.head.appendChild(style);

  const body = el("div", { class: "body" });
  const toggle = el("button", { text: "×" });
  const panel = el("div", { id: "siege-panel" }, [
    el("div", { class: "top" }, [el("b", { text: "SIEGE" }), toggle]),
    body,
  ]);
  toggle.addEventListener("click", () => {
    const shut = panel.classList.toggle("shut");
    toggle.textContent = shut ? "≡" : "×";
  });

  const states = () => scene.states;

  function section(title) {
    body.appendChild(el("h4", { text: title }));
  }

  const controls = el("div", { class: "grid" });
  const readout = el("pre");

  section("CONTROL");
  body.appendChild(controls);
  const rateLabel = el("i", { text: "×1.00" });
  const rate = el("input", {
    type: "range",
    min: "0.05",
    max: "2",
    step: "0.05",
    value: "1",
  });
  rate.addEventListener("input", () => {
    const v = Number(rate.value);
    rateLabel.textContent = `×${v.toFixed(2)}`;
    states().rate(v);
  });
  body.appendChild(
    el("div", { class: "knob" }, [
      el("div", { class: "head" }, [
        el("span", { text: "Темп світу" }),
        rateLabel,
      ]),
      rate,
    ]),
  );

  const act = (label, cls, fn) => {
    const button = el("button", { text: label, class: cls || "" });
    button.addEventListener("click", fn);
    controls.appendChild(button);
    return button;
  };
  act("HALT", "hot", () => states().halt());
  act("RESUME", "", () => states().resume());
  act("FREEZE", "", () => states().freeze());
  act("THAW", "", () => states().thaw());
  act("STEP 1", "", () => states().step(1));
  act("STEP 10", "", () => states().step(10));

  const buttons = new Map();
  let groups = null;

  function buildStates() {
    const list = states().list();
    const seen = list.map((s) => s.name).join("|");
    if (groups === seen) return list;
    groups = seen;

    for (const node of body.querySelectorAll("[data-states]")) node.remove();

    const byGroup = {};
    for (const s of list) (byGroup[s.group] = byGroup[s.group] || []).push(s);

    for (const name of Object.keys(byGroup)) {
      const head = el("h4", { text: name.toUpperCase() });
      head.setAttribute("data-states", "1");
      body.appendChild(head);
      const grid = el("div", { class: "grid" });
      grid.setAttribute("data-states", "1");
      for (const s of byGroup[name]) {
        const short = s.name.replace(`${s.group}.`, "");
        const button = el("button", { text: s.label || short });
        button.addEventListener("click", () => {
          const out = states().run(s.name);
          if (out && out.catch) out.catch(() => {});
        });
        buttons.set(s.name, button);
        grid.appendChild(button);
      }
      body.appendChild(grid);
    }
    return list;
  }

  function buildMods() {
    const head = el("h4", { text: "MODS" });
    head.setAttribute("data-mods", "1");
    body.appendChild(head);

    for (const knob of KNOBS) {
      if (knob.paths.some((p) => p.startsWith("WORLD_RATE"))) continue;
      const value = el("i", { text: "×1.00" });
      const hint = el("small", { text: knob.hint || "" });
      const slider = el("input", {
        type: "range",
        min: String(knob.min),
        max: String(knob.max),
        step: "0.05",
        value: "1",
      });
      slider.addEventListener("input", () => {
        const factor = Number(slider.value);
        factors.set(knob.key, factor);
        value.textContent = `×${factor.toFixed(2)}`;
        const scale = knob.invert ? 1 / factor : factor;
        for (const pattern of knob.paths) {
          for (const path of expand(pattern)) {
            const from = base.get(path);
            if (typeof from !== "number") continue;
            writePath(path, Number((from * scale).toFixed(4)));
          }
        }
        try {
          hint.textContent = knob.show(readPath);
        } catch {
          hint.textContent = knob.hint || "";
        }
      });
      shown.set(knob.key, hint);
      try {
        hint.textContent = knob.show(readPath);
      } catch {
        hint.textContent = knob.hint || "";
      }
      const wrap = el("div", { class: "knob" }, [
        el("div", { class: "head" }, [el("span", { text: knob.label }), value]),
        hint,
        slider,
      ]);
      wrap.setAttribute("data-mods", "1");
      body.appendChild(wrap);
    }

    for (const flag of TOGGLES) {
      const box = el("input", { type: "checkbox" });
      box.checked = !!readPath(flag.path);
      box.addEventListener("change", () => writePath(flag.path, box.checked));
      const row = el("div", { class: "row" }, [
        el("label", { text: flag.label }),
        box,
      ]);
      row.setAttribute("data-mods", "1");
      body.appendChild(row);
    }

    const reset = el("button", { text: "СКИНУТИ MODS" });
    reset.setAttribute("data-mods", "1");
    reset.addEventListener("click", () => {
      for (const [path, from] of base) writePath(path, from);
      for (const input of body.querySelectorAll(
        "[data-mods] input[type=range]",
      ))
        input.value = "1";
      for (const label of body.querySelectorAll("[data-mods] .head i"))
        label.textContent = "×1.00";
      for (const knob of KNOBS) {
        const hint = shown.get(knob.key);
        if (!hint) continue;
        try {
          hint.textContent = knob.show(readPath);
        } catch {
          hint.textContent = knob.hint || "";
        }
      }
      factors.clear();
    });
    body.appendChild(reset);
  }

  buildStates();
  buildMods();
  section("READ");
  body.appendChild(readout);

  let timer = 0;
  function tick() {
    if (!panel.isConnected) return;
    if (!panel.classList.contains("shut") && states()) {
      const list = buildStates();
      for (const s of list) {
        const button = buttons.get(s.name);
        if (button) button.classList.toggle("live", s.live);
      }
      const read = states().read();
      readout.textContent = Object.keys(read)
        .map((k) => `${k}: ${JSON.stringify(read[k])}`)
        .join("\n");
    }
    timer = setTimeout(tick, 250);
  }

  document.body.appendChild(panel);
  tick();

  return {
    panel,
    close() {
      clearTimeout(timer);
      panel.remove();
      style.remove();
    },
    factors,
  };
}
