// Mượn sách, trả sách, báo mất — gọi thẳng stored procedure của database.
const express = require('express');
const { pool, withTransaction } = require('../db');
const config = require('../config');
const { HttpError } = require('../middleware/errors');
const { like, toId } = require('../util');
const { LOAN_SELECT } = require('../queries');

const router = express.Router();

// ---------- Danh sách phiếu mượn ----------
// state: issued | overdue | returned | lost | open (= issued + overdue) | all
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const state = String(req.query.state || 'open');
  if (state === 'open') where.push("t.state IN ('issued', 'overdue')");
  else if (['issued', 'overdue', 'returned', 'lost'].includes(state)) { where.push('t.state = ?'); params.push(state); }

  const q = String(req.query.q || '').trim();
  if (q) {
    where.push('(t.book_title LIKE ? OR t.member_name LIKE ? OR t.issue_id = ? OR t.member_id = ?)');
    const n = /^\d+$/.test(q) ? Number(q) : -1;
    params.push(like(q), like(q), n, n);
  }
  const order = state === 'returned' ? 't.return_date DESC' : 't.due_date ASC, t.issue_id';
  const [rows] = await pool.query(
    `SELECT t.*, CASE WHEN t.state = 'overdue' THEN t.days_late * ? ELSE 0 END AS fine_preview
       FROM (${LOAN_SELECT}) t
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${order} LIMIT 300`,
    [config.rules.finePerDay, ...params]
  );
  res.json(rows);
});

// ---------- Kiểm tra trước khi cho mượn ----------
// Không thay đổi dữ liệu; chỉ để giao diện hiện cảnh báo sớm.
// Quyết định cuối cùng vẫn do trigger trg_issue_before_insert.
router.get('/check', async (req, res) => {
  const memberId = req.query.member_id ? toId(req.query.member_id, 'Mã độc giả') : null;
  const bookId = req.query.book_id ? toId(req.query.book_id, 'Mã sách') : null;
  const problems = [];
  const warnings = [];
  let member = null;
  let book = null;

  if (memberId) {
    const [rows] = await pool.query(
      `SELECT m.member_id, CONCAT(m.last_name, ' ', m.first_name) AS full_name, ms.account_type, ms.account_status,
              m.membership_end_date,
              (m.membership_end_date IS NOT NULL AND m.membership_end_date < CURDATE()) AS card_expired,
              (SELECT COUNT(*) FROM book_issue bi WHERE bi.member_id = m.member_id
                  AND bi.return_date IS NULL AND bi.issue_status <> 'lost') AS active_loans,
              (SELECT COUNT(*) FROM book_issue bi WHERE bi.member_id = m.member_id
                  AND bi.return_date IS NULL AND bi.issue_status <> 'lost' AND bi.due_date < CURDATE()) AS overdue_loans,
              fb.balance
         FROM members m
         JOIN member_status ms ON ms.active_status_id = m.active_status_id
         JOIN v_member_fine_balance fb ON fb.member_id = m.member_id
        WHERE m.member_id = ?`, [memberId]);
    member = rows[0] || null;
    if (!member) problems.push('Không tìm thấy độc giả.');
    else {
      if (member.account_status !== 'active') problems.push(`Tài khoản đang ở trạng thái "${member.account_status}".`);
      if (member.card_expired) problems.push('Thẻ thư viện đã hết hạn.');
      if (member.active_loans >= config.rules.maxLoans) problems.push(`Đã mượn đủ ${config.rules.maxLoans} cuốn chưa trả.`);
      if (member.overdue_loans > 0) warnings.push(`Đang giữ ${member.overdue_loans} cuốn quá hạn.`);
      if (member.balance > 0) warnings.push(`Còn nợ phạt ${member.balance.toLocaleString('vi-VN')} đ.`);
    }
  }
  if (bookId) {
    const [rows] = await pool.query(
      'SELECT book_id, book_title, copies_total, copies_available FROM book WHERE book_id = ?', [bookId]);
    book = rows[0] || null;
    if (!book) problems.push('Không tìm thấy sách.');
    else if (book.copies_available <= 0) problems.push('Sách đã hết bản để cho mượn.');
  }
  if (member && book) {
    const [dup] = await pool.query(
      `SELECT COUNT(*) AS n FROM book_issue WHERE member_id = ? AND book_id = ?
          AND return_date IS NULL AND issue_status <> 'lost'`, [memberId, bookId]);
    if (dup[0].n) warnings.push('Độc giả đang mượn một bản khác của đầu sách này.');
  }
  res.json({ ok: problems.length === 0, problems, warnings, member, book });
});

