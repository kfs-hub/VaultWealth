/**
 * VaultWealth — GlassSurface Engine (React Bits Port)
 * 
 * Provides liquid glass chromatic refraction, SVG displacement mapping,
 * and high-fidelity fallback for mobile bottom navigation.
 */

(function () {
  'use strict';

  let instanceCounter = 0;

  function supportsSVGFilters(filterId) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);
    if (isWebkit || isFirefox) {
      return false;
    }
    const div = document.createElement('div');
    div.style.backdropFilter = `url(#${filterId})`;
    return div.style.backdropFilter !== '';
  }

  function attachGlassSurface(el, options = {}) {
    if (!el || el.dataset.glassSurfaceActive === 'true') return;
    el.dataset.glassSurfaceActive = 'true';

    const config = {
      borderRadius: options.borderRadius ?? 50,
      borderWidth: options.borderWidth ?? 0.07,
      brightness: options.brightness ?? 50,
      opacity: options.opacity ?? 0.93,
      blur: options.blur ?? 11,
      displace: options.displace ?? 0.5,
      backgroundOpacity: options.backgroundOpacity ?? 0.1,
      saturation: options.saturation ?? 1,
      distortionScale: options.distortionScale ?? -180,
      redOffset: options.redOffset ?? 0,
      greenOffset: options.greenOffset ?? 10,
      blueOffset: options.blueOffset ?? 20,
      xChannel: options.xChannel ?? 'R',
      yChannel: options.yChannel ?? 'G',
      mixBlendMode: options.mixBlendMode ?? 'difference'
    };

    const uniqueId = `nav-glass-${++instanceCounter}-${Math.random().toString(36).slice(2, 7)}`;
    const filterId = `glass-filter-${uniqueId}`;
    const redGradId = `red-grad-${uniqueId}`;
    const blueGradId = `blue-grad-${uniqueId}`;

    // Add base class
    el.classList.add('glass-surface');

    // Create SVG filter element
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'glass-surface__filter');
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0%');
    filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');

    const feImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('width', '100%');
    feImage.setAttribute('height', '100%');
    feImage.setAttribute('preserveAspectRatio', 'none');
    feImage.setAttribute('result', 'map');

    // Red Channel
    const redChannel = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    redChannel.setAttribute('in', 'SourceGraphic');
    redChannel.setAttribute('in2', 'map');
    redChannel.setAttribute('result', 'dispRed');
    redChannel.setAttribute('scale', String(config.distortionScale + config.redOffset));
    redChannel.setAttribute('xChannelSelector', config.xChannel);
    redChannel.setAttribute('yChannelSelector', config.yChannel);

    const redMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    redMatrix.setAttribute('in', 'dispRed');
    redMatrix.setAttribute('type', 'matrix');
    redMatrix.setAttribute('values', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
    redMatrix.setAttribute('result', 'red');

    // Green Channel
    const greenChannel = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    greenChannel.setAttribute('in', 'SourceGraphic');
    greenChannel.setAttribute('in2', 'map');
    greenChannel.setAttribute('result', 'dispGreen');
    greenChannel.setAttribute('scale', String(config.distortionScale + config.greenOffset));
    greenChannel.setAttribute('xChannelSelector', config.xChannel);
    greenChannel.setAttribute('yChannelSelector', config.yChannel);

    const greenMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    greenMatrix.setAttribute('in', 'dispGreen');
    greenMatrix.setAttribute('type', 'matrix');
    greenMatrix.setAttribute('values', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0');
    greenMatrix.setAttribute('result', 'green');

    // Blue Channel
    const blueChannel = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    blueChannel.setAttribute('in', 'SourceGraphic');
    blueChannel.setAttribute('in2', 'map');
    blueChannel.setAttribute('result', 'dispBlue');
    blueChannel.setAttribute('scale', String(config.distortionScale + config.blueOffset));
    blueChannel.setAttribute('xChannelSelector', config.xChannel);
    blueChannel.setAttribute('yChannelSelector', config.yChannel);

    const blueMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    blueMatrix.setAttribute('in', 'dispBlue');
    blueMatrix.setAttribute('type', 'matrix');
    blueMatrix.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0');
    blueMatrix.setAttribute('result', 'blue');

    // Blends
    const blendRG = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    blendRG.setAttribute('in', 'red');
    blendRG.setAttribute('in2', 'green');
    blendRG.setAttribute('mode', 'screen');
    blendRG.setAttribute('result', 'rg');

    const blendRGB = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    blendRGB.setAttribute('in', 'rg');
    blendRGB.setAttribute('in2', 'blue');
    blendRGB.setAttribute('mode', 'screen');
    blendRGB.setAttribute('result', 'output');

    const gaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    gaussianBlur.setAttribute('in', 'output');
    gaussianBlur.setAttribute('stdDeviation', String(config.displace ?? 0.5));

    filter.appendChild(feImage);
    filter.appendChild(redChannel);
    filter.appendChild(redMatrix);
    filter.appendChild(greenChannel);
    filter.appendChild(greenMatrix);
    filter.appendChild(blueChannel);
    filter.appendChild(blueMatrix);
    filter.appendChild(blendRG);
    filter.appendChild(blendRGB);
    filter.appendChild(gaussianBlur);
    defs.appendChild(filter);
    svgEl.appendChild(defs);

    // Wrap children in .glass-surface__content if not already wrapped
    if (!el.querySelector('.glass-surface__content')) {
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'glass-surface__content';
      while (el.firstChild) {
        contentWrapper.appendChild(el.firstChild);
      }
      el.appendChild(svgEl);
      el.appendChild(contentWrapper);
    } else {
      el.insertBefore(svgEl, el.firstChild);
    }

    // Generate dynamic displacement map
    function generateDisplacementMap() {
      const rect = el.getBoundingClientRect();
      const actualWidth = Math.max(Math.round(rect.width || 380), 200);
      const actualHeight = Math.max(Math.round(rect.height || 68), 48);
      const radius = Math.min(config.borderRadius, actualHeight / 2);
      const edgeSize = Math.min(actualWidth, actualHeight) * (config.borderWidth * 0.5);

      const svgContent = `
        <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="red"/>
            </linearGradient>
            <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="#00ffff"/>
            </linearGradient>
            <filter id="dispBlur-${uniqueId}">
              <feGaussianBlur stdDeviation="${config.blur * 0.5}" />
            </filter>
          </defs>
          <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
          <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${radius}" fill="url(#${redGradId})" />
          <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${radius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${config.mixBlendMode}" />
          <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${radius}" fill="hsl(0 0% ${config.brightness}% / ${config.opacity})" filter="url(#dispBlur-${uniqueId})" style="filter:blur(${config.blur}px)" />
        </svg>
      `;

      return `data:image/svg+xml,${encodeURIComponent(svgContent.trim())}`;
    }

    function updateDisplacement() {
      feImage.setAttribute('href', generateDisplacementMap());
    }

    // Set CSS properties
    el.style.setProperty('--glass-frost', String(config.backgroundOpacity));
    el.style.setProperty('--glass-saturation', String(config.saturation));
    el.style.setProperty('--filter-id', `url(#${filterId})`);

    const hasSvgFilterSupport = supportsSVGFilters(filterId);
    if (hasSvgFilterSupport) {
      el.classList.add('glass-surface--svg');
    } else {
      el.classList.add('glass-surface--fallback');
    }

    updateDisplacement();

    // ResizeObserver to adapt on phone orientation change (portrait <-> landscape)
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        requestAnimationFrame(updateDisplacement);
      });
      ro.observe(el);
    } else {
      window.addEventListener('resize', updateDisplacement, { passive: true });
    }
  }

  // Auto-init on Mobile Bottom Nav
  function init() {
    const mobileNavs = document.querySelectorAll('.mobile-nav');
    mobileNavs.forEach(nav => {
      attachGlassSurface(nav, {
        borderRadius: 50,
        borderWidth: 0.07,
        brightness: 50,
        opacity: 0.93,
        blur: 11,
        displace: 0.5,
        distortionScale: -180,
        redOffset: 0,
        greenOffset: 10,
        blueOffset: 20,
        backgroundOpacity: 0.1,
        saturation: 1
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.GlassSurface = {
    attach: attachGlassSurface,
    init
  };

})();
