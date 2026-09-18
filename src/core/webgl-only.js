import { WebGLRenderer } from "pixi-lib/rendering/renderers/gl/WebGLRenderer.mjs";

export async function autoDetectRenderer(options) {
  const finalOptions = { ...options, ...options.webgl };
  delete finalOptions.webgpu;
  delete finalOptions.webgl;
  delete finalOptions.canvasOptions;
  const renderer = new WebGLRenderer();
  await renderer.init(finalOptions);
  return renderer;
}
