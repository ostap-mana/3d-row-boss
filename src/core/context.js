let app = null;

export function setApp(a) {
  app = a;
}

export function getApp() {
  return app;
}

export function getRenderer() {
  return app.renderer;
}