// ---------- Lập phiếu mượn: CALL sp_issue_book ----------
router.post('/', async (req, res) => {
  const bookId = toId(req.body.book_id, 'Mã sách');
  const memberId = toId(req.body.member_id, 'Mã độc giả');
  const days = req.body.days ? Number(req.body.days) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 60)) {
    throw new HttpError(400, 'Số ngày mượn phải từ 1 đến 60.');
  }

  // Trigger chỉ kiểm tra account_status; thời hạn thẻ là quy tắc ứng dụng kiểm thêm
  const [m] = await pool.query(
    'SELECT membership_end_date < CURDATE() AS expired FROM members WHERE member_id = ?', [memberId]);
  if (!m.length) throw new HttpError(404, 'Không tìm thấy độc giả.');
  if (m[0].expired) throw new HttpError(409, 'Thẻ thư viện của độc giả đã hết hạn. Gia hạn thẻ trước khi mượn.');

  // Kết quả CALL trong mysql2: [ [ {issue_id} ], ResultSetHeader ]
  const [result] = await pool.query('CALL sp_issue_book(?, ?, ?, ?)',
    [bookId, memberId, req.session.user.staff_id, days]);
  const issueId = result[0][0].issue_id;
  const [rows] = await pool.query(`${LOAN_SELECT} WHERE bi.issue_id = ?`, [issueId]);
  res.status(201).json(rows[0]);
});

// ---------- Trả sách: CALL sp_return_book ----------
router.post('/:id/return', async (req, res) => {
  const id = toId(req.params.id, 'Mã phiếu');
  const [cur] = await pool.query('SELECT book_id, issue_status FROM book_issue WHERE issue_id = ?', [id]);
  if (!cur.length) throw new HttpError(404, 'Không tìm thấy phiếu mượn.');
  if (cur[0].issue_status === 'lost') throw new HttpError(409, 'Phiếu này đã được báo mất sách, không thể nhận trả.');

  // Procedure tự: ghi ngày trả (trigger đổi trạng thái + cộng kho) và tạo khoản phạt nếu trễ
  const [result] = await pool.query('CALL sp_return_book(?)', [id]);
  const { days_late: daysLate, fine_amount: fineAmount } = result[0][0];

  // Có người đang chờ cuốn này? Chuyển yêu cầu chờ lâu nhất sang 'available'
  let notified = null;
  const [waiting] = await pool.query(
    `SELECT br.request_id, CONCAT(m.last_name, ' ', m.first_name) AS member_name, m.mobile_no
       FROM book_request br
       JOIN book_request_status s ON s.available_status_id = br.available_status_id
       JOIN members m ON m.member_id = br.member_id
      WHERE br.book_id = ? AND s.available_status = 'pending'
      ORDER BY br.request_date, br.request_id LIMIT 1`, [cur[0].book_id]);
  if (waiting.length) {
    await pool.query(
      `UPDATE book_request
          SET available_status_id = (SELECT available_status_id FROM book_request_status WHERE available_status = 'available'),
              nearest_available_date = CURDATE()
        WHERE request_id = ?`, [waiting[0].request_id]);
    notified = waiting[0];
  }

  const [rows] = await pool.query(`${LOAN_SELECT} WHERE bi.issue_id = ?`, [id]);
  res.json({ loan: rows[0], days_late: daysLate, fine_amount: fineAmount, notified });
});

// ---------- Báo mất sách: đổi trạng thái + lập khoản bồi thường ----------
router.post('/:id/lost', async (req, res) => {
  const id = toId(req.params.id, 'Mã phiếu');
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'Số tiền bồi thường phải là số nguyên dương.');

  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT issue_status, return_date FROM book_issue WHERE issue_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new HttpError(404, 'Không tìm thấy phiếu mượn.');
    if (rows[0].return_date || rows[0].issue_status === 'lost') {
      throw new HttpError(409, 'Chỉ báo mất được với phiếu đang mượn.');
    }
    // Bản sách mất không được cộng lại vào copies_available (vì return_date vẫn NULL)
    await conn.query("UPDATE book_issue SET issue_status = 'lost' WHERE issue_id = ?", [id]);
    await conn.query('INSERT INTO fine_due (issue_id, fine_date, fine_total) VALUES (?, CURDATE(), ?)', [id, amount]);
  });
  const [rows] = await pool.query(`${LOAN_SELECT} WHERE bi.issue_id = ?`, [id]);
  res.json(rows[0]);
});

module.exports = router;
