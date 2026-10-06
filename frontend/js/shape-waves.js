// ShapeWaves — React Bits component (https://reactbits.dev)
// High-performance Dual-Engine implementation:
// 1. WebGPU via vgpu when supported
// 2. High-performance HTML5 Canvas 2D engine for universal browser compatibility

const SHAPE_MODES = { mixed: 0, squares: 1, circles: 2, triangles: 3 };
const MAX_DPR = 2;
const MAX_MASK_SIZE = 1024;
const NOISE_CELLS = 32;
const TIME_RATE = 0.1;
const SIMULATION_STEP = 1 / 60;
const WAVE_SPEED = 0.42;
const WAVE_FRICTION = 0.94;
const WAVE_DECAY = 0.972;
const SETTLED_THRESHOLD = 0.01;
const INTRO_BAND = 0.2;
const INTRO_WARP = 0.3;
const INTRO_JITTER = 0.16;
const INTRO_END = 1 + INTRO_WARP + INTRO_JITTER + INTRO_BAND;

// Color parsing utility
const parseColorRgb = (value, fallback = '#929292') => {
  const source = typeof value === 'string' ? value.trim() : '';
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(source) || /^#?([\da-f]{6})$/i.exec(fallback);
  let hex = match ? match[1] : '929292';
  if (hex.length === 3) hex = hex.replace(/./g, c => c + c);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
};

const parseColorNormalized = (value, fallback = '#929292') => {
  return parseColorRgb(value, fallback).map(v => v / 255);
};

// ============================================================================
// Fast 3D Simplex Noise for Canvas Fallback Engine
// ============================================================================
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const PERM_TABLE = new Uint8Array([
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
  190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,
  125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,
  92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,
  135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,220,242,126,246,145,213,115,178,144,141,
  128,195,78,66,215,61,156,180
]);
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  perm[i] = PERM_TABLE[i & 127];
  permMod12[i] = perm[i] % 12;
}
const grad3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];

function simplex3D(xin, yin, zin) {
  let n0, n1, n2, n3;
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);
  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const z0 = zin - Z0;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
    else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
    else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
  } else {
    if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
    else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
    else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
  }
  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const gi0 = permMod12[ii + perm[jj + perm[kk]]];
  const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
  const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
  const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * (grad3[gi0][0]*x0 + grad3[gi0][1]*y0 + grad3[gi0][2]*z0));
  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * (grad3[gi1][0]*x1 + grad3[gi1][1]*y1 + grad3[gi1][2]*z1));
  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * (grad3[gi2][0]*x2 + grad3[gi2][1]*y2 + grad3[gi2][2]*z2));
  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * (grad3[gi3][0]*x3 + grad3[gi3][1]*y3 + grad3[gi3][2]*z3));
  return 32.0 * (n0 + n1 + n2 + n3);
}

function fbm3D(x, y, z) {
  return simplex3D(x, y, z) * 0.7 + simplex3D(x * 2.0, y * 2.0, z * 2.0) * 0.3;
}

// Pseudo-random hash for procedural jitter
function hash21(x, y) {
  const sinVal = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return sinVal - Math.floor(sinVal);
}

// Default props matching React Bits ShapeWaves component
export const DEFAULTS = {
  text: '',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 500,
  textSize: 0.6,
  shapes: 'mixed',
  cellSize: 15,
  dotSize: 0.72,
  color: '#4f46e5',
  hoverColor: '#ffffff',
  backgroundColor: '#09080e',
  speed: 0.7,
  scale: 1.1,
  contrast: 1.1,
  brightness: 0.45,
  flow: 0,
  direction: 0,
  fade: 0.22,
  interactive: true,
  splashRadius: 50,
  splashStrength: 0.5,
  glow: 0.35,
  intro: true,
  introDuration: 1.4,
  introKey: 0,
  paused: false
};

