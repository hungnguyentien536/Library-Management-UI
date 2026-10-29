import { api } from '../api.js';
import { html, setHTML, icon, $, $$, fmtDate, requestChip, empty, loading, toast, confirmDialog, debounce } from '../ui.js';
import { refreshAll } from '../state.js';
import { requestDialog } from '../dialogs.js';

const TABS = [
  ['open', 'Đang mở'],
  ['available', 'Có sách'],
  ['pending', 'Đang chờ'],
  ['fulfilled', 'Đã giao'],
  ['cancelled', 'Đã hủy'],
  ['all', 'Tất cả'],
];

export async function render(root, { query }) {
  const f = { status: TABS.some(([k]) => k === query.status) ? query.status : 'open', q: '' };

  setHTML(root, html`
    <div class="page-head">
      <div><h1>Đặt sách</h1><p class="lead">Hàng chờ cho sách đang hết bản. Khi sách được trả, người chờ lâu nhất được chuyển sang “Có sách”.</p></div>
      <div class="actions"><button class="btn btn-primary" data-new>${icon('plus')}Tạo yêu cầu</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Lọc yêu cầu">
          ${TABS.map(([k, l]) => html`<button type="button" data-tab="${k}" aria-pressed="${f.status === k}">${l}</button>`)}
        </div>
        <input class="input grow" type="search" data-q placeholder="Tên sách hoặc độc giả" aria-label="Tìm yêu cầu">
      </div>
      <div data-table>${loading(6)}</div>
    </section>`);

  $('[data-new]', root).addEventListener('click', () => requestDialog());

  let rows = [];
  async function load() {
    history.replaceState(null, '', `#/requests${f.status !== 'open' ? '?status=' + f.status : ''}`);
    rows = await api.get('/api/requests', f);
    setHTML($('[data-table]', root), rows.length ? html`
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Mã</th><th>Sách</th><th>Độc giả</th><th class="hide-sm">Ngày yêu cầu</th><th>Trạng thái</th><th>Dự kiến có</th><th></th></tr></thead>
        <tbody>${rows.map((r) => {
          const open = r.status === 'pending' || r.status === 'available';
          const canGive = open && r.copies_available > 0;
          return html`<tr>
            <td class="num muted">${r.request_id}</td>
            <td><a class="title" href="#/books/${r.book_id}">${r.book_title}</a>
              <div class="sub">${r.copies_available > 0 ? `còn ${r.copies_available} bản trên kệ` : 'hết bản'}</div></td>
            <td><a href="#/members/${r.member_id}">${r.member_name}</a><div class="sub">${r.mobile_no || ''}</div></td>
            <td class="num hide-sm">${fmtDate(r.request_date)}</td>
            <td>${requestChip(r.status)}${r.status === 'pending' ? html`<div class="sub">${r.queue_ahead ? `${r.queue_ahead} người chờ trước` : 'đứng đầu hàng chờ'}</div>` : ''}</td>
            <td class="num">${r.status === 'pending' ? (r.nearest_available_date ? fmtDate(r.nearest_available_date) : html`<span class="muted">chưa rõ</span>`) : html`<span class="muted">—</span>`}</td>
            <td class="actions-cell">${open ? html`
              <button class="btn btn-sm btn-ghost" data-cancel="${r.request_id}">Hủy</button>
              ${r.status === 'pending' && canGive ? html`<button class="btn btn-sm" data-ready="${r.request_id}">Báo có sách</button>` : ''}
              <button class="btn btn-sm ${canGive ? 'btn-primary' : ''}" data-give="${r.request_id}" ${canGive ? '' : 'disabled title="Sách chưa có bản trên kệ"'}>Giao sách</button>` : ''}
            </td></tr>`;
        })}</tbody></table></div>`
      : empty('Không có yêu cầu nào', 'Tạo yêu cầu khi độc giả muốn giữ chỗ một cuốn đang hết.', 'bookmark'));
  }

  root.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      f.status = tab.dataset.tab;
      $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-pressed', b === tab));
      return load();
    }
    const act = async (fn, okMsg) => {
      try { await fn(); toast(okMsg); refreshAll(); } catch (err) { toast(err.message, 'error'); }
    };
    const give = e.target.closest('[data-give]');
    if (give) {
      const r = rows.find((x) => x.request_id === +give.dataset.give);
      const ok = await confirmDialog({
        title: 'Giao sách cho độc giả?',
        message: `Lập phiếu mượn “${r.book_title}” cho ${r.member_name} với hạn mặc định, rồi đóng yêu cầu này.`,
        confirmText: 'Giao sách',
      });
      if (ok) act(() => api.post(`/api/requests/${r.request_id}/fulfill`), `Đã giao sách và lập phiếu mượn cho ${r.member_name}.`);
      return;
    }
    const ready = e.target.closest('[data-ready]');
    if (ready) return act(() => api.patch(`/api/requests/${ready.dataset.ready}`, { status: 'available' }), 'Đã chuyển yêu cầu sang “Có sách”.');
    const cancel = e.target.closest('[data-cancel]');
    if (cancel) {
      const ok = await confirmDialog({ title: 'Hủy yêu cầu đặt sách?', message: 'Độc giả sẽ rời khỏi hàng chờ.', confirmText: 'Hủy yêu cầu', danger: true });
      if (ok) act(() => api.patch(`/api/requests/${cancel.dataset.cancel}`, { status: 'cancelled' }), 'Đã hủy yêu cầu.');
    }
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { f.q = e.target.value; load(); }, 200));

  await load();
  return load;
}
