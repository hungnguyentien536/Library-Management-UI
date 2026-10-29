// Khởi động: kiểm tra đăng nhập, dựng khung (sidebar + topbar) và định tuyến theo #hash.
import { api, setUnauthorizedHandler } from './api.js';
import { html, setHTML, icon, $, $$, initials, fmtDate, debounce, toast, accountLabel } from './ui.js';
import { store, loadLookups, onDataChange, refreshAll } from './state.js';
import { renderLogin } from './views/login.js';
import { issueDialog } from './dialogs.js';

import * as dashboard from './views/dashboard.js';
import * as books from './views/books.js';
import * as bookDetail from './views/book-detail.js';
import * as members from './views/members.js';
import * as memberDetail from './views/member-detail.js';
import * as loans from './views/loans.js';
import * as requests from './views/requests.js';
import * as fines from './views/fines.js';

const app = document.getElementById('app');

// Bảng định tuyến: mẫu đường dẫn -> màn hình + mục menu được tô sáng
const ROUTES = [
  { path: /^$/, view: dashboard, nav: 'home', title: 'Tổng quan' },
  { path: /^books$/, view: books, nav: 'books', title: 'Sách' },
  { path: /^books\/(\d+)$/, view: bookDetail, nav: 'books', title: 'Thông tin sách' },
  { path: /^members$/, view: members, nav: 'members', title: 'Độc giả' },
  { path: /^members\/(\d+)$/, view: memberDetail, nav: 'members', title: 'Hồ sơ độc giả' },
  { path: /^loans$/, view: loans, nav: 'loans', title: 'Mượn & trả' },
  { path: /^requests$/, view: requests, nav: 'requests', title: 'Đặt sách' },
  { path: /^fines$/, view: fines, nav: 'fines', title: 'Tiền phạt' },
];

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { path: path.replace(/\/$/, ''), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

/* ---------- Giao diện sáng / tối ---------- */
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
function currentTheme() {
  return document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
try { applyTheme(localStorage.getItem('theme')); } catch { /* bỏ qua */ }

/* ---------- Khung ứng dụng ---------- */
function renderShell() {
  const u = store.user;
  setHTML(app, html`
  <div class="shell">
    <aside class="sidebar" aria-label="Điều hướng">
      <div class="brand">
        <div class="brand-mark">${icon('books')}</div>
        <div><div class="brand-name">Thư viện</div><div class="brand-sub">Quản lý library_db</div></div>
      </div>
      <nav class="nav">
        <a href="#/" data-nav="home">${icon('home')}Tổng quan</a>
        <div class="nav-group">Nghiệp vụ</div>
        <a href="#/loans" data-nav="loans">${icon('swap')}Mượn & trả<span class="count" data-badge="overdue" hidden></span></a>
        <a href="#/requests" data-nav="requests">${icon('bookmark')}Đặt sách<span class="count" data-badge="requests" hidden style="background:var(--stamp-soft);color:var(--stamp-ink)"></span></a>
        <a href="#/fines" data-nav="fines">${icon('coins')}Tiền phạt</a>
        <div class="nav-group">Danh mục</div>
        <a href="#/books" data-nav="books">${icon('book')}Sách</a>
        <a href="#/members" data-nav="members">${icon('users')}Độc giả</a>
      </nav>
      <div class="sidebar-foot">
        <div class="who">
          <div class="avatar" aria-hidden="true">${initials(u.staff_name)}</div>
          <div><div class="who-name">${u.staff_name}</div><div class="who-role">${u.designation || ''}</div></div>
          <button class="btn btn-ghost btn-sm btn-icon" id="logout" title="Đăng xuất" aria-label="Đăng xuất">${icon('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon menu-btn" id="menu" aria-label="Mở menu">${icon('menu')}</button>
        <div class="search" role="search">
          ${icon('search')}
          <label class="sr-only" for="global-search">Tra cứu sách hoặc độc giả</label>
          <input id="global-search" type="search" autocomplete="off" placeholder="Tra cứu sách, tác giả, ISBN, độc giả…">
          <span class="kbd" aria-hidden="true">/</span>
          <div class="popover" id="global-results" hidden></div>
        </div>
        <span class="today">${icon('calendar', 'small')} Hôm nay ${fmtDate(store.lookups.today)}</span>
        <button class="btn btn-ghost btn-icon" id="theme" aria-label="Đổi giao diện sáng/tối">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn btn-primary" id="quick-issue" aria-label="Cho mượn">${icon('plus')}<span class="btn-label">Cho mượn</span></button>
      </header>
      <main class="page" id="page" tabindex="-1"></main>
    </div>
  </div>`);

  $('#logout').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    store.user = null;
    location.hash = '#/';
    start();
  });
  $('#menu').addEventListener('click', () => $('.shell').classList.toggle('nav-open'));
  $('.shell').addEventListener('click', (e) => {
    if (e.target.closest('.nav a') || e.target === $('.shell')) $('.shell').classList.remove('nav-open');
  });
  $('#theme').addEventListener('click', (e) => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch { /* bỏ qua */ }
    setHTML(e.currentTarget, icon(next === 'dark' ? 'sun' : 'moon'));
  });
  $('#quick-issue').addEventListener('click', () => issueDialog());
  setupGlobalSearch();
  refreshBadges();
}

