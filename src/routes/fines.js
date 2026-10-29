// Tiền phạt (fine_due) và thanh toán (fine_payment)
const express = require('express');
const { pool, withTransaction } = require('../db');
const { HttpError } = require('../middleware/errors');
const { like, toId, optionalDate } = require('../util');

const router = express.Router();

// Công nợ từng độc giả — view v_member_fine_balance
router.get('/balances', async (req, res) => {
  const all = req.query.all === '1';
  const [rows] = await pool.query(
    `SELECT fb.*, m.mobile_no, ms.account_status
       FROM v_member_fine_balance fb
       JOIN members m ON m.member_id = fb.member_id
       JOIN member_status ms ON ms.active_status_id = m.active_status_id
      ${all ? 'WHERE fb.total_fine > 0' : 'WHERE fb.balance > 0'}
      ORDER BY fb.balance DESC, fb.member_name`);
  res.json(rows);
});

// Danh sách khoản phạt — đi qua book_issue để biết độc giả và sách (truy vấn 6 trong báo cáo)
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const [rows] = await pool.query(
    `SELECT fd.fine_id, fd.issue_id, fd.fine_date, fd.fine_total,
            bi.member_id, CONCAT(m.last_name, ' ', m.first_name) AS member_name,
            b.book_title, bi.due_date, bi.return_date, bi.issue_status,
            DATEDIFF(bi.return_date, bi.due_date) AS days_late
       FROM fine_due fd
       JOIN book_issue bi ON bi.issue_id = fd.issue_id
       JOIN members m     ON m.member_id = bi.member_id
       JOIN book b        ON b.book_id = bi.book_id
      ${q ? `WHERE CONCAT(m.last_name, ' ', m.first_name) LIKE ? OR b.book_title LIKE ?` : ''}
      ORDER BY fd.fine_date DESC, fd.fine_id DESC`,
    q ? [like(q), like(q)] : []);
  res.json(rows);
});

router.get('/payments', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.*, CONCAT(m.last_name, ' ', m.first_name) AS member_name
       FROM fine_payment p JOIN members m ON m.member_id = p.member_id
      ORDER BY p.payment_date DESC, p.fine_payment_id DESC LIMIT 50`);
  res.json(rows);
});

// Ghi nhận một lần nộp tiền. Không cho nộp quá số còn nợ.
router.post('/payments', async (req, res) => {
  const memberId = toId(req.body.member_id, 'Mã độc giả');
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'Số tiền phải là số nguyên dương (VND).');
  const date = optionalDate(req.body.payment_date, 'Ngày nộp');

  const result = await withTransaction(async (conn) => {
    // Khóa dòng độc giả để hai lần thu tiền cùng lúc không vượt quá số nợ
    const [m] = await conn.query('SELECT member_id FROM members WHERE member_id = ? FOR UPDATE', [memberId]);
    if (!m.length) throw new HttpError(404, 'Không tìm thấy độc giả.');
    const [[b]] = await conn.query('SELECT balance FROM v_member_fine_balance WHERE member_id = ?', [memberId]);
    if (b.balance <= 0) throw new HttpError(409, 'Độc giả này không còn nợ phạt.');
    if (amount > b.balance) {
      throw new HttpError(409, `Số tiền vượt quá số còn nợ (${b.balance.toLocaleString('vi-VN')} đ).`);
    }
    const [r] = await conn.query(
      `INSERT INTO fine_payment (member_id, payment_date, payment_amount) VALUES (?, ${date ? '?' : 'CURDATE()'}, ?)`,
      date ? [memberId, date, amount] : [memberId, amount]);
    return { fine_payment_id: r.insertId, balance_after: b.balance - amount };
  });
  res.status(201).json(result);
});

module.exports = router;
