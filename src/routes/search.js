// Tra cứu nhanh: một ô tìm kiếm trả về cả sách và độc giả
const express = require('express');
const { pool } = require('../db');
const { like } = require('../util');

const router = express.Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ books: [], members: [] });
  const p = like(q);
  const asId = /^\d+$/.test(q) ? Number(q) : -1;

  const [[books], [members]] = await Promise.all([
    // Dùng view v_book_catalog: đã gộp sẵn tác giả bằng GROUP_CONCAT
    pool.query(
      `SELECT book_id, book_title, authors, isbn_code, copies_available, copies_total
         FROM v_book_catalog
        WHERE book_title LIKE ? OR isbn_code LIKE ? OR authors LIKE ? OR book_id = ?
        ORDER BY book_title LIMIT 6`,
      [p, p, p, asId]
    ),
    pool.query(
      `SELECT m.member_id, CONCAT(m.last_name, ' ', m.first_name) AS full_name,
              m.mobile_no, m.email_id, ms.account_status
         FROM members m JOIN member_status ms ON ms.active_status_id = m.active_status_id
        WHERE CONCAT(m.last_name, ' ', m.first_name) LIKE ? OR m.mobile_no LIKE ?
              OR m.email_id LIKE ? OR m.member_id = ?
        ORDER BY m.first_name LIMIT 6`,
      [p, p, p, asId]
    ),
  ]);
  res.json({ books, members });
});

module.exports = router;
