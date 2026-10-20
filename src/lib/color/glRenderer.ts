import { FALSE_COLOR_BANDS } from "./monitor";
import { CONTRAST_PIVOT, type ColorQualifier, type GradeUniforms } from "./grade";
import type { MonitorMode, StillCompareMode } from "./useColorReview";

// One full-screen pass renders everything drawn over the picture: the local
// grade (masked by region and qualifier), the selection matte, a still-frame
// comparison and the monitoring views. Running on the GPU keeps all of it live
// during playback at display resolution.

const MONITOR_CODES: Record<MonitorMode, number> = {
  normal: 0,
  "false-color": 1,
  luma: 2,
  red: 3,
  green: 4,
  blue: 5,
};

const STILL_CODES: Record<StillCompareMode, number> = {
  wipe: 1,
  side: 2,
  difference: 3,
  onion: 4,
};

const falseColorBands = FALSE_COLOR_BANDS.map((band) => {
  const color = band.color ? band.color.map((value) => (value / 255).toFixed(4)).join(", ") : null;
  return `  if (l < ${(band.to / 100).toFixed(4)}) return ${color ? `vec3(${color})` : "vec3(l)"};`;
}).join("\n");

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform sampler2D uStill;

uniform bool uGradeOn;
uniform bool uHasMask;
uniform float uGradeFrom;     // grade applies where the frame x >= this (split wipe)
uniform vec3 uGains;
uniform mat3 uMatrix;
uniform float uVibrance;
uniform vec4 uTone;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uOffset;
uniform vec3 uGammaExp;
uniform float uContrast;

uniform bool uQualOn;
uniform vec3 uQualHue;        // center (0..1 turns), half width (turns), all-hues flag
uniform vec2 uQualSat;
uniform vec2 uQualLuma;
uniform float uQualSoft;

uniform int uMatte;           // 0 off, 1 highlight selection, 2 black/white matte
uniform int uMonitor;
uniform int uStillMode;       // 0 off, 1 wipe, 2 side by side, 3 difference, 4 onion
uniform float uStillSplit;
uniform float uStillOpacity;

const vec3 W = vec3(0.2126, 0.7152, 0.0722);
const float PIVOT = ${CONTRAST_PIVOT.toFixed(4)};

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// Mirrors applyGrade() in grade.ts.
vec3 grade(vec3 src) {
  vec3 c = toLinear(src) * uGains;
  c = uMatrix * c;
  if (uVibrance != 0.0) {
    float mx = max(max(c.r, c.g), c.b);
    float mn = min(min(c.r, c.g), c.b);
    float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
    float y = dot(c, W);
    c = y + (c - y) * (1.0 + uVibrance * (1.0 - sat));
  }
  vec3 v = toSrgb(c);
  float l = dot(v, W);
  v += uTone.x * (1.0 - smoothstep(0.0, 0.55, l))
     + uTone.y * smoothstep(0.45, 1.0, l)
     + uTone.z * smoothstep(0.75, 1.0, l)
     + uTone.w * (1.0 - smoothstep(0.0, 0.25, l));
  v = v + uLift * (1.0 - v);
  v = v * uGain + uOffset;
  v = pow(max(v, 0.0), uGammaExp);
  v = PIVOT + (v - PIVOT) * uContrast;
  return clamp(v, 0.0, 1.0);
}

float band(float value, float low, float high, float soft) {
  float lower = soft > 0.0 ? smoothstep(low - soft, low, value) : step(low, value);
  float upper = soft > 0.0 ? 1.0 - smoothstep(high, high + soft, value) : step(value, high);
  return lower * upper;
}

float qualify(vec3 c) {
  if (!uQualOn) return 1.0;
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float d = mx - mn;
  float light = (mx + mn) * 0.5;
  float sat = d == 0.0 ? 0.0 : d / (1.0 - abs(2.0 * light - 1.0));
  float hueWeight = 1.0;
  if (uQualHue.z < 0.5) {
    float h = 0.0;
    if (d > 0.0) {
      if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
      else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
      else h = (c.r - c.g) / d + 4.0;
      h /= 6.0;
    }
    float dist = abs(h - uQualHue.x);
    dist = min(dist, 1.0 - dist);
    hueWeight = 1.0 - smoothstep(uQualHue.y, uQualHue.y + uQualSoft * 0.5 + 0.0001, dist);
    // Greys have no hue; fade them out of a hue key.
    hueWeight *= smoothstep(0.0, 0.08, sat);
  }
  return hueWeight
    * band(sat, uQualSat.x, uQualSat.y, uQualSoft)
    * band(dot(c, W), uQualLuma.x, uQualLuma.y, uQualSoft);
}

vec3 falseColor(float l) {
${falseColorBands}
  return vec3(l);
}

vec3 monitor(vec3 c) {
  if (uMonitor == 1) return falseColor(dot(c, W));
  if (uMonitor == 2) return vec3(dot(c, W));
  if (uMonitor == 3) return vec3(c.r);
  if (uMonitor == 4) return vec3(c.g);
  if (uMonitor == 5) return vec3(c.b);
  return c;
}

// The live picture at frame uv, with the local grade and matte applied.
vec3 live(vec2 uv) {
  vec3 src = texture(uVideo, uv).rgb;
  if (!uGradeOn && uMatte == 0) return src;
  float m = (uHasMask ? texture(uMask, uv).r : 1.0) * qualify(src);
  if (uMatte == 2) return vec3(m);
  vec3 c = src;
  if (uGradeOn && uv.x >= uGradeFrom) c = mix(src, grade(src), m);
  if (uMatte == 1) c = mix(vec3(dot(src, W)) * 0.3, c, m);
  return c;
}

