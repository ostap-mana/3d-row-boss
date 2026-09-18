const SELF_START = 1500;

const listeners = [];
const hooks = {
  start: null,
  pause: null,
  resume: null,
  audio: null,
  rects: null,
};
const sent = [];
let running = false;

export function hosted() {
  return listeners.length > 0;
}

function emit(name, data) {
  sent.push(name);
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i](name, data);
    } catch {
      continue;
    }
  }
}

function run(hook, arg) {
  if (!hook) return;
  try {
    hook(arg);
  } catch {
    return;
  }
}

window.__PLAYABLE = {
  on(fn) {
    if (typeof fn === "function") listeners.push(fn);
  },

  start() {
    if (running) return;
    running = true;
    run(hooks.start);
    emit("displayed");
    emit("started");
  },

  pause() {
    run(hooks.pause);
  },

  resume() {
    run(hooks.resume);
  },

  setAudio(on) {
    run(hooks.audio, !!on);
  },

  openStore() {},

  ctaRects() {
    if (!hooks.rects) return [];
    try {
      return hooks.rects() || [];
    } catch {
      return [];
    }
  },

  emit,

  hosted,
};

setTimeout(() => {
  if (!hosted()) window.__PLAYABLE.start();
}, SELF_START);

export function wireBus(impl) {
  for (const key of Object.keys(hooks)) {
    if (typeof impl[key] === "function") hooks[key] = impl[key];
  }
}

export function say(name, data) {
  emit(name, data);
}

export function sayOnce(name, data) {
  if (sent.includes(name)) return;
  emit(name, data);
}

export function started() {
  return running;
}

export function busReport() {
  return {
    listeners: listeners.length,
    running,
    sent: sent.slice(),
    rects: window.__PLAYABLE.ctaRects(),
  };
}