/* Số trên menu: phiếu quá hạn và yêu cầu đặt sách đang mở */
async function refreshBadges() {
  try {
    const { stats } = await api.get('/api/dashboard');
    const set = (key, n) => {
      const el = $(`[data-badge="${key}"]`);
      if (!el) return;
      el.hidden = !n;
      el.textContent = n;
    };
    set('overdue', stats.overdue);
    set('requests', stats.open_requests);
  } catch { /* không quan trọng */ }
}
onDataChange(refreshBadges);

/* Ô tra cứu nhanh ở thanh trên cùng; phím "/" để nhảy vào */
function setupGlobalSearch() {
  const input = $('#global-search');
  const pop = $('#global-results');
  let links = [];
  let active = -1;

  const hide = () => { pop.hidden = true; };
  const highlight = () => links.forEach((a, i) => a.setAttribute('aria-selected', i === active));

  const run = debounce(async () => {
    const q = input.value.trim();
    if (!q) return hide();
    try {
      const { books: bs, members: ms } = await api.get('/api/search', { q });
      setHTML(pop, (bs.length || ms.length) ? html`
        ${bs.length ? html`<div class="popover-group">Sách</div>` : ''}
        ${bs.map((b) => html`<a class="option" href="#/books/${b.book_id}">${icon('book')}
          <span class="option-main"><span class="option-title">${b.book_title}</span>
          <span class="option-sub">${b.authors || 'Chưa có tác giả'}, còn ${b.copies_available}/${b.copies_total} bản</span></span></a>`)}
        ${ms.length ? html`<div class="popover-group">Độc giả</div>` : ''}
        ${ms.map((m) => html`<a class="option" href="#/members/${m.member_id}">${icon('users')}
          <span class="option-main"><span class="option-title">${m.full_name}</span>
          <span class="option-sub">Mã ${m.member_id}${m.mobile_no ? ', ' + m.mobile_no : ''}${m.account_status !== 'active' ? ', ' + accountLabel(m.account_status) : ''}</span></span></a>`)}`
        : html`<div class="popover-empty">Không có sách hay độc giả nào khớp “${q}”.</div>`);
      links = $$('.option', pop);
      active = links.length ? 0 : -1;
      highlight();
      pop.hidden = false;
    } catch (e) { toast(e.message, 'error'); }
  });

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hide(); input.blur(); return; }
    if (pop.hidden || !links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      highlight();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      location.hash = links[active].getAttribute('href');
    }
  });
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) { hide(); input.value = ''; } });
  input.addEventListener('blur', () => setTimeout(hide, 150));
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
    if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); input.select(); }
  });
}

/* ---------- Định tuyến ---------- */
let currentRefresh = null;
async function route() {
  if (!store.user) return;
  const { path, query } = parseHash();
  const match = ROUTES.map((r) => ({ r, m: path.match(r.path) })).find((x) => x.m);
  const page = $('#page');
  $$('.nav a').forEach((a) => a.toggleAttribute('aria-current', false));
  if (!match) {
    setHTML(page, html`<div class="panel">${html`<div class="empty">${icon('alert')}<strong>Không có trang này</strong><a href="#/">Về trang tổng quan</a></div>`}</div>`);
    return;
  }
  const { r, m } = match;
  $(`.nav a[data-nav="${r.nav}"]`)?.setAttribute('aria-current', 'page');
  document.title = `${r.title} — Thư viện`;
  // Thay vùng nội dung bằng phần tử mới: bỏ hết sự kiện của trang cũ
  // và chạy lại hiệu ứng chuyển trang
  const fresh = page.cloneNode(false);
  fresh.classList.add('view-enter');
  page.replaceWith(fresh);
  window.scrollTo(0, 0);
  if (currentRefresh) currentRefresh();     // hủy đăng ký làm mới của trang cũ
  currentRefresh = null;
  try {
    const refresh = await r.view.render(fresh, { params: m.slice(1), query });
    if (typeof refresh === 'function') currentRefresh = onDataChange(refresh);
  } catch (e) {
    setHTML(fresh, html`<div class="panel"><div class="empty">${icon('alert')}<strong>Không tải được trang</strong>${e.message}</div></div>`);
  }
}
window.addEventListener('hashchange', route);

/* ---------- Khởi động ---------- */
async function start() {
  try {
    const { user } = await api.get('/api/auth/me');
    store.user = user || null;
  } catch {
    store.user = null;
  }
  if (!store.user) {
    renderLogin(app, async (user) => {
      store.user = user;
      await enterApp();
    });
    return;
  }
  await enterApp();
}

async function enterApp() {
  try {
    await loadLookups();
  } catch (e) {
    setHTML(app, html`<div class="login-form-wrap" style="min-height:100vh"><div class="login-card">
      <h1>Không kết nối được database</h1><p class="muted">${e.message}</p></div></div>`);
    return;
  }
  renderShell();
  route();
}

setUnauthorizedHandler(() => {
  if (!store.user) return;
  store.user = null;
  toast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại.', 'error');
  start();
});

// Cho phép các module khác yêu cầu làm mới toàn bộ sau khi thay đổi dữ liệu
window.addEventListener('library:changed', refreshAll);

start();
