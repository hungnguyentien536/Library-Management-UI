const express = require('express');
const { pool } = require('../db');
const config = require('../config');
const { LOAN_SELECT, REQUEST_SELECT } = require('../queries');

const router = express.Router();

router.get('/', async (req, res) => {
  const [[[stats]], [overdue], [topBooks], [recent], [requests], [debtors]] = await Promise.all([
    pool.query(`
      SELECT (SELECT COUNT(*) FROM book)                                    AS titles,
             (SELECT COALESCE(SUM(copies_total), 0) FROM book)              AS copies_total,
             (SELECT COALESCE(SUM(copies_available), 0) FROM book)          AS copies_available,
             (SELECT COUNT(*) FROM book_issue
               WHERE return_date IS NULL AND issue_status <> 'lost')        AS active_loans,
             (SELECT COUNT(*) FROM v_overdue_books)                         AS overdue,
             (SELECT COUNT(*) FROM members)                                 AS members,
             (SELECT COALESCE(SUM(balance), 0) FROM v_member_fine_balance
               WHERE balance > 0)                                           AS outstanding,
             (SELECT COUNT(*) FROM book_request br
                JOIN book_request_status s ON s.available_status_id = br.available_status_id
               WHERE s.available_status IN ('pending', 'available'))        AS open_requests,
             CURDATE()                                                      AS today`),
    // View v_overdue_books từ 02_routines.sql
    pool.query(`SELECT *, days_overdue * ? AS fine_so_far
                  FROM v_overdue_books ORDER BY days_overdue DESC LIMIT 8`, [config.rules.finePerDay]),
    // Truy vấn 7 trong báo cáo: xếp hạng bằng hàm cửa sổ RANK()
    pool.query(`
      SELECT * FROM (
        SELECT b.book_id, b.book_title, COUNT(*) AS loans,
               RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
          FROM book_issue bi JOIN book b ON b.book_id = bi.book_id
         GROUP BY b.book_id, b.book_title
      ) t WHERE rnk <= 5 ORDER BY rnk, book_title`),
    pool.query(`${LOAN_SELECT} ORDER BY bi.issue_id DESC LIMIT 6`),
    pool.query(`${REQUEST_SELECT} WHERE rs.available_status IN ('pending', 'available')
                ORDER BY br.request_date LIMIT 6`),
    pool.query('SELECT * FROM v_member_fine_balance WHERE balance > 0 ORDER BY balance DESC LIMIT 5'),
  ]);

  res.json({ stats, overdue, topBooks, recent, requests, debtors });
});

module.exports = router;
