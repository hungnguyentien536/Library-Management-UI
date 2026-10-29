const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { HttpError } = require('../middleware/errors');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('khong-phai-mat-khau-that', 10);

// Chống dò mật khẩu đơn giản: tối đa 10 lần sai / 15 phút cho mỗi IP
const failed = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function tooManyAttempts(ip) {
  const rec = failed.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) return false;
  return rec.count >= 10;
}
function recordFailure(ip) {
  const rec = failed.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) failed.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new HttpError(400, 'Nhập tên đăng nhập và mật khẩu.');
  if (tooManyAttempts(req.ip)) throw new HttpError(429, 'Sai quá nhiều lần. Thử lại sau 15 phút.');

  const [rows] = await pool.query(
    `SELECT sa.staff_id, sa.username, sa.password_hash, sa.role,
            ls.staff_name, ls.staff_designation
       FROM staff_account sa
       JOIN library_staff ls ON ls.staff_id = sa.staff_id
      WHERE sa.username = ?`,
    [username]
  );
  const account = rows[0];
  // So sánh băm kể cả khi không có tài khoản để thời gian phản hồi như nhau
  const ok = await bcrypt.compare(password, account?.password_hash || DUMMY_HASH);
  if (!account || !ok) {
    recordFailure(req.ip);
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  failed.delete(req.ip);

  await pool.query('UPDATE staff_account SET last_login = NOW() WHERE staff_id = ?', [account.staff_id]);

  // Tạo phiên mới để tránh tấn công cố định phiên (session fixation)
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.user = {
    staff_id: account.staff_id,
    username: account.username,
    staff_name: account.staff_name,
    designation: account.staff_designation,
    role: account.role,
  };
  res.json({ user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('lib.sid');
    res.json({ ok: true });
  });
});

// Trả user = null khi chưa đăng nhập (không coi là lỗi)
router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
