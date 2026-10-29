// Dữ liệu danh mục cho các ô chọn trên giao diện + quy tắc nghiệp vụ
const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const { requireAdmin } = require('../middleware/auth');
const { requiredText } = require('../util');

const router = express.Router();

router.get('/', async (req, res) => {
  const [[categories], [publishers], [locations], [authors], [memberStatus], [requestStatus], [staff], [[t]]] =
    await Promise.all([
      pool.query('SELECT category_id, category_name FROM category ORDER BY category_name'),
      pool.query('SELECT publisher_id, publisher_name FROM publisher ORDER BY publisher_name'),
      pool.query('SELECT location_id, shelf_no, shelf_name, floor_no FROM location ORDER BY floor_no, shelf_no'),
      pool.query(`SELECT author_id, first_name, last_name, CONCAT(last_name, ' ', first_name) AS full_name
                    FROM author ORDER BY last_name, first_name`),
      pool.query('SELECT active_status_id, account_type, account_status FROM member_status ORDER BY active_status_id'),
      pool.query('SELECT available_status_id, available_status FROM book_request_status ORDER BY available_status_id'),
      pool.query('SELECT staff_id, staff_name, staff_designation FROM library_staff ORDER BY staff_id'),
      pool.query('SELECT CURDATE() AS today'),
    ]);
  res.json({
    categories, publishers, locations, authors, memberStatus, requestStatus, staff,
    rules: config.rules,
    today: t.today,
  });
});

// Thêm nhanh tác giả mới khi nhập sách
router.post('/authors', requireAdmin, async (req, res) => {
  const last = requiredText(req.body.last_name, 'họ tác giả', 50);
  const first = requiredText(req.body.first_name, 'tên tác giả', 50);
  const [r] = await pool.query('INSERT INTO author (first_name, last_name) VALUES (?, ?)', [first, last]);
  res.status(201).json({ author_id: r.insertId, first_name: first, last_name: last, full_name: `${last} ${first}` });
});

module.exports = router;
