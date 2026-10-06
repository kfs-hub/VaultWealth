// VaultWealth — auth page visuals (background + liquid glass card)
import { mountVaultBackground } from './ghost-fibers.js';
import { initLiquidGlass } from './liquid-glass.js';

mountVaultBackground(document.getElementById('bg'));
initLiquidGlass(document.querySelector('.auth-card'));
