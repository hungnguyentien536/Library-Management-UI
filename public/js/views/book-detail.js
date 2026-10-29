import { api } from '../api.js';
import { html, setHTML, icon, $, fmtDate, money, loanChip, requestChip, empty, loading, confirmDialog, toast } from '../ui.js';
import { isAdmin, refreshAll } from '../state.js';
import { issueDialog, requestDialog, returnDialog, bookFormDialog } from '../dialogs.js';

export async function render(root, { params }) {
  const id = +params[0];
  setHTML(root, loading(8));
  let b;

  async function load() {
    b = await api.get(`/api/books/${id}`);
    const authors = b.authors.map((a) => a.full_name).join(', ');
    const open = b.loans.filter((l) => l.state === 'issued' || l.state === 'overdue');
    const history = b.loans.filter((l) => l.state === 'returned' || l.state === 'lost');

    setHTML(root, html`
      <a class="back" href="#/books">${icon('arrowLeft')}Tất cả sách</a>
      <div class="page-head">
        <div><h1>${b.book_title}</h1><p class="lead">${authors || 'Chưa gán tác giả'}</p></div>
        <div class="actions">
          ${isAdmin() ? html`<button class="btn btn-ghost" data-delete>${icon('trash')}Xóa</button>
            <button class="btn" data-edit>${icon('edit')}Sửa</button>` : ''}
          <button class="btn" data-reserve>${icon('bookmark')}Đặt trước</button>
          <button class="btn btn-primary" data-issue ${b.copies_available > 0 ? '' : 'disabled'}>${icon('plus')}Cho mượn</button>
        </div>
      </div>

      <div class="profile">
        <div class="stack">
          <section class="panel">
            <div class="panel-head"><h2>Thông tin sách</h2></div>
            <div class="panel-body"><dl class="meta">
              <div><dt>Mã sách</dt><dd class="num">${b.book_id}</dd></div>
              <div><dt>ISBN</dt><dd class="num">${b.isbn_code || '—'}</dd></div>
              <div><dt>Thể loại</dt><dd><a href="#/books?category_id=${b.category_id}">${b.category_name}</a></dd></div>
              <div><dt>Nhà xuất bản</dt><dd><a href="#/books?publisher_id=${b.publisher_id}">${b.publisher_name}</a></dd></div>
              <div><dt>Năm xuất bản</dt><dd>${b.publication_year || '—'}</dd></div>
              <div><dt>Lần xuất bản</dt><dd>${b.book_edition || '—'}</dd></div>
              <div><dt>Ngôn ngữ</dt><dd>${b.book_language || '—'}</dd></div>
              <div><dt>Loại ấn phẩm</dt><dd>${b.publication_type || '—'}</dd></div>
              <div><dt>Vị trí</dt><dd>${b.shelf_no ? `Tầng ${b.floor_no}, kệ ${b.shelf_no}${b.shelf_name ? ` (${b.shelf_name})` : ''}` : 'Chưa xếp kệ'}</dd></div>
            </dl></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Đang được mượn</h2><span class="sub">${open.length} bản</span></div>
            ${open.length ? html`<div class="table-wrap"><table class="data">
              <thead><tr><th>Phiếu</th><th>Độc giả</th><th>Ngày mượn</th><th>Hạn trả</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>${open.map((l) => html`<tr>
                <td class="num muted">${l.issue_id}</td>
                <td><a class="title" href="#/members/${l.member_id}">${l.member_name}</a></td>
                <td class="num">${fmtDate(l.issue_date)}</td>
                <td class="num">${fmtDate(l.due_date)}</td>
                <td>${loanChip(l)}</td>
                <td class="actions-cell"><button class="btn btn-sm" data-return="${l.issue_id}">Nhận trả</button></td>
              </tr>`)}</tbody></table></div>`
              : empty('Không có bản nào đang được mượn', '', 'check')}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Lịch sử mượn</h2><span class="sub">${history.length} lượt đã đóng</span></div>
            ${history.length ? html`<div class="table-wrap"><table class="data">
              <thead><tr><th>Phiếu</th><th>Độc giả</th><th>Mượn</th><th>Trả</th><th>Kết quả</th><th class="right">Phạt</th></tr></thead>
              <tbody>${history.map((l) => html`<tr>
                <td class="num muted">${l.issue_id}</td>
                <td><a href="#/members/${l.member_id}">${l.member_name}</a></td>
                <td class="num">${fmtDate(l.issue_date)}</td>
                <td class="num">${fmtDate(l.return_date)}</td>
                <td>${loanChip(l)}</td>
                <td class="right">${l.fine_total ? html`<span class="money late">${money(l.fine_total)}</span>` : html`<span class="muted">—</span>`}</td>
              </tr>`)}</tbody></table></div>`
              : empty('Chưa từng được mượn')}
          </section>
        </div>

        <div class="stack">
          <section class="panel balance-box">
            <div class="muted small">Còn trên kệ</div>
            <div class="big num" style="color:${b.copies_available ? 'var(--ok)' : 'var(--late)'}">${b.copies_available}<span class="muted" style="font-size:18px;font-weight:600"> / ${b.copies_total} bản</span></div>
            <dl class="meta" style="margin-top:14px;grid-template-columns:1fr 1fr">
              <div><dt>Lượt mượn</dt><dd class="num">${b.stats.times_borrowed}</dd></div>
              <div><dt>Số độc giả</dt><dd class="num">${b.stats.readers}</dd></div>
              <div><dt>Bản sớm về nhất</dt><dd class="num">${b.stats.next_due ? fmtDate(b.stats.next_due) : '—'}</dd></div>
            </dl>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Hàng chờ đặt sách</h2><span class="sub">${b.requests.length} yêu cầu</span></div>
            ${b.requests.length ? html`<ol class="list">${b.requests.map((r, i) => html`<li>
              <span class="rank">${i + 1}</span>
              <div class="grow"><a class="line1" href="#/members/${r.member_id}">${r.member_name}</a>
                <div class="line2">Yêu cầu ${fmtDate(r.request_date)}</div></div>
              ${requestChip(r.status)}</li>`)}</ol>`
              : empty('Chưa ai đặt trước sách này')}
          </section>
        </div>
      </div>`);
  }

  const asPickerBook = () => ({
    book_id: b.book_id, book_title: b.book_title, authors: b.authors.map((a) => a.full_name).join(', '),
    copies_available: b.copies_available, copies_total: b.copies_total,
  });
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-issue]')) return issueDialog({ book: asPickerBook() });
    if (e.target.closest('[data-reserve]')) return requestDialog({ book: asPickerBook() });
    if (e.target.closest('[data-edit]')) return bookFormDialog(b);
    const ret = e.target.closest('[data-return]');
    if (ret) return returnDialog(b.loans.find((l) => l.issue_id === +ret.dataset.return));
    if (e.target.closest('[data-delete]')) {
      const ok = await confirmDialog({
        title: 'Xóa đầu sách?',
        message: `“${b.book_title}” sẽ bị xóa khỏi danh mục. Sách đã từng có phiếu mượn sẽ không xóa được để giữ lịch sử.`,
        confirmText: 'Xóa sách', danger: true,
      });
      if (!ok) return;
      try {
        await api.del(`/api/books/${b.book_id}`);
        toast('Đã xóa đầu sách.');
        location.hash = '#/books';
        refreshAll();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  await load();
  return load;
}
