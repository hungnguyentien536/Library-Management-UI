// Đọc cấu hình từ file .env (xem .env.example)
require('dotenv').config({ quiet: true });

const config = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'library_db',
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',

  // Các quy tắc nghiệp vụ. Nguồn gốc thật nằm trong 02_routines.sql
  // (trigger + procedure); ở đây chỉ nhắc lại để giao diện hiển thị
  // và tính thử tiền phạt. Nếu sửa trong SQL thì sửa cả ở đây.
  rules: {
    loanDays: 14,       // sp_issue_book: hạn mượn mặc định
    maxLoans: 5,        // trg_issue_before_insert: tối đa 5 cuốn
    finePerDay: 2000,   // sp_return_book: 2.000 đ / ngày trễ
  },
};

module.exports = config;
