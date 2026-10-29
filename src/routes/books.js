const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { like, toId, optionalText, requiredText } = require('../util');
const { LOAN_SELECT, REQUEST_SELECT } = require('../queries');

const router = express.Router();

// ---------- Danh sách sách (dùng view v_book_catalog) ----------
// Bộ lọc: q (tên/ISBN/tác giả), category_id, publisher_id, location_id, available=1
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push('(v.book_title LIKE ? OR v.isbn_code LIKE ? OR v.authors LIKE ?)');
    params.push(like(q), like(q), like(q));
  }
  for (const key of ['category_id', 'publisher_id', 'location_id']) {
    if (req.query[key]) {
      where.push(`b.${key} = ?`);
      params.push(toId(req.query[key]));
    }
  }
  if (req.query.available === '1') where.push('v.copies_available > 0');

  const sortMap = {
    title: 'v.book_title',
    year: 'v.publication_year DESC, v.book_title',
    popular: 'times_borrowed DESC, v.book_title',
  };
  const orderBy = sortMap[req.query.sort] || sortMap.title;

  const [rows] = await pool.query(
    `SELECT v.book_id, v.isbn_code, v.book_title, v.category_name, v.publisher_name,
            v.authors, v.publication_year, v.book_language, v.copies_total, v.copies_available,
            b.category_id, b.publisher_id, b.location_id, l.shelf_no, l.floor_no,
            (SELECT COUNT(*) FROM book_issue bi WHERE bi.book_id = v.book_id) AS times_borrowed,
            (SELECT COUNT(*) FROM book_request br
               JOIN book_request_status s ON s.available_status_id = br.available_status_id
              WHERE br.book_id = v.book_id AND s.available_status = 'pending') AS waiting
       FROM v_book_catalog v
       JOIN book b          ON b.book_id = v.book_id
       LEFT JOIN location l ON l.location_id = b.location_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${orderBy}`,
    params
  );
  res.json(rows);
});

// ---------- Chi tiết một đầu sách ----------
router.get('/:id', async (req, res) => {
  const id = toId(req.params.id, 'Mã sách');
  const [rows] = await pool.query(
    `SELECT b.*, c.category_name, p.publisher_name, l.shelf_no, l.shelf_name, l.floor_no
       FROM book b
       JOIN category c      ON c.category_id = b.category_id
       JOIN publisher p     ON p.publisher_id = b.publisher_id
       LEFT JOIN location l ON l.location_id = b.location_id
      WHERE b.book_id = ?`,
    [id]
  );
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy đầu sách.');

  const [[authors], [loans], [requests], [[stats]]] = await Promise.all([
    pool.query(
      `SELECT a.author_id, a.first_name, a.last_name, CONCAT(a.last_name, ' ', a.first_name) AS full_name
         FROM book_author ba JOIN author a ON a.author_id = ba.author_id
        WHERE ba.book_id = ? ORDER BY a.author_id`, [id]),
    pool.query(`${LOAN_SELECT} WHERE bi.book_id = ? ORDER BY bi.issue_date DESC, bi.issue_id DESC LIMIT 30`, [id]),
    pool.query(`${REQUEST_SELECT} WHERE br.book_id = ? AND rs.available_status IN ('pending', 'available')
                ORDER BY br.request_date, br.request_id`, [id]),
    pool.query(
      `SELECT COUNT(*) AS times_borrowed,
              COUNT(DISTINCT member_id) AS readers,
              MIN(CASE WHEN return_date IS NULL AND issue_status <> 'lost' THEN due_date END) AS next_due
         FROM book_issue WHERE book_id = ?`, [id]),
  ]);

  res.json({ ...rows[0], authors, loans, requests, stats });
});

// ---------- Thêm / sửa / xóa (chỉ Thủ thư trưởng) ----------
function readBookBody(body) {
  const year = body.publication_year ? Number(body.publication_year) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 2100)) {
    throw new HttpError(400, 'Năm xuất bản phải trong khoảng 1000–2100.');
  }
  const copies = Number(body.copies_total);
  if (!Number.isInteger(copies) || copies < 0) throw new HttpError(400, 'Tổng số bản phải là số nguyên không âm.');

  const authorIds = Array.isArray(body.author_ids) ? [...new Set(body.author_ids.map((a) => toId(a, 'Mã tác giả')))] : [];
  return {
    isbn_code: optionalText(body.isbn_code, 20),
    book_title: requiredText(body.book_title, 'tên sách'),
    category_id: toId(body.category_id, 'Thể loại'),
    publisher_id: toId(body.publisher_id, 'Nhà xuất bản'),
    publication_year: year,
    book_edition: optionalText(body.book_edition, 50),
    book_language: optionalText(body.book_language, 50),
    publication_type: optionalText(body.publication_type, 50),
    copies_total: copies,
    location_id: body.location_id ? toId(body.location_id, 'Vị trí') : null,
    authorIds,
  };
}

async function saveAuthors(conn, bookId, authorIds) {
  await conn.query('DELETE FROM book_author WHERE book_id = ?', [bookId]);
  if (authorIds.length) {
    await conn.query('INSERT INTO book_author (book_id, author_id) VALUES ?', [authorIds.map((a) => [bookId, a])]);
  }
}

router.post('/', requireAdmin, async (req, res) => {
  const d = readBookBody(req.body);
  const bookId = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO book (isbn_code, book_title, category_id, publisher_id, publication_year, book_edition,
                         book_language, publication_type, copies_total, copies_available, location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.isbn_code, d.book_title, d.category_id, d.publisher_id, d.publication_year, d.book_edition,
       d.book_language, d.publication_type, d.copies_total, d.copies_total, d.location_id]
    );
    await saveAuthors(conn, r.insertId, d.authorIds);
    return r.insertId;
  });
  res.status(201).json({ book_id: bookId });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = toId(req.params.id, 'Mã sách');
  const d = readBookBody(req.body);
  await withTransaction(async (conn) => {
    // Khóa dòng sách để trigger mượn/trả không chen vào giữa lúc tính lại số bản
    const [rows] = await conn.query(
      'SELECT copies_total, copies_available FROM book WHERE book_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new HttpError(404, 'Không tìm thấy đầu sách.');
    const onLoan = rows[0].copies_total - rows[0].copies_available;
    if (d.copies_total < onLoan) {
      throw new HttpError(409, `Đang có ${onLoan} bản chưa về kho, không thể giảm tổng số bản xuống ${d.copies_total}.`);
    }
    await conn.query(
      `UPDATE book SET isbn_code = ?, book_title = ?, category_id = ?, publisher_id = ?, publication_year = ?,
              book_edition = ?, book_language = ?, publication_type = ?, location_id = ?,
              copies_total = ?, copies_available = ?
        WHERE book_id = ?`,
      [d.isbn_code, d.book_title, d.category_id, d.publisher_id, d.publication_year, d.book_edition,
       d.book_language, d.publication_type, d.location_id, d.copies_total, d.copies_total - onLoan, id]
    );
    await saveAuthors(conn, id, d.authorIds);
  });
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = toId(req.params.id, 'Mã sách');
  // book_author tự xóa nhờ ON DELETE CASCADE; nếu sách đã có phiếu mượn,
  // khóa ngoại sẽ chặn và errorHandler trả thông báo dễ hiểu.
  const [r] = await pool.query('DELETE FROM book WHERE book_id = ?', [id]);
  if (!r.affectedRows) throw new HttpError(404, 'Không tìm thấy đầu sách.');
  res.json({ ok: true });
});

module.exports = router;
