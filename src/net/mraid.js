function host() {
  try {
    const m = globalThis.mraid;
    return m && typeof m === "object" ? m : null;
  } catch {
    return null;
  }
}

export function inContainer() {
  return host() !== null;
}

function latch() {
  try {
    const l = globalThis.__siegeMraid;
    return l && typeof l === "object" && Array.isArray(l.waiting) ? l : null;
  } catch {
    return null;
  }
}

export function whenReady(fn) {
  const m = host();
  if (!m) {
    fn();
    return;
  }

  const armed = latch();
  if (armed) {
    if (armed.ready) fn();
    else armed.waiting.push(fn);
    return;
  }

  try {
    if (typeof m.getState !== "function" || m.getState() !== "loading") {
      fn();
      return;
    }
    let spent = false;
    const once = () => {
      if (spent) return;
      spent = true;
      try {
        m.removeEventListener("ready", once);
      } catch {}
      fn();
    };
    m.addEventListener("ready", once);
  } catch {
    fn();
  }
}

export function openStore(url) {
  const m = host();
  if (!m || typeof m.open !== "function") return false;
  whenReady(() => {
    try {
      m.open(url);
    } catch {}
  });
  return true;
}

export function watchViewable(fn) {
  const m = host();
  if (!m) return;

  let last = null;
  const settle = (seen, live) => {
    if (seen === last) return;
    last = seen;
    try {
      fn(seen, live);
    } catch {}
  };

  whenReady(() => {
    const on = (type, handler) => {
      try {
        m.addEventListener(type, handler);
      } catch {}
    };

    on("viewableChange", (v) => settle(!!v, true));
    on("exposureChange", (pct) => settle(Number(pct) > 0, true));
    on("stateChange", (state) => {
      if (state === "hidden") settle(false, true);
    });

    let seen = true;
    try {
      if (typeof m.isViewable === "function") seen = !!m.isViewable();
      if (typeof m.getState === "function" && m.getState() === "hidden") {
        seen = false;
      }
    } catch {
      seen = true;
    }
    settle(seen, false);
  });
}

export function watchSize(fn) {
  const m = host();
  if (!m) return;

  const on = (type, handler) => {
    try {
      m.addEventListener(type, handler);
    } catch {}
  };

  const bump = (w, h) => {
    try {
      fn(Number(w) || 0, Number(h) || 0);
    } catch {}
  };

  on("sizeChange", bump);
  on("stateChange", (state) => {
    if (state === "default" || state === "expanded" || state === "resized") {
      bump(0, 0);
    }
  });
}

export function mraidReport() {
  const m = host();
  if (!m) return { present: false };
  const ask = (name) => {
    try {
      return typeof m[name] === "function" ? m[name]() : undefined;
    } catch {
      return "threw";
    }
  };
  return {
    present: true,
    version: ask("getVersion"),
    state: ask("getState"),
    viewable: ask("isViewable"),
    placement: ask("getPlacementType"),
  };
}
