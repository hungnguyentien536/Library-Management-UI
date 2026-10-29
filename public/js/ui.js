// Tiện ích giao diện dùng chung: tạo HTML an toàn, định dạng, biểu tượng,
// thông báo, hộp thoại và ô chọn độc giả/sách.
import { api } from './api.js';

/* ---------- HTML an toàn ----------
   html`...${giá trị}...` tự thoát ký tự đặc biệt của mọi giá trị chèn vào,
   trừ khi giá trị đó cũng được tạo bằng html`` hoặc raw(). */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}
export function html(strings, ...values) {
  return new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function setHTML(el, content) { el.innerHTML = part(content); return el; }

/* ---------- Định dạng ---------- */
export function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
export function money(n) { return `${Number(n || 0).toLocaleString('vi-VN')} đ`; }
export function daysBetween(from, to) {
  const a = Date.UTC(...from.split('-').map((x, i) => (i === 1 ? x - 1 : +x)));
  const b = Date.UTC(...to.split('-').map((x, i) => (i === 1 ? x - 1 : +x)));
  return Math.round((b - a) / 86400000);
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? parts.at(-2)[0] + parts.at(-1)[0] : parts[0].slice(0, 2)).toUpperCase();
}
export const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- Nhãn trạng thái ---------- */
export function loanChip(l) {
  switch (l.state) {
    case 'overdue': return html`<span class="chip late">Quá hạn ${l.days_late} ngày</span>`;
    case 'issued': return html`<span class="chip info">Đang mượn</span>`;
    case 'lost': return html`<span class="chip late">Báo mất</span>`;
    default: return l.days_late > 0
      ? html`<span class="chip warn">Trả muộn ${l.days_late} ngày</span>`
      : html`<span class="chip ok">Đã trả</span>`;
  }
}
const ACCOUNT = { active: ['ok', 'Hoạt động'], suspended: ['late', 'Bị khóa'], expired: ['warn', 'Hết hạn'] };
export function accountChip(status) {
  const [cls, label] = ACCOUNT[status] || ['', status];
  return html`<span class="chip ${cls}">${label}</span>`;
}
export const accountLabel = (s) => (ACCOUNT[s] || [null, s])[1];
export const typeLabel = (t) => (t === 'premium' ? 'Premium' : 'Standard');
const REQ = { pending: ['warn', 'Đang chờ sách'], available: ['ok', 'Có sách'], fulfilled: ['', 'Đã giao'], cancelled: ['', 'Đã hủy'] };
export function requestChip(status) {
  const [cls, label] = REQ[status] || ['', status];
  return html`<span class="chip ${cls}">${label}</span>`;
}
export function availability(avail, total) {
  const pct = total ? Math.round((avail / total) * 100) : 0;
  return html`<span class="avail ${avail > 0 ? '' : 'none'}"><span class="avail-bar"><span style="width:${pct}%"></span></span><span class="num">${avail}/${total}</span></span>`;
}

/* ---------- Biểu tượng (nét vẽ tay, kiểu đường mảnh) ---------- */
const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6"/>',
  books: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16.5 5.2 3.8-1 3 15.4-3.8 1z" transform="translate(-2 0)"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 12 4 4-4 4"/><path d="M21 16H8"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="m10 16-4-4 4-4"/><path d="M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  inbox: '<path d="M3 13.5 5.5 5h13l2.5 8.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

/* ---------- Trạng thái trống / đang tải ---------- */
export function empty(title, text = '', iconName = 'inbox') {
  return html`<div class="empty">${icon(iconName)}<strong>${title}</strong>${text}</div>`;
}
export function loading(rows = 4) {
  return html`<div class="loading">${Array.from({ length: rows }, (_, i) => html`<div class="skeleton" style="width:${90 - i * 12}%"></div>`)}</div>`;
}

/* ---------- Thông báo nổi ---------- */
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  setHTML(el, html`${icon(type === 'error' ? 'alert' : 'check')}<span>${message}</span>`);
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3800);
}

