// Điểm khởi động ứng dụng: npm start  ->  http://localhost:3000
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { errorHandler, notFoundApi } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Phiên đăng nhập lưu trong bộ nhớ máy chủ (đủ cho localhost/bài tập lớn).
app.use(session({
  name: 'lib.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }, // 8 giờ = 1 ca làm
}));

// Một vài header bảo mật cơ bản
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth);                       // mọi API bên dưới cần đăng nhập
app.use('/api/lookups', require('./routes/lookups'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/search', require('./routes/search'));
app.use('/api/books', require('./routes/books'));
app.use('/api/members', require('./routes/members'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/fines', require('./routes/fines'));
app.use('/api', notFoundApi);

// ---------- Giao diện (file tĩnh trong public/) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use(errorHandler);

app.listen(config.port, async () => {
  console.log(`Thư viện đang chạy tại http://localhost:${config.port}`);
  try {
    await pool.query('SELECT 1 FROM staff_account LIMIT 1');
    console.log(`Đã kết nối MySQL (${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database})`);
  } catch (err) {
    console.warn('⚠ Chưa dùng được database:', err.sqlMessage || err.message);
    console.warn('  Kiểm tra .env rồi chạy "npm run db:setup" (lần đầu) hoặc "npm run db:check".');
  }
});
