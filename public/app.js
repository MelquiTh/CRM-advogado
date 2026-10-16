(() => {
'use strict';

// ====================== utilidades ======================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const o = { method: 'GET', credentials: 'same-origin', ...opts };
  if (o.json !== undefined) {
    if (o.method === 'GET') o.method = 'POST';
    o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) };
    o.body = JSON.stringify(o.json);
    delete o.json;
  }
  const r = await fetch(path, o);
  let data = null;
  try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) {
    if (r.status === 401 && S.me) { location.reload(); }
    const e = new Error(data?.error || 'Erro inesperado');
    e.status = r.status;
    throw e;
  }
  return data;
}

const I = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICON = {
  chat: I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  board: I('<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="15" rx="1.5"/>'),
  users: I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  phone: I('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: I('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  send: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  clip: I('<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  lock: I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  transfer: I('<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  x: I('<path d="M18 6L6 18M6 6l12 12"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  back: I('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  check: I('<path d="M20 6L9 17l-5-5"/>'),
  download: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>'),
  file: I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  eye: I('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
  edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  logo: I('<path d="M5 20l1.3-4.4A8.5 8.5 0 1 1 9.6 19z"/><path d="M9 9.5c.5 2.5 2.5 4.5 5 5l1.2-1.2-2-1-1 .8c-.8-.4-1.5-1.1-1.9-1.9l.8-1-1-2z"/>'),
};

const QUEUE = 'queue';
const PALETTE = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444', '#22c55e', '#6366f1'];

// ====================== estado ======================
const S = {
  me: null, users: [], maxAgents: 5,
  convs: new Map(), activeId: null, messages: [], hasMore: false, transfers: [],
  view: 'chats', status: 'open', owner: '', q: '', searchResults: null,
  wa: { status: 'disconnected' }, settings: null, stats: null, activity: [],
  drafts: {}, mode: 'reply', info: true, sending: false, mobileChat: false,
};
let socket = null;

const isAdmin = () => S.me?.role === 'admin';
const userById = (id) => S.users.find((u) => u.id === id);

// ====================== formatação ======================
const pad = (n) => String(n).padStart(2, '0');
const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function listTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  if (sameDay(d, n)) return hm(ts);
  if (sameDay(d, new Date(n - 864e5))) return 'Ontem';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
function dayLabel(ts) {
  const d = new Date(ts), n = new Date();
  if (sameDay(d, n)) return 'Hoje';
  if (sameDay(d, new Date(n - 864e5))) return 'Ontem';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const fullDate = (ts) => `${dayLabel(ts)} às ${hm(ts)}`;
function fmtPhone(p) {
  if (!p) return '';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(p);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${p}`;
}
const fmtSize = (b) => !b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const initials = (n) => {
  const s = String(n || '?').trim();
  if (/^[+\d]/.test(s)) return '#';
  return s.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
};
const hashColor = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  const hues = [160, 200, 260, 330, 25, 45, 190, 290];
  return `hsl(${hues[Math.abs(h) % hues.length]} 52% 44%)`;
};
const avatar = (name, color, size = 40) =>
  `<span class="av" style="--c:${esc(color)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials(name))}</span>`;
const contactAv = (c, size) => avatar(c.name, hashColor(c.phone || c.name), size);
const userAv = (u, size) => avatar(u.name, u.color, size);

function ownerChip(c) {
  if (!c.assigned_to) return `<span class="chip chip-queue">${ICON.inbox}Fila</span>`;
  const u = userById(c.assigned_to);
  return u ? `<span class="chip" style="--c:${esc(u.color)}"><i></i>${esc(u.name.split(' ')[0])}</span>` : '';
}

// ====================== toasts / modais / som ======================
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

function modal(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'modal-back';
  el.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(el);
  el.close = () => el.remove();
  el.addEventListener('mousedown', (e) => { if (e.target === el) el.close(); });
  $$('[data-close]', el).forEach((b) => b.addEventListener('click', el.close));
  return el;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { const m = $$('.modal-back').pop(); if (m) m.close(); }
});

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.36);
  } catch { /* sem áudio */ }
}

// ====================== login ======================
function renderSetup() {
  $('#app').innerHTML = `
  <div class="login">
    <aside class="login-brand">
      <div class="brand-mark">${ICON.logo}</div>
      <h1>ZapHub CRM</h1>
      <p>Configure o acesso da sua equipe e organize o atendimento do WhatsApp em um só lugar.</p>
      <ul>
        <li>${ICON.shield}<span>A primeira conta será a administradora</span></li>
        <li>${ICON.users}<span>Depois, adicione os e-mails da equipe na seção Equipe</span></li>
        <li>${ICON.lock}<span>Cada pessoa acessa com sua própria conta</span></li>
      </ul>
    </aside>
    <main class="login-form">
      <form id="setupForm" autocomplete="on">
        <h2>Criar conta do administrador</h2>
        <p class="sub">Esta será a primeira conta do CRM. Use-a para gerenciar quem terá acesso.</p>
        <label>Nome<input name="name" required maxlength="60" autocomplete="name" autofocus placeholder="Seu nome"></label>
        <label>E-mail<input name="email" type="email" required autocomplete="username" placeholder="voce@empresa.com"></label>
        <label>Senha<input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo de 6 caracteres"></label>
        <div class="form-error" id="setupErr" role="alert"></div>
        <button class="btn primary lg" type="submit">Criar conta e continuar</button>
      </form>
    </main>
  </div>`;
  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      await api('/api/setup', { json: { name: f.get('name'), email: f.get('email'), password: f.get('password') } });
      location.reload();
    } catch (err) {
      $('#setupErr').textContent = err.message;
      btn.disabled = false;
    }
  });
}

