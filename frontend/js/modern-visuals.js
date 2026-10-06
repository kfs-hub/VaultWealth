/**
 * VaultWealth — Modern Minimalist Visualizations Engine
 * Custom high-DPI SVG + DOM visualization system replacing generic Chart.js templates.
 * Aligned with the dark obsidian & electric indigo theme (#09080e, #6366f1, #818cf8).
 */

const PALETTE = [
  '#6366f1', '#818cf8', '#4f46e5', '#a5b4fc', '#3730a3',
  '#c7d2fe', '#475569', '#64748b', '#94a3b8', '#cbd5e1'
];

/**
 * 1. Category Spending Breakdown (Dashboard)
 * Renders:
 * - Linear proportional distribution strip
 * - Interactive SVG Donut with dynamic center callout
 * - Detailed editorial category breakdown list
 */
export function renderModernCategoryBreakdown(container, transactions) {
  if (!container) return;
  container.innerHTML = '';

  const expenses = transactions.filter(t => t.type === 'expense');
  const categoryTotals = {};
  let totalExpenses = 0;

  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + amt;
    totalExpenses += amt;
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  if (sortedCategories.length === 0 || totalExpenses === 0) {
    container.innerHTML = `
      <div style="height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="opacity: 0.4; margin-bottom: 0.5rem;">
          <circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>
        </svg>
        <p style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">No Expenses Recorded</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Log transactions to view your category distribution.</p>
      </div>
    `;
    return;
  }

  const root = document.createElement('div');
  root.className = 'modern-category-card';

  // --- Top Distribution Strip ---
  const strip = document.createElement('div');
  strip.className = 'category-strip';

  sortedCategories.forEach(([cat, amt], idx) => {
    const pct = ((amt / totalExpenses) * 100).toFixed(1);
    const color = PALETTE[idx % PALETTE.length];
    const seg = document.createElement('div');
    seg.className = 'category-strip-segment';
    seg.style.width = `${pct}%`;
    seg.style.backgroundColor = color;
    seg.title = `${cat}: ₹${amt.toLocaleString('en-IN')} (${pct}%)`;
    seg.dataset.category = cat;
    strip.appendChild(seg);
  });
  root.appendChild(strip);

  // --- Dual Layout (Donut + Detailed Rows) ---
  const dualLayout = document.createElement('div');
  dualLayout.className = 'category-dual-layout';

  // Donut SVG Setup
  const radius = 52;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // ~326.72
  let cumulativePct = 0;

  const donutWrap = document.createElement('div');
  donutWrap.className = 'donut-wrap';

  let svgSlicesHtml = '';
  sortedCategories.forEach(([cat, amt], idx) => {
    const pct = amt / totalExpenses;
    const sliceLen = pct * circumference;
    const offset = cumulativePct * circumference;
    const color = PALETTE[idx % PALETTE.length];

    svgSlicesHtml += `
      <circle
        cx="70" cy="70" r="${radius}"
        class="donut-slice"
        stroke="${color}"
        stroke-dasharray="${sliceLen} ${circumference}"
        stroke-dashoffset="${-offset}"
        data-category="${cat}"
        data-amount="${amt}"
        data-pct="${(pct * 100).toFixed(1)}"
        style="color: ${color};"
      />
    `;
    cumulativePct += pct;
  });

  donutWrap.innerHTML = `
    <svg class="donut-svg" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r="${radius}" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="${strokeWidth}" />
      ${svgSlicesHtml}
    </svg>
    <div class="donut-center-info">
      <span class="donut-center-val" id="catDonutVal">₹${Math.round(totalExpenses).toLocaleString('en-IN')}</span>
      <span class="donut-center-lbl" id="catDonutLbl">TOTAL SPEND</span>
    </div>
  `;
  dualLayout.appendChild(donutWrap);

  // Category Rows List
  const rowsList = document.createElement('div');
  rowsList.className = 'category-rows-list';

  sortedCategories.forEach(([cat, amt], idx) => {
    const pct = ((amt / totalExpenses) * 100).toFixed(1);
    const color = PALETTE[idx % PALETTE.length];

    const row = document.createElement('div');
    row.className = 'category-row-item';
    row.dataset.category = cat;
    row.dataset.amount = amt;
    row.dataset.pct = pct;

    row.innerHTML = `
      <div class="cat-dot" style="background-color: ${color};"></div>
      <span class="cat-name-text" title="${cat}">${cat}</span>
      <div class="cat-mini-bar-track">
        <div class="cat-mini-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
      </div>
      <div class="cat-values-group">
        <span class="cat-percent-badge">${pct}%</span>
        <span class="cat-amount-text">₹${Math.round(amt).toLocaleString('en-IN')}</span>
      </div>
    `;
    rowsList.appendChild(row);
  });
  dualLayout.appendChild(rowsList);
  root.appendChild(dualLayout);
  container.appendChild(root);

  // --- Interactive Hover Highlighting ---
  const donutVal = root.querySelector('#catDonutVal');
  const donutLbl = root.querySelector('#catDonutLbl');
  const slices = root.querySelectorAll('.donut-slice');
  const rows = root.querySelectorAll('.category-row-item');
  const stripSegs = root.querySelectorAll('.category-strip-segment');

  function highlightCat(cat, amt, pct) {
    if (cat) {
      donutVal.textContent = `₹${Math.round(parseFloat(amt)).toLocaleString('en-IN')}`;
      donutLbl.textContent = cat;
      slices.forEach(s => s.classList.toggle('active', s.dataset.category === cat));
      rows.forEach(r => r.classList.toggle('active', r.dataset.category === cat));
      stripSegs.forEach(seg => seg.style.opacity = seg.dataset.category === cat ? '1' : '0.35');
    } else {
      donutVal.textContent = `₹${Math.round(totalExpenses).toLocaleString('en-IN')}`;
      donutLbl.textContent = 'TOTAL SPEND';
      slices.forEach(s => s.classList.remove('active'));
      rows.forEach(r => r.classList.remove('active'));
      stripSegs.forEach(seg => seg.style.opacity = '1');
    }
  }

  slices.forEach(slice => {
    slice.addEventListener('mouseenter', () => highlightCat(slice.dataset.category, slice.dataset.amount, slice.dataset.pct));
    slice.addEventListener('mouseleave', () => highlightCat(null));
  });

  rows.forEach(row => {
    row.addEventListener('mouseenter', () => highlightCat(row.dataset.category, row.dataset.amount, row.dataset.pct));
    row.addEventListener('mouseleave', () => highlightCat(null));
  });

  stripSegs.forEach(seg => {
    seg.addEventListener('mouseenter', () => {
      const match = sortedCategories.find(([c]) => c === seg.dataset.category);
      if (match) highlightCat(match[0], match[1], ((match[1]/totalExpenses)*100).toFixed(1));
    });
    seg.addEventListener('mouseleave', () => highlightCat(null));
  });
}

