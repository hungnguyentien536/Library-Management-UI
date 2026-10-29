// npm run db:check
// Kiểm tra nhanh: kết nối được không, đủ bảng/view/procedure/trigger chưa.
const { pool } = require('../src/db');
const config = require('../src/config');

const TABLES = [
  'category', 'publisher', 'location', 'author', 'member_status',
  'book_request_status', 'library_staff', 'book', 'members', 'book_author',
  'book_issue', 'book_request', 'fine_due', 'fine_payment', 'staff_account',
];
const VIEWS = ['v_book_catalog', 'v_overdue_books', 'v_member_fine_balance'];
const ROUTINES = ['sp_issue_book', 'sp_return_book'];
const TRIGGERS = ['trg_issue_before_insert', 'trg_issue_before_update', 'trg_issue_after_update'];

(async () => {
  const db = config.db.database;
  try {
    const [[v]] = await pool.query('SELECT VERSION() AS version');
    console.log(`MySQL ${v.version} — database "${db}"`);

    const [t] = await pool.query(
      'SELECT table_name AS n, table_type AS t FROM information_schema.tables WHERE table_schema = ?', [db]);
    const [r] = await pool.query(
      'SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema = ?', [db]);
    const [g] = await pool.query(
      'SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema = ?', [db]);

    const has = (list, name) => list.some((x) => (x.n || x.N) === name);
    const report = (label, names, list) => {
      const missing = names.filter((n) => !has(list, n));
      console.log(`${missing.length ? '✗' : '✓'} ${label}: ${names.length - missing.length}/${names.length}` +
        (missing.length ? `  thiếu: ${missing.join(', ')}` : ''));
      return missing.length;
    };

    const bad =
      report('Bảng', TABLES, t) +
      report('View', VIEWS, t) +
      report('Procedure', ROUTINES, r) +
      report('Trigger', TRIGGERS, g);

    if (bad) {
      console.log('\nChạy "npm run db:setup" để tạo đầy đủ.');
      process.exitCode = 1;
    } else {
      console.log('\nDatabase sẵn sàng. Chạy "npm start".');
    }
  } catch (err) {
    console.error('Không kết nối được MySQL:', err.sqlMessage || err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
