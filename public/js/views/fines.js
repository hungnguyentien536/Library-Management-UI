import { api } from '../api.js';
import { html, setHTML, icon, $, fmtDate, money, empty, loading, daysBetween, accountChip } from '../ui.js';
import { today, rules } from '../state.js';
import { payDialog } from '../dialogs.js';

export async function render(root) {
  setHTML(root, html`
    <div class="page-head">
      <div><h1>Tiền phạt</h1><p class="lead">Mỗi ngày trả muộn tính ${money(rules().finePerDay)}. Khoản phạt được lập tự động khi nhận trả sách; công nợ bằng tổng phạt trừ số đã nộp.</p></div>
    </div>

    <div class="grid-2" style="margin-bottom:20px">
      <section class="panel">
        <div class="panel-head"><h2>Tính tiền phạt</h2><span class="sub">Tính thử, không ghi vào database</span></div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="field">
            <label for="calc-loan">Lấy hạn trả từ phiếu đang mượn</label>
            <select class="input" id="calc-loan"><option value="">Tự nhập ngày bên dưới</option></select>
          </div>
          <div class="form-grid">
            <div class="field"><label for="calc-due">Hạn trả</label><input class="input" type="date" id="calc-due"></div>
            <div class="field"><label for="calc-ret">Ngày trả</label><input class="input" type="date" id="calc-ret" value="${today()}"></div>
          </div>
          <div class="fine-calc" data-calc aria-live="polite"></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Độc giả còn nợ</h2><span class="sub" data-debt-sum></span></div>
        <div data-debtors>${loading(4)}</div>
      </section>
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>Các khoản phạt</h2><span class="sub" data-fine-count></span></div>
        <div data-fines>${loading(6)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Lần nộp gần đây</h2></div>
        <div data-payments>${loading(4)}</div>
      </section>
    </div>`);

  /* ---- Máy tính tiền phạt: cùng công thức với sp_return_book ---- */
  const due = $('#calc-due', root);
  const ret = $('#calc-ret', root);
  const loanSel = $('#calc-loan', root);
  const calc = () => {
    const box = $('[data-calc]', root);
    if (!due.value || !ret.value) {
      setHTML(box, html`<span class="muted">Chọn một phiếu hoặc nhập hạn trả để tính.</span>`);
      return;
    }
    const late = Math.max(0, daysBetween(due.value, ret.value));
    setHTML(box, late > 0
      ? html`<span>${late} ngày trễ × ${money(rules().finePerDay)} =</span><span class="fine-total late">${money(late * rules().finePerDay)}</span>`
      : html`<span class="fine-total">0 đ</span><span>trả đúng hoặc trước hạn</span>`);
  };
  [due, ret].forEach((el) => el.addEventListener('input', calc));
  loanSel.addEventListener('change', () => {
    const opt = loanSel.selectedOptions[0];
    if (opt.dataset.due) due.value = opt.dataset.due;
    ret.value = today();
    calc();
  });
  calc();

  let debtors = [];
  async function load() {
    const [d, fines, payments, open] = await Promise.all([
      api.get('/api/fines/balances'),
      api.get('/api/fines'),
      api.get('/api/fines/payments'),
      api.get('/api/loans', { state: 'open' }),
    ]);
    debtors = d;

    setHTML(loanSel, html`<option value="">Tự nhập ngày bên dưới</option>
      ${open.map((l) => html`<option value="${l.issue_id}" data-due="${l.due_date}">Phiếu ${l.issue_id}: ${l.book_title} (${l.member_name}), hạn ${fmtDate(l.due_date)}</option>`)}`);

    $('[data-debt-sum]', root).textContent = d.length ? `Tổng ${money(d.reduce((s, x) => s + x.balance, 0))}` : '';
    setHTML($('[data-debtors]', root), d.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Độc giả</th><th class="right">Đã phạt</th><th class="right">Đã nộp</th><th class="right">Còn nợ</th><th></th></tr></thead>
      <tbody>${d.map((x) => html`<tr>
        <td><a class="title" href="#/members/${x.member_id}">${x.member_name}</a>
          <div class="sub">${x.mobile_no || ''} ${x.account_status !== 'active' ? accountChip(x.account_status) : ''}</div></td>
        <td class="right num">${money(x.total_fine)}</td>
        <td class="right num">${money(x.total_paid)}</td>
        <td class="right"><span class="money late">${money(x.balance)}</span></td>
        <td class="actions-cell"><button class="btn btn-sm btn-primary" data-pay="${x.member_id}">Thu tiền</button></td>
      </tr>`)}</tbody></table></div>`
      : empty('Không ai còn nợ phạt', 'Mọi khoản phạt đã được thanh toán.', 'check'));

    $('[data-fine-count]', root).textContent = `${fines.length} khoản`;
    setHTML($('[data-fines]', root), fines.length ? html`<div class="table-wrap"><table class="data">
      <thead><tr><th>Ngày lập</th><th>Độc giả</th><th>Lý do</th><th class="right">Số tiền</th></tr></thead>
      <tbody>${fines.map((x) => html`<tr>
        <td class="num">${fmtDate(x.fine_date)}</td>
        <td><a href="#/members/${x.member_id}">${x.member_name}</a></td>
        <td><div>${x.book_title}</div><div class="sub">${x.issue_status === 'lost' ? 'Bồi thường mất sách' : `Trả muộn ${x.days_late} ngày`}, phiếu ${x.issue_id}</div></td>
        <td class="right"><span class="money">${money(x.fine_total)}</span></td>
      </tr>`)}</tbody></table></div>`
      : empty('Chưa có khoản phạt nào'));

    setHTML($('[data-payments]', root), payments.length ? html`<ul class="list">${payments.map((p) => html`<li>
      <div class="grow"><a class="line1" href="#/members/${p.member_id}">${p.member_name}</a>
        <div class="line2">Nộp ngày ${fmtDate(p.payment_date)}</div></div>
      <span class="money ok">−${money(p.payment_amount)}</span></li>`)}</ul>`
      : empty('Chưa có lần nộp nào'));
  }

  root.addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const x = debtors.find((d) => d.member_id === +pay.dataset.pay);
      payDialog({ member_id: x.member_id, full_name: x.member_name, balance: x.balance });
    }
  });

  await load();
  return load;
}
