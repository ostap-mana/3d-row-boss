import "pixi-lib/rendering/init.mjs";
import "pixi-lib/app/init.mjs";
import "pixi-lib/events/init.mjs";
import "pixi-lib/scene/graphics/init.mjs";
import "pixi-lib/scene/mesh/init.mjs";
import "pixi-lib/scene/text/init.mjs";
import "pixi-lib/scene/sprite-nine-slice/init.mjs";

import { Container } from "pixi-lib/scene/container/Container.mjs";
import { CanvasSource as PixiCanvasSource } from "pixi-lib/rendering/renderers/shared/texture/sources/CanvasSource.mjs";
import { ImageSource as PixiImageSource } from "pixi-lib/rendering/renderers/shared/texture/sources/ImageSource.mjs";
import { registerSource } from "./texture-registry.js";

const HIDDEN_ALPHA = 0.001;

const alphaProperty = Object.getOwnPropertyDescriptor(
  Container.prototype,
  "alpha",
);

Object.defineProperty(Container.prototype, "alpha", {
  configurable: true,
  enumerable: alphaProperty.enumerable,
  get: alphaProperty.get,
  set(value) {
    alphaProperty.set.call(this, value);
    this.culled = value <= HIDDEN_ALPHA;
  },
});

class CanvasSource extends PixiCanvasSource {
  constructor(options) {
    super(options);
    registerSource(this);
  }
}

class ImageSource extends PixiImageSource {
  constructor(options) {
    super(options);
    registerSource(this);
  }
}

export { Application } from "pixi-lib/app/Application.mjs";
export { Container } from "pixi-lib/scene/container/Container.mjs";
export { Graphics } from "pixi-lib/scene/graphics/shared/Graphics.mjs";
export { Mesh } from "pixi-lib/scene/mesh/shared/Mesh.mjs";
export { PlaneGeometry } from "pixi-lib/scene/mesh-plane/PlaneGeometry.mjs";
export { NineSliceSprite } from "pixi-lib/scene/sprite-nine-slice/NineSliceSprite.mjs";
export { Sprite } from "pixi-lib/scene/sprite/Sprite.mjs";
export { Text } from "pixi-lib/scene/text/Text.mjs";
export { Rectangle } from "pixi-lib/maths/shapes/Rectangle.mjs";
export { Texture } from "pixi-lib/rendering/renderers/shared/texture/Texture.mjs";
export { CanvasSource, ImageSource };
export { Matrix } from "pixi-lib/maths/matrix/Matrix.mjs";
export { MeshGeometry } from "pixi-lib/scene/mesh/shared/MeshGeometry.mjs";
export { Shader } from "pixi-lib/rendering/renderers/shared/shader/Shader.mjs";
export { VideoSource } from "pixi-lib/rendering/renderers/shared/texture/sources/VideoSource.mjs";
export { compileHighShaderGlProgram } from "pixi-lib/rendering/high-shader/compileHighShaderToProgram.mjs";
export { localUniformBitGl } from "pixi-lib/rendering/high-shader/shader-bits/localUniformBit.mjs";
export { roundPixelsBitGl } from "pixi-lib/rendering/high-shader/shader-bits/roundPixelsBit.mjs";
