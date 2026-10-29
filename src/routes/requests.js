// Yêu cầu đặt sách (book_request)
const express = require('express');
const { pool, withTransaction } = require('../db');
const { HttpError } = require('../middleware/errors');
const { like, toId } = require('../util');
const { REQUEST_SELECT } = require('../queries');

const router = express.Router();
const STATUSES = ['pending', 'available', 'fulfilled', 'cancelled'];
const statusId = (name) =>
  `(SELECT available_status_id FROM book_request_status WHERE available_status = ${pool.escape(name)})`;

// status: open (= pending + available) | pending | available | fulfilled | cancelled | all
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const status = String(req.query.status || 'open');
  if (status === 'open') where.push("rs.available_status IN ('pending', 'available')");
  else if (STATUSES.includes(status)) { where.push('rs.available_status = ?'); params.push(status); }
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push(`(b.book_title LIKE ? OR CONCAT(m.last_name, ' ', m.first_name) LIKE ?)`);
    params.push(like(q), like(q));
  }
  const [rows] = await pool.query(
    `${REQUEST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY FIELD(rs.available_status, 'available', 'pending', 'fulfilled', 'cancelled'),
              br.request_date, br.request_id`, params);
  res.json(rows);
});

// Tạo yêu cầu. Nếu sách còn bản -> 'available' ngay;
// nếu hết -> 'pending', ngày dự kiến = hạn trả sớm nhất của các phiếu đang mượn.
router.post('/', async (req, res) => {
  const bookId = toId(req.body.book_id, 'Mã sách');
  const memberId = toId(req.body.member_id, 'Mã độc giả');

  const [[member]] = await pool.query(
    `SELECT ms.account_status, (m.membership_end_date < CURDATE()) AS expired
       FROM members m JOIN member_status ms ON ms.active_status_id = m.active_status_id
      WHERE m.member_id = ?`, [memberId]);
  if (!member) throw new HttpError(404, 'Không tìm thấy độc giả.');
  if (member.account_status !== 'active' || member.expired) {
    throw new HttpError(409, 'Chỉ độc giả có tài khoản active và thẻ còn hạn mới được đặt sách.');
  }

  const [[book]] = await pool.query('SELECT copies_available FROM book WHERE book_id = ?', [bookId]);
  if (!book) throw new HttpError(404, 'Không tìm thấy sách.');

  const [[dup]] = await pool.query(
    `SELECT COUNT(*) AS n FROM book_request br
       JOIN book_request_status s ON s.available_status_id = br.available_status_id
      WHERE br.book_id = ? AND br.member_id = ? AND s.available_status IN ('pending', 'available')`,
    [bookId, memberId]);
  if (dup.n) throw new HttpError(409, 'Độc giả đã có yêu cầu đang mở cho đầu sách này.');

  let status = 'available';
  let nearest = null;
  if (book.copies_available <= 0) {
    status = 'pending';
    const [[d]] = await pool.query(
      `SELECT MIN(due_date) AS d FROM book_issue
        WHERE book_id = ? AND return_date IS NULL AND issue_status <> 'lost' AND due_date >= CURDATE()`, [bookId]);
    nearest = d.d; // NULL nếu mọi bản đang quá hạn: chưa biết ngày có lại
  }

  const [r] = await pool.query(
    `INSERT INTO book_request (book_id, member_id, request_date, available_status_id, nearest_available_date)
     VALUES (?, ?, CURDATE(), ${statusId(status)}, ${status === 'available' ? 'CURDATE()' : '?'})`,
    status === 'available' ? [bookId, memberId] : [bookId, memberId, nearest]);
  const [rows] = await pool.query(`${REQUEST_SELECT} WHERE br.request_id = ?`, [r.insertId]);
  res.status(201).json(rows[0]);
});

// Đổi trạng thái: 'available' (báo có sách) hoặc 'cancelled' (hủy)
router.patch('/:id', async (req, res) => {
  const id = toId(req.params.id, 'Mã yêu cầu');
  const status = String(req.body.status);
  if (!['available', 'cancelled', 'pending'].includes(status)) throw new HttpError(400, 'Trạng thái không hợp lệ.');
  const [r] = await pool.query(
    `UPDATE book_request SET available_status_id = ${statusId(status)}
            ${status === 'available' ? ', nearest_available_date = CURDATE()' : ''}
      WHERE request_id = ?
        AND available_status_id IN (${statusId('pending')}, ${statusId('available')})`, [id]);
  if (!r.affectedRows) throw new HttpError(409, 'Yêu cầu không tồn tại hoặc đã đóng.');
  res.json({ ok: true });
});

// Giao sách theo yêu cầu: lập phiếu mượn (sp_issue_book) + đóng yêu cầu, trong cùng một transaction
router.post('/:id/fulfill', async (req, res) => {
  const id = toId(req.params.id, 'Mã yêu cầu');
  const issueId = await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT br.book_id, br.member_id, s.available_status
         FROM book_request br JOIN book_request_status s ON s.available_status_id = br.available_status_id
        WHERE br.request_id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw new HttpError(404, 'Không tìm thấy yêu cầu.');
    if (!['pending', 'available'].includes(rows[0].available_status)) {
      throw new HttpError(409, 'Yêu cầu này đã đóng.');
    }
    // Trigger vẫn kiểm tra tài khoản, giới hạn 5 cuốn và số bản còn lại;
    // nếu không đạt thì cả transaction bị ROLLBACK, yêu cầu giữ nguyên.
    const [result] = await conn.query('CALL sp_issue_book(?, ?, ?, NULL)',
      [rows[0].book_id, rows[0].member_id, req.session.user.staff_id]);
    await conn.query(`UPDATE book_request SET available_status_id = ${statusId('fulfilled')} WHERE request_id = ?`, [id]);
    return result[0][0].issue_id;
  });
  res.json({ ok: true, issue_id: issueId });
});

module.exports = router;
