import { FULLSCREEN_VERTEX, fullscreenTriangle, link } from './gl';

/**
 * The finale's core (ТЗ §12.2), «incredibly dynamic, complex, unusual»: a liquid metaball in a small WebGL2 canvas.
 * A central body and four blobs orbit on tilted ellipses (depth makes the near ones larger), merge and split through a
 * smooth-minimum union of their signed distances; the drop is shaded as if it were 3D (a dome normal from the
 * distance field, light, rim, highlight) on the accent gradient. Three satellites on tilted orbits pass behind and in
 * front of it; every caption change sends a ripple and a short swell. At `intro` 0 it is the flat red dot the progress
 * bar became (same colour and size), growing into the full core as `intro` reaches 1. One triangle, one draw call.
 */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uIntro;
uniform float uPulse;
uniform float uPx;
uniform float uDot;

const vec3 ACCENT = vec3(0.902, 0.224, 0.275);
const vec3 DEEP = vec3(0.62, 0.08, 0.14);
const vec3 CORAL = vec3(1.0, 0.52, 0.42);
const vec3 CREAM = vec3(1.0, 0.96, 0.92);

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 blob(float i, float t) {
  float a = t * (0.32 + 0.09 * i) + i * 1.5708 + 0.5 * sin(t * 0.23 + i * 1.7);
  float orbit = 0.24 + 0.07 * sin(t * 0.41 + i * 2.3);
  float tilt = 0.45 + 0.3 * sin(i * 1.9 + 0.6);
  vec3 c = vec3(cos(a) * orbit, sin(a) * orbit * tilt, sin(a) * orbit * sqrt(1.0 - tilt * tilt));
  float r = 0.14 + 0.03 * sin(t * 0.83 + i * 1.31);
  float near = 1.0 + 0.9 * c.z;
  return vec3(c.xy * near, r * near);
}

float field(vec2 p, float t, float intro) {
  float swell = exp(-uPulse * 3.2) * 0.035 * intro;
  float d = length(p) - mix(uDot, 0.25 + 0.012 * sin(t * 1.3), intro) - swell;
  for (int i = 0; i < 4; i++) {
    vec3 b = blob(float(i), t);
    float r = mix(uDot, b.z, intro);
    d = smin(d, length(p - b.xy * intro) - r, 0.001 + 0.15 * intro);
  }
  return d;
}

vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

vec4 satellite(vec2 p, float i, float t, float intro, out float depth) {
  float a = t * (0.5 + 0.17 * i) + i * 2.094;
  float radius = 0.5 + 0.06 * i;
  float incline = 0.28 + 0.22 * i;
  vec3 s = vec3(cos(a) * radius, sin(a) * radius * incline, sin(a) * radius * sqrt(1.0 - incline * incline));
  float turn = 0.5 + i * 1.05;
  s.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * s.xy;
  depth = s.z;
  float size = 0.026 * (1.0 + 0.55 * s.z / radius) * intro;
  vec2 q = (p - s.xy) / max(size, 1e-4);
  float d = (length(q) - 1.0) * size;
  float alpha = clamp(0.5 - d / (1.5 * uPx), 0.0, 1.0) * intro;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  float light = clamp(dot(normalize(vec3(q, z)), normalize(vec3(-0.5, 0.6, 0.7))), 0.0, 1.0);
  vec3 color = mix(CORAL, CREAM, light);
  return vec4(color * alpha, alpha);
}

