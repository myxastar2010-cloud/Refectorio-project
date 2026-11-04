/** Small WebGL2 helpers shared by the finale's core and its reveal wave. */

export function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV) console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function link(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) console.warn(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Links a program without blocking the page (stage-3 performance audit, F2): reading a compile or link status makes the
 * browser wait for the GPU driver (125–199 ms on the team's laptop), so with KHR_parallel_shader_compile the program
 * compiles in the background and is polled once a frame; without the extension it is linked as before.
 */
export function linkInBackground(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): Promise<WebGLProgram | null> {
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as {
    readonly COMPLETION_STATUS_KHR: number;
  } | null;
  if (!parallel) return Promise.resolve(link(gl, vertex, fragment));
  const program = gl.createProgram();
  const shaders = [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type);
    if (!shader) {
      gl.deleteProgram(program);
      return Promise.resolve(null);
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.isContextLost()) {
        resolve(null);
        return;
      }
      if (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
        requestAnimationFrame(poll);
        return;
      }
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        resolve(program);
        return;
      }
      if (import.meta.env.DEV) console.warn(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      resolve(null);
    };
    requestAnimationFrame(poll);
  });
}

/** One triangle that covers the viewport; the vertex shader passes clip-space xy on as `vUv` (−1…1). */
export const FULLSCREEN_VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export function fullscreenTriangle(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): { readonly vao: WebGLVertexArrayObject; readonly buffer: WebGLBuffer } {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  return { vao, buffer };
}

/** WebGL2 is worth trying: it exists, the person has not asked for less motion or less data. */
export function glWanted(calm: boolean): boolean {
  if (calm) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  return typeof WebGL2RenderingContext !== 'undefined';
}
