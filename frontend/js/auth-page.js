import { mountVaultBackground, isMobileDevice } from './ghost-fibers.js';
import { initLiquidGlass } from './liquid-glass.js';

const bg = mountVaultBackground(document.getElementById('bg'));
initLiquidGlass(document.querySelector('.auth-card'));

// On mobile/touch devices: pause background animation while typing to ensure 0ms input latency
if (isMobileDevice()) {
  let resumeTimer = null;
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches('input, textarea')) {
      if (resumeTimer) clearTimeout(resumeTimer);
      bg?.update({ paused: true });
    }
  }, { passive: true });

  document.addEventListener('focusout', (e) => {
    if (e.target && e.target.matches('input, textarea')) {
      resumeTimer = setTimeout(() => {
        if (!document.activeElement || !document.activeElement.matches('input, textarea')) {
          bg?.update({ paused: false });
        }
      }, 120);
    }
  }, { passive: true });
}