/* ---------- Hộp thoại (dùng thẻ <dialog> gốc của trình duyệt) ---------- */
export function openModal({ title, body, footer, wide = false, onMount }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${wide ? 'wide' : ''}`;
  setHTML(dlg, html`
    <div class="modal-head"><h2>${title}</h2>
      <button class="btn btn-ghost btn-sm btn-icon" data-close aria-label="Đóng">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? html`<div class="modal-foot">${footer}</div>` : ''}`);
  document.body.append(dlg);
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    if (e.target === dlg) close();                 // bấm ra ngoài để đóng
  });
  dlg.showModal();
  onMount?.(dlg, close);
  return { dlg, close };
}

export function confirmDialog({ title, message, confirmText = 'Xác nhận', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      body: html`<p>${message}</p>`,
      footer: html`<button class="btn" data-close>Thôi</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>`,
      onMount(dlg, close) {
        dlg.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); close(); });
        dlg.addEventListener('close', () => { if (!answered) resolve(false); });
      },
    });
  });
}

/* Đọc dữ liệu form thành object */
export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/* Khóa nút trong lúc chờ máy chủ */
export async function busy(button, fn) {
  const label = button.innerHTML;
  button.disabled = true;
  try { return await fn(); } finally { button.disabled = false; button.innerHTML = label; }
}

/* ---------- Ô chọn độc giả / sách có tìm kiếm ----------
   kind: 'member' | 'book'. Gọi onChange(item | null) khi chọn/bỏ chọn. */
export function createPicker({ kind, value = null, onChange = () => {}, placeholder, autofocus = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'picker';
  let selected = value;
  let items = [];
  let active = -1;

  const describe = (it) => kind === 'member'
    ? { t: it.full_name, s: [`Mã ${it.member_id}`, it.mobile_no, it.account_status && it.account_status !== 'active' ? accountLabel(it.account_status) : null].filter(Boolean).join(', ') }
    : { t: it.book_title, s: [it.authors, `còn ${it.copies_available}/${it.copies_total} bản`].filter(Boolean).join(', ') };

  function renderSelected() {
    const d = describe(selected);
    setHTML(wrap, html`<div class="picked">
      <div class="grow"><div class="t">${d.t}</div><div class="s">${d.s}</div></div>
      <button type="button" class="btn btn-ghost btn-sm" data-change>Đổi</button></div>`);
    wrap.querySelector('[data-change]').addEventListener('click', () => {
      selected = null; onChange(null); renderInput(true);
    });
  }

  function renderInput(focus) {
    setHTML(wrap, html`<input class="input" type="search" autocomplete="off" role="combobox" aria-expanded="false"
      placeholder="${placeholder || (kind === 'member' ? 'Tên, số điện thoại, email hoặc mã độc giả' : 'Tên sách, ISBN, tác giả hoặc mã sách')}">`);
    const input = wrap.querySelector('input');
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.hidden = true;
    pop.setAttribute('role', 'listbox');
    wrap.append(pop);

    const show = () => {
      active = items.length ? 0 : -1;
      input.setAttribute('aria-expanded', 'true');
      pop.hidden = false;
      setHTML(pop, items.length
        ? items.map((it, i) => {
            const d = describe(it);
            return html`<button type="button" class="option" role="option" data-i="${i}" aria-selected="${i === active}">
              <span class="option-main"><span class="option-title">${d.t}</span><span class="option-sub">${d.s}</span></span></button>`;
          })
        : html`<div class="popover-empty">Không tìm thấy kết quả phù hợp.</div>`);
    };
    const hide = () => { pop.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const choose = (it) => { selected = it; onChange(it); renderSelected(); };

    const search = debounce(async () => {
      const q = input.value.trim();
      if (!q) { items = []; hide(); return; }
      try {
        const res = await api.get('/api/search', { q });
        items = kind === 'member' ? res.members : res.books;
        show();
      } catch (e) { toast(e.message, 'error'); }
    });
    input.addEventListener('input', search);
    input.addEventListener('keydown', (e) => {
      if (pop.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        $$('.option', pop).forEach((o, i) => o.setAttribute('aria-selected', i === active));
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault(); choose(items[active]);
      } else if (e.key === 'Escape') { e.stopPropagation(); hide(); }
    });
    pop.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.option');
      if (btn) { e.preventDefault(); choose(items[+btn.dataset.i]); }
    });
    input.addEventListener('blur', () => setTimeout(hide, 120));
    if (focus) setTimeout(() => input.focus(), 30);
  }

  if (selected) renderSelected(); else renderInput(autofocus);
  return wrap;
}
