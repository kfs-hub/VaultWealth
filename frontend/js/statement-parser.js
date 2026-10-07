/**
 * VaultWealth — Bank Statement Parser Engine
 * 
 * Supports CSV, Excel (.xlsx, .xls), and PDF statements for major Indian banks:
 * - HDFC Bank
 * - State Bank of India (SBI)
 * - ICICI Bank
 * - Axis Bank
 * - Kotak Mahindra Bank
 * - Punjab National Bank (PNB)
 * - Bank of Baroda (BoB)
 * - Canara Bank
 * - IDFC FIRST Bank
 * - Federal Bank / Scapia
 * - IndusInd Bank
 * - Yes Bank
 * - Generic Indian Bank statements
 * 
 * Key Features:
 * - Bank auto-detection from filename and statement metadata
 * - Dynamic header finding (skips 10-35 rows of pre-header bank metadata)
 * - Strict decimal amount parsing (prevents 350.00 becoming 35.00 by ignoring reference numbers)
 * - Multi-signal Credit vs Debit classification (balance delta, dual columns, type tokens, narration signatures)
 * - Geometric PDF text reconstruction (Y-clustering + X-sorting)
 * - UPI / NEFT / IMPS / POS / ATM description cleaning
 * - Smart categorization tailored to Indian merchants
 * - Password handling for encrypted PDFs and Excel files
 * 
 * Dependencies (loaded via CDN):
 * - SheetJS (xlsx.full.min.js)
 * - PDF.js (pdf.min.js)
 * 
 * Exports: window.StatementParser
 */

