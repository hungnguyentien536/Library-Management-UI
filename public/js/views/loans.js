import { api } from '../api.js';
import { html, setHTML, icon, $, $$, fmtDate, money, loanChip, empty, loading, debounce } from '../ui.js';
import { issueDialog, returnDialog, lostDialog } from '../dialogs.js';

const TABS = [
  ['open', 'Đang mượn'],
  ['overdue', 'Quá hạn'],
  ['returned', 'Đã trả'],
  ['lost', 'Báo mất'],
  ['all', 'Tất cả'],
];

export async function render(root, { query }) {
  const f = { state: TABS.some(([k]) => k === query.state) ? query.state : 'open', q: query.q || '' };

  setHTML(root, html`
    <div class="page-head">
      <div><h1>Mượn & trả</h1><p class="lead">Lập phiếu mượn, nhận trả và tính phạt tự động khi trả muộn.</p></div>
      <div class="actions"><button class="btn btn-primary" data-new>${icon('plus')}Cho mượn</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Lọc phiếu">
          ${TABS.map(([k, l]) => html`<button type="button" data-tab="${k}" aria-pressed="${f.state === k}">${l}</button>`)}
        </div>
        <input class="input grow" type="search" data-q value="${f.q}" placeholder="Tên sách, tên độc giả, số phiếu" aria-label="Tìm phiếu">
        <span class="count-note" data-count></span>
      </div>
      <div data-table>${loading(8)}</div>
    </section>`);

  $('[data-new]', root).addEventListener('click', () => issueDialog());

  let rows = [];
  async function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'state' && v === 'open')));
    history.replaceState(null, '', `#/loans${[...qs].length ? '?' + qs : ''}`);
    rows = await api.get('/api/loans', f);
    $('[data-count]', root).textContent = `${rows.length} phiếu`;
    const showActions = ['open', 'overdue', 'all'].includes(f.state);
    setHTML($('[data-table]', root), rows.length ? html`
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Phiếu</th><th>Sách</th><th>Độc giả</th><th class="hide-sm">Ngày mượn</th><th>Hạn trả</th>
          ${f.state === 'returned' || f.state === 'all' ? html`<th>Ngày trả</th>` : ''}
          <th>Trạng thái</th><th class="right">Phạt</th>${showActions ? html`<th></th>` : ''}</tr></thead>
        <tbody>${rows.map((l) => {
          const fine = l.fine_total || l.fine_preview;
          const canAct = l.state === 'issued' || l.state === 'overdue';
          return html`<tr>
            <td class="num muted">${l.issue_id}</td>
            <td><a class="title" href="#/books/${l.book_id}">${l.book_title}</a></td>
            <td><a href="#/members/${l.member_id}">${l.member_name}</a><div class="sub">${l.mobile_no || ''}</div></td>
            <td class="num hide-sm">${fmtDate(l.issue_date)}</td>
            <td class="num">${fmtDate(l.due_date)}</td>
            ${f.state === 'returned' || f.state === 'all' ? html`<td class="num">${fmtDate(l.return_date)}</td>` : ''}
            <td>${loanChip(l)}</td>
            <td class="right">${fine
              ? html`<span class="money late">${money(fine)}</span>${l.fine_total ? '' : html`<div class="sub">tạm tính</div>`}`
              : html`<span class="muted">—</span>`}</td>
            ${showActions ? html`<td class="actions-cell">${canAct ? html`
              <button class="btn btn-sm btn-ghost" data-lost="${l.issue_id}">Báo mất</button>
              <button class="btn btn-sm" data-return="${l.issue_id}">Nhận trả</button>` : ''}</td>` : ''}
          </tr>`;
        })}</tbody></table></div>`
      : empty(f.state === 'overdue' ? 'Không có phiếu quá hạn' : 'Không có phiếu nào', f.q ? 'Thử đổi từ khóa tìm kiếm.' : '', f.state === 'overdue' ? 'check' : 'inbox'));
  }

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      f.state = tab.dataset.tab;
      $$('[data-tab]', root).forEach((b) => b.setAttribute('aria-pressed', b === tab));
      return load();
    }
    const ret = e.target.closest('[data-return]');
    if (ret) return returnDialog(rows.find((l) => l.issue_id === +ret.dataset.return));
    const lost = e.target.closest('[data-lost]');
    if (lost) return lostDialog(rows.find((l) => l.issue_id === +lost.dataset.lost));
  });
  $('[data-q]', root).addEventListener('input', debounce((e) => { f.q = e.target.value; load(); }, 200));

  await load();
  return load;
}
