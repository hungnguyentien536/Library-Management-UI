import { api } from '../api.js';
import { html, setHTML, icon, $, $$, fmtDate, money, accountChip, typeLabel, empty, loading, debounce } from '../ui.js';
import { rules } from '../state.js';
import { memberFormDialog } from '../dialogs.js';

export async function render(root, { query }) {
  const f = { q: query.q || '', status: query.status || '', debt: query.debt || '', overdue: query.overdue || '' };

  setHTML(root, html`
    <div class="page-head">
      <div><h1>Độc giả</h1><p class="lead" data-lead>Theo dõi tài khoản, thời hạn thẻ, sách đang mượn và công nợ phạt.</p></div>
      <div class="actions"><button class="btn btn-primary" data-new>${icon('plus')}Thêm độc giả</button></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <input class="input grow" type="search" data-f="q" value="${f.q}" placeholder="Tìm theo tên, số điện thoại, email hoặc mã" aria-label="Tìm độc giả">
        <div class="segmented" role="group" aria-label="Trạng thái tài khoản">
          ${[['', 'Tất cả'], ['active', 'Hoạt động'], ['suspended', 'Bị khóa'], ['expired', 'Hết hạn']].map(([v, l]) =>
            html`<button type="button" data-status="${v}" aria-pressed="${f.status === v}">${l}</button>`)}
        </div>
        <label class="checkbox"><input type="checkbox" data-f="debt" ${f.debt ? 'checked' : ''}>Còn nợ phạt</label>
        <label class="checkbox"><input type="checkbox" data-f="overdue" ${f.overdue ? 'checked' : ''}>Giữ sách quá hạn</label>
      </div>
      <div data-table>${loading(8)}</div>
    </section>`);

  $('[data-new]', root).addEventListener('click', () => memberFormDialog(null, (id) => { location.hash = `#/members/${id}`; }));

  async function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    history.replaceState(null, '', `#/members${[...qs].length ? '?' + qs : ''}`);
    const rows = await api.get('/api/members', f);
    $('[data-lead]', root).textContent = `${rows.length} độc giả. Bấm vào một dòng để mở hồ sơ.`;
    setHTML($('[data-table]', root), rows.length ? html`
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Độc giả</th><th class="hide-sm">Điện thoại</th><th class="hide-sm">Loại</th><th>Tài khoản</th>
          <th>Thẻ hết hạn</th><th>Đang mượn</th><th class="right">Nợ phạt</th></tr></thead>
        <tbody>${rows.map((m) => html`<tr data-href="#/members/${m.member_id}">
          <td><div class="title">${m.full_name}</div><div class="sub">Mã ${m.member_id}${m.email_id ? ', ' + m.email_id : ''}</div></td>
          <td class="num hide-sm">${m.mobile_no || '—'}</td>
          <td class="hide-sm">${typeLabel(m.account_type)}</td>
          <td>${accountChip(m.account_status)}</td>
          <td class="num">${m.card_expired ? html`<span style="color:var(--late)">${fmtDate(m.membership_end_date)}</span>` : fmtDate(m.membership_end_date)}</td>
          <td><span class="num">${m.active_loans}/${rules().maxLoans}</span>
            ${m.overdue_loans ? html` <span class="chip late plain">${m.overdue_loans} quá hạn</span>` : ''}</td>
          <td class="right">${m.balance > 0 ? html`<span class="money late">${money(m.balance)}</span>` : html`<span class="muted">—</span>`}</td>
        </tr>`)}</tbody></table></div>`
      : empty('Không có độc giả nào khớp bộ lọc', 'Thử bỏ bớt điều kiện lọc.', 'search'));
  }

  const reload = debounce(load, 200);
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.f;
    if (!k) return;
    f[k] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value;
    reload();
  });
  root.addEventListener('click', (e) => {
    const seg = e.target.closest('[data-status]');
    if (seg) {
      f.status = seg.dataset.status;
      $$('[data-status]', root).forEach((b) => b.setAttribute('aria-pressed', b === seg));
      load();
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
  });

  await load();
  return load;
}
