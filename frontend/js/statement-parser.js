/**
 * VaultWealth — Bank Statement Parser Engine
 * Handles CSV, Excel (.xlsx), and PDF bank statement parsing.
 * 
 * Robust against real Indian bank statements that start with
 * 10-30 rows of bank metadata (name, branch, balance, IFSC, etc.)
 * before the actual transaction header row appears.
 * 
 * Dependencies (loaded via CDN):
 * - SheetJS (xlsx) for Excel files
 * - pdf.js for PDF files
 * 
 * Exports: window.StatementParser
 */

(function () {
  'use strict';

  // ─── Category inference keywords ───
  const CATEGORY_KEYWORDS = {
    expense: {
      'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'dominos', 'pizza', 'mcdonalds', 'kfc', 'burger', 'dining', 'canteen', 'cafeteria', 'lunch', 'dinner', 'breakfast', 'eat', 'bakery', 'chai', 'tea', 'coffee', 'starbucks', 'dosa', 'biryani', 'kitchen', 'mess', 'blinkit'],
      'Transport': ['uber', 'ola', 'rapido', 'fuel', 'petrol', 'diesel', 'metro', 'bus', 'cab', 'auto', 'parking', 'toll', 'railway', 'irctc', 'train', 'namma'],
      'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'mall', 'store', 'retail', 'meesho', 'nykaa', 'fashion'],
      'Bills & Utilities': ['electricity', 'electric', 'water', 'gas', 'bill', 'utility', 'broadband', 'wifi', 'internet', 'recharge', 'airtel', 'jio', 'vodafone', 'bsnl', 'mobile', 'phone', 'amc', 'penalty', 'charge', 'fee'],
      'Entertainment': ['netflix', 'prime', 'hotstar', 'spotify', 'movie', 'cinema', 'theatre', 'game', 'play', 'pvr', 'inox', 'disney'],
      'Education': ['book', 'course', 'udemy', 'coursera', 'tuition', 'school', 'college', 'university', 'fee', 'exam', 'library'],
      'Healthcare': ['hospital', 'doctor', 'medical', 'pharmacy', 'medicine', 'health', 'clinic', 'apollo', 'lab', 'test', 'dental', 'eye'],
      'Travel': ['hotel', 'flight', 'booking', 'goibibo', 'makemytrip', 'airbnb', 'oyo', 'travel', 'trip', 'vacation', 'holiday'],
      'Subscriptions': ['subscription', 'premium', 'plan', 'membership', 'renewal', 'annual', 'monthly'],
    },
    income: {
      'Salary / Stipend': ['salary', 'stipend', 'payroll', 'wages', 'compensation'],
      'Freelance / Projects': ['freelance', 'project', 'invoice', 'consulting', 'contract', 'commission'],
      'Allowance / Pocket Money': ['allowance', 'pocket', 'transfer from', 'received from'],
      'Investments / Returns': ['dividend', 'interest', 'return', 'mutual fund', 'investment', 'maturity', 'fd', 'rd'],
    }
  };

  /**
   * Infer transaction category from description text
   */
  function inferCategory(description, type) {
    const desc = (description || '').toLowerCase();
    const map = CATEGORY_KEYWORDS[type] || {};
    for (const [category, keywords] of Object.entries(map)) {
      if (keywords.some(kw => desc.includes(kw))) {
        return category;
      }
    }
    return type === 'income' ? 'Other Income' : 'Other';
  }

  /**
   * Normalize a date string into YYYY-MM-DD format.
   * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, Excel Date objects, and serial numbers.
   */
  function normalizeDate(raw) {
    if (!raw) return new Date().toISOString().split('T')[0];

    // Handle JavaScript Date objects (from SheetJS cellDates)
    if (raw instanceof Date) {
      if (!isNaN(raw.getTime())) {
        return raw.toISOString().split('T')[0];
      }
      return new Date().toISOString().split('T')[0];
    }

    const str = String(raw).trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Indian bank standard)
    const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10);
      // If first number > 12, it must be a day (DD/MM/YYYY)
      // If second number > 12, first is month (MM/DD/YYYY)
      // Default assumption for Indian statements: DD/MM/YYYY
      if (month <= 12) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      } else {
        // month > 12 means format is MM/DD/YYYY
        return `${dmy[3]}-${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}`;
      }
    }

    // DD/MM/YY short year
    const dmyShort = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
    if (dmyShort) {
      const year = parseInt(dmyShort[3], 10);
      const fullYear = year >= 50 ? 1900 + year : 2000 + year;
      return `${fullYear}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1].padStart(2, '0')}`;
    }

    // Try native Date parse (handles "Oct 3, 2026" etc.)
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }

    // Excel serial date number
    const num = parseFloat(str);
    if (!isNaN(num) && num > 25569 && num < 60000) {
      const excelDate = new Date((num - 25569) * 86400000);
      return excelDate.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  /**
   * Parse a currency string into a number
   */
  function parseAmount(raw) {
    if (typeof raw === 'number') return Math.abs(raw);
    const str = String(raw || '0')
      .replace(/[₹$€£,\s]/g, '')
      .replace(/\(([0-9.]+)\)/, '-$1') // (500) -> -500
      .replace(/CR$/i, '')
      .replace(/DR$/i, '')
      .trim();
    return Math.abs(parseFloat(str) || 0);
  }

  // ─── Column Detection ───
  // Expanded alias lists to cover all major Indian bank statement formats:
  // SBI, HDFC, ICICI, Axis, Kotak, PNB, BoB, etc.

  const DATE_ALIASES = [
    'date', 'txn date', 'transaction date', 'value date', 'posting date',
    'txn_date', 'trans date', 'trans_date', 'tran date', 'entry date'
  ];
  const DESC_ALIASES = [
    'description', 'narration', 'particulars', 'details', 'remarks',
    'transaction description', 'memo', 'note', 'transaction details',
    'transaction particulars', 'payment details'
  ];
  const AMOUNT_ALIASES = [
    'amount', 'txn amount', 'transaction amount', 'value', 'total'
  ];
  const DEBIT_ALIASES = [
    'debit', 'withdrawal', 'withdrawals', 'dr', 'debit amount',
    'debit_amount', 'debit(rs)', 'debit (rs)', 'debit(inr)', 'dr amount'
  ];
  const CREDIT_ALIASES = [
    'credit', 'deposit', 'deposits', 'cr', 'credit amount',
    'credit_amount', 'credit(rs)', 'credit (rs)', 'credit(inr)', 'cr amount'
  ];
  // Columns to explicitly SKIP during detection (so they don't accidentally match)
  const SKIP_ALIASES = [
    'ref no', 'cheque no', 'chq no', 'reference', 'balance', 'closing balance',
    'running balance', 'ref no/cheque no', 'chq/ref no', 'branch', 'init'
  ];

  function matchColumn(header, aliases) {
    const h = (header || '').toLowerCase().trim();
    if (!h) return false;
    return aliases.some(a => h === a || h.includes(a));
  }

  function shouldSkipColumn(header) {
    const h = (header || '').toLowerCase().trim();
    if (!h) return false;
    return SKIP_ALIASES.some(a => h === a || h.includes(a));
  }

  function detectColumns(headers) {
    const mapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1 };

    headers.forEach((h, i) => {
      // Skip columns we know are not transaction-relevant (balance, ref no, etc.)
      if (shouldSkipColumn(h)) return;

      if (mapping.date < 0 && matchColumn(h, DATE_ALIASES)) mapping.date = i;
      else if (mapping.description < 0 && matchColumn(h, DESC_ALIASES)) mapping.description = i;
      else if (mapping.amount < 0 && matchColumn(h, AMOUNT_ALIASES)) mapping.amount = i;
      else if (mapping.debit < 0 && matchColumn(h, DEBIT_ALIASES)) mapping.debit = i;
      else if (mapping.credit < 0 && matchColumn(h, CREDIT_ALIASES)) mapping.credit = i;
    });

    return mapping;
  }

  /**
   * Scores how well a row matches known header patterns.
   * Returns the count of recognized column types (0-5).
   */
  function scoreHeaderRow(cells) {
    const mapping = detectColumns(cells);
    return Object.values(mapping).filter(v => v >= 0).length;
  }

  // ─── Description Cleaning ───

  /**
   * Clean up messy bank statement descriptions.
   * Strips literal \n, extra whitespace, UPI noise, branch info, etc.
   */
  function cleanDescription(raw) {
    let desc = String(raw || '').trim();

    // Replace literal \n and \t with spaces
    desc = desc.replace(/\\n/g, ' ').replace(/\\t/g, ' ');
    // Replace actual newlines/tabs
    desc = desc.replace(/[\n\r\t]/g, ' ');
    // Collapse multiple spaces
    desc = desc.replace(/\s{2,}/g, ' ');

    // Remove common SBI branch suffix patterns:
    // "0097732162091 AT 20280 VICTORIA ROAD BRANCH"
    desc = desc.replace(/\s+\d{10,}\s+AT\s+\d+\s+[A-Z\s]+BRANCH$/i, '');

    // Clean up UPI prefixes: "UPI/CR/...", "UPI/DR/..."
    // Extract useful parts from UPI descriptions
    const upiMatch = desc.match(/UPI\/(CR|DR)\/\d+\/([^/]+)\//i);
    if (upiMatch) {
      const upiName = upiMatch[2].trim();
      // Also try to get the app/method from the rest
      const appMatch = desc.match(/UPI\/(CR|DR)\/\d+\/[^/]+\/([A-Z]+)\//i);
      const app = appMatch ? appMatch[2] : '';

      // Build a cleaner description
      const prefix = desc.match(/^(.*?)\s*UPI\//i);
      const prefixText = prefix ? prefix[1].trim() : '';

      // Common SBI prefixes
      let cleanPrefix = prefixText
        .replace(/DEP\s*TFR/i, 'UPI Received')
        .replace(/WDL\s*TFR/i, 'UPI Paid')
        .replace(/ATM\s*PEN\s*DING/i, 'ATM Pending')
        .replace(/NEFT/i, 'NEFT')
        .replace(/IMPS/i, 'IMPS')
        .trim();

      if (!cleanPrefix) {
        cleanPrefix = upiMatch[1].toUpperCase() === 'CR' ? 'UPI Received' : 'UPI Paid';
      }

      desc = `${cleanPrefix} - ${upiName}${app ? ' (' + app + ')' : ''}`;
    } else {
      // Non-UPI: just clean prefixes
      desc = desc
        .replace(/DEP\s*TFR\s*/i, 'Transfer In - ')
        .replace(/WDL\s*TFR\s*/i, 'Transfer Out - ')
        .replace(/ATM\s*PEN\s*DING\s*/i, 'ATM Pending ')
        .replace(/NEFT\s*CR\s*/i, 'NEFT Credit - ')
        .replace(/NEFT\s*DR\s*/i, 'NEFT Debit - ')
        .replace(/IMPS\s*CR\s*/i, 'IMPS Credit - ')
        .replace(/IMPS\s*DR\s*/i, 'IMPS Debit - ');
    }

    // Final cleanup
    desc = desc.replace(/\s{2,}/g, ' ').replace(/^[\s\-|]+/, '').replace(/[\s\-|]+$/, '').trim();
    if (desc.length < 2) desc = 'Bank transaction';

    return desc;
  }

  // ─── Row Parsing ───

  /**
   * Check if a row looks like a footer/summary row rather than a transaction.
   */
  function isFooterRow(cells) {
    const joined = cells.join(' ').toLowerCase();
    const footerPatterns = [
      'statement summary', 'brought forward', 'closing balance',
      'opening balance', 'total debit', 'total credit', 'dr count', 'cr count',
      'please do not share', 'computer generated', 'does not require',
      'power of attorney', 'page no', 'generated on', 'end of statement'
    ];
    return footerPatterns.some(p => joined.includes(p));
  }

  function parseRow(cells, mapping) {
    // Skip footer/summary rows
    if (isFooterRow(cells)) return null;

    const dateRaw = mapping.date >= 0 ? cells[mapping.date] : '';
    const descRaw = mapping.description >= 0 ? cells[mapping.description] : '';

    // Skip rows with no valid date
    const dateStr = String(dateRaw || '').trim();
    if (!dateStr) return null;

    // Quick validation: a date cell should have at least a digit
    if (!/\d/.test(dateStr)) return null;

    let amount = 0;
    let type = 'expense';

    if (mapping.debit >= 0 && mapping.credit >= 0) {
      // Separate debit/credit columns (most Indian bank statements)
      const debitRaw = cells[mapping.debit];
      const creditRaw = cells[mapping.credit];
      const debitVal = parseAmount(debitRaw);
      const creditVal = parseAmount(creditRaw);

      if (creditVal > 0 && debitVal === 0) {
        amount = creditVal;
        type = 'income';
      } else if (debitVal > 0) {
        amount = debitVal;
        type = 'expense';
      } else {
        // Both are 0 or empty — skip this row
        return null;
      }
    } else if (mapping.amount >= 0) {
      const rawAmt = cells[mapping.amount];
      const val = parseAmount(rawAmt);
      const rawStr = String(rawAmt || '');
      if (rawStr.includes('-') || rawStr.includes('(')) {
        type = 'expense';
      } else if (val > 0) {
        type = 'income';
      }
      amount = val;
    }

    if (amount === 0) return null;

    const description = cleanDescription(descRaw);
    const date = normalizeDate(dateRaw);
    const category = inferCategory(description, type);

    return {
      date,
      description,
      amount,
      type,
      category,
      _original: cells.join(' | ')
    };
  }

  // ─── CSV Parser ───

  function parseCSVText(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Simple CSV split respecting quoted fields
    function splitCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    }

    // Find header row: scan up to 50 rows for the best header match
    // Real bank statements can have 15-30 rows of metadata before headers
    let headerIdx = 0;
    let headers = [];
    let mapping = null;
    let bestScore = 0;

    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const cells = splitCSVLine(lines[i]);
      const score = scoreHeaderRow(cells.map(c => String(c)));
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
        headers = cells;
        mapping = detectColumns(cells.map(c => String(c)));
      }
      // If we found a row with 3+ matches, it's almost certainly the header
      if (score >= 3) break;
    }

    if (!mapping || bestScore < 2) {
      // Fallback: assume first row is headers
      headers = splitCSVLine(lines[0]);
      mapping = detectColumns(headers);
    }

    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i]);
      if (cells.length < 2) continue;
      if (cells.filter(c => c.trim()).length < 2) continue;
      const parsed = parseRow(cells, mapping);
      if (parsed) rows.push(parsed);
    }

    return rows;
  }

  // ─── Excel Parser (via SheetJS) ───

  async function parseExcelFile(file) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel parsing library (SheetJS) is not loaded. Please check your internet connection.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

          if (jsonRows.length < 2) {
            resolve([]);
            return;
          }

          // Find header row: scan up to 50 rows
          // Real Indian bank statements (SBI, HDFC, etc.) often have
          // 15-30 rows of bank info, account details, and metadata
          let headerIdx = -1;
          let mapping = null;
          let bestScore = 0;

          for (let i = 0; i < Math.min(jsonRows.length, 50); i++) {
            const cells = jsonRows[i].map(c => String(c || '').trim());
            // Skip rows that are mostly empty
            const nonEmpty = cells.filter(c => c.length > 0).length;
            if (nonEmpty < 2) continue;

            const score = scoreHeaderRow(cells);
            if (score > bestScore) {
              bestScore = score;
              headerIdx = i;
              mapping = detectColumns(cells);
            }
            // 3+ recognized columns is a confident header match
            if (score >= 3) break;
          }

          if (headerIdx < 0 || !mapping || bestScore < 2) {
            // Fallback: try first row
            mapping = detectColumns(jsonRows[0].map(c => String(c || '')));
            headerIdx = 0;
          }

          console.log('[StatementParser] Header found at row', headerIdx + 1,
            'with', bestScore, 'column matches:', mapping);

          const rows = [];
          for (let i = headerIdx + 1; i < jsonRows.length; i++) {
            const cells = jsonRows[i].map(c => {
              if (c instanceof Date) return c.toISOString().split('T')[0];
              if (c === null || c === undefined) return '';
              return String(c);
            });
            // Skip mostly-empty rows
            if (cells.filter(c => c.trim()).length < 2) continue;
            const parsed = parseRow(cells, mapping);
            if (parsed) rows.push(parsed);
          }

          console.log('[StatementParser] Parsed', rows.length, 'transactions from Excel');
          resolve(rows);
        } catch (err) {
          reject(new Error('Failed to parse Excel file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ─── PDF Parser (via pdf.js) ───

  async function parsePDFFile(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF parsing library (pdf.js) is not loaded. Please check your internet connection.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = '';

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
          }

          // Try to extract tabular data from text
          const lines = fullText.split(/\n/).filter(l => l.trim());
          const transactions = [];

          // Look for date patterns to identify transaction lines
          const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
          const amountPattern = /[\d,]+\.\d{2}/g;

          for (const line of lines) {
            // Skip footer/disclaimer lines
            if (isFooterRow([line])) continue;

            const dateMatch = line.match(datePattern);
            if (!dateMatch) continue;

            const amounts = line.match(amountPattern);
            if (!amounts || amounts.length === 0) continue;

            const date = normalizeDate(dateMatch[1]);
            // Extract description: text between date and amounts
            let description = line
              .replace(datePattern, '')
              .replace(amountPattern, '')
              .replace(/[₹$€£]/g, '')
              .replace(/\s+/g, ' ')
              .trim();

            description = cleanDescription(description);

            // Use last amount as transaction amount
            const amountStr = amounts[amounts.length - 1];
            const amount = parseAmount(amountStr);

            if (amount === 0) continue;

            // Try to determine type from context
            let type = 'expense';
            const lineLC = line.toLowerCase();
            if (lineLC.includes(' cr') || lineLC.includes('credit') || lineLC.includes('deposit') || lineLC.includes('received') || lineLC.includes('dep tfr')) {
              type = 'income';
            }
            if (lineLC.includes(' dr') || lineLC.includes('debit') || lineLC.includes('withdrawal') || lineLC.includes('wdl tfr')) {
              type = 'expense';
            }
            // If there are two amounts, first is debit second is credit, or vice versa
            if (amounts.length >= 2) {
              const firstAmt = parseAmount(amounts[0]);
              const lastAmt = parseAmount(amounts[amounts.length - 1]);
              if (lastAmt > firstAmt) {
                type = 'income';
              }
            }

            const category = inferCategory(description, type);

            transactions.push({
              date,
              description,
              amount,
              type,
              category,
              _original: line.substring(0, 120)
            });
          }

          resolve(transactions);
        } catch (err) {
          reject(new Error('Failed to parse PDF: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ─── Main parse dispatcher ───

  async function parseStatement(file) {
    const name = file.name.toLowerCase();
    const ext = name.split('.').pop();

    if (ext === 'csv' || ext === 'txt') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const rows = parseCSVText(e.target.result);
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
      return parseExcelFile(file);
    }

    if (ext === 'pdf') {
      return parsePDFFile(file);
    }

    throw new Error(`Unsupported file format: .${ext}. Please upload a CSV, Excel (.xlsx), or PDF file.`);
  }

  // ─── Export ───
  window.StatementParser = {
    parseStatement,
    inferCategory,
    normalizeDate,
    parseAmount,
    cleanDescription,
    CATEGORY_KEYWORDS
  };

})();

