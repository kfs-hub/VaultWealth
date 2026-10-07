/**
 * VaultWealth — Vault Assistant chat widget
 *
 * Floating launcher + panel that talks to POST /api/chat with the user's
 * Supabase access token. Renders safe Markdown, shows confirm cards for
 * AI-drafted transactions (saved client-side through RLS only after the
 * user presses Confirm), and keeps history in sessionStorage per tab.
 *
 * Depends on globals from supabase.js (getSupabaseClient, getCurrentUser).
 */
(function () {
  'use strict';
  if (window.__vwChatLoaded) return;
  window.__vwChatLoaded = true;

  const STORAGE_KEY = 'vw_chat_history_v1';
  const MAX_STORED = 40;
  const MAX_SENT = 12;
  const MAX_CHARS = 1500;

  const SUGGESTIONS = [
    'How am I doing this month?',
    'Build me a monthly budget',
    'Help me save ₹10,000 in 4 months',
    'Where can I cut back?',
    'Add ₹250 for lunch today',
    'How do I upload a bank statement?'
  ];

  const ICONS = {
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  // ── State ────────────────────────────────────────────────────────────────
  /** @type {{role:'user'|'assistant'|'card', text?:string, error?:boolean, draft?:object, status?:string}[]} */
  let messages = loadHistory();
  let busy = false;
  let els = {};

  function loadHistory() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function saveHistory() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED))); } catch { /* quota */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const isPhone = () => window.matchMedia('(max-width: 600px)').matches;
  const pad = n => String(n).padStart(2, '0');
  function localDate() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function inr(n) {
    const v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function prettyDate(iso) {
    try {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  /** Minimal, XSS-safe Markdown: escapes first, then adds a whitelisted subset. */
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  }
  function renderMarkdown(src) {
    const lines = esc(src).split(/\r?\n/);
    const isRow = l => /^\s*\|.*\|\s*$/.test(l);
    const isSep = l => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
    const isBullet = l => /^\s*[-*•]\s+/.test(l);
    const isNum = l => /^\s*\d+[.)]\s+/.test(l);
    const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => inline(c.trim()));
    let html = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) { i++; continue; }
      if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        let body = '';
        while (i < lines.length && isRow(lines[i])) { body += `<tr>${cells(lines[i]).map(c => `<td>${c}</td>`).join('')}</tr>`; i++; }
        html += `<div class="vw-table-wrap"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
        continue;
      }
      const h = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (h) { html += `<h4>${inline(h[1])}</h4>`; i++; continue; }
      if (isBullet(line) || isNum(line)) {
        const ordered = isNum(line);
        const test = ordered ? isNum : isBullet;
        const strip = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/;
        let items = '';
        while (i < lines.length && test(lines[i])) { items += `<li>${inline(lines[i].replace(strip, ''))}</li>`; i++; }
        html += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNum(lines[i]) && !/^\s*#{1,6}\s/.test(lines[i]) && !isRow(lines[i])) {
        para.push(inline(lines[i])); i++;
      }
      if (!para.length) { para.push(inline(line)); i++; }
      html += `<p>${para.join('<br>')}</p>`;
    }
    return html;
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  function build() {
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'vw-chat-launcher';
    launcher.id = 'vwChatLauncher';
    launcher.setAttribute('aria-label', 'Open Vault assistant');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'vwChatPanel');
    launcher.innerHTML = ICONS.spark;

    const panel = document.createElement('section');
    panel.className = 'vw-chat-panel';
    panel.id = 'vwChatPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vault assistant');
    panel.innerHTML = `
      <header class="vw-chat-header">
        <div class="vw-chat-avatar">${ICONS.spark}</div>
        <div class="vw-chat-title"><strong>Vault</strong><span>Your money assistant</span></div>
        <button type="button" class="vw-chat-icon-btn" id="vwChatReset" title="New chat" aria-label="Start a new chat">${ICONS.reset}</button>
        <button type="button" class="vw-chat-icon-btn" id="vwChatClose" title="Close" aria-label="Close assistant">${ICONS.close}</button>
      </header>
      <div class="vw-chat-messages" id="vwChatMessages" aria-live="polite"></div>
      <div class="vw-chat-suggestions" id="vwChatSuggestions"></div>
      <form class="vw-chat-form" id="vwChatForm" autocomplete="off">
        <textarea class="vw-chat-input" id="vwChatInput" rows="1" maxlength="${MAX_CHARS}"
          placeholder="Ask about your spending, budget, savings…" aria-label="Message Vault"></textarea>
        <button type="submit" class="vw-chat-send" id="vwChatSend" aria-label="Send message" disabled>${ICONS.send}</button>
      </form>
      <div class="vw-chat-foot">AI can make mistakes · General guidance, not financial advice</div>`;

    document.body.append(launcher, panel);
    els = {
      launcher, panel,
      list: panel.querySelector('#vwChatMessages'),
      suggestions: panel.querySelector('#vwChatSuggestions'),
      form: panel.querySelector('#vwChatForm'),
      input: panel.querySelector('#vwChatInput'),
      send: panel.querySelector('#vwChatSend')
    };

    launcher.addEventListener('click', () => toggle(true));
    panel.querySelector('#vwChatClose').addEventListener('click', () => toggle(false));
    panel.querySelector('#vwChatReset').addEventListener('click', resetChat);
    els.form.addEventListener('submit', e => { e.preventDefault(); submit(els.input.value); });
    els.input.addEventListener('input', onInput);
    els.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isPhone()) { e.preventDefault(); submit(els.input.value); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('is-open')) toggle(false); });

    render();
  }

  function toggle(open) {
    els.panel.classList.toggle('is-open', open);
    els.launcher.classList.toggle('is-hidden', open && isPhone());
    els.launcher.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('vw-chat-lock', open && isPhone());
    if (open) {
      scrollToEnd(false);
      if (!isPhone()) setTimeout(() => els.input.focus(), 120);
    } else {
      els.launcher.classList.remove('is-hidden');
      els.launcher.focus({ preventScroll: true });
    }
  }

  function onInput() {
    const el = els.input;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    els.send.disabled = busy || !el.value.trim();
  }

  function resetChat() {
    if (busy) return;
    messages = [];
    saveHistory();
    render();
    if (!isPhone()) els.input.focus();
  }

  function scrollToEnd(smooth = true) {
    requestAnimationFrame(() => {
      els.list.scrollTo({ top: els.list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function render() {
    els.list.innerHTML = '';
    if (!messages.length) {
      els.list.innerHTML = `
        <div class="vw-welcome">
          <div class="vw-chat-avatar">${ICONS.spark}</div>
          <h3>Hi, I'm Vault</h3>
          <p>Ask me anything about your money. I can analyse your spending, build a budget, plan savings goals and log transactions for you.</p>
        </div>`;
    }
    messages.forEach((m, idx) => els.list.appendChild(renderMessage(m, idx)));
    renderSuggestions();
    scrollToEnd(false);
  }

  function renderSuggestions() {
    const show = !messages.length && !busy;
    els.suggestions.hidden = !show;
    els.suggestions.classList.toggle('is-grid', show);
    els.suggestions.innerHTML = show
      ? SUGGESTIONS.map(s => `<button type="button" class="vw-chip">${esc(s)}</button>`).join('')
      : '';
    els.suggestions.querySelectorAll('.vw-chip').forEach(btn => btn.addEventListener('click', () => submit(btn.textContent)));
  }

  function renderMessage(m, idx) {
    const el = m.role === 'card' ? renderConfirmCard(m, idx) : renderBubble(m);
    el.dataset.idx = String(idx);
    return el;
  }

  function renderBubble(m) {
    const div = document.createElement('div');
    if (m.role === 'user') {
      div.className = 'vw-msg vw-msg--user';
      div.textContent = m.text;
    } else {
      div.className = 'vw-msg vw-msg--bot' + (m.error ? ' vw-msg--error' : '');
      div.innerHTML = m.error ? esc(m.text) : renderMarkdown(m.text);
    }
    return div;
  }

  function renderConfirmCard(m, idx) {
    const d = m.draft;
    const card = document.createElement('div');
    card.className = 'vw-confirm';
    const status = {
      saved: `<div class="vw-confirm-status is-ok">${ICONS.check} Saved to your transactions</div>`,
      cancelled: '<div class="vw-confirm-status is-cancel">Cancelled, nothing was saved</div>',
      error: `<div class="vw-confirm-status is-err">${esc(m.errorText || 'Could not save. Please try again.')}</div>`
    }[m.status] || '';
    const pending = !m.status || m.status === 'error';
    card.innerHTML = `
      <div class="vw-confirm-head">
        <span class="vw-confirm-label">${d.type === 'income' ? 'New income' : 'New expense'}</span>
        <span class="vw-confirm-amount ${d.type === 'income' ? 'is-income' : 'is-expense'}">${d.type === 'income' ? '+' : '−'}${esc(inr(d.amount))}</span>
      </div>
      <dl class="vw-confirm-grid">
        <dt>Category</dt><dd>${esc(d.category)}</dd>
        <dt>Date</dt><dd>${esc(prettyDate(d.date))}</dd>
        ${d.description ? `<dt>Note</dt><dd>${esc(d.description)}</dd>` : ''}
      </dl>
      ${status}
      ${pending ? `<div class="vw-confirm-actions" style="${m.status ? 'margin-top:10px' : ''}">
        <button type="button" class="vw-btn" data-act="cancel">Cancel</button>
        <button type="button" class="vw-btn vw-btn--primary" data-act="confirm">Confirm</button>
      </div>` : ''}`;
    card.querySelector('[data-act="confirm"]')?.addEventListener('click', e => confirmDraft(idx, e.currentTarget));
    card.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      messages[idx].status = 'cancelled';
      saveHistory();
      card.replaceWith(renderMessage(messages[idx], idx));
    });
    return card;
  }

  function showTyping() {
    const t = document.createElement('div');
    t.className = 'vw-msg vw-msg--bot vw-typing';
    t.id = 'vwTyping';
    t.setAttribute('aria-label', 'Vault is typing');
    t.innerHTML = '<i></i><i></i><i></i>';
    els.list.appendChild(t);
    scrollToEnd();
  }
  const hideTyping = () => document.getElementById('vwTyping')?.remove();

  // ── Networking ───────────────────────────────────────────────────────────
  async function getToken() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || null;
  }

  function setBusy(v) {
    busy = v;
    els.send.disabled = v || !els.input.value.trim();
    renderSuggestions();
  }

  function push(msg) {
    messages.push(msg);
    saveHistory();
    els.list.querySelector('.vw-welcome')?.remove();
    els.list.appendChild(renderMessage(msg, messages.length - 1));
    scrollToEnd();
  }

  async function submit(raw) {
    const text = String(raw || '').trim().slice(0, MAX_CHARS);
    if (!text || busy) return;
    els.input.value = '';
    onInput();
    push({ role: 'user', text });
    setBusy(true);
    showTyping();

    try {
      const token = await getToken();
      if (!token) throw Object.assign(new Error('Please sign in to chat with Vault.'), { friendly: true });

      const history = messages
        .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.error)
        .slice(-MAX_SENT)
        .map(m => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: history,
          clientDate: localDate(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          page: (location.pathname.replace(/^\/|\.html$/g, '') || 'home')
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { friendly: !!data.error });

      hideTyping();
      if (data.reply) push({ role: 'assistant', text: data.reply });
      (data.actions || []).forEach(a => {
        if (a.kind === 'confirm_transaction' && a.draft) push({ role: 'card', draft: a.draft });
      });
    } catch (err) {
      console.error('[Vault] chat error:', err);
      hideTyping();
      push({ role: 'assistant', error: true, text: err.friendly ? err.message : "I couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
      if (!isPhone()) els.input.focus();
    }
  }

  async function confirmDraft(idx, btn) {
    const m = messages[idx];
    if (!m || m.status === 'saved') return;
    const buttons = btn.parentElement.querySelectorAll('button');
    buttons.forEach(b => (b.disabled = true));
    btn.textContent = 'Saving…';

    try {
      const client = getSupabaseClient();
      const user = client && (await getCurrentUser());
      if (!user) throw new Error('Please sign in again to save.');
      const d = m.draft;
      const { error } = await client.from('transactions').insert([{
        user_id: user.id,
        type: d.type,
        amount: d.amount,
        category: d.category,
        transaction_date: d.date,
        description: d.description || ''
      }]);
      if (error) throw error;
      m.status = 'saved';
      window.dispatchEvent(new CustomEvent('vaultwealth:refresh'));
    } catch (err) {
      console.error('[Vault] save failed:', err);
      m.status = 'error';
      m.errorText = err.message || 'Could not save. Please try again.';
    }
    saveHistory();
    const card = els.list.querySelector(`[data-idx="${idx}"]`);
    if (card) card.replaceWith(renderMessage(m, idx));
    else render();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    if (typeof getSupabaseClient !== 'function') return; // only on app pages
    build();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
