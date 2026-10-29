import { api } from '../api.js';
import { html, setHTML, icon, $, money, fmtDate, loanChip, requestChip, empty, loading } from '../ui.js';
import { store } from '../state.js';
import { issueDialog, returnDialog, payDialog } from '../dialogs.js';

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

export async function render(root) {
  const firstName = store.user.staff_name.split(' ').at(-1);
  setHTML(root, html`
    <div class="page-head">
      <div><h1>${greeting()}, ${firstName}</h1><p class="lead" data-lead>Đang tải tình hình thư viện…</p></div>
      <div class="actions">
        <a class="btn" href="#/loans">${icon('return')}Nhận trả</a>
        <button class="btn btn-primary" data-issue>${icon('plus')}Cho mượn</button>
      </div>
    </div>
    <div data-body>${loading(6)}</div>`);
  $('[data-issue]', root).addEventListener('click', () => issueDialog());

  let data;
  async function load() {
    data = await api.get('/api/dashboard');
    const s = data.stats;
    $('[data-lead]', root).textContent = s.overdue
      ? `Có ${s.overdue} phiếu đã quá hạn trả và ${s.open_requests} yêu cầu đặt sách đang mở.`
      : `Không có phiếu nào quá hạn. ${s.open_requests} yêu cầu đặt sách đang mở.`;

    setHTML($('[data-body]', root), html`
      <section class="statstrip" aria-label="Số liệu chính">
        <a class="stat" href="#/books"><div class="stat-value num">${s.titles}</div><div class="stat-label">Đầu sách</div><div class="stat-note">${s.copies_total} bản trong kho</div></a>
        <a class="stat" href="#/books?available=1"><div class="stat-value num">${s.copies_available}</div><div class="stat-label">Bản đang trên kệ</div><div class="stat-note">${s.copies_total - s.copies_available} bản đang ở ngoài</div></a>
        <a class="stat" href="#/loans"><div class="stat-value num">${s.active_loans}</div><div class="stat-label">Phiếu đang mượn</div><div class="stat-note">${s.members} độc giả</div></a>
        <a class="stat ${s.overdue ? 'is-late' : ''}" href="#/loans?state=overdue"><div class="stat-value num">${s.overdue}</div><div class="stat-label">Quá hạn chưa trả</div><div class="stat-note">cần nhắc độc giả</div></a>
        <a class="stat ${s.outstanding ? 'is-late' : ''}" href="#/fines"><div class="stat-value num">${money(s.outstanding)}</div><div class="stat-label">Nợ phạt chưa thu</div><div class="stat-note">${data.debtors.length} độc giả còn nợ</div></a>
      </section>

      <div class="grid-main">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Quá hạn cần nhắc</h2><span class="sub">Phạt tạm tính đến hôm nay</span>
              <div class="actions"><a class="btn btn-sm btn-ghost" href="#/loans?state=overdue">Xem tất cả</a></div></div>
            ${data.overdue.length ? html`<div class="table-wrap"><table class="data">
              <thead><tr><th>Độc giả</th><th>Sách</th><th>Hạn trả</th><th class="right">Phạt tạm tính</th><th></th></tr></thead>
              <tbody>${data.overdue.map((o) => html`<tr>
                <td><a class="title" href="#/members/${o.member_id}">${o.member_name}</a><div class="sub">${o.mobile_no || ''}</div></td>
                <td>${o.book_title}</td>
                <td><span class="num">${fmtDate(o.due_date)}</span><div class="sub" style="color:var(--late)">trễ ${o.days_overdue} ngày</div></td>
                <td class="right"><span class="money late">${money(o.fine_so_far)}</span></td>
                <td class="actions-cell"><button class="btn btn-sm" data-return="${o.issue_id}">Nhận trả</button></td>
              </tr>`)}</tbody></table></div>`
              : empty('Không có sách quá hạn', 'Mọi phiếu đang mượn đều còn trong hạn.', 'check')}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Phiếu mượn gần đây</h2>
              <div class="actions"><a class="btn btn-sm btn-ghost" href="#/loans?state=all">Toàn bộ phiếu</a></div></div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Phiếu</th><th>Sách</th><th>Độc giả</th><th class="hide-sm">Ngày mượn</th><th>Trạng thái</th></tr></thead>
              <tbody>${data.recent.map((l) => html`<tr data-href="#/members/${l.member_id}">
                <td class="num muted">${l.issue_id}</td>
                <td class="title">${l.book_title}</td>
                <td>${l.member_name}</td>
                <td class="num hide-sm">${fmtDate(l.issue_date)}</td>
                <td>${loanChip(l)}</td>
              </tr>`)}</tbody></table></div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Mượn nhiều nhất</h2><span class="sub">Xếp hạng có đồng hạng</span></div>
            <ol class="list">${data.topBooks.map((b) => html`<li>
              <span class="rank ${b.rnk === 1 ? 'first' : ''}">${b.rnk}</span>
              <a class="grow line1" href="#/books/${b.book_id}">${b.book_title}</a>
              <span class="num muted small">${b.loans} lượt</span></li>`)}</ol>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Đặt sách đang mở</h2>
              <div class="actions"><a class="btn btn-sm btn-ghost" href="#/requests">Quản lý</a></div></div>
            ${data.requests.length ? html`<ul class="list">${data.requests.map((r) => html`<li>
              <div class="grow"><div class="line1">${r.book_title}</div>
                <div class="line2">${r.member_name}, yêu cầu ngày ${fmtDate(r.request_date)}</div></div>
              ${requestChip(r.status)}</li>`)}</ul>`
              : empty('Không có yêu cầu nào đang chờ')}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Còn nợ phạt</h2>
              <div class="actions"><a class="btn btn-sm btn-ghost" href="#/fines">Tiền phạt</a></div></div>
            ${data.debtors.length ? html`<ul class="list">${data.debtors.map((d) => html`<li>
              <a class="grow line1" href="#/members/${d.member_id}">${d.member_name}</a>
              <span class="money late">${money(d.balance)}</span>
              <button class="btn btn-sm" data-pay="${d.member_id}">Thu tiền</button></li>`)}</ul>`
              : empty('Không ai còn nợ phạt', '', 'check')}
          </section>
        </div>
      </div>`);
  }

  root.addEventListener('click', async (e) => {
    const ret = e.target.closest('[data-return]');
    if (ret) {
      const { loan } = await api.get(`/api/loans`, { state: 'overdue', q: ret.dataset.return })
        .then((rows) => ({ loan: rows.find((r) => r.issue_id === +ret.dataset.return) }));
      if (loan) returnDialog(loan);
      return;
    }
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const d = data.debtors.find((x) => x.member_id === +pay.dataset.pay);
      payDialog({ member_id: d.member_id, full_name: d.member_name, balance: d.balance });
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
  });

  await load();
  return load;
}
