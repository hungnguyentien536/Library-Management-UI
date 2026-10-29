import { api } from '../api.js';
import { html, setHTML, icon, $, formData } from '../ui.js';

// Màn hình đăng nhập cho nhân viên thư viện (bảng staff_account)
export function renderLogin(root, onSuccess) {
  // Chiều cao các gáy sách trang trí: cố định để trang luôn giống nhau
  const spines = [120, 150, 96, 168, 132, 110, 158, 140, 88, 124, 162, 104];
  setHTML(root, html`
  <div class="login">
    <section class="login-art" aria-hidden="true">
      <div class="brand">
        <div class="brand-mark">${icon('books')}</div>
        <div><div class="brand-name">Thư viện</div><div class="brand-sub">Quản lý library_db</div></div>
      </div>
      <p class="login-quote">Mỗi cuốn sách rời kệ đều có một ngày phải trở về.</p>
      <div class="shelf">${spines.map((h) => html`<span style="height:${h}px"></span>`)}</div>
      <div class="login-facts">
        <div><b>14 ngày</b>hạn mượn mặc định</div>
        <div><b>5 cuốn</b>tối đa mỗi độc giả</div>
        <div><b>2.000 đ</b>mỗi ngày trả muộn</div>
      </div>
    </section>
    <section class="login-form-wrap">
      <div class="login-card">
        <h1>Đăng nhập</h1>
        <p class="muted">Dành cho thủ thư. Dùng tài khoản được cấp để vào ca làm.</p>
        <form id="login-form" novalidate>
          <div class="field">
            <label for="username">Tên đăng nhập</label>
            <input class="input" id="username" name="username" autocomplete="username" required autofocus>
          </div>
          <div class="field">
            <label for="password">Mật khẩu</label>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <div class="form-error" id="login-error" hidden></div>
          <button class="btn btn-primary" type="submit">Đăng nhập</button>
        </form>
        <div class="demo-accounts">
          Tài khoản mẫu (từ 04_app_auth.sql):
          <button type="button" data-u="huong" data-p="admin123">huong / admin123</button> là Thủ thư trưởng,
          <button type="button" data-u="khoa" data-p="thuthu123">khoa / thuthu123</button> là Thủ thư.
        </div>
      </div>
    </section>
  </div>`);

  const form = $('#login-form', root);
  const err = $('#login-error', root);
  root.querySelectorAll('.demo-accounts button').forEach((b) => b.addEventListener('click', () => {
    form.username.value = b.dataset.u;
    form.password.value = b.dataset.p;
    form.querySelector('button[type="submit"]').focus();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra…';
    try {
      const { user } = await api.post('/api/auth/login', formData(form));
      await onSuccess(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });
}