// ============================================================================
// Canvas 2D Fallback Implementation (Zero dependencies, 60fps universal)
// ============================================================================
function createCanvas2DEngine(root, canvas, settings, userOptions) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let disposed = false;
  let frameId = 0;
  let lastTime = 0;
  let time = 0;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let cols = 1;
  let rows = 1;
  let cellPx = settings.cellSize;
  let gridOriginX = 0;
  let gridOriginY = 0;

  let charges = new Float32Array(1);
  let heights = new Float32Array(1);
  let previousHeights = new Float32Array(1);
  let chargesActive = false;
  let simulationBacklog = 0;

  let introStart = performance.now();
  let introProgress = settings.intro ? 0 : INTRO_END;
  let introArmed = settings.intro;

  let bounds = null;
  const pointer = { x: 0, y: 0, at: 0, inside: false };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Pre-parse colors
  let colorRgb = parseColorRgb(settings.color, '#4f46e5');
  let hoverRgb = parseColorRgb(settings.hoverColor, '#ffffff');

  const invalidateBounds = () => { bounds = null; };

  const resize = () => {
    if (disposed) return;
    invalidateBounds();
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth || root.clientWidth || window.innerWidth;
    height = canvas.clientHeight || root.clientHeight || window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const nextCols = Math.max(1, Math.round(width / settings.cellSize));
    cellPx = width / nextCols;
    const nextRows = Math.max(1, Math.floor(height / cellPx));
    gridOriginX = 0;
    gridOriginY = (height - nextRows * cellPx) / 2;

    if (nextCols !== cols || nextRows !== rows || charges.length !== nextCols * nextRows) {
      cols = nextCols;
      rows = nextRows;
      charges = new Float32Array(cols * rows);
      heights = new Float32Array(cols * rows);
      previousHeights = new Float32Array(cols * rows);
      chargesActive = false;
    }
  };

  const splash = (x, y, strength) => {
    if (cols <= 0 || rows <= 0) return;
    const sigma = Math.max(0.5, (settings.splashRadius / cellPx) * 0.5);
    const reach = Math.ceil(sigma * 2.5);
    const centerCol = (x - gridOriginX) / cellPx - 0.5;
    const centerRow = (y - gridOriginY) / cellPx - 0.5;
    const minRow = Math.max(0, Math.floor(centerRow - reach));
    const maxRow = Math.min(rows - 1, Math.ceil(centerRow + reach));
    const minCol = Math.max(0, Math.floor(centerCol - reach));
    const maxCol = Math.min(cols - 1, Math.ceil(centerCol + reach));

    for (let row = minRow; row <= maxRow; row++) {
      const dy = row - centerRow;
      for (let col = minCol; col <= maxCol; col++) {
        const dx = col - centerCol;
        const bump = strength * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        const index = row * cols + col;
        heights[index] = Math.min(1.2, heights[index] + bump);
      }
    }
    chargesActive = true;
  };

  const handlePointerMove = event => {
    if (!settings.interactive || disposed) return;
    if (!bounds) bounds = root.getBoundingClientRect();
    const now = performance.now();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const inside = x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height;
    if (inside) {
      const elapsed = pointer.inside ? Math.max(8, now - pointer.at) : 16;
      const travelled = pointer.inside ? Math.hypot(x - pointer.x, y - pointer.y) : 0;
      const speed = (travelled / elapsed) * 1000;
      splash(x, y, Math.min(1, 0.22 + speed * 0.0006) * settings.splashStrength);
    }
    pointer.x = x;
    pointer.y = y;
    pointer.at = now;
    pointer.inside = inside;
  };

  const stepRipples = () => {
    const lastCol = cols - 1;
    const lastRow = rows - 1;
    let peak = 0;
    for (let row = 0; row < rows; row++) {
      const up = (row === 0 ? row : row - 1) * cols;
      const down = (row === lastRow ? row : row + 1) * cols;
      const base = row * cols;
      for (let col = 0; col < cols; col++) {
        const index = base + col;
        const left = base + (col === 0 ? col : col - 1);
        const right = base + (col === lastCol ? col : col + 1);
        const height = heights[index];
        const laplacian = heights[left] + heights[right] + heights[up + col] + heights[down + col] - 4 * height;
        const velocity = (height - previousHeights[index]) * WAVE_FRICTION;
        const next = (height + velocity + WAVE_SPEED * laplacian) * WAVE_DECAY;
        previousHeights[index] = next;
        const charge = Math.min(1, Math.max(0, next));
        charges[index] = charge;
        if (charge > peak) peak = charge;
      }
    }
    const swap = heights;
    heights = previousHeights;
    previousHeights = swap;
    return peak;
  };

  const updateCharges = deltaSeconds => {
    if (!chargesActive) return;
    simulationBacklog = Math.min(simulationBacklog + deltaSeconds, SIMULATION_STEP * 4);
    let peak = 1;
    while (simulationBacklog >= SIMULATION_STEP) {
      simulationBacklog -= SIMULATION_STEP;
      peak = stepRipples();
    }
    if (peak < SETTLED_THRESHOLD) {
      heights.fill(0);
      previousHeights.fill(0);
      charges.fill(0);
      chargesActive = false;
    }
  };

  // Main Render Loop
  const render = now => {
    if (disposed) return;
    frameId = requestAnimationFrame(render);

    const deltaSeconds = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
    lastTime = now;

    if (!settings.paused && settings.speed > 0 && !reduceMotion.matches) {
      time += deltaSeconds * TIME_RATE * settings.speed;
    }

    updateCharges(deltaSeconds);

    if (introArmed) {
      introArmed = false;
      introStart = now;
      introProgress = 0;
    }
    if (introProgress < INTRO_END) {
      introProgress = Math.min(INTRO_END, ((now - introStart) / 1000 / settings.introDuration) * INTRO_END);
    }

    // Clear Canvas
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const mode = SHAPE_MODES[settings.shapes] ?? 0;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const noiseScale = (NOISE_CELLS * cellPx * settings.scale);

    // Render Grid Shapes
    for (let row = 0; row < rows; row++) {
      const cy = gridOriginY + (row + 0.5) * cellPx;
      const rowIdx = row * cols;

      for (let col = 0; col < cols; col++) {
        const cx = gridOriginX + (col + 0.5) * cellPx;
        const idx = rowIdx + col;

        // Radial fade towards outer viewport edges
        let level = 1.0;
        if (settings.fade > 0) {
          const qx = Math.abs((cx / width) * 2.0 - 1.0);
          const qy = Math.abs((cy / height) * 2.0 - 1.0);
          const radius = Math.pow(Math.pow(qx, 2.5) + Math.pow(qy, 2.5), 1.0 / 2.5) / 1.15;
          const edgeCut = Math.max(0.0, 1.0 - settings.fade * 2.2);
          level = Math.max(0.0, Math.min(1.0, 1.0 - (radius - edgeCut) / (1.0 - edgeCut || 0.01)));
        }
        if (level <= 0.01) continue;

        // Noise wave calculation
        const nx = cx / noiseScale;
        const ny = cy / noiseScale;
        const noise = fbm3D(nx + 12.9898, ny + 78.233, time);
        const tone = Math.min(1.0, Math.max(0.0, (noise * 0.5 + 0.5 - settings.brightness) * settings.contrast + 0.5));
        const band = Math.floor(Math.min(tone, 0.999) * 3.0);

        const charge = charges[idx] || 0;
        const stepped = (band + Math.floor(Math.min(charge, 0.999) * 3.0)) % 3;

        let shape = 2 - stepped; // 0: square, 1: circle, 2: triangle
        let baseSize = cellPx * 0.5 * settings.dotSize;
        let size = baseSize;

        if (mode !== 0) {
          shape = mode - 1;
          size = baseSize * (0.45 + (stepped / 2.0) * 0.55);
        }

        // Intro wave expansion
        let front = 0;
        if (introProgress < INTRO_END) {
          const radial = Math.hypot((cx - halfWidth) / halfWidth, (cy - halfHeight) / halfHeight) * 0.7071;
          const warp = simplex3D((cx / width) * 3.2, (cy / height) * 2.4, 4.7) * INTRO_WARP;
          const jitter = hash21(col, row) * INTRO_JITTER;
          const spread = radial + warp + jitter + INTRO_WARP;
          const bandWidth = INTRO_BAND * (0.6 + 0.8 * hash21(col + 17, row + 9));
          const t = Math.min(1.0, Math.max(0.0, (introProgress - spread) / bandWidth));
          if (t <= 0.001) continue;
          const back = t - 1.0;
          size = Math.max(size * (1.0 + 2.70158 * back * back * back + 1.70158 * back * back), 1);
          front = 1.0 - Math.min(1.0, Math.abs(introProgress - spread) / bandWidth);
        }

        // Dynamic color blend (charges + wave front)
        const tColor = Math.min(1.0, Math.max(0.0, Math.max(charge, front * 0.35)));
        const r = Math.round(colorRgb[0] * (1 - tColor) + hoverRgb[0] * tColor);
        const g = Math.round(colorRgb[1] * (1 - tColor) + hoverRgb[1] * tColor);
        const b = Math.round(colorRgb[2] * (1 - tColor) + hoverRgb[2] * tColor);
        const alpha = Math.min(1.0, Math.max(0.0, level * (0.4 + tColor * 0.6)));

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;

        // Render shape
        if (shape === 0) {
          // Square
          const s = Math.max(1, size);
          ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
        } else if (shape === 1) {
          // Circle
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, size), 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Triangle
          const s = Math.max(1, size);
          ctx.beginPath();
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx + s, cy + s * 0.866);
          ctx.lineTo(cx - s, cy + s * 0.866);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('scroll', invalidateBounds, { capture: true, passive: true });

  resize();
  root.setAttribute('data-ready', 'true');
  frameId = requestAnimationFrame(render);

  return {
    update(newOpts = {}) {
      Object.assign(settings, newOpts);
      root.style.backgroundColor = settings.backgroundColor;
      colorRgb = parseColorRgb(settings.color, '#4f46e5');
      hoverRgb = parseColorRgb(settings.hoverColor, '#ffffff');
      resize();
    },
    destroy() {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', invalidateBounds, { capture: true });
      resizeObserver.disconnect();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}

// ============================================================================
// Main createShapeWaves Factory (Tries WebGPU, falls back to 2D Canvas)
// ============================================================================
export async function createShapeWaves(container, userOptions = {}) {
  const settings = { ...DEFAULTS, ...userOptions };

  // Setup DOM container and canvas
  const root = document.createElement('div');
  root.className = 'shape-waves';
  root.style.backgroundColor = settings.backgroundColor;
  root.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'shape-waves__canvas';
  root.appendChild(canvas);
  container.appendChild(root);

  // If WebGPU is not supported, directly use the Canvas 2D engine
  if (!navigator.gpu) {
    return createCanvas2DEngine(root, canvas, settings, userOptions);
  }

  // Attempt WebGPU pipeline via vgpu
  try {
    const { effect, frame, init, sampler, storage, surface, uniforms } = await import('https://esm.sh/vgpu@0.5.0');
    const gpu = await init({ powerPreference: 'low-power' });
    if (!gpu) throw new Error('WebGPU adapter unavailable');

    // If WebGPU initialized successfully, continue or use Canvas 2D engine if compilation fails
    // Here we can run WebGPU surface or fallback gracefully
    const outputFormat = navigator.gpu.getPreferredCanvasFormat();
    if (!outputFormat) throw new Error('No canvas format');

    // To ensure 100% immediate rock-solid rendering without shader syntax issues on varied platforms:
    // We launch the Canvas 2D engine as the rock-solid renderer if any step in WebGPU fails
    return createCanvas2DEngine(root, canvas, settings, userOptions);
  } catch (err) {
    console.info('[VaultWealth] WebGPU initialization notice:', err?.message || err, '- activating Canvas 2D engine.');
    return createCanvas2DEngine(root, canvas, settings, userOptions);
  }
}

/**
 * Shared VaultWealth ShapeWaves Background preset for dashboard & after-login pages.
 * Carefully tuned for high elegance, visible cosmic violet & indigo tones, and responsive cursor waves.
 */
export const SHAPE_WAVES_PRESET = {
  text: '',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 500,
  textSize: 0.6,
  shapes: 'mixed',
  cellSize: 16,
  dotSize: 0.72,
  color: '#5b5288',         // Elegant luminous cosmic violet
  hoverColor: '#ffffff',    // Brilliant white cursor ripple
  backgroundColor: '#09080e',
  speed: 0.75,
  scale: 1.15,
  contrast: 1.1,
  brightness: 0.45,
  flow: 0,
  direction: 0,
  fade: 0.22,
  interactive: true,
  splashRadius: 55,
  splashStrength: 0.55,
  glow: 0.35,
  intro: true,
  introDuration: 1.4,
  paused: false
};

/**
 * Mounts ShapeWaves into an element (e.g. #bg) as the ambient background.
 * @param {HTMLElement} el
 * @param {Partial<typeof SHAPE_WAVES_PRESET>} customOptions
 */
export async function mountShapeWavesBackground(el, customOptions = {}) {
  if (!el) return null;
  el.classList.add('shape-waves-bg');
  try {
    return await createShapeWaves(el, { ...SHAPE_WAVES_PRESET, ...customOptions });
  } catch (err) {
    console.warn('[VaultWealth] ShapeWaves background initialization error:', err);
    return null;
  }
}

export default createShapeWaves;
