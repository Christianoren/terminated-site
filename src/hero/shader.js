export const vertexShader = /* glsl */ `
attribute float aAtlasIndex;
attribute float aGlow;

uniform float uAtlasSize;

varying vec2 vAtlasUv;
varying float vGlow;

void main() {
  vGlow = aGlow;

  float col = mod(aAtlasIndex, uAtlasSize);
  // Canvas rows are drawn top-down, but the texture's flipY maps canvas-top
  // to v=1 — invert here so atlas index 0 is the canvas's top-left cell.
  float row = (uAtlasSize - 1.0) - floor(aAtlasIndex / uAtlasSize);
  vAtlasUv = (uv + vec2(col, row)) / uAtlasSize;

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const fragmentShader = /* glsl */ `
precision mediump float;

uniform sampler2D uAtlas;
uniform vec3 uBaseColor;
uniform vec3 uAccentColor;
uniform float uOpacity;

varying vec2 vAtlasUv;
varying float vGlow;

void main() {
  vec4 tex = texture2D(uAtlas, vAtlasUv);
  if (tex.a < 0.05) discard;
  vec3 color = mix(uBaseColor, uAccentColor, clamp(vGlow, 0.0, 1.0));
  gl_FragColor = vec4(color, tex.a * uOpacity);
}
`;
