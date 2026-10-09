/**
 * VaultWealth — Bank Statement Upload & Review Module
 * 
 * Provides interactive modal with:
 *  - Drag-and-drop file upload zone (CSV, Excel, PDF)
 *  - Bank auto-detection badge (HDFC, SBI, ICICI, Axis, Kotak, etc.)
 *  - Password prompt for encrypted Indian bank statements
 *  - Download sample statement option
 *  - Dual Responsive Review UI:
 *      * Laptop / Desktop (>768px): Spacious data table with sticky headers, fixed columns, inline editing
 *      * Phone / Mobile (<=768px): Touch-friendly card view with thumb-friendly controls & expandable edit forms
 *  - Quick Filter Tabs: All, Income, Expenses, Selected
 *  - Live search with instant clear
 *  - Select/Deselect all & per-transaction toggles with real-time net impact stats
 *  - Bulk insert directly to Supabase
 */

(function () {
  'use strict';

  // State
  let parsedRows = [];
  let detectedBankInfo = null;
  let currentFile = null;
  let uploadModalEl = null;
  let currentSearchQuery = '';
  let currentFilterTab = 'all'; // 'all' | 'income' | 'expense' | 'selected'

  // ─── Build the Upload Modal DOM ───

  function buildUploadModal() {
    if (document.getElementById('statementUploadModal')) {
      return document.getElementById('statementUploadModal');
    }

    const overlay = document.createElement('div');
    overlay.id = 'statementUploadModal';
    overlay.className = 'modal-overlay upload-modal-overlay';

    overlay.innerHTML = `
      <div class="modal-box upload-modal-box">
        <div class="modal-header">
          <h3 class="modal-title">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('upload-cloud', '', { width: 22, height: 22 }) : ''}
            Upload Bank Statement
          </h3>
          <button type="button" class="modal-close" id="uploadModalClose" aria-label="Close upload modal">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 20, height: 20 }) : '&times;'}
          </button>
        </div>

        <!-- Step 1: Upload Area -->
        <div class="modal-body upload-step" id="uploadStep1">
          <div class="upload-dropzone" id="uploadDropzone">
            <div class="upload-dropzone-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('upload-cloud', '', { width: 48, height: 48 }) : ''}
            </div>
            <h4 class="upload-dropzone-title">Drop your bank statement here</h4>
            <p class="upload-dropzone-subtitle">or click to browse files from your computer</p>
            <button type="button" class="btn btn-primary btn-sm upload-browse-btn" id="uploadBrowseBtn">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('file-text', '', { width: 15, height: 15 }) : ''}
              Choose File (PDF, CSV, Excel)
            </button>
            <div class="upload-formats">
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-text', '', { width: 14, height: 14 }) : ''}
                CSV
              </span>
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-spreadsheet', '', { width: 14, height: 14 }) : ''}
                Excel (.xlsx, .xls)
              </span>
              <span class="upload-format-badge">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('file-text', '', { width: 14, height: 14 }) : ''}
                PDF e-Statement
              </span>
            </div>
            <input type="file" id="statementFileInput" accept=".csv,.xlsx,.xls,.pdf,.txt" hidden>
          </div>

          <div class="upload-sample-prompt">
            <span class="upload-sample-label">Want to test without a real statement?</span>
            <div class="upload-sample-actions">
              <button type="button" class="btn btn-secondary btn-sm upload-demo-btn" id="loadSampleDemoBtn">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('lightning', '', { width: 14, height: 14 }) : ''}
                Load Demo Statement
              </button>
              <a href="assets/sample-statement.csv" download="sample-statement.csv" id="downloadSampleLink" class="upload-sample-link">
                Download Sample CSV
              </a>
            </div>
          </div>

          <div class="upload-info-bar">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('shield', '', { width: 16, height: 16 }) : ''}
            <span>100% Private: Statements are parsed locally on your device. Only confirmed transactions are saved to your vault.</span>
          </div>
        </div>

        <!-- Step 1.2: Password Protected Statement Prompt -->
        <div class="modal-body upload-step" id="uploadStepPassword" style="display: none;">
          <div class="upload-password-box">
            <div class="upload-password-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('lock', '', { width: 44, height: 44 }) : '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'}
            </div>
            <h4 style="font-size: 1.15rem; font-weight: 700; color: #FFFFFF; margin: 0;">Statement is Encrypted</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
              This bank statement is protected with a password. Please enter the password to unlock and parse transactions.
            </p>
            <div class="upload-password-hint">
              <strong>Common Indian Bank Passwords:</strong><br>
              • <strong>SBI:</strong> 11-digit Account Number OR Date of Birth (DDMMYYYY) + last 5 digits of mobile<br>
              • <strong>HDFC:</strong> Customer ID OR PAN Number (ALL CAPS)<br>
              • <strong>ICICI:</strong> First 4 letters of name (lowercase) + DOB (DDMM)
            </div>
            <div class="upload-password-input-group">
              <input type="password" id="statementPasswordInput" class="form-control" placeholder="Enter statement password">
              <button type="button" class="btn btn-primary" id="statementUnlockBtn">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('unlock', '', { width: 15, height: 15 }) : ''}
                Unlock & Parse
              </button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="cancelPasswordBtn" style="margin-top: 0.5rem;">
              Cancel & Choose Another File
            </button>
          </div>
        </div>

        <!-- Step 1.5: Loading State -->
        <div class="modal-body upload-step" id="uploadStepLoading" style="display: none;">
          <div class="upload-loading-state">
            <div class="upload-loading-spinner">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 42, height: 42 }) : ''}
            </div>
            <h4>Parsing your statement...</h4>
            <p class="upload-loading-filename" id="uploadLoadingFilename">processing file</p>
          </div>
        </div>

        <!-- Step 2: Review & Edit Section -->
        <div class="modal-body upload-step" id="uploadStep2" style="display: none;">
          
          <!-- Review Header: Stats & Meta -->
          <div class="upload-review-header">
            <div class="upload-review-stats">
              <div class="upload-stat">
                <span class="upload-stat-label">Transactions</span>
                <span class="upload-stat-value" id="reviewTotalCount">0</span>
              </div>
              <div class="upload-stat">
                <span class="upload-stat-label">Total Income</span>
                <span class="upload-stat-value income" id="reviewTotalIncome">₹0.00</span>
              </div>
              <div class="upload-stat">
                <span class="upload-stat-label">Total Expenses</span>
                <span class="upload-stat-value expense" id="reviewTotalExpenses">₹0.00</span>
              </div>
              <div class="upload-stat upload-stat-net">
                <span class="upload-stat-label">Net Impact</span>
                <span class="upload-stat-value" id="reviewTotalNet">₹0.00</span>
              </div>
            </div>

            <div class="upload-header-meta">
              <div id="reviewBankBadge" class="upload-bank-badge" style="display: none;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="3" y1="21" x2="21" y2="21"></line><line x1="3" y1="10" x2="21" y2="10"></line><polyline points="5 6 12 3 19 6"></polyline><line x1="4" y1="10" x2="4" y2="21"></line><line x1="20" y1="10" x2="20" y2="21"></line><line x1="8" y1="14" x2="8" y2="17"></line><line x1="12" y1="14" x2="12" y2="17"></line><line x1="16" y1="14" x2="16" y2="17"></line></svg><span id="reviewBankName">Bank Statement</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="uploadBackBtn">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('upload', '', { width: 14, height: 14 }) : ''}
                <span class="upload-btn-text-full">Upload Another File</span>
                <span class="upload-btn-text-short">New File</span>
              </button>
            </div>
          </div>

          <!-- Review Toolbar: Filter Tabs & Search -->
          <div class="upload-review-toolbar">
            <div class="upload-filter-tabs" role="tablist">
              <button type="button" class="upload-filter-tab active" data-filter="all" role="tab" aria-selected="true">
                All <span class="tab-count" id="countTabAll">0</span>
              </button>
              <button type="button" class="upload-filter-tab tab-income" data-filter="income" role="tab" aria-selected="false">
                Income <span class="tab-count" id="countTabIncome">0</span>
              </button>
              <button type="button" class="upload-filter-tab tab-expense" data-filter="expense" role="tab" aria-selected="false">
                Expenses <span class="tab-count" id="countTabExpense">0</span>
              </button>
              <button type="button" class="upload-filter-tab" data-filter="selected" role="tab" aria-selected="false">
                Selected <span class="tab-count" id="countTabSelected">0</span>
              </button>
            </div>

            <div class="upload-toolbar-right">
              <div class="upload-search-wrapper">
                <span class="upload-search-icon">
                  ${typeof getSvgIcon === 'function' ? getSvgIcon('search', '', { width: 14, height: 14 }) : ''}
                </span>
                <input type="text" class="form-control form-control-sm" id="reviewSearchInput" placeholder="Filter transactions...">
                <button type="button" class="upload-search-clear" id="reviewSearchClear" style="display: none;" aria-label="Clear search">
                  &times;
                </button>
              </div>
              <div class="upload-toolbar-meta-row">
                <div class="upload-period-badge" id="reviewPeriodBadge">
                  ${typeof getSvgIcon === 'function' ? getSvgIcon('calendar', '', { width: 14, height: 14 }) : ''}
                  <span id="reviewPeriodText">Statement Period</span>
                </div>
                <label class="upload-select-all-label" title="Select or deselect all transactions">
                  <input type="checkbox" id="selectAllCheckbox" checked>
                  <span>Select All</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Desktop View: 8-Column Data Table (min-width: 769px) -->
          <div class="upload-desktop-view">
            <div class="upload-review-table-wrapper">
              <table class="data-table upload-review-table">
                <thead>
                  <tr>
                    <th style="width: 34px; text-align: center;">
                      <input type="checkbox" id="tableHeaderSelectAll" checked title="Select/Deselect all">
                    </th>
                    <th style="width: 38px; text-align: center;">#</th>
                    <th style="width: 105px;">Date</th>
                    <th>Description</th>
                    <th style="width: 135px;">Category</th>
                    <th style="width: 100px;">Type</th>
                    <th style="text-align: right; width: 115px;">Amount</th>
                    <th style="text-align: center; width: 85px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="reviewTableBody"></tbody>
              </table>
            </div>
          </div>

          <!-- Mobile View: Touch Cards (max-width: 768px) -->
          <div class="upload-mobile-view">
            <div class="upload-mobile-cards-wrapper" id="reviewMobileCards"></div>
          </div>

          <!-- Empty State (No rows match filter/search) -->
          <div class="upload-empty-state" id="uploadEmptyState" style="display: none;">
            <div class="upload-empty-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('alert-circle', '', { width: 40, height: 40 }) : ''}
            </div>
            <h4>No transactions match your filter</h4>
            <p>Try clearing your search query or switching to another filter tab.</p>
          </div>
        </div>

        <!-- Footer (Shown in Review Step) -->
        <div class="modal-footer upload-footer" id="uploadFooter" style="display: none;">
          <div class="upload-footer-info">
            <span id="uploadSelectedCount" style="font-weight: 700; color: #FFFFFF;">0 transactions</span> selected for import
          </div>
          <div class="upload-footer-buttons">
            <button type="button" class="btn btn-secondary" id="uploadCancelBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="uploadSubmitBtn">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 16, height: 16 }) : ''}
              Import to Vault
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  // ─── Render Review Table & Cards ───

  function renderReviewTable() {
    const tbody = document.getElementById('reviewTableBody');
    const mobileCardsContainer = document.getElementById('reviewMobileCards');
    const countEl = document.getElementById('reviewTotalCount');
    const incomeEl = document.getElementById('reviewTotalIncome');
    const expenseEl = document.getElementById('reviewTotalExpenses');
    const netEl = document.getElementById('reviewTotalNet');
    const selectedCountEl = document.getElementById('uploadSelectedCount');
    const emptyState = document.getElementById('uploadEmptyState');
    const desktopView = document.querySelector('.upload-desktop-view');
    const mobileView = document.querySelector('.upload-mobile-view');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const bankBadge = document.getElementById('reviewBankBadge');
    const bankNameEl = document.getElementById('reviewBankName');
    const periodTextEl = document.getElementById('reviewPeriodText');
    const selectAllCb = document.getElementById('selectAllCheckbox');
    const tableHeaderSelectAllCb = document.getElementById('tableHeaderSelectAll');
    const searchClearBtn = document.getElementById('reviewSearchClear');

    // Tab badges
    const countTabAll = document.getElementById('countTabAll');
    const countTabIncome = document.getElementById('countTabIncome');
    const countTabExpense = document.getElementById('countTabExpense');
    const countTabSelected = document.getElementById('countTabSelected');

    if (!tbody || !mobileCardsContainer) return;

    // Display bank info
    if (detectedBankInfo && detectedBankInfo.name) {
      if (bankBadge) bankBadge.style.display = 'inline-flex';
      if (bankNameEl) bankNameEl.textContent = detectedBankInfo.name;
    } else {
      if (bankBadge) bankBadge.style.display = 'none';
    }

    // Toggle search clear button
    if (searchClearBtn) {
      searchClearBtn.style.display = currentSearchQuery.trim().length > 0 ? 'inline-block' : 'none';
    }

    // Compute period
    if (parsedRows.length > 0 && periodTextEl) {
      const dates = parsedRows.map(r => r.date).filter(Boolean).sort();
      if (dates.length > 0) {
        const start = formatReviewDate(dates[0]);
        const end = formatReviewDate(dates[dates.length - 1]);
        periodTextEl.textContent = start === end ? start : `${start} – ${end}`;
      }
    }

    // Compute totals across ALL rows & selected rows
    let selectedCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    let countIncome = 0;
    let countExpense = 0;

    parsedRows.forEach(row => {
      const isSelected = row._selected !== false;
      if (row.type === 'income') countIncome++;
      else countExpense++;

      if (isSelected) {
        selectedCount++;
        if (row.type === 'income') totalIncome += (row.amount || 0);
        else totalExpense += (row.amount || 0);
      }
    });

    const netImpact = totalIncome - totalExpense;

    // Update Header Stats
    if (countEl) countEl.textContent = parsedRows.length;
    if (incomeEl) incomeEl.textContent = `₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.textContent = `₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (netEl) {
      const prefix = netImpact >= 0 ? '+' : '-';
      netEl.textContent = `${prefix} ₹${Math.abs(netImpact).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      netEl.className = `upload-stat-value ${netImpact >= 0 ? 'income' : 'expense'}`;
    }

    // Update Tab Count Badges
    if (countTabAll) countTabAll.textContent = parsedRows.length;
    if (countTabIncome) countTabIncome.textContent = countIncome;
    if (countTabExpense) countTabExpense.textContent = countExpense;
    if (countTabSelected) countTabSelected.textContent = selectedCount;

    // Update Footer Selected Count
    if (selectedCountEl) {
      selectedCountEl.textContent = `${selectedCount} of ${parsedRows.length} transaction${parsedRows.length === 1 ? '' : 's'}`;
    }

    // Update Submit Button
    if (submitBtn) {
      submitBtn.disabled = selectedCount === 0;
      submitBtn.innerHTML = `
        ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 16, height: 16 }) : ''}
        Import ${selectedCount} Transaction${selectedCount === 1 ? '' : 's'}
      `;
    }

    // Update Select-All Checkboxes
    const allChecked = selectedCount === parsedRows.length && parsedRows.length > 0;
    const isIndeterminate = selectedCount > 0 && selectedCount < parsedRows.length;

    if (selectAllCb) {
      selectAllCb.checked = allChecked;
      selectAllCb.indeterminate = isIndeterminate;
    }
    if (tableHeaderSelectAllCb) {
      tableHeaderSelectAllCb.checked = allChecked;
      tableHeaderSelectAllCb.indeterminate = isIndeterminate;
    }

    // Filter rows by Active Tab & Search Query
    const query = currentSearchQuery.trim().toLowerCase();
    const visibleRows = parsedRows.map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        // Tab Filter
        if (currentFilterTab === 'income' && row.type !== 'income') return false;
        if (currentFilterTab === 'expense' && row.type !== 'expense') return false;
        if (currentFilterTab === 'selected' && row._selected === false) return false;

        // Search Filter
        if (!query) return true;
        return (
          (row.description || '').toLowerCase().includes(query) ||
          (row.category || '').toLowerCase().includes(query) ||
          (row.date || '').toLowerCase().includes(query) ||
          String(row.amount).includes(query)
        );
      });

    // Handle Empty Results
    if (visibleRows.length === 0) {
      tbody.innerHTML = '';
      mobileCardsContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (desktopView) desktopView.style.display = 'none';
      if (mobileView) mobileView.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (desktopView) desktopView.style.display = '';
    if (mobileView) mobileView.style.display = '';

    const expenseCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.expense.map(c => c.name) : ['Other'];
    const incomeCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.income.map(c => c.name) : ['Other Income'];

    // ── Build Desktop Table Rows ──
    let tableHtml = '';
    // ── Build Mobile Cards ──
    let mobileHtml = '';

    visibleRows.forEach(({ row, originalIndex }) => {
      const idx = originalIndex;
      const isIncome = row.type === 'income';
      const isSelected = row._selected !== false;
      const isEditing = !!row._editing;

      const catOptions = isIncome ? incomeCategories : expenseCategories;
      const catOptionsHtml = catOptions.map(c =>
        `<option value="${escapeAttr(c)}" ${c === row.category ? 'selected' : ''}>${escapeAttr(c)}</option>`
      ).join('');

      const formattedAmount = `₹${(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // 1. Desktop Row
      tableHtml += `
        <tr data-row-idx="${idx}" class="${isEditing ? 'editing-row' : ''} ${!isSelected ? 'row-deselected' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''} ${isEditing ? 'disabled' : ''}>
          </td>
          <td class="row-num">${idx + 1}</td>
          <td>
            ${isEditing
              ? `<input type="date" class="form-control form-control-sm edit-date" value="${row.date}">`
              : `<span class="review-date">${formatReviewDate(row.date)}</span>`
            }
          </td>
          <td>
            ${isEditing
              ? `<input type="text" class="form-control form-control-sm edit-desc" value="${escapeAttr(row.description)}" placeholder="Description">`
              : `<span class="review-desc" title="${escapeAttr(row._original || row.description)}">${escapeHtml(truncateStr(row.description, 45))}</span>`
            }
          </td>
          <td>
            ${isEditing
              ? `<select class="form-control form-control-sm edit-category">${catOptionsHtml}</select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-category'}">${escapeHtml(row.category)}</span>`
            }
          </td>
          <td>
            ${isEditing
              ? `<select class="form-control form-control-sm edit-type">
                   <option value="expense" ${!isIncome ? 'selected' : ''}>Expense</option>
                   <option value="income" ${isIncome ? 'selected' : ''}>Income</option>
                 </select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? 'Income' : 'Expense'}</span>`
            }
          </td>
          <td style="text-align: right;">
            ${isEditing
              ? `<input type="number" class="form-control form-control-sm edit-amount" value="${row.amount}" step="0.01" min="0.01" style="text-align: right;">`
              : `<span class="amount ${isIncome ? 'amount-income' : 'amount-expense'}">${isIncome ? '+' : '-'} ${formattedAmount}</span>`
            }
          </td>
          <td style="text-align: center;">
            <div class="review-actions">
              ${isEditing
                ? `<button type="button" class="btn-icon btn-sm review-save-btn" data-idx="${idx}" title="Save changes" aria-label="Save">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('check', '', { width: 15, height: 15 }) : '✓'}
                   </button>
                   <button type="button" class="btn-icon btn-sm review-cancel-edit-btn" data-idx="${idx}" title="Cancel edit" aria-label="Cancel">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 15, height: 15 }) : '✗'}
                   </button>`
                : `<button type="button" class="btn-icon btn-sm review-edit-btn" data-idx="${idx}" title="Edit transaction" aria-label="Edit">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('edit', '', { width: 15, height: 15 }) : 'Edit'}
                   </button>
                   <button type="button" class="btn-icon btn-sm review-remove-btn" data-idx="${idx}" title="Remove transaction" aria-label="Remove" style="color: var(--color-expense);">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('trash', '', { width: 15, height: 15 }) : 'Del'}
                   </button>`
              }
            </div>
          </td>
        </tr>
      `;

      // 2. Mobile Card
      if (isEditing) {
        mobileHtml += `
          <div class="upload-mobile-card editing-card" data-idx="${idx}">
            <form class="mobile-edit-form" data-idx="${idx}" onsubmit="return false;">
              <div class="mobile-edit-header">
                <span class="mobile-edit-title">Editing #${idx + 1}</span>
                <span style="font-size: 0.725rem; color: var(--text-muted);">Inline Edit</span>
              </div>
              <div class="mobile-edit-field">
                <label>Date</label>
                <input type="date" class="form-control form-control-sm edit-date" value="${row.date}">
              </div>
              <div class="mobile-edit-field">
                <label>Description</label>
                <input type="text" class="form-control form-control-sm edit-desc" value="${escapeAttr(row.description)}" placeholder="Description">
              </div>
              <div class="mobile-edit-row">
                <div class="mobile-edit-field" style="flex: 1;">
                  <label>Type</label>
                  <select class="form-control form-control-sm edit-type">
                    <option value="expense" ${!isIncome ? 'selected' : ''}>Expense (DR)</option>
                    <option value="income" ${isIncome ? 'selected' : ''}>Income (CR)</option>
                  </select>
                </div>
                <div class="mobile-edit-field" style="flex: 1.2;">
                  <label>Category</label>
                  <select class="form-control form-control-sm edit-category">${catOptionsHtml}</select>
                </div>
              </div>
              <div class="mobile-edit-field">
                <label>Amount (₹)</label>
                <input type="number" class="form-control form-control-sm edit-amount" value="${row.amount}" step="0.01" min="0.01">
              </div>
              <div class="mobile-edit-buttons">
                <button type="button" class="btn btn-secondary btn-sm review-cancel-edit-btn" data-idx="${idx}">
                  Cancel
                </button>
                <button type="button" class="btn btn-primary btn-sm review-save-btn" data-idx="${idx}">
                  ${typeof getSvgIcon === 'function' ? getSvgIcon('check', '', { width: 14, height: 14 }) : ''}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        `;
      } else {
        mobileHtml += `
          <div class="upload-mobile-card ${!isSelected ? 'card-deselected' : ''}" data-idx="${idx}">
            <div class="mobile-card-top">
              <label class="mobile-card-checkbox-label">
                <input type="checkbox" class="row-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''}>
                <span class="mobile-card-date">${formatReviewDate(row.date)}</span>
              </label>
              <div class="mobile-card-amount-wrap">
                <span class="badge ${isIncome ? 'badge-income' : 'badge-expense'} mobile-card-type-badge">${isIncome ? 'CR' : 'DR'}</span>
                <span class="mobile-card-amount ${isIncome ? 'amount-income' : 'amount-expense'}">
                  ${isIncome ? '+' : '-'} ${formattedAmount}
                </span>
              </div>
            </div>
            <div class="mobile-card-desc" title="${escapeAttr(row._original || row.description)}">
              ${escapeHtml(row.description)}
            </div>
            <div class="mobile-card-bottom">
              <span class="badge ${isIncome ? 'badge-income' : 'badge-category'}">${escapeHtml(row.category)}</span>
              <div class="mobile-card-actions">
                <button type="button" class="btn-icon btn-sm review-edit-btn" data-idx="${idx}" title="Edit transaction" aria-label="Edit">
                  ${typeof getSvgIcon === 'function' ? getSvgIcon('edit', '', { width: 15, height: 15 }) : 'Edit'}
                </button>
                <button type="button" class="btn-icon btn-sm review-remove-btn" data-idx="${idx}" title="Remove transaction" aria-label="Remove" style="color: var(--color-expense);">
                  ${typeof getSvgIcon === 'function' ? getSvgIcon('trash', '', { width: 15, height: 15 }) : 'Del'}
                </button>
              </div>
            </div>
          </div>
        `;
      }
    });

    tbody.innerHTML = tableHtml;
    mobileCardsContainer.innerHTML = mobileHtml;

    bindReviewTableActions();
  }

  // ─── Bind Review Actions ───

  function bindReviewTableActions() {
    const modalBox = document.getElementById('statementUploadModal');
    if (!modalBox) return;

    // Checkbox toggles (both desktop table and mobile cards)
    modalBox.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.idx, 10);
        if (parsedRows[idx]) {
          parsedRows[idx]._selected = cb.checked;
          renderReviewTable();
        }
      });
    });

    // Select-All Checkboxes
    const selectAllCb = document.getElementById('selectAllCheckbox');
    const tableHeaderSelectAll = document.getElementById('tableHeaderSelectAll');

    const handleSelectAll = (checked) => {
      parsedRows.forEach(r => { r._selected = checked; });
      renderReviewTable();
    };

    if (selectAllCb) {
      selectAllCb.onchange = () => handleSelectAll(selectAllCb.checked);
    }
    if (tableHeaderSelectAll) {
      tableHeaderSelectAll.onchange = () => handleSelectAll(tableHeaderSelectAll.checked);
    }

    // Filter Tabs
    modalBox.querySelectorAll('.upload-filter-tab').forEach(tab => {
      tab.onclick = () => {
        const filter = tab.dataset.filter || 'all';
        currentFilterTab = filter;
        modalBox.querySelectorAll('.upload-filter-tab').forEach(t => {
          const isActive = t === tab;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        renderReviewTable();
      };
    });

    // Edit transaction button
    modalBox.querySelectorAll('.review-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (parsedRows[idx]) {
          parsedRows[idx]._editing = true;
          renderReviewTable();
        }
      };
    });

    // Cancel edit button
    modalBox.querySelectorAll('.review-cancel-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (parsedRows[idx]) {
          delete parsedRows[idx]._editing;
          renderReviewTable();
        }
      };
    });

    // Remove transaction button
    modalBox.querySelectorAll('.review-remove-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const container = btn.closest('tr') || btn.closest('.upload-mobile-card');
        if (container) {
          container.classList.add('row-removing');
          setTimeout(() => {
            parsedRows.splice(idx, 1);
            renderReviewTable();
          }, 220);
        } else {
          parsedRows.splice(idx, 1);
          renderReviewTable();
        }
      };
    });

    // Save edit button (handles both desktop table row & mobile card form)
    modalBox.querySelectorAll('.review-save-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const container = btn.closest('tr') || btn.closest('.upload-mobile-card');
        if (!container || !parsedRows[idx]) return;

        const newDate = container.querySelector('.edit-date')?.value;
        const newDesc = container.querySelector('.edit-desc')?.value;
        const newCategory = container.querySelector('.edit-category')?.value;
        const newType = container.querySelector('.edit-type')?.value;
        const newAmount = parseFloat(container.querySelector('.edit-amount')?.value);

        if (newDate) parsedRows[idx].date = newDate;
        if (newDesc !== undefined) parsedRows[idx].description = newDesc.trim();
        if (newCategory) parsedRows[idx].category = newCategory;
        if (newType) parsedRows[idx].type = newType;
        if (!isNaN(newAmount) && newAmount > 0) parsedRows[idx].amount = newAmount;

        // Auto-reconcile category if type was flipped
        if (newType && typeof CATEGORIES !== 'undefined') {
          const validCats = CATEGORIES[newType]?.map(c => c.name) || [];
          if (!validCats.includes(parsedRows[idx].category)) {
            parsedRows[idx].category = typeof StatementParser !== 'undefined'
              ? StatementParser.inferCategory(parsedRows[idx].description, newType)
              : (newType === 'income' ? 'Other Income' : 'Other');
          }
        }

        delete parsedRows[idx]._editing;
        renderReviewTable();
      };
    });

    // Dynamic category dropdown update on type change during edit
    modalBox.querySelectorAll('.edit-type').forEach(select => {
      select.onchange = () => {
        const container = select.closest('tr') || select.closest('.upload-mobile-card');
        const newType = select.value;
        const catSelect = container?.querySelector('.edit-category');
        if (!catSelect || typeof CATEGORIES === 'undefined') return;

        const newCats = CATEGORIES[newType] || [];
        catSelect.innerHTML = newCats.map(c =>
          `<option value="${escapeAttr(c.name)}">${escapeAttr(c.name)}</option>`
        ).join('');
      };
    });
  }

  // ─── Open/Close Modal ───

  function openUploadModal() {
    uploadModalEl = buildUploadModal();
    uploadModalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
    showStep('uploadStep1');
    parsedRows = [];
    detectedBankInfo = null;
    currentFile = null;
    currentSearchQuery = '';
    currentFilterTab = 'all';

    // Reset filter tabs active state
    uploadModalEl.querySelectorAll('.upload-filter-tab').forEach(t => {
      const isAll = (t.dataset.filter || 'all') === 'all';
      t.classList.toggle('active', isAll);
      t.setAttribute('aria-selected', isAll ? 'true' : 'false');
    });

    bindUploadEvents();
  }

  function closeUploadModal() {
    if (uploadModalEl) {
      uploadModalEl.classList.remove('active');
      document.body.style.overflow = '';
    }
    parsedRows = [];
    detectedBankInfo = null;
    currentFile = null;
    currentSearchQuery = '';
    currentFilterTab = 'all';
  }

  function showStep(stepId) {
    if (!uploadModalEl) return;
    const steps = uploadModalEl.querySelectorAll('.upload-step');
    steps.forEach(s => s.style.display = 'none');

    const target = document.getElementById(stepId);
    if (target) target.style.display = '';

    const footer = document.getElementById('uploadFooter');
    if (footer) footer.style.display = stepId === 'uploadStep2' ? '' : 'none';
  }

  // ─── Bind Initial Upload Events ───

  function bindUploadEvents() {
    const closeBtn = document.getElementById('uploadModalClose');
    const cancelBtn = document.getElementById('uploadCancelBtn');
    const backBtn = document.getElementById('uploadBackBtn');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('statementFileInput');
    const searchInput = document.getElementById('reviewSearchInput');
    const searchClear = document.getElementById('reviewSearchClear');
    const unlockBtn = document.getElementById('statementUnlockBtn');
    const passwordInput = document.getElementById('statementPasswordInput');
    const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');

    closeBtn?.addEventListener('click', closeUploadModal);
    cancelBtn?.addEventListener('click', closeUploadModal);

    uploadModalEl?.addEventListener('click', (e) => {
      if (e.target === uploadModalEl) closeUploadModal();
    });

    // Back to step 1
    backBtn?.addEventListener('click', () => {
      parsedRows = [];
      detectedBankInfo = null;
      currentFile = null;
      currentFilterTab = 'all';
      showStep('uploadStep1');
      if (fileInput) fileInput.value = '';
    });

    cancelPasswordBtn?.addEventListener('click', () => {
      currentFile = null;
      showStep('uploadStep1');
      if (fileInput) fileInput.value = '';
    });

    // Password unlock
    unlockBtn?.addEventListener('click', () => {
      const pwd = (passwordInput?.value || '').trim();
      if (!pwd) {
        showToast('Please enter the statement password.', 'warning');
        return;
      }
      if (currentFile) {
        processFile(currentFile, pwd);
      }
    });

    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unlockBtn?.click();
    });

    // Search input
    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      renderReviewTable();
    });

    // Search clear button
    searchClear?.addEventListener('click', () => {
      currentSearchQuery = '';
      if (searchInput) searchInput.value = '';
      renderReviewTable();
    });

    // Browse button click
    const browseBtn = document.getElementById('uploadBrowseBtn');
    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    // Demo statement loader
    const loadDemoBtn = document.getElementById('loadSampleDemoBtn');
    loadDemoBtn?.addEventListener('click', async () => {
      try {
        const resp = await fetch('assets/sample-statement.csv');
        if (!resp.ok) throw new Error('Fetch failed');
        const text = await resp.text();
        const file = new File([text], 'sample-statement.csv', { type: 'text/csv' });
        processFile(file);
      } catch (err) {
        const fallbackCsv = `Date,Description,Withdrawal,Deposit,Balance
15/01/2025,Salary Credited Infosys Ltd,,85000.00,85000.00
16/01/2025,Swiggy Food Delivery Bangalore,450.50,,84549.50
17/01/2025,Amazon India Online Shopping,2499.00,,82050.50
18/01/2025,Uber Ride Indiranagar,320.00,,81730.50
19/01/2025,Freelance Stipend Payment Stripe,,15000.00,96730.50
20/01/2025,Electricity Bill BESCOM,1850.00,,94880.50
21/01/2025,Netflix Entertainment Subscription,649.00,,94231.50
22/01/2025,Grocery Store BigBasket,3120.00,,91111.50`;
        const file = new File([fallbackCsv], 'sample-statement.csv', { type: 'text/csv' });
        processFile(file);
      }
    });

    // Dropzone click
    dropzone?.addEventListener('click', () => fileInput?.click());

    // Drag & Drop
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    });

    // File input change
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        processFile(fileInput.files[0]);
      }
    });

    // Submit all selected
    submitBtn?.addEventListener('click', handleBulkSubmit);
  }

  // ─── Process File ───

  async function processFile(file, password = '') {
    currentFile = file;
    const filenameEl = document.getElementById('uploadLoadingFilename');
    if (filenameEl) filenameEl.textContent = file.name;

    showStep('uploadStepLoading');

    try {
      if (typeof StatementParser === 'undefined') {
        throw new Error('Statement parser engine is not loaded.');
      }

      const result = await StatementParser.parseStatement(file, password);
      const rows = Array.isArray(result) ? result : (result.transactions || []);
      const bank = result.bank || (rows.bank ? rows.bank : null);

      if (!rows || rows.length === 0) {
        showStep('uploadStep1');
        showToast('No valid transactions could be found in this statement. Please check that the file includes Date, Description, and Amount columns.', 'warning');
        return;
      }

      parsedRows = rows.map(r => ({ ...r, _selected: true }));
      detectedBankInfo = bank;
      currentFilterTab = 'all';
      currentSearchQuery = '';

      showStep('uploadStep2');
      renderReviewTable();

      const bankDisplay = bank && bank.name ? ` from ${bank.name}` : '';
      showToast(`Parsed ${rows.length} transaction${rows.length === 1 ? '' : 's'}${bankDisplay}.`, 'success');

    } catch (err) {
      console.error('[VaultWealth] Statement parse error:', err);

      if (err.isPasswordProtected) {
        showStep('uploadStepPassword');
        const pwdInput = document.getElementById('statementPasswordInput');
        if (pwdInput) {
          pwdInput.value = '';
          pwdInput.focus();
        }
        showToast('Statement is password-protected. Please enter password.', 'info');
      } else {
        showStep('uploadStep1');
        showToast(err.message || 'Failed to parse file.', 'error');
      }
    }
  }

  // ─── Bulk Submit to Supabase ───

  async function handleBulkSubmit() {
    const selectedRows = parsedRows.filter(r => r._selected !== false && !r._editing);
    if (selectedRows.length === 0) {
      showToast('No transactions selected for import.', 'warning');
      return;
    }

    const submitBtn = document.getElementById('uploadSubmitBtn');
    const originalText = submitBtn?.innerHTML;

    try {
      const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!client) {
        showToast('Supabase client not available. Please verify connection.', 'error');
        return;
      }

      const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
      if (!user) {
        showToast('Please sign in to save transactions to your vault.', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 16, height: 16 }) : ''}
          Importing ${selectedRows.length} transactions...
        `;
      }

      const insertRows = selectedRows.map(r => ({
        user_id: user.id,
        type: r.type,
        amount: r.amount,
        category: r.category,
        transaction_date: r.date,
        description: r.description || ''
      }));

      const { error } = await client
        .from('transactions')
        .insert(insertRows);

      if (error) throw error;

      showToast(`Successfully imported ${insertRows.length} transactions into your Vault!`, 'success');
      closeUploadModal();

      // Refresh transactions or dashboard
      if (typeof loadTransactions === 'function') {
        await loadTransactions();
      } else {
        window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
      }

      // Check for recurring subscriptions in the imported rows
      checkAndPromptSubscriptions(selectedRows, client, user);

    } catch (err) {
      console.error('[VaultWealth] Bulk import error:', err);
      showToast('Failed to import transactions: ' + (err.message || err), 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (originalText) submitBtn.innerHTML = originalText;
      }
    }
  }

  // ─── Subscriptions Detection & Confirmation Prompt ───

  async function checkAndPromptSubscriptions(importedRows, client, user) {
    if (!window.StatementParser || typeof window.StatementParser.detectSubscriptions !== 'function') {
      return;
    }

    try {
      // 1. Fetch recent user transactions for cross-statement cadence matching
      let historicalTxs = [];
      try {
        const { data: hist } = await client
          .from('transactions')
          .select('amount, category, transaction_date, description, type')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .order('transaction_date', { ascending: false })
          .limit(300);
        if (hist) historicalTxs = hist;
      } catch (e) {
        console.warn('[StatementUpload] Could not fetch historical transactions for cadence detection:', e);
      }

      // 2. Run detection engine
      const detected = window.StatementParser.detectSubscriptions(importedRows, historicalTxs);
      if (!detected || detected.length === 0) return;

      // 3. Query existing subscriptions to eliminate duplicates
      let existingSubs = [];
      try {
        const { data: subs } = await client
          .from('subscriptions')
          .select('name, amount, billing_cycle')
          .eq('user_id', user.id);
        if (subs) existingSubs = subs;
      } catch (e) {
        console.warn('[StatementUpload] Could not fetch existing subscriptions:', e);
      }

      const existingNames = new Set(
        existingSubs.map(s => (s.name || '').trim().toLowerCase())
      );

      // Filter out any candidates that are already tracked in user's vault
      const newCandidates = detected.filter(cand => {
        const cName = (cand.name || '').trim().toLowerCase();
        if (existingNames.has(cName)) return false;
        return !Array.from(existingNames).some(ex => cName.includes(ex) || ex.includes(cName));
      });

      if (newCandidates.length === 0) return;

      // 4. Prompt user via popup modal after upload modal has transitioned out
      setTimeout(() => {
        openDetectedSubscriptionsModal(newCandidates, client, user);
      }, 400);

    } catch (err) {
      console.warn('[StatementUpload] Error during subscription detection check:', err);
    }
  }

  let detectedSubsModalEl = null;

  function closeDetectedSubsModal() {
    if (detectedSubsModalEl) {
      detectedSubsModalEl.classList.remove('active');
      setTimeout(() => {
        detectedSubsModalEl?.remove();
        detectedSubsModalEl = null;
      }, 250);
    }
  }

  function openDetectedSubscriptionsModal(candidates, client, user) {
    closeDetectedSubsModal();

    detectedSubsModalEl = document.createElement('div');
    detectedSubsModalEl.id = 'detectedSubsModal';
    detectedSubsModalEl.className = 'modal-overlay upload-modal-overlay active';

    const selectedIndices = new Set(candidates.map((_, i) => i));

    const renderCardsHtml = () => {
      return candidates.map((cand, idx) => {
        const isSelected = selectedIndices.has(idx);
        const cycleLabel = cand.billing_cycle || 'monthly';
        const logoUrl = typeof getSubscriptionLogo === 'function' 
          ? getSubscriptionLogo(cand) 
          : '/assets/subscriptions/default-subscription.svg';
        const formattedAmount = Number(cand.amount).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        const formattedDate = formatReviewDate(cand.next_billing_date);

        return `
          <div class="sub-detect-card ${isSelected ? 'selected' : ''}" data-idx="${idx}">
            <input type="checkbox" class="sub-detect-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''}>
            <div class="sub-detect-badge-circle" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px;">
              <img src="${logoUrl}" alt="${escapeHtml(cand.name)}" style="width: 100%; height: 100%; object-fit: contain; ${logoUrl.includes('apple.svg') ? 'filter: brightness(0) invert(1);' : ''}" loading="lazy" onerror="this.src='/assets/subscriptions/default-subscription.svg'">
            </div>
            <div class="sub-detect-info">
              <div class="sub-detect-name">
                <span>${escapeHtml(cand.name)}</span>
                <span style="font-size: 0.68rem; font-weight: 500; padding: 2px 7px; border-radius: 6px; background: rgba(99,102,241,0.18); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); text-transform: capitalize;">
                  ${escapeHtml(cycleLabel)}
                </span>
              </div>
              <div class="sub-detect-reason">
                ${escapeHtml(cand.reason || 'Recurring commitment')} • Next: ${formattedDate}
              </div>
            </div>
            <div class="sub-detect-pricing">
              <div class="sub-detect-amount">₹${formattedAmount}</div>
              <div class="sub-detect-cycle">/${escapeHtml(cycleLabel === 'monthly' ? 'mo' : cycleLabel)}</div>
            </div>
          </div>
        `;
      }).join('');
    };

    detectedSubsModalEl.innerHTML = `
      <div class="modal-box sub-detect-modal-box">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.6rem;">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('subscriptions', '', { width: 22, height: 22 }) : ''}
            Subscriptions Detected
          </h3>
          <button type="button" class="modal-close" id="detectedSubsModalClose" aria-label="Close modal">
            ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 20, height: 20 }) : '&times;'}
          </button>
        </div>

        <div class="modal-body" style="padding: 1.25rem 1.5rem;">
          <div class="sub-detect-banner">
            <div class="sub-detect-banner-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('lightning', '', { width: 20, height: 20 }) : '⚡'}
            </div>
            <div class="sub-detect-banner-text">
              Found <strong>${candidates.length} recurring subscription${candidates.length > 1 ? 's' : ''}</strong> in your statement.
              Select which ones you would like to track in your <strong>Subscription Tracker</strong>.
            </div>
          </div>

          <div class="sub-detect-list" id="detectedSubsList">
            ${renderCardsHtml()}
          </div>

          <div class="sub-detect-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="skipDetectedSubsBtn">
              Skip
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="confirmTrackSubsBtn">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 15, height: 15 }) : '✓'}
              Track Selected (${selectedIndices.size})
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(detectedSubsModalEl);

    const listEl = detectedSubsModalEl.querySelector('#detectedSubsList');
    const confirmBtn = detectedSubsModalEl.querySelector('#confirmTrackSubsBtn');
    const closeBtn = detectedSubsModalEl.querySelector('#detectedSubsModalClose');
    const skipBtn = detectedSubsModalEl.querySelector('#skipDetectedSubsBtn');

    const updateConfirmBtn = () => {
      if (!confirmBtn) return;
      confirmBtn.disabled = selectedIndices.size === 0;
      confirmBtn.innerHTML = `
        ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 15, height: 15 }) : '✓'}
        Track Selected (${selectedIndices.size})
      `;
    };

    // Toggle card selection
    listEl?.addEventListener('click', (e) => {
      const card = e.target.closest('.sub-detect-card');
      if (!card) return;
      const idx = parseInt(card.dataset.idx, 10);
      const checkbox = card.querySelector('.sub-detect-checkbox');

      if (e.target === checkbox) {
        if (checkbox.checked) {
          selectedIndices.add(idx);
          card.classList.add('selected');
        } else {
          selectedIndices.delete(idx);
          card.classList.remove('selected');
        }
      } else {
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx);
          checkbox.checked = false;
          card.classList.remove('selected');
        } else {
          selectedIndices.add(idx);
          checkbox.checked = true;
          card.classList.add('selected');
        }
      }
      updateConfirmBtn();
    });

    closeBtn?.addEventListener('click', closeDetectedSubsModal);
    skipBtn?.addEventListener('click', closeDetectedSubsModal);

    detectedSubsModalEl.addEventListener('click', (e) => {
      if (e.target === detectedSubsModalEl) {
        closeDetectedSubsModal();
      }
    });

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        closeDetectedSubsModal();
        document.removeEventListener('keydown', onKeydown);
      }
    };
    document.addEventListener('keydown', onKeydown);

    confirmBtn?.addEventListener('click', async () => {
      const chosen = candidates.filter((_, idx) => selectedIndices.has(idx));
      if (chosen.length === 0) {
        closeDetectedSubsModal();
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `
        ${typeof getSvgIcon === 'function' ? getSvgIcon('spinner', 'icon-spin', { width: 15, height: 15 }) : ''}
        Saving ${chosen.length} subscriptions...
      `;

      try {
        const toInsert = chosen.map(cand => ({
          user_id: user.id,
          name: cand.name,
          amount: parseFloat(cand.amount),
          currency: cand.currency || 'INR',
          billing_cycle: cand.billing_cycle || 'monthly',
          category: 'Subscriptions',
          payment_method: 'Auto-Debit / Statement',
          next_billing_date: cand.next_billing_date,
          start_date: cand.last_transaction_date || new Date().toISOString().split('T')[0],
          status: 'active',
          auto_create_transaction: true,
          reminder_days_before: 3,
          brand_color: cand.brand_color || '#6366f1',
          description: `Detected from statement (${cand.reason || 'Recurring'})`
        }));

        const { error } = await client
          .from('subscriptions')
          .insert(toInsert);

        if (error) throw error;

        showToast(`Added ${toInsert.length} subscription${toInsert.length > 1 ? 's' : ''} to your tracker!`, 'success');
        closeDetectedSubsModal();

        window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
        if (typeof window.loadSubscriptions === 'function') {
          await window.loadSubscriptions();
        }
      } catch (err) {
        console.error('[StatementUpload] Failed to save detected subscriptions:', err);
        showToast('Failed to save subscriptions: ' + (err.message || err), 'error');
        confirmBtn.disabled = false;
        updateConfirmBtn();
      }
    });
  }

  // ─── Toast Notifications ───

  function showToast(message, type = 'info') {
    document.querySelectorAll('.upload-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `upload-toast upload-toast-${type}`;

    const iconMap = { success: 'check-circle', error: 'x-circle', warning: 'warning', info: 'info' };
    const iconName = iconMap[type] || 'info';

    toast.innerHTML = `
      <span class="upload-toast-icon">${typeof getSvgIcon === 'function' ? getSvgIcon(iconName, '', { width: 18, height: 18 }) : ''}</span>
      <span class="upload-toast-msg">${message}</span>
      <button class="upload-toast-close" aria-label="Dismiss">
        ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 14, height: 14 }) : '×'}
      </button>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));

    toast.querySelector('.upload-toast-close')?.addEventListener('click', () => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 250);
    }, 5000);
  }

  // ─── Helpers ───

  function formatReviewDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`;
      }
      if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(dateStr)) {
        const parts = dateStr.split(/[-/]/);
        return `${parseInt(parts[0], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  function truncateStr(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function initTransactionTable() {}

  // ─── Export ───
  window.openStatementUploadModal = openUploadModal;
  window.closeStatementUploadModal = closeUploadModal;
  window.openDetectedSubscriptionsModal = openDetectedSubscriptionsModal;
  window.closeDetectedSubscriptionsModal = closeDetectedSubsModal;
  window.initTransactionTable = initTransactionTable;

})();