/**
 * 2. Monthly Spending Trajectory Curve (Dashboard)
 * Renders:
 * - Real-time header metrics (active hover amount, date, MoM percentage delta)
 * - Ultra-smooth high-DPI SVG spline with glowing gradient area fill
 * - Interactive vertical crosshair tracking the cursor with live scrubber
 */
export function renderModernMonthlyTrajectory(container, transactions) {
  if (!container) return;
  container.innerHTML = '';

  const expenses = transactions.filter(t => t.type === 'expense');
  const monthTotals = {};

  const sorted = [...expenses].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  sorted.forEach(t => {
    const key = t.transaction_date.substring(0, 7); // YYYY-MM
    monthTotals[key] = (monthTotals[key] || 0) + (parseFloat(t.amount) || 0);
  });

  const monthKeys = Object.keys(monthTotals);
  const dataValues = Object.values(monthTotals);

  if (monthKeys.length === 0) {
    container.innerHTML = `
      <div style="height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="opacity: 0.4; margin-bottom: 0.5rem;">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        </svg>
        <p style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">No Historical Spending Curve</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Monthly spending trends will chart as you record expenses.</p>
      </div>
    `;
    return;
  }

  // Format month labels
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedLabels = monthKeys.map(k => {
    const [y, m] = k.split('-');
    return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
  });

  // Calculate MoM change for latest month
  const latestIdx = dataValues.length - 1;
  const latestVal = dataValues[latestIdx];
  const prevVal = latestIdx > 0 ? dataValues[latestIdx - 1] : null;
  let momDeltaText = 'Stable';
  let momClass = '';

  if (prevVal !== null && prevVal > 0) {
    const delta = ((latestVal - prevVal) / prevVal) * 100;
    const sign = delta >= 0 ? '+' : '';
    momDeltaText = `${sign}${delta.toFixed(1)}% vs prev`;
    momClass = delta > 0 ? 'up' : 'down';
  }

  const root = document.createElement('div');
  root.className = 'modern-trend-card';

  // --- Header Metrics ---
  const header = document.createElement('div');
  header.className = 'trend-header-metrics';
  header.innerHTML = `
    <div class="trend-stat-left">
      <div class="trend-active-value" id="trendActiveVal">₹${Math.round(latestVal).toLocaleString('en-IN')}</div>
      <div class="trend-active-date" id="trendActiveDate">${formattedLabels[latestIdx].toUpperCase()}</div>
    </div>
    <div class="trend-stat-right">
      <div class="trend-mom-pill ${momClass}" id="trendMomBadge">${momDeltaText}</div>
    </div>
  `;
  root.appendChild(header);

  // --- SVG Spline Viewport ---
  const svgViewport = document.createElement('div');
  svgViewport.className = 'trend-svg-viewport';

  const W = 520;
  const H = 160;
  const padX = 20;
  const padY = 16;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const maxVal = Math.max(...dataValues) * 1.15 || 1000;
  const minVal = 0;

  // Compute coordinate points
  const points = dataValues.map((val, i) => {
    const x = dataValues.length === 1
      ? W / 2
      : padX + (i / (dataValues.length - 1)) * innerW;
    const y = padY + innerH - ((val - minVal) / (maxVal - minVal)) * innerH;
    return { x, y, val, label: formattedLabels[i], key: monthKeys[i] };
  });

  // Build smooth cubic bezier path
  let pathD = '';
  if (points.length === 1) {
    pathD = `M ${points[0].x - 40} ${points[0].y} L ${points[0].x + 40} ${points[0].y}`;
  } else {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
  }

  // Area path
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const areaD = `${pathD} L ${lastPt.x} ${H} L ${firstPt.x} ${H} Z`;

  // Gridlines
  const gridY1 = padY + innerH * 0.25;
  const gridY2 = padY + innerH * 0.65;
  const valRef1 = Math.round(maxVal * 0.75);
  const valRef2 = Math.round(maxVal * 0.35);

  svgViewport.innerHTML = `
    <svg class="trend-main-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.22" />
          <stop offset="65%" stop-color="#6366f1" stop-opacity="0.03" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Reference Hairline Grids -->
      <line x1="${padX}" y1="${gridY1}" x2="${W - padX}" y2="${gridY1}" class="trend-grid-line" />
      <text x="${W - padX}" y="${gridY1 - 4}" text-anchor="end" class="trend-axis-label">₹${(valRef1/1000).toFixed(0)}k</text>

      <line x1="${padX}" y1="${gridY2}" x2="${W - padX}" y2="${gridY2}" class="trend-grid-line" />
      <text x="${W - padX}" y="${gridY2 - 4}" text-anchor="end" class="trend-axis-label">₹${(valRef2/1000).toFixed(0)}k</text>

      <!-- Area & Stroke -->
      <path d="${areaD}" class="trend-area-fill" />
      <path d="${pathD}" class="trend-line-stroke" />

      <!-- Interactive Crosshair Elements -->
      <line id="trendCrosshairLine" x1="0" y1="0" x2="0" y2="${H}" class="trend-crosshair" />
      <circle id="trendCrosshairDot" cx="0" cy="0" r="4.5" class="trend-dot-marker" />
    </svg>
  `;
  root.appendChild(svgViewport);

  // --- Timeline Ticks ---
  const timelineTicks = document.createElement('div');
  timelineTicks.className = 'trend-timeline-labels';
  points.forEach(p => {
    const span = document.createElement('span');
    span.textContent = p.label.split(' ')[0]; // Month name
    timelineTicks.appendChild(span);
  });
  root.appendChild(timelineTicks);

  container.appendChild(root);

  // --- Interactive Cursor Scrubber ---
  const activeValEl = root.querySelector('#trendActiveVal');
  const activeDateEl = root.querySelector('#trendActiveDate');
  const momBadgeEl = root.querySelector('#trendMomBadge');
  const crosshairLine = root.querySelector('#trendCrosshairLine');
  const crosshairDot = root.querySelector('#trendCrosshairDot');

  svgViewport.addEventListener('mousemove', e => {
    const rect = svgViewport.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;

    // Find nearest point
    let closest = points[0];
    let minDist = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closest = { ...p, index: idx };
      }
    });

    // Update Crosshair
    crosshairLine.setAttribute('x1', closest.x);
    crosshairLine.setAttribute('x2', closest.x);
    crosshairLine.style.opacity = '1';

    crosshairDot.setAttribute('cx', closest.x);
    crosshairDot.setAttribute('cy', closest.y);
    crosshairDot.style.opacity = '1';

    // Update Header
    activeValEl.textContent = `₹${Math.round(closest.val).toLocaleString('en-IN')}`;
    activeDateEl.textContent = closest.label.toUpperCase();

    if (closest.index > 0) {
      const pVal = points[closest.index - 1].val;
      if (pVal > 0) {
        const d = ((closest.val - pVal) / pVal) * 100;
        const s = d >= 0 ? '+' : '';
        momBadgeEl.textContent = `${s}${d.toFixed(1)}% vs prev`;
        momBadgeEl.className = `trend-mom-pill ${d > 0 ? 'up' : 'down'}`;
      } else {
        momBadgeEl.textContent = 'First Entry';
        momBadgeEl.className = 'trend-mom-pill';
      }
    } else {
      momBadgeEl.textContent = 'Baseline Month';
      momBadgeEl.className = 'trend-mom-pill';
    }
  });

  svgViewport.addEventListener('mouseleave', () => {
    crosshairLine.style.opacity = '0';
    crosshairDot.style.opacity = '0';
    activeValEl.textContent = `₹${Math.round(latestVal).toLocaleString('en-IN')}`;
    activeDateEl.textContent = formattedLabels[latestIdx].toUpperCase();
    momBadgeEl.textContent = momDeltaText;
    momBadgeEl.className = `trend-mom-pill ${momClass}`;
  });
}

