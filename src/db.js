// Một connection pool dùng chung cho toàn bộ ứng dụng.
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',        // lưu đúng tiếng Việt có dấu
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,         // DATE trả về dạng 'YYYY-MM-DD', tránh lệch múi giờ
  decimalNumbers: true,      // SUM(...) trả về number thay vì chuỗi
});

/**
 * Chạy một hàm trong transaction trên một connection riêng.
 * Nếu hàm ném lỗi thì ROLLBACK, ngược lại COMMIT.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* bỏ qua */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
