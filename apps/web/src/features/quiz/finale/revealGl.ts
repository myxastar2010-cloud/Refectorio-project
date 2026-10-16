import { FULLSCREEN_VERTEX, fullscreenTriangle, link } from './gl';

/**
 * The reveal wave's front (ТЗ §12.5): a full-screen WebGL2 pass at a capped resolution. A ring expands from the core;
 * its edge is displaced by two octaves of value noise along the angle, it is soft (a blurred profile, no hard line) and
 * has volume — a bright inner slope and a deeper outer one — with the accent → coral → warm cream gradient across it.
 * The DOM content behind is revealed by a circle that runs just inside the front (RevealWave), so the front covers
 * the mask's edge.
 */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uWidth;
uniform float uTime;
uniform float uFade;

const vec3 ACCENT = vec3(0.902, 0.224, 0.275);
const vec3 CORAL = vec3(1.0, 0.52, 0.42);
const vec3 CREAM = vec3(0.996, 0.976, 0.969);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 frag = (vUv * 0.5 + 0.5) * uRes;
  vec2 d = frag - uCenter;
  float r = length(d);
  float angle = atan(d.y, d.x);
  float wobble = (noise(vec2(angle * 2.5 + 7.0, uTime * 1.4)) - 0.5) * 0.9
    + (noise(vec2(angle * 7.0 - 3.0, uTime * 2.6)) - 0.5) * 0.35;
  float x = (r - uRadius - wobble * uWidth) / uWidth;
  float band = exp(-x * x * 2.2);
  vec3 across = mix(CREAM, CORAL, smoothstep(-1.4, -0.1, x));
  across = mix(across, ACCENT, smoothstep(-0.2, 0.9, x));
  float slope = 0.82 + 0.3 * smoothstep(0.4, -0.7, x) - 0.18 * smoothstep(0.0, 1.0, x);
  float highlight = exp(-pow((x + 0.45) / 0.18, 2.0)) * 0.35;
  vec3 color = across * slope + highlight;
  float alpha = band * uFade;
  outColor = vec4(color * alpha, alpha);
}`;

export type RevealRenderer = {
  /** One frame: the front at `radiusPx` (CSS px) around `center` (CSS px, from the top left). */
  readonly draw: (
    center: { x: number; y: number },
    radiusPx: number,
    widthPx: number,
    fade: number,
  ) => void;
  readonly dispose: () => void;
};

/** Resolution of the full-screen pass relative to the CSS pixels (the front is soft: half is plenty). */
const RESOLUTION = 0.5;

export function createRevealRenderer(canvas: HTMLCanvasElement): RevealRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const program = link(gl, FULLSCREEN_VERTEX, FRAGMENT);
  if (!program) return null;
  const { vao, buffer } = fullscreenTriangle(gl, program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    res: uniform('uRes'),
    center: uniform('uCenter'),
    radius: uniform('uRadius'),
    width: uniform('uWidth'),
    time: uniform('uTime'),
    fade: uniform('uFade'),
  };
  const startedAt = performance.now();
  return {
    draw(center, radiusPx, widthPx, fade) {
      const width = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
      const height = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.res, width, height);
      // GL's y goes up.
      gl.uniform2f(u.center, center.x * RESOLUTION, height - center.y * RESOLUTION);
      gl.uniform1f(u.radius, radiusPx * RESOLUTION);
      gl.uniform1f(u.width, widthPx * RESOLUTION);
      gl.uniform1f(u.time, (performance.now() - startedAt) / 1000);
      gl.uniform1f(u.fade, fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
    },
  };
}
