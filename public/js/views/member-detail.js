import { api } from '../api.js';
import { html, setHTML, icon, $, fmtDate, money, loanChip, requestChip, accountChip, typeLabel, empty, loading, daysBetween } from '../ui.js';
import { rules, today } from '../state.js';
import { issueDialog, requestDialog, returnDialog, lostDialog, payDialog, memberFormDialog } from '../dialogs.js';

export async function render(root, { params }) {
  const id = +params[0];
  setHTML(root, loading(8));
  let m;

  async function load() {
    m = await api.get(`/api/members/${id}`);
    const open = m.loans.filter((l) => l.state === 'issued' || l.state === 'overdue');
    const closed = m.loans.filter((l) => l.state === 'returned' || l.state === 'lost');
    const age = m.date_of_birth ? Math.floor(daysBetween(m.date_of_birth, today()) / 365.25) : null;
    const cardDaysLeft = m.membership_end_date ? daysBetween(today(), m.membership_end_date) : null;

    setHTML(root, html`
      <a class="back" href="#/members">${icon('arrowLeft')}Tất cả độc giả</a>
      <div class="page-head">
        <div>
          <h1>${m.full_name}</h1>
          <p class="lead">Mã độc giả ${m.member_id}, tài khoản ${typeLabel(m.account_type)} ${accountChip(m.account_status)}</p>
        </div>
        <div class="actions">
          <button class="btn" data-edit>${icon('edit')}Sửa hồ sơ</button>
          <button class="btn" data-reserve>${icon('bookmark')}Đặt sách</button>
          <button class="btn btn-primary" data-issue>${icon('plus')}Cho mượn</button>
        </div>
      </div>

      <div class="profile">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Hồ sơ</h2></div>
            <div class="panel-body"><dl class="meta">
              <div><dt>Điện thoại</dt><dd class="num">${m.mobile_no || '—'}</dd></div>
              <div><dt>Email</dt><dd>${m.email_id || '—'}</dd></div>
              <div><dt>Thành phố</dt><dd>${m.city || '—'}</dd></div>
              <div><dt>Ngày sinh</dt><dd class="num">${fmtDate(m.date_of_birth)}${age !== null ? ` (${age} tuổi)` : ''}</dd></div>
              <div><dt>Cấp thẻ</dt><dd class="num">${fmtDate(m.membership_start_date)}</dd></div>
              <div><dt>Thẻ hết hạn</dt><dd class="num" style="${m.card_expired ? 'color:var(--late)' : ''}">${fmtDate(m.membership_end_date)}
                ${cardDaysLeft !== null ? html`<div class="small muted">${cardDaysLeft < 0 ? `đã quá ${-cardDaysLeft} ngày` : `còn ${cardDaysLeft} ngày`}</div>` : ''}</dd></div>
            </dl></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Sách đang giữ</h2><span class="sub">${open.length}/${rules().maxLoans} cuốn</span></div>
            ${open.length ? html`<div class="table-wrap"><table class="data">
              <thead><tr><th>Sách</th><th>Ngày mượn</th><th>Hạn trả</th><th>Trạng thái</th><th class="right">Phạt tạm tính</th><th></th></tr></thead>
              <tbody>${open.map((l) => html`<tr>
                <td><a class="title" href="#/books/${l.book_id}">${l.book_title}</a><div class="sub">Phiếu ${l.issue_id}</div></td>
                <td class="num">${fmtDate(l.issue_date)}</td>
                <td class="num">${fmtDate(l.due_date)}</td>
                <td>${loanChip(l)}</td>
                <td class="right">${l.days_late ? html`<span class="money late">${money(l.days_late * rules().finePerDay)}</span>` : html`<span class="muted">—</span>`}</td>
                <td class="actions-cell">
                  <button class="btn btn-sm btn-ghost" data-lost="${l.issue_id}">Báo mất</button>
                  <button class="btn btn-sm" data-return="${l.issue_id}">Nhận trả</button></td>
              </tr>`)}</tbody></table></div>`
              : empty('Không giữ cuốn nào', '', 'check')}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Lịch sử mượn</h2><span class="sub">${closed.length} lượt</span></div>
            ${closed.length ? html`<div class="table-wrap"><table class="data">
              <thead><tr><th>Sách</th><th>Mượn</th><th>Hạn</th><th>Trả</th><th>Kết quả</th></tr></thead>
              <tbody>${closed.map((l) => html`<tr>
                <td><a href="#/books/${l.book_id}">${l.book_title}</a></td>
                <td class="num">${fmtDate(l.issue_date)}</td>
                <td class="num">${fmtDate(l.due_date)}</td>
                <td class="num">${fmtDate(l.return_date)}</td>
                <td>${loanChip(l)}</td></tr>`)}</tbody></table></div>`
              : empty('Chưa có lượt mượn nào đã đóng')}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Yêu cầu đặt sách</h2></div>
            ${m.requests.length ? html`<ul class="list">${m.requests.map((r) => html`<li>
              <div class="grow"><a class="line1" href="#/books/${r.book_id}">${r.book_title}</a>
                <div class="line2">Yêu cầu ${fmtDate(r.request_date)}${r.status === 'pending' && r.nearest_available_date ? `, dự kiến có ${fmtDate(r.nearest_available_date)}` : ''}</div></div>
              ${requestChip(r.status)}</li>`)}</ul>`
              : empty('Chưa đặt sách nào')}
          </section>
        </div>

        <div class="stack">
          <section class="panel balance-box">
            <div class="muted small">Nợ phạt còn lại</div>
            <div class="big num" style="color:${m.balance > 0 ? 'var(--late)' : 'var(--ok)'}">${money(m.balance)}</div>
            <div class="small muted" style="margin:4px 0 14px">Tổng phạt ${money(m.total_fine)}, đã nộp ${money(m.total_paid)}</div>
            <button class="btn btn-primary" style="width:100%" data-pay ${m.balance > 0 ? '' : 'disabled'}>${icon('coins')}Thu tiền phạt</button>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Sổ công nợ</h2></div>
            ${m.ledger.length ? html`<div class="table-wrap"><table class="data ledger">
              <thead><tr><th>Nội dung</th><th class="right">Số tiền</th><th class="right">Còn nợ</th></tr></thead>
              <tbody>${m.ledger.map((e) => html`<tr>
                <td><div class="small">${e.note}</div><div class="sub num">${fmtDate(e.date)}</div></td>
                <td class="right num ${e.kind === 'fine' ? 'plus' : 'minus'}">${e.kind === 'fine' ? '+' : '−'}${money(e.amount)}</td>
                <td class="right num">${money(e.balance)}</td></tr>`)}</tbody></table></div>`
              : empty('Chưa phát sinh tiền phạt', '', 'check')}
          </section>
        </div>
      </div>`);
  }

  const asPickerMember = () => ({ member_id: m.member_id, full_name: m.full_name, mobile_no: m.mobile_no, account_status: m.account_status });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-issue]')) return issueDialog({ member: asPickerMember() });
    if (e.target.closest('[data-reserve]')) return requestDialog({ member: asPickerMember() });
    if (e.target.closest('[data-edit]')) return memberFormDialog(m);
    if (e.target.closest('[data-pay]')) return payDialog(m);
    const ret = e.target.closest('[data-return]');
    if (ret) return returnDialog(m.loans.find((l) => l.issue_id === +ret.dataset.return));
    const lost = e.target.closest('[data-lost]');
    if (lost) return lostDialog(m.loans.find((l) => l.issue_id === +lost.dataset.lost));
  });

  await load();
  return load;
}
