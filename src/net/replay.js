export function stepDoor(dt) {
  const tape = globalThis.playdata;
  if (tape && typeof tape.step === "function") return tape.step(dt);
  return dt;
}

export function tellState(read) {
  globalThis.__STATE = function () {
    try {
      return read();
    } catch {
      return null;
    }
  };
}

export function replayReport() {
  return {
    seed: globalThis.__SEED,
    step: !!(globalThis.playdata && globalThis.playdata.step),
    state: typeof globalThis.__STATE === "function",
  };
}
