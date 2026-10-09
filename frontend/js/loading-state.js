/**
 * VaultWealth — Global Page Loading & Skeleton Orchestrator
 * Provides smooth top-level progress bar transitions and reusable skeleton generators
 * to eliminate flashing and missing data states during asynchronous loads.
 */

(function () {
  'use strict';

  // 1. Vault Top-Level Navigation Progress Bar
  const VaultLoader = {
    bar: null,
    timer: null,
    progress: 0,

    init() {
      if (document.getElementById('vaultTopLoader')) {
        this.bar = document.getElementById('vaultTopLoader');
        return;
      }
      const el = document.createElement('div');
      el.id = 'vaultTopLoader';
      if (document.body) {
        document.body.prepend(el);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('vaultTopLoader') && document.body) {
            document.body.prepend(el);
          }
        });
      }
      this.bar = el;
    },

    start() {
      this.init();
      if (this.timer) clearInterval(this.timer);

      this.progress = 18;
      if (this.bar) {
        this.bar.classList.remove('done');
        this.bar.classList.add('loading');
        this.bar.style.width = `${this.progress}%`;
      }

      this.timer = setInterval(() => {
        if (this.progress < 85) {
          const inc = (85 - this.progress) * 0.14;
          this.progress += Math.max(inc, 1.8);
          if (this.bar) this.bar.style.width = `${this.progress}%`;
        }
      }, 140);
    },

    set(pct) {
      this.init();
      this.progress = Math.min(Math.max(pct, 0), 100);
      if (this.bar) this.bar.style.width = `${this.progress}%`;
    },

    done() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.progress = 100;
      if (this.bar) {
        this.bar.style.width = '100%';
        this.bar.classList.add('done');
      }

      setTimeout(() => {
        if (this.bar) {
          this.bar.classList.remove('loading', 'done');
          this.bar.style.width = '0%';
        }
      }, 400);
    }
  };

  // 2. Intercept navigation (link clicks, clickable cards, beforeunload)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href) {
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;
      if (link.getAttribute('href')?.startsWith('#')) return;

      try {
        const url = new URL(link.href, window.location.origin);
        if (url.origin === window.location.origin) {
          const dest = url.pathname.replace(/\.html$/, '');
          const curr = window.location.pathname.replace(/\.html$/, '');
          if (dest !== curr) {
            VaultLoader.start();
          }
        }
      } catch {
        // Ignore URL parse failures
      }
      return;
    }

    const clickableNav = e.target.closest('[onclick*="location"], [data-nav-href]');
    if (clickableNav) {
      VaultLoader.start();
    }
  });

  window.addEventListener('beforeunload', () => {
    VaultLoader.start();
  });

  // 3. Reusable Skeleton Templates
  const SkeletonTemplates = {
    statValue(metricWidth = '60%', subtextWidth = '45%') {
      return `
        <div class="skeleton skeleton-metric" style="width: ${metricWidth};"></div>
        <div class="skeleton skeleton-text-sm" style="width: ${subtextWidth};"></div>
      `;
    },

    tableRows(rowCount = 5, columnCount = 5) {
      let rows = '';
      for (let r = 0; r < rowCount; r++) {
        const widths = ['22%', '18%', '34%', '14%', '12%'];
        rows += `
          <tr class="skeleton-table-row">
            ${Array.from({ length: columnCount }).map((_, c) => `
              <td>
                <div class="skeleton-table-cell">
                  ${c === 0 || c === 1 ? '<span class="skeleton skeleton-circle" style="width: 24px; height: 24px;"></span>' : ''}
                  <span class="skeleton skeleton-text" style="width: ${widths[c % widths.length] || '50%'}; height: 13px;"></span>
                </div>
              </td>
            `).join('')}
          </tr>
        `;
      }
      return rows;
    },

    subCards(count = 6) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="skeleton-sub-card">
            <div class="skeleton-sub-card-header">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="skeleton skeleton-circle" style="width: 38px; height: 38px; border-radius: 11px;"></span>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                  <span class="skeleton skeleton-text" style="width: 110px; height: 15px;"></span>
                  <span class="skeleton skeleton-text-sm" style="width: 85px;"></span>
                </div>
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="skeleton skeleton-text" style="width: 75px; height: 16px;"></span>
                <span class="skeleton skeleton-badge" style="width: 55px; height: 18px;"></span>
              </div>
            </div>
            <div class="skeleton-sub-card-footer">
              <span class="skeleton skeleton-text-sm" style="width: 100px;"></span>
              <div style="display: flex; gap: 6px;">
                <span class="skeleton skeleton-circle" style="width: 24px; height: 24px; border-radius: 6px;"></span>
                <span class="skeleton skeleton-circle" style="width: 24px; height: 24px; border-radius: 6px;"></span>
              </div>
            </div>
          </div>
        `;
      }
      return html;
    },

    timelinePills(count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="skeleton-timeline-pill">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <span class="skeleton skeleton-circle" style="width: 32px; height: 32px; border-radius: 10px;"></span>
              <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                <span class="skeleton skeleton-text" style="width: 75px; height: 12px;"></span>
                <span class="skeleton skeleton-text-sm" style="width: 50px;"></span>
              </div>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
              <span class="skeleton skeleton-badge" style="width: 55px; height: 16px;"></span>
              <span class="skeleton skeleton-text-sm" style="width: 45px;"></span>
            </div>
          </div>
        `;
      }
      return html;
    },

    chartRadial() {
      return `
        <div class="skeleton-chart-wrapper">
          <div class="skeleton-chart-radial"></div>
          <div style="display: flex; gap: 0.75rem; justify-content: center; width: 100%;">
            <span class="skeleton skeleton-badge" style="width: 65px;"></span>
            <span class="skeleton skeleton-badge" style="width: 75px;"></span>
            <span class="skeleton skeleton-badge" style="width: 60px;"></span>
          </div>
        </div>
      `;
    },

    chartBars() {
      const heights = [45, 75, 30, 95, 60, 80, 50];
      return `
        <div class="skeleton-chart-wrapper">
          <div class="skeleton-chart-bars">
            ${heights.map(h => `<div class="skeleton skeleton-chart-bar-item" style="height: ${h}%;"></div>`).join('')}
          </div>
          <div class="skeleton skeleton-text" style="width: 60%; height: 10px;"></div>
        </div>
      `;
    },

    insightCards(count = 2) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="skeleton-insight-item">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="skeleton skeleton-circle" style="width: 38px; height: 38px; border-radius: 11px;"></span>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span class="skeleton skeleton-text" style="width: 120px; height: 14px;"></span>
                  <span class="skeleton skeleton-text-sm" style="width: 70px;"></span>
                </div>
              </div>
              <span class="skeleton skeleton-badge" style="width: 65px; height: 18px;"></span>
            </div>
            <span class="skeleton skeleton-text" style="width: 95%;"></span>
            <span class="skeleton skeleton-text-sm" style="width: 70%;"></span>
          </div>
        `;
      }
      return html;
    },

    renewalItems(count = 2) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="skeleton-renewal-item">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="skeleton skeleton-circle" style="width: 38px; height: 38px; border-radius: 11px;"></span>
              <div style="display: flex; flex-direction: column; gap: 5px;">
                <span class="skeleton skeleton-text" style="width: 100px; height: 14px;"></span>
                <span class="skeleton skeleton-text-sm" style="width: 75px;"></span>
              </div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span class="skeleton skeleton-text" style="width: 65px; height: 16px;"></span>
              <span class="skeleton skeleton-badge" style="width: 55px; height: 18px;"></span>
            </div>
          </div>
        `;
      }
      return html;
    }
  };

  // Expose globally
  window.VaultLoader = VaultLoader;
  window.SkeletonTemplates = SkeletonTemplates;

  // Auto-start loader immediately on page load
  VaultLoader.start();

  // Safety fallback: if page load is still active after 4 seconds, complete loader
  setTimeout(() => {
    VaultLoader.done();
  }, 4000);
})();