function renderLogin() {
  $('#app').innerHTML = `
  <div class="login">
    <aside class="login-brand">
      <div class="brand-mark">${ICON.logo}</div>
      <h1>ZapHub CRM</h1>
      <p>Um único número de WhatsApp, a equipe inteira atendendo — cada conversa com um responsável, sem perder nada pelo caminho.</p>
      <ul>
        <li>${ICON.transfer}<span>Arraste a conversa para passar a um colega</span></li>
        <li>${ICON.shield}<span>Histórico, mídias e notas sempre preservados</span></li>
        <li>${ICON.eye}<span>Administrador enxerga todas as conversas</span></li>
      </ul>
    </aside>
    <main class="login-form">
      <form id="loginForm" autocomplete="on">
        <h2>Entrar</h2>
        <p class="sub">Use o e-mail e a senha criados pelo administrador.</p>
        <label>E-mail<input name="email" type="email" required autocomplete="username" autofocus placeholder="voce@empresa.com"></label>
        <label>Senha<input name="password" type="password" required autocomplete="current-password" placeholder="••••••••"></label>
        <div class="form-error" id="loginErr" role="alert"></div>
        <button class="btn primary lg" type="submit">Entrar</button>
      </form>
    </main>
  </div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      await api('/api/login', { json: { email: f.get('email'), password: f.get('password') } });
      location.reload();
    } catch (err) {
      $('#loginErr').textContent = err.message;
      btn.disabled = false;
    }
  });
}

// ====================== shell ======================
function renderShell() {
  const nav = [
    ['chats', 'Conversas', ICON.chat],
    ...(isAdmin() ? [['board', 'Quadro', ICON.board], ['team', 'Equipe', ICON.users], ['whatsapp', 'WhatsApp', ICON.phone]] : []),
  ];
  $('#app').innerHTML = `
  <div class="shell">
    <nav class="rail">
      <div class="rail-logo" title="ZapHub CRM">${ICON.logo}</div>
      <div class="rail-nav">
        ${nav.map(([v, label, ic]) => `<button class="rail-btn" data-act="nav" data-v="${v}" title="${label}" aria-label="${label}">${ic}<span class="rail-lbl">${label}</span><b class="rail-dot" id="dot-${v}"></b></button>`).join('')}
      </div>
      <div class="rail-bottom">
        <button class="rail-btn" data-act="theme" title="Alternar tema" aria-label="Alternar tema" id="themeBtn"></button>
        <button class="rail-me" data-act="account" title="Minha conta">${userAv(S.me, 38)}</button>
      </div>
    </nav>
    <main id="main"></main>
  </div>
  <div id="dock" aria-hidden="true"></div>`;
  updateThemeIcon();
}

function updateThemeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const b = $('#themeBtn');
  if (b) b.innerHTML = dark ? ICON.sun : ICON.moon;
}

function setView(v) {
  S.view = v;
  $$('.rail-btn[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'chats') viewChats();
  else if (v === 'board') viewBoard();
  else if (v === 'team') viewTeam();
  else if (v === 'whatsapp') viewWhatsApp();
}

function updateBadges() {
  let unread = 0;
  for (const c of S.convs.values()) if (c.unread > 0 && (isAdmin() || c.assigned_to === S.me.id)) unread += 1;
  const dot = $('#dot-chats');
  if (dot) { dot.textContent = unread > 99 ? '99+' : unread; dot.classList.toggle('show', unread > 0); }
  const q = [...S.convs.values()].filter((c) => !c.assigned_to && c.status === 'open').length;
  const bd = $('#dot-board');
  if (bd) { bd.textContent = q; bd.classList.toggle('show', q > 0); }
  document.title = `${unread ? `(${unread}) ` : ''}ZapHub CRM`;
}

// ====================== conversas ======================
function viewChats() {
  $('#main').innerHTML = `
  <div class="chats ${S.mobileChat && S.activeId ? 'open-chat' : ''}" id="chats">
    <section class="list">
      <header class="list-h">
        <h2>Conversas</h2>
        <span class="wa-pill" id="waPill"></span>
      </header>
      <div class="search">${ICON.search}<input id="q" type="search" placeholder="Buscar nome, número ou mensagem" value="${esc(S.q)}"></div>
      <div class="tabs" id="tabs"></div>
      <div class="conv-list" id="convList"></div>
    </section>
    <section class="chat" id="chatPane"></section>
    <aside class="info ${S.info ? '' : 'hidden'}" id="infoPane"></aside>
  </div>`;
  renderTabs();
  renderConvList();
  renderWaPill();
  if (S.activeId && S.convs.has(S.activeId)) buildChat(); else renderEmptyChat();
  renderInfo();

  let timer;
  $('#q').addEventListener('input', (e) => {
    S.q = e.target.value.trim();
    clearTimeout(timer);
    timer = setTimeout(runSearch, 250);
  });
}

async function runSearch() {
  if (!S.q) { S.searchResults = null; renderConvList(); renderTabs(); return; }
  try {
    const r = await api(`/api/conversations?q=${encodeURIComponent(S.q)}`);
    S.searchResults = r.conversations;
    renderConvList(); renderTabs();
  } catch (e) { toast(e.message, 'error'); }
}

function sourceConvs() {
  const arr = S.searchResults ?? [...S.convs.values()];
  return arr.map((c) => S.convs.get(c.id) || c);
}

function renderTabs() {
  const el = $('#tabs');
  if (!el) return;
  const all = sourceConvs().filter((c) => !S.owner || (S.owner === QUEUE ? !c.assigned_to : String(c.assigned_to) === S.owner));
  const nOpen = all.filter((c) => c.status === 'open').length;
  const nRes = all.filter((c) => c.status === 'resolved').length;
  el.innerHTML = `
    <button class="tab ${S.status === 'open' ? 'on' : ''}" data-act="tab" data-s="open">Abertas <b>${nOpen}</b></button>
    <button class="tab ${S.status === 'resolved' ? 'on' : ''}" data-act="tab" data-s="resolved">Resolvidas <b>${nRes}</b></button>
    ${isAdmin() ? `<select id="ownerSel" title="Filtrar por responsável">
      <option value="">Todos</option>
      <option value="${QUEUE}" ${S.owner === QUEUE ? 'selected' : ''}>Fila de entrada</option>
      ${S.users.filter((u) => u.active).map((u) => `<option value="${u.id}" ${S.owner === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
    </select>` : ''}`;
  const sel = $('#ownerSel');
  if (sel) sel.addEventListener('change', () => { S.owner = sel.value; renderTabs(); renderConvList(); });
}

function renderConvList() {
  const el = $('#convList');
  if (!el) return;
  const list = sourceConvs()
    .filter((c) => c.status === S.status)
    .filter((c) => !S.owner || (S.owner === QUEUE ? !c.assigned_to : String(c.assigned_to) === S.owner))
    .sort((a, b) => (b.last_message_at || b.created_at) - (a.last_message_at || a.created_at));
  if (!list.length) {
    el.innerHTML = `<div class="empty-list">${ICON.inbox}<p>${S.q ? 'Nenhum resultado para a busca.' : S.status === 'open' ? 'Nenhuma conversa aberta.' : 'Nenhuma conversa resolvida.'}</p></div>`;
    return;
  }
  el.innerHTML = list.map((c) => `
    <article class="conv ${c.id === S.activeId ? 'on' : ''} ${c.unread > 0 ? 'unread' : ''}" draggable="true" data-drag="${c.id}" data-act="openConv" data-id="${c.id}">
      ${contactAv(c, 44)}
      <div class="conv-m">
        <div class="conv-r1"><b>${esc(c.name)}</b><time>${listTime(c.last_message_at)}</time></div>
        <div class="conv-r2"><span class="pv">${esc(c.last_preview || 'Sem mensagens')}</span>${c.unread > 0 ? `<span class="badge">${c.unread}</span>` : ''}</div>
        ${isAdmin() ? `<div class="conv-r3">${ownerChip(c)}</div>` : ''}
      </div>
    </article>`).join('');
}

function renderWaPill() {
  const el = $('#waPill');
  if (!el) return;
  const s = S.wa.status;
  const map = { connected: ['ok', 'WhatsApp conectado'], qr: ['warn', 'Aguardando QR'], connecting: ['warn', 'Conectando…'], disconnected: ['err', 'Desconectado'] };
  const [k, label] = map[s] || map.disconnected;
  el.className = `wa-pill ${k}`;
  el.innerHTML = `<i></i>${label}${S.wa.mode === 'demo' ? ' · demo' : ''}`;
}

function renderEmptyChat() {
  const el = $('#chatPane');
  if (!el) return;
  el.innerHTML = `<div class="chat-empty">
    <div class="ce-ic">${ICON.chat}</div>
    <h3>Selecione uma conversa</h3>
    <p>Para passar uma conversa a um colega, <b>arraste-a</b> da lista até o nome dele.</p>
  </div>`;
}

async function openConversation(id) {
  S.activeId = id;
  S.messages = []; S.hasMore = false; S.transfers = [];
  S.mobileChat = true;
  $('#chats')?.classList.add('open-chat');
  buildChat();
  renderConvList();
  try {
    const d = await api(`/api/conversations/${id}`);
    if (S.activeId !== id) return;
    S.convs.set(id, d.conversation);
    S.messages = d.messages; S.hasMore = d.hasMore; S.transfers = d.transfers;
    renderChatHead(); renderMsgs(true); renderInfo(); renderConvList(); updateBadges();
  } catch (e) {
    toast(e.message, 'error');
    closeActive();
  }
}

function closeActive() {
  S.activeId = null; S.mobileChat = false;
  $('#chats')?.classList.remove('open-chat');
  renderEmptyChat(); renderInfo(); renderConvList();
}

function buildChat() {
  const el = $('#chatPane');
  if (!el) return;
  el.innerHTML = `
    <header class="chat-h" id="chatHead"></header>
    <div class="msgs" id="msgs"></div>
    <footer class="composer">
      <div class="modes">
        <button data-act="mode" data-m="reply" class="${S.mode === 'reply' ? 'on' : ''}">Responder ao cliente</button>
        <button data-act="mode" data-m="note" class="${S.mode === 'note' ? 'on' : ''}">${ICON.lock}Nota interna</button>
      </div>
      <div class="box ${S.mode === 'note' ? 'is-note' : ''}" id="box">
        <button class="icon-btn" data-act="attach" title="Enviar arquivo" aria-label="Enviar arquivo" id="attachBtn">${ICON.clip}</button>
        <textarea id="msgInput" rows="1" placeholder="Digite uma mensagem…"></textarea>
        <button class="send" data-act="send" title="Enviar" aria-label="Enviar">${ICON.send}</button>
      </div>
      <input type="file" id="fileIn" hidden>
    </footer>`;
  renderChatHead();
  renderMsgs(true);
  const ta = $('#msgInput');
  ta.value = S.drafts[S.activeId] || '';
  applyModeUI();
  const auto = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'; };
  auto();
  ta.addEventListener('input', () => { S.drafts[S.activeId] = ta.value; auto(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
  $('#fileIn').addEventListener('change', onFilePicked);
  if (matchMedia('(min-width: 821px)').matches) ta.focus();
}

function applyModeUI() {
  const ta = $('#msgInput');
  if (!ta) return;
  ta.placeholder = S.mode === 'note' ? 'Nota interna — visível só para a equipe, não vai para o cliente' : 'Digite uma mensagem…';
  $('#box')?.classList.toggle('is-note', S.mode === 'note');
  $$('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === S.mode));
  const att = $('#attachBtn');
  if (att) att.disabled = S.mode === 'note';
}

function renderChatHead() {
  const el = $('#chatHead');
  const c = S.convs.get(S.activeId);
  if (!el || !c) return;
  const mine = c.assigned_to === S.me.id;
  const owner = c.assigned_to ? userById(c.assigned_to) : null;
  el.innerHTML = `
    <button class="icon-btn back" data-act="back" aria-label="Voltar">${ICON.back}</button>
    ${contactAv(c, 42)}
    <div class="chat-h-m">
      <b>${esc(c.name)}</b>
      <span>${esc(fmtPhone(c.phone))}${isAdmin() ? ` · ${ownerChip(c)}` : ''}</span>
    </div>
    <div class="chat-h-a">
      <button class="btn outline" data-act="transfer">${ICON.transfer}<span>Passar conversa</span></button>
      <button class="btn ghost" data-act="resolve">${c.status === 'open' ? `${ICON.check}<span>Resolver</span>` : '<span>Reabrir</span>'}</button>
      <button class="icon-btn ${S.info ? 'on' : ''}" data-act="toggleInfo" title="Detalhes" aria-label="Detalhes">${ICON.info}</button>
    </div>
    ${isAdmin() && !mine ? `<div class="admin-banner">${ICON.shield}<span>Você está vendo esta conversa como administrador — responsável: <b>${owner ? esc(owner.name) : 'Fila de entrada'}</b></span></div>` : ''}`;
}

function bubble(m) {
  if (m.type === 'system') {
    return `<div class="sys"><span>${ICON.transfer}${esc(m.body)}</span><time>${hm(m.created_at)}</time></div>`;
  }
  if (m.type === 'note') {
    return `<div class="note"><div class="note-h">${ICON.lock}<b>Nota interna</b> · ${esc(m.sender_name || '')}<time>${hm(m.created_at)}</time></div><p>${esc(m.body).replace(/\n/g, '<br>')}</p></div>`;
  }
  const out = m.direction === 'out';
  let inner = '';
  if (m.media_url) {
    if (m.type === 'image' || m.type === 'sticker') inner += `<a href="${m.media_url}" target="_blank" rel="noopener"><img class="m-img ${m.type}" loading="lazy" src="${m.media_url}" alt="Imagem"></a>`;
    else if (m.type === 'video') inner += `<video class="m-vid" controls preload="metadata" src="${m.media_url}"></video>`;
    else if (m.type === 'audio') inner += `<audio controls preload="none" src="${m.media_url}"></audio>`;
    else inner += `<a class="m-file" href="${m.media_url}" target="_blank" rel="noopener">${ICON.file}<span><b>${esc(m.media_name || 'Arquivo')}</b><small>${fmtSize(m.media_size)}</small></span>${ICON.download}</a>`;
  }
  if (m.body) inner += `<p>${esc(m.body).replace(/\n/g, '<br>')}</p>`;
  const tick = out ? `<span class="tick ${m.status === 'read' || m.status === 'played' ? 'read' : ''}">${m.status === 'delivered' || m.status === 'read' || m.status === 'played' ? '✓✓' : '✓'}</span>` : '';
  const who = out ? `<span class="who">${esc(m.sender_name || 'Enviada pelo celular')}</span>` : '';
  return `<div class="msg ${out ? 'out' : 'in'}" data-mid="${m.id}"><div class="bub">${who}${inner}<span class="meta"><time>${hm(m.created_at)}</time>${tick}</span></div></div>`;
}

function renderMsgs(forceBottom = false, keepFrom = null) {
  const el = $('#msgs');
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  const prevH = el.scrollHeight;
  let html = S.hasMore ? '<button class="load-more" data-act="more">Carregar mensagens anteriores</button>' : '';
  let lastDay = '';
  for (const m of S.messages) {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDay) { html += `<div class="day"><span>${dayLabel(m.created_at)}</span></div>`; lastDay = d; }
    html += bubble(m);
  }
  if (!S.messages.length) html += '<div class="msgs-empty">Sem mensagens ainda.</div>';
  el.innerHTML = html;
  if (keepFrom) el.scrollTop = el.scrollHeight - prevH + keepFrom;
  else if (forceBottom || nearBottom) el.scrollTop = el.scrollHeight;
}

function upsertMessage(m) {
  if (m.conversation_id !== S.activeId) return;
  const i = S.messages.findIndex((x) => x.id === m.id);
  if (i >= 0) S.messages[i] = m; else S.messages.push(m);
  renderMsgs();
}

async function loadMore() {
  const first = S.messages[0];
  if (!first) return;
  const el = $('#msgs');
  const top = el.scrollTop;
  try {
    const r = await api(`/api/conversations/${S.activeId}/messages?before=${first.id}`);
    S.messages = [...r.messages, ...S.messages];
    S.hasMore = r.hasMore;
    renderMsgs(false, top);
  } catch (e) { toast(e.message, 'error'); }
}

async function sendMessage() {
  const ta = $('#msgInput');
  if (!ta || S.sending || !S.activeId) return;
  const text = ta.value.trim();
  if (!text) return;
  S.sending = true;
  try {
    const r = await api(`/api/conversations/${S.activeId}/${S.mode === 'note' ? 'notes' : 'messages'}`, { json: { text } });
    ta.value = ''; ta.style.height = 'auto';
    delete S.drafts[S.activeId];
    upsertMessage(r.message);
    const el = $('#msgs'); if (el) el.scrollTop = el.scrollHeight;
  } catch (e) { toast(e.message, 'error'); }
  S.sending = false;
}

async function onFilePicked(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !S.activeId) return;
  if (file.size > 60 * 1024 * 1024) return toast('Arquivo maior que 60 MB.', 'error');
  const ta = $('#msgInput');
  const caption = ta.value.trim();
  toast(`Enviando ${file.name}…`);
  try {
    const r = await api(`/api/conversations/${S.activeId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': encodeURIComponent(file.name),
        'X-Caption': encodeURIComponent(caption),
      },
      body: file,
    });
    ta.value = ''; delete S.drafts[S.activeId];
    upsertMessage(r.message);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- painel de detalhes ----------
function renderInfo() {
  const el = $('#infoPane');
  if (!el) return;
  el.classList.toggle('hidden', !S.info || !S.activeId);
  const c = S.convs.get(S.activeId);
  if (!c) { el.innerHTML = ''; return; }
  const owner = c.assigned_to ? userById(c.assigned_to) : null;
  el.innerHTML = `
    <div class="info-card">
      ${contactAv(c, 72)}
      <h3>${esc(c.name)}</h3>
      <p class="phone">${esc(fmtPhone(c.phone))}</p>
      <button class="btn ghost sm" data-act="rename">${ICON.edit}<span>Editar nome</span></button>
    </div>
    <div class="info-sec">
      <h4>Responsável</h4>
      <div class="owner-row">${owner ? `${userAv(owner, 32)}<div><b>${esc(owner.name)}</b><small>${owner.role === 'admin' ? 'Administrador' : 'Atendente'}</small></div>` : `<span class="chip chip-queue">${ICON.inbox}Fila de entrada</span>`}</div>
    </div>
    <div class="info-sec">
      <h4>Histórico de transferências</h4>
      ${S.transfers.length ? `<ol class="timeline">${S.transfers.map((t) => `
        <li>
          <div class="tl-top"><b>${esc(t.from_name || 'Fila')}</b><span class="arrow">→</span><b>${esc(t.to_name || 'Fila')}</b></div>
          <small>por ${esc(t.by_name)} · ${fullDate(t.created_at)}</small>
          ${t.note ? `<p class="tl-note">“${esc(t.note)}”</p>` : ''}
        </li>`).join('')}</ol>` : '<p class="muted">Esta conversa ainda não foi transferida.</p>'}
    </div>
    <div class="info-sec">
      <h4>Dados</h4>
      <dl><dt>Primeiro contato</dt><dd>${fullDate(c.created_at)}</dd><dt>Situação</dt><dd>${c.status === 'open' ? 'Aberta' : 'Resolvida'}</dd></dl>
    </div>`;
}

async function refreshTransfers() {
  if (!S.activeId) return;
  try {
    const d = await api(`/api/conversations/${S.activeId}`);
    S.transfers = d.transfers;
    renderInfo();
  } catch { /* ignore */ }
}

// ====================== transferência ======================
function transferTargets(c) {
  const t = S.users.filter((u) => u.active && u.id !== c.assigned_to)
    .map((u) => ({ key: String(u.id), id: u.id, name: u.name, color: u.color, role: u.role, open: u.open_count }));
  if (isAdmin() && c.assigned_to) t.push({ key: QUEUE, id: null, name: 'Fila de entrada', color: '#64748b', role: 'queue' });
  return t;
}

function openTransfer(convId, preKey) {
  const c = S.convs.get(convId);
  if (!c) return;
  const targets = transferTargets(c);
  let sel = targets.some((t) => t.key === String(preKey)) ? String(preKey) : null;
  const warn = isAdmin()
    ? 'Como administrador, você continua enxergando esta conversa. Todo o histórico, mídias e notas seguem com ela.'
    : 'Ao passar, a conversa <b>com todo o histórico, mídias e notas</b> vai para o colega e <b>deixa de aparecer para você</b>.';
  const el = modal(`
    <div class="modal-h"><div class="modal-ic">${ICON.transfer}</div><div><h3>Passar conversa</h3><p class="sub">${esc(c.name)} · ${esc(fmtPhone(c.phone))}</p></div></div>
    <label class="lbl">Para quem?</label>
    <div class="pick">
      ${targets.map((t) => `<button type="button" class="pick-i" data-key="${t.key}">
        ${t.role === 'queue' ? `<span class="av" style="--c:${t.color}">${ICON.inbox}</span>` : userAv(t, 36)}
        <span class="pick-n"><b>${esc(t.name)}</b>${t.role === 'admin' ? '<small>Administrador</small>' : t.open != null ? `<small>${t.open} aberta${t.open === 1 ? '' : 's'}</small>` : ''}</span>
        <i class="radio"></i></button>`).join('')}
    </div>
    <label class="lbl">Nota para quem receber <span class="opt">(opcional)</span></label>
    <textarea id="tNote" rows="3" maxlength="500" placeholder="Ex.: cliente pediu desconto, retornar até as 17h"></textarea>
    <div class="callout">${ICON.shield}<p>${warn}</p></div>
    <div class="modal-a"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="tGo" disabled>${ICON.transfer}<span>Passar conversa</span></button></div>`);
  const paint = () => {
    $$('.pick-i', el).forEach((b) => b.classList.toggle('on', b.dataset.key === sel));
    $('#tGo', el).disabled = !sel;
  };
  paint();
  $$('.pick-i', el).forEach((b) => b.addEventListener('click', () => { sel = b.dataset.key; paint(); }));
  $('#tGo', el).addEventListener('click', async () => {
    const btn = $('#tGo', el);
    btn.disabled = true;
    try {
      const r = await api(`/api/conversations/${convId}/transfer`, {
        json: { toUserId: sel === QUEUE ? null : Number(sel), note: $('#tNote', el).value },
      });
      el.close();
      const to = r.conversation.assigned_to ? userById(r.conversation.assigned_to)?.name : 'a fila de entrada';
      toast(`Conversa passada para ${to}`, 'ok');
      if (!isAdmin()) handleRemoved(convId);
      else { S.convs.set(convId, r.conversation); renderAll(); if (S.activeId === convId) { renderChatHead(); refreshTransfers(); } }
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
    }
  });
}

function handleRemoved(id) {
  S.convs.delete(id);
  if (S.searchResults) S.searchResults = S.searchResults.filter((c) => c.id !== id);
  if (S.activeId === id) closeActive();
  renderAll();
}

// ====================== arrastar e soltar ======================
let dragId = null;
let overEl = null;

function showDock(c) {
  const dock = $('#dock');
  if (!dock) return;
  const targets = transferTargets(c);
  dock.innerHTML = `<div class="dock-in">
    <p>${ICON.transfer} Solte sobre quem vai atender <b>${esc(c.name)}</b></p>
    <div class="dock-t">${targets.map((t) => `
      <div class="target" data-drop="${t.key}">
        ${t.role === 'queue' ? `<span class="av" style="--c:${t.color}">${ICON.inbox}</span>` : userAv(t, 48)}
        <span>${esc(t.name.split(' ')[0] + (t.role === 'queue' ? ' de entrada' : ''))}</span>
      </div>`).join('')}</div></div>`;
  dock.classList.add('show');
}
function hideDock() { const d = $('#dock'); if (d) { d.classList.remove('show'); } }
function clearOver() { if (overEl) { overEl.classList.remove('over'); overEl = null; } }

document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-drag]');
  if (!el) return;
  dragId = Number(el.dataset.drag);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragId));
  el.classList.add('dragging');
  const c = S.convs.get(dragId);
  if (c && S.view === 'chats') setTimeout(() => showDock(c), 0);
  if (S.view === 'board') document.body.classList.add('dragging-board');
});
document.addEventListener('dragend', () => {
  dragId = null; clearOver(); hideDock();
  document.body.classList.remove('dragging-board');
  $$('.dragging').forEach((n) => n.classList.remove('dragging'));
});
document.addEventListener('dragover', (e) => {
  const t = e.target.closest?.('[data-drop]');
  if (!t || dragId == null) { clearOver(); return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (overEl !== t) { clearOver(); overEl = t; t.classList.add('over'); }
});
document.addEventListener('drop', (e) => {
  const t = e.target.closest?.('[data-drop]');
  if (!t || dragId == null) return;
  e.preventDefault();
  const id = dragId, key = t.dataset.drop;
  dragId = null; clearOver(); hideDock();
  document.body.classList.remove('dragging-board');
  const c = S.convs.get(id);
  if (!c) return;
  if ((key === QUEUE && !c.assigned_to) || key === String(c.assigned_to)) return; // soltou no mesmo dono
  openTransfer(id, key);
});

// ====================== quadro (admin) ======================
function viewBoard() {
  $('#main').innerHTML = `
  <div class="page board-page">
    <header class="page-h"><div><h2>Quadro de atendimento</h2><p>Arraste um cartão para outra coluna para passar a conversa. O histórico vai junto.</p></div></header>
    <div class="board" id="board"></div>
  </div>`;
  renderBoard();
}

function renderBoard() {
  const el = $('#board');
  if (!el) return;
  const cols = [{ key: QUEUE, name: 'Fila de entrada', color: '#64748b', queue: true },
    ...S.users.filter((u) => u.active).map((u) => ({ key: String(u.id), name: u.name, color: u.color, role: u.role }))];
  const open = [...S.convs.values()].filter((c) => c.status === 'open')
    .sort((a, b) => (b.last_message_at || 0) - (a.last_message_at || 0));
  el.innerHTML = cols.map((col) => {
    const items = open.filter((c) => (col.queue ? !c.assigned_to : String(c.assigned_to) === col.key));
    return `<section class="col" data-drop="${col.key}" style="--c:${col.color}">
      <header class="col-h">${col.queue ? `<span class="av" style="--c:${col.color};width:30px;height:30px">${ICON.inbox}</span>` : avatar(col.name, col.color, 30)}<b>${esc(col.name)}</b>${col.role === 'admin' ? '<small class="tag">Admin</small>' : ''}<span class="count">${items.length}</span></header>
      <div class="col-b">
        ${items.map((c) => `<article class="card ${c.unread > 0 ? 'unread' : ''}" draggable="true" data-drag="${c.id}" data-act="openFromBoard" data-id="${c.id}">
          <div class="card-t">${contactAv(c, 32)}<b>${esc(c.name)}</b><time>${listTime(c.last_message_at)}</time></div>
          <p>${esc(c.last_preview || '')}</p>
          ${c.unread > 0 ? `<span class="badge">${c.unread}</span>` : ''}
        </article>`).join('') || '<div class="col-empty">Solte conversas aqui</div>'}
      </div></section>`;
  }).join('');
}

// ====================== equipe (admin) ======================
async function viewTeam() {
  $('#main').innerHTML = `<div class="page"><header class="page-h"><div><h2>Equipe e configurações</h2><p>Cadastre os e-mails que terão acesso ao CRM e gerencie quem atende pelo número da empresa.</p></div></header><div class="team" id="teamBody"><div class="loading">Carregando…</div></div></div>`;
  try {
    const [st, act] = await Promise.all([api('/api/settings'), api('/api/admin/transfers')]);
    S.settings = st.settings; S.stats = st.stats; S.activity = act.transfers;
  } catch (e) { toast(e.message, 'error'); }
  renderTeam();
}

function renderTeam() {
  const el = $('#teamBody');
  if (!el || S.view !== 'team') return;
  const agents = S.users.filter((u) => u.role === 'agent');
  const activeCount = agents.filter((u) => u.active).length;
  const st = S.stats || {};
  el.innerHTML = `
  <div class="stats">
    <div class="stat"><span>Conversas</span><b>${st.conversations ?? '–'}</b></div>
    <div class="stat"><span>Mensagens</span><b>${st.messages ?? '–'}</b></div>
    <div class="stat"><span>Na fila</span><b>${st.queue ?? '–'}</b></div>
    <div class="stat"><span>Transferências</span><b>${st.transfers ?? '–'}</b></div>
  </div>
  <section class="panel">
    <header class="panel-h"><div><h3>Usuários com acesso</h3><p>${activeCount} de ${S.maxAgents} atendentes ativos, mais o administrador.</p></div>
      <button class="btn primary" data-act="newUser" ${activeCount >= S.maxAgents ? 'disabled' : ''}>${ICON.plus}<span>Adicionar acesso</span></button></header>
    <div class="users">
      ${S.users.map((u) => `
        <div class="user ${u.active ? '' : 'off'}">
          ${userAv(u, 44)}
          <div class="user-m"><b>${esc(u.name)}</b><small>${esc(u.email || '')}</small></div>
          <span class="tag ${u.role === 'admin' ? 'tag-admin' : ''}">${u.role === 'admin' ? 'Administrador' : u.active ? 'Atendente' : 'Desativado'}</span>
          <div class="user-n"><b>${u.open_count ?? 0}</b><small>abertas</small></div>
          <button class="btn ghost sm" data-act="editUser" data-id="${u.id}">${ICON.edit}<span>Editar</span></button>
        </div>`).join('')}
    </div>
  </section>
  <div class="two">
    <section class="panel">
      <header class="panel-h"><div><h3>Distribuição</h3><p>O que fazer quando um cliente novo escreve.</p></div></header>
      <label class="opt-row"><input type="radio" name="aa" value="balanced" ${S.settings?.auto_assign !== 'queue' ? 'checked' : ''}><span><b>Distribuir automaticamente</b><small>Vai para o atendente com menos conversas abertas.</small></span></label>
      <label class="opt-row"><input type="radio" name="aa" value="queue" ${S.settings?.auto_assign === 'queue' ? 'checked' : ''}><span><b>Fila de entrada</b><small>Fica com o administrador, que arrasta para quem vai atender.</small></span></label>
      <label class="opt-row"><input type="checkbox" id="sigChk" ${S.settings?.signature === '1' ? 'checked' : ''}><span><b>Assinar mensagens com o nome do atendente</b><small>O cliente vê “*Nome:*” antes de cada mensagem.</small></span></label>
    </section>
    <section class="panel">
      <header class="panel-h"><div><h3>Banco de dados</h3><p>Tudo fica em um único arquivo SQLite.</p></div></header>
      <p class="muted">Conversas, mensagens, fotos, áudios, documentos, notas e transferências. Nada é apagado — nem pelo sistema.</p>
      <a class="btn outline" href="/api/admin/backup" download>${ICON.download}<span>Baixar backup completo</span></a>
    </section>
  </div>
  <section class="panel">
    <header class="panel-h"><div><h3>Atividade recente</h3><p>Auditoria das transferências entre atendentes.</p></div></header>
    ${S.activity.length ? `<ul class="activity">${S.activity.map((t) => `
      <li><span class="act-ic">${ICON.transfer}</span>
        <div><b>${esc(t.by_name)}</b> passou <b>${esc(t.contact_name)}</b> de <b>${esc(t.from_name || 'Fila')}</b> para <b>${esc(t.to_name || 'Fila')}</b>${t.note ? `<p class="tl-note">“${esc(t.note)}”</p>` : ''}</div>
        <time>${fullDate(t.created_at)}</time></li>`).join('')}</ul>` : '<p class="muted">Nenhuma transferência ainda.</p>'}
  </section>`;

  $$('input[name=aa]', el).forEach((r) => r.addEventListener('change', async () => {
    try { await api('/api/settings', { method: 'PATCH', json: { auto_assign: r.value } }); S.settings.auto_assign = r.value; toast('Configuração salva', 'ok'); } catch (e) { toast(e.message, 'error'); }
  }));
  $('#sigChk', el)?.addEventListener('change', async (e) => {
    try { await api('/api/settings', { method: 'PATCH', json: { signature: e.target.checked } }); S.settings.signature = e.target.checked ? '1' : '0'; toast('Configuração salva', 'ok'); } catch (err) { toast(err.message, 'error'); }
  });
}

function openUserForm(user) {
  const isNew = !user;
  let color = user?.color || PALETTE[S.users.length % PALETTE.length];
  const el = modal(`
    <div class="modal-h"><div class="modal-ic">${ICON.users}</div><div><h3>${isNew ? 'Novo atendente' : 'Editar usuário'}</h3><p class="sub">${isNew ? 'Ele terá acesso apenas às conversas que forem passadas para ele.' : esc(user.email)}</p></div></div>
    <form id="uForm" autocomplete="off">
      <label class="lbl">Nome<input name="name" required value="${esc(user?.name || '')}" maxlength="60"></label>
      <label class="lbl">E-mail<input name="email" type="email" required value="${esc(user?.email || '')}"></label>
      <label class="lbl">${isNew ? 'Senha' : 'Nova senha <span class="opt">(deixe em branco para manter)</span>'}<input name="password" type="text" ${isNew ? 'required' : ''} minlength="6" autocomplete="new-password" placeholder="mínimo 6 caracteres"></label>
      <div class="lbl">Cor<div class="swatches">${PALETTE.map((c) => `<button type="button" class="sw ${c === color ? 'on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
      ${!isNew && user.role === 'agent' ? `<label class="opt-row"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}><span><b>Usuário ativo</b><small>Ao desativar, as conversas dele voltam para a fila de entrada, com todo o histórico.</small></span></label>` : ''}
      <div class="form-error" id="uErr" role="alert"></div>
      <div class="modal-a"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">${isNew ? 'Criar atendente' : 'Salvar'}</button></div>
    </form>`);
  $$('.sw', el).forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.c;
    $$('.sw', el).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#uForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name'), email: f.get('email'), color };
    if (f.get('password')) body.password = f.get('password');
    if (!isNew && user.role === 'agent') body.active = f.get('active') === 'on';
    const btn = $('button[type=submit]', el);
    btn.disabled = true;
    try {
      if (isNew) await api('/api/users', { json: body });
      else await api(`/api/users/${user.id}`, { method: 'PATCH', json: body });
      el.close();
      toast('Salvo', 'ok');
      await reloadUsers();
      if (!isNew && body.active === false) await reloadConversations();
      renderTeam();
    } catch (err) {
      $('#uErr', el).textContent = err.message;
      btn.disabled = false;
    }
  });
}

// ====================== WhatsApp (admin) ======================
async function viewWhatsApp() {
  $('#main').innerHTML = `<div class="page"><header class="page-h"><div><h2>Conexão do WhatsApp</h2><p>O número da empresa é conectado uma única vez; todos os atendentes usam a mesma conexão.</p></div></header><div id="waBody"></div></div>`;
  try { S.wa = await api('/api/whatsapp'); } catch { /* ignore */ }
  renderWaView();
}

function renderWaView() {
  const el = $('#waBody');
  if (!el || S.view !== 'whatsapp') return;
  const w = S.wa;
  const demo = w.mode === 'demo';
  let body;
  if (w.status === 'connected') {
    body = `<div class="wa-state ok"><div class="wa-big">${ICON.check}</div><h3>${demo ? 'Modo demonstração' : 'Conectado'}</h3>
      <p>${demo ? 'Nenhum WhatsApp real está ligado. As respostas dos clientes são simuladas para você testar o sistema.' : `Número: <b>${esc(fmtPhone(w.number))}</b>`}</p>
      ${demo ? '' : '<div class="wa-actions"><button class="btn outline" data-act="waRestart">Reconectar</button><button class="btn danger" data-act="waLogout">Desconectar número</button></div>'}</div>`;
  } else if (w.status === 'qr' && w.qr) {
    body = `<div class="wa-qr"><img src="${w.qr}" alt="QR Code do WhatsApp" width="280" height="280">
      <div><h3>Escaneie para conectar</h3>
      <ol><li>Abra o WhatsApp no celular da empresa</li><li>Toque em <b>Aparelhos conectados</b></li><li>Toque em <b>Conectar um aparelho</b> e aponte para o código</li></ol>
      <p class="muted">O código renova sozinho a cada ~20 segundos.</p></div></div>`;
  } else {
    body = `<div class="wa-state"><div class="wa-big warn">${ICON.phone}</div><h3>${w.status === 'connecting' ? 'Conectando…' : 'Desconectado'}</h3>
      <p>${esc(w.error || 'Aguarde — o QR Code aparece aqui em instantes.')}</p>
      <div class="wa-actions"><button class="btn primary" data-act="waRestart">Gerar novo QR Code</button></div></div>`;
  }
  el.innerHTML = `<section class="panel wa-panel">${body}</section>`;
}

// ====================== conta ======================
function openAccount() {
  const el = modal(`
    <div class="modal-h">${userAv(S.me, 52)}<div><h3>${esc(S.me.name)}</h3><p class="sub">${esc(S.me.email)} · ${isAdmin() ? 'Administrador' : 'Atendente'}</p></div></div>
    <form id="pwForm">
      <h4 class="sec">Alterar senha</h4>
      <label class="lbl">Senha atual<input name="current" type="password" required autocomplete="current-password"></label>
      <label class="lbl">Nova senha<input name="next" type="password" required minlength="6" autocomplete="new-password"></label>
      <div class="form-error" id="pwErr" role="alert"></div>
      <div class="modal-a"><button type="button" class="btn danger-ghost" data-act="logout">${ICON.logout}<span>Sair</span></button><span class="grow"></span><button type="button" class="btn ghost" data-close>Fechar</button><button class="btn primary" type="submit">Salvar senha</button></div>
    </form>`);
  $('#pwForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/me/password', { json: { current: f.get('current'), next: f.get('next') } });
      el.close(); toast('Senha alterada', 'ok');
    } catch (err) { $('#pwErr', el).textContent = err.message; }
  });
}

// ====================== ações (delegação de cliques) ======================
const ACT = {
  nav: (t) => setView(t.dataset.v),
  theme() {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    updateThemeIcon();
  },
  account: openAccount,
  async logout() { try { await api('/api/logout', { json: {} }); } catch { /* ignore */ } location.reload(); },
  tab(t) { S.status = t.dataset.s; renderTabs(); renderConvList(); },
  openConv(t) { openConversation(Number(t.dataset.id)); },
  openFromBoard(t) { setView('chats'); openConversation(Number(t.dataset.id)); },
  back() { S.mobileChat = false; $('#chats')?.classList.remove('open-chat'); },
  toggleInfo() { S.info = !S.info; renderInfo(); renderChatHead(); },
  mode(t) { S.mode = t.dataset.m; applyModeUI(); $('#msgInput')?.focus(); },
  send: sendMessage,
  attach() { $('#fileIn')?.click(); },
  more: loadMore,
  transfer() { openTransfer(S.activeId); },
  async resolve() {
    const c = S.convs.get(S.activeId);
    if (!c) return;
    try {
      const r = await api(`/api/conversations/${c.id}/status`, { json: { status: c.status === 'open' ? 'resolved' : 'open' } });
      S.convs.set(c.id, r.conversation);
      renderChatHead(); renderConvList(); renderTabs(); renderInfo();
      toast(r.conversation.status === 'resolved' ? 'Conversa resolvida' : 'Conversa reaberta', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  },
  rename() {
    const c = S.convs.get(S.activeId);
    if (!c) return;
    const el = modal(`<div class="modal-h"><div class="modal-ic">${ICON.edit}</div><div><h3>Editar nome do contato</h3><p class="sub">${esc(fmtPhone(c.phone))}</p></div></div>
      <form id="rnForm"><label class="lbl">Nome<input name="name" value="${esc(c.name)}" maxlength="80" required autofocus></label>
      <div class="modal-a"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
    $('#rnForm', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api(`/api/contacts/${c.contact_id}`, { method: 'PATCH', json: { name: new FormData(e.target).get('name') } });
        S.convs.set(c.id, r.conversation); el.close(); renderAll();
      } catch (err) { toast(err.message, 'error'); }
    });
  },
  newUser: () => openUserForm(null),
  editUser: (t) => openUserForm(userById(Number(t.dataset.id))),
  async waRestart() { try { S.wa = await api('/api/whatsapp/restart', { json: {} }); renderWaView(); } catch (e) { toast(e.message, 'error'); } },
  async waLogout() {
    if (!confirm('Desconectar o número? Será preciso escanear o QR Code novamente. As conversas continuam salvas.')) return;
    try { S.wa = await api('/api/whatsapp/logout', { json: {} }); renderWaView(); } catch (e) { toast(e.message, 'error'); }
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = ACT[t.dataset.act];
  if (fn) fn(t, e);
});

// ====================== dados e tempo real ======================
function renderAll() {
  updateBadges();
  if (S.view === 'chats') { renderTabs(); renderConvList(); renderInfo(); }
  else if (S.view === 'board') renderBoard();
}

async function reloadUsers() {
  const r = await api('/api/users');
  S.users = r.users; S.maxAgents = r.max_agents;
}
async function reloadConversations() {
  const r = await api('/api/conversations');
  S.convs = new Map(r.conversations.map((c) => [c.id, c]));
  if (S.activeId && !S.convs.has(S.activeId)) closeActive();
  renderAll();
}

function connectSocket() {
  socket = io({ withCredentials: true });

  socket.on('connect_error', (err) => {
    if (String(err.message).includes('autenticado')) location.reload();
  });
  socket.on('connect', () => { if (S.me && S.convs.size) { reloadConversations().catch(() => {}); } });

  socket.on('conversation:update', (c) => {
    const prev = S.convs.get(c.id);
    S.convs.set(c.id, c);
    if (S.searchResults) S.searchResults = S.searchResults.map((x) => (x.id === c.id ? c : x));
    if (!prev && c.assigned_to === S.me.id && !isAdmin()) {
      toast(`Nova conversa para você: ${c.name}`, 'ok'); beep();
    }
    renderAll();
    if (c.id === S.activeId && S.view === 'chats') { renderChatHead(); renderInfo(); }
  });

  socket.on('conversation:removed', ({ id, to_name }) => {
    if (isAdmin() || !S.convs.has(id)) return; // admin continua vendo; ou já tratado localmente
    const wasActive = S.activeId === id;
    handleRemoved(id);
    toast(wasActive ? `A conversa foi passada para ${to_name || 'outro usuário'}.` : `Uma conversa foi passada para ${to_name || 'outro usuário'}.`);
  });

  socket.on('message:new', (m) => {
    if (m.conversation_id === S.activeId) {
      upsertMessage(m);
      if (m.type === 'system') refreshTransfers();
      const c = S.convs.get(m.conversation_id);
      if (m.direction === 'in' && c?.assigned_to === S.me.id) api(`/api/conversations/${m.conversation_id}/read`, { json: {} }).catch(() => {});
    } else if (m.direction === 'in') {
      beep();
    }
  });
  socket.on('message:update', (m) => upsertMessage(m));

  socket.on('users:changed', (users) => {
    // a lista de eventos não traz e-mail; preserva o que já temos
    S.users = users.map((u) => ({ ...(userById(u.id) || {}), ...u }));
    if (isAdmin()) reloadUsers().then(() => { renderAll(); renderTeam(); }).catch(() => {});
    else renderAll();
  });

  socket.on('wa:status', (s) => {
    S.wa = { ...S.wa, ...s };
    renderWaPill();
    if (S.view === 'whatsapp') renderWaView();
  });
  socket.on('wa:qr', ({ qr }) => {
    S.wa.qr = qr;
    if (S.view === 'whatsapp') renderWaView();
  });
}

// ====================== inicialização ======================
async function boot() {
  try {
    const setup = await api('/api/setup');
    if (setup.required) return renderSetup();
    S.me = (await api('/api/me')).user;
  } catch {
    return renderLogin();
  }
  try {
    await Promise.all([reloadUsers(), (async () => {
      const r = await api('/api/conversations');
      S.convs = new Map(r.conversations.map((c) => [c.id, c]));
    })(), api('/api/whatsapp').then((w) => { S.wa = w; })]);
  } catch (e) {
    toast(e.message, 'error');
  }
  renderShell();
  setView('chats');
  updateBadges();
  connectSocket();
}

document.addEventListener('DOMContentLoaded', boot);
})();