void main() {
  vec2 uv = vUv;
  vec3 color;
  if (uStillMode == 2) {
    // Side by side: each picture at half size, centered vertically.
    bool left = uv.x < 0.5;
    vec2 local = vec2(left ? uv.x * 2.0 : (uv.x - 0.5) * 2.0, (uv.y - 0.25) * 2.0);
    if (local.y < 0.0 || local.y > 1.0) {
      color = vec3(0.0);
    } else {
      color = left ? texture(uStill, local).rgb : live(local);
    }
  } else if (uStillMode == 1) {
    color = uv.x < uStillSplit ? texture(uStill, uv).rgb : live(uv);
  } else if (uStillMode == 3) {
    color = clamp(abs(live(uv) - texture(uStill, uv).rgb) * 4.0, 0.0, 1.0);
  } else if (uStillMode == 4) {
    color = mix(live(uv), texture(uStill, uv).rgb, uStillOpacity);
  } else {
    color = live(uv);
  }
  outColor = vec4(monitor(color), 1.0);
}`;

export type GradeRenderState = {
  uniforms: GradeUniforms;
  /** Where the graded side of a before/after split starts (0 = everywhere). */
  gradeFrom: number;
  qualifier: ColorQualifier | null;
};

export type RenderState = {
  grade: GradeRenderState | null;
  matte: 0 | 1 | 2;
  monitor: MonitorMode;
  still: { mode: StillCompareMode; split: number; opacity: number } | null;
};

export class UnsupportedRendererError extends Error {}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

export class FrameRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private videoTexture: WebGLTexture;
  private maskTexture: WebGLTexture;
  private stillTexture: WebGLTexture;
  private hasMask = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      // Lets tests and "export frame" read back what's on screen.
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new UnsupportedRendererError("WebGL2 is unavailable");
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.videoTexture = this.createTexture(0, "uVideo");
    this.maskTexture = this.createTexture(1, "uMask");
    this.stillTexture = this.createTexture(2, "uStill");
  }

  private createTexture(unit: number, name: string) {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.uniform1i(this.location(name), unit);
    return texture;
  }

  private location(name: string) {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name) ?? null;
  }

  /** Coverage mask (one byte per pixel), or null for "whole frame". */
  setMask(mask: { data: Uint8Array; width: number; height: number } | null) {
    const gl = this.gl;
    this.hasMask = Boolean(mask);
    if (!mask) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      mask.width,
      mask.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      mask.data,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  setStill(source: TexImageSource | null) {
    if (!source) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.stillTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /**
   * Upload the current video frame and draw. Throws a SecurityError when the
   * source isn't CORS-readable.
   */
  render(video: HTMLVideoElement, state: RenderState, width: number, height: number) {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const grade = state.grade;
    gl.uniform1i(this.location("uGradeOn"), grade ? 1 : 0);
    gl.uniform1i(this.location("uHasMask"), this.hasMask ? 1 : 0);
    if (grade) {
      const u = grade.uniforms;
      gl.uniform1f(this.location("uGradeFrom"), grade.gradeFrom);
      gl.uniform3fv(this.location("uGains"), u.gains);
      // GLSL mat3 is column-major; transpose our row-major matrix.
      const m = u.matrix;
      gl.uniformMatrix3fv(this.location("uMatrix"), false, [
        m[0],
        m[3],
        m[6],
        m[1],
        m[4],
        m[7],
        m[2],
        m[5],
        m[8],
      ]);
      gl.uniform1f(this.location("uVibrance"), u.vibrance);
      gl.uniform4fv(this.location("uTone"), u.tone);
      gl.uniform3fv(this.location("uLift"), u.lift);
      gl.uniform3fv(this.location("uGain"), u.gain);
      gl.uniform3fv(this.location("uOffset"), u.offset);
      gl.uniform3fv(this.location("uGammaExp"), u.gammaExponent);
      gl.uniform1f(this.location("uContrast"), u.contrast);
    }
    const qualifier = grade?.qualifier ?? null;
    gl.uniform1i(this.location("uQualOn"), qualifier ? 1 : 0);
    if (qualifier) {
      gl.uniform3f(
        this.location("uQualHue"),
        qualifier.hueCenter / 360,
        qualifier.hueWidth / 720,
        qualifier.hueWidth >= 360 ? 1 : 0,
      );
      gl.uniform2f(this.location("uQualSat"), qualifier.satLow, qualifier.satHigh);
      gl.uniform2f(this.location("uQualLuma"), qualifier.lumaLow, qualifier.lumaHigh);
      gl.uniform1f(this.location("uQualSoft"), qualifier.softness);
    }
    gl.uniform1i(this.location("uMatte"), state.matte);
    gl.uniform1i(this.location("uMonitor"), MONITOR_CODES[state.monitor]);
    gl.uniform1i(this.location("uStillMode"), state.still ? STILL_CODES[state.still.mode] : 0);
    gl.uniform1f(this.location("uStillSplit"), state.still?.split ?? 0.5);
    gl.uniform1f(this.location("uStillOpacity"), state.still?.opacity ?? 0.5);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.videoTexture);
    gl.deleteTexture(this.maskTexture);
    gl.deleteTexture(this.stillTexture);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
