// npm run db:setup
// Tạo lại toàn bộ library_db từ 4 file trong thư mục database/:
//   01_db_creation.sql -> 02_routines.sql -> 03_data.sql -> 04_app_auth.sql
// CẢNH BÁO: xóa sạch dữ liệu hiện có trong library_db.
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const { runSqlFile } = require('./sql-runner');

const FILES = [
  '01_db_creation.sql',
  '02_routines.sql',
  '03_data.sql',
  '04_app_auth.sql',
];

(async () => {
  let conn;
  try {
    // Không chỉ định database: file 01 tự CREATE DATABASE
    conn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      charset: 'utf8mb4',
      multipleStatements: true,
    });
    console.log(`Đã kết nối MySQL tại ${config.db.host}:${config.db.port}`);

    // staff_account trỏ khóa ngoại tới library_staff, nên phải xóa nó trước,
    // nếu không câu DROP TABLE trong file 01 sẽ bị chặn khi chạy lại.
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\``);
    await conn.query(`DROP TABLE IF EXISTS \`${config.db.database}\`.staff_account`);

    for (const file of FILES) {
      process.stdout.write(`  chạy ${file} ... `);
      await runSqlFile(conn, path.join(__dirname, '..', 'database', file));
      console.log('xong');
    }

    const [[row]] = await conn.query(
      'SELECT (SELECT COUNT(*) FROM library_db.book) AS books, (SELECT COUNT(*) FROM library_db.members) AS members'
    );
    console.log(`Hoàn tất: ${row.books} đầu sách, ${row.members} độc giả.`);
    console.log('Đăng nhập thử: huong / admin123');
  } catch (err) {
    console.error('\nLỗi khi cài database:', err.sqlMessage || err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('-> MySQL chưa chạy hoặc sai DB_HOST/DB_PORT trong .env');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('-> Sai DB_USER/DB_PASSWORD trong .env');
    }
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
