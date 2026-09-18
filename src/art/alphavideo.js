import {
  Matrix,
  Mesh,
  MeshGeometry,
  Shader,
  Texture,
  VideoSource,
  compileHighShaderGlProgram,
  localUniformBitGl,
  roundPixelsBitGl,
} from "pixi.js";

const READY_MS = 5000;
const CLIP_FPS = 30;

const stackedAlphaBitGl = {
  name: "stacked-alpha-bit",
  vertex: {
    header: `
      uniform mat3 uTextureMatrix;
    `,
    main: `
      uv = (uTextureMatrix * vec3(uv, 1.0)).xy;
    `,
  },
  fragment: {
    header: `
      uniform sampler2D uTexture;
      uniform vec2 uSlice;
    `,
    main: `
      float row = uSlice.x + vUV.y * uSlice.y;
      float a = texture(uTexture, vec2(vUV.x, row + 0.5)).r;
      outColor = vec4(texture(uTexture, vec2(vUV.x, row)).rgb, a);
    `,
  },
};

let program = null;

function stackedProgram() {
  if (!program) {
    program = compileHighShaderGlProgram({
      name: "stacked-alpha",
      bits: [localUniformBitGl, stackedAlphaBitGl, roundPixelsBitGl],
    });
  }
  return program;
}

function footQuad() {
  return new MeshGeometry({
    positions: new Float32Array([-0.5, -1, 0.5, -1, 0.5, 0, -0.5, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

function stackedShader(texture) {
  const source = texture.source;
  const h = source.pixelHeight;
  return new Shader({
    glProgram: stackedProgram(),
    resources: {
      uTexture: source,
      uSampler: source.style,
      textureUniforms: {
        uTextureMatrix: { type: "mat3x3<f32>", value: new Matrix() },
        uSlice: {
          type: "vec2<f32>",
          value: new Float32Array([0.5 / h, (h / 2 - 1) / h]),
        },
      },
    },
  });
}

function element(src) {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = false;
  video.loop = false;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";
  video.src = src;
  return video;
}

async function detached(src) {
  if (!src.startsWith("data:")) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return URL.createObjectURL(blob);
  } catch {
    return src;
  }
}

class AlphaClip extends Mesh {
  constructor(texture, video) {
    super({ geometry: footQuad(), shader: stackedShader(texture), texture });
    this.video = video;
    this.eventMode = "none";
  }

  fit(h) {
    this.scale.set(h);
  }

  rewind() {
    try {
      this.video.pause();
      this.video.currentTime = 0;
    } catch {}
  }

  play() {
    const video = this.video;
    const roll = () => {
      try {
        const started = video.play();
        if (started) started.catch(() => {});
      } catch {}
    };

    try {
      if (video.currentTime > 0.01) {
        const seeked = () => {
          video.removeEventListener("seeked", seeked);
          roll();
        };
        video.addEventListener("seeked", seeked);
        video.currentTime = 0;
      }
    } catch {}
    roll();
  }

  stop() {
    try {
      this.video.pause();
    } catch {}
  }
}

export async function loadAlphaClip(src) {
  const video = element(await detached(src));
  const source = new VideoSource({
    resource: video,
    autoPlay: false,
    autoLoad: true,
    updateFPS: CLIP_FPS,
  });

  let timer = null;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("video never arrived")),
      READY_MS,
    );
  });

  try {
    await Promise.race([source.load(), ready]);
  } finally {
    clearTimeout(timer);
  }

  if (!source.isValid) throw new Error("video has no frame");

  return new AlphaClip(new Texture({ source }), video);
}