void main() {
  vec2 p = vUv;
  float t = uTime;
  float intro = smoothstep(0.0, 1.0, uIntro);
  float d = field(p, t, intro);
  float e = uPx;
  vec2 g = vec2(
    field(p + vec2(e, 0.0), t, intro) - field(p - vec2(e, 0.0), t, intro),
    field(p + vec2(0.0, e), t, intro) - field(p - vec2(0.0, e), t, intro)
  );
  vec2 n2 = g / max(length(g), 1e-6);
  float inside = clamp(-d / 0.15, 0.0, 1.0);
  float h = sqrt(1.0 - (1.0 - inside) * (1.0 - inside));
  vec3 n = normalize(vec3(n2 * (1.0 - h) * 1.35, h + 0.04));
  vec3 lightDir = normalize(vec3(-0.45, 0.55, 0.75));
  float diffuse = max(dot(n, lightDir), 0.0);
  float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 26.0);
  float rim = pow(1.0 - n.z, 2.2);
  // A slow moving sheen (no atan: it is undefined at the centre and would leave a dark speck there).
  float swirl = 0.5 + 0.5 * sin(p.x * 5.0 + t * 0.55) * cos(p.y * 4.0 - t * 0.43);
  vec3 base = mix(ACCENT, CORAL, swirl * 0.4 + rim * 0.3);
  base = mix(DEEP, base, 0.5 + 0.5 * diffuse);
  vec3 shaded = base + spec * CREAM * 0.7 + rim * CORAL * 0.22;
  vec3 color = mix(ACCENT, shaded, intro);
  float alpha = clamp(0.5 - d / (1.5 * e), 0.0, 1.0);
  vec4 core = vec4(color * alpha, alpha);

  // Under the core: a soft glow and the ripple of the last caption change.
  float glow = exp(-max(d, 0.0) * 13.0) * 0.16 * intro;
  float ringRadius = 0.3 + uPulse * 0.5;
  float ring = exp(-pow((length(p) - ringRadius) / 0.014, 2.0)) * exp(-uPulse * 2.4) * 0.5 * intro;
  vec4 back = vec4(ACCENT * glow, glow);
  back = over(vec4(CORAL * ring, ring), back);

  vec4 result = back;
  float depths[3];
  vec4 sats[3];
  for (int i = 0; i < 3; i++) {
    float depth;
    sats[i] = satellite(p, float(i), t, intro, depth);
    depths[i] = depth;
  }
  for (int i = 0; i < 3; i++) {
    if (depths[i] < 0.0) result = over(sats[i], result);
  }
  result = over(core, result);
  for (int i = 0; i < 3; i++) {
    if (depths[i] >= 0.0) result = over(sats[i], result);
  }
  outColor = result;
}`;

export type CoreRenderer = {
  /** A caption changed: a ripple and a short swell. */
  readonly pulse: () => void;
  /** 0 → the flat red dot of the progress bar, 1 → the full core. */
  readonly setIntro: (value: number) => void;
  /** The dot's radius in shares of the canvas half-size (it must match the bar's height). */
  readonly setDot: (radius: number) => void;
  readonly dispose: () => void;
};

/** Seconds since the last pulse when there was none (no ripple). */
const NO_PULSE = 1000;

export function createCoreRenderer(
  canvas: HTMLCanvasElement,
  options: { readonly dprMax: number; readonly onLost: () => void },
): CoreRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const program = link(gl, FULLSCREEN_VERTEX, FRAGMENT);
  if (!program) return null;
  const vao = fullscreenTriangle(gl, program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    time: uniform('uTime'),
    intro: uniform('uIntro'),
    pulse: uniform('uPulse'),
    px: uniform('uPx'),
    dot: uniform('uDot'),
  };

  const startedAt = performance.now();
  let pulseAt = Number.NEGATIVE_INFINITY;
  let intro = 0;
  let dot = 0.05;
  let raf = 0;
  let visible = true;
  let disposed = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, options.dprMax);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const draw = (now: number) => {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    raf = requestAnimationFrame(draw);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform1f(u.time, (now - startedAt) / 1000);
    gl.uniform1f(u.intro, intro);
    gl.uniform1f(u.pulse, Math.min(NO_PULSE, (now - pulseAt) / 1000));
    gl.uniform1f(u.px, 2 / Math.max(1, Math.min(canvas.width, canvas.height)));
    gl.uniform1f(u.dot, dot);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const wake = () => {
    if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(draw);
  };

  const sizeObserver = new ResizeObserver(() => {
    resize();
    wake();
  });
  sizeObserver.observe(canvas);
  // Off screen (the step scrolled, a phone in landscape): no frames.
  const viewObserver = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    wake();
  });
  viewObserver.observe(canvas);
  document.addEventListener('visibilitychange', wake);
  const onLost = (event: Event) => {
    event.preventDefault();
    disposed = true;
    cancelAnimationFrame(raf);
    options.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  resize();
  wake();

  return {
    pulse() {
      pulseAt = performance.now();
    },
    setIntro(value: number) {
      intro = value;
    },
    setDot(radius: number) {
      dot = radius;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener('visibilitychange', wake);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
    },
  };
}