(function () {
  'use strict';

  // ─── Bank Signatures & Detection ───

  const BANK_PROFILES = [
    {
      code: 'hdfc',
      name: 'HDFC Bank',
      keywords: ['hdfc bank', 'hdfcbank', 'hdfc'],
      headerHints: ['narration', 'withdrawal amt', 'deposit amt', 'closing balance']
    },
    {
      code: 'sbi',
      name: 'State Bank of India (SBI)',
      keywords: ['state bank of india', 'state bank', 'sbi', 'sbin'],
      headerHints: ['txn date', 'value date', 'ref no./cheque no', 'mod balance']
    },
    {
      code: 'icici',
      name: 'ICICI Bank',
      keywords: ['icici bank', 'icicibank', 'icici'],
      headerHints: ['transaction remarks', 'withdrawal amount', 'deposit amount']
    },
    {
      code: 'axis',
      name: 'Axis Bank',
      keywords: ['axis bank', 'axisbank', 'axis'],
      headerHints: ['tran date', 'particulars', 'chqno', 'sol']
    },
    {
      code: 'kotak',
      name: 'Kotak Mahindra Bank',
      keywords: ['kotak mahindra', 'kotak bank', 'kotak'],
      headerHints: ['narration', 'withdrawal (dr)', 'deposit (cr)']
    },
    {
      code: 'pnb',
      name: 'Punjab National Bank (PNB)',
      keywords: ['punjab national', 'pnb'],
      headerHints: ['tran date', 'particulars']
    },
    {
      code: 'bob',
      name: 'Bank of Baroda',
      keywords: ['bank of baroda', 'bob'],
      headerHints: ['particulars', 'withdrawal', 'deposit']
    },
    {
      code: 'canara',
      name: 'Canara Bank',
      keywords: ['canara bank', 'canara'],
      headerHints: ['narration', 'debit', 'credit']
    },
    {
      code: 'idfc',
      name: 'IDFC FIRST Bank',
      keywords: ['idfc first', 'idfc'],
      headerHints: ['transaction details', 'debit', 'credit']
    },
    {
      code: 'federal',
      name: 'Federal Bank / Scapia',
      keywords: ['federal bank', 'scapia'],
      headerHints: ['narration', 'particulars']
    },
    {
      code: 'indusind',
      name: 'IndusInd Bank',
      keywords: ['indusind'],
      headerHints: ['particulars', 'debit', 'credit']
    },
    {
      code: 'yes',
      name: 'Yes Bank',
      keywords: ['yes bank', 'yesbank'],
      headerHints: ['transaction description']
    }
  ];

  function detectBank(sampleText = '', filename = '') {
    const fname = (filename || '').toLowerCase();

    // 1. Check filename
    for (const b of BANK_PROFILES) {
      if (b.keywords.some(kw => new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, 'i').test(fname))) {
        return { code: b.code, name: b.name };
      }
    }

    // 2. Check top 25 lines of statement preamble
    const topLines = (sampleText || '').split(/\r?\n/).slice(0, 25).join(' ').toLowerCase();
    for (const b of BANK_PROFILES) {
      if (b.keywords.some(kw => new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, 'i').test(topLines))) {
        return { code: b.code, name: b.name };
      }
    }

    // 3. Check header hints
    for (const b of BANK_PROFILES) {
      if (b.headerHints && b.headerHints.every(h => topLines.includes(h))) {
        return { code: b.code, name: b.name };
      }
    }

    return { code: 'generic', name: 'Indian Bank Statement' };
  }

  // ─── Month Names Map ───

  const MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  /**
   * Normalize date string into YYYY-MM-DD format.
   * Handles DD/MM/YYYY, DD-MM-YYYY, DD Mon YYYY, DD-Mon-YY, Excel serials.
   */
  function normalizeDate(raw) {
    if (!raw) return new Date().toISOString().split('T')[0];

    if (raw instanceof Date) {
      if (!isNaN(raw.getTime())) {
        return raw.toISOString().split('T')[0];
      }
      return new Date().toISOString().split('T')[0];
    }

    const str = String(raw).trim();
    if (!str) return new Date().toISOString().split('T')[0];

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD Mon YYYY or DD-Mon-YYYY or DD-Mon-YY (e.g., "1 Sep 2026", "05-Oct-2024", "15-AUG-24")
    const dMonY = str.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.](\d{2,4})$/);
    if (dMonY) {
      const day = parseInt(dMonY[1], 10);
      const monStr = dMonY[2].toLowerCase();
      const month = MONTH_MAP[monStr] || MONTH_MAP[monStr.substring(0, 3)];
      let year = parseInt(dMonY[3], 10);
      if (year < 100) year = year >= 50 ? 1900 + year : 2000 + year;
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Standard Indian banking format)
    const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
      const p1 = parseInt(dmy[1], 10);
      const p2 = parseInt(dmy[2], 10);
      const y = dmy[3];
      if (p2 <= 12) {
        return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      } else {
        return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
    }

    // DD/MM/YY short year (e.g. "04/10/24")
    const dmyShort = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
    if (dmyShort) {
      const p1 = parseInt(dmyShort[1], 10);
      const p2 = parseInt(dmyShort[2], 10);
      const shortY = parseInt(dmyShort[3], 10);
      const y = shortY >= 50 ? 1900 + shortY : 2000 + shortY;
      if (p2 <= 12) {
        return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      } else {
        return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
    }

    // Excel serial date number
    const num = parseFloat(str);
    if (!isNaN(num) && num > 25569 && num < 70000) {
      const excelDate = new Date((num - 25569) * 86400000);
      if (!isNaN(excelDate.getTime())) {
        return excelDate.toISOString().split('T')[0];
      }
    }

    // Fallback: Date parse
    const fallbackDate = new Date(str);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  /**
   * Parse numeric amount from Indian formatted cell.
   * Handles commas (1,25,000.50), CR/DR suffixes, parentheses, minus signs.
   */
  function parseAmount(raw) {
    if (typeof raw === 'number') return Math.abs(raw);
    if (!raw) return 0;
    let str = String(raw).trim();
    if (!str || str === '-' || str === '--' || /^(nil|null|na|n\/a)$/i.test(str)) {
      return 0;
    }

    // Strip currency prefixes & symbols (Rs., Rs, INR, ₹, $, €, £)
    str = str.replace(/^(?:rs\.?|inr|usd|eur|gbp|[₹$€£])\s*/i, '');
    // Strip trailing suffixes (CR, DR, C, D, INR)
    str = str.replace(/\s*(?:cr|dr|c|d|inr)\.?\s*$/i, '');
    // Strip commas, spaces, currency symbols anywhere
    str = str.replace(/[₹$€£,\s]/g, '');
    // Handle parentheses (100.00) -> -100.00
    str = str.replace(/\(([0-9.]+)\)/, '-$1');

    const val = parseFloat(str);
    return isNaN(val) ? 0 : Math.abs(val);
  }

  // ─── Strict Decimal & Currency Amount Regex ───
  // Requires explicit decimal point with 2 digits or currency notation.
  // This prevents reference IDs like 428935 from being matched as 35 or 35.00!
  const AMOUNT_STRICT_RE = /(?:[₹$€£]\s*)?((?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})(?:\s*([Cc][Rr]?|[Dd][Rr]?|[Cc]redit|[Dd]ebit)\.?)?\b/g;

  // ─── Credit vs Debit Resolution Engine ───

  function resolveTransactionType({
    debitCell = '',
    creditCell = '',
    typeCell = '',
    amountStr = '',
    description = '',
    balance = null,
    prevBalance = null
  }) {
    // 1. Dual-column check (most Indian bank statements)
    const dVal = parseAmount(debitCell);
    const cVal = parseAmount(creditCell);

    if (cVal > 0 && dVal === 0) return 'income';
    if (dVal > 0 && cVal === 0) return 'expense';

    // 2. Mathematical Balance check (Signal Weight: 100)
    // If balance increased, it's 100% mathematically a credit/income.
    // If balance decreased, it's 100% mathematically a debit/expense.
    if (balance !== null && prevBalance !== null && !isNaN(balance) && !isNaN(prevBalance)) {
      const diff = balance - prevBalance;
      if (diff > 0.05) return 'income';
      if (diff < -0.05) return 'expense';
    }

    // 3. Single-column Type indicator (CR, DR, C, D, etc.)
    if (typeCell) {
      const t = String(typeCell).trim().toUpperCase();
      if (/^(C|CR|CREDIT|DEP|DEPOSIT|\+)$/i.test(t)) return 'income';
      if (/^(D|DR|DEBIT|WDL|WITHDRAWAL|-)$/i.test(t)) return 'expense';
    }

    // 4. Amount string suffix / sign (e.g. "3,539.00 C" in SBI Card, "-350.00", "350.00 CR")
    if (amountStr) {
      const a = String(amountStr).trim().toUpperCase();
      if (/(?:CR|C)\.?$/i.test(a) || a.startsWith('+')) return 'income';
      if (/(?:DR|D)\.?$/i.test(a) || a.startsWith('-') || a.includes('(')) return 'expense';
    }

    // 5. Narration text indicators (UPI/CR, UPI/DR, NEFT CR, Salary, ATM, etc.)
    const desc = (description || '').toUpperCase();

    // Credit indicators
    if (
      desc.includes('UPI/CR/') ||
      desc.includes('NEFT CR') ||
      desc.includes('IMPS CR') ||
      desc.includes('DEP TFR') ||
      desc.includes('BY TRANSFER') ||
      desc.includes('SALARY') ||
      desc.includes('INTEREST') ||
      desc.includes('DIVIDEND') ||
      desc.includes('REFUND') ||
      desc.includes('CASHBACK') ||
      desc.includes('PAYMENT RECEIVED') ||
      desc.includes('RECEIVED FROM')
    ) {
      return 'income';
    }

    // Debit indicators
    if (
      desc.includes('UPI/DR/') ||
      desc.includes('NEFT DR') ||
      desc.includes('IMPS DR') ||
      desc.includes('WDL TFR') ||
      desc.includes('TO TRANSFER') ||
      desc.includes('ATM') ||
      desc.includes('POS ') ||
      desc.includes('SWIGGY') ||
      desc.includes('ZOMATO') ||
      desc.includes('UBER') ||
      desc.includes('OLA') ||
      desc.includes('BLINKIT') ||
      desc.includes('ZEPTO') ||
      desc.includes('AMAZON') ||
      desc.includes('FLIPKART') ||
      desc.includes('PAID TO') ||
      desc.includes('BILL PAYMENT') ||
      desc.includes('CHARGES')
    ) {
      return 'expense';
    }

    return 'expense';
  }

  // ─── Column Detection Engine ───

  function normalizeHeader(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectColumns(headers) {
    const mapping = {
      date: -1,
      description: -1,
      debit: -1,
      credit: -1,
      amount: -1,
      balance: -1,
      type: -1,
      ref: -1
    };

    // First pass: Balance & Ref (to avoid 'balance (cr)' matching credit)
    headers.forEach((rawH, i) => {
      const h = normalizeHeader(rawH);
      if (!h) return;

      if (mapping.balance < 0 && (h.includes('balance') || h === 'bal' || h.includes('running bal') || h.includes('closing bal'))) {
        mapping.balance = i;
      }
      if (mapping.ref < 0 && (h.includes('ref') || h.includes('cheque') || h.includes('chq') || h.includes('utr'))) {
        mapping.ref = i;
      }
    });

    // Second pass: Debit, Credit, Date, Description, Amount, Type
    headers.forEach((rawH, i) => {
      if (i === mapping.balance || i === mapping.ref) return;
      const h = normalizeHeader(rawH);
      if (!h) return;

      // Date
      if (mapping.date < 0 && (
        h === 'date' || h === 'txn date' || h === 'transaction date' ||
        h === 'tran date' || h === 'value date' || h === 'posting date' ||
        h.includes('txn date') || h.includes('trans date') || h.includes('tran date') ||
        (h.includes('date') && !h.includes('value dt') && !h.includes('due'))
      )) {
        mapping.date = i;
        return;
      }

      // Description / Narration
      if (mapping.description < 0 && (
        h.includes('narration') || h.includes('particular') || h.includes('description') ||
        h.includes('remarks') || h.includes('details') || h === 'memo'
      )) {
        mapping.description = i;
        return;
      }

      // Debit / Withdrawal
      if (mapping.debit < 0 && (
        h.includes('withdrawal') || h.includes('debit') || h === 'dr' ||
        h.startsWith('dr ') || h.endsWith(' dr') || h.includes('paid out') || h.includes('outflow')
      )) {
        mapping.debit = i;
        return;
      }

      // Credit / Deposit
      if (mapping.credit < 0 && (
        h.includes('deposit') || h.includes('credit') || h === 'cr' ||
        h.startsWith('cr ') || h.endsWith(' cr') || h.includes('paid in') || h.includes('inflow')
      )) {
        mapping.credit = i;
        return;
      }

      // Type column (CR/DR)
      if (mapping.type < 0 && (
        h === 'type' || h === 'cr dr' || h === 'dr cr' || h.includes('tran type') || h.includes('transaction type')
      )) {
        mapping.type = i;
        return;
      }

      // Single Amount column
      if (mapping.amount < 0 && (
        h === 'amount' || h.includes('txn amount') || h.includes('transaction amount') || h === 'value'
      )) {
        mapping.amount = i;
        return;
      }
    });

    return mapping;
  }

  // ─── Sentinel / Footer Row Detection ───

  function isFooterRow(cells) {
    const line = cells.join(' ').toLowerCase();
    const footers = [
      'statement summary', 'total debit', 'total credit', 'closing balance includes',
      'computer generated', 'does not require', 'end of statement', 'total:', 'grand total',
      'page no', 'page 1 of', 'disclaimer', 'brought forward', 'carried forward',
      'please do not share', 'power of attorney', 'generated on'
    ];
    return footers.some(f => line.includes(f));
  }

  // ─── Description Cleaning Engine ───

  function cleanPartyName(str) {
    let name = (str || '')
      .replace(/[-_/]/g, ' ')
      .replace(/\b(PVT|LTD|LIMITED|INDIA|CORP|SERVICES|COMMERCE|PAYTMQR|QR|MERCHANT)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return name.split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function cleanDescription(raw) {
    let desc = String(raw || '').trim();
    desc = desc.replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/[\n\r\t]/g, ' ').replace(/\s{2,}/g, ' ');

    // Strip branch suffixes
    desc = desc.replace(/\s+\d{6,}\s+AT\s+\d+\s+[A-Za-z\s]+BRANCH$/i, '');
    desc = desc.replace(/\s+AT\s+\d+\s+[A-Za-z\s]+BRANCH$/i, '');

    // 1. UPI/DR/ref/party/... or UPI/CR/ref/party/...
    const upiRegex1 = /UPI\/(CR|DR)\/\d+\/([^/]+)/i;
    const match1 = desc.match(upiRegex1);
    if (match1) {
      const isCr = match1[1].toUpperCase() === 'CR';
      const party = match1[2].trim();
      return `${cleanPartyName(party)} (${isCr ? 'UPI Received' : 'UPI'})`;
    }

    // 2. UPI/ref/party/...
    const upiRegex2 = /UPI\/\d+\/([^/]+)/i;
    const match2 = desc.match(upiRegex2);
    if (match2) {
      return `${cleanPartyName(match2[1].trim())} (UPI)`;
    }

    // 3. UPI-party-ref
    const upiRegex3 = /^UPI[/-]([A-Za-z0-9\s._]+?)(?:-[A-Za-z0-9@]+|$)/i;
    const match3 = desc.match(upiRegex3);
    if (match3 && match3[1].length > 2) {
      return `${cleanPartyName(match3[1].trim())} (UPI)`;
    }

    // 4. NEFT
    const neftMatch = desc.match(/NEFT\s*(CR|DR)?[-:\s]+[A-Za-z0-9]+[-:\s]+([^/-]+)(?:[-:\s]+(.*))?/i);
    if (neftMatch) {
      const isCr = (neftMatch[1] || '').toUpperCase() === 'CR';
      const party = neftMatch[2].trim();
      const extra = neftMatch[3] && !/^\d+$/.test(neftMatch[3].trim()) ? ` - ${cleanPartyName(neftMatch[3].trim())}` : '';
      return `${cleanPartyName(party)}${extra} (${isCr ? 'NEFT Credit' : 'NEFT Debit'})`;
    }

    // 5. IMPS
    const impsMatch = desc.match(/IMPS[-:\s]+[A-Za-z0-9]+[-:\s]+([^/-]+)/i);
    if (impsMatch) {
      return `${cleanPartyName(impsMatch[1].trim())} (IMPS)`;
    }

    // 6. POS / Card Swipes
    const posMatch = desc.match(/POS\s+(?:\d+[X*]+\d+\s+)?(.*)/i);
    if (posMatch) {
      return `${cleanPartyName(posMatch[1].trim())} (Card)`;
    }

    // 7. ATM Withdrawals
    if (/ATM\s*(?:WDL|CASH|WITHDRAWAL)/i.test(desc)) {
      return 'Cash Withdrawal (ATM)';
    }

    // 8. ACH / NACH Auto-Debits
    const achMatch = desc.match(/A[C|N]H\s*[D|C]?[-:\s]+([^/-]+)/i);
    if (achMatch) {
      return `${cleanPartyName(achMatch[1].trim())} (Auto-Debit)`;
    }

    // 9. Standard bank prefixes
    desc = desc
      .replace(/^DEP\s*TFR\s*/i, 'Transfer In - ')
      .replace(/^WDL\s*TFR\s*/i, 'Transfer Out - ')
      .replace(/^INT\.?PD[:\s]*/i, 'Interest Credited - ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return desc.length > 1 ? desc : 'Bank Transaction';
  }

  // ─── Smart Indian Category Inference ───

  const CATEGORY_RULES = {
    expense: [
      {
        category: 'Entertainment',
        keywords: [
          'netflix', 'spotify', 'prime video', 'hotstar', 'disney', 'sonyliv', 'zee5',
          'youtube', 'bookmyshow', 'pvr', 'inox', 'cinepolis', 'movie', 'cinema',
          'theatre', 'gaming', 'steam'
        ]
      },
      {
        category: 'Food & Dining',
        keywords: [
          'swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'dominos', 'pizza', 'mcdonalds',
          'kfc', 'burger', 'dining', 'canteen', 'lunch', 'dinner', 'breakfast', 'bakery',
          'chai', 'tea', 'coffee', 'starbucks', 'dosa', 'biryani', 'kitchen', 'eatclub',
          'freshmenu', 'haldiram', 'barbeque nation', 'chaayos', 'chai point'
        ]
      },
      {
        category: 'Shopping',
        keywords: [
          'amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'mall', 'store', 'retail',
          'meesho', 'nykaa', 'fashion', 'blinkit', 'zepto', 'bigbasket', 'instamart',
          'dmart', 'reliance', 'croma', 'zara', 'h&m', 'decathlon', 'tata cliq', 'lifestyle'
        ]
      },
      {
        category: 'Transport',
        keywords: [
          'uber', 'ola', 'rapido', 'fuel', 'petrol', 'diesel', 'metro', 'toll', 'railway',
          'irctc', 'train', 'namma', 'hpcl', 'bpcl', 'iocl', 'shell', 'fastag',
          /\bauto\b(?!-debit)/i, /\bcab\b/i, /\bbus\b/i
        ]
      },
      {
        category: 'Bills & Utilities',
        keywords: [
          'electricity', 'electric', 'water', 'gas', 'bill', 'utility', 'broadband', 'wifi',
          'internet', 'recharge', 'airtel', 'jio', 'vodafone', 'vi', 'bsnl', 'mobile',
          'phone', 'bescom', 'mseb', 'tata power', 'adani electricity', 'igl', 'mahanagar',
          'cable', 'bill desk', 'bbps', 'cred'
        ]
      },
      {
        category: 'Healthcare',
        keywords: [
          'hospital', 'doctor', 'medical', 'pharmacy', 'medicine', 'health', 'clinic',
          'apollo', 'pharmeasy', '1mg', 'practo', 'netmeds', 'medplus', 'lab', 'test',
          'dental', 'eye', 'dr lal', 'pathology'
        ]
      },
      {
        category: 'Travel',
        keywords: [
          'hotel', 'flight', 'booking', 'goibibo', 'makemytrip', 'airbnb', 'oyo', 'travel',
          'trip', 'vacation', 'holiday', 'indigo', 'air india', 'vistara', 'spicejet',
          'easemytrip', 'cleartrip', 'yatra', 'resort'
        ]
      },
      {
        category: 'Education',
        keywords: [
          'book', 'course', 'udemy', 'coursera', 'tuition', 'school', 'college',
          'university', 'fee', 'exam', 'library', 'coaching', 'unacademy'
        ]
      },
      {
        category: 'Subscriptions',
        keywords: [
          'subscription', 'membership', 'renewal', 'annual fee', 'apple.com',
          'google play', 'github', 'chatgpt', 'openai', 'midjourney', 'linkedin', 'canva'
        ]
      }
    ],
    income: [
      {
        category: 'Salary / Stipend',
        keywords: [
          'salary', 'stipend', 'payroll', 'wages', 'compensation', 'tech mahindra',
          'infosys', 'wipro', 'tcs', 'cognizant', 'accenture', 'microsoft', 'google',
          'amazon', 'hcl', 'capgemini', 'deloitte'
        ]
      },
      {
        category: 'Freelance / Projects',
        keywords: [
          'freelance', 'project', 'invoice', 'consulting', 'contract', 'commission',
          'client payment', 'upwork', 'fiverr'
        ]
      },
      {
        category: 'Allowance / Pocket Money',
        keywords: [
          'allowance', 'pocket', 'transfer from', 'received from', 'upi received'
        ]
      },
      {
        category: 'Investments / Returns',
        keywords: [
          'dividend', 'interest', 'return', 'mutual fund', 'investment', 'maturity',
          'fd', 'rd', 'zerodha', 'groww', 'int.pd', 'int pd', 'uti', 'nippon'
        ]
      }
    ]
  };

  function inferCategory(description, type) {
    const desc = (description || '').toLowerCase();
    const rules = CATEGORY_RULES[type] || [];

    for (const rule of rules) {
      for (const kw of rule.keywords) {
        if (kw instanceof RegExp) {
          if (kw.test(desc)) return rule.category;
        } else {
          if (kw.length <= 4) {
            if (new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, 'i').test(desc)) return rule.category;
          } else {
            if (desc.includes(kw)) return rule.category;
          }
        }
      }
    }

    return type === 'income' ? 'Other Income' : 'Other';
  }

  // ─── CSV Parser Engine ───

  function splitCSVRow(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function detectDelimiter(content) {
    const sample = content.slice(0, 4096);
    const commas = (sample.match(/,/g) || []).length;
    const semicolons = (sample.match(/;/g) || []).length;
    const tabs = (sample.match(/\t/g) || []).length;
    const pipes = (sample.match(/\|/g) || []).length;

    if (tabs > commas && tabs > semicolons) return '\t';
    if (semicolons > commas) return ';';
    if (pipes > commas) return '|';
    return ',';
  }

  function parseCSVText(text, filename = '') {
    const cleanedText = text.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM
    const lines = cleanedText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { bank: { name: 'Empty Statement' }, transactions: [] };

    const bank = detectBank(cleanedText, filename);
    const delimiter = detectDelimiter(cleanedText);
    const allRows = lines.map(l => splitCSVRow(l, delimiter));

    // Dynamic header finder (scans up to 60 rows for preamble)
    let headerIdx = -1;
    let mapping = null;
    let bestScore = 0;

    for (let i = 0; i < Math.min(allRows.length, 60); i++) {
      const row = allRows[i];
      const map = detectColumns(row);
      let score = 0;
      if (map.date >= 0) score += 2;
      if (map.description >= 0) score += 2;
      if (map.debit >= 0) score += 1;
      if (map.credit >= 0) score += 1;
      if (map.amount >= 0) score += 1;

      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
        mapping = map;
      }
      if (score >= 5) break;
    }

    if (headerIdx < 0 || !mapping || mapping.date < 0 || mapping.description < 0) {
      headerIdx = 0;
      mapping = detectColumns(allRows[0]);
    }

    const transactions = [];
    let prevBalance = null;

    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (isFooterRow(row)) break;

      const dateRaw = row[mapping.date];
      const descRaw = row[mapping.description];
      if (!dateRaw || !descRaw) continue;
      if (!/\d/.test(dateRaw)) continue;

      const date = normalizeDate(dateRaw);
      const debitCell = mapping.debit >= 0 ? row[mapping.debit] : '';
      const creditCell = mapping.credit >= 0 ? row[mapping.credit] : '';
      const typeCell = mapping.type >= 0 ? row[mapping.type] : '';
      const amountCell = mapping.amount >= 0 ? row[mapping.amount] : '';
      const balanceCell = mapping.balance >= 0 ? row[mapping.balance] : '';

      const currentBal = mapping.balance >= 0 ? parseAmount(balanceCell) : null;

      // Extract amount
      let amount = 0;
      if (mapping.debit >= 0 && mapping.credit >= 0) {
        const dVal = parseAmount(debitCell);
        const cVal = parseAmount(creditCell);
        amount = cVal > 0 ? cVal : dVal;
      } else if (mapping.amount >= 0) {
        amount = parseAmount(amountCell);
      }

      if (amount <= 0) continue;

      // Multi-signal Credit vs Debit classification
      const type = resolveTransactionType({
        debitCell,
        creditCell,
        typeCell,
        amountStr: amountCell || creditCell || debitCell,
        description: descRaw,
        balance: currentBal,
        prevBalance
      });

      if (currentBal !== null && currentBal > 0) {
        prevBalance = currentBal;
      }

      const description = cleanDescription(descRaw);
      const category = inferCategory(description, type);

      transactions.push({
        date,
        description,
        amount,
        type,
        category,
        _original: row.join(' | ')
      });
    }

    transactions.bank = bank;
    return transactions;
  }

  // ─── Excel Parser Engine (SheetJS) ───

  async function parseExcelFile(file, password = '') {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel parsing library (SheetJS) is not loaded. Please check your internet connection.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const readOpts = { type: 'array', cellDates: true };
          if (password) readOpts.password = password;

          let workbook;
          try {
            workbook = XLSX.read(data, readOpts);
          } catch (readErr) {
            if (/password/i.test(readErr.message || '')) {
              const err = new Error('This Excel file is password-protected. Please provide the statement password.');
              err.isPasswordProtected = true;
              throw err;
            }
            throw readErr;
          }

          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

          if (!jsonRows || jsonRows.length < 2) {
            const emptyResult = [];
            emptyResult.bank = { name: 'Empty Excel Sheet' };
            resolve(emptyResult);
            return;
          }

          const sampleText = jsonRows.slice(0, 25).map(r => r.join(' ')).join('\n');
          const bank = detectBank(sampleText, file.name);

          let headerIdx = -1;
          let mapping = null;
          let bestScore = 0;

          for (let i = 0; i < Math.min(jsonRows.length, 60); i++) {
            const cells = jsonRows[i].map(c => String(c || '').trim());
            const nonEmpty = cells.filter(c => c.length > 0).length;
            if (nonEmpty < 2) continue;

            const map = detectColumns(cells);
            let score = 0;
            if (map.date >= 0) score += 2;
            if (map.description >= 0) score += 2;
            if (map.debit >= 0) score += 1;
            if (map.credit >= 0) score += 1;
            if (map.amount >= 0) score += 1;

            if (score > bestScore) {
              bestScore = score;
              headerIdx = i;
              mapping = map;
            }
            if (score >= 5) break;
          }

          if (headerIdx < 0 || !mapping || mapping.date < 0 || mapping.description < 0) {
            headerIdx = 0;
            mapping = detectColumns(jsonRows[0].map(c => String(c || '')));
          }

          const transactions = [];
          let prevBalance = null;

          for (let i = headerIdx + 1; i < jsonRows.length; i++) {
            const rawCells = jsonRows[i];
            const cells = rawCells.map(c => {
              if (c instanceof Date) return c.toISOString().split('T')[0];
              if (c === null || c === undefined) return '';
              return String(c).trim();
            });

            if (isFooterRow(cells)) break;

            const dateRaw = cells[mapping.date];
            const descRaw = cells[mapping.description];
            if (!dateRaw || !descRaw) continue;
            if (!/\d/.test(dateRaw)) continue;

            const date = normalizeDate(rawCells[mapping.date] || dateRaw);
            const debitCell = mapping.debit >= 0 ? cells[mapping.debit] : '';
            const creditCell = mapping.credit >= 0 ? cells[mapping.credit] : '';
            const typeCell = mapping.type >= 0 ? cells[mapping.type] : '';
            const amountCell = mapping.amount >= 0 ? cells[mapping.amount] : '';
            const balanceCell = mapping.balance >= 0 ? cells[mapping.balance] : '';

            const currentBal = mapping.balance >= 0 ? parseAmount(balanceCell) : null;

            let amount = 0;
            if (mapping.debit >= 0 && mapping.credit >= 0) {
              const dVal = parseAmount(debitCell);
              const cVal = parseAmount(creditCell);
              amount = cVal > 0 ? cVal : dVal;
            } else if (mapping.amount >= 0) {
              amount = parseAmount(amountCell);
            }

            if (amount <= 0) continue;

            const type = resolveTransactionType({
              debitCell,
              creditCell,
              typeCell,
              amountStr: amountCell || creditCell || debitCell,
              description: descRaw,
              balance: currentBal,
              prevBalance
            });

            if (currentBal !== null && currentBal > 0) {
              prevBalance = currentBal;
            }

            const description = cleanDescription(descRaw);
            const category = inferCategory(description, type);

            transactions.push({
              date,
              description,
              amount,
              type,
              category,
              _original: cells.join(' | ')
            });
          }

          transactions.bank = bank;
          resolve(transactions);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ─── PDF Parser Engine (PDF.js with Geometric Line Assembly) ───

  function extractVisualLinesFromPDFPage(content) {
    if (!content || !content.items || content.items.length === 0) return [];

    const cleanItems = content.items
      .filter(it => it.str && it.str.trim().length > 0)
      .map(it => ({
        str: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5]
      }));

    cleanItems.sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of cleanItems) {
      if (currentY === null || Math.abs(item.y - currentY) <= 3.8) {
        currentLine.push(item);
        if (currentY === null) currentY = item.y;
      } else {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
    }

    return lines.map(lineItems => ({
      text: lineItems.map(it => it.str).join(' ').trim(),
      items: lineItems
    }));
  }

  async function parsePDFFile(file, password = '') {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF parsing library (pdf.js) is not loaded. Please check your internet connection.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const docInit = { data: typedArray };
          if (password) docInit.password = password;

          let pdf;
          try {
            pdf = await pdfjsLib.getDocument(docInit).promise;
          } catch (pdfErr) {
            if (pdfErr.name === 'PasswordException' || /password/i.test(pdfErr.message || '')) {
              const err = new Error('This PDF is password-protected. Please enter your statement password (e.g., DOB or PAN).');
              err.isPasswordProtected = true;
              throw err;
            }
            throw pdfErr;
          }

          const page1 = await pdf.getPage(1);
          const content1 = await page1.getTextContent();
          const page1Text = content1.items.map(it => it.str).join(' ');
          const bank = detectBank(page1Text, file.name);

          // Date regex at line start: DD/MM/YYYY, DD-MM-YYYY, DD Mon YYYY, YYYY-MM-DD
          const DATE_START_RE = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-/.][A-Za-z]{3,9}[\s\-/.](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/;

          const transactions = [];
          let currentTx = null;
          let prevBalance = null;

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const lines = extractVisualLinesFromPDFPage(content);

            for (const lineObj of lines) {
              const line = lineObj.text;
              if (isFooterRow([line])) continue;

              const dateMatch = line.match(DATE_START_RE);
              if (dateMatch) {
                if (currentTx && currentTx.amount > 0) {
                  transactions.push(finalizePdfTx(currentTx));
                  currentTx = null;
                }

                const rawDate = dateMatch[1];
                const rest = line.substring(dateMatch[0].length).trim();

                // Extract all strict decimal amounts (avoids reference numbers like 428935!)
                const amountsFound = [];
                let m;
                const amtRe = new RegExp(AMOUNT_STRICT_RE.source, 'g');
                while ((m = amtRe.exec(rest)) !== null) {
                  amountsFound.push({
                    raw: m[0],
                    num: parseAmount(m[1]),
                    indicator: m[2] ? m[2].toUpperCase() : null
                  });
                }

                if (amountsFound.length === 0) continue;

                let txAmount = 0;
                let balance = null;
                let rawDesc = rest;

                // Strip amount strings from description
                amountsFound.forEach(a => {
                  rawDesc = rawDesc.replace(a.raw, ' ');
                });
                rawDesc = rawDesc.replace(/\s{2,}/g, ' ').trim();

                let amountIndicator = null;

                if (amountsFound.length >= 2) {
                  // Standard Indian statement line: 1st is tx amount, last is balance
                  txAmount = amountsFound[0].num;
                  amountIndicator = amountsFound[0].indicator;
                  balance = amountsFound[amountsFound.length - 1].num;
                } else {
                  txAmount = amountsFound[0].num;
                  amountIndicator = amountsFound[0].indicator;
                }

                if (txAmount <= 0) continue;

                // Multi-signal Credit vs Debit classification
                const txType = resolveTransactionType({
                  amountStr: amountIndicator || (amountsFound[0] ? amountsFound[0].raw : ''),
                  description: rawDesc,
                  balance,
                  prevBalance
                });

                if (balance !== null && balance > 0) {
                  prevBalance = balance;
                }

                currentTx = {
                  date: normalizeDate(rawDate),
                  rawDesc,
                  amount: txAmount,
                  type: txType,
                  _original: line
                };

              } else if (currentTx) {
                // Continuation line (narration wrapping across lines)
                if (!/(date|particulars|narration|balance|closing|opening|statement|page)/i.test(line)) {
                  currentTx.rawDesc += ' ' + line;
                }
              }
            }
          }

          if (currentTx && currentTx.amount > 0) {
            transactions.push(finalizePdfTx(currentTx));
          }

          transactions.bank = bank;
          resolve(transactions);

        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read PDF file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function finalizePdfTx(tx) {
    const description = cleanDescription(tx.rawDesc);
    const category = inferCategory(description, tx.type);
    return {
      date: tx.date,
      description,
      amount: tx.amount,
      type: tx.type,
      category,
      _original: tx._original
    };
  }

  // ─── Main Parse Dispatcher ───

  async function parseStatement(file, password = '') {
    const name = (file.name || '').toLowerCase();
    const ext = name.split('.').pop();

    if (ext === 'csv' || ext === 'txt') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const rows = parseCSVText(e.target.result, file.name);
            resolve(rows);
          } catch (err) {
            reject(new Error('Failed to parse CSV: ' + err.message));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
      });
    }

    if (ext === 'xlsx' || ext === 'xls') {
      return parseExcelFile(file, password);
    }

    if (ext === 'pdf') {
      return parsePDFFile(file, password);
    }

    throw new Error(`Unsupported file format: .${ext}. Please upload a CSV, Excel (.xlsx/.xls), or PDF bank statement.`);
  }

  // ─── Export ───

  window.StatementParser = {
    parseStatement,
    detectBank,
    normalizeDate,
    parseAmount,
    cleanDescription,
    inferCategory,
    resolveTransactionType,
    CATEGORY_RULES,
    BANK_PROFILES
  };

})();