/**
 * 3. Category Spending Rankings Bar Chart (Analytics)
 * Renders ranked horizontal distribution bars with icons, volume, and percentage share.
 */
export function renderModernCategoryRankings(container, transactions) {
  if (!container) return;
  container.innerHTML = '';

  const expenses = transactions.filter(t => t.type === 'expense');
  const catSums = {};
  let totalExpense = 0;

  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    catSums[t.category] = (catSums[t.category] || 0) + amt;
    totalExpense += amt;
  });

  const sorted = Object.entries(catSums).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || totalExpense === 0) {
    container.innerHTML = `
      <div style="height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;">
        <p style="font-size: 0.875rem; color: var(--text-primary);">No Expense Volume Data</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Record expenses to generate category comparisons.</p>
      </div>
    `;
    return;
  }

  const root = document.createElement('div');
  root.className = 'ranking-bars-container';

  const maxCategoryAmt = sorted[0][1];

  sorted.slice(0, 7).forEach(([cat, amt]) => {
    const sharePct = ((amt / totalExpense) * 100).toFixed(1);
    const relativePct = ((amt / maxCategoryAmt) * 100).toFixed(1);

    const row = document.createElement('div');
    row.className = 'ranking-bar-row';
    row.innerHTML = `
      <div class="ranking-row-header">
        <span class="ranking-cat-label">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #6366f1; display: inline-block;"></span>
          ${cat}
        </span>
        <div class="ranking-cat-values">
          <span class="ranking-share">${sharePct}% of spend</span>
          <span class="ranking-amount">₹${Math.round(amt).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="ranking-bar-track">
        <div class="ranking-bar-progress" style="width: ${relativePct}%;"></div>
      </div>
    `;
    root.appendChild(row);
  });

  container.appendChild(root);
}

