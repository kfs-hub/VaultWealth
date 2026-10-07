/**
 * VaultWealth — Bank Statement Upload & Review Module
 * 
 * Provides interactive modal with:
 *  - Drag-and-drop file upload zone (CSV, Excel, PDF)
 *  - Bank auto-detection badge (HDFC, SBI, ICICI, Axis, Kotak, etc.)
 *  - Password prompt for encrypted Indian bank statements
 *  - Download sample statement option
 *  - Parsed transaction review table with search, select/deselect
 *  - Inline edit & remove per row
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
            Want to test without a real statement?
            <a href="assets/sample-statement.csv" download="sample-statement.csv" id="downloadSampleLink" class="upload-sample-link">
              Download Sample Indian Statement (CSV)
            </a>
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
              ${typeof getSvgIcon === 'function' ? getSvgIcon('lock', '', { width: 44, height: 44 }) : '🔒'}
            </div>
            <h4 style="font-size: 1.15rem; font-weight: 700; color: #FFFFFF; margin: 0;">Statement is Encrypted</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
              This bank statement is protected with a password. Please enter the password to unlock and parse transactions.
            </p>
            <div class="upload-password-hint">
              <strong>💡 Common Indian Bank Passwords:</strong><br>
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

        <!-- Step 2: Review & Edit Table -->
        <div class="modal-body upload-step" id="uploadStep2" style="display: none;">
          
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
            </div>

            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <div id="reviewBankBadge" class="upload-bank-badge" style="display: none;">
                🏦 <span id="reviewBankName">Bank Statement</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="uploadBackBtn">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('upload', '', { width: 14, height: 14 }) : ''}
                Upload Another File
              </button>
            </div>
          </div>

          <!-- Toolbar with search and period -->
          <div class="upload-review-toolbar">
            <div class="upload-period-badge" id="reviewPeriodBadge">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('calendar', '', { width: 14, height: 14 }) : '📅'}
              <span id="reviewPeriodText">Statement Period</span>
            </div>
            <div class="upload-search-wrapper">
              <span class="upload-search-icon">
                ${typeof getSvgIcon === 'function' ? getSvgIcon('search', '', { width: 14, height: 14 }) : '🔍'}
              </span>
              <input type="text" class="form-control form-control-sm" id="reviewSearchInput" placeholder="Filter transactions...">
            </div>
          </div>

          <div class="upload-review-table-wrapper">
            <table class="data-table upload-review-table">
              <thead>
                <tr>
                  <th style="width: 30px; text-align: center;">
                    <input type="checkbox" id="selectAllCheckbox" checked title="Select/Deselect all">
                  </th>
                  <th style="width: 35px;">#</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th style="text-align: right;">Amount</th>
                  <th style="text-align: center; width: 90px;">Actions</th>
                </tr>
              </thead>
              <tbody id="reviewTableBody">
              </tbody>
            </table>
          </div>

          <div class="upload-empty-state" id="uploadEmptyState" style="display: none;">
            <div class="upload-empty-icon">
              ${typeof getSvgIcon === 'function' ? getSvgIcon('alert-circle', '', { width: 40, height: 40 }) : ''}
            </div>
            <h4>No transactions match your filter</h4>
            <p>Try clearing your search query or uploading another statement.</p>
          </div>
        </div>

        <!-- Footer (shown in review step) -->
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

  // ─── Render Review Table ───

  function renderReviewTable() {
    const tbody = document.getElementById('reviewTableBody');
    const countEl = document.getElementById('reviewTotalCount');
    const incomeEl = document.getElementById('reviewTotalIncome');
    const expenseEl = document.getElementById('reviewTotalExpenses');
    const selectedCountEl = document.getElementById('uploadSelectedCount');
    const emptyState = document.getElementById('uploadEmptyState');
    const tableWrapper = document.querySelector('.upload-review-table-wrapper');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const bankBadge = document.getElementById('reviewBankBadge');
    const bankNameEl = document.getElementById('reviewBankName');
    const periodTextEl = document.getElementById('reviewPeriodText');
    const selectAllCb = document.getElementById('selectAllCheckbox');

    if (!tbody) return;

    // Display bank info
    if (detectedBankInfo && detectedBankInfo.name) {
      if (bankBadge) bankBadge.style.display = 'inline-flex';
      if (bankNameEl) bankNameEl.textContent = detectedBankInfo.name;
    } else {
      if (bankBadge) bankBadge.style.display = 'none';
    }

    // Filter rows by search query
    const query = currentSearchQuery.trim().toLowerCase();
    const visibleRows = parsedRows.map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (!query) return true;
        return (
          (row.description || '').toLowerCase().includes(query) ||
          (row.category || '').toLowerCase().includes(query) ||
          (row.date || '').includes(query) ||
          String(row.amount).includes(query)
        );
      });

    // Compute period
    if (parsedRows.length > 0 && periodTextEl) {
      const dates = parsedRows.map(r => r.date).filter(Boolean).sort();
      if (dates.length > 0) {
        const start = formatReviewDate(dates[0]);
        const end = formatReviewDate(dates[dates.length - 1]);
        periodTextEl.textContent = start === end ? start : `${start} – ${end}`;
      }
    }

    // Selected count & totals across ALL selected rows
    let selectedCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    parsedRows.forEach(row => {
      const isSelected = row._selected !== false;
      if (isSelected) {
        selectedCount++;
        if (row.type === 'income') totalIncome += row.amount;
        else totalExpense += row.amount;
      }
    });

    if (countEl) countEl.textContent = parsedRows.length;
    if (incomeEl) incomeEl.textContent = `₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.textContent = `₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (selectedCountEl) selectedCountEl.textContent = `${selectedCount} of ${parsedRows.length} transaction${parsedRows.length === 1 ? '' : 's'}`;

    if (submitBtn) {
      submitBtn.disabled = selectedCount === 0;
      submitBtn.innerHTML = `
        ${typeof getSvgIcon === 'function' ? getSvgIcon('check-circle', '', { width: 16, height: 16 }) : ''}
        Import ${selectedCount} Transaction${selectedCount === 1 ? '' : 's'}
      `;
    }

    if (selectAllCb) {
      selectAllCb.checked = selectedCount === parsedRows.length && parsedRows.length > 0;
      selectAllCb.indeterminate = selectedCount > 0 && selectedCount < parsedRows.length;
    }

    if (visibleRows.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (tableWrapper) tableWrapper.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (tableWrapper) tableWrapper.style.display = 'block';

    const expenseCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.expense.map(c => c.name) : ['Other'];
    const incomeCategories = typeof CATEGORIES !== 'undefined' ? CATEGORIES.income.map(c => c.name) : ['Other Income'];

    let html = '';

    visibleRows.forEach(({ row, originalIndex }) => {
      const idx = originalIndex;
      const isIncome = row.type === 'income';
      const isSelected = row._selected !== false;

      const catOptions = isIncome ? incomeCategories : expenseCategories;
      const catOptionsHtml = catOptions.map(c =>
        `<option value="${escapeAttr(c)}" ${c === row.category ? 'selected' : ''}>${escapeAttr(c)}</option>`
      ).join('');

      html += `
        <tr data-row-idx="${idx}" class="${row._editing ? 'editing-row' : ''} ${!isSelected ? 'row-deselected' : ''}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-checkbox" data-idx="${idx}" ${isSelected ? 'checked' : ''} ${row._editing ? 'disabled' : ''}>
          </td>
          <td class="row-num">${idx + 1}</td>
          <td>
            ${row._editing
              ? `<input type="date" class="form-control form-control-sm edit-date" value="${row.date}">`
              : `<span class="review-date">${formatReviewDate(row.date)}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<input type="text" class="form-control form-control-sm edit-desc" value="${escapeAttr(row.description)}" placeholder="Description">`
              : `<span class="review-desc" title="${escapeAttr(row._original || row.description)}">${escapeHtml(truncateStr(row.description, 45))}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<select class="form-control form-control-sm edit-category">${catOptionsHtml}</select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-category'}">${escapeHtml(row.category)}</span>`
            }
          </td>
          <td>
            ${row._editing
              ? `<select class="form-control form-control-sm edit-type">
                   <option value="expense" ${row.type === 'expense' ? 'selected' : ''}>Expense</option>
                   <option value="income" ${row.type === 'income' ? 'selected' : ''}>Income</option>
                 </select>`
              : `<span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? 'Income' : 'Expense'}</span>`
            }
          </td>
          <td style="text-align: right;">
            ${row._editing
              ? `<input type="number" class="form-control form-control-sm edit-amount" value="${row.amount}" step="0.01" min="0.01" style="text-align: right;">`
              : `<span class="amount ${isIncome ? 'amount-income' : 'amount-expense'}">${isIncome ? '+' : '-'} ₹${row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
            }
          </td>
          <td style="text-align: center;">
            <div class="review-actions">
              ${row._editing
                ? `<button class="btn-icon btn-sm review-save-btn" data-idx="${idx}" title="Save changes" aria-label="Save">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('check', '', { width: 15, height: 15 }) : '✓'}
                   </button>
                   <button class="btn-icon btn-sm review-cancel-edit-btn" data-idx="${idx}" title="Cancel edit" aria-label="Cancel">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('x', '', { width: 15, height: 15 }) : '✗'}
                   </button>`
                : `<button class="btn-icon btn-sm review-edit-btn" data-idx="${idx}" title="Edit transaction" aria-label="Edit">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('edit', '', { width: 15, height: 15 }) : 'Edit'}
                   </button>
                   <button class="btn-icon btn-sm review-remove-btn" data-idx="${idx}" title="Remove transaction" aria-label="Remove" style="color: var(--color-expense);">
                     ${typeof getSvgIcon === 'function' ? getSvgIcon('trash', '', { width: 15, height: 15 }) : 'Del'}
                   </button>`
              }
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    bindReviewTableActions();
  }

  // ─── Bind Actions ───

  function bindReviewTableActions() {
    const tbody = document.getElementById('reviewTableBody');
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (!tbody) return;

    // Row selection checkboxes
    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.idx, 10);
        parsedRows[idx]._selected = cb.checked;
        renderReviewTable();
      });
    });

    // Select all
    selectAllCb?.replaceWith(selectAllCb.cloneNode(true));
    const freshSelectAll = document.getElementById('selectAllCheckbox');
    freshSelectAll?.addEventListener('change', () => {
      const shouldSelect = freshSelectAll.checked;
      parsedRows.forEach(r => { r._selected = shouldSelect; });
      renderReviewTable();
    });

    // Edit buttons
    tbody.querySelectorAll('.review-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        parsedRows[idx]._editing = true;
        renderReviewTable();
      });
    });

    // Remove buttons
    tbody.querySelectorAll('.review-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const tr = btn.closest('tr');
        if (tr) {
          tr.classList.add('row-removing');
          setTimeout(() => {
            parsedRows.splice(idx, 1);
            renderReviewTable();
          }, 240);
        } else {
          parsedRows.splice(idx, 1);
          renderReviewTable();
        }
      });
    });

    // Save edit buttons
    tbody.querySelectorAll('.review-save-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const tr = btn.closest('tr');
        if (!tr) return;

        const newDate = tr.querySelector('.edit-date')?.value;
        const newDesc = tr.querySelector('.edit-desc')?.value;
        const newCategory = tr.querySelector('.edit-category')?.value;
        const newType = tr.querySelector('.edit-type')?.value;
        const newAmount = parseFloat(tr.querySelector('.edit-amount')?.value);

        if (newDate) parsedRows[idx].date = newDate;
        if (newDesc !== undefined) parsedRows[idx].description = newDesc;
        if (newCategory) parsedRows[idx].category = newCategory;
        if (newType) parsedRows[idx].type = newType;
        if (!isNaN(newAmount) && newAmount > 0) parsedRows[idx].amount = newAmount;

        // When type changes, re-infer category if not valid for new type
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
      });
    });

    // Cancel edit
    tbody.querySelectorAll('.review-cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        delete parsedRows[idx]._editing;
        renderReviewTable();
      });
    });

    // Type select change in edit mode
    tbody.querySelectorAll('.edit-type').forEach(select => {
      select.addEventListener('change', () => {
        const tr = select.closest('tr');
        const newType = select.value;
        const catSelect = tr.querySelector('.edit-category');
        if (!catSelect || typeof CATEGORIES === 'undefined') return;

        const newCats = CATEGORIES[newType] || [];
        catSelect.innerHTML = newCats.map(c =>
          `<option value="${escapeAttr(c.name)}">${escapeAttr(c.name)}</option>`
        ).join('');
      });
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

  // ─── Bind Upload Events ───

  function bindUploadEvents() {
    const closeBtn = document.getElementById('uploadModalClose');
    const cancelBtn = document.getElementById('uploadCancelBtn');
    const backBtn = document.getElementById('uploadBackBtn');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('statementFileInput');
    const searchInput = document.getElementById('reviewSearchInput');
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

    // Search filter
    searchInput?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      renderReviewTable();
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

    // Submit all
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
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`;
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
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function initTransactionTable() {}

  // ─── Export ───
  window.openStatementUploadModal = openUploadModal;
  window.closeStatementUploadModal = closeUploadModal;
  window.initTransactionTable = initTransactionTable;

})();
