import { Filter, GlProgram, UniformGroup, defaultFilterVert } from "pixi.js";

const fragment = `
in vec2 vTextureCoord;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uKey;
uniform vec2 uSpill;

void main(void)
{
    vec4 src = texture(uTexture, vTextureCoord);
    if (src.a <= 0.0) {
        finalColor = vec4(0.0);
        return;
    }

    vec3 col = src.rgb / src.a;
    float chroma = col.g - max(col.r, col.b);
    float keep = clamp((uKey.x - chroma) / uKey.y, 0.0, 1.0);

    float pulled = min(col.g, max(col.r, col.b) + uSpill.y);
    col.g = mix(col.g, pulled, uSpill.x);

    float a = keep * src.a;
    finalColor = vec4(col * a, a);
}
`;

export function chromaKeyFilter({ cut, ramp, spill = 1, lift = 0 }) {
  return new Filter({
    glProgram: GlProgram.from({
      vertex: defaultFilterVert,
      fragment,
      name: "chroma-key",
    }),
    resources: {
      chromaUniforms: new UniformGroup({
        uKey: { value: new Float32Array([cut, ramp]), type: "vec2<f32>" },
        uSpill: { value: new Float32Array([spill, lift]), type: "vec2<f32>" },
      }),
    },
  });
}