/**
 * 4. Cash Flow & Capital Retention Flow Gauge (Analytics)
 * Renders dual concentric retention gauge and summary cards.
 */
export function renderModernCashFlowGauge(container, transactions) {
  if (!container) return;
  container.innerHTML = '';

  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') totalIncome += amt;
    else if (t.type === 'expense') totalExpense += amt;
  });

  const netSavings = Math.max(0, totalIncome - totalExpense);
  const retentionRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : 0;
  const expenseRate = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(1) : 100;

  const root = document.createElement('div');
  root.className = 'cashflow-gauge-wrap';

  // SVG Concentric Rings
  const R1 = 64; // Retention ring
  const C1 = 2 * Math.PI * R1; // ~402.12
  const stroke1 = Math.min(100, Math.max(0, retentionRate)) / 100 * C1;

  root.innerHTML = `
    <div class="cashflow-concentric-container">
      <svg class="cashflow-concentric-svg" viewBox="0 0 170 170">
        <!-- Background Track -->
        <circle cx="85" cy="85" r="${R1}" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="12" />
        
        <!-- Retained Savings Arc (Indigo) -->
        <circle
          cx="85" cy="85" r="${R1}"
          fill="none"
          stroke="#6366f1"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray="${stroke1} ${C1}"
          stroke-dashoffset="0"
          style="transition: stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1); filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.4));"
        />
      </svg>
      <div class="cashflow-center-callout">
        <span class="cashflow-center-rate">${retentionRate}%</span>
        <span class="cashflow-center-sub">SAVINGS RATE</span>
      </div>
    </div>

    <div class="cashflow-pills-row">
      <div class="cashflow-pill-box">
        <span class="cashflow-pill-label">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
          Total Inflow
        </span>
        <span class="cashflow-pill-value" style="color: #10b981;">+₹${Math.round(totalIncome).toLocaleString('en-IN')}</span>
      </div>
      <div class="cashflow-pill-box">
        <span class="cashflow-pill-label">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #f43f5e;"></span>
          Total Outflow
        </span>
        <span class="cashflow-pill-value" style="color: #f43f5e;">-₹${Math.round(totalExpense).toLocaleString('en-IN')}</span>
      </div>
    </div>
  `;

  container.appendChild(root);
}

