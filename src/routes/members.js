const express = require('express');
const { pool } = require('../db');
const { HttpError } = require('../middleware/errors');
const { like, toId, optionalText, requiredText, optionalDate } = require('../util');
const { LOAN_SELECT, MEMBER_SELECT, REQUEST_SELECT } = require('../queries');

const router = express.Router();

// ---------- Danh sách độc giả ----------
// Bộ lọc: q (tên, SĐT, email, mã), status (active/suspended/expired),
// type (standard/premium), debt=1 (còn nợ phạt), overdue=1 (có sách quá hạn)
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push(`(CONCAT(m.last_name, ' ', m.first_name) LIKE ? OR m.mobile_no LIKE ? OR m.email_id LIKE ? OR m.member_id = ?)`);
    params.push(like(q), like(q), like(q), /^\d+$/.test(q) ? Number(q) : -1);
  }
  if (req.query.status) { where.push('ms.account_status = ?'); params.push(String(req.query.status)); }
  if (req.query.type) { where.push('ms.account_type = ?'); params.push(String(req.query.type)); }
  if (req.query.debt === '1') where.push('fb.balance > 0');

  let sql = `${MEMBER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  if (req.query.overdue === '1') sql = `SELECT * FROM (${sql}) t WHERE t.overdue_loans > 0`;
  const [rows] = await pool.query(`${sql} ORDER BY first_name, last_name`, params);
  res.json(rows);
});

// ---------- Hồ sơ một độc giả ----------
router.get('/:id', async (req, res) => {
  const id = toId(req.params.id, 'Mã độc giả');
  const [rows] = await pool.query(`${MEMBER_SELECT} WHERE m.member_id = ?`, [id]);
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy độc giả.');

  const [[loans], [requests], [payments]] = await Promise.all([
    pool.query(`${LOAN_SELECT} WHERE bi.member_id = ? ORDER BY bi.issue_date DESC, bi.issue_id DESC`, [id]),
    pool.query(`${REQUEST_SELECT} WHERE br.member_id = ? ORDER BY br.request_date DESC`, [id]),
    pool.query('SELECT * FROM fine_payment WHERE member_id = ? ORDER BY payment_date, fine_payment_id', [id]),
  ]);

  // Sổ công nợ: gộp khoản phạt (+) và lần nộp (−) theo ngày, kèm số dư lũy kế
  const entries = [
    ...loans.filter((l) => l.fine_id).map((l) => ({
      date: l.fine_date, kind: 'fine', amount: l.fine_total, issue_id: l.issue_id,
      note: l.state === 'lost' ? `Bồi thường mất sách: ${l.book_title}` : `Trả muộn ${l.days_late} ngày: ${l.book_title}`,
    })),
    ...payments.map((p) => ({
      date: p.payment_date, kind: 'payment', amount: p.payment_amount, payment_id: p.fine_payment_id, note: 'Nộp tiền phạt',
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'fine' ? -1 : 1));
  let running = 0;
  for (const e of entries) {
    running += e.kind === 'fine' ? e.amount : -e.amount;
    e.balance = running;
  }

  res.json({ ...rows[0], loans, requests, ledger: entries });
});

// ---------- Thêm / sửa độc giả ----------
async function readMemberBody(body) {
  const accountType = String(body.account_type || 'standard');
  const accountStatus = String(body.account_status || 'active');
  const [st] = await pool.query(
    'SELECT active_status_id FROM member_status WHERE account_type = ? AND account_status = ?',
    [accountType, accountStatus]
  );
  if (!st.length) throw new HttpError(400, 'Loại hoặc trạng thái tài khoản không hợp lệ.');

  const email = optionalText(body.email_id, 100);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ.');
  const phone = optionalText(body.mobile_no, 20);
  if (phone && !/^[0-9+\s.-]{8,20}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ.');

  const start = optionalDate(body.membership_start_date, 'Ngày bắt đầu thẻ');
  if (!start) throw new HttpError(400, 'Vui lòng nhập ngày bắt đầu thẻ.');
  const end = optionalDate(body.membership_end_date, 'Ngày hết hạn thẻ');
  if (end && end < start) throw new HttpError(400, 'Ngày hết hạn thẻ không được trước ngày bắt đầu.');

  return {
    last_name: requiredText(body.last_name, 'họ và tên đệm', 50),
    first_name: requiredText(body.first_name, 'tên', 50),
    city: optionalText(body.city, 100),
    mobile_no: phone,
    email_id: email,
    date_of_birth: optionalDate(body.date_of_birth, 'Ngày sinh'),
    active_status_id: st[0].active_status_id,
    membership_start_date: start,
    membership_end_date: end,
  };
}

router.post('/', async (req, res) => {
  const d = await readMemberBody(req.body);
  const [r] = await pool.query('INSERT INTO members SET ?', [d]);
  res.status(201).json({ member_id: r.insertId });
});

router.put('/:id', async (req, res) => {
  const id = toId(req.params.id, 'Mã độc giả');
  const d = await readMemberBody(req.body);
  const [r] = await pool.query('UPDATE members SET ? WHERE member_id = ?', [d, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy độc giả.');
  res.json({ ok: true });
});

module.exports = router;
