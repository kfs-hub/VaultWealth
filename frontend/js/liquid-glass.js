/**
 * VaultWealth — Liquid Glass surface
 *
 * Applies the SVG chromatic-displacement "liquid glass" backdrop filter to an element.
 * Instead of a fixed base64 PNG (which only fits one aspect ratio), the displacement
 * map is generated as an SVG sized to the element's real box and border-radius, and
 * regenerated whenever the element resizes — so it stays correct on every screen size.
 *
 * SVG filters in `backdrop-filter` are currently Chromium-only. Other browsers get a
 * frosted-glass fallback (blur + saturate) via the `.liquidglass--fallback` class.
 */

let uid = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function isMobileOrLowPower() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth <= 768;
  return isMobileUA || isCoarse || isSmallScreen;
}

function supportsSvgBackdrop() {
  // Mobile GPUs experience severe fill-rate drops and compositing jank with SVG displacement backdrop filters
  if (isMobileOrLowPower()) return false;

  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  if (isSafari || isFirefox) return false;
  const probe = document.createElement('div');
  probe.style.backdropFilter = 'url(#probe)';
  return probe.style.backdropFilter !== '';
}

function buildDisplacementMap(width, height, radius, { borderWidth, brightness, opacity, blur }) {
  const edge = Math.min(width, height) * (borderWidth * 0.5);
  const svg = `
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/>
    </linearGradient>
    <linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="black"/>
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#r)"/>
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#b)" style="mix-blend-mode:difference"/>
  <rect x="${edge}" y="${edge}" width="${width - edge * 2}" height="${height - edge * 2}" rx="${radius}"
        fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createFilterSvg(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'glass-surface__filter');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <filter id="${id}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
        <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispRed" scale="-20" xChannelSelector="R" yChannelSelector="B"/>
        <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"/>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispGreen" scale="-24" xChannelSelector="R" yChannelSelector="B"/>
        <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"/>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispBlue" scale="-28" xChannelSelector="R" yChannelSelector="B"/>
        <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"/>
        <feBlend in="red" in2="green" mode="screen" result="rg"/>
        <feBlend in="rg" in2="blue" mode="screen" result="output"/>
        <feGaussianBlur in="output" stdDeviation="3"/>
      </filter>
    </defs>`;
  return svg;
}

/**
 * @param {HTMLElement} el
 * @param {{ borderWidth?: number, brightness?: number, opacity?: number, blur?: number }} [options]
 * @returns {{ destroy(): void }}
 */
export function initLiquidGlass(el, options = {}) {
  if (!el) return { destroy() {} };
  const opts = { borderWidth: 0.07, brightness: 50, opacity: 0.93, blur: 11, ...options };

  el.classList.add('liquidglass');

  if (!supportsSvgBackdrop()) {
    el.classList.add('liquidglass--fallback');
    return { destroy() { el.classList.remove('liquidglass', 'liquidglass--fallback'); } };
  }

  const id = `glass-filter-${++uid}`;
  const svg = createFilterSvg(id);
  const feImage = svg.querySelector('feImage');
  el.prepend(svg);
  el.style.setProperty('--filter-id', `url(#${id})`);
  el.classList.add('liquidglass--svg');

  let lastW = 0;
  let lastH = 0;
  let lastR = 0;
  const update = () => {
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    if (w === lastW && h === lastH && r === lastR) return;
    lastW = w;
    lastH = h;
    lastR = r;
    const href = buildDisplacementMap(w, h, r, opts);
    feImage.setAttribute('href', href);
    feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
  };

  const ro = new ResizeObserver(update);
  ro.observe(el);
  update();

  return {
    destroy() {
      ro.disconnect();
      svg.remove();
      el.style.removeProperty('--filter-id');
      el.classList.remove('liquidglass', 'liquidglass--svg');
    }
  };
}

export default initLiquidGlass;
