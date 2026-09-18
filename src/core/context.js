let app = null;

export function setApp(a) {
  app = a;
}

export function getRenderer() {
  return app.renderer;
}
