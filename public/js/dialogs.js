// Các hộp thoại nghiệp vụ dùng ở nhiều màn hình:
// cho mượn, nhận trả (phiếu hạn trả + con dấu), báo mất, thu tiền phạt,
// đặt sách, và biểu mẫu sách / độc giả.
import { api } from './api.js';
import {
  html, setHTML, icon, $, openModal, toast, money, fmtDate, addDays, formData, createPicker, busy, typeLabel,
} from './ui.js';
import { store, today, rules, isAdmin, refreshAll, loadLookups } from './state.js';

const showError = (dlg, message) => {
  const box = $('[data-error]', dlg);
  box.textContent = message;
  box.hidden = !message;
};

/* ===================== Cho mượn ===================== */
export function issueDialog({ member = null, book = null } = {}) {
  let m = member;
  let b = book;
  openModal({
    title: 'Cho mượn sách',
    body: html`
      <div class="field"><span class="label">Độc giả</span><div data-member></div></div>
      <div class="field"><span class="label">Sách</span><div data-book></div></div>
      <div class="form-grid">
        <div class="field">
          <label for="issue-days">Thời hạn mượn</label>
          <select class="input" id="issue-days">
            ${[7, 14, 21, 30].map((d) => html`<option value="${d}" ${d === rules().loanDays ? 'selected' : ''}>${d} ngày</option>`)}
          </select>
        </div>
        <div class="field"><span class="label">Hạn trả</span><input class="input" data-due readonly></div>
      </div>
      <ul class="check-list" data-checks></ul>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit disabled>${icon('check')}Cho mượn</button>`,
    onMount(dlg, close) {
      const daysSel = $('#issue-days', dlg);
      const submit = $('[data-submit]', dlg);
      const updateDue = () => { $('[data-due]', dlg).value = fmtDate(addDays(today(), +daysSel.value)); };
      updateDue();
      daysSel.addEventListener('change', updateDue);

      // Kiểm tra sớm trên máy chủ để hiện lý do trước khi bấm (trigger vẫn là chốt chặn cuối)
      const check = async () => {
        const list = $('[data-checks]', dlg);
        showError(dlg, '');
        if (!m && !b) { setHTML(list, ''); submit.disabled = true; return; }
        const r = await api.get('/api/loans/check', { member_id: m?.member_id, book_id: b?.book_id });
        const items = [
          ...r.problems.map((p) => html`<li class="bad">${icon('x')}<span>${p}</span></li>`),
          ...r.warnings.map((w) => html`<li class="warn">${icon('alert')}<span>${w}</span></li>`),
        ];
        if (r.member && !r.problems.length) {
          items.push(html`<li class="good">${icon('check')}<span>Đang mượn ${r.member.active_loans}/${rules().maxLoans} cuốn, tài khoản hoạt động.</span></li>`);
        }
        if (r.book && r.book.copies_available > 0) {
          items.push(html`<li class="good">${icon('check')}<span>Còn ${r.book.copies_available}/${r.book.copies_total} bản trên kệ.</span></li>`);
        }
        setHTML(list, items);
        submit.disabled = !(m && b && r.ok);
      };

      $('[data-member]', dlg).append(createPicker({ kind: 'member', value: m, autofocus: !m, onChange: (x) => { m = x; check(); } }));
      $('[data-book]', dlg).append(createPicker({ kind: 'book', value: b, autofocus: !!m && !b, onChange: (x) => { b = x; check(); } }));
      check();

      submit.addEventListener('click', () => busy(submit, async () => {
        try {
          const loan = await api.post('/api/loans', { member_id: m.member_id, book_id: b.book_id, days: +daysSel.value });
          toast(`Đã cho mượn “${loan.book_title}”. Hạn trả ${fmtDate(loan.due_date)}.`);
          close();
          refreshAll();
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Nhận trả: phiếu hạn trả + con dấu ===================== */
export function returnDialog(loan) {
  const late = Math.max(0, loan.days_late || 0);
  const fine = late * rules().finePerDay;
  openModal({
    title: 'Nhận trả sách',
    body: html`
      <div class="slip" data-slip>
        <div class="slip-title">PHIẾU MƯỢN SỐ ${loan.issue_id}</div>
        <dl>
          <div class="slip-row"><dt>Sách</dt><dd>${loan.book_title}</dd></div>
          <div class="slip-row"><dt>Độc giả</dt><dd>${loan.member_name}</dd></div>
          <div class="slip-row"><dt>Ngày mượn</dt><dd>${fmtDate(loan.issue_date)}</dd></div>
          <div class="slip-row"><dt>Hạn trả</dt><dd>${fmtDate(loan.due_date)}</dd></div>
          <div class="slip-row"><dt>Ngày trả</dt><dd>${fmtDate(today())}</dd></div>
        </dl>
      </div>
      <div data-result>
        ${late > 0
          ? html`<div class="fine-calc"><span>${late} ngày trễ × ${money(rules().finePerDay)} =</span>
              <span class="fine-total late">${money(fine)}</span></div>
              <p class="muted small">Khoản phạt sẽ được lập tự động khi xác nhận nhận trả.</p>`
          : html`<p class="muted">Trả trong hạn, không phát sinh tiền phạt.</p>`}
      </div>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit>${icon('return')}Nhận trả sách</button>`,
    onMount(dlg, close) {
      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        try {
          const r = await api.post(`/api/loans/${loan.issue_id}/return`);
          const isLate = r.days_late > 0;
          // Đóng dấu lên phiếu: hiệu ứng duy nhất của giao diện, đáp lại thao tác xác nhận
          const stamp = document.createElement('div');
          stamp.className = `stamp thump ${isLate ? 'late' : 'ok'}`;
          setHTML(stamp, isLate
            ? html`Trả muộn<small>${r.days_late} ngày, ${money(r.fine_amount)}</small>`
            : html`Đã trả<small>${fmtDate(today())}</small>`);
          $('[data-slip]', dlg).append(stamp);
          setHTML($('[data-result]', dlg), html`
            ${isLate ? html`<p>Đã lập khoản phạt <b class="money late">${money(r.fine_amount)}</b> cho ${loan.member_name}.</p>`
                     : html`<p>Sách đã về kho.</p>`}
            ${r.notified ? html`<p class="small" style="margin-top:6px">${icon('info', 'small')}
              ${r.notified.member_name}${r.notified.mobile_no ? ` (${r.notified.mobile_no})` : ''} đang chờ cuốn này. Yêu cầu đặt sách đã chuyển sang “Có sách”.</p>` : ''}`);
          setHTML($('.modal-foot', dlg), html`<button class="btn btn-primary" data-close>Xong</button>`);
          refreshAll();
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Báo mất sách ===================== */
export function lostDialog(loan) {
  openModal({
    title: 'Báo mất sách',
    body: html`
      <p>Phiếu số ${loan.issue_id}: <b>${loan.book_title}</b>, độc giả ${loan.member_name}.</p>
      <div class="field">
        <label for="lost-amount">Tiền bồi thường (VND)</label>
        <input class="input" id="lost-amount" type="number" min="1000" step="1000" value="80000" required>
        <span class="hint">Bản sách mất sẽ không được cộng lại vào số bản sẵn có.</span>
      </div>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-danger" data-submit>Ghi nhận mất sách</button>`,
    onMount(dlg, close) {
      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        try {
          const amount = Number($('#lost-amount', dlg).value);
          await api.post(`/api/loans/${loan.issue_id}/lost`, { amount });
          toast(`Đã ghi nhận mất sách và lập khoản bồi thường ${money(amount)}.`);
          close();
          refreshAll();
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Thu tiền phạt ===================== */
export function payDialog(member) {
  const name = member.full_name || member.member_name;
  openModal({
    title: 'Thu tiền phạt',
    body: html`
      <p>${name} đang nợ <b class="money late">${money(member.balance)}</b>.</p>
      <div class="form-grid">
        <div class="field">
          <label for="pay-amount">Số tiền nộp (VND)</label>
          <input class="input" id="pay-amount" type="number" min="1" step="1000" max="${member.balance}" value="${member.balance}">
        </div>
        <div class="field">
          <label for="pay-date">Ngày nộp</label>
          <input class="input" id="pay-date" type="date" value="${today()}" max="${today()}">
        </div>
      </div>
      <p class="muted small" data-after></p>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit>${icon('check')}Ghi nhận đã thu</button>`,
    onMount(dlg, close) {
      const amount = $('#pay-amount', dlg);
      const after = () => {
        const rest = member.balance - Number(amount.value || 0);
        $('[data-after]', dlg).textContent = rest > 0 ? `Sau lần nộp này còn nợ ${money(rest)}.` : rest === 0 ? 'Sau lần nộp này hết nợ.' : 'Số tiền vượt quá số còn nợ.';
      };
      amount.addEventListener('input', after);
      after();
      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        try {
          const r = await api.post('/api/fines/payments', {
            member_id: member.member_id, amount: Number(amount.value), payment_date: $('#pay-date', dlg).value,
          });
          toast(r.balance_after > 0 ? `Đã thu tiền. Còn nợ ${money(r.balance_after)}.` : 'Đã thu tiền. Độc giả đã hết nợ phạt.');
          close();
          refreshAll();
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Đặt sách ===================== */
export function requestDialog({ member = null, book = null } = {}) {
  let m = member;
  let b = book;
  openModal({
    title: 'Tạo yêu cầu đặt sách',
    body: html`
      <div class="field"><span class="label">Độc giả</span><div data-member></div></div>
      <div class="field"><span class="label">Sách muốn đặt</span><div data-book></div></div>
      <p class="muted small">Nếu sách còn bản, yêu cầu chuyển ngay sang “Có sách”. Nếu hết, độc giả vào hàng chờ và ngày dự kiến là hạn trả sớm nhất của các bản đang mượn.</p>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit>${icon('bookmark')}Tạo yêu cầu</button>`,
    onMount(dlg, close) {
      $('[data-member]', dlg).append(createPicker({ kind: 'member', value: m, autofocus: !m, onChange: (x) => { m = x; } }));
      $('[data-book]', dlg).append(createPicker({ kind: 'book', value: b, autofocus: !!m && !b, onChange: (x) => { b = x; } }));
      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        if (!m || !b) return showError(dlg, 'Chọn độc giả và sách trước.');
        try {
          const r = await api.post('/api/requests', { member_id: m.member_id, book_id: b.book_id });
          toast(r.status === 'available'
            ? `Sách đang có sẵn. Yêu cầu của ${r.member_name} đã chuyển sang “Có sách”.`
            : `Đã xếp ${r.member_name} vào hàng chờ${r.nearest_available_date ? `, dự kiến có sách ${fmtDate(r.nearest_available_date)}` : ''}.`);
          close();
          refreshAll();
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Biểu mẫu sách (Thủ thư trưởng) ===================== */
export function bookFormDialog(book = null, onSaved = () => {}) {
  if (!isAdmin()) return toast('Chỉ Thủ thư trưởng mới được sửa danh mục sách.', 'error');
  const L = store.lookups;
  let authorIds = book ? book.authors.map((a) => a.author_id) : [];
  const opt = (list, idKey, label, current) => list.map((x) =>
    html`<option value="${x[idKey]}" ${x[idKey] === current ? 'selected' : ''}>${label(x)}</option>`);

  openModal({
    title: book ? 'Sửa thông tin sách' : 'Thêm sách mới',
    wide: true,
    body: html`
      <form class="form-grid" id="book-form" novalidate>
        <div class="field span-2"><label for="bf-title">Tên sách</label>
          <input class="input" id="bf-title" name="book_title" required value="${book?.book_title || ''}"></div>
        <div class="field"><label for="bf-isbn">Mã ISBN</label>
          <input class="input" id="bf-isbn" name="isbn_code" maxlength="20" value="${book?.isbn_code || ''}"></div>
        <div class="field"><label for="bf-copies">Tổng số bản</label>
          <input class="input" id="bf-copies" name="copies_total" type="number" min="0" required value="${book?.copies_total ?? 1}">
          ${book ? html`<span class="hint">Đang cho mượn ${book.copies_total - book.copies_available} bản; không giảm thấp hơn số này.</span>` : ''}</div>
        <div class="field"><label for="bf-cat">Thể loại</label>
          <select class="input" id="bf-cat" name="category_id" required>${opt(L.categories, 'category_id', (c) => c.category_name, book?.category_id)}</select></div>
        <div class="field"><label for="bf-pub">Nhà xuất bản</label>
          <select class="input" id="bf-pub" name="publisher_id" required>${opt(L.publishers, 'publisher_id', (p) => p.publisher_name, book?.publisher_id)}</select></div>
        <div class="field"><label for="bf-year">Năm xuất bản</label>
          <input class="input" id="bf-year" name="publication_year" type="number" min="1000" max="2100" value="${book?.publication_year || ''}"></div>
        <div class="field"><label for="bf-ed">Lần xuất bản</label>
          <input class="input" id="bf-ed" name="book_edition" value="${book?.book_edition || ''}" placeholder="Tái bản 2024, 3rd edition…"></div>
        <div class="field"><label for="bf-lang">Ngôn ngữ</label>
          <input class="input" id="bf-lang" name="book_language" list="langs" value="${book?.book_language || 'Tiếng Việt'}">
          <datalist id="langs"><option>Tiếng Việt</option><option>Tiếng Anh</option></datalist></div>
        <div class="field"><label for="bf-type">Loại ấn phẩm</label>
          <input class="input" id="bf-type" name="publication_type" value="${book?.publication_type || 'Sách in'}"></div>
        <div class="field span-2"><label for="bf-loc">Vị trí trên kệ</label>
          <select class="input" id="bf-loc" name="location_id"><option value="">Chưa xếp kệ</option>
            ${opt(L.locations, 'location_id', (l) => `Tầng ${l.floor_no}, kệ ${l.shelf_no}${l.shelf_name ? ' (' + l.shelf_name + ')' : ''}`, book?.location_id)}</select></div>
        <div class="field span-2"><span class="label">Tác giả</span>
          <div class="tags" data-tags></div>
          <div style="display:flex;gap:8px">
            <select class="input" data-author-select><option value="">Chọn tác giả để thêm…</option></select>
            <button type="button" class="btn" data-new-author>${icon('plus')}Tác giả mới</button>
          </div>
          <div data-new-author-form hidden style="display:flex;gap:8px;margin-top:4px">
            <input class="input" placeholder="Họ và tên đệm" data-na-last>
            <input class="input" placeholder="Tên" data-na-first>
            <button type="button" class="btn" data-na-save>Lưu</button>
          </div>
        </div>
      </form>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit>${book ? 'Lưu thay đổi' : 'Thêm sách'}</button>`,
    onMount(dlg, close) {
      const renderAuthors = () => {
        const all = store.lookups.authors;
        setHTML($('[data-tags]', dlg), authorIds.length
          ? authorIds.map((id) => {
              const a = all.find((x) => x.author_id === id);
              return html`<span class="tag">${a ? a.full_name : id}<button type="button" data-remove="${id}" aria-label="Bỏ tác giả">${icon('x')}</button></span>`;
            })
          : html`<span class="muted small">Chưa chọn tác giả.</span>`);
        setHTML($('[data-author-select]', dlg), html`<option value="">Chọn tác giả để thêm…</option>
          ${all.filter((a) => !authorIds.includes(a.author_id)).map((a) => html`<option value="${a.author_id}">${a.full_name}</option>`)}`);
      };
      renderAuthors();
      $('[data-author-select]', dlg).addEventListener('change', (e) => {
        if (e.target.value) { authorIds.push(+e.target.value); renderAuthors(); }
      });
      $('[data-tags]', dlg).addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (btn) { authorIds = authorIds.filter((id) => id !== +btn.dataset.remove); renderAuthors(); }
      });
      $('[data-new-author]', dlg).addEventListener('click', () => {
        const f = $('[data-new-author-form]', dlg);
        f.hidden = !f.hidden;
        if (!f.hidden) $('[data-na-last]', dlg).focus();
      });
      $('[data-na-save]', dlg).addEventListener('click', async () => {
        try {
          const a = await api.post('/api/lookups/authors', {
            last_name: $('[data-na-last]', dlg).value, first_name: $('[data-na-first]', dlg).value,
          });
          await loadLookups();
          authorIds.push(a.author_id);
          $('[data-new-author-form]', dlg).hidden = true;
          $('[data-na-last]', dlg).value = '';
          $('[data-na-first]', dlg).value = '';
          renderAuthors();
        } catch (e) { showError(dlg, e.message); }
      });

      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        const body = { ...formData($('#book-form', dlg)), author_ids: authorIds };
        try {
          const r = book ? await api.put(`/api/books/${book.book_id}`, body) : await api.post('/api/books', body);
          toast(book ? 'Đã lưu thông tin sách.' : 'Đã thêm sách vào danh mục.');
          close();
          refreshAll();
          onSaved(book ? book.book_id : r.book_id);
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}

/* ===================== Biểu mẫu độc giả ===================== */
export function memberFormDialog(member = null, onSaved = () => {}) {
  const t = today();
  openModal({
    title: member ? 'Sửa hồ sơ độc giả' : 'Thêm độc giả',
    wide: true,
    body: html`
      <form class="form-grid" id="member-form" novalidate>
        <div class="field"><label for="mf-last">Họ và tên đệm</label>
          <input class="input" id="mf-last" name="last_name" required value="${member?.last_name || ''}" placeholder="Nguyễn Văn"></div>
        <div class="field"><label for="mf-first">Tên</label>
          <input class="input" id="mf-first" name="first_name" required value="${member?.first_name || ''}" placeholder="An"></div>
        <div class="field"><label for="mf-phone">Số điện thoại</label>
          <input class="input" id="mf-phone" name="mobile_no" type="tel" value="${member?.mobile_no || ''}"></div>
        <div class="field"><label for="mf-email">Email</label>
          <input class="input" id="mf-email" name="email_id" type="email" value="${member?.email_id || ''}"></div>
        <div class="field"><label for="mf-city">Thành phố</label>
          <input class="input" id="mf-city" name="city" value="${member?.city || ''}"></div>
        <div class="field"><label for="mf-dob">Ngày sinh</label>
          <input class="input" id="mf-dob" name="date_of_birth" type="date" value="${member?.date_of_birth || ''}"></div>
        <div class="field"><label for="mf-type">Loại tài khoản</label>
          <select class="input" id="mf-type" name="account_type">
            ${['standard', 'premium'].map((x) => html`<option value="${x}" ${member?.account_type === x ? 'selected' : ''}>${typeLabel(x)}</option>`)}
          </select></div>
        <div class="field"><label for="mf-status">Trạng thái</label>
          <select class="input" id="mf-status" name="account_status">
            ${[['active', 'Hoạt động'], ['suspended', 'Bị khóa'], ['expired', 'Hết hạn']].map(([v, l]) =>
              html`<option value="${v}" ${(member?.account_status || 'active') === v ? 'selected' : ''}>${l}</option>`)}
          </select></div>
        <div class="field"><label for="mf-start">Ngày cấp thẻ</label>
          <input class="input" id="mf-start" name="membership_start_date" type="date" required value="${member?.membership_start_date || t}"></div>
        <div class="field"><label for="mf-end">Ngày hết hạn thẻ</label>
          <input class="input" id="mf-end" name="membership_end_date" type="date" value="${member?.membership_end_date || addDays(t, 364)}"></div>
      </form>
      <div class="form-error" data-error hidden></div>`,
    footer: html`<button class="btn" data-close>Thôi</button>
      <button class="btn btn-primary" data-submit>${member ? 'Lưu thay đổi' : 'Thêm độc giả'}</button>`,
    onMount(dlg, close) {
      const submit = $('[data-submit]', dlg);
      submit.addEventListener('click', () => busy(submit, async () => {
        const body = formData($('#member-form', dlg));
        try {
          const r = member ? await api.put(`/api/members/${member.member_id}`, body) : await api.post('/api/members', body);
          toast(member ? 'Đã lưu hồ sơ độc giả.' : 'Đã thêm độc giả.');
          close();
          refreshAll();
          onSaved(member ? member.member_id : r.member_id);
        } catch (e) { showError(dlg, e.message); }
      }));
    },
  });
}