/**
 * 5. AI Machine Learning Predictive Forecasting Curve (Analytics)
 * Renders:
 * - High-DPI SVG spline comparing actual historical spend with the OLS projected trajectory
 * - 95% Confidence Interval shaded cone
 * - Glowing pulsating forecast target node for the projected month
 * - Hairline gridlines and rupee reference ticks
 * - Interactive crosshair cursor with live scrub
 */
export function renderModernMLForecast(container, {
  monthLabels = [],
  actuals = [],
  predicted = [],
  nextMonthLabel = '',
  forecastAmount = 0,
  confidenceLower = 0,
  confidenceUpper = 0
} = {}) {
  if (!container) return;
  container.innerHTML = '';

  const n = monthLabels.length;
  if (n < 2) {
    container.innerHTML = `
      <div style="height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; padding: 2rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="opacity: 0.4; margin-bottom: 0.5rem; color: #38bdf8;">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
        </svg>
        <p style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Awaiting Historical Transaction Series</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">The Ordinary Least Squares model requires at least 2 distinct months of expense logs.</p>
      </div>
    `;
    return;
  }

  const allLabels = [...monthLabels, nextMonthLabel];
  const totalCount = allLabels.length; // n + 1

  // Values range
  const validActuals = actuals.filter(v => v !== null && !isNaN(v));
  const maxVal = Math.max(...validActuals, ...predicted, forecastAmount, confidenceUpper || 0) * 1.15 || 1000;
  const minVal = 0;

  const W = 620;
  const H = 220;
  const padX = 36;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  function getX(idx) {
    return padX + (idx / (totalCount - 1)) * innerW;
  }

  function getY(val) {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return padY + innerH - ((clamped - minVal) / (maxVal - minVal)) * innerH;
  }

  // Actual points (0 .. n - 1)
  const actualPoints = actuals.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
    val,
    label: monthLabels[idx],
    type: 'actual'
  }));

  // Build actual cubic bezier path
  let actualPathD = `M ${actualPoints[0].x} ${actualPoints[0].y}`;
  for (let i = 0; i < actualPoints.length - 1; i++) {
    const p0 = actualPoints[i];
    const p1 = actualPoints[i + 1];
    const mx = (p0.x + p1.x) / 2;
    actualPathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  // Actual area fill
  const lastActualPt = actualPoints[actualPoints.length - 1];
  const firstActualPt = actualPoints[0];
  const actualAreaD = `${actualPathD} L ${lastActualPt.x} ${H} L ${firstActualPt.x} ${H} Z`;

  // Regression points (0 .. n)
  const allPred = [...predicted, forecastAmount];
  const predPoints = allPred.map((val, idx) => ({
    x: getX(idx),
    y: getY(val),
    val,
    label: allLabels[idx]
  }));

  let predPathD = `M ${predPoints[0].x} ${predPoints[0].y}`;
  for (let i = 1; i < predPoints.length; i++) {
    predPathD += ` L ${predPoints[i].x} ${predPoints[i].y}`;
  }

  // Confidence Interval Fan / Cone polygon from index n-1 to index n
  const pPrev = predPoints[n - 1];
  const forecastX = getX(n);
  const forecastY = getY(forecastAmount);
  const confUpperY = getY(confidenceUpper || forecastAmount);
  const confLowerY = getY(Math.max(0, confidenceLower || forecastAmount));
  const confConeD = `M ${pPrev.x} ${pPrev.y} L ${forecastX} ${confUpperY} L ${forecastX} ${confLowerY} Z`;

  // Gridlines & Labels
  const gridY1 = padY + innerH * 0.25;
  const gridY2 = padY + innerH * 0.65;
  const valRef1 = Math.round(maxVal * 0.75);
  const valRef2 = Math.round(maxVal * 0.35);

  const root = document.createElement('div');
  root.className = 'modern-trend-card';
  root.style.gap = '0.75rem';

  const svgViewport = document.createElement('div');
  svgViewport.className = 'trend-svg-viewport';
  svgViewport.style.minHeight = '210px';

  svgViewport.innerHTML = `
    <svg class="trend-main-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mlActualGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.22" />
          <stop offset="70%" stop-color="#38bdf8" stop-opacity="0.02" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Reference Hairline Grids -->
      <line x1="${padX}" y1="${gridY1}" x2="${W - padX}" y2="${gridY1}" class="trend-grid-line" />
      <text x="${W - padX}" y="${gridY1 - 4}" text-anchor="end" class="trend-axis-label">₹${(valRef1/1000).toFixed(0)}k</text>

      <line x1="${padX}" y1="${gridY2}" x2="${W - padX}" y2="${gridY2}" class="trend-grid-line" />
      <text x="${W - padX}" y="${gridY2 - 4}" text-anchor="end" class="trend-axis-label">₹${(valRef2/1000).toFixed(0)}k</text>

      <!-- 95% Confidence Interval Cone -->
      <path d="${confConeD}" fill="rgba(168, 85, 247, 0.12)" stroke="rgba(168, 85, 247, 0.25)" stroke-dasharray="2 2" />

      <!-- Actual Area & Line -->
      <path d="${actualAreaD}" fill="url(#mlActualGrad)" />
      <path d="${actualPathD}" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 6px rgba(56, 189, 248, 0.4));" />

      <!-- Historical Actual Points -->
      ${actualPoints.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="#09080e" stroke="#38bdf8" stroke-width="2" />
      `).join('')}

      <!-- OLS Projected Trajectory (Dashed Line) -->
      <path d="${predPathD}" fill="none" stroke="#a855f7" stroke-width="1.8" stroke-dasharray="4 4" />

      <!-- Forecast Target Node (Next Month) -->
      <circle cx="${forecastX}" cy="${forecastY}" r="7" fill="rgba(168, 85, 247, 0.2)" />
      <circle cx="${forecastX}" cy="${forecastY}" r="4.5" fill="#fff" stroke="#a855f7" stroke-width="2.5" />
      <text x="${forecastX}" y="${forecastY - 10}" text-anchor="middle" fill="#a855f7" font-size="10" font-weight="600" font-family="'JetBrains Mono', monospace">₹${Math.round(forecastAmount).toLocaleString('en-IN')}</text>

      <!-- Interactive Crosshair -->
      <line id="mlCrosshairLine" x1="0" y1="0" x2="0" y2="${H}" class="trend-crosshair" />
      <circle id="mlCrosshairDot" cx="0" cy="0" r="4.5" class="trend-dot-marker" />
    </svg>
  `;
  root.appendChild(svgViewport);

  // Bottom timeline labels
  const timelineTicks = document.createElement('div');
  timelineTicks.className = 'trend-timeline-labels';
  timelineTicks.style.padding = '0 1rem';
  allLabels.forEach((lbl, idx) => {
    const span = document.createElement('span');
    span.textContent = lbl.split(' ')[0];
    if (idx === totalCount - 1) {
      span.style.color = '#a855f7';
      span.style.fontWeight = '600';
    }
    timelineTicks.appendChild(span);
  });
  root.appendChild(timelineTicks);

  container.appendChild(root);

  // Crosshair interaction
  const crosshairLine = root.querySelector('#mlCrosshairLine');
  const crosshairDot = root.querySelector('#mlCrosshairDot');

  svgViewport.addEventListener('mousemove', e => {
    const rect = svgViewport.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;

    let closestIdx = 0;
    let minDist = Infinity;
    predPoints.forEach((p, idx) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    const isForecast = closestIdx === n;
    const pt = isForecast ? { x: forecastX, y: forecastY } : predPoints[closestIdx];

    crosshairLine.setAttribute('x1', pt.x);
    crosshairLine.setAttribute('x2', pt.x);
    crosshairLine.style.opacity = '1';

    crosshairDot.setAttribute('cx', pt.x);
    crosshairDot.setAttribute('cy', pt.y);
    crosshairDot.setAttribute('stroke', isForecast ? '#a855f7' : '#38bdf8');
    crosshairDot.style.opacity = '1';
  });

  svgViewport.addEventListener('mouseleave', () => {
    crosshairLine.style.opacity = '0';
    crosshairDot.style.opacity = '0';
  });
}
