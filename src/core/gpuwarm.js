import { pendingSourceCount, takePendingSources } from "./texture-registry.js";

const FRAME_BUDGET_BYTES = 3 * 1024 * 1024;

export function startTextureWarmup(app) {
  const renderer = app.renderer;
  const tick = () => {
    if (!pendingSourceCount()) return;
    for (const source of takePendingSources(FRAME_BUDGET_BYTES)) {
      try {
        renderer.texture.initSource(source);
      } catch {}
    }
  };
  app.ticker.add(tick, null, -50);
  return () => app.ticker.remove(tick);
}
