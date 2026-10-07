// GhostFibers — vanilla JS port of the React Bits component (https://reactbits.dev)
// Dependency: ogl (loaded as ESM from CDN since this frontend has no bundler)
import { Mesh, Program, Renderer, Triangle } from 'https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm';

const hexToRgb = hex => {
  const value = hex.trim().replace(/^#/, '');
  const normalized = value.length === 3 ? value.replace(/./g, c => c + c) : value;
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!match) return [1, 1, 1];
  return [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255];
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uLayers;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uLayerSpeed;
uniform float uTwist;
uniform float uTwistFrequency;
uniform float uTwistSpeed;
uniform float uLineFrequency;
uniform float uLineSpacing;
uniform float uLineSharpness;
uniform float uGlowFalloff;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform float uBlueBoost;
uniform float uVignette;
uniform float uGrain;
uniform float uRotationSpeed;
uniform float uLightMode;
uniform vec3 uLineColor;
uniform vec3 uGlowColor;

out vec4 fragColor;

#define MAX_LAYERS 10

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

float grainHash(vec2 point) {
  point = floor(point);
  float hash = 52.9829189 * fract(dot(point, vec2(0.065, 0.005)));
  return fract(hash);
}

float layeredGrain(vec2 fragmentPixel) {
  vec2 point = mod(fragmentPixel + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
  vec2 rotated = mat2(0.8, -0.5, 0.5, 0.8) * point;
  float grain = 0.0;
  grain += 0.40 * grainHash(rotated);
  grain += 0.25 * grainHash(rotated * 2.0 + 17.0);
  grain += 0.20 * grainHash(rotated * 4.0 + 47.0);
  grain += 0.10 * grainHash(rotated * 8.0 + 113.0);
  grain += 0.05 * grainHash(rotated * 16.0 + 191.0);
  return grain;
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
  float time = uTime * uSpeed;
  vec3 backdrop = mix(vec3(0.070588, 0.058824, 0.090196), vec3(1.0), step(0.5, uLightMode));
  vec3 centerTone = max(uLineColor * 0.85567 - uGlowColor * 0.06186, vec3(0.0));
  vec3 cloudTone = uLineColor * 0.19588 + uGlowColor * 0.2268;
  vec2 p = uv;
  p /= max(uScale, 0.05);
  p = rotate2d(radians(uRotation) + time * uRotationSpeed) * p;
  vec3 color = vec3(0.0);
  float fiberField = 0.0;

  for (int index = 0; index < MAX_LAYERS; index++) {
    float fi = float(index) + 1.0;
    if (fi > uLayers) break;

    p += uWaveAmplitude * sin(p.yx * fi * uWaveFrequency + time * (uWaveSpeed + fi * uLayerSpeed));

    float radius = length(p);
    float polarAngle = atan(p.y, p.x);
    polarAngle += sin(radius * uTwistFrequency - time * uTwistSpeed + fi) * uTwist;
    p = vec2(cos(polarAngle), sin(polarAngle)) * radius;

    float lines = abs(sin(p.x * (uLineFrequency + fi * uLineSpacing) + sin(p.y * 3.0 + time)));
    lines = pow(max(0.0, 1.0 - lines), uLineSharpness);
    fiberField += lines / fi;
    color += uLineColor * lines / fi;

    float glow = exp(-uGlowFalloff * abs(sin(p.x * 3.0 + time + fi)));
    color += uGlowColor * glow * uGlowIntensity / (fi * 2.0);
  }

  float center = exp(-2.2 * dot(uv, uv));
  color += centerTone * center;

  float cloud = exp(-1.5 * length(uv + vec2(sin(time * 0.3) * 0.25, cos(time * 0.25) * 0.18)));
  color += cloudTone * cloud;

  float vignette = 1.0 - smoothstep(0.35, 1.45, length(uv));
  color *= mix(1.0 - uVignette, 1.0, vignette);
  color = 1.0 - exp(-color * uBrightness);
  color.b *= uBlueBoost;

  vec3 outputColor;
  if (uLightMode > 0.5) {
    float edgeFade = mix(1.0 - uVignette, 1.0, vignette);
    float fibers = pow(smoothstep(0.12, 1.05, fiberField) * edgeFade, 1.5);
    float atmosphere = (center * 0.025 + cloud * 0.015) * edgeFade;
    vec3 fiberInk = mix(backdrop, uLineColor, 0.52);
    vec3 airColor = mix(backdrop, uGlowColor, 0.16);

    outputColor = mix(backdrop, airColor, atmosphere);
    outputColor = mix(outputColor, fiberInk, fibers * 0.3);
  } else {
    outputColor = backdrop + color;
  }

  float noise = (layeredGrain(gl_FragCoord.xy) - 0.5) * uGrain;
  outputColor = clamp(outputColor + noise, 0.0, 1.0);
  fragColor = vec4(outputColor, 1.0);
}
`;

const DEFAULTS = {
  lineColor: '#140E35',
  glowColor: '#3437A0',
  speed: 0.2,
  scale: 2,
  rotation: 0,
  rotationSpeed: 0.25,
  layers: 4,
  waveAmplitude: 0.015,
  waveFrequency: 3,
  waveSpeed: 0.15,
  layerSpeed: 0.08,
  twist: 0.1,
  twistFrequency: 5,
  twistSpeed: 1.2,
  lineFrequency: 5,
  lineSpacing: 2,
  lineSharpness: 16,
  glowFalloff: 10,
  glowIntensity: 1.6,
  brightness: 2,
  blueBoost: 1.25,
  vignette: 0.8,
  grain: 0.05,
  lightMode: false,
  dpr: 1,
  fps: 60,
  paused: false
};

/**
 * Mount GhostFibers into a container element.
 * @param {HTMLElement} container
 * @param {Partial<typeof DEFAULTS>} options
 * @returns {{ update(opts): void, destroy(): void }}
 */
export function createGhostFibers(container, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  container.classList.add('ghost-fibers-container');

  const renderer = new Renderer({
    webgl: 2,
    alpha: false,
    antialias: false,
    dpr: Math.min(Math.max(opts.dpr, 0.5), 2)
  });
  const gl = renderer.gl;
  const canvas = gl.canvas;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uResolution: { value: new Float32Array([1, 1]) },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uScale: { value: 0 },
      uRotation: { value: 0 },
      uRotationSpeed: { value: 0 },
      uLayers: { value: 0 },
      uWaveAmplitude: { value: 0 },
      uWaveFrequency: { value: 0 },
      uWaveSpeed: { value: 0 },
      uLayerSpeed: { value: 0 },
      uTwist: { value: 0 },
      uTwistFrequency: { value: 0 },
      uTwistSpeed: { value: 0 },
      uLineFrequency: { value: 0 },
      uLineSpacing: { value: 0 },
      uLineSharpness: { value: 0 },
      uGlowFalloff: { value: 0 },
      uGlowIntensity: { value: 0 },
      uBrightness: { value: 0 },
      uBlueBoost: { value: 0 },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uLightMode: { value: 0 },
      uLineColor: { value: new Float32Array(3) },
      uGlowColor: { value: new Float32Array(3) }
    }
  });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  let frameId = 0;
  let elapsed = 0;
  let previousTime = performance.now();
  let lastRenderTime = 0;
  let frameRate = 60;
  let isPaused = false;
  let isVisible = true;
  let isPageVisible = !document.hidden;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const render = () => renderer.render({ scene: mesh });
  const stop = () => {
    if (frameId !== 0) cancelAnimationFrame(frameId);
    frameId = 0;
  };
  const canAnimate = () => isVisible && isPageVisible && !isPaused && !reducedMotion.matches;

  const loop = now => {
    frameId = 0;
    if (!canAnimate()) return;
    const delta = Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    elapsed += delta;
    if (now - lastRenderTime >= 1000 / frameRate - 0.5) {
      program.uniforms.uTime.value = elapsed;
      render();
      lastRenderTime = now;
    }
    frameId = requestAnimationFrame(loop);
  };

  const start = () => {
    if (!canAnimate() || frameId !== 0) return;
    previousTime = performance.now();
    frameId = requestAnimationFrame(loop);
  };

  let currentW = 0;
  let currentH = 0;
  const setSize = () => {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w === currentW && h === currentH) return;
    currentW = w;
    currentH = h;
    renderer.setSize(w, h);
    program.uniforms.uResolution.value[0] = gl.drawingBufferWidth;
    program.uniforms.uResolution.value[1] = gl.drawingBufferHeight;
    render();
  };

  const applyOptions = () => {
    const u = program.uniforms;
    u.uLineColor.value.set(hexToRgb(opts.lineColor));
    u.uGlowColor.value.set(hexToRgb(opts.glowColor));
    u.uSpeed.value = opts.speed;
    u.uScale.value = opts.scale;
    u.uRotation.value = opts.rotation;
    u.uRotationSpeed.value = opts.rotationSpeed;
    u.uLayers.value = Math.min(Math.max(Math.round(opts.layers), 1), 10);
    u.uWaveAmplitude.value = opts.waveAmplitude;
    u.uWaveFrequency.value = opts.waveFrequency;
    u.uWaveSpeed.value = opts.waveSpeed;
    u.uLayerSpeed.value = opts.layerSpeed;
    u.uTwist.value = opts.twist;
    u.uTwistFrequency.value = opts.twistFrequency;
    u.uTwistSpeed.value = opts.twistSpeed;
    u.uLineFrequency.value = opts.lineFrequency;
    u.uLineSpacing.value = opts.lineSpacing;
    u.uLineSharpness.value = opts.lineSharpness;
    u.uGlowFalloff.value = opts.glowFalloff;
    u.uGlowIntensity.value = opts.glowIntensity;
    u.uBrightness.value = opts.brightness;
    u.uBlueBoost.value = opts.blueBoost;
    u.uVignette.value = opts.vignette;
    u.uGrain.value = opts.grain;
    u.uLightMode.value = opts.lightMode ? 1 : 0;
    frameRate = Math.min(Math.max(opts.fps, 1), 120);
    isPaused = !!opts.paused;
    if (canAnimate()) start();
    else stop();
    render();
  };

  const handleVisibility = () => {
    isPageVisible = !document.hidden;
    if (canAnimate()) start();
    else stop();
  };
  const handleReducedMotion = () => {
    if (canAnimate()) start();
    else {
      stop();
      render();
    }
  };

  const resizeObserver = new ResizeObserver(setSize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry.isIntersecting;
      if (canAnimate()) start();
      else stop();
    },
    { threshold: 0 }
  );
  intersectionObserver.observe(container);
  document.addEventListener('visibilitychange', handleVisibility);
  reducedMotion.addEventListener('change', handleReducedMotion);

  applyOptions();
  setSize();
  start();

  return {
    update(next = {}) {
      Object.assign(opts, next);
      applyOptions();
    },
    destroy() {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      reducedMotion.removeEventListener('change', handleReducedMotion);
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

/** Shared VaultWealth background settings (used by index, login and register). */
export const VAULT_PRESET = {
  lineColor: '#3c3560',
  glowColor: '#d7d7d7',
  speed: 0.2,
  scale: 2,
  rotation: 0,
  rotationSpeed: 0.25,
  layers: 4,
  waveAmplitude: 0.015,
  waveFrequency: 3,
  waveSpeed: 0.15,
  layerSpeed: 0.08,
  twist: 0.1,
  twistFrequency: 5,
  twistSpeed: 1.2,
  lineFrequency: 5,
  lineSpacing: 2,
  lineSharpness: 16,
  glowFalloff: 10,
  glowIntensity: 1.6,
  brightness: 2,
  blueBoost: 1.25,
  vignette: 0.8,
  grain: 0.05,
  dpr: 1
};

/** Check if running on a mobile or low-power device */
export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth <= 768;
  return isMobileUA || isCoarse || isSmallScreen;
};

/** Mount the VaultWealth background into an element and fade it in. */
export function mountVaultBackground(el, extraOptions = {}) {
  if (!el) return null;
  try {
    const isMobile = isMobileDevice();
    const mobileOverrides = isMobile ? {
      layers: 2,
      grain: 0,
      dpr: 0.75,
      fps: 30
    } : {};
    const instance = createGhostFibers(el, { ...VAULT_PRESET, ...mobileOverrides, ...extraOptions });
    requestAnimationFrame(() => el.classList.add('ready'));
    return instance;
  } catch (err) {
    console.warn('GhostFibers unavailable (WebGL2 required):', err);
    return null;
  }
}

export default createGhostFibers;
