/** Shared handles to the running application, so art modules can bake
 *  textures without every constructor taking a renderer argument. */

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
