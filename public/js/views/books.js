import { api } from '../api.js';
import { html, setHTML, icon, $, availability, empty, loading, debounce } from '../ui.js';
import { store, isAdmin } from '../state.js';
import { issueDialog, requestDialog, bookFormDialog } from '../dialogs.js';

export async function render(root, { query }) {
  const L = store.lookups;
  const f = {
    q: query.q || '',
    category_id: query.category_id || '',
    publisher_id: query.publisher_id || '',
    available: query.available === '1' ? '1' : '',
    sort: query.sort || 'title',
  };

  setHTML(root, html`
    <div class="page-head">
      <div><h1>Sách</h1><p class="lead" data-lead>Danh mục đầu sách, số bản còn trên kệ và vị trí lưu trữ.</p></div>
      <div class="actions">${isAdmin() ? html`<button class="btn btn-primary" data-new>${icon('plus')}Thêm sách</button>` : ''}</div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <input class="input grow" type="search" data-f="q" value="${f.q}" placeholder="Tìm theo tên sách, tác giả hoặc ISBN" aria-label="Tìm sách">
        <select class="input" data-f="category_id" aria-label="Thể loại" style="width:auto">
          <option value="">Mọi thể loại</option>
          ${L.categories.map((c) => html`<option value="${c.category_id}" ${String(c.category_id) === f.category_id ? 'selected' : ''}>${c.category_name}</option>`)}
        </select>
        <select class="input" data-f="publisher_id" aria-label="Nhà xuất bản" style="width:auto">
          <option value="">Mọi nhà xuất bản</option>
          ${L.publishers.map((p) => html`<option value="${p.publisher_id}" ${String(p.publisher_id) === f.publisher_id ? 'selected' : ''}>${p.publisher_name}</option>`)}
        </select>
        <select class="input" data-f="sort" aria-label="Sắp xếp" style="width:auto">
          <option value="title" ${f.sort === 'title' ? 'selected' : ''}>Theo tên A–Z</option>
          <option value="year" ${f.sort === 'year' ? 'selected' : ''}>Mới xuất bản trước</option>
          <option value="popular" ${f.sort === 'popular' ? 'selected' : ''}>Mượn nhiều nhất</option>
        </select>
        <label class="checkbox"><input type="checkbox" data-f="available" ${f.available ? 'checked' : ''}>Chỉ sách còn bản</label>
      </div>
      <div data-table>${loading(8)}</div>
    </section>`);

  $('[data-new]', root)?.addEventListener('click', () => bookFormDialog(null, (id) => { location.hash = `#/books/${id}`; }));

  let rows = [];
  async function load() {
    // Giữ bộ lọc trên thanh địa chỉ để có thể tải lại / chia sẻ đường dẫn
    const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'sort' && v === 'title')));
    history.replaceState(null, '', `#/books${[...qs].length ? '?' + qs : ''}`);

    rows = await api.get('/api/books', f);
    const copies = rows.reduce((s, b) => s + b.copies_total, 0);
    $('[data-lead]', root).textContent = `${rows.length} đầu sách, ${copies} bản. Bấm vào một dòng để xem chi tiết.`;
    setHTML($('[data-table]', root), rows.length ? html`
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Sách</th><th class="hide-sm">Thể loại</th><th class="hide-sm">Nhà xuất bản</th>
          <th>Năm</th><th class="hide-sm">Vị trí</th><th>Còn trên kệ</th><th class="right hide-sm">Lượt mượn</th><th></th></tr></thead>
        <tbody>${rows.map((b) => html`<tr data-href="#/books/${b.book_id}">
          <td><div class="title">${b.book_title}</div><div class="sub">${b.authors || 'Chưa có tác giả'}</div></td>
          <td class="hide-sm">${b.category_name}</td>
          <td class="hide-sm">${b.publisher_name}</td>
          <td class="num">${b.publication_year || '—'}</td>
          <td class="hide-sm" style="white-space:nowrap">${b.shelf_no ? html`Tầng ${b.floor_no}, kệ ${b.shelf_no}` : html`<span class="muted">Chưa xếp</span>`}</td>
          <td>${availability(b.copies_available, b.copies_total)}${b.waiting ? html`<div class="sub">${b.waiting} người chờ</div>` : ''}</td>
          <td class="right num hide-sm">${b.times_borrowed}</td>
          <td class="actions-cell">${b.copies_available > 0
            ? html`<button class="btn btn-sm" data-issue="${b.book_id}">Cho mượn</button>`
            : html`<button class="btn btn-sm" data-reserve="${b.book_id}">Đặt trước</button>`}</td>
        </tr>`)}</tbody></table></div>`
      : empty('Không có sách nào khớp bộ lọc', 'Thử bỏ bớt điều kiện lọc hoặc đổi từ khóa.', 'search'));
  }

  const reload = debounce(load, 200);
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.f;
    if (!k) return;
    f[k] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value;
    reload();
  });
  root.addEventListener('click', (e) => {
    const toBook = (id) => {
      const b = rows.find((x) => x.book_id === +id);
      return b && { book_id: b.book_id, book_title: b.book_title, authors: b.authors, copies_available: b.copies_available, copies_total: b.copies_total };
    };
    const issue = e.target.closest('[data-issue]');
    if (issue) return issueDialog({ book: toBook(issue.dataset.issue) });
    const reserve = e.target.closest('[data-reserve]');
    if (reserve) return requestDialog({ book: toBook(reserve.dataset.reserve) });
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
  });

  await load();
  return load;
}
